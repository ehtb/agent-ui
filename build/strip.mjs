// Safe size reduction for the build output, with no dependencies: comments and layout whitespace are removed, names
// are untouched (the output stays greppable and stack traces stay meaningful). For identifier mangling, plug a real
// minifier into the `transform` hook of build.config.mjs.
//
// stripJavaScript is a small scanner, not a parser. It knows strings, template literals (including ${} nesting),
// regular expression literals and comments, which is all that is needed to remove comments and indentation without
// changing meaning. Newlines are kept, so automatic semicolon insertion behaves exactly as before.

const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await']);
const REGEX_AFTER_CHARACTERS = '(,=:[!&|?{};+-*%<>~^';

// `keepLines` leaves every line where it was (empty if it held only a comment) instead of dropping empty lines, so that the output
// has the lines of the input and a source map can say which is which (build/source-map.mjs).
export const stripJavaScript = (code, { keepLines = false } = {}) => {
  let out = '';
  let index = 0;
  const templateDepths = []; // brace depth at which a `${` opened inside a template literal
  let braceDepth = 0;

  const lastSignificant = () => {
    const trimmed = out.trimEnd();
    return trimmed;
  };
  const regexAllowed = () => {
    const before = lastSignificant();
    if (!before) return true;
    const character = before[before.length - 1];
    // A run of exactly two signs is a postfix operator (`a++ / b` divides); three end in a binary one (`a+++ /x/` starts a regex).
    if ((character === '+' || character === '-') && before.match(/([+-])\1*$/)[0].length === 2) return false;
    if (REGEX_AFTER_CHARACTERS.includes(character)) return true;
    const word = before.match(/[A-Za-z_$][\w$]*$/);
    // A property of that name (`bounds.in / 2`) is a value: the division stays one.
    return Boolean(word) && REGEX_AFTER_WORDS.has(word[0]) && before[before.length - word[0].length - 1] !== '.';
  };
  const endLine = (lines = 1) => {
    out = out.replace(/[ \t]+$/, '');
    if (keepLines) out += '\n'.repeat(lines);
    else if (out && !out.endsWith('\n')) out += '\n';
    while (code[index] === ' ' || code[index] === '\t') index++; // drop indentation
  };
  const copyString = (quote) => {
    out += code[index++];
    while (index < code.length && code[index] !== quote) {
      if (code[index] === '\\') out += code[index++];
      out += code[index++];
    }
    out += code[index++] ?? '';
  };
  // Template literal text, verbatim, up to the closing backtick or the next `${`.
  const copyTemplateText = () => {
    while (index < code.length) {
      const character = code[index];
      if (character === '\\') {
        out += code[index++];
        out += code[index++] ?? '';
      } else if (character === '`') {
        out += code[index++];
        return;
      } else if (character === '$' && code[index + 1] === '{') {
        out += '${';
        index += 2;
        templateDepths.push(braceDepth);
        braceDepth++;
        return;
      } else {
        out += code[index++];
      }
    }
  };
  const copyRegex = () => {
    out += code[index++];
    let inClass = false;
    while (index < code.length && code[index] !== '\n' && (code[index] !== '/' || inClass)) {
      if (code[index] === '\\') out += code[index++];
      else if (code[index] === '[') inClass = true;
      else if (code[index] === ']') inClass = false;
      out += code[index++];
    }
    out += code[index++] ?? '';
    while (/[a-z]/i.test(code[index] ?? '')) out += code[index++]; // flags
  };

  while (index < code.length) {
    const character = code[index];
    const next = code[index + 1];
    if (character === '/' && next === '/') {
      while (index < code.length && code[index] !== '\n') index++;
    } else if (character === '/' && next === '*') {
      const end = code.indexOf('*/', index + 2);
      const comment = code.slice(index, end < 0 ? code.length : end + 2);
      index += comment.length;
      if (comment.includes('\n')) endLine(comment.split('\n').length - 1);
      else if (!out || out.endsWith('\n')) while (code[index] === ' ' || code[index] === '\t') index++; // comment led the line
      else if (!/[\s({[,;]$/.test(out)) out += ' ';
    } else if (character === '\n') {
      index++;
      endLine();
    } else if (character === '"' || character === "'") {
      copyString(character);
    } else if (character === '`') {
      out += code[index++];
      copyTemplateText();
    } else if (character === '/' && regexAllowed()) {
      copyRegex();
    } else if (character === '{') {
      braceDepth++;
      out += code[index++];
    } else if (character === '}') {
      braceDepth--;
      out += code[index++];
      if (templateDepths.length && templateDepths[templateDepths.length - 1] === braceDepth) {
        templateDepths.pop();
        copyTemplateText(); // back inside the template literal
      }
    } else {
      out += code[index++];
    }
  }
  if (keepLines) return out.replace(/[ \t]+$/gm, '').trimEnd() + '\n';
  return out.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim() + '\n';
};

// Conservative CSS reduction: comments out, whitespace runs collapsed, spaces around { } ; , removed.
// Strings are left exactly as written; selectors and values are never rewritten.
export const stripCss = (css) => {
  const parts = [];
  let index = 0;
  let text = '';
  const flush = () => {
    parts.push(
      text
        .replace(/\s+/g, ' ')
        .replace(/ ?([{};,]) ?/g, '$1')
        .replace(/;}/g, '}'),
    );
    text = '';
  };
  while (index < css.length) {
    const character = css[index];
    if (character === '/' && css[index + 1] === '*') {
      const end = css.indexOf('*/', index + 2);
      index = end < 0 ? css.length : end + 2;
      text += ' ';
    } else if (character === '"' || character === "'") {
      flush();
      let string = css[index++];
      while (index < css.length && css[index] !== character) {
        if (css[index] === '\\') string += css[index++];
        string += css[index++];
      }
      parts.push(string + (css[index++] ?? ''));
    } else {
      text += css[index++];
    }
  }
  flush();
  return parts.join('').trim() + '\n';
};

// Same length as `code`, with the inside of comments, strings, template text and regular expression literals replaced by
// spaces (newlines kept), so a pattern search on the result only sees real code and offsets still match the original.
// Code inside `${ }` of a template literal is real code and stays.
export const maskNonCode = (code) => {
  const out = code.split('');
  const blank = (from, to) => {
    for (let at = from; at < to; at++) if (code[at] !== '\n') out[at] = ' ';
  };
  const templateDepths = [];
  let braceDepth = 0;
  let previous = ''; // last significant character or word of real code
  const regexAllowed = () => previous !== '++' && previous !== '--' && (!previous || REGEX_AFTER_CHARACTERS.includes(previous[previous.length - 1]) && !/[\w$]$/.test(previous) || REGEX_AFTER_WORDS.has(previous));
  let index = 0;
  const readTemplateText = () => {
    const start = index;
    while (index < code.length && code[index] !== '`') {
      if (code[index] === '\\') index += 2;
      else if (code[index] === '$' && code[index + 1] === '{') {
        blank(start, index);
        index += 2;
        templateDepths.push(braceDepth++);
        previous = '{';
        return;
      } else index++;
    }
    blank(start, index);
    index++; // closing backtick
    previous = '`';
  };
  while (index < code.length) {
    const character = code[index];
    if (character === '/' && code[index + 1] === '/') {
      const end = code.indexOf('\n', index);
      const stop = end === -1 ? code.length : end;
      blank(index, stop);
      index = stop;
    } else if (character === '/' && code[index + 1] === '*') {
      const end = code.indexOf('*/', index + 2);
      const stop = end === -1 ? code.length : end + 2;
      blank(index, stop);
      index = stop;
    } else if (character === '"' || character === "'") {
      const start = ++index;
      while (index < code.length && code[index] !== character && code[index] !== '\n') index += code[index] === '\\' ? 2 : 1;
      blank(start, index);
      index++;
      previous = character;
    } else if (character === '`') {
      index++;
      readTemplateText();
    } else if (character === '/' && regexAllowed()) {
      const start = ++index;
      let inClass = false;
      while (index < code.length && code[index] !== '\n' && (inClass || code[index] !== '/')) {
        if (code[index] === '\\') index++;
        else if (code[index] === '[') inClass = true;
        else if (code[index] === ']') inClass = false;
        index++;
      }
      blank(start, index);
      index++;
      previous = '/';
    } else if (character === '{') {
      braceDepth++;
      previous = character;
      index++;
    } else if (character === '}') {
      braceDepth--;
      index++;
      if (templateDepths.length && templateDepths[templateDepths.length - 1] === braceDepth) {
        templateDepths.pop();
        readTemplateText();
      } else previous = '}';
    } else if (/[A-Za-z_$]/.test(character)) {
      const word = code.slice(index).match(/^[\w$]+/)[0];
      previous = previous === '.' ? 'property' : word; // `bounds.in / 2` divides: a word after a dot is a property name
      index += word.length;
    } else {
      if (!/\s/.test(character)) previous = (character === '+' || character === '-') && previous === character && code[index - 1] === character ? character + character : character; // `a++ / b` divides
      index++;
    }
  }
  return out.join('');
};
