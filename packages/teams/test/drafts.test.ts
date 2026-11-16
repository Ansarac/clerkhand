import { describe, expect, it } from "vitest";
import { readDraft, sendDraft, writeDraft } from "../src/drafts.js";
import type { Chat } from "../src/page/chats.js";
import {
  COMPOSE_MARK,
  type ComposeResult,
  clickSend,
  readCompose,
  selectCompose,
} from "../src/page/compose.js";
import { type Message, readMessages } from "../src/page/messages.js";
import { fakeClock, fakeDriver } from "./helpers.js";

const target: Chat = {
  id: "19:a@thread.v2",
  name: "Project Alpha",
  kind: "group",
  folder: "RecentChats",
  unread: false,
  muted: false,
};

/** sha256("hello").slice(0, 12) */
const HELLO_HASH = "2cf24dba5fb0";

function box(text: string): ComposeResult {
  return { chatId: target.id, boxes: 1, text };
}

function message(id: string, text: string): Message {
  return { id, author: "Me", time: null, text, edited: false };
}

/** A compose box that holds `initial` until a fill replaces it with `onFill(text)`. */
function composeDriver(initial: string, onFill = (text: string) => text) {
  const driver = fakeDriver((fn) => {
    if (!(fn === selectCompose || fn === readCompose)) {
      throw new Error("unexpected page function");
    }
    const fill = driver.runs.findLast((args) => args[0] === "fill");
    return box(fill ? onFill(fill[2] ?? "") : initial);
  });
  return driver;
}

/** A chat whose Send click posts the draft after `delay` polls, unless `post` is false. */
function sendDriver(draft: string, options: { post?: boolean; delay?: number } = {}) {
  let clicks = 0;
  let polls = 0;
  const posted = () => clicks > 0 && options.post !== false && polls > (options.delay ?? 0);
  const driver = fakeDriver((fn, arg) => {
    if (fn === readCompose) {
      return box(posted() ? "\n" : `${draft}\n`);
    }
    if (fn === readMessages) {
      polls += clicks;
      const messages = [message("1", "older"), ...(posted() ? [message("2", draft)] : [])];
      return { chatId: target.id, messages };
    }
    if (fn === clickSend) {
      if (JSON.stringify(arg) !== JSON.stringify({ chatId: target.id, text: draft })) {
        throw new Error("clickSend got the wrong target");
      }
      clicks += 1;
      return { clicked: true };
    }
    throw new Error("unexpected page function");
  });
  return Object.assign(driver, { clicks: () => clicks });
}

describe("readDraft", () => {
  it("drops the editor's trailing line break and hashes the text", async () => {
    expect(await readDraft(composeDriver("hello\n"), target)).toEqual({
      text: "hello",
      hash: HELLO_HASH,
    });
    expect((await readDraft(composeDriver("\n"), target)).text).toBe("");
  });
});

describe("writeDraft", () => {
  it("fills only the marked compose box and returns the text read back", async () => {
    const driver = composeDriver("old");
    expect((await writeDraft(driver, target, "new\nline two")).text).toBe("new\nline two");
    expect(driver.runs).toEqual([["fill", `[${COMPOSE_MARK}]`, "new\nline two"]]);
  });

  it("selects the box in the requested chat before filling", async () => {
    const args: unknown[] = [];
    const driver = fakeDriver((_fn, arg) => {
      args.push(arg);
      return box("");
    });
    await writeDraft(driver, target, "");
    expect(args[0]).toEqual({ chatId: target.id, mark: COMPOSE_MARK });
  });

  it("fails when the read-back text differs", async () => {
    const driver = composeDriver("", (text) => `${text} extra`);
    await expect(writeDraft(driver, target, "hello")).rejects.toMatchObject({
      code: "draft_mismatch",
      details: { expected: "hello", actual: "hello extra" },
    });
  });

  it("does not fill when another chat is open", async () => {
    const driver = fakeDriver(() => ({ ...box(""), chatId: "19:other@thread.v2" }));
    await expect(writeDraft(driver, target, "hello")).rejects.toMatchObject({
      code: "chat_changed",
    });
    expect(driver.runs).toEqual([]);
  });

  it("does not fill when the compose box is missing or ambiguous", async () => {
    for (const boxes of [0, 2]) {
      const driver = fakeDriver(() => ({ ...box(""), boxes }));
      await expect(writeDraft(driver, target, "hello")).rejects.toMatchObject({
        code: "compose_not_found",
      });
      expect(driver.runs).toEqual([]);
    }
  });
});

describe("sendDraft", () => {
  it("sends the confirmed draft and returns the posted message", async () => {
    const driver = sendDriver("hello", { delay: 2 });
    expect(await sendDraft(driver, target, HELLO_HASH, fakeClock())).toEqual(message("2", "hello"));
    expect(driver.clicks()).toBe(1);
  });

  it("refuses a draft whose hash was not confirmed", async () => {
    const driver = sendDriver("hello");
    await expect(sendDraft(driver, target, "000000000000", fakeClock())).rejects.toMatchObject({
      code: "draft_changed",
      details: { draft: "hello", hash: HELLO_HASH },
    });
    expect(driver.clicks()).toBe(0);
  });

  it("refuses an empty draft", async () => {
    const driver = sendDriver("");
    await expect(sendDraft(driver, target, HELLO_HASH, fakeClock())).rejects.toMatchObject({
      code: "draft_empty",
    });
    expect(driver.clicks()).toBe(0);
  });

  it("reports why the page refused to click", async () => {
    const driver = fakeDriver((fn) => {
      if (fn === readCompose) {
        return box("hello");
      }
      if (fn === readMessages) {
        return { chatId: target.id, messages: [] };
      }
      return { clicked: false, reason: "no_button" };
    });
    await expect(sendDraft(driver, target, HELLO_HASH, fakeClock())).rejects.toMatchObject({
      code: "no_button",
    });
  });

  it("clicks once and never retries when the message does not appear", async () => {
    const driver = sendDriver("hello", { post: false });
    await expect(sendDraft(driver, target, HELLO_HASH, fakeClock())).rejects.toMatchObject({
      code: "send_unconfirmed",
    });
    expect(driver.clicks()).toBe(1);
  });
});
