import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { estimateSort, jevSort } from "../src/index.js";
import type { SortProgress } from "../src/index.js";

// Explicitly opt-in: two real API sorts, each containing 100 fictional tickets.
// Ground-truth severity labels are used only for evaluation, never sent to Jev.
const categories = [
  { name: "revenue", message: "Customers cannot complete checkout: every payment attempt fails." },
  { name: "access", message: "Customers cannot sign in or access their accounts; there is no workaround." },
  { name: "performance", message: "Product pages load slowly, but customers can still browse and buy." },
  { name: "cosmetic", message: "Profile icons look blurry, but all functions work normally." },
  { name: "documentation", message: "Customers request an extra screenshot in the help guide; nothing is broken." },
];
const priority = new Map<string, number>();
const input = categories.flatMap((category, tier) => Array.from({ length: 20 }, (_, offset) => {
  const id = `T-${String(tier * 20 + offset + 1).padStart(3, "0")}`;
  priority.set(id, tier);
  return { id, message: category.message, affectedCustomers: (offset + 1) * 10 };
}));
let seed = 42;
for (let i = input.length - 1; i > 0; i--) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const j = Math.floor((seed / 2 ** 32) * (i + 1));
  [input[i], input[j]] = [input[j]!, input[i]!];
}
const expected = input.toSorted((a, b) => priority.get(a.id)! - priority.get(b.id)! || b.affectedCustomers - a.affectedCustomers);
const expectedPosition = new Map(expected.map((ticket, index) => [ticket.id, index]));
assert.equal(new Set(input.map((item) => item.id)).size, 100);
const original = structuredClone(input);
const predicate = "Most urgent customer issue first. Apply the severity priorities in context. Within the same severity, put the issue affecting more customers first.";
const context = {
  product: "An online store",
  policy: "Order severity from highest to lowest: (1) active loss of revenue from failed payments, (2) users unable to access their accounts, (3) degraded performance with working features, (4) cosmetic issues with working features, (5) documentation requests with nothing broken. Severity always takes precedence over affected customer count. Within the same severity, more affected customers means higher priority.",
};

interface Attempt {
  round: number;
  questions: number;
  requestBytes: number;
  elapsedMs: number;
  status?: number;
  model?: string;
  error?: string;
}

const reportPath = `benchmarks/results/live-100-${new Date().toISOString().replaceAll(":", "-")}.json`;
const report = {
  startedAt: new Date().toISOString(),
  runtime: process.version,
  platform: `${process.platform}-${process.arch}`,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  sorterSourceSha256: createHash("sha256").update(["src/index.ts", "src/network.ts", "src/parallel.ts", "src/json.ts"].map((file) => readFileSync(file)).join("\n")).digest("hex"),
  methodology: "One live run per configuration on the same deterministic 100-ticket fixture. Severity labels are withheld. Correctness is measured against the explicit context policy. Timings include HTTP body reads, SDK retries, and benchmark instrumentation; no warmup or statistical latency claims.",
  predicate, context, input, expected: expected.map((item) => item.id),
  networkBound: estimateSort(input.length),
  runs: [] as Array<Record<string, unknown>>,
};
mkdirSync("benchmarks/results", { recursive: true });
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
save();

for (const config of [
  { name: "default", batchSize: 64, concurrency: 4 },
  { name: "smaller-parallel-batches", batchSize: 16, concurrency: 4 },
]) {
  const attempts: Attempt[] = [];
  const stages: Array<SortProgress & { elapsedMs: number }> = [];
  let round = 1;
  let active = 0;
  let peakRequests = 0;
  let successfulAnswers = 0;
  let correctAnswers = 0;
  let lastProgress: Readonly<SortProgress> | undefined;
  const client = new TypeSafeClient({
    timeout: 30_000,
    logLevel: "off",
    fetch: async (url, init) => {
      const payload = JSON.parse(String(init?.body)) as { questions: Record<string, unknown> };
      const attempt: Attempt = { round, questions: Object.keys(payload.questions).length, requestBytes: Buffer.byteLength(String(init?.body)), elapsedMs: 0 };
      attempts.push(attempt);
      active++;
      peakRequests = Math.max(peakRequests, active);
      const start = performance.now();
      try {
        const response = await fetch(url, init);
        attempt.status = response.status;
        if (response.ok) {
          const body = await response.clone().json() as { model: string; answers: Record<string, { choice: string }> };
          attempt.model = body.model;
          for (const [id, answer] of Object.entries(body.answers)) {
            const [, a, b] = id.split("_");
            const left = expectedPosition.get(input[Number(a)]!.id)!;
            const right = expectedPosition.get(input[Number(b)]!.id)!;
            successfulAnswers++;
            if (answer.choice === (left < right ? "first" : "second")) correctAnswers++;
          }
        }
        return response;
      } catch (error) {
        attempt.error = error instanceof Error ? error.name : "UnknownError";
        throw error;
      } finally {
        attempt.elapsedMs = Math.round(performance.now() - start);
        active--;
      }
    },
  });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  console.log(`Starting ${config.name}: 100 tickets, batchSize=${config.batchSize}, concurrency=${config.concurrency}`);
  try {
    const sorted = await jevSort(input, predicate, {
      client, context, ...config, maxComparisons: report.networkBound.maxComparisons,
      signal: AbortSignal.timeout(180_000),
      onProgress: (progress) => {
        lastProgress = progress;
        round = progress.round + 1;
        const elapsedMs = Math.round(performance.now() - started);
        stages.push({ ...progress, elapsedMs });
        if (progress.round % 7 === 0) console.log(`  Stage ${progress.round}/${progress.totalRounds}: ${elapsedMs} ms, ${progress.comparisons} comparisons, ${progress.requests} requests`);
      },
    });
    const elapsedMs = Math.round(performance.now() - started);
    assert.deepEqual(input, original, "Input must remain unchanged");
    assert.deepEqual(sorted.map((item) => item.id).toSorted(), input.map((item) => item.id).toSorted(), "Every input must occur exactly once");
    const ranks = sorted.map((item) => expectedPosition.get(item.id)!);
    let inversions = 0;
    let severityInversions = 0;
    for (let i = 0; i < ranks.length; i++) {
      for (let j = i + 1; j < ranks.length; j++) {
        if (ranks[i]! > ranks[j]!) inversions++;
        if (priority.get(sorted[i]!.id)! > priority.get(sorted[j]!.id)!) severityInversions++;
      }
    }
    const possiblePairs = input.length * (input.length - 1) / 2;
    const latencies = attempts.map((attempt) => attempt.elapsedMs).toSorted((a, b) => a - b);
    const run = {
      ...config, startedAt, elapsedMs, peakConcurrentRequests: peakRequests,
      ...lastProgress,
      httpAttempts: attempts.length,
      successfulHttpAttempts: attempts.filter((attempt) => attempt.status !== undefined && attempt.status < 300).length,
      modelVersions: [...new Set(attempts.map((attempt) => attempt.model).filter(Boolean))],
      requestLatencyMs: { median: latencies[Math.floor(latencies.length / 2)], p95: latencies[Math.ceil(latencies.length * 0.95) - 1] },
      evaluatedPairAccuracy: correctAnswers / successfulAnswers,
      correctPairAnswers: correctAnswers,
      evaluatedPairAnswers: successfulAnswers,
      exactOrder: inversions === 0,
      correctPositions: ranks.filter((rank, i) => rank === i).length,
      adjacentViolations: ranks.filter((rank, i) => i > 0 && ranks[i - 1]! > rank).length,
      inversions, severityInversions, possiblePairs,
      globalPairAgreement: 1 - inversions / possiblePairs,
      top10Overlap: sorted.slice(0, 10).filter((item) => expectedPosition.get(item.id)! < 10).length,
      result: sorted.map((item) => item.id),
      attempts, stages,
    };
    report.runs.push(run);
    save();
    console.log(JSON.stringify({ ...run, attempts: undefined, stages: undefined, result: undefined }, null, 2));
  } catch (error) {
    report.runs.push({ ...config, startedAt, elapsedMs: Math.round(performance.now() - started), failed: true, error: error instanceof Error ? error.name : "UnknownError", ...lastProgress, attempts, stages });
    save();
    throw error;
  }
}
console.log(`Saved full results to ${reportPath}`);
