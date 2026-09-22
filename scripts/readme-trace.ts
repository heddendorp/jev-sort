import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { jevSort } from "../src/index.js";
import { network } from "../src/network.js";
import { mockClient } from "../test/mock.js";

// The animation uses the real network schedule with deterministic numeric judgments.
// It never calls the live API, and its playback duration is not a latency measurement.
const input = [5, 1, 8, 3, 2, 7, 4, 6];
const values = input.map((value, index) => ({ value, index }));
const seen = new Set<string>();
const stages = [];
for (const wires of network(input.length)) {
  const before = values.map((item) => item.value);
  const pairs = wires.map(({ left, right, ascending }) => {
    const a = values[left]!;
    const b = values[right]!;
    const id = `p_${Math.min(a.index, b.index)}_${Math.max(a.index, b.index)}`;
    const cached = seen.has(id);
    seen.add(id);
    const swap = ascending ? a.value > b.value : a.value < b.value;
    return { left, right, ascending, a: a.value, b: b.value, cached, swap };
  });
  for (const { left, right, swap } of pairs) {
    if (swap) [values[left], values[right]] = [values[right]!, values[left]!];
  }
  stages.push({ before, after: values.map((item) => item.value), pairs });
}

const mock = mockClient();
const actual = await jevSort(input, "Ascending", { client: mock.client, batchSize: 64 });
assert.deepEqual(values.map((item) => item.value), actual);
assert.equal(mock.requests.length, stages.filter((stage) => stage.pairs.some((pair) => !pair.cached)).length);
assert.equal(mock.requests.reduce((total, request) => total + Object.keys(request.questions).length, 0), seen.size);

mkdirSync("docs/assets", { recursive: true });
writeFileSync("docs/assets/network-trace.json", JSON.stringify({
  description: "Actual bitonic network schedule; deterministic numeric judgments; illustrative playback timing.",
  input, stages, result: actual, requests: mock.requests.length, comparisons: seen.size,
}, null, 2) + "\n");
console.log(`Verified animation trace: ${input.length} items, ${stages.length} stages, ${seen.size} unique comparisons.`);
