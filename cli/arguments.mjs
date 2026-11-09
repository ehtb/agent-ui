// Command line options, checked. Each command lists the options it accepts:
//
//   parseArguments(argv, { dev: 'flag', out: 'text', port: 'number', validator: ['include', 'omit'] }, { command: 'build' })
//
// `--name=value` gives { name: 'value' } (a number option gives a Number), a bare `--flag` gives { flag: true }, and
// anything without "--" is collected in `_`. Mistakes throw a UsageError that names the command and the option and says
// what is accepted: an unknown option (with "Did you mean"), a missing or wrong kind of value, a value outside a choice list.
import { didYouMean } from '../src/messages.js';

export class UsageError extends Error {}

export const parseArguments = (argv, accepted = {}, { command = 'agent-ui', positional = false } = {}) => {
  const options = { _: [] };
  const names = Object.keys(accepted);
  const usage = `Options: ${names.length ? names.map((name) => `--${name}${accepted[name] === 'flag' ? '' : '=<value>'}`).join(' ') : 'none'}`;
  for (const argument of argv) {
    if (!argument.startsWith('--')) {
      if (!positional) throw new UsageError(`${command}: unexpected argument "${argument}". ${usage}`);
      options._.push(argument);
      continue;
    }
    const [name, ...rest] = argument.slice(2).split('=');
    const value = rest.join('=');
    const hasValue = rest.length > 0;
    const kind = Object.hasOwn(accepted, name) ? accepted[name] : undefined;
    if (kind === undefined) throw new UsageError(`${command}: unknown option --${name}. ${didYouMean(name, names).replace(/"([^"]+)"/, '--$1')}${usage}`);
    if (kind === 'flag') {
      if (hasValue) throw new UsageError(`${command}: --${name} takes no value. Write --${name}`);
      options[name] = true;
    } else if (!hasValue || value === '') {
      throw new UsageError(`${command}: --${name} needs a value. Write --${name}=<value>`);
    } else if (kind === 'number') {
      if (!/^\d+$/.test(value)) throw new UsageError(`${command}: --${name} must be a whole number, got "${value}". Write for example --${name}=8080`);
      options[name] = Number(value);
    } else if (Array.isArray(kind)) {
      if (!kind.includes(value)) throw new UsageError(`${command}: --${name} must be one of ${kind.join(', ')}, got "${value}". ${didYouMean(value, kind)}`.trim());
      options[name] = value;
    } else {
      options[name] = value;
    }
  }
  return options;
};

// A port a server can listen on: a whole number from 1 to 65535 (0 is the operating system's "pick one", which only a library
// call such as startDev({ port: 0 }) asks for; a command line that wrote it would print a port nobody chose).
const MIN_PORT = 1;
const MAX_PORT = 65535;
const checkPort = (port, source, written) => {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    const fix = source === 'PORT' ? 'Write PORT=8080, or pass --port=<number>' : 'Write --port=8080';
    throw new UsageError(`${source} must be a whole number from ${MIN_PORT} to ${MAX_PORT}, got ${written}. ${fix}`);
  }
  return port;
};

// The port a listening command uses, in this order: --port, the PORT environment variable, 8080. An empty PORT counts as unset (a
// container that does not care passes nothing); anything that is not a port is a usage error, so a misspelt PORT fails at start
// instead of quietly listening on 8080.
export const portFromOptions = (options, { fallback = 8080 } = {}) => {
  if (options.port !== undefined) return checkPort(options.port, '--port', String(options.port));
  const value = process.env.PORT;
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new UsageError(`PORT must be a whole number from ${MIN_PORT} to ${MAX_PORT}, got "${value}". Write PORT=8080, or pass --port=<number>`);
  return checkPort(Number(value), 'PORT', `"${value}"`);
};

// For a command's main: the port from its options and the environment, or a usage problem printed on one line and exit code 2.
export const portOrExit = (options, settings = {}) => {
  try {
    return portFromOptions(options, settings);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${settings.command ?? 'agent-ui'}: ${error.message}`);
    process.exit(2);
  }
};

// For the command line tools: print a usage problem as one line and stop with exit code 2.
export const parseOrExit = (argv, accepted, settings) => {
  try {
    return parseArguments(argv, accepted, settings);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    process.exit(2);
  }
};
