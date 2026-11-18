# @clerkhand/teams

## 0.1.0

### Minor Changes

- 6734b38: Replace the Teams UI backend with dedicated browser authentication and bounded, read-only workflows using pinned agent-messenger 2.43.0. Verify staged credentials before atomic replacement, protect local storage, and refresh/retry authentication at most once per command. Message writes are disabled; Skype-only authentication reports server search as unavailable. Agent setup retires obsolete clerkhand write permissions while preserving unrelated settings. The UI implementation is preserved in its remote archive branch and annotated tag.
- 3e7a9e4: Read Teams through a built-in GET-only client for the Teams chat service instead of agent-messenger, removing the dependency (233 packages). `read` now accepts 1:1 chat IDs and resolves `self` without listing chats, `edited`/`deleted` reflect Teams' edit and delete markers, and the stored credential records its chat service region. The unused `search` command is removed. Windows ACLs are applied when private directories are created instead of on every read. Existing users sign in again on the next refresh; the old credential directory is then deleted.
- 8c10432: Sent messages support paragraphs, line breaks, lists, bold, inline code, links and `@[Exact Name]` mentions of recent participants. Text is HTML-escaped first; the confirmation hash also binds the mentioned people.
  
  Sent messages now carry the sender display name, taken from the sign-in token at login; `whoami` shows that name instead of `orgid:...`. Plain-text reading keeps list items as `- ` lines.
- d25273c: `read <chat-id> --unread` returns only messages after the read marker. The skill adds workflows for summarizing unread messages, replying to someone and catching up on a chat.
- e2ae74f: Send confirmed plain-text messages to any chat, not only the self-chat. `find <name>` locates chats by group/meeting name, 1:1 partner or a group's last sender; `draft <chat-id>` shows participants and the last messages so the recipient can be confirmed, and the hash binds chat and text. Meeting chats are now listed, read and included in unread detection; `chats` reports `lastSender`. Channels remain unsupported.
  
  Fix `read`, `draft` and `find` returning old edited, deleted or reacted-to messages instead of the newest: Teams orders history by last modification, so messages are now collected until no newer one can be missing and then sorted by send time. Deleted messages are omitted, and the `deleted` field is removed.
- 4166aa6: Send plain-text messages to your own self-chat: `draft self --text T` previews the text and a confirmation hash without network access, and `send self --text T --confirm <hash>` sends exactly that text. Other targets are refused. Agent setup allows `draft` and makes `send` ask every time; remove any old deny rules for `draft`/`send` to enable it.
- 84369e0: `chats` reports `unread` per chat from Teams' read marker, and `chats --unread` lists only unread chats.

### Patch Changes

- 54d0f16: `auth status` reports the current capabilities (`unread`, and `send` for all chats) instead of the outdated self-chat-only value.
- Updated dependencies [6734b38]
  - @clerkhand/core@0.1.0
