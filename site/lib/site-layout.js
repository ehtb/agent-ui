// The document around every page: header, footer, the documentation navigation and the search panel. Layouts are
// build-time functions, so the whole site is plain spec data in the static export. This module imports the builders
// and is only reached by view.js files.
import {
  a, act, and, article, aside, code, details, div, each, equals, event, footer, h1, h2, header, input, item,
  length, li, main, nav, not, p, pre, section, small, span, state, summary, ul, when,
} from '@ehtb/agent-ui/spec';
import { navGroups, repository } from './docs-meta.js';
import { highlightCode } from './highlight.js';
import { siteMeta } from '../generated/site-meta.js';

const externalLink = (href, label, className = 'text-link') =>
  a({ href, class: className, target: '_blank', rel: 'noreferrer' }, label, span({ class: 'external-mark', 'aria-hidden': 'true' }, '↗'));

const brand = () =>
  a(
    { href: '/', class: 'brand', 'aria-label': 'agent-ui home' },
    span({ class: 'brand-mark', 'aria-hidden': 'true' }, '</>'),
    span({ class: 'brand-name' }, 'agent-ui'),
    span({ class: 'brand-version' }, `v${siteMeta.version}`),
  );

export const siteHeader = (active = '') => {
  const link = (href, label, key) =>
    a(
      {
        href,
        class: active === key ? 'top-link is-active' : 'top-link',
        ...(active === key ? { 'aria-current': 'page' } : {}),
      },
      label,
    );
  return header(
    { id: 'site-header', class: 'site-header' },
    div(
      { class: 'header-inner' },
      brand(),
      nav(
        { class: 'header-nav', 'aria-label': 'Main navigation' },
        link('/docs', 'Docs', 'docs'),
        link('/docs/api', 'API', 'api'),
        link('/cookbook', 'Cookbook', 'cookbook'),
        link('/examples', 'Examples', 'examples'),
      ),
      div(
        { class: 'header-actions' },
        externalLink(repository, 'GitHub', 'header-action'),
        externalLink('https://www.npmjs.com/package/@ehtb/agent-ui', 'npm', 'header-action'),
      ),
    ),
  );
};

export const siteFooter = () =>
  footer(
    { id: 'site-footer', class: 'site-footer' },
    div(
      { class: 'footer-inner' },
      div(
        { class: 'footer-brand' },
        brand(),
        p(null, 'A zero-dependency UI library with server rendering, built for agents to write, check and maintain.'),
      ),
      nav(
        { class: 'footer-nav', 'aria-label': 'Footer navigation' },
        div(
          { class: 'footer-column' },
          p({ class: 'footer-title' }, 'Documentation'),
          a({ href: '/docs' }, 'Start here'),
          a({ href: '/docs/guide' }, 'Guide'),
          a({ href: '/docs/api' }, 'API reference'),
          a({ href: '/docs/build' }, 'Build & deploy'),
        ),
        div(
          { class: 'footer-column' },
          p({ class: 'footer-title' }, 'Explore'),
          a({ href: '/cookbook' }, 'Cookbook'),
          a({ href: '/examples' }, 'Examples'),
          a({ href: '/docs/design' }, 'Design notes'),
          a({ href: '/docs/changelog' }, 'Changelog'),
        ),
        div(
          { class: 'footer-column' },
          p({ class: 'footer-title' }, 'Project'),
          externalLink(`${repository}/blob/main/LICENSE`, 'MIT license'),
          externalLink(`${repository}/issues`, 'Issues'),
          externalLink('https://www.npmjs.com/package/@ehtb/agent-ui', 'npm package'),
        ),
      ),
    ),
    div(
      { class: 'footer-bottom' },
      small(null, `Built with agent-ui v${siteMeta.version}. This site is its own static export.`),
      small(null, 'MIT © ehtb'),
    ),
  );

const skipLink = (target) => a({ href: `#${target}`, class: 'skip-link' }, 'Skip to content');

// Builders reject null and undefined children, and a layout has several optional parts. Keep the condition on the part
// and remove it from the list here.
const present = (...nodes) => nodes.filter((node) => node !== null && node !== undefined && node !== false);

const searchPanel = () => {
  const hasQuery = not(equals(state('search.query'), ''));
  return div(
    { class: 'search-panel' },
    div(
      { class: 'search-label-row' },
      p({ class: 'search-label' }, 'Search'),
      span({ class: 'search-hint' }, '/'),
    ),
    input({
      id: 'docs-search',
      domId: 'docs-search',
      type: 'search',
      class: 'search-input',
      placeholder: 'Search the documentation',
      'aria-label': 'Search the documentation',
      'aria-controls': 'search-results',
      autocomplete: 'off',
      value: state('search.query'),
      on: { input: act('search.setQuery', { value: event('target.value') }) },
    }),
    when(
      equals(state('search.query'), ''),
      p({ class: 'search-message' }, 'Titles, headings and prose. Type to search.'),
    ),
    when(
      and(hasQuery, equals(state('search.status'), 'loading')),
      p({ class: 'search-message' }, 'Searching…'),
    ),
    when(
      and(hasQuery, equals(state('search.status'), 'failed')),
      p({ class: 'search-message search-error' }, 'The search index did not load. ', state('search.error')),
    ),
    when(
      and(hasQuery, equals(state('search.status'), 'ready')),
      div(
        { class: 'search-count', role: 'status' },
        state('search.resultLabel'),
      ),
    ),
    ul(
      { id: 'search-results', domId: 'search-results', class: 'search-results' },
      each(
        'search.results',
        'href',
        li(
          null,
          a(
            { href: item('href'), class: 'search-hit' },
            span({ class: 'search-hit-title' }, item('title')),
            span({ class: 'search-hit-page' }, item('pageTitle')),
            span({ class: 'search-hit-snippet' }, item('snippet')),
          ),
        ),
      ),
    ),
    when(
      and(
        hasQuery,
        equals(state('search.status'), 'ready'),
        equals(length(state('search.results')), 0),
      ),
      p({ class: 'search-message' }, 'No matches. Try a shorter word, or browse the guide.'),
    ),
  );
};

const navGroupsSpec = (activePath) =>
  navGroups.map((group) =>
    div(
      { class: 'nav-group' },
      p({ class: 'nav-group-title' }, group.title),
      ul(
        null,
        group.items.map((entry) => {
          const active = activePath === entry.path;
          return li(
            null,
            a(
              {
                href: entry.path,
                class: active ? 'nav-link is-active' : 'nav-link',
                ...(active ? { 'aria-current': 'page' } : {}),
              },
              entry.title,
            ),
          );
        }),
      ),
    ),
  );

const docsNav = (activePath) =>
  nav({ class: 'docs-nav', 'aria-label': 'Documentation' }, navGroupsSpec(activePath));

// The sidebar becomes the top of the page on a narrow screen, which would push the article far down. The same links
// fold into a native disclosure instead; it needs no state of its own and works before any JavaScript runs.
const docsNavFold = (activePath) =>
  details(
    { class: 'docs-nav-fold' },
    summary(null, 'Browse the documentation'),
    docsNav(activePath),
  );

const docsSidebar = (activePath) =>
  aside(
    { id: 'docs-sidebar', class: 'docs-sidebar' },
    div(
      { class: 'sidebar-inner' },
      searchPanel(),
      docsNavFold(activePath),
      docsNav(activePath),
      div(
        { class: 'sidebar-note' },
        p(null, 'Working with a coding agent?'),
        a({ href: '/docs/agent-rules' }, 'Start with the agent rules →'),
      ),
    ),
  );

const breadcrumb = (sectionLink, title) =>
  nav(
    { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
    sectionLink ? a({ href: sectionLink.href }, sectionLink.label) : a({ href: '/docs' }, 'Docs'),
    span({ class: 'breadcrumb-separator', 'aria-hidden': 'true' }, '/'),
    span({ class: 'breadcrumb-current' }, title),
  );

const tableOfContents = (headings) => {
  if (!headings.length) return null;
  return nav(
    { class: 'docs-toc', 'aria-label': 'On this page' },
    div(
      { class: 'toc-inner' },
      p({ class: 'toc-title' }, 'On this page'),
      ul(
        null,
        headings.map((heading) =>
          li(
            { class: `toc-item toc-level-${heading.level}` },
            a({ href: `#${heading.id}`, class: 'toc-link' }, heading.text),
          ),
        ),
      ),
    ),
  );
};

const pager = (previous, next) =>
  previous || next
    ? nav(
        { class: 'docs-pager', 'aria-label': 'Previous and next' },
        previous
          ? a(
              { href: previous.path, class: 'pager-link pager-previous' },
              span({ class: 'pager-label' }, '← Previous'),
              span({ class: 'pager-title' }, previous.title),
            )
          : div({ class: 'pager-spacer' }),
        next
          ? a(
              { href: next.path, class: 'pager-link pager-next' },
              span({ class: 'pager-label' }, 'Next →'),
              span({ class: 'pager-title' }, next.title),
            )
          : div({ class: 'pager-spacer' }),
      )
    : null;

export const docsLayout = ({
  content,
  title,
  description = '',
  activePath,
  sectionLink = { label: 'Docs', href: '/docs' },
  headings = [],
  previous = null,
  next = null,
  source = null,
  eyebrow = 'Documentation',
}) => {
  const toc = tableOfContents(headings);
  return div(
    { class: 'site-shell' },
    skipLink('doc-content'),
    siteHeader('docs'),
    div(
      { class: toc ? 'docs-grid' : 'docs-grid docs-grid-no-toc' },
      docsSidebar(activePath),
      main(
        { id: 'doc-content', domId: 'doc-content', class: 'docs-main' },
        breadcrumb(sectionLink, title),
        header(
          { class: 'doc-header' },
          ...present(
            p({ class: 'doc-eyebrow' }, eyebrow),
            h1({ id: 'doc-title', domId: 'doc-title', class: 'doc-title' }, title),
            description ? p({ class: 'doc-lead' }, description) : null,
            source
              ? div(
                  { class: 'doc-meta' },
                  externalLink(source, 'Edit this page on GitHub', 'doc-meta-link'),
                )
              : null,
          ),
        ),
        article({ class: 'doc-content' }, content),
        ...present(pager(previous, next)),
      ),
      ...present(toc),
    ),
    siteFooter(),
  );
};

export const homeLayout = (content) =>
  div(
    { class: 'site-shell page-home' },
    skipLink('main'),
    siteHeader('home'),
    main({ id: 'main', domId: 'main', class: 'home-main' }, content),
    siteFooter(),
  );

// Small building blocks shared by the hand-written pages and the recipe pages.
export const pageHero = ({ eyebrow, title, lead, actions }) =>
  section(
    { class: 'page-hero' },
    p({ class: 'doc-eyebrow' }, eyebrow),
    h1({ id: 'page-title', class: 'page-title' }, title),
    ...present(lead ? p({ class: 'page-lead' }, lead) : null, actions ? div({ class: 'page-actions' }, actions) : null),
  );

export const codeBlock = (codeText, language = 'js', label = language) =>
  div(
    { class: 'code-block' },
    div(
      { class: 'code-block-head' },
      div({ class: 'code-dots', 'aria-hidden': 'true' }, div({ class: 'code-dot code-dot-a' }), div({ class: 'code-dot code-dot-b' }), div({ class: 'code-dot code-dot-c' })),
      code({ class: 'code-language' }, label),
    ),
    pre({ class: 'code-body' }, code(null, codeText)),
  );

export const highlightedCodeBlock = (codeText, language = 'js', label = language) =>
  div(
    { class: 'code-block' },
    div(
      { class: 'code-block-head' },
      div({ class: 'code-dots', 'aria-hidden': 'true' }, div({ class: 'code-dot code-dot-a' }), div({ class: 'code-dot code-dot-b' }), div({ class: 'code-dot code-dot-c' })),
      code({ class: 'code-language' }, label),
    ),
    pre({ class: 'code-body' }, code(null, ...highlightCode(codeText, language))),
  );

export const infoCard = ({ title, children, href, label = 'Read more' }) =>
  article(
    { class: 'info-card' },
    h2({ class: 'info-card-title' }, title),
    children,
    ...present(href ? a({ href, class: 'card-link' }, label, span({ 'aria-hidden': 'true' }, ' →')) : null),
  );
