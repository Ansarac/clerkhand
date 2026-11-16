import { describe, expect, it } from "vitest";
import { type Chat, clickChat, listChats } from "../src/page/chats.js";
import { readCompose, selectCompose } from "../src/page/compose.js";
import {
  loadOlderMessages,
  type Message,
  readMessages,
  waitForChat,
} from "../src/page/messages.js";
import { type PageState, readPageState } from "../src/page/state.js";
import { ensureTeams, lastMessages, openChat, resolveChat, TEAMS_URL } from "../src/teams.js";
import { fakeClock, fakeDriver } from "./helpers.js";

const READY: PageState = {
  url: TEAMS_URL,
  signIn: false,
  ready: true,
  lang: "en-US",
  openChatId: null,
};

function chat(id: string, name: string): Chat {
  return { id, name, kind: "group", folder: "RecentChats", unread: false, muted: false };
}

function msg(id: number): Message {
  return { id: String(id), author: "A", time: null, text: `m${id}`, edited: false, deleted: false };
}

describe("ensureTeams", () => {
  it("navigates to Teams at a fixed viewport when another page is open", async () => {
    const states = [{ ...READY, url: "about:blank", ready: false }, READY];
    const driver = fakeDriver(() => states.shift());
    await ensureTeams(driver, { timeoutMs: 5000, clock: fakeClock() });
    expect(driver.runs).toEqual([
      ["set", "viewport", "1280", "900"],
      ["open", TEAMS_URL],
    ]);
  });

  it("does not navigate when Teams is already loaded", async () => {
    const driver = fakeDriver(() => READY);
    await ensureTeams(driver, { timeoutMs: 5000, clock: fakeClock() });
    expect(driver.runs).toEqual([]);
  });

  it("asks for a login on the sign-in page", async () => {
    const driver = fakeDriver(() => ({ ...READY, ready: false, signIn: true }));
    await expect(
      ensureTeams(driver, { timeoutMs: 5000, clock: fakeClock() }),
    ).rejects.toMatchObject({
      code: "not_signed_in",
    });
  });

  it("returns the sign-in state when asked to", async () => {
    const driver = fakeDriver(() => ({ ...READY, ready: false, signIn: true }));
    const state = await ensureTeams(driver, {
      timeoutMs: 5000,
      onSignIn: "return",
      clock: fakeClock(),
    });
    expect(state.signIn).toBe(true);
  });

  it("keeps waiting on the sign-in page during login", async () => {
    const states = [
      { ...READY, ready: false, signIn: true },
      { ...READY, ready: false, signIn: true },
      READY,
    ];
    const driver = fakeDriver(() => states.shift() ?? READY);
    const state = await ensureTeams(driver, {
      timeoutMs: 60_000,
      onSignIn: "wait",
      clock: fakeClock(),
    });
    expect(state.ready).toBe(true);
  });

  it("times out when Teams never becomes ready", async () => {
    const driver = fakeDriver(() => ({ ...READY, ready: false }));
    await expect(
      ensureTeams(driver, { timeoutMs: 3000, clock: fakeClock() }),
    ).rejects.toMatchObject({
      code: "teams_not_ready",
    });
  });

  it("rejects a non-English Teams UI", async () => {
    const driver = fakeDriver(() => ({ ...READY, lang: "de-DE" }));
    await expect(
      ensureTeams(driver, { timeoutMs: 5000, clock: fakeClock() }),
    ).rejects.toMatchObject({
      code: "unsupported_language",
    });
  });
});

describe("resolveChat", () => {
  const chats = [
    chat("19:a@thread.v2", "Project Alpha"),
    chat("19:b@thread.v2", "Roe, Rick"),
    chat("19:c@thread.v2", "Twin"),
    chat("19:d@thread.v2", "Twin"),
  ];

  it("matches an id exactly", () => {
    expect(resolveChat(chats, "19:b@thread.v2").name).toBe("Roe, Rick");
  });

  it("matches an exact display name", () => {
    expect(resolveChat(chats, "Project Alpha").id).toBe("19:a@thread.v2");
  });

  it("falls back to a case-insensitive name match", () => {
    expect(resolveChat(chats, "roe, rick").id).toBe("19:b@thread.v2");
  });

  it("refuses to guess between chats with the same name", () => {
    expect(() => resolveChat(chats, "Twin")).toThrow(
      expect.objectContaining({
        code: "ambiguous_chat",
        details: {
          candidates: [
            { id: "19:c@thread.v2", name: "Twin", kind: "group" },
            { id: "19:d@thread.v2", name: "Twin", kind: "group" },
          ],
        },
      }),
    );
  });

  it("suggests similar names for an unknown chat without picking one", () => {
    expect(() => resolveChat(chats, "Alpha")).toThrow(
      expect.objectContaining({
        code: "chat_not_found",
        details: { candidates: [{ id: "19:a@thread.v2", name: "Project Alpha", kind: "group" }] },
      }),
    );
  });
});

describe("openChat", () => {
  const target = chat("19:a@thread.v2", "Project Alpha");

  it("clicks the chat and waits for its header", async () => {
    const called: unknown[] = [];
    const driver = fakeDriver((fn, arg) => {
      called.push(fn);
      if (fn === readPageState) {
        return READY;
      }
      if (fn === clickChat) {
        expect(arg).toBe("19:a@thread.v2");
        return { clicked: true };
      }
      return { open: true };
    });
    await openChat(driver, target, 1000);
    expect(called).toEqual([readPageState, clickChat, waitForChat]);
  });

  it("does not click when the chat is already open", async () => {
    const called: unknown[] = [];
    const driver = fakeDriver((fn) => {
      called.push(fn);
      return fn === readPageState ? { ...READY, openChatId: target.id } : { open: true };
    });
    await openChat(driver, target, 1000);
    expect(called).toEqual([readPageState, waitForChat]);
  });

  it("fails when the chat left the sidebar", async () => {
    const driver = fakeDriver((fn) => (fn === readPageState ? READY : { clicked: false }));
    await expect(openChat(driver, target, 1000)).rejects.toMatchObject({ code: "chat_not_found" });
  });

  it("fails when the header never shows that chat", async () => {
    const replies = new Map<unknown, unknown>([
      [readPageState, READY],
      [clickChat, { clicked: true }],
      [waitForChat, { open: false }],
    ]);
    const driver = fakeDriver((fn) => replies.get(fn));
    await expect(openChat(driver, target, 1000)).rejects.toMatchObject({ code: "chat_not_opened" });
  });
});

describe("lastMessages", () => {
  const target = chat("19:a@thread.v2", "Project Alpha");

  it("loads older messages until it has enough and returns the newest N oldest first", async () => {
    const pages = [
      [msg(3), msg(4)],
      [msg(2), msg(3), msg(4)],
      [msg(1), msg(2), msg(3), msg(4)],
    ];
    const driver = fakeDriver((fn) => {
      if (fn === readMessages) {
        return { chatId: target.id, messages: pages.shift() ?? [] };
      }
      expect(fn).toBe(loadOlderMessages);
      return { loaded: true };
    });
    const messages = await lastMessages(driver, target, 3);
    expect(messages.map((m) => m.id)).toEqual(["2", "3", "4"]);
  });

  it("stops at the start of the chat", async () => {
    const driver = fakeDriver((fn) =>
      fn === readMessages ? { chatId: target.id, messages: [msg(1)] } : { loaded: false },
    );
    expect(await lastMessages(driver, target, 10)).toEqual([msg(1)]);
  });

  it("orders ids numerically", async () => {
    const driver = fakeDriver(() => ({ chatId: target.id, messages: [msg(10), msg(9)] }));
    expect((await lastMessages(driver, target, 2)).map((m) => m.id)).toEqual(["9", "10"]);
  });

  it("fails if another chat opens while reading", async () => {
    const driver = fakeDriver(() => ({ chatId: "19:other@thread.v2", messages: [] }));
    await expect(lastMessages(driver, target, 5)).rejects.toMatchObject({ code: "chat_changed" });
  });
});

describe("page functions used by commands", () => {
  it("are distinct functions so fakes can tell them apart", () => {
    const fns = [
      readPageState,
      listChats,
      clickChat,
      waitForChat,
      readMessages,
      loadOlderMessages,
      selectCompose,
      readCompose,
    ];
    expect(new Set(fns).size).toBe(fns.length);
  });
});
