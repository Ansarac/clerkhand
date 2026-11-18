# @clerkhand/teams

`clerkhand-teams` lets an AI agent work with your Microsoft Teams chats: sign in through a dedicated browser profile, list and find chats, read history and unread messages, and send messages only after you confirm the exact recipient and text.

```sh
npm install -g @clerkhand/teams
clerkhand-teams setup claude --write          # Claude Code skill and permission rules
clerkhand-teams auth refresh --headed --wait 180
clerkhand-teams chats --unread
```

Requires Node 26 and Microsoft Edge (or `CLERKHAND_BROWSER`). Normal sign-in, MFA and tenant policies apply; nothing is bypassed.

See the [repository](https://github.com/Ansarac/clerkhand) for commands, the security model and limits.
