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
import { type Person, toTeamsHtml } from "../format.js";
import {
  authors,
  compactChats,
  compactMessages,
  type ReadSession,
  senderName,
  withReadSession,
} from "../read.js";
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

/** Identifies the exact chat, text and mentioned people; `send --confirm` must quote it. */
export function draftHash(chatId: string, text: string, mentions: readonly Person[] = []): string {
  return createHash("sha256")
    .update(`${chatId}\n${text}\n${mentions.map((p) => p.mri).join(",")}`)
    .digest("hex")
    .slice(0, HASH_LENGTH);
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
    const { mentions } = toTeamsHtml(text, authors(history));
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
      mentions: mentions.map((p) => p.name),
      hash: draftHash(chatId, text, mentions),
    };
  });
};

/** Mentions resolve against recent authors, which needs a read; plain text needs none. */
async function format(
  ctx: Parameters<Command>[1],
  session: ReadSession,
  chatId: string,
  text: string,
) {
  const people = text.includes("@[")
    ? authors(await listMessages(ctx.fetch, session, chatId, HISTORY))
    : [];
  return toTeamsHtml(text, people);
}

/** Sends only if `--confirm` matches the draft hash of exactly this chat, text and mentions. */
export const send: Command = async (args, ctx) => {
  const { chatId, text, confirm } = target(args, SEND_USAGE, true);
  if (confirm === undefined || !HASH.test(confirm)) {
    throw usage(`--confirm must be the 12-character hash from draft.\n${SEND_USAGE}`);
  }
  if (!text.includes("@[") && confirm !== draftHash(chatId, text)) {
    throw changed();
  }
  const sent = await withReadSession(ctx, async (session) => {
    const message = await format(ctx, session, chatId, text);
    if (confirm !== draftHash(chatId, text, message.mentions)) {
      throw changed();
    }
    return sendMessage(ctx.fetch, session, chatId, message);
  });
  return { sent: true, ...sent };
};

/** The correct hash is deliberately not returned: a change needs a new draft and approval. */
function changed(): ClerkhandError {
  return new ClerkhandError(
    "draft_changed",
    "The chat, text or mentioned people are not the ones confirmed. Run draft again, show it to the user and confirm.",
  );
}
