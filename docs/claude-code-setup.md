# Claude Code setup

```sh
clerkhand-teams setup claude                    # show what would change
clerkhand-teams setup claude --write            # apply to ~/.claude
clerkhand-teams setup claude --scope project --write   # apply to ./.claude
```

It never removes existing rules, and refuses to touch a `settings.json` that is not valid JSON.

## Permission rules

Added to `permissions` in `settings.json`:

| List    | Rules                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `allow` | `Bash(clerkhand-teams status *)`, `Bash(clerkhand-teams chats *)`, `Bash(clerkhand-teams read *)`                         |
| `deny`  | `Bash(agent-browser *)`, `Bash(npx agent-browser *)`, `Bash(pnpm exec agent-browser *)`, `Bash(pnpm dlx agent-browser *)` |

`login` and `setup` are not allowed automatically, so Claude Code asks before running them. Rules match command prefixes; see [security](security.md#limits) for what they do not catch.

## Skill

The `clerkhand-teams` tool skill is installed to `.claude/skills/clerkhand-teams/SKILL.md`. It covers the commands, the "what's new" workflow and the safety rules, and is updated with the tool. Run `setup claude --write` again after upgrading.
