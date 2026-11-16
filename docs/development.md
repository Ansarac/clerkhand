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
pnpm --dir packages/teams link --global   # optional: puts clerkhand-teams on PATH
```

It uses the real data directory unless `CLERKHAND_HOME` is set. Test write actions only in your own self-chat, and never send (see `CLAUDE.md`).

## Page functions

Code in `packages/*/src/page/` runs inside the browser: the driver sends `fn.toString()` and calls it there. A page function must not reference imports or anything outside its own body. Tests rebuild each one from its source (`inPage` in `test/helpers.ts`) and run it against synthetic happy-dom markup, so an outside reference fails in tests, not in the browser.

## Conventions

- **Lint/format:** Biome with every stable rule group on. Each exception in `biome.jsonc` states its reason.
- **Types:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Tests:** sentence-style names; hand-written fakes over mocking libraries; synthetic fixtures only, never real chat content.
- **Dependencies:** latest stable releases, but pnpm's minimum release age stays on; a release younger than the cutoff waits. Dependency build scripts are opt-in (`allowBuilds` in `pnpm-workspace.yaml`).
- **Changes:** add a changeset (`pnpm changeset`) for anything that affects a published package.
