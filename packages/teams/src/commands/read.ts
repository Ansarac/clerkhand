import { type Command, parse, positiveInt, usage } from "../context.js";
import { ensureTeams, getChats, lastMessages, openChat, resolveChat } from "../teams.js";

const DEFAULT_LAST = 20;
const MAX_LAST = 200;
const OPEN_CHAT_TIMEOUT_MS = 20_000;

export const read: Command = async (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { last: { type: "string" }, headed: { type: "boolean" } },
  });
  const [query, ...extra] = positionals;
  if (query === undefined || extra.length > 0) {
    throw usage("Usage: clerkhand-teams read <chat> [--last N]");
  }
  const last = Math.min(positiveInt(values.last, "--last", DEFAULT_LAST), MAX_LAST);

  const driver = ctx.driver({ headed: values.headed ?? false });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });
  const chat = resolveChat(await getChats(driver), query);
  await openChat(driver, chat, OPEN_CHAT_TIMEOUT_MS);
  const messages = await lastMessages(driver, chat, last);
  return { chat: { id: chat.id, name: chat.name, kind: chat.kind }, messages };
};
