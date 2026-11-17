# agent-messenger migration validation

> Superseded on 2026-11-17: clerkhand no longer depends on agent-messenger and reads the Teams chat service with its own GET-only client (see [overview](overview.md)). Kept as history.

Recorded on 2026-11-17. The implementation is on `feat/agent-messenger`, based on updated main (`68a1bca`). Authentication and read-only workflows are implemented and locally verified; natural-expiry and long-running reliability remain to be measured. Writes are disabled, and server search is unavailable with this credential flow.

## Archive and dependencies

The remote branch and annotated tag `archive/teams-ui-m3-2026-11-17` were pushed and checked against `git ls-remote`. Both resolve to `91d40afb049a1e40c281872b8d4d42c61122e934`; its UI code is unchanged from `82ce92d169d63db7a76681a5c803d0c41178f2cb`. The commit saves the pre-existing README link, transition proposal and archive record. The archive's 159 synthetic tests passed locally. Live edit/delete/restore verification gaps remain recorded in [the archive](teams-ui-archive.md).

PR [#5](https://github.com/Ansarac/clerkhand/pull/5) remains open on `feat/manage`; it is separate from this migration. Main was fast-forwarded before creating the migration branch. No history was rewritten.

The npm runtime dependency is pinned to `agent-messenger` **2.43.0**, and `agent-browser` remains **0.43.0**. The lockfile is committed. Public CLI commands and package bin metadata are used; no upstream API code is copied or imported. Dependency skills and build scripts are disabled. A frozen install and package contents review passed; the Teams tarball contains the new implementation and skill, with no archived UI modules or runtime data.

## Authentication findings

- Login uses `https://teams.cloud.microsoft/` directly, avoiding the old-domain redirect.
- Browser monitoring is enabled before navigation. This agent-browser version requires `requests`, `request_detail` and `reload` action names in addition to navigation/evaluation/close.
- The observed authz response places `skypeToken` inside `tokens`; flat and nested token envelopes are also tested.
- Once signed in, Teams may use an encrypted Skype cache and emit no new authz response. The tool checks the selected account, invalidates only its two Skype cache entries and reloads once to trigger normal Teams renewal. SSO and other accounts' caches are retained.
- Token expiry and the AAD user/tenant identity in the exact authz request are checked against the work-account Skype identity. Staged credentials passed the pinned upstream `whoami` before atomic replacement.
- Windows storage uses a current-user-only DACL, verified on synthetic secret files. The implementation uses Windows PowerShell's .NET filesystem ACL API and strips an inherited PowerShell 7 module path. Repeated ACL application works without requesting elevated privileges.
- The dedicated `teams-auth` profile and managed credential file are separate from the archived UI profile and the user's upstream credential directory.

After these corrections, **three consecutive real authentication runs succeeded** and were verified online. Two measured headless refreshes took 19,695 ms and 20,028 ms. The earlier development failures did not produce a managed credential file or expose token values; diagnostics were limited to safe structure and status. Temporary cache-shape diagnostics were removed from the implementation.

## Read-only measurements

Environment: Windows, Node 26.13.1, pnpm 12.21.0, existing normal Teams work-account sign-in. Each measurement invoked the built CLI and retained only status/count/timing statistics. Real message text, token values and network response bodies were not saved as fixtures or committed.

| Task                            | Result                     | Elapsed   | CLI output size |
| ------------------------------- | -------------------------- | --------- | --------------- |
| Refresh existing sign-in, run 1 | Authenticated and verified | 19,695 ms | 172 bytes       |
| Refresh existing sign-in, run 2 | Authenticated and verified | 20,028 ms | 172 bytes       |
| List chats, limit 20            | 20 chats returned          | 4,575 ms  | 4,629 bytes     |
| Read self-chat, last 20         | 9 messages returned        | 8,146 ms  | 2,113 bytes     |
| Search capability check         | `search_unavailable`       | 126 ms    | 212 bytes       |

`read self` makes two upstream CLI calls (list chats, then history), under one lock and one shared refresh/retry budget. A history limit is a maximum, not a guarantee that 20 messages exist or will be returned. Other people’s chats were not opened for live message validation. No message writes were performed.

The archived UI path was not rerun against its profile, so these numbers do **not** establish an API/UI speed or model token comparison. Output bytes are not model token counts. First-login time included user interaction and development corrections and is not reported as a repeatable benchmark.

## Checks and remaining acceptance work

`pnpm check` passed locally: lint, TypeScript build, **69 passing synthetic tests**, one Unix permission test skipped on Windows. Windows ACL validation passed. The skill passed `skill-creator` validation. Agent setup was applied to project settings and confirmed idempotent; unrelated settings are retained and obsolete write allow/ask rules are retired.

Tests cover identity/type/expiry validation, staged verification, byte-for-byte preservation on failures, atomic write cleanup, locks and occupied profiles, suppression of raw diagnostics, literal subprocess arguments and config isolation, output limits, unavailable writes/search, safe Skype cache invalidation and bounded authentication retry across self-chat resolution/history.

Still unverified:

- Reacquisition after the real token naturally expires, including a revoked SSO session or new conditional-access challenge. Expiry-triggered refresh is covered synthetically; that does not substitute for this live check.
- Long-running read success rates and a fair comparison against identical archived UI tasks/output limits.
- Server search: upstream 2.43.0 requires an AAD refresh token. This migration intentionally manages only Skype credentials; repeated Skype refreshes cannot enable it.
- Safe writes: upstream has direct write entrypoints, while agent prefix permissions can be bypassed by unrestricted shell/code access. A separate tool/permission/confirmation design and explicitly authorized self-chat write tests are required before enabling them.

These limits do not reintroduce the archived UI as a fallback backend. See [Teams commands](teams.md) and [security](security.md) for current operation boundaries.
