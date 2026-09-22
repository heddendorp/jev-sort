import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { jevSort } from "../src/index.js";
import type { SortProgress } from "../src/index.js";

// Explicitly opt-in: this makes a small number of paid TypeSafe API calls.
const input = [5, 1, 8, 3, 2, 7, 4, 6];
let usage: Readonly<SortProgress> | undefined;
const started = performance.now();
const result = await jevSort(input, "Sort the numbers from smallest to largest", {
  context: "Use ordinary numeric ascending order.",
  // Exercise both batching within a request and parallel requests against the real API.
  batchSize: 2,
  concurrency: 2,
  maxComparisons: 24,
  signal: AbortSignal.timeout(60_000),
  onProgress: (progress) => { usage = progress; },
});
assert.deepEqual(result, input.toSorted((a, b) => a - b));
assert.deepEqual(input, [5, 1, 8, 3, 2, 7, 4, 6]);
console.log(JSON.stringify({ passed: true, elapsedMs: Math.round(performance.now() - started), result, ...usage }, null, 2));
