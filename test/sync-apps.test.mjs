// syncApps: one-way sync between two separate apps on one page. Checked when made, quiet during replay, logged on the receiving side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSpec } from './support/helpers.mjs';

const { syncApps } = await import('../src/sync-apps.js');
const noop = { tag: 'p', children: 'x' };
const cartApp = () => mountSpec({ spec: noop, namespaces: { cart: { state: { count: 0, owner: 'a' }, actions: { add: { args: {}, run: (store) => store.set('count', store.get('count') + 1) } }, derive: { label: (get) => `${get('count')} items` } } } }).ui;
const badgeApp = () => mountSpec({ spec: noop, namespaces: { badge: { state: { count: 0, label: '' }, actions: { set: { args: { count: 'number', label: 'string' }, run: (store, { count, label }) => { store.set('count', count); store.set('label', label); } }, none: { args: {}, run() {} } } } } }).ui;
const options = (from, to) => ({ from, to, watch: ['cart.count', 'cart.label'], action: 'badge.set', args: { count: 'cart.count', label: 'cart.label' } });
const message = (callback) => { try { callback(); } catch (error) { return error.message; } return 'no error'; };

test('the first values are sent at once and every change after that; the receiving app logs it as its own action', async () => {
  const cart = cartApp();
  const badge = badgeApp();
  syncApps(options(cart, badge));
  assert.deepEqual(badge.state().badge, { count: 0, label: '0 items' });
  cart.dispatch('cart.add');
  await cart.settle();
  assert.deepEqual(badge.state().badge, { count: 1, label: '1 items' });
  assert.deepEqual(badge.log.map(([name]) => name), ['badge.set', 'badge.set']);
  assert.deepEqual(cart.log.map(([name]) => name), ['cart.add']); // the sender is only read
});

test('nothing is sent while either app replays, and the disposer stops the sync', async () => {
  const cart = cartApp();
  const badge = badgeApp();
  const stop = syncApps(options(cart, badge));
  cart.dispatch('cart.add');
  await cart.settle();
  const sent = badge.log.length;
  await cart.replay();
  assert.equal(badge.log.length, sent);
  stop();
  cart.dispatch('cart.add');
  await cart.settle();
  assert.equal(badge.log.length, sent);
});

test('mistakes are reported when the sync is made, with the fix', () => {
  const cart = cartApp();
  const badge = badgeApp();
  assert.match(message(() => syncApps({ ...options(cart, badge), wacth: [] })), /syncApps: unknown key "wacth"\. Did you mean "watch"\?/);
  assert.match(message(() => syncApps({ ...options(cart, badge), from: {} })), /"from" must be an app, the value that app\(\) returned/);
  assert.match(message(() => syncApps({ ...options(cart, cart) })), /"from" and "to" are the same app\. syncApps connects two separate apps\. Inside one app, use derive/);
  assert.match(message(() => syncApps({ ...options(cart, badge), watch: ['cart.cuont'], args: {} })), /watch key "cart\.cuont" is not a state key or derived value of the "from" app\. Did you mean "cart\.count"\?/);
  assert.match(message(() => syncApps({ ...options(cart, badge), action: 'badge.st' })), /action "badge\.st" does not exist in the "to" app\. Did you mean "badge\.set"\?/);
  assert.match(message(() => syncApps({ ...options(cart, badge), args: { count: 'cart.count' } })), /badge\.set declares the argument "label", but "args" does not supply it/);
  assert.match(message(() => syncApps({ ...options(cart, badge), args: { count: 'cart.count', label: 'cart.label', extra: 'cart.count' } })), /"args" supplies "extra", but badge\.set declares: count, label/);
  assert.match(message(() => syncApps({ ...options(cart, badge), args: { count: 'cart.owner', label: 'cart.label' } })), /args\.count reads "cart\.owner", which is not in "watch"/);
});

test('a value of the wrong type is an error naming the sync, not a silent drop', () => {
  const cart = cartApp();
  const badge = badgeApp();
  assert.match(message(() => syncApps({ ...options(cart, badge), args: { count: 'cart.label', label: 'cart.label' } })), /syncApps: cart\.count, cart\.label -> badge\.set: .*badge\.set\.count: want number, got string/);
});

test('the same values are not sent twice: a change that leaves the watched values unchanged logs nothing on the receiver', async () => {
  const cart = mountSpec({ spec: noop, namespaces: { cart: { state: { count: 0, noise: 0 }, derive: { even: (get) => get('count') % 2 === 0 }, actions: {
    tick: { args: {}, run: (store) => store.set('noise', store.get('noise') + 1) },
    add: { args: {}, run: (store) => store.set('count', store.get('count') + 2) },
  } } } }).ui;
  const badge = mountSpec({ spec: noop, namespaces: { badge: { state: { even: true }, actions: { set: { args: { even: 'boolean' }, run: (store, { even }) => store.set('even', even) } } } } }).ui;
  syncApps({ from: cart, to: badge, watch: ['cart.even'], action: 'badge.set', args: { even: 'cart.even' } });
  assert.equal(badge.log.length, 1, 'the first value is sent once');
  cart.dispatch('cart.tick'); // another key changes: the watched one does not
  await cart.settle();
  cart.dispatch('cart.add'); // the count changes, the watched derived value recomputes to the same answer
  await cart.settle();
  assert.equal(badge.log.length, 1, 'nothing changed for the receiver, so nothing was sent');
});

test('nothing is sent while the receiving app replays', async () => {
  const cart = cartApp();
  const badge = badgeApp();
  syncApps(options(cart, badge));
  cart.dispatch('cart.add');
  await cart.settle();
  const expected = JSON.stringify(badge.log);
  const replaying = badge.replay();
  cart.dispatch('cart.add'); // the sender changes while the receiver is replaying
  await cart.settle();
  await replaying;
  assert.equal(JSON.stringify(badge.log), expected, 'the replay rebuilt the receiver from its own log; the sync added nothing');
});

test('a target action without arguments, and options of the wrong kind, are handled with a message', () => {
  const cart = cartApp();
  const badge = badgeApp();
  assert.match(message(() => syncApps({ from: cart, to: badge, watch: ['cart.count'], action: 'badge.none', args: { extra: 'cart.count' } })), /"args" supplies "extra", but badge\.none declares: no arguments/);
  assert.equal(message(() => syncApps({ from: cart, to: badge, watch: ['cart.count'], action: 'badge.none', args: {} })), 'no error');
  assert.match(message(() => syncApps(null)), /syncApps: the argument must be an object\. Write syncApps\(\{ from, to, watch/);
  assert.match(message(() => syncApps({ ...options(cart, badge), watch: [] })), /"watch" must be a non-empty list of qualified keys of the "from" app/);
  assert.match(message(() => syncApps({ ...options(cart, badge), args: [] })), /"args" must map each argument of the action to a watched key/);
});
