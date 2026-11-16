import { type Command, parse, positiveInt } from "../context.js";
import { ensureTeams, getChats } from "../teams.js";

export const chats: Command = async (args, ctx) => {
  const { values } = parse(args, {
    options: {
      unread: { type: "boolean" },
      limit: { type: "string" },
      headed: { type: "boolean" },
    },
  });
  const limit = positiveInt(values.limit, "--limit", Number.POSITIVE_INFINITY);
  const driver = ctx.driver({ headed: values.headed ?? false });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });

  const all = await getChats(driver);
  const selected = (values.unread ? all.filter((c) => c.unread) : all).slice(0, limit);
  return { chats: selected };
};
