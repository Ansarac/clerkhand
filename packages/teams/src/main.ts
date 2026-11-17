import { ClerkhandError, failure, success } from "@clerkhand/core";
import { auth } from "./commands/auth.js";
import { chats, read, whoami } from "./commands/read.js";
import { setup } from "./commands/setup.js";
import { type Command, type Context, usage } from "./context.js";

const USAGE = `Usage: clerkhand-teams <command> [options]
  auth status                    Local credential status (no network validation)
  auth refresh [--headed] [--wait N]   Refresh and verify credentials (default wait 30s, max 300s)
  status                         Alias for auth status
  whoami                         Verify identity with Teams
  chats [--limit N] [--unread]    List chats (default 20, max 200)
  read <chat-id|self> [--last N]   Read recent messages (default 20, max 200)
  setup claude [--scope user|project] [--write]
Message writes and search are not available. Output is JSON.`;
const WRITES = new Set(["draft", "send", "edit", "delete", "undo-delete"]);
export const COMMANDS: Record<string, Command> = {
  auth,
  status: (args, ctx) => auth(["status", ...args], ctx),
  whoami,
  chats,
  read,
  setup,
};
export async function main(
  argv: readonly string[],
  io: { stdout: (text: string) => void },
  ctx: Context,
): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === "--help" || name === "-h") {
    io.stdout(USAGE);
    return 0;
  }
  try {
    if (WRITES.has(name)) {
      throw new ClerkhandError(
        "write_disabled",
        "Message writes are disabled on the authentication and read-only migration.",
      );
    }
    const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
    if (!command) {
      throw usage(`Unknown command: ${name}. Run clerkhand-teams --help.`);
    }
    io.stdout(success(await command(args, ctx)));
    return 0;
  } catch (error) {
    const safe =
      error instanceof ClerkhandError
        ? error
        : new ClerkhandError("internal", "The operation failed; raw diagnostics were suppressed.");
    const result = failure(safe);
    io.stdout(result.text);
    return result.exitCode;
  }
}
