---
"@clerkhand/teams": minor
---

Send confirmed plain-text messages to any chat, not only the self-chat. `find <name>` locates chats by group/meeting name, 1:1 partner or a group's last sender; `draft <chat-id>` shows participants and the last messages so the recipient can be confirmed, and the hash binds chat and text. Meeting chats are now listed, read and included in unread detection; `chats` reports `lastSender`. Channels remain unsupported.

Fix `read`, `draft` and `find` returning old edited, deleted or reacted-to messages instead of the newest: Teams orders history by last modification, so messages are now collected until no newer one can be missing and then sorted by send time. Deleted messages are omitted, and the `deleted` field is removed.
