export interface DecodedError {
  code: string;
  /** The details of the error. A wrapper's `cause` is replaced by the decoded sentence of the error it wrapped (a copy: the input is not changed), so it is text for a person here. */
  details: Record<string, unknown> | null;
  /** What the code means, in a few words (null for a code this version does not know). */
  title: string | null;
  /** The sentence the development build would have thrown: what is wrong and how to fix it (null when the code or the details are not known). */
  text: string | null;
}
/** Reads an error reported by agent-ui: an Error with .code and .details, or the message "AUI0103 {...}" of a production build. Null when it is not one. */
export function decodeError(error: unknown): DecodedError | null;
/** The sentence for a code and its details, or null for an unknown code. */
export function describeError(code: string, details?: Record<string, unknown>, context?: Record<string, unknown>): string | null;
export const MESSAGES: Record<string, { title: string; text: (details: any, context?: any) => string }>;
export function describeUnknownKey(namespace: string, name: string, namespaceNames?: string[], knownKeys?: string[]): string;
