// Source maps (version 3) for the chunks the bundler writes. The output keeps one line for every line of the source module it came
// from (imports and exports become blank lines, comments and indentation go but their lines stay), so a map says for each output line
// which file and line it came from. A line is as exact as a map needs to be for a debugger and a stack trace; there are no columns,
// because the output does not rename or reflow anything. A minifier plugged in with `transform` does reflow it, and returns its own map;
// composeSourceMap follows each of its positions through the bundler's lines to the source file.
//
//   createSourceMap({ file, lines, sources }) -> the map as an object
//     file     the name of the generated file
//     lines    one entry per output line: { path, line } (line counts from 1) or null for a line the bundler wrote itself
//     sources  path -> { text, file } for every path that `lines` names; `file` is the path as it is written in the map
//
//   composeSourceMap({ file, lines, sources, map }) -> the map of a chunk that a `transform` (a minifier) rewrote
//     map    the minifier's own map: from its output (the file written) to its input (the chunk the bundler wrote)
//     lines  as above, for the minifier's input
//   Every position of the minified file (a line holds many statements) is mapped to the start of its source line: the bundler takes
//   `export` and indentation out of a line, so a column of its output is not a column of the source.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// One number as a base64 variable-length quantity: 5 bits per character, the lowest bit of the first one is the sign.
export const encodeVlq = (number) => {
  let rest = number < 0 ? (-number << 1) | 1 : number << 1;
  let text = '';
  do {
    let digit = rest & 31;
    rest >>>= 5;
    if (rest > 0) digit |= 32;
    text += BASE64[digit];
  } while (rest > 0);
  return text;
};

// The opposite of encodeVlq, for every number of one segment.
const decodeSegment = (text, where) => {
  const numbers = [];
  let value = 0;
  let shift = 0;
  for (const character of text) {
    const digit = BASE64.indexOf(character);
    if (digit < 0) throw new Error(`${where}: "${character}" is not a base64 character of a source map`);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      numbers.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return numbers;
};

// The segments of a map, with absolute numbers: one list per generated line of [column, source, line, column, name?] or [column].
export const decodeMappings = (mappings, where = 'source map') => {
  const state = [0, 0, 0, 0, 0]; // source, line, column and name carry over between lines; the generated column does not
  return mappings.split(';').map((lineText) => {
    let generatedColumn = 0;
    return lineText.split(',').filter(Boolean).map((segmentText) => {
      const numbers = decodeSegment(segmentText, where);
      generatedColumn += numbers[0];
      if (numbers.length === 1) return [generatedColumn];
      for (let index = 1; index < numbers.length; index++) state[index - 1] += numbers[index];
      return numbers.length === 5 ? [generatedColumn, state[0], state[1], state[2], state[3]] : [generatedColumn, state[0], state[1], state[2]];
    });
  });
};

const encodeMappings = (segmentLines) => {
  const previous = [0, 0, 0, 0];
  return segmentLines
    .map((segments) => {
      let previousColumn = 0;
      return segments
        .map((segment) => {
          let text = encodeVlq(segment[0] - previousColumn);
          previousColumn = segment[0];
          for (let index = 1; index < segment.length; index++) {
            text += encodeVlq(segment[index] - previous[index - 1]);
            previous[index - 1] = segment[index];
          }
          return text;
        })
        .join(',');
    })
    .join(';');
};

export const composeSourceMap = ({ file, lines, sources, map }) => {
  const names = [...new Set(lines.filter(Boolean).map(({ path }) => path))];
  const symbolNames = [];
  const segmentLines = decodeMappings(map.mappings, `the source map of ${file}`).map((segments) =>
    segments.flatMap((segment) => {
      const origin = segment.length > 1 ? lines[segment[2]] : null;
      if (!origin) return []; // a line the bundler wrote itself (imports, the module wrapper) or a position the minifier did not map
      const composed = [segment[0], names.indexOf(origin.path), origin.line - 1, 0];
      if (segment.length === 5 && Array.isArray(map.names) && typeof map.names[segment[4]] === 'string') {
        // Names are kept by the bundler, so a name of the minifier's input is the name in the source.
        const name = map.names[segment[4]];
        if (!symbolNames.includes(name)) symbolNames.push(name);
        composed.push(symbolNames.indexOf(name));
      }
      return [composed];
    }),
  );
  return {
    version: 3,
    file,
    sources: names.map((path) => sources[path].file),
    sourcesContent: names.map((path) => sources[path].text),
    names: symbolNames,
    mappings: encodeMappings(segmentLines),
  };
};

export const createSourceMap = ({ file, lines, sources }) => {
  const names = [...new Set(lines.filter(Boolean).map(({ path }) => path))];
  let previousSource = 0;
  let previousLine = 0;
  const mappings = lines.map((origin) => {
    if (!origin) return '';
    const source = names.indexOf(origin.path);
    const line = origin.line - 1;
    // generated column 0, the source, its line, and column 0 of that line; every field after the first is relative to the last one written
    const segment = encodeVlq(0) + encodeVlq(source - previousSource) + encodeVlq(line - previousLine) + encodeVlq(0);
    previousSource = source;
    previousLine = line;
    return segment;
  });
  return {
    version: 3,
    file,
    sources: names.map((path) => sources[path].file),
    sourcesContent: names.map((path) => sources[path].text),
    names: [],
    mappings: mappings.join(';'),
  };
};
