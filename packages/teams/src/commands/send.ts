import { createHash } from "node:crypto";
import { ClerkhandError } from "@clerkhand/core";
import {
  isSendableChatId,
  listConversations,
  listMessages,
  SELF_CHAT_ID,
  sendMessage,
} from "../api.js";
import { type Command, parse, usage } from "../context.js";
import { compactChats, compactMessages, senderName, withReadSession } from "../read.js";
import { record } from "../storage.js";

const MAX_TEXT = 4000;
const HASH_LENGTH = 12;
const HASH = /^[0-9a-f]{12}$/u;
const ALL = 500;
const HISTORY = 20;
const RECENT = 3;
const RECENT_TEXT = 200;
const MAX_PARTICIPANTS = 10;
const DRAFT_USAGE = "Usage: clerkhand-teams draft <chat-id|self> --text T";
const SEND_USAGE = "Usage: clerkhand-teams send <chat-id|self> --text T --confirm <hash>";

/** Identifies the exact target and text; `send --confirm` must quote it. */
export function draftHash(chatId: string, text: string): string {
  return createHash("sha256").update(`${chatId}\n${text}`).digest("hex").slice(0, HASH_LENGTH);
}

function target(args: string[], usageText: string, confirm: boolean) {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { text: { type: "string" }, ...(confirm ? { confirm: { type: "string" } } : {}) },
  });
  const [chat, ...extra] = positionals;
  if (chat === undefined || extra.length > 0 || values.text === undefined) {
    throw usage(usageText);
  }
  const chatId = chat === "self" ? SELF_CHAT_ID : chat;
  if (!isSendableChatId(chatId)) {
    throw new ClerkhandError(
      "send_target_disabled",
      "Use an exact chat ID from chats or find (self, 1:1, group or meeting chat). Channels and display names are not accepted.",
    );
  }
  const { text } = values;
  if (text.trim() === "" || text.length > MAX_TEXT) {
    throw usage(`--text must be non-empty and at most ${MAX_TEXT} characters.`);
  }
  return { chatId, text, confirm: (values as { confirm?: string }).confirm };
}

/**
 * Previews a message: who is in the chat, its last messages, and the confirmation hash.
 * Read-only; nothing is sent.
 */
export const draft: Command = (args, ctx) => {
  const { chatId, text } = target(args, DRAFT_USAGE, false);
  return withReadSession(ctx, async (session) => {
    const { chats } = compactChats(await listConversations(ctx.fetch, session), ALL, {
      userId: session.userId,
    });
    const chat = chats.find((c) => c.id === chatId);
    if (!chat) {
      throw new ClerkhandError(
        "chat_not_found",
        "No such chat. Use an exact ID from chats or find.",
      );
    }
    const history = await listMessages(ctx.fetch, session, chatId, HISTORY);
    const participants = [
      ...new Set(history.map((m) => senderName(record(m), session.userId))),
    ].filter((name) => name && name !== "me");
    const recent = compactMessages(history.slice(0, RECENT), RECENT).messages.map((m) => ({
      author: m.author,
      time: m.time,
      text: m.text.slice(0, RECENT_TEXT),
    }));
    return {
      chatId,
      kind: chat.kind,
      name: chat.name,
      participants: participants.slice(0, MAX_PARTICIPANTS),
      recent,
      text,
      hash: draftHash(chatId, text),
    };
  });
};

/** Sends only if `--confirm` matches the draft hash of exactly this chat and text. */
export const send: Command = async (args, ctx) => {
  const { chatId, text, confirm } = target(args, SEND_USAGE, true);
  if (confirm === undefined || !HASH.test(confirm)) {
    throw usage(`--confirm must be the 12-character hash from draft.\n${SEND_USAGE}`);
  }
  // The correct hash is deliberately not returned: a change needs a new draft and approval.
  if (confirm !== draftHash(chatId, text)) {
    throw new ClerkhandError(
      "draft_changed",
      "The chat or text is not the one confirmed. Run draft again, show it to the user and confirm.",
    );
  }
  const sent = await withReadSession(ctx, (session) =>
    sendMessage(ctx.fetch, session, chatId, text),
  );
  return { sent: true, ...sent };
};
