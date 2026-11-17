# Teams

Requires Node 26, pnpm 12, Microsoft Edge, and a work-account Teams web login permitted by your tenant. Use `CLERKHAND_BROWSER` for another installed Chromium executable. Normal login, MFA and conditional access are handled in the browser.

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/teams/dist/cli.js auth refresh --headed --wait 180
node packages/teams/dist/cli.js auth status
node packages/teams/dist/cli.js whoami
node packages/teams/dist/cli.js chats --limit 20
node packages/teams/dist/cli.js read self --last 20
```

After installing the package CLI, replace `node packages/teams/dist/cli.js` with `clerkhand-teams`.

| Command                              | Behavior                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `auth status` / `status`             | Local credential expiry check; does not prove online validity.                                                                   |
| `auth refresh [--headed] [--wait N]` | Get and verify a Skype token from the dedicated profile. Default 30 seconds; maximum 300. First login normally needs `--headed`. |
| `whoami`                             | Verify identity online; returns display name without credentials.                                                                |
| `chats [--limit N] [--unread]`       | List self, 1:1 and group chats, default 20, maximum 200; use returned exact IDs.                                                 |
| `read <chat-id                       | self> [--last N]`                                                                                                                | Recent history, oldest first; default 20, maximum 200. |
| `draft self --text T`                | Preview a self-chat message and its confirmation hash; no network access.                                                        |
| `send self --text T --confirm H`     | Send exactly that text to the self-chat. Other targets are refused.                                                              |
| `setup claude [--scope user          | project] [--write]`                                                                                                              | Preview or apply the maintained skill and permissions. |

Output is `{"ok":true,"data":...}` or `{"ok":false,"error":{"code","message","details?"}}`. Message text is limited to 4,000 characters with `textTruncated`; item limits set `truncated`. Each chat has `unread` (`true`, `false`, or `null` when Teams gives no read marker); `chats --unread` lists only unread chats. Chat display names, team channels, search, editing, deleting and sending to anyone but yourself are not supported.

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
| `draft_changed`                                      | The text differs from the confirmed draft. Draft again and get a new confirmation.                                     |
| `send_unconfirmed`                                   | The send may or may not have happened. Read the self-chat before trying again; never resend blindly.                   |
| `send_target_disabled`, `write_disabled`             | Unavailable in this version.                                                                                           |

See [security](security.md) and the [original UI archive](teams-ui-archive.md).
