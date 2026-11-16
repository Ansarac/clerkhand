import { describe, expect, it } from "vitest";
import { deleteMessage, EDIT_MARK, editMessage, findMessage, undoDelete } from "../src/actions.js";
import {
  clickDelete,
  clickEdit,
  clickUndoDelete,
  discardEditor,
  dismissMenus,
  openActions,
  readEditor,
  saveEditor,
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
  /** Overrides for page functions. */
  replies?: Map<unknown, unknown>;
  /** The editor closes once Done was clicked (default). */
  closesOnSave?: boolean;
}

function chatDriver(fake: Fake) {
  const calls: { fn: unknown; arg: unknown }[] = [];
  let saved = false;
  const defaults = new Map<unknown, () => unknown>([
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
      () => ({
        editing: !(saved && fake.closesOnSave !== false),
        text: driver.runs.findLast((args) => args[0] === "fill")?.[2] ?? "old",
      }),
    ],
    [
      saveEditor,
      () => {
        saved = true;
        return { clicked: true };
      },
    ],
    [discardEditor, () => ({ closed: true })],
    [dismissMenus, () => ({ open: 0 })],
    [openActions, () => ({ ok: true })],
    [clickEdit, () => ({ ok: true })],
    [clickDelete, () => ({ ok: true })],
    [clickUndoDelete, () => ({ ok: true })],
  ]);
  const driver = fakeDriver((fn, arg) => {
    calls.push({ fn, arg });
    if (fake.replies?.has(fn)) {
      return fake.replies.get(fn);
    }
    const reply = defaults.get(fn);
    if (!reply) {
      throw new Error("unexpected page function");
    }
    return reply();
  });
  const called = (fn: unknown) => calls.filter((c) => c.fn === fn);
  return Object.assign(driver, { calls, called });
}

const old = message("1");
const edited = message("1", { text: "new", edited: true });
const gone = message("1", { text: "", deleted: true });

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
  const edit = (driver: ReturnType<typeof chatDriver>, text = "new") =>
    editMessage(driver, target, { id: "1", text }, fakeClock());

  it("opens that message's editor, fills, checks and saves it", async () => {
    const driver = chatDriver({ pages: [[old], [old], [edited]] });
    expect(await edit(driver)).toEqual(edited);
    expect(driver.called(openActions)[0]?.arg).toEqual({ chatId: target.id, id: "1" });
    expect(driver.called(clickEdit)[0]?.arg).toEqual({
      chatId: target.id,
      id: "1",
      mark: EDIT_MARK,
    });
    expect(driver.runs).toEqual([["fill", `[${EDIT_MARK}]`, "new"]]);
    expect(driver.called(saveEditor)[0]?.arg).toEqual({
      chatId: target.id,
      mark: EDIT_MARK,
      text: "new",
    });
  });

  it("refuses unchanged text or a deleted message before opening anything", async () => {
    for (const [page, code] of [
      [old, "unchanged"],
      [gone, "message_deleted"],
    ] as const) {
      const driver = chatDriver({ pages: [[page]] });
      await expect(edit(driver, "old")).rejects.toMatchObject({ code });
      expect(driver.called(openActions)).toEqual([]);
    }
  });

  it("does not fill when the popover cannot be opened, and closes what it left", async () => {
    const driver = chatDriver({
      pages: [[old]],
      replies: new Map([[openActions, { ok: false, reason: "menu_open" }]]),
    });
    await expect(edit(driver)).rejects.toMatchObject({ code: "menu_open" });
    expect(driver.runs).toEqual([]);
    expect(driver.called(dismissMenus)).toHaveLength(1);
  });

  it("discards an editor that opened but could not be marked", async () => {
    const driver = chatDriver({
      pages: [[old]],
      replies: new Map([[clickEdit, { ok: false, reason: "action_unavailable" }]]),
    });
    await expect(edit(driver)).rejects.toMatchObject({ code: "action_unavailable" });
    expect(driver.runs).toEqual([]);
    expect(driver.called(discardEditor)).toHaveLength(1);
  });

  it("discards instead of saving when the box does not hold the new text", async () => {
    const driver = chatDriver({
      pages: [[old]],
      replies: new Map([[readEditor, { editing: true, text: "nwe" }]]),
    });
    await expect(edit(driver)).rejects.toMatchObject({
      code: "edit_mismatch",
      message: expect.stringContaining("discarded"),
    });
    expect(driver.called(saveEditor)).toEqual([]);
    expect(driver.called(discardEditor)).toHaveLength(1);
  });

  it("says so when the editor may still be open after a failed discard", async () => {
    const driver = chatDriver({
      pages: [[old]],
      replies: new Map<unknown, unknown>([
        [readEditor, { editing: true, text: "nwe" }],
        [discardEditor, { closed: false }],
      ]),
    });
    await expect(edit(driver)).rejects.toMatchObject({
      message: expect.stringContaining("may still be open"),
    });
  });

  it("discards when Done cannot be clicked", async () => {
    const driver = chatDriver({
      pages: [[old]],
      replies: new Map([[saveEditor, { clicked: false }]]),
    });
    await expect(edit(driver)).rejects.toMatchObject({ code: "action_unavailable" });
    expect(driver.called(discardEditor)).toHaveLength(1);
  });

  it("reports an edit that never shows up, without saving twice", async () => {
    const driver = chatDriver({ pages: [[old]] });
    await expect(edit(driver)).rejects.toMatchObject({ code: "edit_unconfirmed" });
    expect(driver.called(saveEditor)).toHaveLength(1);
  });

  it("reports an editor that stays open after the edit shows", async () => {
    const driver = chatDriver({ pages: [[old], [edited]], closesOnSave: false });
    await expect(edit(driver)).rejects.toMatchObject({ code: "edit_unconfirmed" });
  });
});

describe("deleteMessage and undoDelete", () => {
  it("deletes once through the opened popover and returns the deleted message", async () => {
    const driver = chatDriver({ pages: [[old], [old], [gone]] });
    expect(await deleteMessage(driver, target, "1", fakeClock())).toEqual(gone);
    expect(driver.called(openActions)).toHaveLength(1);
    expect(driver.called(clickDelete)).toHaveLength(1);
  });

  it("refuses an already deleted message before opening anything", async () => {
    const driver = chatDriver({ pages: [[gone]] });
    await expect(deleteMessage(driver, target, "1", fakeClock())).rejects.toMatchObject({
      code: "already_deleted",
    });
    expect(driver.called(openActions)).toEqual([]);
  });

  it("reports a delete that never shows up, without retrying", async () => {
    const driver = chatDriver({ pages: [[old]] });
    await expect(deleteMessage(driver, target, "1", fakeClock())).rejects.toMatchObject({
      code: "delete_unconfirmed",
    });
    expect(driver.called(clickDelete)).toHaveLength(1);
  });

  it("restores a deleted message", async () => {
    const driver = chatDriver({ pages: [[gone], [gone], [old]] });
    expect(await undoDelete(driver, target, "1", fakeClock())).toEqual(old);
  });

  it("refuses to restore a message that is not deleted", async () => {
    const driver = chatDriver({ pages: [[old]] });
    await expect(undoDelete(driver, target, "1", fakeClock())).rejects.toMatchObject({
      code: "not_deleted",
    });
    expect(driver.called(clickUndoDelete)).toEqual([]);
  });

  it("reports an undo that never shows up, without retrying", async () => {
    const driver = chatDriver({ pages: [[gone]] });
    await expect(undoDelete(driver, target, "1", fakeClock())).rejects.toMatchObject({
      code: "undo_unconfirmed",
    });
    expect(driver.called(clickUndoDelete)).toHaveLength(1);
  });
});
