# Teams

`clerkhand-teams` drives the Teams web app (`teams.cloud.microsoft`) in its own headless Microsoft Edge profile. Every command prints one JSON object:

```json
{"ok":true,"data":{}}
{"ok":false,"error":{"code":"chat_not_found","message":"…","details":{}}}
```

Exit codes: `0` ok, `1` error, `2` usage error.

## Commands

| Command                                          | Output                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `login`                                          | Opens a visible window for sign-in, then closes it. `{signedIn}`                       |
| `status`                                         | `{ready, signedIn, lang}`                                                              |
| `chats [--unread] [--limit N]`                   | `{chats: [{id, name, kind, folder, unread, muted}]}`                                   |
| `read <chat> [--last N]`                         | `{chat: {id, name, kind}, messages: [{id, author, time, text, edited}]}`, oldest first |
| `setup claude [--scope user\|project] [--write]` | Shows (or writes) Claude Code permission rules and the tool skill                      |

Browser commands accept `--headed` to show the window for debugging.

- `kind` is `oneOnOne`, `group`, `meeting`, `self` or `other`.
- `<chat>` is a chat `id` (stable Teams thread id, preferred) or a display name. Names match exactly, then case-insensitively; duplicates fail with `ambiguous_chat` and candidates. Nothing is guessed.
- `--last` defaults to 20, maximum 200. Older messages are loaded by scrolling.
- `read` marks the chat as read.

## Sign-in

Most corporate setups sign in automatically through Edge SSO, even headless. If `status` reports `signedIn: false`, run `clerkhand-teams login` and finish the sign-in in the window.

## Scope and limits (v0.1)

- English Teams UI only; other languages fail with `unsupported_language`.
- Chats only, no channels.
- Only chats in the sidebar can be opened. Deep links stop at a "use the web app" launcher page, so they are not used.
- Chat lists in compact view have no message preview; `chats` does not report one.
- The first run after a new profile takes up to a minute while Teams caches its assets; later commands take about a second.
- Collapsed sidebar folders are expanded briefly to read or click a chat and collapsed again. The folder state belongs to the clerkhand profile, not to your own Teams.
