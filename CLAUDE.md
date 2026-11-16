# clerkhand

Occam's razor: the simplest thing that works. No speculative abstractions, options or dependencies.

## Safety floor (non-negotiable)

- Never send, edit or delete a message unless the user explicitly says so in this conversation. "Test it" is not permission to send.
- Write tests against the real Teams UI only in the user's own self-chat. Tests that involve newlines or Enter go in the search box, never a compose box.
- Never call `agent-browser` directly against a logged-in profile; go through the `clerkhand-*` CLIs.
- Never commit browser profiles, snapshots, logs or real chat content. Test fixtures are synthetic.
- Do not extract tokens or call Teams/Outlook internal APIs. Do not work around IT controls (conditional access, admin consent).

## Commands

- `pnpm check`: lint, typecheck, test (same as CI)
- `pnpm build` · `pnpm test` · `pnpm format`

See `docs/development.md` for conventions.
