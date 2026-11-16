import { describe, expect, it } from "vitest";
import { deleteMessage, EDIT_MARK, editMessage, findMessage, undoDelete } from "../src/actions.js";
import {
  clickDelete,
  clickUndoDelete,
  dismissMenus,
  finishEditor,
  openEditor,
  readEditor,
} from "../src/page/actions.js";
import type { Chat } from "../src/page/chats.js";
import { loadOlderMessages, type Message, readMessages } from "../src/page/messages.js";
import { fakeClock, fakeDriver } from "./helpers.js";

const target: Chat = {
  id: "19:a@thread.v2",
  name: "Project Alpha",
  kind: "group",
  folder: "RecentChats",
  unread: false,
  muted: false,
};

function message(id: string, patch: Partial<Message> = {}): Message {
  return { id, author: "Me", time: null, text: "old", edited: false, deleted: false, ...patch };
}

interface Fake {
  /** Messages per readMessages call; the last one repeats. */
  pages: Message[][];
  editor?: { editing: boolean; text: string };
  action?: { ok: boolean; reason?: string };
  done?: boolean;
}

function chatDriver(fake: Fake) {
  const calls: unknown[] = [];
  const replies = new Map<unknown, (arg: unknown) => unknown>([
    [
      readMessages,
      () => ({
        chatId: target.id,
        messages: fake.pages.length > 1 ? fake.pages.shift() : fake.pages[0],
      }),
    ],
    [loadOlderMessages, () => ({ loaded: true })],
    [
      readEditor,
      () => fake.editor ?? { editing: true, text: driver.runs.findLast(isFill)?.[2] ?? "" },
    ],
    [finishEditor, () => ({ clicked: fake.done ?? true })],
    [dismissMenus, () => null],
    [openEditor, () => fake.action ?? { ok: true }],
    [clickDelete, () => fake.action ?? { ok: true }],
    [clickUndoDelete, () => fake.action ?? { ok: true }],
  ]);
  const driver = fakeDriver((fn, arg) => {
    calls.push(fn === finishEditor ? `finish:${(arg as { action: string }).action}` : fn);
    const reply = replies.get(fn);
    if (!reply) {
      throw new Error("unexpected page function");
    }
    return reply(arg);
  });
  return Object.assign(driver, { calls });
}

function isFill(args: string[]): boolean {
  return args[0] === "fill";
}

describe("findMessage", () => {
  it("scrolls up until the message is rendered", async () => {
    const driver = chatDriver({ pages: [[message("30")], [message("20"), message("30")]] });
    expect((await findMessage(driver, target, "20")).id).toBe("20");
  });

  it("stops once older messages than the id are shown", async () => {
    const driver = chatDriver({ pages: [[message("10"), message("30")]] });
    await expect(findMessage(driver, target, "20")).rejects.toMatchObject({
      code: "message_not_found",
    });
  });
});

describe("editMessage", () => {
  const edited = message("1", { text: "new", edited: true });

  it("fills the marked edit box, saves with Done and returns the edited message", async () => {
    const driver = chatDriver({ pages: [[message("1")], [message("1")], [edited]] });
    expect(await editMessage(driver, target, { id: "1", text: "new" }, fakeClock())).toEqual(
      edited,
    );
    expect(driver.runs).toEqual([["fill", `[${EDIT_MARK}]`, "new"]]);
    expect(driver.calls.filter((c) => typeof c === "string")).toEqual(["finish:done"]);
  });

  it("discards the edit when the box does not hold the new text", async () => {
    const driver = chatDriver({ pages: [[message("1")]], editor: { editing: true, text: "nwe" } });
    await expect(
      editMessage(driver, target, { id: "1", text: "new" }, fakeClock()),
    ).rejects.toMatchObject({
      code: "edit_mismatch",
    });
    expect(driver.calls.filter((c) => typeof c === "string")).toEqual(["finish:cancel"]);
  });

  it("does not fill when the editor cannot be opened", async () => {
    const driver = chatDriver({
      pages: [[message("1")]],
      action: { ok: false, reason: "not_own_message" },
    });
    await expect(
      editMessage(driver, target, { id: "1", text: "new" }, fakeClock()),
    ).rejects.toMatchObject({
      code: "not_own_message",
    });
    expect(driver.runs).toEqual([]);
    expect(driver.calls).toContain(dismissMenus);
  });

  it("reports an edit that never shows up, without retrying", async () => {
    const driver = chatDriver({ pages: [[message("1")]] });
    await expect(
      editMessage(driver, target, { id: "1", text: "new" }, fakeClock()),
    ).rejects.toMatchObject({
      code: "edit_unconfirmed",
    });
    expect(driver.runs).toHaveLength(1);
  });
});

describe("deleteMessage and undoDelete", () => {
  const gone = message("1", { text: "", deleted: true });

  it("deletes once and returns the deleted message", async () => {
    const driver = chatDriver({ pages: [[message("1")], [message("1")], [gone]] });
    expect(await deleteMessage(driver, target, "1", fakeClock())).toEqual(gone);
    expect(driver.calls.filter((c) => c === clickDelete)).toHaveLength(1);
  });

  it("reports a delete that never shows up, without retrying", async () => {
    const driver = chatDriver({ pages: [[message("1")]] });
    await expect(deleteMessage(driver, target, "1", fakeClock())).rejects.toMatchObject({
      code: "delete_unconfirmed",
    });
    expect(driver.calls.filter((c) => c === clickDelete)).toHaveLength(1);
  });

  it("restores a deleted message", async () => {
    const driver = chatDriver({ pages: [[gone], [gone], [message("1")]] });
    expect(await undoDelete(driver, target, "1", fakeClock())).toEqual(message("1"));
  });
});
