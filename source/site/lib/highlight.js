// A deliberately small highlighter for the documentation's code blocks. It never changes the text: it only wraps
// comments, strings, numbers and a short keyword list in spans, so the code stays copyable and the build stays
// dependency free.
import { span } from '@ehtb/agent-ui/spec';

const javascriptKeywords = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import', 'in', 'instanceof',
  'let', 'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
  'undefined', 'var', 'void', 'while', 'yield',
]);

const keywordSets = {
  js: javascriptKeywords,
  javascript: javascriptKeywords,
  mjs: javascriptKeywords,
  json: new Set(['true', 'false', 'null']),
  bash: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'function', 'if', 'in', 'then', 'while']),
  sh: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'in', 'then', 'while']),
  shell: new Set(['case', 'do', 'done', 'elif', 'else', 'esac', 'fi', 'for', 'in', 'then', 'while']),
  css: new Set(['important', 'from', 'to', 'var']),
};

const isWord = (character) => /[A-Za-z0-9_$-]/.test(character);

const pushText = (parts, text) => {
  if (!text) return;
  const last = parts[parts.length - 1];
  // Only plain text may grow: a span with a class is a finished token, and appending to it would paint the code that
  // follows as if it were part of that token.
  if (last && last.className === undefined) last.text += text;
  else parts.push({ text });
};

const pushSpan = (parts, className, text) => {
  parts.push({ className, text });
};

const scanQuoted = (code, start, quote) => {
  let index = start + 1;
  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2;
      continue;
    }
    if (code[index] === quote) return index + 1;
    index++;
  }
  return code.length;
};

const tokenize = (code, language) => {
  const parts = [];
  const keywords = keywordSets[language] ?? new Set();
  let index = 0;
  while (index < code.length) {
    const rest = code.slice(index);
    if (language !== 'json' && rest.startsWith('//')) {
      const end = code.indexOf('\n', index);
      const stop = end === -1 ? code.length : end;
      pushSpan(parts, 'tok-comment', code.slice(index, stop));
      index = stop;
      continue;
    }
    if (language !== 'json' && rest.startsWith('/*')) {
      const end = code.indexOf('*/', index + 2);
      const stop = end === -1 ? code.length : end + 2;
      pushSpan(parts, 'tok-comment', code.slice(index, stop));
      index = stop;
      continue;
    }
    const character = code[index];
    if (character === '"' || character === "'" || (character === '`' && language !== 'json')) {
      const stop = scanQuoted(code, index, character);
      pushSpan(parts, 'tok-string', code.slice(index, stop));
      index = stop;
      continue;
    }
    if (language === 'bash' || language === 'sh' || language === 'shell') {
      if (character === '#' && (index === 0 || /\s/.test(code[index - 1]))) {
        const end = code.indexOf('\n', index);
        const stop = end === -1 ? code.length : end;
        pushSpan(parts, 'tok-comment', code.slice(index, stop));
        index = stop;
        continue;
      }
    }
    if (language === 'css' && rest.startsWith('/*')) {
      const end = code.indexOf('*/', index + 2);
      const stop = end === -1 ? code.length : end + 2;
      pushSpan(parts, 'tok-comment', code.slice(index, stop));
      index = stop;
      continue;
    }
    if (/[0-9]/.test(character) && (index === 0 || !isWord(code[index - 1]))) {
      let stop = index + 1;
      while (stop < code.length && /[0-9a-fA-FxX._]/.test(code[stop])) stop++;
      pushSpan(parts, 'tok-number', code.slice(index, stop));
      index = stop;
      continue;
    }
    if (isWord(character)) {
      let stop = index + 1;
      while (stop < code.length && isWord(code[stop])) stop++;
      const word = code.slice(index, stop);
      if (keywords.has(word)) pushSpan(parts, 'tok-keyword', word);
      else if (language === 'css' && word.startsWith('--')) pushSpan(parts, 'tok-variable', word);
      else pushText(parts, word);
      index = stop;
      continue;
    }
    pushText(parts, character);
    index++;
  }
  return parts;
};

export const highlightCode = (code, language = 'text') => {
  const normalized = String(language ?? '').toLowerCase();
  if (['text', 'plain', '', 'output', 'console'].includes(normalized)) return [code];
  const parts = tokenize(code, normalized);
  return parts.map((part, index) =>
    part.text === undefined ? null : part.className ? span({ class: part.className }, part.text) : part.text,
  ).filter((part) => part !== null);
};
