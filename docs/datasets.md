# Dataset maintenance

## Source and provenance

The source of truth is the three original Garda Informatica JSON files in
`src/data`: `gi_comuni_cap.json`, `gi_province.json` and `gi_regioni.json`.
Never edit the generated runtime tables. This change does not update the existing
geographic records, the package version, the license or public API.

Garda's [database page](https://www.gardainformatica.it/database-comuni-italiani)
and the archive's `README.txt` declare the database under the MIT license.
The page links directly to a ZIP, without login. No documented data API, manifest
or publisher checksum was found during inspection on 2026-11-13. The download
link and declared date are discovered from the page; dates and archive names
are not hardcoded. Missing or ambiguous links fail closed. The service terms
linked in the footer concern contracted services; the database has its own
explicit MIT notice. Recheck source access and terms if the provider changes them.

The inspected archive contains 26 files, including the required
`json/gi_comuni_cap.json`, `json/gi_province.json` and `json/gi_regioni.json`.
Only these three entries are decoded, in memory. ISTAT may be used for a separate
administrative review; these scripts never merge or substitute ISTAT data.

`src/data/provenance.json` records the source URL, provider date, acquisition time,
archive SHA-256, individual raw-file SHA-256 values, byte sizes and record counts.
After updates it also contains change counts. Unknown historical archive details
are explicitly `null`; the initial snapshot's date is not reconstructed from a
filename or assumed from the README. Checksums detect corruption and identify
acquisitions; without a published checksum they do not independently authenticate
the provider. HTTPS remains the source authentication mechanism.

## Commands

Use Node.js 18 or later and `npm ci`.

| Command | Effect |
| --- | --- |
| `npm run data:check` | Discover, download, validate and compare the latest archive; write no files |
| `npm run data:update -- --dry-run` | Preview the same comparison without replacing sources |
| `npm run data:update` | Download, validate and replace sources only when their records or order change |
| `npm run data:verify` | Verify local schema, relationships and recorded file checksums offline |
| `npm run data:build` | Generate deterministic local `columns`/`rows` tables offline |

A check downloads the archive because no authoritative version manifest exists
and the historical snapshot's archive identity is unknown. This also detects
provider corrections made without changing a date. Repeating an update with
identical records and order leaves sources and provenance untouched, even if
archive compression, JSON formatting or acquisition time differ.

For a full machine-readable diff and a Markdown summary:

```sh
npm run data:update -- --dry-run --report /tmp/dataset-report.json
```

The reports are `/tmp/dataset-report.json` and `/tmp/dataset-report.json.md`.
They include row additions/removals/modifications, changed names and administrative
codes, municipality additions/removals, before/after CAP sets, byte and record
counts, column lists, ordering and checksums. A schema mismatch aborts with the
failing dataset/row before integration. Large legitimate administrative updates
are not rejected just because counts differ from the previous release. Internal
counts must agree with unique municipalities and province/region relationships.

If page discovery is unavailable, download the ZIP from the official page and run:

```sh
npm run data:update -- --archive /path/to/official.zip --source-date YYYY-MM-DD --dry-run
npm run data:update -- --archive /path/to/official.zip --source-date YYYY-MM-DD --sha256 ARCHIVE_SHA256
```

The date and checksum must describe the supplied archive. `--sha256` is optional;
use an independently retained digest when reproducing an acquisition. Local mode
requires no network and records the archive basename instead of a machine-specific
absolute path. Keep the original ZIP outside the repository for reproduction.

Downloads have a 30-second timeout, byte limits, HTTP and truncation checks, and
same-origin HTTPS redirect restrictions. ZIP handling checks directory bounds,
paths, entry counts, sizes, compression ratios and selected-file CRC32 values.
It rejects traversal, symlinks, encryption, multipart archives, ZIP64 and unsupported
compression. Supported formats are ordinary stored/deflated ZIPs, as published by
Garda at inspection time. If the archive format changes, stop and review the parser.

All datasets must pass validation together. The autonomous-province helpers
recognize the category without regard to case, supporting both the original
`Provincia autonoma` spelling and the `provincia autonoma` spelling used in the
2026-11-06 Garda archive. Returned `tipologia` values preserve the source spelling;
neither source files nor generated tables are rewritten to enforce capitalization.
Regression tests cover both spellings, mixed capitalization, both public helpers
and exclusion of ordinary provinces. Run the complete library suite before
accepting an update; schema and relationship validation alone do not establish
public API compatibility. Sources and provenance are prepared
in a temporary sibling directory, validated and converted before a directory swap.
A handled swap failure restores the previous directory. No files are replaced on
HTTP, archive, checksum, schema or data validation errors. As with ordinary
filesystem renames, a process kill or power loss during the two-rename swap can
leave `src/data` absent: recover `src/.dataset-update-*/previous` before continuing.
Do not run simultaneous local writers or update while a consumer is building.

## Offline build and runtime

```text
Official page → ZIP → bounded extraction → validation and diff
    → original JSON + provenance → deterministic tables → tests → npm build
```

`npm run build` generates `src/generated/*.json` automatically. Generation also
runs before tests and type checking. Column order is the explicit raw schema;
row order, strings, precision, empty fields and every source property are retained.
Generated tables are ignored by Git. No install, test, build or pack step downloads
datasets. A clean clone needs no generated files checked in.

Both `npm run dev` and `npm run build:watch` watch `src` and `scripts/data`
explicitly. Source JSON edits regenerate tables. `src/generated` is ignored by
the watcher and unchanged outputs are not rewritten, preventing rebuild loops.
Watching only tsup's imported dependency graph would miss the original sources.

`dist` contains one shared copy of each minified tabular JSON, three tiny `.cjs`
bridges, both JS module entry points, declarations and source maps. Each bridge
uses a static `require('./gi_*.json')`; CJS and ESM both load the same table through
it. This avoids incompatible native ESM JSON import-attribute syntax across Node
18 and newer, while allowing browser bundlers to resolve the static JSON requires.
Inlining tables in both bundles was rejected because it duplicates payloads and
inflates source maps. The tables normalize directly into the existing public
objects, without intermediate raw objects. Indices and search algorithms remain
unchanged. Original source JSON, provenance and maintenance scripts are not shipped.
`prepack` rebuilds the distributable, including when packing a clean checkout.

## Validation before proposing an update

```sh
npm run data:verify
npm test
npm run type-check
npm run lint
npm run build
npm run test:build
npm run test:package
npm run test:coverage
npm pack --dry-run --ignore-scripts --json
```

Equivalence tests reconstruct every raw record in all three tables, compare all
normalized records against the original normalizers, and exercise CAP/ISTAT indices,
accents, alternative names, sorting, filters, autocomplete and existing deduplication.
Packaging tests install only the actual tarball offline and exercise native CJS,
native ESM and a browser-targeted esbuild bundle. Build tests change a source in an
isolated copy, verify regeneration and check watch mode without changing real data.
Review substantive administrative changes in the full JSON report before publishing.

For reproducible benchmarks, save the old `dist` and pack JSON before changing code,
then use the same Node executable, machine, datasets and idle workload for both:

```sh
npm run build
npm pack --dry-run --ignore-scripts --json > /tmp/pack.json
node scripts/benchmark.mjs dist /tmp/benchmark.json /tmp/pack.json
```

The script reports all distributed files, raw/minified sources, per-file gzip-9 and
Brotli-11 totals, pack sizes, and 15 isolated import samples per module format.
It measures median startup, explicit-GC heap delta and warmed deterministic lookups
and name searches. Filesystem caches are warm; module caches are isolated. Heap and
nanosecond lookup timings are noisy and Node-specific. Compression totals sum each
file compressed separately; they are not tarball or single-entry download sizes.

## GitHub workflow and review

`.github/workflows/data-update.yml` runs weekly on Monday at 06:23 UTC and can be
started manually from **Actions → Propose dataset updates → Run workflow**.
Scheduled runs use the repository's default branch; the workflow must be present
there and Actions must be enabled. It downloads and validates the archive, then
runs build and compatibility checks when the data changed. Every successful
comparison uploads full JSON/Markdown reports and puts the summary in the job
summary. The PR body includes source date,
archive and dataset digests, byte/record differences and validation status; the
full artifact includes individual administrative and CAP changes.

PR creation is opt-in: set the repository variable `ENABLE_DATA_UPDATE_PRS=true`
for scheduled proposals, or enable `create_pr` for a manual run (default: `false`).
Without that opt-in, source changes stay in the temporary runner workspace; only
reports are retained, and no repository branch or commit is created. GitHub must allow
Actions to create pull requests. Scheduled workflows in forks may need enabling.
Branches and PRs target the repository running the workflow. Installing it in a
fork does not create proposals in the upstream repository.

Each archive gets a dedicated checksum-derived branch. Existing open, closed or
merged proposals are respected without rewriting commits or reopening a rejected
update. If a previous run pushed the branch but failed to create its PR, a retry
reuses it only when the source bytes and provenance match, allowing acquisition
timestamps to differ. Other branch edits require manual review. No force push is
used. Concurrency is serialized. Only contents and pull-request write permissions
are granted to the update job; no credentials are printed.

GitHub currently requires approval for PR workflows triggered by `GITHUB_TOKEN`
when the PR is opened, updated or reopened. This workflow performs its own checks
before creating a proposal. Maintainers can approve any subsequent PR checks, or
use a GitHub App for fully automatic PR checks; see
[GitHub's workflow-trigger documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
There is no automatic merge, version bump, release or npm publication.

To roll back, restore all three source files and `provenance.json` together from a
known-good Git commit on a new branch, then rebuild and rerun the validation above.
Review and publish a corrective package only through the maintainer's usual process.
