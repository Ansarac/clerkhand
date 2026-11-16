import { undoDelete } from "../actions.js";
import { type Command, parse, usage } from "../context.js";
import { ensureTeams, getChats, openChat, resolveChat } from "../teams.js";

const OPEN_CHAT_TIMEOUT_MS = 20_000;

/** Restores one of the user's own deleted messages. */
export const undoRemove: Command = async (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { headed: { type: "boolean" } },
  });
  const [query, id, ...extra] = positionals;
  if (query === undefined || id === undefined || extra.length > 0) {
    throw usage("Usage: clerkhand-teams undo-delete <chat> <message>");
  }

  const driver = ctx.driver({ headed: values.headed ?? false });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });
  const chat = resolveChat(await getChats(driver), query);
  await openChat(driver, chat, OPEN_CHAT_TIMEOUT_MS);
  const message = await undoDelete(driver, chat, id, ctx.clock);
  return { chat: { id: chat.id, name: chat.name, kind: chat.kind }, restored: message };
};
