// Stands in for `@ec-ts/twoslash` in the code worker when twoslash runs natively (TWOSLASH=douze, see code-worker.mjs):
// the Expressive Code twoslash plugin gets the results that Douze's `twoslash` step computed with TypeScript 7 and
// wrote in the `data-twoslash` attribute of each fence, instead of compiling the snippets with TypeScript in Node.
//
// The worker adds the result of every fence of a page before rendering it; the plugin's twoslasher looks it up by
// its code. The plugin receives the code as Expressive Code normalized it (trailing spaces and the blank lines around
// it removed), which is the code the step checked (`trim: true`): both are keyed after the same normalization.

/** @type {Map<string, string>} */
const results = new Map();

const normalize = (code) => code.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');

/** Records the result (JSON) of the step for a fence's code. */
export function addTwoslashResult(code, json) {
  results.set(normalize(code), json);
}

/** The result of the step for a fence's code, or undefined. */
export function getTwoslashResult(code) {
  return results.get(normalize(code));
}

/** `@ec-ts/twoslash`'s entry point: a twoslasher that returns the step's results. */
export function createTwoslasher() {
  return (code) => {
    const json = getTwoslashResult(code);
    if (json === undefined) {
      throw new Error(`the twoslash step wrote no result for this fence (${code.split('\n', 1)[0].slice(0, 60)})`);
    }
    // A new object every time: the plugin changes the nodes it renders.
    return JSON.parse(json);
  };
}
