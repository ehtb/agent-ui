// What `agent-ui check` says about hydration: whether a browser that takes over the markup of the server (src/adopt.js) finds the page it
// would have made itself. Two comparisons, both of markup the page makes from the state the document carries (renderFirstPass):
//
//   the server's markup and the browser's first render     they differ when a state key was left out of the document (stateForBrowser), or
//                                                          the markup depends on something that is not in the state
//   the first render and the same render again, then       they differ when the page uses random numbers or a counter (two plain renders
//   under another clock, time zone and locale              differ), or depends on the time, on the time zone or on the locale (a derived
//                                                          value that is not pure)
//
// A difference is not a failure for the visitor: the browser makes the nodes that differ again (AUI0305). It is a mistake of the page, found
// here instead of in a browser.
import { renderFirstPass } from '../server/render-page.js';

// ---- the three things a page may depend on without saying so (random numbers and counters are found by rendering twice) -------------------------------------------------------------------------

const SHIFT = 400 * 24 * 60 * 60 * 1000 + 13_579_000; // a year, a month and a few hours later
const FOREIGN_LOCALE = 'ar-EG'; // other digits, other month names, other separators than the default of any machine a project runs on
const LOCALE_METHODS = [[Number.prototype, 'toLocaleString'], [BigInt.prototype, 'toLocaleString'], [Date.prototype, 'toLocaleString'], [Date.prototype, 'toLocaleDateString'], [Date.prototype, 'toLocaleTimeString'], [String.prototype, 'localeCompare'], [String.prototype, 'toLocaleUpperCase'], [String.prototype, 'toLocaleLowerCase']];
const LOCALE_CONSTRUCTORS = ['NumberFormat', 'DateTimeFormat', 'Collator', 'PluralRules', 'RelativeTimeFormat', 'ListFormat'];

const defaultLocale = () => Intl.DateTimeFormat().resolvedOptions().locale;
const defaultTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The clock a render sees stands still at `instant`: two renders of one state a millisecond apart must not differ because of that, and what a
// render does with the time is then compared at the same instant everywhere but where the time itself is the factor.
const withClock = (instant, run) => {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...parts) {
      if (parts.length === 0) super(instant);
      else super(...parts);
    }
    static now() {
      return instant;
    }
  }
  globalThis.Date = FixedDate;
  try {
    return run();
  } finally {
    globalThis.Date = RealDate;
  }
};

// Each factor changes what it names, runs `run` (synchronously: nothing else runs while it is changed) and puts everything back.
const factorsAt = (instant) => ({
  frozen: { around: (run) => withClock(instant, run) }, // not a cause: every render has it, unless the time itself is the factor
  time: { label: 'the current time (Date.now, new Date())', around: (run) => withClock(instant + SHIFT, run) },
  timezone: {
    label: 'the time zone (a date written without timeZone)',
    around: (run) => {
      const before = process.env.TZ;
      process.env.TZ = defaultTimeZone() === 'Pacific/Kiritimati' ? 'Pacific/Pago_Pago' : 'Pacific/Kiritimati'; // 25 hours apart, so any date differs
      try {
        return run();
      } finally {
        if (before === undefined) delete process.env.TZ;
        else process.env.TZ = before;
      }
    },
  },
  locale: {
    label: 'the locale (toLocaleString, Intl.NumberFormat or Intl.DateTimeFormat without a locale)',
    around: (run) => {
      const locale = defaultLocale().startsWith('ar') ? 'en-US' : FOREIGN_LOCALE;
      const restore = [];
      for (const [prototype, name] of LOCALE_METHODS) {
        const original = prototype[name];
        prototype[name] = function (first, ...rest) {
          return original.call(this, first === undefined ? locale : first, ...rest);
        };
        restore.push(() => (prototype[name] = original));
      }
      for (const name of LOCALE_CONSTRUCTORS) {
        const Original = Intl[name];
        Intl[name] = class extends Original {
          constructor(locales, ...rest) {
            super(locales === undefined ? locale : locales, ...rest);
          }
        };
        restore.push(() => (Intl[name] = Original));
      }
      try {
        return run();
      } finally {
        restore.forEach((undo) => undo());
      }
    },
  },
});

// Runs `run` with the listed factors changed at once.
const underFactors = (factors, names, run) => names.reduceRight((inner, name) => () => factors[name].around(inner), run)();

// ---- comparing markup ------------------------------------------------------------------------------------------------------------

// Where two pieces of markup first differ, as a sentence: the element it is in (the nearest data-id before it) and a few characters of each.
export const describeDifference = (first, second, firstName, secondName) => {
  let index = 0;
  while (index < first.length && index < second.length && first[index] === second[index]) index++;
  const before = first.slice(0, index);
  const lastId = [...before.matchAll(/data-id="([^"]*)"/g)].pop()?.[1];
  const snippet = (text) => JSON.stringify(text.slice(Math.max(0, index - 20), index + 40));
  return `${lastId === undefined ? 'at the start' : `near the element with data-id "${lastId}"`}: ${firstName} has ${snippet(first)}, ${secondName} has ${snippet(second)}`;
};

// What `agent-ui check` reports for one rendered page, as a list of problems (empty when the page hydrates cleanly). `result` is what renderPage
// returned for `url`, read before its apps are destroyed.
export const findHydrationProblems = ({ create, createShell, url, result, basePath = '', where }) => {
  if (result.timedOut) return []; // a page that never became ready was reported, and its markup is not a finished page
  const factors = factorsAt(Date.now());
  // A fresh copy of the state for every render, so a cache keyed by the reference of an item (memoizeItem) cannot answer for the one before.
  const plain = () => renderFirstPass(create, { url, state: JSON.parse(JSON.stringify(result.browserState)), createShell, dev: true, basePath });
  const underClock = (changing) => underFactors(factors, changing.includes('time') ? changing : ['frozen', ...changing], plain);
  const render = () => underClock([]);
  let browserMarkup;
  try {
    browserMarkup = render();
  } catch (error) {
    return [`${where}: the page cannot be made from the state the document carries: ${error?.message ?? String(error)}. A browser would fail the same way when it starts`];
  }
  // A page that differs from itself, with nothing changed, uses random numbers or a counter. It also differs from what the server wrote and from
  // every render below, which that explains: it is reported alone.
  const names = ['time', 'timezone', 'locale'];
  let again;
  try {
    again = render();
  } catch (error) {
    again = `threw: ${error?.message ?? String(error)}`;
  }
  if (again !== browserMarkup) {
    return [`${where}: the page is not the same for the same state: two renders from one state differ, ${describeDifference(browserMarkup, again, 'one render', 'the next')}. That is what random numbers (Math.random) or ids made by a counter do. The browser renders from the state the document carries, so it would make these nodes again (AUI0305). Make a derived value a function of the state alone: make the id in an action or an API response and keep it in state`];
  }
  // The same render with everything changed at once; only when it differs is it found out which of them the page depends on. A page that depends
  // on one of them also differs from what the server wrote, which that explains: it is reported alone.
  const changed = (changing) => {
    try {
      return underClock(changing);
    } catch (error) {
      return `threw: ${error?.message ?? String(error)}`;
    }
  };
  if (changed(names) !== browserMarkup) {
    const causes = names.filter((name) => changed([name]) !== browserMarkup);
    const cause = causes.length ? causes.map((name) => factors[name].label).join('; ') : 'a combination of the time, the time zone and the locale';
    const sample = changed(causes.length ? causes : names);
    return [`${where}: the page is not the same for the same state: its markup depends on ${cause}, ${describeDifference(browserMarkup, sample, 'one render', 'the next')}. The browser renders from the state the document carries, at another time and place than the server did, so it would make these nodes again (AUI0305). Make a derived value a function of the state alone: read the time or a random id in an action or an API response and keep it in state, and give toLocaleString and Intl an explicit locale and timeZone`];
  }
  if (browserMarkup !== result.pageHtml) {
    return [`${where}: the page a browser renders from the state the document carries is not the page the server wrote, ${describeDifference(result.pageHtml, browserMarkup, 'the server', 'the browser')}. A browser takes over the nodes that are the same and makes the others again (AUI0305). Likely causes: stateForBrowser left out a key the page shows, or the markup depends on something that is not in the state`];
  }
  return [];
};
