import assert from "node:assert/strict";
import { test } from "node:test";
import { createJevSorter, estimateSort, jevSort } from "../src/index.js";
import type { JsonValue, SortProgress } from "../src/index.js";
import { mockClient } from "./mock.js";

test("matches stable native sorting across random inputs and power-of-two boundaries", async () => {
  let seed = 42;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const lengths = [...Array.from({ length: 40 }, (_, i) => i), 63, 64, 65, 127, 128, 129, 257];
  for (const length of lengths) {
    const input = Object.freeze(Array.from({ length }, (_, id) => Object.freeze({ id, rank: Math.floor(random() * 10) })));
    const mock = mockClient((a, b) => (a as { rank: number }).rank - (b as { rank: number }).rank);
    const result = await jevSort(input, "Smallest rank first", { client: mock.client });
    assert.deepEqual(result, input.toSorted((a, b) => a.rank - b.rank), `length ${length}`);
    assert.notEqual(result, input);
    for (const item of result) assert.equal(item, input[item.id]);
    const pairs = mock.requests.flatMap((request) => Object.keys(request.questions));
    assert.equal(new Set(pairs).size, pairs.length, "Each unordered pair is evaluated only once");
    assert.ok(pairs.length <= estimateSort(length).maxComparisons);
  }
});

test("sorts every binary sequence through eight items (network zero-one check)", async () => {
  for (let length = 0; length <= 8; length++) {
    for (let mask = 0; mask < 2 ** length; mask++) {
      const input = Array.from({ length }, (_, i) => (mask >> i) & 1);
      const mock = mockClient();
      assert.deepEqual(await jevSort(input, "Ascending", { client: mock.client }), input.toSorted());
    }
  }
});

test("supports descending rules, duplicates, null, and stable ties", async () => {
  const mock = mockClient((a, b) => Number(b) - Number(a));
  assert.deepEqual(await jevSort([2, null, 3, 2, 1], "Largest first", { client: mock.client }), [3, 2, 2, 1, null]);
  const allTies = mockClient(() => 0);
  const input = ["c", "b", "d", "a", "e"];
  assert.deepEqual(await jevSort(input, "Same priority", { client: allTies.client }), input);
});

test("densifies holes and moves undefined to the end without evaluating them", async () => {
  const input = [3, , undefined, 1, , 2];
  const mock = mockClient();
  const result = await jevSort(input, "Ascending", { client: mock.client });
  assert.deepEqual(result, [1, 2, 3, undefined, undefined, undefined]);
  assert.equal(Object.keys(result).length, 6);
  assert.equal(1 in input, false);
  assert.deepEqual(await jevSort([undefined, 1, undefined], "Ascending"), [1, undefined, undefined]);
  assert.deepEqual(await jevSort([], "Ascending"), []);
});

test("batches questions, bounds overlapping requests, and reports token usage", async () => {
  const mock = mockClient(undefined, { delayMs: 2 });
  const updates: SortProgress[] = [];
  const context = { priority: "ascending", details: ["shared"] };
  const result = await jevSort(Array.from({ length: 32 }, (_, i) => 32 - i), "Ascending", {
    client: mock.client, context, batchSize: 2, concurrency: 3, model: "test-pinned-model",
    onProgress: (progress) => updates.push(progress),
  });
  assert.deepEqual(result, Array.from({ length: 32 }, (_, i) => i + 1));
  assert.equal(mock.maxActive, 3);
  assert.equal(mock.active, 0);
  for (const request of mock.requests) {
    assert.ok(Object.keys(request.questions).length <= 2);
    assert.equal(request.model, "test-pinned-model");
    assert.deepEqual((request.state as { context: JsonValue }).context, context);
  }
  assert.equal(updates.length, estimateSort(32).rounds);
  assert.equal(updates.at(-1)?.requests, mock.requests.length);
  assert.equal(updates.at(-1)?.inputTokens, mock.requests.length * 100);
  assert.equal(updates.at(-1)?.outputTokens, mock.requests.length * 10);
  assert.equal(updates.at(-1)?.comparisons, mock.requests.reduce((n, r) => n + Object.keys(r.questions).length, 0));
  assert.equal(updates[0]?.round, 1, "Progress objects are snapshots");
});

test("uses one batched request per non-cached stage when it fits", async () => {
  const mock = mockClient();
  await jevSort([8, 7, 6, 5, 4, 3, 2, 1], "Ascending", { client: mock.client });
  assert.equal(Object.keys(mock.requests[0]!.questions).length, 4);
  assert.ok(mock.requests.length <= 6);
});

test("projects custom objects once and snapshots context and state before awaiting", async () => {
  const mock = mockClient(undefined, { delayMs: 1 });
  const a = { priority: 2, privateData: new Map([["secret", "not sent"]]) };
  const b = { priority: 1, privateData: new Map() };
  const input = [a, b];
  const context = { audience: "developers" };
  let projections = 0;
  const pending = jevSort(input, "Ascending", {
    client: mock.client, context,
    project: (item, index) => { projections++; assert.equal(item, input[index]); return item.priority; },
  });
  context.audience = "changed";
  a.priority = 0;
  input.reverse();
  const result = await pending;
  assert.equal(projections, 2);
  assert.equal(result[0], b);
  assert.equal(result[1], a);
  assert.deepEqual(mock.requests[0]!.state, { context: { audience: "developers" }, items: { i0: 2, i1: 1 } });
});

test("binds shared context and permits per-call overrides", async () => {
  const mock = mockClient();
  const sort = createJevSorter({ client: mock.client, context: "shared" });
  assert.deepEqual(await sort([2, 1], "Ascending"), [1, 2]);
  assert.deepEqual(await sort([{ n: 2 }, { n: 1 }], "Ascending", { context: "override", project: (v) => v.n }), [{ n: 1 }, { n: 2 }]);
  assert.equal((mock.requests[0]!.state as { context: string }).context, "shared");
  assert.equal((mock.requests[1]!.state as { context: string }).context, "override");
});

test("treats low confidence as a tie only when explicitly configured", async () => {
  const mock = mockClient(undefined, { confidence: 0.1 });
  assert.deepEqual(await jevSort([3, 1, 2], "Ascending", { client: mock.client, minConfidence: 0.5 }), [3, 1, 2]);
  assert.deepEqual(await jevSort([3, 1, 2], "Ascending", { client: mock.client }), [1, 2, 3]);
});

test("rejects invalid options and oversized work before any API call", async () => {
  const mock = mockClient();
  for (const option of [
    { batchSize: 0 }, { concurrency: 1.5 }, { maxComparisons: -1 },
    { minConfidence: NaN }, { minConfidence: 1.1 }, { model: " " }, { apiKey: "conflicting" },
  ]) {
    await assert.rejects(jevSort([2, 1], "Ascending", { client: mock.client, ...option }));
  }
  await assert.rejects(jevSort([2, 1], " ", { client: mock.client }), /predicate/);
  await assert.rejects(jevSort([2, 1], "Ascending", { client: mock.client, maxComparisons: 0 }), /up to 1 comparisons/);
  assert.equal(mock.requests.length, 0);
  assert.deepEqual(estimateSort(8), { paddedLength: 8, rounds: 6, maxComparisons: 24 });
  assert.deepEqual(estimateSort(0), { paddedLength: 0, rounds: 0, maxComparisons: 0 });
  for (const n of [-1, Infinity, 1.5, 2 ** 30 + 1]) assert.throws(() => estimateSort(n), RangeError);
});

test("rejects lossy or circular state before sending anything", async () => {
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const mock = mockClient();
  for (const invalid of [NaN, Infinity, 1n, Symbol("x"), () => 1, new Map(), circular, { missing: undefined }]) {
    await assert.rejects(jevSort([invalid, 1], "Ascending", { client: mock.client }), /JSON-serializable/);
  }
  assert.equal(mock.requests.length, 0);
});

test("rejects missing, malformed, and unexpected model answers", async () => {
  for (const malformed of [
    null, {}, { type: "noul", noul: 1 },
    { type: "choice", choice: "other", confidence: 1 },
    { type: "choice", choice: "first", confidence: 2 },
    { type: "choice", choice: "first" },
  ]) {
    const mock = mockClient(undefined, {
      transform: (body) => ({ ...body, answers: { p_0_1: malformed } }),
    });
    await assert.rejects(jevSort([2, 1], "Ascending", { client: mock.client }), /Invalid or missing Choice/);
  }
});

test("propagates API errors, stops queued work, and settles sibling requests", async () => {
  const mock = mockClient(undefined, { delayMs: 2, failAt: 1 });
  const input = Array.from({ length: 32 }, (_, i) => 32 - i);
  const before = [...input];
  await assert.rejects(jevSort(input, "Ascending", { client: mock.client, batchSize: 1, concurrency: 3 }), /401/);
  assert.equal(mock.requests.length, 3);
  assert.equal(mock.active, 0);
  assert.deepEqual(input, before);
});

test("cancels in-flight requests and does not start queued batches", async () => {
  const mock = mockClient(undefined, { delayMs: 100 });
  const controller = new AbortController();
  const pending = jevSort(Array.from({ length: 32 }, (_, i) => i), "Ascending", {
    client: mock.client, signal: controller.signal, batchSize: 1, concurrency: 2,
  });
  controller.abort();
  await assert.rejects(pending);
  assert.ok(mock.requests.length <= 2);
  assert.equal(mock.active, 0);
  const count = mock.requests.length;
  await assert.rejects(jevSort([2, 1], "Ascending", { client: mock.client, signal: controller.signal }));
  assert.equal(mock.requests.length, count);
});

test("honors cancellation from progress even on the final stage", async () => {
  const mock = mockClient();
  const controller = new AbortController();
  await assert.rejects(jevSort([2, 1], "Ascending", {
    client: mock.client, signal: controller.signal, onProgress: () => controller.abort(),
  }));
});

test("terminates and preserves the permutation even for cyclic preferences", async () => {
  const mock = mockClient((a, b) => a === b ? 0 : (Number(a) + 1) % 3 === Number(b) ? -1 : 1);
  const input = [0, 1, 2, 0, 1, 2, 0];
  const result = await jevSort(input, "Cyclic preferences", { client: mock.client });
  assert.deepEqual(result.toSorted(), input.toSorted());
  assert.ok(mock.requests.length <= estimateSort(input.length).rounds);
});
