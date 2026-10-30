/** [candidate, distance] for the candidate closest to `word`, or null when there are no candidates. */
export function closest(word: string, candidates: string[]): [string, number] | null;
/** 'Did you mean "view"? ' (with a trailing space) when a candidate is a near miss for `word`, otherwise ''. */
export function didYouMean(word: string, candidates: string[], maximumDistance?: number): string;
/** Throws "<where>: <problem>. <fix>": the one shape every error of the framework and of its packages has. */
export function fail(where: string, problem: string, fix: string): never;
/** "<where>: <what>. <fix>" as a string, for a message that is collected and not thrown. */
export function problem(where: string, what: string, fix: string): string;
export function failOwnedTwice(where: string, key: string, otherWhere: string): never;
