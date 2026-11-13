# Contributing

Use a supported Node.js LTS release; Node.js 24 is the development reference.
Keep changes on a feature branch and install the locked development dependencies
with `npm ci`.

```sh
npm test
npm run type-check
npm run lint
npm run build
npm run test:build
npm run test:package
```

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
