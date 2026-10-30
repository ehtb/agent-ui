// The wording every checker in the framework shares, so that an error always has the same shape: WHERE it is, WHAT is wrong,
// HOW to fix it ("route #2 "event": unknown key "vew". Did you mean "view"? Allowed keys: ..."). Pure functions, no Node.

// Edits needed to turn one word into the other: insert, delete, replace, or swap two neighbours ("itme" -> "item" is one).
const editDistance = (first, second) => {
  const table = Array.from({ length: first.length + 1 }, (_, i) => Array.from({ length: second.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= first.length; i++) {
    for (let j = 1; j <= second.length; j++) {
      const same = first[i - 1] === second[j - 1] ? 0 : 1;
      table[i][j] = Math.min(table[i - 1][j] + 1, table[i][j - 1] + 1, table[i - 1][j - 1] + same);
      if (i > 1 && j > 1 && first[i - 1] === second[j - 2] && first[i - 2] === second[j - 1]) table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
    }
  }
  return table[first.length][second.length];
};

// [candidate, distance] for the candidate closest to `word`, or null when there are no candidates.
export const closest = (word, candidates) => {
  const ranked = candidates.map((candidate) => [candidate, editDistance(String(word), String(candidate))]).sort((first, second) => first[1] - second[1]);
  return ranked[0] ?? null;
};

// 'Did you mean "view"? ' when something in `candidates` is a near miss for `word`, otherwise ''. Ends with a space, so it
// can be put in front of the next sentence.
export const didYouMean = (word, candidates, maximumDistance = 3) => {
  const best = closest(word, candidates);
  return best && best[1] <= maximumDistance ? `Did you mean "${best[0]}"? ` : '';
};

// The text of an error: "<where>: <what is wrong>. <how to fix it>". Every checker builds its messages with this (or with fail).
export const problem = (where, what, fix) => `${where}: ${what}. ${fix}`;

// Throws it.
export const fail = (where, what, fix) => {
  throw new Error(problem(where, what, fix));
};

// Two owners for one state key (`owns` of a resource, or of any plugin that calls api.watch with `owns`).
export const failOwnedTwice = (where, key, otherWhere) =>
  fail(where, `state key "${key}" is already owned by ${otherWhere}`, 'Give each resource its own state keys, or remove the duplicate from "owns"');
