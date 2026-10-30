// Source maps (version 3) for the chunks the bundler writes. The output keeps one line for every line of the source module it came
// from (imports and exports become blank lines, comments and indentation go but their lines stay), so a map says for each output line
// which file and line it came from. A line is as exact as a map needs to be for a debugger and a stack trace; there are no columns,
// because the output does not rename or reflow anything.
//
//   createSourceMap({ file, lines, sources }) -> the map as an object
//     file     the name of the generated file
//     lines    one entry per output line: { path, line } (line counts from 1) or null for a line the bundler wrote itself
//     sources  path -> { text, file } for every path that `lines` names; `file` is the path as it is written in the map

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
