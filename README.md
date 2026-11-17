# clerkhand

Teams authentication tools and read workflows for AI agents. A dedicated browser profile handles normal sign-in; a small built-in GET-only client reads chat data from the Teams chat service. clerkhand keeps credentials local and returns bounded JSON to the agent.

> Unreleased migration: authentication and read-only workflows. Message writes and server search are not available.

| Package                              | Purpose                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| [`@clerkhand/teams`](packages/teams) | `clerkhand-teams`: authentication, chat list and recent history |
| [`@clerkhand/core`](packages/core)   | Browser subprocess, local paths, JSON output and agent setup    |

```sh
pnpm install --frozen-lockfile
pnpm build
node packages/teams/dist/cli.js auth refresh --headed --wait 180
node packages/teams/dist/cli.js chats --limit 20
node packages/teams/dist/cli.js read self --last 20
```

Complete normal Teams sign-in in the browser window. Credentials never need to be copied into a command or given to an agent. Normal tenant controls still apply.

The previous Teams UI implementation, including M1–M3 source, tests and rules, is preserved remotely under the branch and annotated tag `archive/teams-ui-m3-2026-11-17`. See [archive details](docs/teams-ui-archive.md). An interim version read data through agent-messenger; its [proposal](docs/agent-messenger-transition.md) and [validation](docs/agent-messenger-validation.md) are kept as history.

- [Overview](docs/overview.md)
- [Security model](docs/security.md)
- [Claude Code setup](docs/claude-code-setup.md)
- [Teams commands](docs/teams.md)
- [Development](docs/development.md) · [Releasing](docs/releasing.md) · [Repository setup](docs/repository-setup.md)

[MIT](LICENSE)
