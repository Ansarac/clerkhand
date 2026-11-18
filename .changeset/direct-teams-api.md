---
"@clerkhand/teams": minor
---

Read Teams through a built-in GET-only client for the Teams chat service instead of agent-messenger, removing the dependency (233 packages). `read` now accepts 1:1 chat IDs and resolves `self` without listing chats, `edited`/`deleted` reflect Teams' edit and delete markers, and the stored credential records its chat service region. The unused `search` command is removed. Windows ACLs are applied when private directories are created instead of on every read. Existing users sign in again on the next refresh; the old credential directory is then deleted.
