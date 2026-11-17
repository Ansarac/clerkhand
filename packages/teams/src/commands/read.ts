import { ClerkhandError } from "@clerkhand/core";
import { type Command, limit, parse, usage } from "../context.js";
import type { ReadOperation } from "../messenger.js";
import { compactChats, compactMessages, readOperation, withReadSession } from "../read.js";
import { record } from "../storage.js";

const MAX_NAME_LENGTH = 512;
export const whoami: Command = async (args, ctx) => {
  parse(args, {});
  const identity = record(await readOperation({ kind: "whoami" }, ctx));
  if (typeof identity["displayName"] !== "string") {
    throw new ClerkhandError("messenger_schema", "agent-messenger returned an invalid identity.");
  }
  return { displayName: identity["displayName"].slice(0, MAX_NAME_LENGTH), verified: true };
};
export const chats: Command = async (args, ctx) => {
  const { values } = parse(args, { options: { limit: { type: "string" } } });
  const count = limit(values.limit);
  return compactChats(await readOperation({ kind: "chats" }, ctx), count);
};
async function selfChat(run: (operation: ReadOperation) => Promise<unknown>): Promise<string> {
  const result = await run({ kind: "chats" });
  const candidates = Array.isArray(result)
    ? result.filter((item: unknown) => record(item)["type"] === "self")
    : [];
  if (candidates.length !== 1 || typeof record(candidates[0])["id"] !== "string") {
    throw new ClerkhandError(
      "self_chat_not_found",
      "Expected exactly one self-chat; select a chat ID from chats.",
    );
  }
  return String(record(candidates[0])["id"]);
}
export const read: Command = (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { last: { type: "string" } },
  });
  const [target] = positionals;
  if (positionals.length !== 1 || !target) {
    throw usage("Usage: clerkhand-teams read <chat-id|self> [--last N]");
  }
  const last = limit(values.last);
  if (target !== "self" && !(target.startsWith("19:") && target.endsWith("@thread.v2"))) {
    throw usage("Use the exact chat ID from chats, or self; display names are not accepted.");
  }
  return withReadSession(ctx, async (run) => {
    const chatId = target === "self" ? await selfChat(run) : target;
    return {
      chatId,
      ...compactMessages(await run({ kind: "history", chatId, limit: last }), last),
    };
  });
};
export const search: Command = (args) => {
  const { positionals } = parse(args, { allowPositionals: true });
  if (positionals.length !== 1) {
    throw usage("Usage: clerkhand-teams search <query>");
  }
  throw new ClerkhandError(
    "search_unavailable",
    "agent-messenger 2.43.0 requires an AAD refresh token for search. This browser flow manages only a Skype token; refreshing it will not enable search.",
  );
};
