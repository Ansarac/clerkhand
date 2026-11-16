import { editMessage } from "../actions.js";
import { type Command, parse, usage } from "../context.js";
import { ensureTeams, getChats, openChat, resolveChat } from "../teams.js";

const OPEN_CHAT_TIMEOUT_MS = 20_000;
const USAGE = "Usage: clerkhand-teams edit <chat> <message> --text T";

/** Replaces the text of one of the user's own messages. */
export const edit: Command = async (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { text: { type: "string" }, headed: { type: "boolean" } },
  });
  const [query, id, ...extra] = positionals;
  if (query === undefined || id === undefined || extra.length > 0 || values.text === undefined) {
    throw usage(USAGE);
  }
  if (values.text.trim() === "") {
    throw usage("--text is empty. Use `delete` to remove a message.");
  }

  const driver = ctx.driver({ headed: values.headed ?? false, fill: true });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });
  const chat = resolveChat(await getChats(driver), query);
  await openChat(driver, chat, OPEN_CHAT_TIMEOUT_MS);
  const message = await editMessage(driver, chat, { id, text: values.text }, ctx.clock);
  return { chat: { id: chat.id, name: chat.name, kind: chat.kind }, edited: message };
};
