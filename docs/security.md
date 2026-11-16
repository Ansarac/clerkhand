# Security model

Safety is enforced by the tool and by agent permissions, never by prompts alone.

## Action levels

| Level                       | Commands                                | Default permission |
| --------------------------- | --------------------------------------- | ------------------ |
| Read                        | `status`, `chats`, `read`               | allow              |
| Draft (private, reversible) | `draft`, `draft show`, `draft clear`    | allow              |
| Visible to others           | `send`, `edit`, `delete`, `undo-delete` | ask every time     |

## Layers

1. **Command surface.** Only the actions above exist; there is no pass-through to the browser driver.
2. **Agent permissions.** `clerkhand-teams setup claude` writes allow/ask/deny rules and denies calling `agent-browser` directly.
3. **Browser rules.** Key-press commands (`press`, `keydown`, `keyup`, `keyboard`, `type`) are blocked at the driver.
4. **Read-back checks.** Every write verifies the target chat, a single compose box, and the resulting text. `send` requires the hash of the draft you confirmed and re-checks it before sending.

_Details are filled in as the commands land._
