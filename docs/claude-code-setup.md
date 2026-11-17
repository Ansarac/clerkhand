# Claude Code setup

Build or install `clerkhand-teams`, then preview and apply its maintained skill and permission rules:

```sh
clerkhand-teams setup claude --scope project
clerkhand-teams setup claude --scope project --write
```

For this source checkout, use `node packages/teams/dist/cli.js setup claude --scope project --write`. Use `--scope user` to configure your user directory instead; this is the default scope.

The setup command preserves unrelated settings. It removes the exact obsolete clerkhand write allow/ask rules, denies those writes, and installs the read-only Teams skill. Re-running it reports no changes. Project settings tracked here follow the same rules; the installed skill is local and git-ignored.

Direct `agent-browser` calls, including common runner forms, are denied because they bypass the wrapper. The tool runs its pinned browser driver internally. Dependency-provided skills stay disabled. Setup retires the old `search` allow rule; deny rules from earlier versions are left in place.

Prefix rules are not a sandbox for arbitrary shell/code access. See [security limits](security.md#agent-permissions). Neither setup nor permission bypass mode verifies approval dialogs; writes remain unavailable.
