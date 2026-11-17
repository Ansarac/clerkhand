import { ClerkhandError } from "@clerkhand/core";
import { refreshCredential } from "./auth.js";
import type { Context } from "./context.js";
import type { ReadOperation } from "./messenger.js";
import { loadCredential, needsRefresh, record, withLock } from "./storage.js";

const MAX_TEXT = 4000;
const MAX_FIELD = 512;

/** One initial refresh OR one auth-error refresh; never loop across refreshes. */
export function readOperation(operation: ReadOperation, ctx: Context): Promise<unknown> {
  return withReadSession(ctx, (run) => run(operation));
}

export function withReadSession<T>(
  ctx: Context,
  action: (run: (operation: ReadOperation) => Promise<unknown>) => Promise<T>,
): Promise<T> {
  return withLock(ctx.paths, async () => {
    let refreshed = false;
    if (needsRefresh(loadCredential(ctx.paths.credentialsPath), ctx.now())) {
      await refreshCredential(ctx.paths, { headed: false, waitSeconds: 30 }, ctx);
      refreshed = true;
    }
    return action(async (operation) => {
      try {
        return await ctx.messenger(operation, ctx.paths.configDir);
      } catch (error) {
        if (
          !(error instanceof ClerkhandError) ||
          error.code !== "authentication_failed" ||
          refreshed
        ) {
          throw error;
        }
        await refreshCredential(ctx.paths, { headed: false, waitSeconds: 30 }, ctx);
        refreshed = true;
        return ctx.messenger(operation, ctx.paths.configDir);
      }
    });
  });
}

function text(value: unknown, max = MAX_FIELD): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}
export function compactChats(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    throw new ClerkhandError(
      "messenger_schema",
      "agent-messenger returned an unexpected chat list.",
    );
  }
  const chats = value.slice(0, limit).map((item: unknown) => {
    const chat = record(item);
    if (
      typeof chat["id"] !== "string" ||
      !["oneOnOne", "group", "self"].includes(String(chat["type"]))
    ) {
      throw new ClerkhandError("messenger_schema", "agent-messenger returned an invalid chat.");
    }
    return {
      id: text(chat["id"]),
      kind: text(chat["type"]),
      name: text(chat["topic"]),
      lastMessage: text(chat["last_message"], MAX_TEXT),
      lastMessageAt: text(chat["last_message_at"]),
    };
  });
  return { chats, truncated: value.length > limit };
}
export function compactMessages(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    throw new ClerkhandError(
      "messenger_schema",
      "agent-messenger returned unexpected message history.",
    );
  }
  const messages = value
    .slice(0, limit)
    .map((item: unknown) => {
      const message = record(item);
      if (typeof message["id"] !== "string" || typeof message["content"] !== "string") {
        throw new ClerkhandError(
          "messenger_schema",
          "agent-messenger returned an invalid message.",
        );
      }
      return {
        id: text(message["id"]),
        author: text(message["author"]),
        time: text(message["timestamp"]),
        text: text(message["content"], MAX_TEXT),
        edited: Boolean(message["edited_at"]),
        deleted: Boolean(message["deleted_at"]),
        textTruncated: message["content"].length > MAX_TEXT,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
  return { messages, truncated: value.length > limit };
}
