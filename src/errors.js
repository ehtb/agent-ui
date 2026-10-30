// How the runtime makes an error: a code, small plain details, and a message. In development the message is the sentence of the
// catalogue (src/error-messages.js); in a production build the catalogue is a stub, and the message is the code and its details,
// "AUI0103 {...}", which a monitoring tool can group by and src/error-messages.js decodes later. `context` is extra data for the
// sentence (the names that exist, for a "did you mean"); it is never part of the details.
import { describeError } from './error-messages.js';

export const errorText = (code, details, context) => describeError(code, details, context) ?? `${code} ${JSON.stringify(details)}`;

export const codedError = (code, details, context) => Object.assign(new Error(errorText(code, details, context)), { code, details });
