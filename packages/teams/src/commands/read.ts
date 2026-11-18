import { ClerkhandError } from "@clerkhand/core";
import { whoami as apiWhoami, listConversations, listMessages, SELF_CHAT_ID } from "../api.js";
import { type Command, limit, parse, usage } from "../context.js";
import { compactChats, compactMessages, readMarker, withReadSession } from "../read.js";
import { record } from "../storage.js";

const MAX_NAME_LENGTH = 512;
const MAX_ID_LENGTH = 512;
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point.
const NOT_AN_ID = /[\u0000-\u001f\s]/u;

export const whoami: Command = async (args, ctx) => {
  parse(args, {});
  // Verifies the credential online; the name comes from sign-in, as Teams' profile often lacks it.
  const name = await withReadSession(ctx, async (session) => {
    const profileName = await apiWhoami(ctx.fetch, session);
    return session.userName.startsWith("orgid:") ? profileName : session.userName;
  });
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
    options: { last: { type: "string" }, unread: { type: "boolean" } },
  });
  const [target] = positionals;
  if (positionals.length !== 1 || !target) {
    throw usage("Usage: clerkhand-teams read <chat-id|self> [--last N] [--unread]");
  }
  const last = limit(values.last);
  if (target.length > MAX_ID_LENGTH || NOT_AN_ID.test(target)) {
    throw usage("Use the exact chat ID from chats, or self; display names are not accepted.");
  }
  const chatId = target === "self" ? SELF_CHAT_ID : target;
  if (!values.unread) {
    const fetched = await withReadSession(ctx, (session) =>
      listMessages(ctx.fetch, session, chatId, last + 1),
    );
    return { chatId, ...compactMessages(fetched, last) };
  }
  // Only messages after the read marker; at most `last` of them, newest kept.
  const fetched = await withReadSession(ctx, async (session) => {
    const conversation = (await listConversations(ctx.fetch, session))
      .map(record)
      .find((c) => c["id"] === chatId);
    if (!conversation) {
      throw new ClerkhandError("chat_not_found", "No such chat. Use an exact ID from chats.");
    }
    const readId = readMarker(conversation);
    if (readId === null) {
      throw new ClerkhandError(
        "unread_unknown",
        "Teams gives no read marker for this chat; read recent messages instead.",
      );
    }
    const messages = await listMessages(ctx.fetch, session, chatId, last + 1);
    return messages.filter((m) => Number(record(m)["id"]) > readId);
  });
  return { chatId, unreadOnly: true, ...compactMessages(fetched, last) };
};
