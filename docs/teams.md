# Teams

Requires Node 26, Microsoft Edge, and a work-account Teams web login permitted by your tenant. Use `CLERKHAND_BROWSER` for another installed Chromium executable. Normal login, MFA and conditional access are handled in the browser.

```sh
npm install -g https://github.com/Ansarac/clerkhand/releases/latest/download/clerkhand-teams.tgz
clerkhand-teams setup claude --write
clerkhand-teams auth refresh --headed --wait 180
clerkhand-teams whoami
clerkhand-teams chats --unread
```

Run the same install command to upgrade. From a source checkout, use `node packages/teams/dist/cli.js` after `pnpm install --frozen-lockfile && pnpm build` (see [development](development.md)).

| Command                                     | Behavior                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `auth status` / `status`                    | Local credential expiry check; does not prove online validity.                                                                   |
| `auth refresh [--headed] [--wait N]`        | Get and verify a Skype token from the dedicated profile. Default 30 seconds; maximum 300. First login normally needs `--headed`. |
| `whoami`                                    | Verify identity online; returns display name without credentials.                                                                |
| `chats [--limit N] [--unread]`              | List self, 1:1, group and meeting chats, default 20, maximum 200; use returned exact IDs.                                        |
| `read <chat-id> --unread [--last N]`        | Only messages after the read marker; `unread_unknown` when Teams has none.                                                       |
| `find <name>`                               | Find chats by group/meeting name, 1:1 partner, or last sender of a group. Returns all matches.                                   |
| `read <chat-id                              | self> [--last N]`                                                                                                                | Recent history, oldest first; default 20, maximum 200. |
| `draft <chat-id\|self> --text T`            | Preview: chat kind, name, participants, last three messages and confirmation hash. Sends nothing.                                |
| `send <chat-id\|self> --text T --confirm H` | Send exactly that drafted text to that chat. Channels are refused.                                                               |
| `setup claude [--scope user                 | project] [--write]`                                                                                                              | Preview or apply the maintained skill and permissions. |

Output is `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message","details?"}}`. Message text is limited to 4,000 characters with `textTruncated`; item limits set `truncated`. Each chat has `unread` (`true`, `false`, or `null` when Teams gives no read marker); `chats --unread` lists only unread chats. Sent text supports paragraphs, line breaks, `-`/`1.` lists, `**bold**`, `` `code` ``, links, and `@[Exact Name]` mentions of people who wrote recently in the chat. Chat display names, team channels, search, editing, deleting and channel posts are not supported.

## Troubleshooting

| Error                                                | Action                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `login_required`                                     | Run refresh with `--headed` and complete normal sign-in before the timeout.                                            |
| `profile_busy`                                       | Wait for the owning operation or close the dedicated profile yourself. Do not kill someone else's browser.             |
| `auth_identity_changed`                              | Use a separate `CLERKHAND_HOME` for another user or tenant. Old credentials were preserved.                            |
| `credential_file_invalid`                            | The file is not a valid clerkhand-managed credential. Preserve it for local investigation; never print it to an agent. |
| `authentication_failed`                              | Built-in refresh/retry was exhausted or verification failed; report the error.                                         |
| `auth_response_invalid`, `auth_identity_unavailable` | The internal authentication shape changed; report safe field metadata, never raw responses.                            |
| `chat_not_found`                                     | The ID is not a chat this account can read. Use an exact ID from `chats`.                                              |
| `teams_error`, `teams_schema`                        | Report the safe error (HTTP status only); do not loop authentication refreshes.                                        |
| `draft_changed`                                      | The chat or text differs from the confirmed draft. Draft again and get a new confirmation.                             |
| `send_unconfirmed`                                   | The send may or may not have happened. Read the chat before trying again; never resend blindly.                        |
| `mention_unknown`                                    | The `@[name]` is not exactly one recent participant; use a name from `details.participants`.                           |
| `send_target_disabled`                               | Not an exact chat ID (channels and display names are refused). Use `find` or `chats`.                                  |
| `write_disabled`                                     | Edit, delete and restore are unavailable in this version.                                                              |

See [security](security.md) and the [original UI archive](teams-ui-archive.md).
