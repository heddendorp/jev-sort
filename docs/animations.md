# README animations

Two small, looping GIFs illustrate the public API and the batching strategy. PNG versions provide still alternatives. Both are generated from code; they contain no screenshots, credentials, or private data.

| Asset | Shows | Still version |
| --- | --- | --- |
| [Fuzzy sorting](assets/fuzzy-sort.gif) | A plain-language rule and general context reorder support tickets without changing the input array | [PNG](assets/fuzzy-sort.png) |
| [Parallel comparisons](assets/parallel-sort.gif) | Four independent pair comparisons share one request at each of six stages | [PNG](assets/parallel-sort.png) |

## What the animations mean

The support illustration uses the fictional tickets in `examples/tickets.ts`. The rule is “Most urgent first.” Shared context prioritizes revenue loss, then blocked users, then cosmetic issues. The new array places payment and sign-in issues ahead of cosmetic and documentation work; the original array retains its initial order. This is an illustrative result, not a promise about model judgments.

The parallel illustration uses `[5, 1, 8, 3, 2, 7, 4, 6]`. Every stage groups four independent pair comparisons into one request. Jev's answers are represented by deterministic numeric comparisons. The network applies those answers locally, using both ascending and descending internal comparators to build the final ascending order. Intermediate arrays are not necessarily sorted. The six stages require 24 unique comparisons and six requests with the shown batch size.

The schedule is imported from the actual `src/network.ts` generator. `scripts/readme-trace.ts` checks its result, unique comparison count, and request count against a real `jevSort` invocation using the mocked SDK transport, then saves `assets/network-trace.json`. Playback timing is chosen for readability and does not measure API speed. Larger stages may span several concurrent requests, as described in the main README.

## Regenerate

Requirements: the repository's npm dependencies, Python 3.10+, and Pillow. Font discovery supports macOS Arial/Menlo and Linux DejaVu or Liberation fonts. The renderer never reads `.env` or calls TypeSafe.

```sh
npm ci
python3 -m venv /tmp/jev-sort-docs
source /tmp/jev-sort-docs/bin/activate
python -m pip install -r scripts/requirements-docs.txt
npm run docs:gifs
```

The renderer writes GIFs and PNGs to `docs/assets`, plus decoded GIF contact sheets in `/tmp/fuzzy-sort-contact.png` and `/tmp/parallel-sort-contact.png` for visual review. Typography is rendered at double resolution and downsampled; a shared palette avoids color flicker. Unchanged frames are combined by the GIF encoder. Each GIF must remain below 2 MB.

After rendering, review the initial state, moving cards, intermediate network stages, and final result. Commit the assets alongside any source or README changes. The README uses GitHub raw URLs so its GIFs also resolve when the text is displayed outside the repository; the media is not included in the npm tarball.
