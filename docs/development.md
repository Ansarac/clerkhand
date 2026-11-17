# Development

Requirements: Node 26 (`.node-version`), pnpm 12 (`packageManager` in `package.json`).

```sh
pnpm install
pnpm exec lefthook install   # optional pre-commit hooks (no auto-fix)
pnpm check                   # lint + typecheck + test, same as CI
```

## Layout

- `packages/<name>/src`: source, built with `tsc -b` to `dist/`
- `packages/<name>/test`: Vitest tests (type-checked via `tsconfig.test.json`)
- `test/setup.ts`: gives every test its own temporary `CLERKHAND_HOME`

## Running the CLI locally

```sh
pnpm build
node packages/teams/dist/cli.js status
```

To put `clerkhand-teams` on PATH (pnpm 12 has no `link --global`):

```sh
pnpm setup                                        # once: adds PNPM_HOME to PATH, then open a new terminal
pnpm add -g "link:$(pwd)/packages/teams"           # symlink, so rebuilds take effect
```

The repo's `.claude/settings.json` allows authentication and reads and denies direct browser/upstream access. The CLI uses the real data directory unless `CLERKHAND_HOME` is set. Live message checks are read-only and confined to self-chat (see `CLAUDE.md`).

## Authentication and upstream integration

The Teams package owns the dedicated `teams-auth` profile and managed credential file. Data access is the GET-only client in `packages/teams/src/api.ts`; keep it free of write methods until a confirmation design exists, and do not restore the archived UI backend. Tests use synthetic JWT claims and messages, hand-written browser and `fetch` fakes and temporary data directories.

An authenticated response must match the request's user identity, and the new credential must pass a Teams identity request before atomic replacement. Authentication errors, file ownership, permissions, cleanup and output suppression are observable test invariants. On Windows, validate ACL behavior as well as Unix mode checks in CI.

## Conventions

- **Lint/format:** Biome with every stable rule group on. Each exception in `biome.jsonc` states its reason.
- **Types:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Tests:** sentence-style names; hand-written fakes over mocking libraries; synthetic fixtures only, never real chat content.
- **Dependencies:** latest stable releases, but pnpm's minimum release age stays on; a release younger than the cutoff waits. Dependency build scripts are opt-in (`allowBuilds` in `pnpm-workspace.yaml`).
- **Changes:** add a changeset (`pnpm changeset`) for anything that affects a published package.
