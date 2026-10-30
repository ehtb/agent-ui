// A real browser for tests, with no dependency: Chrome (or Chromium), headless, driven over the DevTools protocol through Node's own
// WebSocket. The shim tests of the framework prove the runtime's logic; a test that uses this proves what a browser does with it
// (focus, the order of events, native checkboxes, module loading, CSS). Imported by projects as `@ehtb/agent-ui/testing/browser.mjs`.
//
//   const browser = await launchBrowser();                      // null when there is no Chrome: skip the test then
//   const site = await serveSite({ projectRoot });              // builds the project and serves it with the render server
//   const page = await browser.open(`${site.url}/`);            // waits for the page to start (window.__ui)
//   await page.click('[data-id="add"]'); await page.type('[data-id="draft"]', 'milk'); await page.press('Enter');
//   await page.evaluate('window.__ui.state()');
//   await close();                                              // closes the browser and the server
//
// Input is real: clicks are mouse events at the element's position, typing is text inserted into the focused element, keys are key
// events, all sent by the browser's input pipeline, so the page sees what a visitor would cause. CHROME_PATH names another build.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../../build/build.mjs';
import { loadConfig } from '../../build/config.mjs';
import { createSsrServer } from '../../cli/ssr-server.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const findChrome = () => {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? ['google-chrome', 'chromium'].map((name) => (spawnSync('which', [name], { encoding: 'utf8' }).stdout ?? '').trim()).find(Boolean) ?? null;
};

// What `close` does, in order, each on its own: one that fails must not leave Chrome or a server running.
const closeAll = async (cleanups) => {
  const failures = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) console.warn(`cleanup failed: ${failures.join('; ')}`);
};

const KEYS = { Enter: { code: 'Enter', keyCode: 13, text: '\r' }, Escape: { code: 'Escape', keyCode: 27 }, Tab: { code: 'Tab', keyCode: 9 }, Backspace: { code: 'Backspace', keyCode: 8 } };

// Starts Chrome. Returns null when there is none. { open(url) -> page, close() }.
export const launchBrowser = async () => {
  const executable = findChrome();
  if (!executable) return null;
  const cleanups = [];
  const profile = mkdtempSync(join(tmpdir(), 'agent-ui-chrome-'));
  const child = spawn(executable, ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  cleanups.push(async () => {
    child.kill();
    await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  let port;
  for (let attempt = 0; attempt < 100 && !port; attempt++) {
    const file = join(profile, 'DevToolsActivePort');
    if (existsSync(file)) port = readFileSync(file, 'utf8').split('\n')[0];
    else await sleep(100);
  }
  if (!port) {
    await closeAll(cleanups);
    throw new Error(`Chrome (${executable}) did not start. Set CHROME_PATH to another build, or skip browser tests`);
  }

  const open = async (url) => {
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json());
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error(`could not connect to Chrome at ${target.webSocketDebuggerUrl}`));
    });
    cleanups.push(() => socket.close());
    let nextId = 0;
    const waiting = new Map();
    const waitingRejects = new Map();
    const report = { loads: [], console: [] };
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id && waiting.has(message.id)) return waiting.get(message.id)(message), waiting.delete(message.id), waitingRejects.delete(message.id);
      if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId) report.loads.push(message.params.frame.url);
      if (message.method === 'Runtime.consoleAPICalled') report.console.push(`${message.params.type}: ${message.params.args.map((argument) => argument.value ?? argument.description).join(' ')}`);
      if (message.method === 'Runtime.exceptionThrown') report.console.push(`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
    };
    // A closed or failed connection ends every request that waits for an answer, instead of leaving the test hanging.
    const rejectAll = (reason) => {
      for (const reject of [...waitingRejects.values()]) reject(new Error(`the connection to Chrome ${reason}`));
      waiting.clear();
      waitingRejects.clear();
    };
    socket.onclose = () => rejectAll('was closed');
    socket.onerror = () => rejectAll('failed');
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      waiting.set(id, resolve);
      waitingRejects.set(id, reject);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return result.result.value;
    };
    const until = async (expression, what) => {
      for (let waited = 0; waited < 8000; waited += 50) {
        if (await evaluate(expression)) return;
        await sleep(50);
      }
      throw new Error(`timed out waiting for ${what}. Console: ${report.console.join(' | ')}`);
    };
    // The centre of the first element that matches, scrolled into view.
    const centre = async (selector) => {
      const point = await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({ block: 'center' }); const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);
      if (!point) throw new Error(`no element matches ${selector}`);
      return point;
    };
    const mouse = (type, point, extra = {}) => send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1, ...extra });
    const key = async (name, modifiers = 0) => {
      if (!KEYS[name] && name.length !== 1) throw new Error(`key(${JSON.stringify(name)}): not a single character and not one of ${Object.keys(KEYS).join(', ')}. Add it to KEYS in test/support/browser.mjs`);
      const known = KEYS[name] ?? { code: `Key${name.toUpperCase()}`, keyCode: name.toUpperCase().charCodeAt(0), text: name };
      const base = { key: name, code: known.code, windowsVirtualKeyCode: known.keyCode, modifiers };
      await send('Input.dispatchKeyEvent', { type: known.text ? 'keyDown' : 'rawKeyDown', ...base, ...(known.text && { text: known.text }) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });
    await until(`document.readyState === 'complete' && !!window.__ui`, 'the page to start');
    return {
      evaluate,
      until,
      report,
      send,
      // A click with the mouse: move, press, release at the centre of the element.
      click: async (selector) => {
        const point = await centre(selector);
        await mouse('mouseMoved', point, { button: 'none', clickCount: 0 });
        await mouse('mousePressed', point);
        await mouse('mouseReleased', point);
      },
      doubleClick: async (selector) => {
        const point = await centre(selector);
        await mouse('mouseMoved', point, { button: 'none', clickCount: 0 });
        for (const clickCount of [1, 2]) {
          await mouse('mousePressed', point, { clickCount });
          await mouse('mouseReleased', point, { clickCount });
        }
      },
      // Focuses the element and inserts the text as if typed (one input event, as an input method or a paste causes). With
      // `replace`, what the field held is selected first, so the text takes its place.
      type: async (selector, text, { replace = false } = {}) => {
        await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); ${replace ? 'element.select?.();' : ''} })()`);
        await send('Input.insertText', { text });
      },
      // One key press on the focused element: "Enter", "Escape", or a single character.
      press: key,
      // Waits until the app has applied everything it was told (the microtask queue is empty).
      settle: () => evaluate('window.__ui.settle().then(() => true)'),
    };
  };
  return { open, close: () => closeAll(cleanups), cleanups };
};

// Builds the project at `projectRoot` (production mode unless dev) and serves it with the render server on a free port. Returns { url, close }.
export const serveSite = async ({ projectRoot, outDir = '.output-browser', dev = false }) => {
  const config = await loadConfig({ root: projectRoot, mode: { dev } });
  build({ ...config, projectRoot, outDir });
  const server = await createSsrServer({ config, root: projectRoot, outDir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
      rmSync(join(projectRoot, outDir), { recursive: true, force: true });
    },
  };
};
