# clerkhand

Occam's razor: the simplest thing that works. No speculative abstractions, options or dependencies.

## Safety floor (non-negotiable)

- Never send, edit or delete a message unless the user explicitly says so in this conversation. "Test it" is not permission to send.
- Live message validation is limited to the user's own self-chat, and sends only when the user asks for it in this conversation. Sending is limited to the self-chat (`draft` then `send --confirm`); editing, deleting and restoring are not exposed.
- Never call `agent-browser` directly against a logged-in profile; go through the `clerkhand-*` CLIs.
- Never commit browser profiles, snapshots, logs or real chat content. Test fixtures are synthetic.
- Only `clerkhand-teams auth refresh` may capture the user's normal Teams Skype credential from its dedicated browser profile. Never print, manually copy or pass credentials on a command line.
- Teams data operations go through clerkhand's own GET-only client for the Teams chat service. Never call Teams APIs with the managed credential from ad-hoc scripts, and never run agent-browser directly against authenticated state.
- Do not work around IT controls (conditional access, admin consent). If normal sign-in is blocked, report the failure.

## Commands

- `pnpm check`: lint, typecheck, test (same as CI)
- `pnpm build` · `pnpm test` · `pnpm format`

See `docs/development.md` for conventions.
