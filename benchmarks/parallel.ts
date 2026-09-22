import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { jevSort } from "../src/index.js";
import { mockClient } from "../test/mock.js";

// This measures orchestration with an artificial 5 ms request latency, not Jev inference.
const input = Array.from({ length: 128 }, (_, i) => (i * 73) % 128);
const results = [];
for (const config of [
  { name: "One question per request, sequential", batchSize: 1, concurrency: 1 },
  { name: "Batched questions, bounded parallel requests", batchSize: 16, concurrency: 4 },
]) {
  const mock = mockClient(undefined, { delayMs: 5 });
  const start = performance.now();
  const sorted = await jevSort(input, "Ascending", { client: mock.client, ...config });
  const elapsedMs = Math.round(performance.now() - start);
  assert.deepEqual(sorted, input.toSorted((a, b) => a - b));
  results.push({
    mode: config.name,
    items: input.length,
    comparisons: mock.requests.reduce((n, request) => n + Object.keys(request.questions).length, 0),
    requests: mock.requests.length,
    peakConcurrentRequests: mock.maxActive,
    elapsedMs,
  });
}
console.log("SIMULATED transport: 5 ms per request. No API key, network, or model inference.");
console.table(results);
console.log(`Simulated speedup: ${(results[0]!.elapsedMs / results[1]!.elapsedMs).toFixed(1)}x`);
