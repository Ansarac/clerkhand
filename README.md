# clerkhand

Microsoft Teams tools for AI agents. A dedicated browser profile handles normal sign-in; a small built-in client reads chats and sends messages only after the user confirms recipient and text. clerkhand keeps credentials local and returns bounded JSON to the agent.

> Early version, released on GitHub only (not on npm). Channels, editing, deleting and server search are not available.

| Package                              | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| [`@clerkhand/teams`](packages/teams) | `clerkhand-teams`: sign-in, chats, unread, find, confirmed send |
| [`@clerkhand/core`](packages/core)   | Browser subprocess, local paths, JSON output and agent setup    |

Requires Node 26 and Microsoft Edge. Install or upgrade from the latest GitHub release:

```sh
npm install -g https://github.com/Ansarac/clerkhand/releases/latest/download/clerkhand-teams.tgz
clerkhand-teams setup claude --write            # Claude Code skill and permission rules
clerkhand-teams auth refresh --headed --wait 180
clerkhand-teams chats --unread
```

Complete normal Teams sign-in in the browser window. Credentials never need to be copied into a command or given to an agent. Normal tenant controls still apply.

The previous Teams UI implementation, including M1–M3 source, tests and rules, is preserved remotely under the branch and annotated tag `archive/teams-ui-m3-2026-11-17`. See [archive details](docs/teams-ui-archive.md). An interim version read data through agent-messenger; its [proposal](docs/agent-messenger-transition.md) and [validation](docs/agent-messenger-validation.md) are kept as history.

- [Overview](docs/overview.md)
- [Security model](docs/security.md)
- [Claude Code setup](docs/claude-code-setup.md)
- [Teams commands](docs/teams.md)
- [Development](docs/development.md) · [Releasing](docs/releasing.md) · [Repository setup](docs/repository-setup.md)

[MIT](LICENSE)
