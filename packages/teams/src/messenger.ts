import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { ClerkhandError } from "@clerkhand/core";
import { type ProcessResult, runProcess } from "./process.js";
import { record } from "./storage.js";

export const MESSENGER_VERSION = "2.43.0";
const AUTH_CODES = new Set([
  "token_expired",
  "not_authenticated",
  "no_credentials",
  "http_401",
  "401",
]);
const HTTP_401 = /\b(?:HTTP 401|Unauthorized)\b/iu;
export type ReadOperation =
  | { kind: "whoami" }
  | { kind: "chats" }
  | { kind: "history"; chatId: string; limit: number }
  | { kind: "search"; query: string; limit: number };
export type Messenger = (operation: ReadOperation, configDir: string) => Promise<unknown>;
/** Only documented CLI commands; no upstream imports or arbitrary argument forwarding. */
export function messengerArgs(operation: ReadOperation): string[] {
  switch (operation.kind) {
    case "whoami":
      return ["teams", "whoami"];
    case "chats":
      return ["teams", "chat", "list"];
    case "history":
      return [
        "teams",
        "chat",
        "history",
        "--limit",
        String(operation.limit),
        "--",
        operation.chatId,
      ];
    case "search":
      return [
        "teams",
        "message",
        "search",
        "--limit",
        String(operation.limit),
        "--",
        operation.query,
      ];
    default:
      throw new ClerkhandError(
        "write_disabled",
        "This operation is not on the read-only allowlist.",
      );
  }
}
export function bundledMessenger(): string[] {
  const require = createRequire(import.meta.url);
  const path = require.resolve("agent-messenger/package.json");
  const pkg = require(path) as { version: string; bin: Record<string, string> };
  const bin = pkg.bin["agent-messenger"];
  if (pkg.version !== MESSENGER_VERSION || !bin) {
    throw new ClerkhandError(
      "messenger_version",
      "The pinned agent-messenger CLI is missing or has changed version.",
    );
  }
  return [process.execPath, join(dirname(path), bin)];
}
export function parseMessengerResult(result: ProcessResult): unknown {
  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout.trim() || result.stderr.trim());
  } catch {
    // biome-ignore lint/style/useErrorCause: JSON parse errors can embed upstream responses or credentials.
    throw new ClerkhandError(
      "messenger_error",
      "agent-messenger returned an invalid response; raw diagnostics were suppressed.",
    );
  }
  const body = record(payload);
  if (result.code !== 0 || body["error"] !== undefined) {
    const code = body["code"];
    const message = body["error"];
    if (
      (typeof code === "string" && AUTH_CODES.has(code)) ||
      (typeof message === "string" && HTTP_401.test(message))
    ) {
      throw new ClerkhandError("authentication_failed", "Teams rejected the credential.");
    }
    throw new ClerkhandError(
      "messenger_error",
      "agent-messenger could not complete the read operation; raw diagnostics were suppressed.",
    );
  }
  return payload;
}
export function createMessenger(command: readonly string[] = bundledMessenger()): Messenger {
  return async (operation, configDir) => {
    const [program, ...leading] = command;
    if (!program) {
      throw new ClerkhandError("messenger_missing", "Empty agent-messenger command.");
    }
    return parseMessengerResult(
      await runProcess(program, [...leading, ...messengerArgs(operation)], {
        // biome-ignore lint/style/noProcessEnv: preserve networking settings and override upstream credential ownership.
        ...process.env,
        AGENT_MESSENGER_CONFIG_DIR: configDir,
      }),
    );
  };
}
