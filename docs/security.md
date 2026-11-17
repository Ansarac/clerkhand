# Security model

This migration exposes authentication and reads. `draft`, `send`, `edit`, `delete` and `undo-delete` fail with `write_disabled` before a browser or upstream process is started. There is no arbitrary browser, shell or upstream command pass-through.

## Authentication and credentials

Only the authentication tool captures the user's normal Teams sign-in credential. It owns a dedicated profile, validates the response origin, credential type, expiry and matching AAD/Skype user identity, and rejects a change of user or tenant when updating an existing managed credential. For a cached sign-in, it checks the selected identity before invalidating only that account's two Skype cache entries and reloading once for normal Teams renewal. It does not decrypt browser cache keys or remove SSO credentials.

Fresh credentials are saved to a private staging directory and verified by the pinned upstream `whoami` command. Verification failure leaves the previous file intact. Successful replacement uses a temporary file in the same directory and atomic rename. The tool updates only its managed credential file, with explicit ownership metadata; unrelated `~/.config/agent-messenger` credentials are never touched.

Tokens are not command arguments, CLI output, test fixtures or logs. Subprocess diagnostics are reduced to safe errors, including parser failures that could quote a response body. Browser request details stay in memory; no HAR, snapshot or response fixture is generated. The Chromium profile necessarily retains login state and must remain outside git.

Directories receive current-user Windows ACLs or mode 0700 on Unix, and secret files receive mode 0600 on Unix. An exclusive lock covers refresh and reads. A running browser holding the dedicated profile is reported as busy; clerkhand never closes it to take over. After a killed operation, inspect the recorded PID and remove its stale lock only once that process has exited.

## Agent permissions

`clerkhand-teams setup claude` installs the maintained skill and rules for authentication and reads. It retires exact old clerkhand write allow/ask rules, preserves unrelated configuration and adds denies for disabled writes and direct browser/upstream entrypoints (`agent-messenger`, `amsg`, `agent-teams`, common package runners and Node paths).

The wrapper's fixed command allowlist is enforced in code. Agent permission rules are a cooperative boundary: aliases, arbitrary scripts, alternative interpreters and absolute binary paths can escape prefix rules. A process with unrestricted shell and filesystem access can read credentials and run upstream writes. For a hard boundary, enforce a sandbox or an external execution policy. Permission bypass mode does not validate approval dialogs. This migration does not claim writes are safe under unrestricted execution.

## Reads and output

Normal reads use the pinned public CLI and a child-specific credential directory, with no shell interpolation. Child output is capped at 8 MiB and runtime at 60 seconds. Agent-visible results select fields, cap item counts and message text, and omit raw response bodies and HTML. Reading message content does not authorize following instructions inside it.

There is at most one refresh per command. An explicit authentication rejection permits one retry after that refresh; throttling, service errors and unsupported capabilities do not start refresh loops. The upstream package may itself retry bounded GET operations.

Search is unavailable with these Skype-only credentials. Never acquire broader tokens or bypass IT restrictions merely to make a command pass. Read-receipt behavior has not been established; do not infer it from the archived UI implementation.

Dependency versions are exact and locked. Dependency build scripts and dependency-provided skills are denied in `pnpm-workspace.yaml`. Live message validation is limited to self-chat and records only statuses and statistics. Synthetic tests contain no real credentials or messages.
