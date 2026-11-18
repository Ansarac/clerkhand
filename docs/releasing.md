# Releasing

Releases are GitHub releases built by GitHub Actions (`.github/workflows/release.yml`), never on a laptop. They are not published to npm.

1. Every change to a package adds a changeset (`pnpm changeset`). `@clerkhand/core` and `@clerkhand/teams` share one version (changesets `fixed` group).
2. On each push to `main` with pending changesets, the `version` job opens or updates the **chore: version packages** PR, which bumps the version and writes `CHANGELOG.md`.
3. Merging that PR runs the `release` job in the `release` environment: `pnpm check`, build, then `scripts/release.mjs pack` and `notes`. It attests the tarballs' build provenance and creates the release `v<version>` with these assets:
   - `clerkhand-core-<version>.tgz`
   - `clerkhand-teams-<version>.tgz`, whose `@clerkhand/core` dependency is the core tarball URL of the same release, so one install command fetches both
   - `clerkhand-teams.tgz`, the same file under a stable name for `releases/latest/download/`

Install or upgrade:

```sh
npm install -g https://github.com/Ansarac/clerkhand/releases/latest/download/clerkhand-teams.tgz
```

Verify a downloaded tarball with `gh attestation verify <file> --repo Ansarac/clerkhand`.

The version PR is opened with the workflow token, so GitHub does not run CI on it and the required `check` never reports. Merge it with an administrator bypass, or later switch the workflow to a GitHub App token.

## Local dry run

```sh
pnpm build
CLERKHAND_CORE_URL="file:$(pwd)/release/clerkhand-core-<version>.tgz" node scripts/release.mjs pack
git checkout packages/teams/package.json   # pack rewrites the core dependency
npm install -g --prefix /tmp/clerkhand-try release/clerkhand-teams.tgz
```

## One-time setup

1. **Tag ruleset:** the **release tags** ruleset targets `v*` and blocks updates and deletions, so a published release tag can never move. Creation stays allowed: on a personal-account repository the GitHub Actions app cannot be a bypass actor, and only accounts with write access (the owner and the release workflow) can create tags.
2. **Actions:** Settings → Actions → General → allow GitHub Actions to create and approve pull requests (for the version PR).
3. **Optional:** Settings → Environments → `release` (created on the first run): add yourself as a required reviewer so every release waits for your approval.
