import { ClerkhandError, type Driver } from "@clerkhand/core";
import { type Chat, clickChat, listChats } from "./page/chats.js";
import { loadOlderMessages, type Message, readMessages, waitForChat } from "./page/messages.js";
import { type PageState, readPageState } from "./page/state.js";

export const TEAMS_URL = "https://teams.cloud.microsoft/";
export const SESSION = "clerkhand-teams";
/** Height decides how many messages Teams renders; keep it fixed. */
export const VIEWPORT = { width: 1280, height: 900 } as const;
/** agent-browser action names this tool needs. Everything else is denied. */
export const ALLOWED_ACTIONS = ["navigate", "viewport", "evaluate", "wait", "close"] as const;
/**
 * `draft` and `edit` also fill a text box. `fill` inserts text without key events,
 * so it cannot press Enter; a newline becomes a line break. Key presses and
 * typing (`press`, `type`, `keyboard`) stay denied everywhere.
 */
export const DRAFT_ACTIONS = [...ALLOWED_ACTIONS, "fill"] as const;

const POLL_MS = 1000;
const LOAD_OLDER_TIMEOUT_MS = 5000;
const MAX_CANDIDATES = 5;
const WORD_SEPARATOR = /[\s,]+/u;

export interface Clock {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const realClock: Clock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

export interface ReadyOptions {
  timeoutMs: number;
  /**
   * What to do on a sign-in page: fail (default), return the state at once
   * (`status`), or keep waiting for the user to finish (`login`).
   */
  onSignIn?: "fail" | "return" | "wait";
  clock?: Clock;
}

/** Makes sure the session shows Teams and the chat list is ready. */
export async function ensureTeams(driver: Driver, options: ReadyOptions): Promise<PageState> {
  const clock = options.clock ?? realClock;
  const initial = await driver.evaluate(readPageState, undefined);
  if (!(initial.ready || initial.signIn || initial.url.startsWith(TEAMS_URL))) {
    await driver.run(["set", "viewport", String(VIEWPORT.width), String(VIEWPORT.height)]);
    await driver.run(["open", TEAMS_URL]);
  }

  const deadline = clock.now() + options.timeoutMs;
  while (true) {
    const state = await driver.evaluate(readPageState, undefined);
    if (state.ready) {
      return checkLanguage(state);
    }
    if (state.signIn && stopOnSignIn(options)) {
      return state;
    }
    if (clock.now() > deadline) {
      return timedOut(state, options);
    }
    await clock.sleep(POLL_MS);
  }
}

function stopOnSignIn(options: ReadyOptions): boolean {
  if (options.onSignIn === "wait") {
    return false;
  }
  if (options.onSignIn === "return") {
    return true;
  }
  throw new ClerkhandError(
    "not_signed_in",
    "Teams needs a sign-in. Ask the user to run `clerkhand-teams login`.",
  );
}

function timedOut(state: PageState, options: ReadyOptions): PageState {
  if (state.signIn) {
    return state;
  }
  throw new ClerkhandError("teams_not_ready", `Teams did not load within ${options.timeoutMs}ms.`, {
    details: { url: state.url },
  });
}

function checkLanguage(state: PageState): PageState {
  if (!state.lang.toLowerCase().startsWith("en")) {
    throw new ClerkhandError(
      "unsupported_language",
      `Only the English Teams UI is supported (found "${state.lang}").`,
    );
  }
  return state;
}

export function getChats(driver: Driver): Promise<Chat[]> {
  return driver.evaluate(listChats, undefined);
}

/** Matches a chat by id, then by exact name, then case-insensitive name. Never guesses. */
export function resolveChat(chats: readonly Chat[], query: string): Chat {
  const byId = chats.find((c) => c.id === query);
  if (byId) {
    return byId;
  }
  const exact = chats.filter((c) => c.name === query);
  const matches =
    exact.length > 0 ? exact : chats.filter((c) => c.name.toLowerCase() === query.toLowerCase());
  const [first, ...rest] = matches;
  if (first && rest.length === 0) {
    return first;
  }
  if (matches.length > 1) {
    throw new ClerkhandError("ambiguous_chat", `Several chats are named "${query}". Use an id.`, {
      details: { candidates: matches.map(brief) },
    });
  }
  throw new ClerkhandError(
    "chat_not_found",
    `No chat named "${query}" in the sidebar. Only chats listed by \`clerkhand-teams chats\` can be opened.`,
    { details: { candidates: similar(chats, query).map(brief) } },
  );
}

function similar(chats: readonly Chat[], query: string): Chat[] {
  const words = query.toLowerCase().split(WORD_SEPARATOR).filter(Boolean);
  return chats
    .filter((c) => words.some((w) => c.name.toLowerCase().includes(w)))
    .slice(0, MAX_CANDIDATES);
}

function brief(chat: Chat): { id: string; name: string; kind: string } {
  return { id: chat.id, name: chat.name, kind: chat.kind };
}

/** Opens `chat` and verifies the main pane shows exactly that thread. */
export async function openChat(driver: Driver, chat: Chat, timeoutMs: number): Promise<void> {
  const state = await driver.evaluate(readPageState, undefined);
  if (state.openChatId !== chat.id) {
    const { clicked } = await driver.evaluate(clickChat, chat.id);
    if (!clicked) {
      throw new ClerkhandError("chat_not_found", `"${chat.name}" is no longer in the sidebar.`);
    }
  }
  const { open } = await driver.evaluate(waitForChat, { id: chat.id, timeoutMs });
  if (!open) {
    throw new ClerkhandError(
      "chat_not_opened",
      `"${chat.name}" did not open within ${timeoutMs}ms.`,
    );
  }
}

/** Collects the last `count` messages of the open chat, loading older ones as needed. */
export async function lastMessages(driver: Driver, chat: Chat, count: number): Promise<Message[]> {
  const byId = new Map<string, Message>();
  const collect = async () => {
    const page = await driver.evaluate(readMessages, undefined);
    if (page.chatId !== chat.id) {
      throw new ClerkhandError("chat_changed", "The open chat changed while reading.");
    }
    for (const m of page.messages) {
      byId.set(m.id, m);
    }
  };
  await collect();
  while (byId.size < count) {
    const { loaded } = await driver.evaluate(loadOlderMessages, LOAD_OLDER_TIMEOUT_MS);
    if (!loaded) {
      break;
    }
    await collect();
  }
  return [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)).slice(-count);
}
