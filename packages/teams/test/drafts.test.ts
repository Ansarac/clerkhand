import { describe, expect, it } from "vitest";
import type { Chat } from "../src/page/chats.js";
import {
  COMPOSE_MARK,
  type ComposeResult,
  readCompose,
  selectCompose,
} from "../src/page/compose.js";
import { readDraft, writeDraft } from "../src/teams.js";
import { fakeDriver } from "./helpers.js";

const target: Chat = {
  id: "19:a@thread.v2",
  name: "Project Alpha",
  kind: "group",
  folder: "RecentChats",
  unread: false,
  muted: false,
};

function box(text: string): ComposeResult {
  return { chatId: target.id, boxes: 1, text };
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

describe("readDraft", () => {
  it("drops the editor's trailing line break", async () => {
    expect(await readDraft(composeDriver("Hi\n"), target)).toBe("Hi");
    expect(await readDraft(composeDriver("\n"), target)).toBe("");
  });
});

describe("writeDraft", () => {
  it("fills only the marked compose box and returns the text read back", async () => {
    const driver = composeDriver("old");
    expect(await writeDraft(driver, target, "new\nline two")).toBe("new\nline two");
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
