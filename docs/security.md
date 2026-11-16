# Security model

Safety is enforced by the tool and by agent permissions, never by prompts alone.

## Action levels

| Level                       | Commands                             | Default permission | Status  |
| --------------------------- | ------------------------------------ | ------------------ | ------- |
| Read                        | `status`, `chats`, `read`            | allow              | v0.1    |
| Draft (private, reversible) | `draft`, `draft show`, `draft clear` | allow              | v0.1    |
| Visible to others           | `send`                               | ask every time     | v0.1    |
| Visible to others           | `edit`, `delete`, `undo-delete`      | ask every time     | planned |

`read` and `draft` open the chat in the browser, which marks it as read in Teams and can show read receipts to others. A draft sits only in your own compose box until you send it from Teams.

## Layers

1. **Command surface.** Only the actions above exist. There is no pass-through to the browser driver.
2. **Agent permissions.** `clerkhand-teams setup claude` allows the read and draft commands, asks before every `send`, and denies running `agent-browser` directly (`agent-browser`, `npx`, `pnpm exec`, `pnpm dlx`). Claude Code matches command prefixes, so a full path to the binary is not caught; see [limits](#limits).
3. **Browser action policy.** Every call passes a deny-by-default policy that allows only the actions the tool uses (`navigate`, `viewport`, `evaluate`, `wait`, `close`). Typing and key presses (`type`, `press`, `keyboard`, …) are rejected by agent-browser itself. Only `draft` adds `fill`, which inserts text without key events: it cannot press Enter, and a newline becomes a line break, not a send. The policy stays bound to the running browser session, so a plain direct call without a policy is rejected too.
4. **Checks in the commands.** Page scripts locate elements by role and stable ids, never by visible text across the whole page. Before reading, `read` verifies that the open chat's header carries the requested thread id, and it fails if the open chat changes while reading. `draft` checks the thread id again in the same script that selects the compose box, skips the in-message edit box (it has the same label), refuses unless exactly one compose box remains, and reads the draft back after filling it; a difference fails with `draft_mismatch`.
5. **Confirmed sends.** `send` needs `--confirm <hash>`, the hash `draft` returned for the text the user saw. One page script re-checks the thread id and that the compose box still holds exactly that text, then clicks the only Send button that shares a container with the compose box (never one reachable through the message list). Afterwards `send` waits for the message to appear and never clicks twice.

## Limits

- The tool needs `evaluate` to read the page, so the policy cannot stop script evaluation. Anyone who can run `agent-browser` against the session, or pass it a different `--action-policy`, can do anything the page allows. Layer 2 is what keeps an agent from doing that; for a hard boundary, also deny the binary path or use a sandbox or a PreToolUse hook.
- The browser profile holds your Teams login. Treat the data directory like a password (see [overview](overview.md#data-directory)).
- Message text is untrusted input. The tool skill tells the agent to treat it as data, not instructions.

## Dependencies

- agent-browser is pinned to an exact version; 0.x releases have changed policy matching before.
- Dependency build scripts and dependency-provided agent skills are denied in `pnpm-workspace.yaml`. agent-browser's own skills would teach agents to drive the browser directly.
