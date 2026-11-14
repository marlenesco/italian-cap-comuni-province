# Contributing

Development requires Node.js 22.12 or newer for the test toolchain; Node.js 24
is the development reference. This does not change the published library's
runtime Node.js requirement.
Keep changes on a feature branch and install the locked development dependencies
with `npm ci`.

```sh
npm run audit
npm test
npm run type-check
npm run lint
npm run build
npm run test:build
npm run test:package
```

CI runs these checks on Node.js 22, 24 and 26. The dependency audit includes
development tools and fails the job when npm reports vulnerabilities. A successful
`npm ci` alone does not establish a clean audit. Keep the Vitest runner and its
coverage provider on matching versions when updating the test toolchain.

The scoped npm override for `@typescript-eslint/typescript-estree` selects
`minimatch >=11.0.1` to address
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Its declared minimatch 9 range does not include a patched release. The override
is limited to this development dependency; parser integration tests exercise
project-service allowlist matching, including hidden files and rejected paths.
Remove it when typescript-eslint declares a compatible patched dependency.

The build and tests generate local runtime tables automatically from the original
JSON files in `src/data`. Do not commit `src/generated`, `dist`, ZIP archives or
local benchmark/report artifacts. Do not change geographic data as part of a
format-only optimization.

See [Dataset maintenance](docs/datasets.md) for source discovery, offline import,
dry-run reports, checksum verification, generation, workflow proposals, rollback
and benchmark reproduction. Review dataset updates separately from API changes.
For the scoped fork, see [Releasing](docs/releasing.md). Dataset proposals include
a patch version bump. A separate, initially disabled workflow can publish the
reviewed version after merge to `main`. Keep version changes in PRs and never
commit npm credentials.
