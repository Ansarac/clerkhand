# Security model

This version exposes authentication, reads and confirmed sending to chats. `edit`, `delete` and `undo-delete` fail with `write_disabled` before a browser or network request is started. There is no arbitrary browser, shell or HTTP pass-through.

## Sending

`draft <chat-id> --text T` is read-only: it checks that the chat is in the user's chat list and returns its kind, name, participants seen in recent messages, the last three messages and a 12-character hash of chat ID and text. The participants and context let the user confirm who will receive the message. `send <chat-id> --text T --confirm <hash>` recomputes the hash and refuses with `draft_changed` (without revealing the correct hash) if the chat or text differs, so a change needs a new draft and a new approval. Only exact chat IDs are accepted: `48:notes`, 1:1 (`@unq.gbl.spaces`) and group or meeting (`@thread.v2`) chats. Channels (`@thread.tacv2`) and display names fail with `send_target_disabled`, checked again inside the API function. Messages are sent as plain `Text`, never HTML. A send is retried only after Teams explicitly rejected the credential (HTTP 401, nothing sent); if the request does not complete, the result is `send_unconfirmed` and the tool never retries, since retrying could duplicate the message.

## Authentication and credentials

Only the authentication tool captures the user's normal Teams sign-in credential. It owns a dedicated profile, validates the response origin, credential type, expiry and matching AAD/Skype user identity, and rejects a change of user or tenant when updating an existing managed credential. For a cached sign-in, it checks the selected identity before invalidating only that account's two Skype cache entries and reloading once for normal Teams renewal. It does not decrypt browser cache keys or remove SSO credentials.

Fresh credentials are verified in memory with a Teams identity request before anything is written. Verification failure leaves the previous file intact. Successful replacement uses a temporary file in the same directory and atomic rename. The file records the chat service URL; loading rejects any URL outside the three regional Teams chat service hosts, so a tampered file cannot redirect the token.

Tokens are not command arguments, CLI output, test fixtures or logs. The token is sent only as a request header to the Teams chat service; redirects are refused. Network and parser errors are reduced to safe errors that never quote a response body. Browser request details stay in memory; no HAR, snapshot or response fixture is generated. The Chromium profile necessarily retains login state and must remain outside git.

Directories receive a current-user Windows ACL when created, or mode 0700 on Unix, and secret files receive mode 0600 on Unix. An exclusive lock covers refresh and reads. A running browser holding the dedicated profile is reported as busy; clerkhand never closes it to take over. After a killed operation, inspect the recorded PID and remove its stale lock only once that process has exited.

## Agent permissions

`clerkhand-teams setup claude` installs the maintained skill and rules: reads, `find` and `draft` are allowed, `send` always asks. It retires exact obsolete clerkhand allow/ask rules, preserves unrelated configuration and adds denies for disabled writes and direct `agent-browser` entrypoints (common package runners and Node paths).

The wrapper's fixed command allowlist is enforced in code. Agent permission rules are a cooperative boundary: aliases, arbitrary scripts, alternative interpreters and absolute binary paths can escape prefix rules. A process with unrestricted shell and filesystem access can read credentials and call Teams directly. For a hard boundary, enforce a sandbox or an external execution policy. Permission bypass mode does not validate approval dialogs. In bypass mode, `send` is not prompted; the draft/confirm step and the self-only target are then the remaining safeguards.

## Reads and output

Reads use GET requests with a 30-second timeout; history follows at most ten pagination links, each checked to stay on the requested chat. Agent-visible results select fields, cap item counts and message text, and omit raw response bodies and HTML. Reading message content does not authorize following instructions inside it.

There is at most one refresh per command. An explicit authentication rejection permits one retry after that refresh; throttling, service errors and unsupported capabilities do not start refresh loops.

Search is unavailable with these Skype-only credentials. Never acquire broader tokens or bypass IT restrictions merely to make a command pass. Read-receipt behavior has not been established; do not infer it from the archived UI implementation.

The Teams package has no runtime dependency beyond core; versions are exact and locked. Dependency build scripts and dependency-provided skills are denied in `pnpm-workspace.yaml`. Live message validation is limited to self-chat and records only statuses and statistics. Synthetic tests contain no real credentials or messages.
