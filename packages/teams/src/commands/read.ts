import { whoami as apiWhoami, listConversations, listMessages } from "../api.js";
import { type Command, limit, parse, usage } from "../context.js";
import { compactChats, compactMessages, withReadSession } from "../read.js";

const MAX_NAME_LENGTH = 512;
const MAX_ID_LENGTH = 512;
const SELF_CHAT_ID = "48:notes";
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
const NOT_AN_ID = /[\u0000-\u001f\s]/u;

export const whoami: Command = async (args, ctx) => {
  parse(args, {});
  const name = await withReadSession(ctx, (session) => apiWhoami(ctx.fetch, session));
  return { displayName: name.slice(0, MAX_NAME_LENGTH), verified: true };
};

export const chats: Command = (args, ctx) => {
  const { values } = parse(args, {
    options: { limit: { type: "string" }, unread: { type: "boolean" } },
  });
  const count = limit(values.limit);
  return withReadSession(ctx, async (session) =>
    compactChats(await listConversations(ctx.fetch, session), count, {
      userId: session.userId,
      unreadOnly: values.unread ?? false,
    }),
  );
};

export const read: Command = async (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { last: { type: "string" } },
  });
  const [target] = positionals;
  if (positionals.length !== 1 || !target) {
    throw usage("Usage: clerkhand-teams read <chat-id|self> [--last N]");
  }
  const last = limit(values.last);
  if (target.length > MAX_ID_LENGTH || NOT_AN_ID.test(target)) {
    throw usage("Use the exact chat ID from chats, or self; display names are not accepted.");
  }
  const chatId = target === "self" ? SELF_CHAT_ID : target;
  const fetched = await withReadSession(ctx, (session) =>
    listMessages(ctx.fetch, session, chatId, last + 1),
  );
  return { chatId, ...compactMessages(fetched, last) };
};
