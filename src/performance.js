// The development performance plugin: guides an author or agent to write pages that pass Lighthouse performance audits.
// In a page, list `plugins: [withPerformance]` (or `withPerformance({ ... })`); in app(), list `performance` (or `performance({ ... })`).
// Production builds replace this module with a stub (build/stubs/performance-omitted.js), so leaving `withPerformance` in page.js costs
// nothing in production. When `dev` is false or the server renders the page, the plugin does nothing.
//
// What it checks:
//   - Static spec and page checks (also callable alone as `auditSpecPerformance(spec, { head, namespaces, hasReady, where })`):
//       * render-blocking `<script src="...">` in `head.tags` without `defer`, `async` or `type: 'module'`
//       * `<img>` without `width` and `height` (causes Cumulative Layout Shift, CLS)
//       * `<img>` with both `loading: 'lazy'` and `fetchpriority: 'high'` (contradictory LCP priority)
//       * `resources` with `owns` on a page with `ready(state)` that omit `revalidate: 'never'` (browser fetches the same data again on mount)
//       * namespaces listed on a page that nothing in the view, head or other namespaces reads or calls (unused JavaScript)
//   - Live DOM and state checks (at mount and after each action):
//       * rendered DOM size over `elements` (default 1500, Lighthouse's DOM-size threshold)
//       * unvirtualized list rows over `listRows` (default 100)
//       * derived lists that allocate new object references for unchanged items on an action instead of using `memoizeItem`
//       * derived values that an action makes stale taking longer than `actionMs` to recompute (default 16 ms, one 60 Hz frame)
//   - Browser stylesheets and Web Vitals (`PerformanceObserver`, when running in a browser):
//       * stylesheets in `document.styleSheets` where more than `unusedCssRatio` (default 0.5, for sheets with >= 10 rules) match no element
//       * Largest Contentful Paint (`largest-contentful-paint`): flags an LCP `<img>` that has `loading="lazy"` or lacks `fetchpriority="high"`, naming its `data-id`
//       * Cumulative Layout Shift (`layout-shift`): adds up the shifts without recent input in a session window, as Lighthouse does (each less than 1 s after the one before, at most 5 s), and flags a window over 0.1 once, naming the shifted elements' `data-id`s
//       * Long main-thread tasks (`longtask`): flags tasks over `longTaskMs` (default 50 ms) with the last action that ran
import { didYouMean, fail } from './messages.js';
import { isBinding, isPlainObject, markPagePlugin, toArray } from './spec-core.js';

const AUDIT_KEYS = ['head', 'namespaces', 'hasReady', 'where'];
const PERFORMANCE_KEYS = ['onReport', 'elements', 'listRows', 'actionMs', 'longTaskMs', 'unusedCssRatio', 'head', 'hasReady', 'where'];

const checkAuditOptions = (options) => {
  if (options === undefined) return;
  if (!isPlainObject(options)) fail('auditSpecPerformance', `options must be an object, got ${options === null ? 'null' : typeof options}`, 'Write auditSpecPerformance(spec, { head, namespaces, hasReady })');
  for (const key of Object.keys(options)) {
    if (!AUDIT_KEYS.includes(key)) fail('auditSpecPerformance', `unknown option "${key}"`, `${didYouMean(key, AUDIT_KEYS)}Allowed options: ${AUDIT_KEYS.join(', ')}`);
  }
};

const checkPerformanceOptions = (options) => {
  if (options === undefined) return;
  if (!isPlainObject(options)) fail('performance', `options must be an object, got ${options === null ? 'null' : typeof options}`, 'Write performance({ elements: 1500, listRows: 100 })');
  for (const key of Object.keys(options)) {
    if (!PERFORMANCE_KEYS.includes(key)) fail('performance', `unknown option "${key}"`, `${didYouMean(key, PERFORMANCE_KEYS)}Allowed options: ${PERFORMANCE_KEYS.join(', ')}`);
  }
  if (options.onReport !== undefined && typeof options.onReport !== 'function') {
    fail('performance', 'onReport must be a function (finding) => void', 'Write onReport: (finding) => console.warn(finding.message)');
  }
  for (const key of ['elements', 'listRows']) {
    if (options[key] !== undefined && (!Number.isInteger(options[key]) || options[key] < 1)) {
      fail('performance', `${key} must be a whole number, 1 or more`, `Write ${key}: ${key === 'listRows' ? 100 : 1500}`);
    }
  }
  for (const key of ['actionMs', 'longTaskMs']) {
    if (options[key] !== undefined && (typeof options[key] !== 'number' || !Number.isFinite(options[key]) || options[key] <= 0)) {
      fail('performance', `${key} must be a positive number of milliseconds`, `Write ${key}: ${key === 'actionMs' ? 16 : 50}`);
    }
  }
  if (options.unusedCssRatio !== undefined && (typeof options.unusedCssRatio !== 'number' || !Number.isFinite(options.unusedCssRatio) || options.unusedCssRatio <= 0 || options.unusedCssRatio > 1)) {
    fail('performance', 'unusedCssRatio must be a number between 0 and 1', 'Write unusedCssRatio: 0.5');
  }
};

// Collects every namespace name a binding or expression inside the spec reads.
const recordBindingNamespaces = (value, usedNamespaces) => {
  if (Array.isArray(value)) return value.forEach((entry) => recordBindingNamespaces(entry, usedNamespaces));
  if (!isPlainObject(value)) return;
  if (typeof value.state === 'string') usedNamespaces.add(value.state.split('.')[0]);
  if (typeof value.rowState === 'string') {
    const parts = value.rowState.split('.');
    // { rowState: 'pickers.open' } or { rowState: 'order.pickers.open' }
    usedNamespaces.add(parts.length === 3 ? parts[1] : parts[0]);
  }
  for (const operand of Object.values(value)) {
    if (typeof operand === 'object' && operand !== null) recordBindingNamespaces(operand, usedNamespaces);
  }
};

// Namespace names are letters and digits, so a name can sit in a pattern as it is. `art` is not a mention of `cart`.
const mentionsName = (source, name) => new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source);
// A qualified key such as 'search.query' (derive code reads other namespaces' keys that way, in a string or after `state.`).
const mentionsQualifiedKey = (source, name) => new RegExp(`(?<![\\w$])${name}\\.`).test(source);

const collectFunctionSources = (value, sources = []) => {
  if (typeof value === 'function') sources.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => collectFunctionSources(item, sources));
  else if (isPlainObject(value)) Object.values(value).forEach((item) => collectFunctionSources(item, sources));
  return sources;
};

// Static Lighthouse-aligned checks over a spec and its page declaration. Returns a list of "where: problem. fix" strings.
export const auditSpecPerformance = (spec, options = {}) => {
  checkAuditOptions(options);
  const { head, namespaces, hasReady, where } = options;
  const prefix = where ? `${where}: ` : '';
  const problems = [];
  const usedNamespaces = new Set(['route']);

  if (isPlainObject(head) && Array.isArray(head.tags)) {
    head.tags.forEach((node, index) => {
      if (!isPlainObject(node) || node.tag !== 'script') return;
      const props = isPlainObject(node.props) ? node.props : {};
      if (props.src && !props.defer && !props.async && props.type !== 'module') {
        problems.push(`${prefix}head.tags[${index}]: <script src="${props.src}"> in <head> blocks rendering and delays FCP and LCP. Add defer: true or async: true to props, or move the script to head.bodyTags`);
      }
    });
  }

  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((child, index) => walk(child, `${path}.${index}`));
    if (!isPlainObject(node)) return;
    if (isBinding(node)) return recordBindingNamespaces(node, usedNamespaces);

    if (node.each !== undefined) {
      if (typeof node.each === 'string') usedNamespaces.add(node.each.split('.')[0]);
      else recordBindingNamespaces(node.each, usedNamespaces);
      walk(node.template, `${path}.template`);
      return;
    }
    if (node.when !== undefined) {
      recordBindingNamespaces(node.when, usedNamespaces);
      if (node.children !== undefined) walk(node.children, `${path}.when`);
      if (node.otherwise !== undefined) walk(node.otherwise, `${path}.otherwise`);
      return;
    }

    const props = isPlainObject(node.props) ? node.props : {};
    for (const value of Object.values(props)) recordBindingNamespaces(value, usedNamespaces);
    if (isPlainObject(node.classes)) {
      for (const value of Object.values(node.classes)) recordBindingNamespaces(value, usedNamespaces);
    }
    if (isPlainObject(node.on)) {
      for (const handler of Object.values(node.on)) {
        const list = Array.isArray(handler) && typeof handler[0] === 'string' ? [handler] : toArray(handler);
        for (const entry of list) {
          if (Array.isArray(entry) && typeof entry[0] === 'string') {
            usedNamespaces.add(entry[0].split('.')[0]);
            if (isPlainObject(entry[1])) recordBindingNamespaces(entry[1], usedNamespaces);
          }
        }
      }
    }

    if (node.tag === 'img') {
      const label = node.id ? `img "${node.id}"` : `img at ${path}`;
      if (props.width === undefined || props.height === undefined) {
        problems.push(`${prefix}${label}: <img> has no width and height, so the layout shifts when it loads (CLS). Add width and height to props`);
      }
      if (props.loading === 'lazy' && props.fetchpriority === 'high') {
        problems.push(`${prefix}${label}: <img> has both loading="lazy" and fetchpriority="high". Remove loading="lazy" on an above-the-fold LCP image, or remove fetchpriority="high"`);
      }
    }

    const children = Array.isArray(node.children) ? node.children : node.children === undefined ? [] : [node.children];
    children.forEach((child, index) => walk(child, `${path}.${index}`));
  };

  walk(spec, '0');

  if (isPlainObject(namespaces)) {
    const headSource = collectFunctionSources(head).join('\n');
    for (const candidate of Object.keys(namespaces)) {
      if (mentionsName(headSource, candidate)) usedNamespaces.add(candidate);
    }
    for (const [name, definition] of Object.entries(namespaces)) {
      if (!isPlainObject(definition)) continue;
      for (const action of Object.values(definition.actions ?? {})) {
        for (const target of toArray(action?.calls)) {
          if (typeof target === 'string') usedNamespaces.add(target.split('.')[0]);
        }
      }
      for (const compute of Object.values(definition.derive ?? {})) {
        if (typeof compute !== 'function') continue;
        const source = String(compute);
        for (const candidate of Object.keys(namespaces)) {
          if (candidate !== name && mentionsQualifiedKey(source, candidate)) usedNamespaces.add(candidate);
        }
      }
    }
    for (const [name, definition] of Object.entries(namespaces)) {
      if (name === 'route' || !isPlainObject(definition)) continue;
      const resources = toArray(definition.resources);
      if (resources.length > 0) {
        usedNamespaces.add(name);
        if (hasReady === true) {
          resources.forEach((resource, index) => {
            if (isPlainObject(resource) && Array.isArray(resource.owns) && resource.owns.length > 0 && resource.revalidate !== 'never') {
              problems.push(`${prefix}namespace "${name}" resources[${index}]: the server already waits for ready(state), but the browser fetches this resource again on mount. Add revalidate: 'never' (with owns) so the browser trusts the server's data on first paint`);
            }
          });
        }
      }
    }
    for (const [name, definition] of Object.entries(namespaces)) {
      if (name === 'route' || !isPlainObject(definition)) continue;
      if (!usedNamespaces.has(name)) {
        problems.push(`${prefix}namespace "${name}": listed in namespaces, but nothing in the view, head or other namespaces reads or calls it. Remove "${name}" from namespaces so the page does not download unused JavaScript`);
      }
    }
  }

  return problems;
};

const countOutline = (outline) => {
  let elements = 0;
  let largestList = { rows: 0, inside: null };
  const visit = (nodes, parentId) => {
    const rows = nodes.filter((node) => node.key !== undefined).length;
    if (rows > largestList.rows) largestList = { rows, inside: parentId };
    for (const node of nodes) {
      elements++;
      if (node.children) visit(node.children, node.id);
    }
  };
  visit(outline, null);
  return { elements, largestList };
};

const flattenDerivedLists = (nested) => {
  const lists = {};
  for (const [namespace, values] of Object.entries(nested ?? {})) {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (Array.isArray(value)) lists[`${namespace}.${key}`] = value;
    }
  }
  return lists;
};

// Strips pseudo-elements and interactive pseudo-classes so `querySelector` can test whether the base selector matches any element on the page.
const baseSelectorOf = (selectorText) =>
  selectorText
    .replace(/::?[a-zA-Z-]+(?:\([^)]*\))?/g, '')
    .trim();

const inspectStylesheets = (document, unusedCssRatio, prefix, report) => {
  if (!document?.styleSheets || typeof document.querySelector !== 'function') return;
  for (const sheet of [...document.styleSheets]) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet
    }
    if (!rules) continue;
    let total = 0;
    let unused = 0;
    for (const rule of [...rules]) {
      if (!rule.selectorText) continue;
      const selectors = rule.selectorText.split(',').map(baseSelectorOf).filter((selector) => selector && !['*', 'html', 'body', ':root'].includes(selector));
      if (!selectors.length) continue;
      total++;
      const matched = selectors.some((selector) => {
        try {
          return document.querySelector(selector) !== null;
        } catch {
          return true; // a complex selector querySelector rejects is not counted as unused
        }
      });
      if (!matched) unused++;
    }
    if (total >= 10 && unused / total > unusedCssRatio) {
      const href = sheet.href ? sheet.href.replace(/^https?:\/\/[^/]+/, '') : 'inline <style>';
      report(
        'unused-css',
        `${prefix}stylesheet "${href}" has ${unused} of ${total} rules (${Math.round((unused / total) * 100)}%) that match no element on this page, blocking initial render. Move page-specific rules into page.css, or @import shared CSS only in the pages that use it`,
        { stylesheet: href, unused, total },
      );
    }
  }
};

const installPerformance = (api, options = {}, environment = null) => {
  if (environment?.isServerRendering || environment?.dev === false) return;
  const elementsLimit = options.elements ?? 1500;
  const listRowsLimit = options.listRows ?? 100;
  const actionMsLimit = options.actionMs ?? 16;
  const longTaskLimit = options.longTaskMs ?? 50;
  const unusedCssRatio = options.unusedCssRatio ?? 0.5;
  const where = options.where ?? (environment?.page?.path ? `page "${environment.page.path}"` : '');
  const prefix = where ? `${where}: ` : '';
  const head = options.head ?? environment?.page?.head;
  const hasReady = options.hasReady ?? environment?.page?.hasReady;
  const sink = options.onReport ?? ((finding) => console.warn(`[agent-ui performance] ${finding.message}`));
  const reported = new Set();
  const cleanups = [];

  const report = (kind, message, details = {}) => {
    if (api.replaying || reported.has(message)) return;
    reported.add(message);
    sink({ kind, message, details });
  };

  for (const message of auditSpecPerformance(api.spec(), { head, namespaces: api.namespaces(), hasReady, where })) {
    report('spec', message, { where });
  }

  const checkOutline = () => {
    const { elements, largestList } = countOutline(api.outline());
    if (elements > elementsLimit) {
      report(
        'dom-size',
        `${prefix}renders ${elements} elements, over the limit of ${elementsLimit} (Lighthouse flags pages over 1,500 DOM elements). Show less at once (a page of the data, or a when(...) branch that opens on request)`,
        { elements, limit: elementsLimit },
      );
    }
    if (largestList.rows > listRowsLimit) {
      report(
        'list-rows',
        `${prefix}renders ${largestList.rows} rows in one list${largestList.inside ? ` (inside "${largestList.inside}")` : ''}, over the limit of ${listRowsLimit}. Every row is rendered (there is no virtualization): paginate on the server, or filter in derive`,
        { rows: largestList.rows, inside: largestList.inside, limit: listRowsLimit },
      );
    }
  };

  checkOutline();

  const win = environment?.win ?? (typeof window !== 'undefined' ? window : null);
  inspectStylesheets(win?.document, unusedCssRatio, prefix, report);

  let previousLists = flattenDerivedLists(api.derived());
  let lastAction = null;

  cleanups.push(
    api.onAction(({ name, replaying }) => {
      const started = typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : 0;
      // Reading api.derived() recomputes the derived values the action made stale, so this is the cost to time. Stop the clock
      // before the audit below, which is this module's own work and not the app's.
      const nextLists = flattenDerivedLists(api.derived());
      const elapsed = started ? globalThis.performance.now() - started : 0;
      if (replaying) {
        previousLists = nextLists;
        return;
      }
      lastAction = name;
      for (const [derivedKey, after] of Object.entries(nextLists)) {
        const before = previousLists[derivedKey];
        if (!Array.isArray(before) || before === after || before.length < 10 || before.length !== after.length) continue;
        let clonedUnchanged = 0;
        for (let index = 0; index < after.length; index++) {
          const itemAfter = after[index];
          const itemBefore = before[index];
          if (itemAfter !== null && typeof itemAfter === 'object' && itemAfter !== itemBefore && JSON.stringify(itemAfter) === JSON.stringify(itemBefore)) {
            clonedUnchanged++;
          }
        }
        if (clonedUnchanged >= Math.max(5, Math.floor(after.length * 0.5))) {
          report(
            'unmemoized-derive',
            `${prefix}action "${name}" recomputed derived list "${derivedKey}" (${after.length} items) and created new object references for ${clonedUnchanged} unchanged items, making every row re-run its bindings. Wrap the per-item transform in memoizeItem (@ehtb/agent-ui/memoize)`,
            { action: name, derived: derivedKey, items: after.length, clonedUnchanged },
          );
        }
      }
      previousLists = nextLists;
      checkOutline();
      if (elapsed > actionMsLimit) {
        report(
          'slow-action',
          `${prefix}action "${name}" made its derived values take ${Math.round(elapsed)} ms to recompute (over ${actionMsLimit} ms). Use memoizeItem in derive or paginate large lists`,
          { action: name, duration: elapsed, limit: actionMsLimit },
        );
      }
    }),
  );

  if (typeof win?.PerformanceObserver === 'function') {
    const observe = (type, callback) => {
      try {
        const observer = new win.PerformanceObserver((list) => {
          if (api.replaying) return;
          for (const entry of list.getEntries()) callback(entry);
        });
        observer.observe({ type, buffered: true });
        cleanups.push(() => observer.disconnect());
      } catch {
        // Entry type not supported by this browser.
      }
    };

    observe('largest-contentful-paint', (entry) => {
      const element = entry.element;
      if (!element) return;
      const id = element.getAttribute?.('data-id') ?? element.closest?.('[data-id]')?.getAttribute?.('data-id') ?? 'unknown';
      const tag = (element.localName ?? element.tagName ?? '').toLowerCase();
      if (tag === 'img') {
        if (element.getAttribute?.('loading') === 'lazy') {
          report(
            'lcp-lazy-image',
            `${prefix}LCP element <img data-id="${id}"> (${Math.round(entry.startTime)} ms) has loading="lazy", which delays Largest Contentful Paint. Remove loading="lazy" and add fetchpriority: 'high' in view.js`,
            { id, startTime: entry.startTime },
          );
        } else if (element.getAttribute?.('fetchpriority') !== 'high') {
          report(
            'lcp-priority',
            `${prefix}LCP element <img data-id="${id}"> (${Math.round(entry.startTime)} ms) does not have fetchpriority="high". Add fetchpriority: 'high' to its props in view.js so the browser prioritises it`,
            { id, startTime: entry.startTime },
          );
        }
      }
    });

    // Cumulative Layout Shift the way Lighthouse reads it: the shifts that follow no input are added up in a session window (each less than a
    // second after the one before, the window at most five seconds long), and the score is the worst window. One shift is rarely over 0.1;
    // several small ones are. Reported once, when a window passes the limit, with what moved in it until then.
    const shiftWindow = { value: 0, shifts: 0, start: 0, last: 0, ids: new Set(), reported: false };
    observe('layout-shift', (entry) => {
      if (entry.hadRecentInput || !(entry.value > 0)) return;
      const time = entry.startTime ?? 0;
      if (shiftWindow.shifts === 0 || time - shiftWindow.last >= 1000 || time - shiftWindow.start >= 5000) Object.assign(shiftWindow, { value: 0, shifts: 0, start: time, ids: new Set() });
      shiftWindow.value += entry.value;
      shiftWindow.shifts++;
      shiftWindow.last = time;
      for (const source of entry.sources ?? []) {
        const id = source.node?.getAttribute?.('data-id') ?? source.node?.closest?.('[data-id]')?.getAttribute?.('data-id');
        if (id) shiftWindow.ids.add(id);
      }
      if (shiftWindow.reported || !(shiftWindow.value > 0.1)) return;
      shiftWindow.reported = true;
      const ids = [...shiftWindow.ids];
      const targets = ids.length ? ` affecting ${ids.map((id) => `[data-id="${id}"]`).join(', ')}` : '';
      report(
        'cls',
        `${prefix}layout shifts total ${shiftWindow.value.toFixed(3)} in one session window (${shiftWindow.shifts} ${shiftWindow.shifts === 1 ? 'shift' : 'shifts'}; over Lighthouse's 0.1 threshold)${targets}. Reserve the space before the content arrives: width and height on images, embeds and iframes, a min-height on a container that fills later, and no content inserted above what is already shown`,
        { value: shiftWindow.value, shifts: shiftWindow.shifts, ids },
      );
    });

    observe('longtask', (entry) => {
      if (!(entry.duration > longTaskLimit)) return;
      report(
        'long-task',
        `${prefix}main-thread task took ${Math.round(entry.duration)} ms (over ${longTaskLimit} ms; last action: ${lastAction ?? 'startup'}). Split heavy startup imports with import(), paginate large lists, or use memoizeItem in derive`,
        { duration: entry.duration, limit: longTaskLimit, action: lastAction },
      );
    });
  }

  api.onDestroy(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
};

const isAppApi = (value) => isPlainObject(value) && typeof value.dispatch === 'function' && typeof value.spec === 'function';
const isPageEnvironment = (value) => isPlainObject(value) && ('win' in value || 'root' in value || 'isServerRendering' in value || 'page' in value);

// For app({ plugins: [performance] }) or app({ plugins: [performance({ elements: 1000 })] }).
export const performance = (optionsOrApi) => {
  if (isAppApi(optionsOrApi)) return installPerformance(optionsOrApi, {}, null);
  checkPerformanceOptions(optionsOrApi);
  return (api) => installPerformance(api, optionsOrApi, null);
};

// For page.js: `plugins: [withPerformance]` or `plugins: [withPerformance({ elements: 1000 })]`.
export const withPerformance = markPagePlugin(function withPerformance(optionsOrEnvironment) {
  if (isPageEnvironment(optionsOrEnvironment)) {
    return (api) => installPerformance(api, {}, optionsOrEnvironment);
  }
  checkPerformanceOptions(optionsOrEnvironment);
  return markPagePlugin(function withPerformance(environment) {
    return (api) => installPerformance(api, optionsOrEnvironment, environment);
  });
});
