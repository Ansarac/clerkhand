import { type Command, parse, usage } from "../context.js";
import { sendDraft } from "../drafts.js";
import { ensureTeams, getChats, openChat, resolveChat } from "../teams.js";

const OPEN_CHAT_TIMEOUT_MS = 20_000;
const USAGE = "Usage: clerkhand-teams send <chat> --confirm <hash>";
const HASH = /^[0-9a-f]{12}$/u;

/** Sends the chat's draft, only if it is the draft the user confirmed (by hash). */
export const send: Command = async (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { confirm: { type: "string" }, headed: { type: "boolean" } },
  });
  const [query, ...extra] = positionals;
  if (query === undefined || extra.length > 0 || values.confirm === undefined) {
    throw usage(USAGE);
  }
  if (!HASH.test(values.confirm)) {
    throw usage(`--confirm must be the 12-character hash from \`draft\`, got "${values.confirm}".`);
  }

  const driver = ctx.driver({ headed: values.headed ?? false });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });
  const chat = resolveChat(await getChats(driver), query);
  await openChat(driver, chat, OPEN_CHAT_TIMEOUT_MS);
  const message = await sendDraft(driver, chat, values.confirm, ctx.clock);
  return { chat: { id: chat.id, name: chat.name, kind: chat.kind }, sent: message };
};
