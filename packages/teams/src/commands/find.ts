import { listConversations, listMessages } from "../api.js";
import { type Command, parse, usage } from "../context.js";
import { compactChats, senderName, withReadSession } from "../read.js";
import { record } from "../storage.js";

const ALL = 500;
const MAX_MATCHES = 20;
const MAX_QUERY = 100;
const HISTORY = 20;
const MAX_SCANNED = 100;
const CONCURRENCY = 16;

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replaceAll(",", " ").replace(/\s+/gu, " ").trim();
}

/**
 * Finds chats by group/meeting name or by the name of someone who wrote in them. 1:1 chats whose
 * last message is the user's own are resolved from their recent history (bounded).
 * Returns every match; it never picks one.
 */
export const find: Command = (args, ctx) => {
  const { positionals } = parse(args, { allowPositionals: true });
  const query = normalize(positionals.join(" "));
  if (query === "" || query.length > MAX_QUERY) {
    throw usage("Usage: clerkhand-teams find <name>");
  }
  const words = query.split(" ");
  const matches = (value: string) => {
    const name = normalize(value);
    return name !== "" && words.every((word) => name.includes(word));
  };
  return withReadSession(ctx, async (session) => {
    const { chats } = compactChats(await listConversations(ctx.fetch, session), ALL, {
      userId: session.userId,
    });
    const unknown = chats
      .filter((chat) => chat.kind === "oneOnOne" && chat.lastSender === "me")
      .slice(0, MAX_SCANNED);
    const partners = new Map<string, string>();
    for (let i = 0; i < unknown.length; i += CONCURRENCY) {
      await Promise.all(
        unknown.slice(i, i + CONCURRENCY).map(async (chat) => {
          const history = await listMessages(ctx.fetch, session, chat.id, HISTORY);
          const name = history
            .map((m) => senderName(record(m), session.userId))
            .find((n) => n && n !== "me");
          if (name) {
            partners.set(chat.id, name);
          }
        }),
      );
    }
    const found = chats.flatMap((chat) => {
      const person = chat.lastSender === "me" ? (partners.get(chat.id) ?? "") : chat.lastSender;
      if (!(matches(chat.name) || matches(person))) {
        return [];
      }
      return [
        {
          id: chat.id,
          kind: chat.kind,
          name: chat.name,
          ...(chat.kind === "oneOnOne" ? { with: person } : { lastSender: chat.lastSender }),
          lastMessageAt: chat.lastMessageAt,
        },
      ];
    });
    return { matches: found.slice(0, MAX_MATCHES), truncated: found.length > MAX_MATCHES };
  });
};
