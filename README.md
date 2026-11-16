# clerkhand

Command-line tools that let an AI agent (Claude Code first) handle everyday office chat through the web UI you already use. The agent reads, summarizes and drafts; **you decide what gets sent**.

> Status: early development. Nothing is published yet.

| Package                              | Command           | Status         |
| ------------------------------------ | ----------------- | -------------- |
| [`@clerkhand/teams`](packages/teams) | `clerkhand-teams` | in development |
| [`@clerkhand/core`](packages/core)   | (library)         | in development |

## Why

For people at companies where Graph API access is not available and paid AI office tools are not an option. clerkhand drives the Teams web app in a separate, local browser profile and only performs actions you could do by hand.

## Safety

Reading and drafting are allowed by default. Anything other people can see (send, edit, delete) requires your confirmation every time, enforced by the tool and by agent permissions, not by prompts. See [docs/security.md](docs/security.md).

## Docs

- [Overview](docs/overview.md)
- [Security model](docs/security.md)
- [Claude Code setup](docs/claude-code-setup.md)
- [Teams](docs/teams.md)
- [Development](docs/development.md) · [Releasing](docs/releasing.md) · [Repository setup](docs/repository-setup.md)

## License

[MIT](LICENSE)
