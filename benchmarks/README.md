# Live 100-item benchmark

Run the real TypeSafe API benchmark with a local `.env` containing `TYPESAFE_API_KEY`:

```sh
npm run benchmark:live
```

This makes **two paid sorts of 100 synthetic support tickets**, one per configuration. Each sort has a conservative ceiling of 1,792 comparison questions; actual questions are lower because of padding and caching. It uses the SDK's default retry policy and a 180-second overall deadline per sort. JSON results include the fixture, expected and returned IDs, per-request measurements, per-stage progress, token usage, and correctness metrics. They contain no credentials or HTTP headers. A report is saved before starting and after each completed or failed run.

## Recorded result: September 22, 2026

[Full machine-readable report](results/live-100-2026-09-22T20-05-37.917Z.json). Model: `jev-1.13.0`. Measurements include client-side instrumentation and network time, from a macOS ARM64 host.

| Metric | Default batches | Smaller parallel batches |
| --- | ---: | ---: |
| Items | 100 | 100 |
| Maximum questions per request | 64 | 16 |
| Configured request concurrency | 4 | 4 |
| Observed peak concurrent requests | 1 | 4 |
| Total time | **16.603 s** | **12.827 s** |
| Network stages | 28 | 28 |
| Unique comparisons | 1,046 | 1,074 |
| API requests / HTTP attempts | 28 / 28 | 79 / 79 |
| Median request latency | 406 ms | 386 ms |
| 95th-percentile request latency | 1,336 ms | 590 ms |
| Input tokens | 364,194 | 392,188 |
| Output tokens | 42,749 | 44,049 |
| Evaluated comparisons matching policy | 959 / 1,046 (91.68%) | 1,031 / 1,074 (96.00%) |
| Final pairwise ordering agreement | **92.85%** | **98.38%** |
| Inversions across all 4,950 item pairs | 354 | 80 |
| Severity-order inversions | 181 | 10 |
| Items at their exact expected position | 25 / 100 | 48 / 100 |
| Correct top-ten set | 10 / 10 | 10 / 10 |
| Entire order correct | No | No |

The smaller batches completed in 22.7% less time in this run, with more requests and greater token usage. At 100 items, every stage fits in one default-size batch, so the default has no opportunity for concurrent HTTP requests; its questions still run in parallel within each request. Batches of 16 can send up to four requests at once.

## Fixture and interpretation

The dataset has five fictional issue descriptions, with 20 affected-customer counts per description (10 through 200). Tickets are shuffled deterministically with seed 42. The ordering rule uses this explicit context policy:

1. Failed checkout payments causing lost revenue.
2. Users unable to sign in, with no workaround.
3. Slow pages where browsing and purchasing still work.
4. Cosmetic problems with working features.
5. Requests for additional help documentation.

Within each severity group, more affected customers means higher priority. Severity takes precedence over customer count. Numeric severity labels are withheld from Jev and used only to calculate the expected order. This is a controlled, low-diversity fixture, not a representative production corpus.

**Final pairwise ordering agreement** checks every pair of items in the returned list against that policy, including pairs the model never directly evaluated. An inversion is one such pair in the wrong order. **Evaluated comparison accuracy** checks only the questions actually answered by Jev. These measure different things. Exact-position counts are stricter still: moving one item can shift several otherwise well-ordered items.

Both runs retained all 100 items exactly once and left the input unchanged. Neither produced a fully correct sort. The different model decisions change later network pairings and cache hits, which explains the slightly different comparison counts. Smaller batches also present less item data per request, so the two configurations do not have identical model state.

There was **one run per configuration**, defaults first and smaller batches second, with no warmup. Service load, network conditions, connection warmup, batch state, and model variability can affect both timing and quality. This is an observed comparison, not a statistically established speedup or accuracy guarantee. The package defaults were not changed on the basis of this single measurement.

For an API-free orchestration comparison with artificial latency, use `npm run benchmark`. That separate benchmark is simulated and makes no claims about live Jev inference speed or judgment quality.
