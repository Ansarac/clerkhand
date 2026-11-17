---

"@clerkhand/core": minor
"@clerkhand/teams": minor
---

Replace the Teams UI backend with dedicated browser authentication and bounded, read-only workflows using pinned agent-messenger 2.43.0. Verify staged credentials before atomic replacement, protect local storage, and refresh/retry authentication at most once per command. Message writes are disabled; Skype-only authentication reports server search as unavailable. Agent setup retires obsolete clerkhand write permissions while preserving unrelated settings. The UI implementation is preserved in its remote archive branch and annotated tag.
