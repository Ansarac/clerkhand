# clerkhand

Teams authentication tools and read workflows for AI agents. A dedicated browser profile handles normal sign-in; the pinned `agent-messenger` package reads chat data. clerkhand keeps credentials local and returns bounded JSON to the agent.

> Unreleased migration: authentication and read-only workflows. Message writes are disabled. Server search requires credentials this browser flow does not provide.

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

The previous Teams UI implementation, including M1–M3 source, tests and rules, is preserved remotely under the branch and annotated tag `archive/teams-ui-m3-2026-11-17`. See [archive details](docs/teams-ui-archive.md) and [migration validation](docs/agent-messenger-validation.md).

- [Overview](docs/overview.md)
- [agent-messenger transition proposal](docs/agent-messenger-transition.md)
- [Security model](docs/security.md)
- [Claude Code setup](docs/claude-code-setup.md)
- [Teams commands](docs/teams.md)
- [Development](docs/development.md) · [Releasing](docs/releasing.md) · [Repository setup](docs/repository-setup.md)

[MIT](LICENSE)
