# jev-sort

An asynchronous, non-mutating sort for fuzzy rules, powered by [TypeSafe's Jev](https://docs.typesafe.ai/introduction).

```ts
const sorted = await jevSort(tickets, "Most urgent customer issue first", {
  context: "An online store. Prioritize lost revenue, then blocked users.",
});
```

You describe the order. Jev compares items. A parallel bitonic sorting network arranges them into a new array, batching independent questions into each API request.

![Support tickets reorder according to a most-urgent-first rule and online-store context, while the original array remains unchanged.](https://raw.githubusercontent.com/heddendorp/jev-sort/2296e359ff75955c3eb36a54964f62041a9db695/docs/assets/fuzzy-sort.gif)

Illustrative playback of the support-ticket example. Model judgments can vary. [View the still image](docs/assets/fuzzy-sort.png).

## Install

Node.js 20+; ESM with TypeScript declarations. The package is prepared for npm as `jev-sort`; it is not yet published to the registry. To use the current repository:

```sh
git clone https://github.com/heddendorp/jev-sort.git
cd jev-sort
npm ci
npm run build
npm pack
# In another project: npm install /path/to/jev-sort/jev-sort-0.1.0.tgz
```

After a registry release, installation will be `npm install jev-sort`.

Set `TYPESAFE_API_KEY` in your server environment. For this repository's examples, create `.env` (git-ignored):

```dotenv
TYPESAFE_API_KEY=your-key
```

The library uses the official SDK's environment lookup; it does not read `.env` files itself. The example commands below load `.env` using Node's `--env-file` flag (Node 20.6+). Keep your key on the server.

## Usage

```ts
import { jevSort } from "jev-sort";

const tickets = [
  { id: "design", message: "The profile icon is blurry." },
  { id: "payments", message: "Checkout is failing for every customer." },
  { id: "login", message: "One user cannot sign in; password reset works." },
];

const sorted = await jevSort(tickets, "Most urgent customer issue first", {
  context: {
    product: "An online store",
    priorities: "Active loss of revenue, then blocked users, then cosmetic issues",
  },
});

console.log(sorted.map((ticket) => ticket.id));
// Expected: ["payments", "login", "design"] — model judgments can vary.
// tickets is unchanged; sorted contains the original objects.
```

The predicate is a **plain-language ordering rule**, not a JavaScript comparator. Say which items come first: `"Least expensive to maintain first"`, `"Most relevant to the question in context first"`, or `"Earlier historical events first"`. For a pairwise rule, use `"Place A before B when A is more urgent than B"`. The model receives an explicit first item, second item, and shared context for each comparison, and chooses `first`, `second`, or `tie`.

### Reuse general context

```ts
import { createJevSorter } from "jev-sort";

const sortForTeam = createJevSorter({
  context: {
    team: "A small backend team maintaining a payment service",
    priorities: "Reliability and data integrity before convenience",
  },
});

const sorted = await sortForTeam(backlog, "Highest priority to work on next first");
```

Per-call options override defaults. A per-call `context` replaces the shared context; it is not merged. Each invocation has its own comparison cache and concurrency limit.

### Project objects into relevant information

```ts
const sorted = await jevSort(documents, "Most useful for answering the question first", {
  context: { question: "How do I handle duplicate webhook deliveries?" },
  project: ({ title, excerpt }) => ({ title, excerpt }),
});
```

Projection runs once per defined item before any requests. It keeps state small and lets you omit fields you do not need to send. It does not change the returned objects. Shared context and projected data are snapshotted before the first request.

### Configure the official SDK

```ts
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { jevSort } from "jev-sort";

const client = new TypeSafeClient({ timeout: 15_000, retry: { maxRetries: 2 } });
const sorted = await jevSort(items, "Most relevant first", {
  client,
  context: { query: "Reliable webhook processing" },
  signal: AbortSignal.timeout(60_000), // overall deadline, including retries
});
```

Install `@typesafe-ai/sdk` as a direct dependency if importing it yourself. SDK authentication, timeout, rate-limit, and connection errors propagate. A failed request cancels sibling requests and queued work; already processed API requests may still be billed. No partially sorted result is returned. An SDK timeout applies per attempt; use an abort signal for an overall deadline.

## API

`jevSort<T>(items: readonly T[], predicate: string, options?: SortOptions<T>): Promise<T[]>`

| Option | Default | Meaning |
| --- | --- | --- |
| `context` | `null` | JSON-compatible general context included in every batch |
| `project(item, index)` | Item itself | JSON representation sent to Jev; index is the original array position |
| `apiKey` | `TYPESAFE_API_KEY` | API key, mutually exclusive with `client` |
| `client` | New official SDK client | Reuse a client or customize transport, retries, and timeout |
| `model` | Client default, normally `jev-latest` | Use a pinned model version for more reproducible behavior |
| `batchSize` | `64` | Maximum comparison questions per request; a package default, not an API limit |
| `concurrency` | `4` | Maximum simultaneous requests per sort invocation |
| `maxComparisons` | `100000` | Reject before requests if the conservative network bound is larger |
| `minConfidence` | `0` | Treat answers below this threshold as ties; accepts 0–1 |
| `signal` | None | AbortSignal for cancellation, including SDK retries |
| `onProgress` | None | Callback after each completed stage with rounds, successful unique comparisons, logical requests, and token usage |

`createJevSorter(defaults)` returns a function with the same signature and defaults applied. Item types remain inferred per call. Supply `project` per call.

`estimateSort(length)` returns `{ paddedLength, rounds, maxComparisons }` without contacting TypeSafe. The bound includes padding comparisons and comparisons that might be cached, so actual questions are usually lower. It is a question-count bound, not a token or monetary budget; retries are additional attempts.

## How parallel sorting works

![Eight numbers move through six comparison stages. Four independent questions share each TypeSafe request, and the final array is in ascending order.](https://raw.githubusercontent.com/heddendorp/jev-sort/2296e359ff75955c3eb36a54964f62041a9db695/docs/assets/parallel-sort.gif)

This animation follows the actual network schedule with deterministic numeric judgments and illustrative timing. It shows 24 comparisons in six requests; larger stages can use multiple concurrent requests. [View the still image](docs/assets/parallel-sort.png).

1. Copy the input, retain original indices, and pad the comparison network to a power of two. Undefined values and holes go to the end locally.
2. At each network stage, identify disjoint pairs that can be compared independently.
3. Send multiple **Choice questions in one request** against shared state. Each question explicitly identifies its two items. TypeSafe evaluates these questions in parallel.
4. If a stage needs multiple batches, send up to `concurrency` requests at once. Each batch includes only the items it compares and the general context.
5. Cache answers by unordered pair within this sort. Always present pairs in original-index order, then invert cached results when the network needs the opposite orientation.
6. Apply compare-and-swap decisions locally. Ties use the original index as a secondary key. Start the next stage once this stage completes.

For padded length `m = 2^ceil(log2(n))`, the network has `log2(m) × (log2(m) + 1) / 2` dependent stages and at most `m × log2(m) × (log2(m) + 1) / 4` comparisons: **O(n log² n)** work and **O(log² n)** parallel depth. Memory is O(n log² n) in the worst case for the per-sort cache, plus serialized input and active batches.

For 128 items that means at most 1,792 comparisons across 28 stages, versus 8,128 unordered pairs for an all-pairs approach. With the default batch size, all 64 comparisons in a full stage fit in one request. A conventional comparison sort can use fewer comparisons, but an asynchronous comparator cannot simply be passed to native `toSorted`.

The speed benefit comes from reducing **sequential network round trips**. There are still dependencies between stages. Larger batches reduce repeated state and request overhead; choose smaller batches if your item/context size runs into service limits. Concurrency helps only when a stage has multiple batches. This does not guarantee a particular latency or make AI sorting appropriate for millions of records; shortlist large datasets first.

This follows TypeSafe's [parallel questions](https://docs.typesafe.ai/primitives#ask-multiple-questions-together), [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out), and [structured Choice questions](https://docs.typesafe.ai/primitives/choice) guidance. The wire format and SDK configuration follow the [HTTP API reference](https://docs.typesafe.ai/api) and [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript).

## Semantics and limitations

- Like `toSorted`, returns a fresh, shallow array, preserves object identity and duplicates, and places undefined values and holes last without comparing them. It accepts arrays, including readonly arrays, rather than arbitrary array-like objects.
- Stable for a consistent comparator: items judged equal retain input order. Low-confidence answers can optionally be treated as ties. Inconsistent pairwise ties or preferences can still undermine a globally stable order.
- AI judgments can be noisy or non-transitive: A can precede B, B precede C, and C precede A. Caching ensures the same pair is not re-evaluated within a run; it cannot turn cyclic preferences into a total order. The network always terminates but cannot guarantee that every pair agrees with the final order. Results can differ across runs or model versions.
- Treat the predicate as a focused comparison. Supply policies and relevant facts in context. Prompt instructions are not a security boundary for untrusted content.
- Defined items must serialize to JSON; custom objects need `project`. Dates use their JSON representation. NaN, infinity, bigint, functions, symbols, nested undefined, Map/Set, and circular data are rejected rather than silently reduced. Empty/single-defined-item arrays need no model call or serialization.
- Item data and context are sent to TypeSafe. The library does not log them; avoid SDK debug logging if the data is sensitive. The package never modifies `Array.prototype`.

## Runnable examples

After setting `.env`:

```sh
npm run example:tickets    # Business-context support prioritization
npm run example:travel     # Reusable traveler preferences and constraints
npm run example:documents  # Query relevance, projection, and an overall deadline
```

These are small live API examples and consume TypeSafe usage. They use fictional inputs. Unit tests and the benchmark use a mocked transport and require no key.

```sh
npm run check          # Typecheck, algorithm/transport tests, build
npm run test:package   # Install the tarball in a temporary consumer; verify ESM/types
npm run benchmark     # Simulated request latency; not a Jev performance claim
npm run test:live     # Opt-in real API smoke test: 8 numbers, at most 24 questions
npm run benchmark:live # Two real API sorts of 100 synthetic tickets; consumes usage
```

The benchmark compares the same sorting network and the same unique comparisons with one question per sequential request versus batched parallel requests. It uses a fixed 5 ms artificial delay per request; actual TypeSafe latency and throughput depend on state size, service load, and account limits.

In a [live 100-ticket benchmark](benchmarks/README.md), default batches took **16.60 s** with **92.85% final pairwise ordering agreement** against an explicit priority policy. Batches of 16 with four concurrent requests took **12.83 s** with **98.38% agreement**. Both returned the correct top-ten set, but neither produced a completely correct order. These are single runs on a controlled synthetic fixture, not performance or accuracy guarantees. The linked report includes token usage, request counts, methodology, and raw results.

The README animations have [reproducible rendering instructions](docs/animations.md). Rendering them requires no API key and makes no live requests.

## Release

```sh
npm run check
npm run test:package
npm publish --dry-run
npm login
npm publish --access public
```

The `.env` file is excluded from git and the npm package. Published files are allowlisted in `package.json`. Update the installation section when the first registry release succeeds.

MIT. Independent community package; not an official TypeSafe product.
