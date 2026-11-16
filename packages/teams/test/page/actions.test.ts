// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clickDelete,
  clickEdit,
  clickUndoDelete,
  discardEditor,
  dismissMenus,
  openActions,
  readEditor,
  saveEditor,
} from "../../src/page/actions.js";
import { inPage } from "../helpers.js";

// Synthetic markup modeled on the Teams message pane. Never use real chat content here.
const CHAT = "19:group1@thread.v2";
const MINE = "1700000000000";
const MINE_TOO = "1700000030000";
const THEIRS = "1700000060000";
const MARK = "data-test-edit";
const TARGET = { chatId: CHAT, id: MINE };

const clicks: string[] = [];

function message(mid: string, own: boolean, content = `<p>text ${mid}</p>`): string {
  return `
    <div data-tid="chat-pane-item" id="item-${mid}">
      <div data-tid="chat-pane-message" data-mid="${mid}" class="${own ? "fui-ChatMyMessage__body" : "fui-ChatMessage__body"}">
        <button data-tid="message-actions-menu-hidden-button" aria-expanded="false"></button>
        ${content}
      </div>
    </div>`;
}

const TOMBSTONE = `<div id="content-${MINE}" data-tid="message-tombstone"><span>deleted</span></div>
  <button data-tid="message-undo-delete-btn">Undo</button>`;

/** The compose box with decoy buttons that share the editor's data-tids. */
const COMPOSE = `<div><div role="textbox" contenteditable="true"></div>
  <button data-tid="sendMessageCommands-send"></button>
  <button data-tid="newMessageCommands-send"></button>
  <button data-tid="newMessageCommands-discard-draft"></button></div>`;

const EDITOR = `<div><div><div role="textbox" contenteditable="true"><p>old</p></div></div>
  <div><button data-tid="newMessageCommands-discard-draft"></button>
  <button data-tid="newMessageCommands-send"></button></div></div>`;

const POPOVER = `<div data-tid="message-actions-container">
  <button data-tid="message-actions-edit"></button><a data-tid="message-actions-more"></a></div>`;

/** Simulates Teams: what each click opens. */
const behavior: Record<string, (el: HTMLElement) => void> = {
  "message-actions-menu-hidden-button": (el) => {
    el.setAttribute("aria-expanded", "true");
    document.body.insertAdjacentHTML("beforeend", POPOVER);
  },
  "message-actions-more": () =>
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div role="menu"><div role="menuitem" data-tid="message-actions-delete"></div></div>',
    ),
  "message-actions-edit": (el) => {
    el.closest('[data-tid="message-actions-container"]')?.remove();
    document.getElementById(`item-${MINE}`)?.insertAdjacentHTML("beforeend", EDITOR);
  },
  // The discard dialog appears a little later, like in Teams.
  "newMessageCommands-discard-draft": () =>
    setTimeout(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div data-tid="messagedraft-discard-dialog"><button data-tid="messagedraft-discard-confirm"></button></div>',
      );
    }, 200),
  "messagedraft-discard-confirm": () => {
    document.querySelector('[data-tid="messagedraft-discard-dialog"]')?.remove();
    document.querySelector(`[${MARK}]`)?.closest("div")?.parentElement?.remove();
  },
};

function render(list: string): void {
  document.body.innerHTML = `
    <div id="chat-header-${CHAT}"></div>
    <div data-tid="message-pane-list-viewport">${list}</div>${COMPOSE}`;
  clicks.length = 0;
  document.body.onclick = (event) => {
    const el = event.target as HTMLElement;
    const tid = el.getAttribute("data-tid") ?? "";
    clicks.push(tid);
    behavior[tid]?.(el);
  };
  document.body.onkeydown = (event) => {
    if (event.key === "Escape") {
      for (const open of document.querySelectorAll(
        '[data-tid="message-actions-container"], [role="menu"]',
      )) {
        open.remove();
      }
    }
  };
}

async function openEditor(): Promise<void> {
  await inPage(openActions)(TARGET);
  await inPage(clickEdit)({ ...TARGET, mark: MARK });
  clicks.length = 0;
}

beforeEach(() => {
  render(message(MINE, true) + message(MINE_TOO, true) + message(THEIRS, false));
});

describe("openActions", () => {
  it("opens the popover of the user's own message", async () => {
    expect(await inPage(openActions)(TARGET)).toEqual({ ok: true });
    expect(clicks).toEqual(["message-actions-menu-hidden-button"]);
  });

  it("refuses someone else's message without clicking", async () => {
    expect(await inPage(openActions)({ chatId: CHAT, id: THEIRS })).toEqual({
      ok: false,
      reason: "not_own_message",
    });
    expect(clicks).toEqual([]);
  });

  it("refuses when another chat is open or the message is not shown", async () => {
    expect(await inPage(openActions)({ chatId: "19:x@thread.v2", id: MINE })).toMatchObject({
      reason: "chat_changed",
    });
    expect(await inPage(openActions)({ chatId: CHAT, id: "1" })).toMatchObject({
      reason: "message_not_found",
    });
    expect(clicks).toEqual([]);
  });

  it("refuses while a popover of another message is open", async () => {
    await inPage(openActions)({ chatId: CHAT, id: MINE_TOO });
    clicks.length = 0;
    expect(await inPage(openActions)(TARGET)).toEqual({ ok: false, reason: "menu_open" });
    expect(clicks).toEqual([]);
  });

  it("refuses while a message is being edited", async () => {
    await openEditor();
    expect(await inPage(openActions)({ chatId: CHAT, id: MINE_TOO })).toEqual({
      ok: false,
      reason: "already_editing",
    });
    expect(clicks).toEqual([]);
  });
});

describe("clickEdit", () => {
  it("opens the editor and marks only the edit box inside that message", async () => {
    await inPage(openActions)(TARGET);
    expect(await inPage(clickEdit)({ ...TARGET, mark: MARK })).toEqual({ ok: true });
    const marked = document.querySelectorAll(`[${MARK}]`);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.closest(`#item-${MINE}`)).not.toBeNull();
    expect(getSelection()?.toString()).toBe("old");
  });

  it("does not click Edit in a popover opened for another message", async () => {
    await inPage(openActions)({ chatId: CHAT, id: MINE_TOO });
    clicks.length = 0;
    expect(await inPage(clickEdit)({ ...TARGET, mark: MARK })).toMatchObject({ ok: false });
    expect(clicks).toEqual([]);
  });
});

describe("saveEditor and discardEditor", () => {
  beforeEach(openEditor);

  it("reads the marked edit box", () => {
    expect(inPage(readEditor)(MARK)).toEqual({ editing: true, text: "old" });
  });

  it("clicks the editor's own Done, never the compose box's buttons", () => {
    const result = inPage(saveEditor)({ chatId: CHAT, mark: MARK, text: "old" });
    expect(result).toEqual({ clicked: true });
    expect(clicks).toEqual(["newMessageCommands-send"]);
    const done = document.querySelector(`#item-${MINE} [data-tid="newMessageCommands-send"]`);
    expect(done).not.toBeNull();
  });

  it("does not save text that differs from what was checked", () => {
    expect(inPage(saveEditor)({ chatId: CHAT, mark: MARK, text: "new" })).toEqual({
      clicked: false,
    });
    expect(inPage(saveEditor)({ chatId: "19:x@thread.v2", mark: MARK, text: "old" })).toEqual({
      clicked: false,
    });
    expect(clicks).toEqual([]);
  });

  it("cancels, waits for the discard dialog and reports the editor closed", async () => {
    expect(await inPage(discardEditor)(MARK)).toEqual({ closed: true });
    expect(clicks).toEqual(["newMessageCommands-discard-draft", "messagedraft-discard-confirm"]);
    expect(document.querySelector(`[${MARK}]`)).toBeNull();
  });
});

describe("clickDelete", () => {
  it("deletes through the More options menu of the opened message", async () => {
    await inPage(openActions)(TARGET);
    expect(await inPage(clickDelete)(TARGET)).toEqual({ ok: true });
    expect(clicks).toEqual([
      "message-actions-menu-hidden-button",
      "message-actions-more",
      "message-actions-delete",
    ]);
  });

  it("does not use a popover opened for another message", async () => {
    await inPage(openActions)({ chatId: CHAT, id: MINE_TOO });
    clicks.length = 0;
    expect(await inPage(clickDelete)(TARGET)).toMatchObject({ ok: false });
    expect(clicks).toEqual([]);
  });
});

describe("clickUndoDelete", () => {
  it("clicks Undo on the user's deleted message", () => {
    render(message(MINE, true, TOMBSTONE));
    expect(inPage(clickUndoDelete)(TARGET)).toEqual({ ok: true });
    expect(clicks).toEqual(["message-undo-delete-btn"]);
  });

  it("refuses a message that is not deleted", () => {
    expect(inPage(clickUndoDelete)(TARGET)).toEqual({ ok: false, reason: "action_unavailable" });
    expect(clicks).toEqual([]);
  });
});

describe("dismissMenus", () => {
  it("closes open popovers and menus without clicking anything", async () => {
    await inPage(openActions)(TARGET);
    await inPage(clickDelete)({ chatId: CHAT, id: "none" });
    clicks.length = 0;
    expect(await inPage(dismissMenus)()).toEqual({ open: 0 });
    expect(clicks).toEqual([]);
  });
});
