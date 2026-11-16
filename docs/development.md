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

## Conventions

- **Lint/format:** Biome with every stable rule group on. Each exception in `biome.jsonc` states its reason.
- **Types:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Tests:** sentence-style names; hand-written fakes over mocking libraries; synthetic fixtures only, never real chat content.
- **Dependencies:** latest stable releases, but pnpm's minimum release age stays on; a release younger than the cutoff waits. Dependency build scripts are opt-in (`allowBuilds` in `pnpm-workspace.yaml`).
- **Changes:** add a changeset (`pnpm changeset`) for anything that affects a published package.
