// A small Markdown renderer that produces the agent-ui spec. The documentation in docs/ stays the source of truth:
// this module turns its headings, prose, lists, tables and fenced code into plain spec data at build time. It is
// intentionally not a full CommonMark implementation; it covers the forms the repository's documentation uses.
import {
  a, blockquote, code, div, em, h1, h2, h3, hr, img, li, ol, p, pre, strong, table, tbody, td, th,
  thead, tr, ul,
} from '@ehtb/agent-ui/spec';
import { docs, repository } from './docs-meta.js';
import { highlightCode } from './highlight.js';

const documentPaths = new Map(docs.filter((doc) => doc.source).map((doc) => [doc.source, doc.path]));
// The grammar has h1-h3; a deeper Markdown heading keeps its level for the table of contents but is drawn as an h3.
const headingBuilders = { 1: h1, 2: h2, 3: h3, 4: h3, 5: h3, 6: h3 };

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

const isExternal = (href) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);

// Path arithmetic for relative links, without node:path: this module is imported by a page view, and the build refuses a
// Node built-in in that graph. The documentation uses relative paths of one style, so these four functions are enough.
const normalizePath = (path) => {
  const parts = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/') || '.';
};
const dirnamePath = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const hasExtension = (path) => /\.[^./]+$/.test(path);
const joinPath = (directory, path) => normalizePath(directory ? `${directory}/${path}` : path);

export const resolveLink = (href, sourcePath = '') => {
  const raw = String(href ?? '').trim();
  if (!raw) return raw;
  if (raw.startsWith('#') || raw.startsWith('/') || isExternal(raw)) return raw;
  const [pathPart, hash = ''] = raw.split('#');
  const [cleanPath, query = ''] = pathPart.split('?');
  const target = joinPath(dirnamePath(sourcePath), cleanPath);
  const sitePath = documentPaths.get(target);
  if (sitePath) return `${sitePath}${hash ? `#${hash}` : ''}${query ? `?${query}` : ''}`;
  const suffix = `${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`;
  const looksLikeDirectory = !hasExtension(target);
  return `${repository}/${looksLikeDirectory ? 'tree' : 'blob'}/main/${target}${suffix}`;
};

const findClosing = (text, marker, from) => {
  let index = from;
  while (index < text.length) {
    if (text.startsWith('\\', index)) {
      index += 2;
      continue;
    }
    if (text.startsWith(marker, index)) return index;
    index++;
  }
  return -1;
};

const findMatching = (text, open, close, from) => {
  let depth = 1;
  let index = from;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
      continue;
    }
    if (text[index] === open) depth++;
    else if (text[index] === close) {
      depth--;
      if (depth === 0) return index;
    }
    index++;
  }
  return -1;
};

const parseInline = (text, sourcePath) => {
  const tokens = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      tokens.push({ type: 'text', text: decodeEntities(buffer) });
      buffer = '';
    }
  };
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '\\' && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }
    if (character === '`') {
      let run = 1;
      while (text[index + run] === '`') run++;
      const marker = '`'.repeat(run);
      const close = findClosing(text, marker, index + run);
      if (close !== -1) {
        flush();
        tokens.push({ type: 'code', text: text.slice(index + run, close).trim() });
        index = close + run;
        continue;
      }
    }
    if ((character === '*' || character === '_') && text[index + 1] !== undefined) {
      const strongMarker = `${character}${character}`;
      const marker = text.startsWith(strongMarker, index) ? strongMarker : character;
      const next = text[index + marker.length];
      const previous = text[index - 1];
      const allowedBoundary = character !== '_' || (!/[A-Za-z0-9]/.test(previous ?? '') && !/\s/.test(next ?? ''));
      if (allowedBoundary && next !== undefined && !/\s/.test(next)) {
        const close = findClosing(text, marker, index + marker.length);
        if (close !== -1 && close > index + marker.length) {
          flush();
          tokens.push({
            type: marker.length === 2 ? 'strong' : 'em',
            children: parseInline(text.slice(index + marker.length, close), sourcePath),
          });
          index = close + marker.length;
          continue;
        }
      }
    }
    if (character === '!' && text[index + 1] === '[') {
      const closeText = findMatching(text, '[', ']', index + 2);
      if (closeText !== -1 && text[closeText + 1] === '(') {
        const closeUrl = findMatching(text, '(', ')', closeText + 2);
        if (closeUrl !== -1) {
          flush();
          const alt = parseInline(text.slice(index + 2, closeText), sourcePath);
          tokens.push({
            type: 'image',
            src: resolveLink(text.slice(closeText + 2, closeUrl), sourcePath),
            alt: plainTokens(alt),
          });
          index = closeUrl + 1;
          continue;
        }
      }
    }
    if (character === '[') {
      const closeText = findMatching(text, '[', ']', index + 1);
      if (closeText !== -1 && text[closeText + 1] === '(') {
        const closeUrl = findMatching(text, '(', ')', closeText + 2);
        if (closeUrl !== -1) {
          flush();
          tokens.push({
            type: 'link',
            href: resolveLink(text.slice(closeText + 2, closeUrl), sourcePath),
            children: parseInline(text.slice(index + 1, closeText), sourcePath),
          });
          index = closeUrl + 1;
          continue;
        }
      }
    }
    if (character === '<') {
      const close = text.indexOf('>', index + 1);
      if (close !== -1) {
        const target = text.slice(index + 1, close);
        if (/^(?:https?:\/\/|mailto:)/.test(target)) {
          flush();
          tokens.push({ type: 'link', href: target, children: [{ type: 'text', text: target.replace(/^mailto:/, '') }] });
          index = close + 1;
          continue;
        }
      }
    }
    buffer += character;
    index++;
  }
  flush();
  return tokens;
};

const plainTokens = (tokens) =>
  tokens
    .map((token) => {
      if (token.type === 'text' || token.type === 'code') return token.text;
      if (token.type === 'image') return token.alt;
      return plainTokens(token.children ?? []);
    })
    .join('');

const inlineNodes = (tokens) =>
  tokens.map((token) => {
    if (token.type === 'text') return token.text;
    if (token.type === 'code') return code({ class: 'inline-code' }, token.text);
    if (token.type === 'strong') return strong(null, ...inlineNodes(token.children));
    if (token.type === 'em') return em(null, ...inlineNodes(token.children));
    if (token.type === 'image') return img({ src: token.src, alt: token.alt, loading: 'lazy' });
    if (token.type === 'link') {
      const external = isExternal(token.href);
      return a(
        { href: token.href, ...(external ? { target: '_blank', rel: 'noreferrer' } : {}) },
        ...inlineNodes(token.children),
      );
    }
    return '';
  });

export const renderInline = (text, sourcePath = '') => inlineNodes(parseInline(text, sourcePath));
export const plainInline = (text, sourcePath = '') => plainTokens(parseInline(text, sourcePath));

const slugify = (text) => {
  const base = plainInline(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || 'section';
};

const uniqueId = (slug, used) => {
  const count = (used.get(slug) ?? 0) + 1;
  used.set(slug, count);
  return count === 1 ? slug : `${slug}-${count}`;
};

const isBlank = (line) => line.trim() === '';
const leadingSpaces = (line) => (line.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '  ').length;

const isFence = (line) => /^\s*(`{3,}|~{3,})/.test(line);

const listEntry = (line) => {
  const unordered = line.match(/^(\s*)([-+*])(\s+)(.*)$/);
  if (unordered) return { indent: leadingSpaces(unordered[1]), ordered: false, text: unordered[4] };
  const ordered = line.match(/^(\s*)(\d+)[.)](\s+)(.*)$/);
  if (ordered) return { indent: leadingSpaces(ordered[1]), ordered: true, text: ordered[4] };
  return null;
};

const headingMatch = (line) => line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);

const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const isTableStart = (lines, index) =>
  lines[index]?.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]);

const startsBlock = (lines, index) => {
  const line = lines[index];
  return Boolean(
    isFence(line) ||
      headingMatch(line) ||
      /^ {0,3}>/.test(line) ||
      listEntry(line) ||
      /^ {0,3}(?:[-*_])(?:\s*\1){2,}\s*$/.test(line) ||
      isTableStart(lines, index),
  );
};

const splitTableRow = (line) => {
  let source = line.trim();
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|')) source = source.slice(0, -1);
  const cells = [];
  let current = '';
  let inCode = false;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '`') inCode = !inCode;
    if (character === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return cells;
};

const parseList = (lines, start, sourcePath) => {
  const entries = [];
  let index = start;
  let last = null;
  let baseIndent = null;
  let orderedType = null;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      let look = index + 1;
      while (look < lines.length && isBlank(lines[look])) look++;
      if (look >= lines.length) break;
      if (listEntry(lines[look]) || leadingSpaces(lines[look]) > (baseIndent ?? 0)) {
        index = look;
        continue;
      }
      break;
    }
    const entry = listEntry(line);
    if (entry) {
      baseIndent ??= entry.indent;
      orderedType ??= entry.ordered;
      if (entry.indent < baseIndent) break;
      if (entry.indent === baseIndent && entry.ordered !== orderedType) break;
      entries.push({ ...entry, text: entry.text });
      last = entries[entries.length - 1];
      index++;
      continue;
    }
    if (last && leadingSpaces(line) > (baseIndent ?? 0)) {
      last.text += ` ${line.trim()}`;
      index++;
      continue;
    }
    break;
  }
  if (!entries.length) return null;
  const buildLevel = (entryIndex, indent) => {
    const ordered = entries[entryIndex].ordered;
    const items = [];
    let current = entryIndex;
    while (current < entries.length && entries[current].indent === indent && entries[current].ordered === ordered) {
      const entry = entries[current];
      current++;
      const children = renderInline(entry.text, sourcePath);
      if (current < entries.length && entries[current].indent > indent) {
        const nested = buildLevel(current, entries[current].indent);
        children.push(nested.node);
        current = nested.next;
      }
      items.push(li(null, ...children));
    }
    return { node: ordered ? ol(null, ...items) : ul(null, ...items), next: current };
  };
  return { node: buildLevel(0, entries[0].indent).node, next: index };
};

const parseTable = (lines, start, sourcePath) => {
  const header = splitTableRow(lines[start]);
  const rows = [];
  let index = start + 2;
  while (index < lines.length && !isBlank(lines[index]) && lines[index].includes('|')) {
    rows.push(splitTableRow(lines[index]));
    index++;
  }
  const headRow = tr(null, ...header.map((cell) => th(null, ...renderInline(cell, sourcePath))));
  const bodyRows = rows.map((row) => tr(null, ...row.map((cell) => td(null, ...renderInline(cell, sourcePath)))));
  return {
    node: div({ class: 'table-wrap' }, table(null, thead(null, headRow), tbody(null, ...bodyRows))),
    next: index,
  };
};

const parseBlockquote = (lines, start, sourcePath) => {
  const quoted = [];
  let index = start;
  while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
    quoted.push(lines[index].replace(/^ {0,3}>\s?/, ''));
    index++;
  }
  const parsed = parseBlocks(quoted, sourcePath);
  return { node: blockquote(null, ...parsed.nodes), next: index };
};

const parseFence = (lines, start) => {
  const opening = lines[start].match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
  const marker = opening ? opening[1] : '```';
  const character = marker[0];
  const language = opening?.[2] ?? '';
  const codeLines = [];
  let index = start + 1;
  while (index < lines.length) {
    const close = lines[index].match(/^\s*(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === character && close[1].length >= marker.length) {
      index++;
      break;
    }
    codeLines.push(lines[index]);
    index++;
  }
  const text = codeLines.join('\n');
  const block = div(
    { class: 'code-block' },
    div(
      { class: 'code-block-head' },
      div({ class: 'code-dots', 'aria-hidden': 'true' }, spanDot('a'), spanDot('b'), spanDot('c')),
      ...(language ? [code({ class: 'code-language' }, language)] : []),
    ),
    pre({ class: 'code-body' }, code(null, ...highlightCode(text, language))),
  );
  return { node: block, next: index, code: text, language };
};

const spanDot = (name) => div({ class: `code-dot code-dot-${name}` });

const parseHeading = (lines, index, sourcePath, used, headings) => {
  const match = headingMatch(lines[index]);
  const level = match[1].length;
  const text = match[2];
  const plain = plainInline(text, sourcePath);
  if (level === 1 && headings.title === null) {
    headings.title = plain;
    return { node: null, next: index + 1 };
  }
  const id = uniqueId(slugify(text), used);
  headings.list.push({ level, text: plain, id });
  const Builder = headingBuilders[level];
  const anchor = a(
    { class: 'heading-anchor', href: `#${id}`, 'aria-label': `Link to ${plain}` },
    '#',
  );
  return {
    node: Builder(
      { id: `heading-${id}`, domId: id, class: 'doc-heading' },
      ...renderInline(text, sourcePath),
      anchor,
    ),
    next: index + 1,
  };
};

const parseBlocks = (lines, sourcePath) => {
  const nodes = [];
  const headings = { title: null, list: [] };
  const used = new Map();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) {
      index++;
      continue;
    }
    if (isFence(line)) {
      const parsed = parseFence(lines, index);
      nodes.push(parsed.node);
      index = parsed.next;
      continue;
    }
    const heading = headingMatch(line);
    if (heading) {
      const parsed = parseHeading(lines, index, sourcePath, used, headings);
      if (parsed.node) nodes.push(parsed.node);
      index = parsed.next;
      continue;
    }
    if (/^ {0,3}(?:[-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      nodes.push(hr(null));
      index++;
      continue;
    }
    if (/^ {0,3}>/.test(line)) {
      const parsed = parseBlockquote(lines, index, sourcePath);
      nodes.push(parsed.node);
      index = parsed.next;
      continue;
    }
    if (listEntry(line)) {
      const parsed = parseList(lines, index, sourcePath);
      if (parsed) {
        nodes.push(parsed.node);
        index = parsed.next;
        continue;
      }
    }
    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index, sourcePath);
      nodes.push(parsed.node);
      index = parsed.next;
      continue;
    }
    const paragraph = [];
    while (index < lines.length && !isBlank(lines[index]) && (paragraph.length === 0 || !startsBlock(lines, index))) {
      paragraph.push(lines[index].trim());
      index++;
    }
    if (paragraph.length) nodes.push(p(null, ...renderInline(paragraph.join(' '), sourcePath)));
  }
  return { nodes, headings };
};

export const renderMarkdown = (markdown, { sourcePath = '' } = {}) => {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
  const parsed = parseBlocks(lines, sourcePath);
  return {
    title: parsed.headings.title,
    nodes: parsed.nodes,
    headings: parsed.headings.list,
  };
};
