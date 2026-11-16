// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clickDelete,
  clickUndoDelete,
  finishEditor,
  openEditor,
  readEditor,
} from "../../src/page/actions.js";
import { inPage } from "../helpers.js";

// Synthetic markup modeled on the Teams message pane. Never use real chat content here.
const CHAT = "19:group1@thread.v2";
const MINE = "1700000000000";
const THEIRS = "1700000060000";
const MARK = "data-test-edit";

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

function render(list: string): void {
  document.body.innerHTML = `
    <div id="chat-header-${CHAT}"></div>
    <div data-tid="message-pane-list-viewport">${list}</div>
    <div><div role="textbox" contenteditable="true"></div><button data-tid="sendMessageCommands-send"></button></div>`;
  clicks.length = 0;
  document.body.onclick = (event) => {
    const el = event.target as HTMLElement;
    const tid = el.getAttribute("data-tid") ?? "";
    clicks.push(tid);
    if (tid === "message-actions-menu-hidden-button") {
      el.setAttribute("aria-expanded", "true");
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div data-tid="message-actions-container">
          <button data-tid="message-actions-edit"></button><a data-tid="message-actions-more"></a>
        </div>`,
      );
    }
    if (tid === "message-actions-more") {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div role="menu"><div role="menuitem" data-tid="message-actions-delete"></div></div>',
      );
    }
    if (tid === "message-actions-edit") {
      el.closest('[data-tid="message-actions-container"]')?.remove();
      document.getElementById(`item-${MINE}`)?.insertAdjacentHTML(
        "beforeend",
        `<div><div><div role="textbox" contenteditable="true"><p>old</p></div></div>
          <div><button data-tid="newMessageCommands-discard-draft"></button>
          <button data-tid="newMessageCommands-send"></button></div></div>`,
      );
    }
    if (tid === "newMessageCommands-discard-draft") {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div data-tid="messagedraft-discard-dialog"><button data-tid="messagedraft-discard-confirm"></button></div>',
      );
    }
  };
}

beforeEach(() => {
  render(message(MINE, true) + message(THEIRS, false));
});

describe("openEditor", () => {
  it("opens the editor of the user's message and marks only its edit box", async () => {
    const result = await inPage(openEditor)({ chatId: CHAT, id: MINE, mark: MARK });
    expect(result).toEqual({ ok: true });
    expect(clicks).toEqual(["message-actions-menu-hidden-button", "message-actions-edit"]);
    const marked = document.querySelectorAll(`[${MARK}]`);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.closest('[data-tid="message-pane-list-viewport"]')).not.toBeNull();
    expect(getSelection()?.toString()).toBe("old");
  });

  it("refuses someone else's message without clicking", async () => {
    const result = await inPage(openEditor)({ chatId: CHAT, id: THEIRS, mark: MARK });
    expect(result).toEqual({ ok: false, reason: "not_own_message" });
    expect(clicks).toEqual([]);
  });

  it("refuses when another chat is open or the message is not shown", async () => {
    expect(await inPage(openEditor)({ chatId: "19:x@thread.v2", id: MINE, mark: MARK })).toEqual({
      ok: false,
      reason: "chat_changed",
    });
    expect(await inPage(openEditor)({ chatId: CHAT, id: "1", mark: MARK })).toEqual({
      ok: false,
      reason: "message_not_found",
    });
    expect(clicks).toEqual([]);
  });

  it("refuses while another message is being edited", async () => {
    await inPage(openEditor)({ chatId: CHAT, id: MINE, mark: MARK });
    clicks.length = 0;
    const result = await inPage(openEditor)({ chatId: CHAT, id: MINE, mark: MARK });
    expect(result).toEqual({ ok: false, reason: "already_editing" });
    expect(clicks).toEqual([]);
  });
});

describe("finishEditor", () => {
  beforeEach(async () => {
    await inPage(openEditor)({ chatId: CHAT, id: MINE, mark: MARK });
    clicks.length = 0;
  });

  it("reads the marked edit box", () => {
    expect(inPage(readEditor)(MARK)).toEqual({ editing: true, text: "old" });
  });

  it("clicks the editor's own Done button, never the compose box's Send", async () => {
    expect(await inPage(finishEditor)({ mark: MARK, action: "done" })).toEqual({ clicked: true });
    expect(clicks).toEqual(["newMessageCommands-send"]);
  });

  it("cancels and confirms the discard dialog", async () => {
    await inPage(finishEditor)({ mark: MARK, action: "cancel" });
    expect(clicks).toEqual(["newMessageCommands-discard-draft", "messagedraft-discard-confirm"]);
  });

  it("clicks nothing without a marked edit box", async () => {
    document.querySelector(`[${MARK}]`)?.removeAttribute(MARK);
    expect(await inPage(finishEditor)({ mark: MARK, action: "done" })).toEqual({ clicked: false });
    expect(clicks).toEqual([]);
  });
});

describe("clickDelete", () => {
  it("deletes through the More options menu", async () => {
    expect(await inPage(clickDelete)({ chatId: CHAT, id: MINE })).toEqual({ ok: true });
    expect(clicks).toEqual([
      "message-actions-menu-hidden-button",
      "message-actions-more",
      "message-actions-delete",
    ]);
  });

  it("refuses someone else's message without clicking", async () => {
    expect(await inPage(clickDelete)({ chatId: CHAT, id: THEIRS })).toEqual({
      ok: false,
      reason: "not_own_message",
    });
    expect(clicks).toEqual([]);
  });
});

describe("clickUndoDelete", () => {
  it("clicks Undo on the user's deleted message", () => {
    render(message(MINE, true, TOMBSTONE));
    expect(inPage(clickUndoDelete)({ chatId: CHAT, id: MINE })).toEqual({ ok: true });
    expect(clicks).toEqual(["message-undo-delete-btn"]);
  });

  it("refuses a message that is not deleted", () => {
    expect(inPage(clickUndoDelete)({ chatId: CHAT, id: MINE })).toEqual({
      ok: false,
      reason: "action_unavailable",
    });
    expect(clicks).toEqual([]);
  });
});
