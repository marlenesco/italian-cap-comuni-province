# Releasing the scoped fork

## Package identity and ownership

This fork prepares `@marlenesco/italian-cap-comuni-province` at **1.2.0**. It is
independent of the unscoped package maintained by
[SpritzCoder](https://github.com/spritzcoder/italian-cap-comuni-province).
The original author and MIT license are retained. Runtime exports and geographic
records are unchanged by the scoped-package preparation.

The personal npm account `marlenesco` was verified during preparation. An
authenticated registry lookup returned E404 for the scoped package on 2026-11-13;
this is an availability check, not a reservation. No package has been published.
Local personal authentication is kept in a separate user configuration outside
the repository. Do not commit it, copy it into Actions, or replace corporate npm
configuration. To verify a personal session explicitly:

```sh
npm whoami --registry=https://registry.npmjs.org/ --userconfig="$HOME/.npmrc-personal"
```

All installation examples use the scoped name. Consumers can also retain the
original import path using npm's alias syntax:

```sh
npm install italian-cap-comuni-province@npm:@marlenesco/italian-cap-comuni-province@1.2.0
```

These registry installation commands become usable after the first publication.

The registry is **npmjs.org**, while GitHub Actions is the **publisher**. This is
separate from [GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry),
which uses `npm.pkg.github.com` and requires consumer authentication even for its
public npm packages. This fork keeps the public npm registry for ordinary installs.

## Merge-to-npm policy

The workflow is [`.github/workflows/npm-release.yml`](../.github/workflows/npm-release.yml).
It validates PRs targeting `main` and pushes to `main`, and supports manual runs.
It does not merge PRs, edit `main`, create version commits, or publish to the
upstream package. Publishing is disabled while `NPM_PUBLISH_ENABLED` is unset.

```text
Garda update → validated dataset PR + patch version → maintainer review → merge
    → offline data verification + tests + type check + lint + watch/build checks
    → installed-tarball CJS/ESM/browser checks → npm pack → version availability
    → publish the verified tarball to the personal npm scope
```

The version is reviewed in the PR, rather than invented after merge:

- Dataset proposals include a patch bump in `package.json` and `package-lock.json`.
- For other distributed changes, run `npm version patch --no-git-tag-version
  --ignore-scripts` on the feature branch, using `minor` or `major` when appropriate.
- The PR check rejects changes to runtime sources, build/data-generation helpers,
  package metadata or the license without a numerically newer stable version.
  Documentation-only or workflow-only changes can keep the version.
- If the version is already public, publication is skipped. Registry failures other
  than an actual 404 stop the job. npm versions cannot be overwritten.
- If another release merges before a dataset PR, rebase the proposal and adjust its
  version before merging. The bot does not overwrite existing proposals.

Configure branch protection/rulesets to require the validation check and PR review;
without that repository setting, a direct push can bypass the PR version policy.
The release uses the exact triggering commit and the tarball produced by its
validation job. It never downloads fresh Garda data during a release. Release
runs are serialized with `queue: max` (up to 100 pending runs); they are not
cancelled when a later merge arrives. PR runs use separate concurrency groups.
The workflow does not create GitHub releases or tags; npm is the publication target.

`queue: max` follows [GitHub's concurrency specification](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
The local actionlint 1.7.12 validator does not yet recognize this property. The
remaining workflow checks pass with only that specific unknown-key diagnostic
excluded. GitHub accepted the workflow and the [validation run](https://github.com/marlenesco/italian-cap-comuni-province/actions/runs/43447019732)
passed on Linux/Node.js 24, including all 271 tests and the packed consumers. The
publication job was skipped. The watch test strips ANSI colors when recognizing
build completion, including when CI emits colors that local terminals suppress.

## Repository configuration

The following settings were configured on the personal fork on **2026-11-13**:

| Setting | Value |
| --- | --- |
| Environment | `npm` |
| Allowed deployment ref | Branch `main` only; no tag rule |
| Repository variable `NPM_PUBLISH_ENABLED` | `false` |
| Environment secret | `NPM_BOOTSTRAP_TOKEN`, stored encrypted in environment `npm` |
| Required check on `main` | GitHub Actions `validate`, with the branch up to date |
| Pull request requirement | Enabled, including for administrators |
| Additional approving reviewers | 0, allowing the sole maintainer to merge their PR |
| Force pushes and branch deletion | Disabled on `main` |

The [fork setup PR](https://github.com/marlenesco/italian-cap-comuni-province/pull/1)
contains the workflow. It must be reviewed and merged before a manual release can
be dispatched on `main`. The separate upstream optimization PR remains unchanged.
The bootstrap token belongs to personal account `marlenesco`, has read/write
publication access only to `@marlenesco`, and has no organization access. At the
maintainer's request it uses the maximum 90-day lifetime, nominally expiring on
**2027-02-11**. npm separately announces revocation of direct-publishing bypass-2FA
tokens in **January 2027**, so that registry policy can shorten the nominal
lifetime. See [npm's access-token policy](https://docs.npmjs.com/about-access-tokens/).
The token value is held only in the GitHub environment secret; it is not tracked
in the repository or copied from local npm login configuration.

The scoped package is still unpublished, and its npm trusted-publisher
configuration is pending the first release. The creation of a credential does
not create or publish a package.

Environment restrictions and the publication variable are independent: even a
passing validation run does not authorize publication while the variable is false.

## One-time activation, performed separately

Repository settings are configured separately from tracked code; cloning the repo
does not recreate them. Decide when to activate publishing after reviewing the
initial tarball and the workflow on the fork's `main` branch.

1. Create a GitHub environment named **`npm`**, restricted to the `main` branch.
   Required reviewers are optional; enabling them adds a manual publication approval.
2. The new package needs an initial authenticated publication before it has package
   settings for an npm trusted publisher. To keep even that publication on GitHub,
   create a temporary **personal** granular npm token with direct publish access
   to the personal scope and the required 2FA bypass. Store it only as the `npm`
   environment secret **`NPM_BOOTSTRAP_TOKEN`**. Do not use a corporate account or
   copy a local login token. See [npm's token documentation](https://docs.npmjs.com/creating-and-viewing-access-tokens/).
3. Set the repository variable **`NPM_PUBLISH_ENABLED=true`** only when ready to
   publish. For the first release, manually run **Validate and release the scoped
   package** on `main`, selecting both **publish** and **bootstrap**. The token's
   `npm whoami` must equal `marlenesco`; otherwise the job stops before publishing.
   A normal manual run leaves both checkboxes off and only validates/packs.
4. After the first publication, configure npm trusted publishing on the scoped
   package with these exact values:

   | Setting | Value |
   | --- | --- |
   | Provider | GitHub Actions |
   | Organization or user | `marlenesco` |
   | Repository | `italian-cap-comuni-province` |
   | Workflow filename | `npm-release.yml` |
   | Environment | `npm` |
   | Allowed action | Direct publishing with `npm publish` |

   npm currently defaults new connections to staged publishing; explicitly allow
   direct publication to support publication after merge without another npm approval.
   Trusted publishing uses OIDC, a GitHub-hosted runner, Node.js 24 and npm >=11.5.1;
   the job has `id-token: write`. The fork's `repository.url` must match GitHub.
   See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
5. For the first OIDC release, leave **bootstrap** off. After that OIDC release
   succeeds, delete the bootstrap secret and revoke the temporary token. Future
   merges use OIDC with no npm token or interactive login. Schedule a real next
   version within npm's two-day first-use window for the new trusted-publisher
   connection, or create that connection when the next version is ready.
6. After a successful OIDC release, restrict traditional token publishing in npm
   package settings if desired. Remove the temporary "not published yet" notices
   from this guide and the README once the first release is public.

The bootstrap credential and repository controls are prepared. The first
publication and trusted-publisher registration remain pending operational steps.
No local `npm publish` is needed.

## Local preparation and recovery

```sh
npm ci
npm run data:verify
npm test
npm run type-check
npm run lint
npm run test:build
npm run test:package
node scripts/release.mjs pack /tmp/iccp-release
```

The last command builds and packs, never publishes. It validates the personal
package identity, registry, repository and lockfile, then retains `pack.json`
(inventory and npm integrity) beside the tarball. `node scripts/release.mjs status`
only queries whether the current version is already public.

For a failed release, fix the cause and manually rerun on `main` with **publish**
selected and **bootstrap** off. An existing public version is skipped, including
when a publish succeeded before the workflow lost its connection. Correcting a
published package requires a new version in a PR; do not attempt to overwrite it.
Set `NPM_PUBLISH_ENABLED=false` to disable publication while retaining validation.
Dataset proposal automation is controlled separately by `ENABLE_DATA_UPDATE_PRS`.
