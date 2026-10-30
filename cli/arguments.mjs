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
