# Teams UI archive

Archived on 2026-11-17 before the agent-messenger migration.

- Source branch: `feat/manage`, tracking `origin/feat/manage`.
- UI source commit: `82ce92d169d63db7a76681a5c803d0c41178f2cb`.
- Archive branch and annotated tag: `archive/teams-ui-m3-2026-11-17`.
- The archive includes the existing transition proposal and README link, saved from the working tree. Its UI source is unchanged from the source commit above.
- Migration base: `origin/main` at `68a1bca` (M3 send, PR #4). PR [#5](https://github.com/Ansarac/clerkhand/pull/5) is separate from this migration.

`pnpm check` passed locally on the UI source: lint, TypeScript build, 16 test files and 159 synthetic tests. The proposal needed Markdown formatting before this check. This is not live Teams validation: the safety fixes for edit, delete and restore, and deletion result confirmation, still have the live verification gaps recorded in the proposal.

Restore the full UI implementation, tests and original rules with:

```sh
git fetch origin --tags
git switch --detach refs/tags/archive/teams-ui-m3-2026-11-17
pnpm install --frozen-lockfile
pnpm check
```

Browser profiles, credentials, network responses, real messages and local debugging directories are excluded. The migration uses a different profile and credential directory.
