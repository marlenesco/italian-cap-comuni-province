# Tabular dataset benchmark report

Measured on **2026-11-13**. The comparison uses two representations of the
**same geographic data**, not two dataset releases. The tabular representation
reduces the measured npm tarball by **23.83%** and the complete `dist` directory
by **71.44%**. CJS initialization is faster in this environment, name search is
essentially unchanged, and the measured post-GC heap delta increases by **2.46%**.

## Compared snapshots

- **Before:** source revision `0458998`, with the original object-array JSON
  copied unchanged into `dist` by tsup's `copy` loader.
- **After:** the tabular implementation in `8e135ff`, with the maintenance,
  packaging and documentation changes committed through `eee6c03`. Original
  JSON remains in `src/data`; the build generates shared `columns`/`rows` assets.
  Tiny CJS bridges load the same JSON from both module formats. Normalization
  reads rows directly; public APIs, indices and search algorithms are unchanged.

Both snapshots use 8,456 municipality/CAP rows, 110 provinces and 20 regions.
The source columns number 17, 7 and 7 respectively. The newer Garda archive
evaluated during maintenance-tool development is **not** part of this comparison.

These are historical measurements captured before this report was added.
Later README or package metadata edits can change tarball sizes without changing
runtime assets. The benchmark harness is [scripts/benchmark.mjs](../scripts/benchmark.mjs).

## Before and after

All size values are **UTF-8/file bytes**, not filesystem allocation or rounded MB.
Percentage changes use `(after / before - 1) * 100`, calculated before rounding.

### Dataset files

The original and minified-source columns are identical in both snapshots.
Minification means `JSON.stringify(JSON.parse(source))`; generated table sizes
include their trailing newline.

| Dataset | Rows | Original source bytes | Minified source bytes | Generated tabular bytes |
| --- | ---: | ---: | ---: | ---: |
| `gi_comuni_cap.json` | 8,456 | 5,589,531 | 4,067,450 | 1,480,242 |
| `gi_province.json` | 110 | 30,832 | 22,031 | 6,902 |
| `gi_regioni.json` | 20 | 5,804 | 4,203 | 1,603 |
| **Total** | | **5,626,167** | **4,093,684** | **1,488,747** |

### Distributed sizes and compression

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Original source JSON | 5,626,167 | 5,626,167 | 0.00% |
| Minified original source JSON | 4,093,684 | 4,093,684 | 0.00% |
| All runtime assets | 5,667,246 | 1,530,239 | -73.00% |
| Complete `dist` | 5,782,998 | 1,651,805 | -71.44% |
| npm tarball | 456,498 | 347,697 | -23.83% |
| Unpacked npm package | 5,799,541 | 1,669,836 | -71.21% |
| Runtime assets, gzip | 427,196 | 318,418 | -25.46% |
| Runtime assets, Brotli | 267,497 | 227,855 | -14.82% |
| Complete `dist`, gzip | 452,132 | 344,342 | -23.84% |
| Complete `dist`, Brotli | 289,780 | 250,981 | -13.39% |

**Runtime assets** include both JS entry points, every distributed JSON file and
the three CJS bridges where present; shared JSON is counted once. **Complete
`dist`** additionally includes both declaration files and source maps. The
**npm package** includes `dist`, `README.md`, `LICENSE` and `package.json`; it
excludes original source JSON, provenance and development scripts.

The gzip and Brotli rows sum files compressed **individually**, using Node's
`gzipSync` at level 9 and `brotliCompressSync` at quality 11. They are neither a
single concatenated payload nor a prediction for one browser entry point. The
npm tarball row is a separate gzip-compressed tar measurement from
`npm pack --dry-run --ignore-scripts --json`, also checked against an actual
locally packed tarball during consumer validation. Nothing was published.

### Initialization, heap and searches

Results are medians of 15 isolated processes for each successful module format.
Lookup/search values are per-call averages within each process, then medians
across processes. Search rows below use the CJS consumer for a comparable baseline.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| CJS import and initialization, ms | 29.234 | 19.652 | -32.78% |
| CJS post-GC heap delta, bytes | 9,053,328 | 9,276,200 | +2.46% |
| CAP lookup, ns/call | 20.664 | 21.586 | +4.46% |
| ISTAT lookup, ns/call | 20.627 | 18.480 | -10.41% |
| Name search, ms/call | 7.719 | 7.652 | -0.86% |
| ESM import and initialization, ms | Not measured: import fails | 19.721 | Not comparable |
| ESM post-GC heap delta, bytes | Not measured: import fails | 9,316,168 | Not comparable |

The baseline's native Node ESM import fails with
`ERR_IMPORT_ATTRIBUTE_MISSING` because the copied JSON imports have no JSON
attribute. The tabular build's bridges resolve this compatibility issue. There
is no valid baseline ESM timing or memory result to substitute for that failure.

For context, nearest-rank quartiles (the 4th and 12th sorted observations out of
15) show the variation in the CJS samples:

| Metric | Before, Q1–Q3 | After, Q1–Q3 |
| --- | ---: | ---: |
| Import and initialization, ms | 27.840–31.353 | 18.863–20.097 |
| CAP lookup, ns/call | 19.222–22.417 | 19.732–22.900 |
| ISTAT lookup, ns/call | 19.341–24.571 | 17.680–22.719 |
| Name search, ms/call | 7.585–8.027 | 7.472–7.965 |

## Methodology

**Environment:** Node.js `v24.22.1`, Apple M2 Max, macOS (`darwin`, kernel release
`27.0.0`), with the locked development dependencies. Node 18 compatibility was
tested separately; the timings above were measured only on Node 24.

1. Build each snapshot and preserve its complete `dist` directory and npm pack
   manifest. Use identical geographic inputs and the same benchmark harness,
   Node executable and machine for both versions.
2. Run the baseline and tabular measurements sequentially, without concurrent
   project builds or tests. Read/compress assets before timing. Filesystem caches
   are warm; each timing sample starts a fresh Node process, so module caches are
   never shared between samples or versions.
3. In each child process, run explicit GC and record `heapUsed`. Start
   `performance.now()` immediately before `require` or awaited `import`, and stop
   after module evaluation, eager normalization and index construction complete.
   Node process startup and subsequent GC are outside that timer.
4. Run explicit GC again and subtract the pre-import `heapUsed` from the
   post-import value. Collect this delta before any lookup warmup or search work.
5. Warm CAP and ISTAT lookups with 10,000 calls each, then time 200,000 calls each.
   Cycle through five fixed keys, including a missing key. CAP keys are `35031`,
   `00118`, `25080`, `70121` and `99999`; ISTAT keys are `028001`, `058091`,
   `015146`, `072006` and `999999`.
6. Warm name searches with 25 calls, then time another 25, cycling through
   `Milano`, `San`, `Forli`, `Bolzano` and `zzzzzz`, with `{ limit: 10 }`.
   Accumulate and output results so calls have observable effects.
7. Report medians across the 15 processes. A failed module import is recorded
   as an error rather than assigned a timing or retried with different semantics.

## Reproducing the comparison

Use separate clean checkouts of the before/after revisions above, the same Node
and npm versions, and unchanged `src/data/gi_*.json`. The baseline does not contain
the harness, so first copy it from the tabular checkout:

```sh
cp scripts/benchmark.mjs /tmp/iccp-benchmark.mjs
```

Then run the following in **each** checkout. Use `baseline` for the original
revision and `tabular` for the optimized revision:

```sh
benchmark_label=baseline
benchmark_directory="/tmp/iccp-comparison/$benchmark_label"
mkdir -p "$benchmark_directory"
npm ci
npm run build
npm pack --dry-run --ignore-scripts --json > "$benchmark_directory/pack.json"
node /tmp/iccp-benchmark.mjs dist "$benchmark_directory/results.json" "$benchmark_directory/pack.json"
```

Build first: `--ignore-scripts` prevents lifecycle output from contaminating the
pack JSON and measures the artifacts just built. The separate package consumer
check, `npm run test:package`, exercises `prepack` and installs only the resulting
tarball offline. Dependency installation may require network access; ordinary
builds and benchmarks do not fetch geographic datasets.

Keep the two result JSON files and pack manifests together for a new comparison.
The original per-process samples and manifests were retained as local temporary
artifacts, not committed; this document preserves their numerical summary.
See [dataset maintenance](datasets.md) for the generation and validation workflow.

## Limits and interpretation

- The **distributed package saving is measured**, including all copied assets;
  it is smaller than the reduction in uncompressed JSON. Source files themselves
  do not shrink, because preserving the originals is part of the design.
- This is a single-machine desktop measurement with 15 samples per successful
  format. Processes were isolated, but CPU affinity, clock frequency and operating
  system activity were not controlled. The runs were sequential, not randomized
  or interleaved. Quartiles describe the samples; they are not confidence intervals
  or a statistical significance test.
- The initialization measurement covers first import in a fresh process with
  warm filesystem caches. It does not measure cold-disk startup, Node process
  launch, peak initialization memory, build time or browser/network loading.
  CJS and ESM loader setup differs, so compare formats separately.
- The heap result is a **post-GC delta**, not total process memory, RSS, external
  allocations or peak heap. It includes module loading and retained data/indices,
  and is sensitive to V8 and GC behavior. The observed increase is 222,872 bytes
  (+2.46%); no memory reduction is claimed.
- CAP and ISTAT lookup quartiles overlap. Their nanosecond averages are sensitive
  to JIT and timer noise. The search algorithms are unchanged, and these samples
  establish neither a lookup speedup nor a substantial lookup regression. Name
  search is effectively flat for the fixed query set, which is not exhaustive.
- Both output formats are included in distribution totals even though a consumer
  usually selects one. Actual browser bundle size, tree shaking, HTTP transfer
  overhead and CDN compression settings were not measured. Browser-bundler
  functionality was checked separately from performance.
- Absolute package sizes depend on the recorded source, build tools, source maps,
  npm packaging and documentation. Future data or README changes require a new
  size measurement. Reduced JSON size alone does not prove faster initialization.

The measured compressed-package reduction supports the format change. The
observed CJS startup improvement is specific to this environment; lookup behavior
is effectively unchanged and the small measured heap increase remains visible.
