// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { loadOlderMessages, readMessages, waitForChat } from "../../src/page/messages.js";
import { inPage } from "../helpers.js";

// Synthetic markup modeled on the Teams message pane. Never use real chat content here.
const CHAT = "19:group1@thread.v2";

function message(mid: number, author: string, body: string, extra = ""): string {
  return `
    <div data-tid="chat-pane-item">
      <span id="author-${mid}">${author}</span>
      <time id="timestamp-${mid}" datetime="${new Date(mid).toISOString()}">t</time>
      <div data-tid="chat-pane-message" data-mid="${mid}" role="group">
        <div id="content-${mid}" ${extra.includes("image") ? 'aria-label="image"' : ""}>${body}</div>
      </div>
      ${extra.includes("edited") ? `<span id="edited-${mid}">Edited</span>` : ""}
    </div>`;
}

const EVENT =
  '<div data-tid="chat-pane-item"><div data-tid="control-message-renderer">Someone joined</div></div>';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="chat-header-${CHAT}"><h2 data-tid="chat-title">Project Alpha</h2></div>
    <div data-tid="message-pane-list-viewport">
      ${message(1_700_000_000_000, "Roe, Rick", "<p>Hello there</p>")}
      ${EVENT}
      ${message(1_700_000_060_000, "Doe, Jane", "<p>Fixed</p>", "edited")}
      ${message(1_700_000_120_000, "Doe, Jane", "", "image")}
    </div>`;
});

describe("readMessages", () => {
  it("reads id, author, ISO time, text and edited state, oldest first", () => {
    const { chatId, messages } = inPage(readMessages)();
    expect(chatId).toBe(CHAT);
    expect(messages).toEqual([
      {
        id: "1700000000000",
        author: "Roe, Rick",
        time: "2023-11-14T22:13:20.000Z",
        text: "Hello there",
        edited: false,
        deleted: false,
      },
      {
        id: "1700000060000",
        author: "Doe, Jane",
        time: "2023-11-14T22:14:20.000Z",
        text: "Fixed",
        edited: true,
        deleted: false,
      },
      {
        id: "1700000120000",
        author: "Doe, Jane",
        time: "2023-11-14T22:15:20.000Z",
        text: "image",
        edited: false,
        deleted: false,
      },
    ]);
  });

  it("marks a deleted message and drops its placeholder text", () => {
    document.querySelector('[data-tid="message-pane-list-viewport"]')?.insertAdjacentHTML(
      "beforeend",
      `<div data-tid="chat-pane-item">
        <div data-tid="chat-pane-message" data-mid="1700000180000" role="group">
          <div id="content-1700000180000" data-tid="message-tombstone"><span>Deleted</span></div>
        </div>
      </div>`,
    );
    const last = inPage(readMessages)().messages.at(-1);
    expect(last).toMatchObject({ id: "1700000180000", text: "", deleted: true });
  });

  it("reports no open chat when there is no chat header", () => {
    document.body.innerHTML = "";
    expect(inPage(readMessages)()).toEqual({ chatId: null, messages: [] });
  });
});

describe("waitForChat", () => {
  it("resolves once the chat header for that id is shown", async () => {
    document.body.innerHTML = "";
    setTimeout(() => {
      document.body.innerHTML = `<div id="chat-header-${CHAT}"></div>${message(1, "A", "x")}`;
    }, 100);
    await expect(inPage(waitForChat)({ id: CHAT, timeoutMs: 3000 })).resolves.toEqual({
      open: true,
    });
  });

  it("gives up when a different chat stays open", async () => {
    await expect(
      inPage(waitForChat)({ id: "19:other@thread.v2", timeoutMs: 300 }),
    ).resolves.toEqual({ open: false });
  });
});

describe("loadOlderMessages", () => {
  it("scrolls to the top and reports when older messages appear", async () => {
    const viewport = document.querySelector<HTMLElement>('[data-tid="message-pane-list-viewport"]');
    Object.defineProperty(viewport, "scrollTop", {
      set: (value: number) => {
        if (value === 0) {
          setTimeout(
            () =>
              viewport?.insertAdjacentHTML("afterbegin", message(1_600_000_000_000, "A", "old")),
            50,
          );
        }
      },
    });
    await expect(inPage(loadOlderMessages)(2000)).resolves.toEqual({ loaded: true });
  });

  it("reports nothing loaded at the start of the chat", async () => {
    await expect(inPage(loadOlderMessages)(300)).resolves.toEqual({ loaded: false });
  });
});
