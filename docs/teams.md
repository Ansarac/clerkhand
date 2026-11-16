# Teams

`clerkhand-teams` drives the Teams web app (`teams.cloud.microsoft`) in its own headless Microsoft Edge profile. Every command prints one JSON object:

```json
{"ok":true,"data":{}}
{"ok":false,"error":{"code":"chat_not_found","message":"…","details":{}}}
```

Exit codes: `0` ok, `1` error, `2` usage error.

## Commands

| Command                                          | Output                                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `login`                                          | Opens a visible window for sign-in, then closes it. `{signedIn}`                                |
| `status`                                         | `{ready, signedIn, lang}`                                                                       |
| `chats [--unread] [--limit N]`                   | `{chats: [{id, name, kind, folder, unread, muted}]}`                                            |
| `read <chat> [--last N]`                         | `{chat: {id, name, kind}, messages: [{id, author, time, text, edited, deleted}]}`, oldest first |
| `draft <chat> --text T`                          | Replaces the unsent draft and reads it back. `{chat: {id, name, kind}, draft, hash}`            |
| `draft show <chat>`                              | `{chat, draft, hash}`; `draft` is `""` when there is none                                       |
| `draft clear <chat>`                             | Removes the unsent draft. `{chat, draft: "", hash}`                                             |
| `send <chat> --confirm <hash>`                   | Sends the draft if its hash is `<hash>`. `{chat, sent: {id, author, time, text, edited}}`       |
| `edit <chat> <message> --text T`                 | Replaces the text of your own message. `{chat, edited: {…message}}`                             |
| `delete <chat> <message>`                        | Deletes your own message. `{chat, deleted: {…message}}`                                         |
| `undo-delete <chat> <message>`                   | Restores your own deleted message. `{chat, restored: {…message}}`                               |
| `setup claude [--scope user\|project] [--write]` | Shows (or writes) Claude Code permission rules and the tool skill                               |

Browser commands accept `--headed` to show the window for debugging.

- `kind` is `oneOnOne`, `group`, `meeting`, `self` or `other`.
- `<chat>` is a chat `id` (stable Teams thread id, preferred) or a display name. Names match exactly, then case-insensitively; duplicates fail with `ambiguous_chat` and candidates. Nothing is guessed.
- `--last` defaults to 20, maximum 200. Older messages are loaded by scrolling.
- `read` and `draft` open the chat, which marks it as read.
- `<message>` is a message `id` from `read`. `edit`, `delete` and `undo-delete` scroll up to find it, act only on your own messages (`not_own_message` otherwise), and wait up to 15 s for the change to show; if it does not, they fail with `*_unconfirmed` and never click again. A deleted message reads as `deleted: true` with empty `text`.
- `edit` fills Teams' edit box, reads it back, and only then clicks Done; on a mismatch it discards the edit (`edit_mismatch`).
- `draft` never sends. Newlines in `--text` become line breaks. The draft is the compose box content; Teams keeps it per chat.
- `hash` is the first 12 hex digits of the SHA-256 of the draft text. `send` refuses (`draft_changed`) unless the draft still has the confirmed hash, and refuses an empty draft (`draft_empty`). It then waits up to 15 s for the message to appear in the chat; if it does not, it fails with `send_unconfirmed` and never clicks again.

## Sign-in

Most corporate setups sign in automatically through Edge SSO, even headless. If `status` reports `signedIn: false`, run `clerkhand-teams login` and finish the sign-in in the window.

## Scope and limits (v0.1)

- English Teams UI only; other languages fail with `unsupported_language`.
- Chats only, no channels.
- Only chats in the sidebar can be opened. Deep links stop at a "use the web app" launcher page, so they are not used.
- Chat lists in compact view have no message preview; `chats` does not report one.
- The first run after a new profile takes up to a minute while Teams caches its assets; later commands take about a second.
- Collapsed sidebar folders are expanded briefly to read or click a chat and collapsed again. The folder state belongs to the clerkhand profile, not to your own Teams.
