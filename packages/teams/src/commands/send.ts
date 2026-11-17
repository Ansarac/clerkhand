import { createHash } from "node:crypto";
import { ClerkhandError } from "@clerkhand/core";
import { SELF_CHAT_ID, sendToSelf } from "../api.js";
import { type Command, parse, usage } from "../context.js";
import { withReadSession } from "../read.js";

const MAX_TEXT = 4000;
const HASH_LENGTH = 12;
const HASH = /^[0-9a-f]{12}$/u;
const DRAFT_USAGE = "Usage: clerkhand-teams draft self --text T";
const SEND_USAGE = "Usage: clerkhand-teams send self --text T --confirm <hash>";

/** Identifies the exact target and text; `send --confirm` must quote it. */
export function draftHash(chatId: string, text: string): string {
  return createHash("sha256").update(`${chatId}\n${text}`).digest("hex").slice(0, HASH_LENGTH);
}

/** Sending is limited to the user's own self-chat in this version. */
function target(args: string[], usageText: string, confirm: boolean) {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { text: { type: "string" }, ...(confirm ? { confirm: { type: "string" } } : {}) },
  });
  const [chat, ...extra] = positionals;
  if (chat === undefined || extra.length > 0 || values.text === undefined) {
    throw usage(usageText);
  }
  if (chat !== "self") {
    throw new ClerkhandError(
      "send_target_disabled",
      "Only the self-chat can receive messages in this version.",
    );
  }
  const { text } = values;
  if (text.trim() === "" || text.length > MAX_TEXT) {
    throw usage(`--text must be non-empty and at most ${MAX_TEXT} characters.`);
  }
  return { text, confirm: (values as { confirm?: string }).confirm };
}

/** Previews a message and its confirmation hash. No network access; nothing is sent. */
export const draft: Command = (args) => {
  const { text } = target(args, DRAFT_USAGE, false);
  return Promise.resolve({ chatId: SELF_CHAT_ID, text, hash: draftHash(SELF_CHAT_ID, text) });
};

/** Sends to the self-chat only if `--confirm` matches the draft hash of exactly this text. */
export const send: Command = async (args, ctx) => {
  const { text, confirm } = target(args, SEND_USAGE, true);
  if (confirm === undefined || !HASH.test(confirm)) {
    throw usage(`--confirm must be the 12-character hash from draft.\n${SEND_USAGE}`);
  }
  // The correct hash is deliberately not returned: a changed text needs a new draft and approval.
  if (confirm !== draftHash(SELF_CHAT_ID, text)) {
    throw new ClerkhandError(
      "draft_changed",
      "The text is not the one confirmed. Run draft again, show it to the user and confirm.",
    );
  }
  const sent = await withReadSession(ctx, (session) => sendToSelf(ctx.fetch, session, text));
  return { sent: true, ...sent };
};
