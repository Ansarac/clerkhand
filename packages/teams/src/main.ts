import { failure, success } from "@clerkhand/core";
import { chats } from "./commands/chats.js";
import { remove } from "./commands/delete.js";
import { draft } from "./commands/draft.js";
import { edit } from "./commands/edit.js";
import { login } from "./commands/login.js";
import { read } from "./commands/read.js";
import { send } from "./commands/send.js";
import { setup } from "./commands/setup.js";
import { status } from "./commands/status.js";
import { undoRemove } from "./commands/undo-delete.js";
import { type Command, type Context, usage } from "./context.js";

const USAGE = `Usage: clerkhand-teams <command> [options]

Commands:
  login                          Open a browser window to sign in to Teams
  status                         Check that Teams is signed in and ready
  chats [--unread] [--limit N]   List chats in the sidebar
  read <chat> [--last N]         Read the last N messages (default 20); marks the chat as read
  draft <chat> --text T          Replace the unsent draft of a chat (never sends)
  draft show <chat>              Show the unsent draft
  draft clear <chat>             Remove the unsent draft
  send <chat> --confirm <hash>   Send the draft whose hash the user confirmed
  edit <chat> <message> --text T Replace the text of one of your messages
  delete <chat> <message>        Delete one of your messages
  undo-delete <chat> <message>   Restore one of your deleted messages
  setup claude [--scope user|project] [--write]
                                 Show (or with --write, apply) Claude Code permissions and skill

Browser commands accept --headed to show the window. Output is JSON.`;

export const COMMANDS: Record<string, Command> = {
  login,
  status,
  chats,
  read,
  draft,
  send,
  edit,
  delete: remove,
  "undo-delete": undoRemove,
  setup,
};

export interface Io {
  stdout: (text: string) => void;
}

/** Runs the CLI and returns the process exit code. */
export async function main(argv: readonly string[], io: Io, ctx: Context): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === "--help" || name === "-h") {
    io.stdout(USAGE);
    return 0;
  }
  try {
    const command = COMMANDS[name];
    if (!command) {
      throw usage(`Unknown command: ${name}. Run clerkhand-teams --help.`);
    }
    io.stdout(success(await command(args, ctx)));
    return 0;
  } catch (error) {
    const { text, exitCode } = failure(error);
    io.stdout(text);
    return exitCode;
  }
}
