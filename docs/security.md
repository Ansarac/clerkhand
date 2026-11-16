# Security model

Safety is enforced by the tool and by agent permissions, never by prompts alone.

## Action levels

| Level                       | Commands                                | Default permission | Status  |
| --------------------------- | --------------------------------------- | ------------------ | ------- |
| Read                        | `status`, `chats`, `read`               | allow              | v0.1    |
| Draft (private, reversible) | `draft`, `draft show`, `draft clear`    | allow              | planned |
| Visible to others           | `send`, `edit`, `delete`, `undo-delete` | ask every time     | planned |

`read` opens the chat in the browser, which marks it as read in Teams and can show read receipts to others.

## Layers

1. **Command surface.** Only the actions above exist. There is no pass-through to the browser driver.
2. **Agent permissions.** `clerkhand-teams setup claude` allows the read commands and denies running `agent-browser` directly (`agent-browser`, `npx`, `pnpm exec`, `pnpm dlx`). Claude Code matches command prefixes, so a full path to the binary is not caught; see [limits](#limits).
3. **Browser action policy.** Every call passes a deny-by-default policy that allows only the actions the tool uses (`navigate`, `viewport`, `evaluate`, `wait`, `close`). Typing and key presses (`fill`, `type`, `press`, `keyboard`, …) are rejected by agent-browser itself. The policy stays bound to the running browser session, so a plain direct call without a policy is rejected too.
4. **Checks in the commands.** Page scripts locate elements by role and stable ids, never by visible text across the whole page. Before reading, `read` verifies that the open chat's header carries the requested thread id, and it fails if the open chat changes while reading.

## Limits

- The tool needs `evaluate` to read the page, so the policy cannot stop script evaluation. Anyone who can run `agent-browser` against the session, or pass it a different `--action-policy`, can do anything the page allows. Layer 2 is what keeps an agent from doing that; for a hard boundary, also deny the binary path or use a sandbox or a PreToolUse hook.
- The browser profile holds your Teams login. Treat the data directory like a password (see [overview](overview.md#data-directory)).
- Message text is untrusted input. The tool skill tells the agent to treat it as data, not instructions.

## Dependencies

- agent-browser is pinned to an exact version; 0.x releases have changed policy matching before.
- Dependency build scripts and dependency-provided agent skills are denied in `pnpm-workspace.yaml`. agent-browser's own skills would teach agents to drive the browser directly.
