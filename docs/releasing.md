# Releasing

Releases are published from GitHub Actions (`.github/workflows/release.yml`), never from a laptop.

1. Every change to a published package adds a changeset (`pnpm changeset`).
2. On each push to `main` with pending changesets, the `version` job opens or updates the **chore: version packages** PR, which bumps versions and writes `CHANGELOG.md`.
3. Merging that PR runs the `publish` job in the `npm` environment: `pnpm check`, build, then `scripts/release.mjs publish`. It packs each unpublished package with `pnpm pack` (which replaces `workspace:` ranges) in dependency order, publishes it with `npm publish` using npm trusted publishing (OIDC; provenance is automatic for this public repository), and creates the GitHub release and tag `@clerkhand/<name>@<version>` with the changelog section.

`node scripts/release.mjs check` shows locally which versions are not on npm yet.

The version PR is opened with the workflow token, so GitHub does not run CI on it and the required `check` never reports. Merge it with an administrator bypass, or later switch the workflow to a GitHub App token.

## One-time setup

npm only lets you configure a trusted publisher for a package that already exists, so the first release uses a short-lived token from CI and later releases use OIDC only.

1. **npm:** create the organization `clerkhand` (free, public packages) on npmjs.com.
2. **npm:** create a granular access token with read and write access to the `@clerkhand` scope, expiring in a few days.
3. **GitHub:** Settings → Environments → new environment `npm`. Add required reviewer(s) so every publish waits for your approval, restrict it to the `main` branch, and add the token as the environment secret `NPM_TOKEN`.
4. **GitHub:** Settings → Actions → General → allow GitHub Actions to create and approve pull requests. In the **release tags** ruleset, add the GitHub Actions app as a bypass actor; otherwise the workflow cannot create `@clerkhand/*@*` tags.
5. Merge the first version PR, approve the `npm` deployment and check that `@clerkhand/core` and `@clerkhand/teams` appear on npm with GitHub releases.
6. **npm:** for each package, Settings → Trusted publisher → GitHub Actions: owner `Ansarac`, repository `clerkhand`, workflow `release.yml`, environment `npm`; allow publishing (not stage-only). Then enable "Require two-factor authentication and disallow tokens".
7. **GitHub:** delete the `NPM_TOKEN` secret, and revoke the token on npm. Later releases authenticate with OIDC only.

A trusted publisher must be used within two days of being created, or it expires and has to be recreated.
