import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { JsonValue, SystemOneRequestPayload } from "@typesafe-ai/sdk";

export function mockClient(
  compare: (a: JsonValue, b: JsonValue) => number = (a, b) => Number(a) - Number(b),
  options: {
    delayMs?: number;
    confidence?: number;
    failAt?: number;
    transform?: (body: Record<string, unknown>) => unknown;
  } = {},
) {
  const requests: SystemOneRequestPayload[] = [];
  let active = 0;
  let maxActive = 0;
  const client = new TypeSafeClient({
    apiKey: "test-key-never-sent-to-network",
    retry: { maxRetries: 0 },
    logLevel: "off",
    fetch: async (url, init) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      const request = JSON.parse(String(init?.body)) as SystemOneRequestPayload;
      requests.push(request);
      const requestNumber = requests.length;
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        if (options.delayMs) {
          await setTimeout(options.delayMs, undefined, init?.signal ? { signal: init.signal } : {});
        }
        if (requestNumber === options.failAt) {
          return Response.json({ error: "test authentication failure" }, { status: 401 });
        }
        const state = request.state as { items: Record<string, JsonValue> };
        const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
          assert.equal(question.type, "choice");
          const instructions = question.instructions as { first: string; second: string };
          const firstKey = /items\.(i\d+)/.exec(instructions.first)?.[1];
          const secondKey = /items\.(i\d+)/.exec(instructions.second)?.[1];
          assert.ok(firstKey && secondKey, "Instructions must identify both state items");
          const order = compare(state.items[firstKey]!, state.items[secondKey]!);
          const choice = order < 0 ? "first" : order > 0 ? "second" : "tie";
          return [id, {
            type: "choice", choice, confidence: options.confidence ?? 1,
            probabilities: { first: +(choice === "first"), second: +(choice === "second"), tie: +(choice === "tie") },
          }];
        }));
        const body = { model: request.model, answers, usage: { input_tokens: 100, output_tokens: 10 } };
        return Response.json(options.transform ? options.transform(body) : body);
      } finally {
        active--;
      }
    },
  });
  return { client, requests, get active() { return active; }, get maxActive() { return maxActive; } };
}
