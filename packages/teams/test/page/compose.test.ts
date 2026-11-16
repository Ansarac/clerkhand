// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { COMPOSE_MARK, clickSend, readCompose, selectCompose } from "../../src/page/compose.js";
import { inPage } from "../helpers.js";

// Synthetic markup modeled on the Teams chat pane. Never use real chat content here.
const CHAT = "19:group1@thread.v2";
const TARGET = { chatId: CHAT, mark: COMPOSE_MARK };

const EDIT_BOX = `
  <div data-tid="chat-pane-message" data-mid="1">
    <div role="textbox" contenteditable="true" aria-label="Type a message"><p>being edited</p></div>
  </div>`;

function pane(compose: string, inList = ""): string {
  return `
    <div id="chat-header-${CHAT}"></div>
    <div data-tid="message-pane-list-viewport">${inList}</div>
    ${compose}`;
}

const COMPOSE =
  '<div id="compose" role="textbox" contenteditable="true" aria-label="Type a message"><p>Hello</p></div>';

beforeEach(() => {
  document.body.innerHTML = pane(COMPOSE);
});

describe("selectCompose", () => {
  it("marks the compose box and selects all of its content", () => {
    expect(inPage(selectCompose)(TARGET)).toEqual({ chatId: CHAT, boxes: 1, text: "Hello" });
    const box = document.getElementById("compose");
    expect(box?.hasAttribute(COMPOSE_MARK)).toBe(true);
    expect(getSelection()?.toString()).toBe("Hello");
  });

  it("skips an edit box inside the message list", () => {
    document.body.innerHTML = pane(COMPOSE, EDIT_BOX);
    expect(inPage(selectCompose)(TARGET).boxes).toBe(1);
    expect(document.querySelectorAll(`[${COMPOSE_MARK}]`)).toHaveLength(1);
    expect(document.getElementById("compose")?.hasAttribute(COMPOSE_MARK)).toBe(true);
  });

  it("marks nothing when a different chat is open", () => {
    const result = inPage(selectCompose)({ ...TARGET, chatId: "19:other@thread.v2" });
    expect(result.chatId).toBe(CHAT);
    expect(document.querySelector(`[${COMPOSE_MARK}]`)).toBeNull();
  });

  it("marks nothing when the compose box is ambiguous", () => {
    document.body.innerHTML = pane(COMPOSE + COMPOSE.replace('id="compose"', ""));
    expect(inPage(selectCompose)(TARGET).boxes).toBe(2);
    expect(document.querySelector(`[${COMPOSE_MARK}]`)).toBeNull();
  });

  it("removes a mark left by an earlier run", () => {
    document.body.innerHTML = pane(COMPOSE, `<div ${COMPOSE_MARK}></div>`);
    inPage(selectCompose)(TARGET);
    expect(document.querySelectorAll(`[${COMPOSE_MARK}]`)).toHaveLength(1);
  });
});

describe("readCompose", () => {
  it("reads the draft of the open chat", () => {
    expect(inPage(readCompose)()).toEqual({ chatId: CHAT, boxes: 1, text: "Hello" });
  });

  it("reports no text when no compose box is shown", () => {
    document.body.innerHTML = pane("");
    expect(inPage(readCompose)()).toEqual({ chatId: CHAT, boxes: 0, text: "" });
  });
});

describe("clickSend", () => {
  const Send = '<button data-tid="sendMessageCommands-send">Send</button>';
  let clicked: number;

  function composer(text = "Hello", buttons = Send): string {
    return `<div><div>${COMPOSE.replace("Hello", text)}</div><div>${buttons}</div></div>`;
  }

  function render(html: string): void {
    document.body.innerHTML = html;
    clicked = 0;
    document.body.onclick = (event) => {
      if (event.target instanceof HTMLButtonElement) {
        clicked += 1;
      }
    };
  }

  it("clicks the Send button next to the compose box when the draft matches", () => {
    render(pane(composer()));
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toEqual({ clicked: true });
    expect(clicked).toBe(1);
  });

  it("refuses when another chat is open", () => {
    render(pane(composer()));
    const result = inPage(clickSend)({ chatId: "19:other@thread.v2", text: "Hello" });
    expect(result).toEqual({ clicked: false, reason: "chat_changed" });
    expect(clicked).toBe(0);
  });

  it("refuses when the draft changed or is empty", () => {
    render(pane(composer("Hello again")));
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toMatchObject({
      reason: "draft_changed",
    });
    render(pane(composer("")));
    expect(inPage(clickSend)({ chatId: CHAT, text: "" })).toMatchObject({
      reason: "draft_changed",
    });
    expect(clicked).toBe(0);
  });

  it("ignores the edit box in the message list", () => {
    render(pane(composer(), EDIT_BOX));
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toEqual({ clicked: true });
  });

  it("refuses when there is no single Send button beside the compose box", () => {
    render(pane(composer("Hello", "")));
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toMatchObject({
      reason: "no_button",
    });
    render(pane(composer("Hello", Send + Send)));
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toMatchObject({
      reason: "no_button",
    });
    expect(clicked).toBe(0);
  });

  it("refuses a Send button that is only reachable through the message list", () => {
    render(`<div id="chat-header-${CHAT}"></div>
      <div><div data-tid="message-pane-list-viewport"></div>${COMPOSE}${Send}</div>`);
    expect(inPage(clickSend)({ chatId: CHAT, text: "Hello" })).toMatchObject({
      reason: "no_button",
    });
    expect(clicked).toBe(0);
  });
});
