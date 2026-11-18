import { ClerkhandError } from "@clerkhand/core";
import type { Session } from "./api.js";
import { refreshCredential } from "./auth.js";
import type { Context } from "./context.js";
import { loadCredential, needsRefresh, record, withLock } from "./storage.js";

const MAX_TEXT = 4000;
const MAX_FIELD = 512;
const REFRESH = { headed: false, waitSeconds: 30 };

/**
 * Runs read-only `action` with a valid session. One initial refresh OR one refresh after an
 * authentication rejection; the action is re-run at most once and never loops.
 */
export interface ReadSession extends Session {
  userId: string;
}
export function withReadSession<T>(
  ctx: Context,
  action: (session: ReadSession) => Promise<T>,
): Promise<T> {
  return withLock(ctx.paths, async () => {
    let refreshed = false;
    if (needsRefresh(loadCredential(ctx.paths.credentialsPath), ctx.now())) {
      await refreshCredential(ctx.paths, REFRESH, ctx);
      refreshed = true;
    }
    try {
      return await action(session(ctx));
    } catch (error) {
      if (
        !(error instanceof ClerkhandError) ||
        error.code !== "authentication_failed" ||
        refreshed
      ) {
        throw error;
      }
      await refreshCredential(ctx.paths, REFRESH, ctx);
      return action(session(ctx));
    }
  });
}

function session(ctx: Context): ReadSession {
  const credential = loadCredential(ctx.paths.credentialsPath);
  if (!credential) {
    throw new ClerkhandError("authentication_failed", "No managed credential after refresh.");
  }
  return { token: credential.token, messageApi: credential.messageApi, userId: credential.userId };
}

function text(value: unknown, max = MAX_FIELD): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Self chat ("48:notes"), 1:1, group and meeting chats; channels and notification streams are skipped. */
export function chatKind(id: string, properties: Record<string, unknown>): string | undefined {
  if (properties["groupId"]) {
    return undefined;
  }
  if (id === "48:notes" || properties["threadType"] === "streamofnotes") {
    return "self";
  }
  if (properties["threadType"] === "meeting") {
    return "meeting";
  }
  if (properties["threadType"] && properties["threadType"] !== "chat") {
    return undefined;
  }
  if (properties["productThreadType"]) {
    return properties["productThreadType"] === "OneToOneChat" ? "oneOnOne" : "group";
  }
  return id.endsWith("@unq.gbl.spaces") ? "oneOnOne" : "group";
}

/**
 * Unread when the last message is newer than the chat's read marker (`consumptionhorizon`,
 * "lastReadId;time;...") and was not sent by the user. `null` when Teams gives no marker.
 */
export function isUnread(conversation: Record<string, unknown>, userId: string): boolean | null {
  const last = record(conversation["lastMessage"]);
  const lastId = Number(last["id"]);
  if (!Number.isSafeInteger(lastId)) {
    return false;
  }
  if (fromUser(last, userId)) {
    return false;
  }
  const horizon = record(conversation["properties"])["consumptionhorizon"];
  const readId = typeof horizon === "string" ? Number(horizon.split(";")[0]) : Number.NaN;
  return Number.isSafeInteger(readId) ? lastId > readId : null;
}

/** Whether a raw Teams message was sent by the signed-in user. */
export function fromUser(message: Record<string, unknown>, userId: string): boolean {
  return String(message["from"] ?? "")
    .toLowerCase()
    .endsWith(`8:orgid:${userId}`);
}

/** Display name of a message's sender, or "me" for the signed-in user. */
export function senderName(message: Record<string, unknown>, userId: string): string {
  return fromUser(message, userId) ? "me" : text(message["imdisplayname"]);
}

export function compactChats(
  conversations: unknown[],
  limit: number,
  options: { userId: string; unreadOnly?: boolean },
) {
  const chats = conversations.flatMap((item) => {
    const conversation = record(item);
    const id = conversation["id"];
    if (typeof id !== "string") {
      throw new ClerkhandError("teams_schema", "Teams returned an invalid chat.");
    }
    const properties = record(conversation["threadProperties"]);
    const kind = chatKind(id, properties);
    if (!kind) {
      return [];
    }
    const unread = isUnread(conversation, options.userId);
    if (options.unreadOnly && unread !== true) {
      return [];
    }
    const last = record(conversation["lastMessage"]);
    return [
      {
        id: text(id),
        kind,
        name: text(properties["topic"]),
        lastMessage: htmlToText(text(last["content"], MAX_TEXT)),
        lastMessageAt: text(last["composetime"] ?? last["originalarrivaltime"]),
        lastSender: senderName(last, options.userId),
        unread,
      },
    ];
  });
  return { chats: chats.slice(0, limit), truncated: chats.length > limit };
}

/** `fetched` is newest first (see listMessages); output is oldest first. Fetch `limit + 1`. */
export function compactMessages(fetched: unknown[], limit: number) {
  const messages = fetched
    .slice(0, limit)
    .map((item) => {
      const message = record(item);
      if (typeof message["id"] !== "string") {
        throw new ClerkhandError("teams_schema", "Teams returned an invalid message.");
      }
      const properties = record(message["properties"]);
      const raw = text(message["content"], Number.POSITIVE_INFINITY);
      const content = message["messagetype"] === "Text" ? raw : htmlToText(raw);
      return {
        id: text(message["id"]),
        author: text(message["imdisplayname"]),
        time: text(message["composetime"] ?? message["originalarrivaltime"]),
        text: content.slice(0, MAX_TEXT),
        edited: Boolean(properties["edittime"]),
        textTruncated: content.length > MAX_TEXT,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
  return { messages, truncated: fetched.length > limit };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const EMOJI = /<img\b[^>]*itemtype="http:\/\/schema\.skype\.com\/Emoji"[^>]*>/giu;
const ALT = /\balt="(?<alt>[^"]*)"/u;
const LINK = /<a\b[^>]*\bhref="(?<href>[^"]*)"[^>]*>(?<label>[\s\S]*?)<\/a>/giu;
const BLOCK = /<\/?(?:p|div|li|tr|blockquote|pre|h[1-6]|ul|ol|table)\b[^>]*>/giu;
const TAG = /<[^>]*>/gu;
const MAX_CODE_POINT = 0x10_ff_ff;
const HEX = 16;

/** Teams rich text to plain text. Links keep their target; other markup and images are dropped. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/\s*[\r\n]+\s*/gu, " ")
      .replace(EMOJI, (tag) => ALT.exec(tag)?.groups?.["alt"] ?? "")
      .replace(LINK, (...match) => {
        const { href = "", label = "" } = match.at(-1) as Record<string, string>;
        const plain = label.replace(TAG, "");
        return !plain || plain === href ? href : `${plain} (${href})`;
      })
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(BLOCK, "\n")
      .replace(TAG, ""),
  )
    .replace(/[ \t]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function decode(value: string): string {
  return value.replace(/&(?<code>#x[\da-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code.startsWith("#")) {
      const hex = code[1]?.toLowerCase() === "x";
      const point = hex ? Number.parseInt(code.slice("#x".length), HEX) : Number(code.slice(1));
      return Number.isInteger(point) && point <= MAX_CODE_POINT
        ? String.fromCodePoint(point)
        : entity;
    }
    return ENTITIES[code.toLowerCase()] ?? entity;
  });
}
