// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clickChat, listChats } from "../../src/page/chats.js";
import { inPage } from "../helpers.js";

// Synthetic markup modeled on the Teams sidebar. Never use real chat content here.
const FOLDER = "OneGQL_UserDefinedConversationFolder|t~u~Favorites";
const RECENT = "OneGQL_SystemDefinedConversationFolder|t~u~RecentChats";

function chatItem(folder: string, type: string, id: string, name: string, extra = ""): string {
  return `
    <div role="treeitem" aria-level="2" data-item-type="${extra.includes("muted") ? "muted-chat" : "chat"}"
         data-fui-tree-item-value="${folder}/OneGQL_${type}Conversation|${id}"
         aria-labelledby=" support-text title-chat-list-item_${id} ${extra.includes("unread") ? `chat-list-unread-text_${id}` : ""} ">
      <div data-inp="simple-collab-chat-switch">
        <span id="title-chat-list-item_${id}" ${extra.includes("bold") ? 'style="font-weight: 700"' : ""}>${name}</span>
        ${extra.includes("unread") ? `<span id="chat-list-unread-text_${id}" hidden>Unread</span>` : ""}
      </div>
    </div>`;
}

const RECENT_CHATS = [
  chatItem(RECENT, "SelfChat", "48:notes", "Doe, Jane (You)"),
  chatItem(RECENT, "OneOnOneChat", "19:aaa_bbb@unq.gbl.spaces", "Roe, Rick", "unread"),
  chatItem(RECENT, "MeetingChat", "19:meeting_xyz@thread.v2", "Weekly sync", "muted"),
].join("");

const clicks: string[] = [];
let listeners: AbortController;

beforeEach(() => {
  clicks.length = 0;
  listeners = new AbortController();
  document.body.innerHTML = `
    <div role="tree">
      <div role="treeitem" aria-level="1" data-item-type="custom-folder" aria-expanded="true" data-fui-tree-item-value="${FOLDER}">
        <div>Favorites</div>
        ${chatItem(FOLDER, "GroupChat", "19:group1@thread.v2", "Project Alpha", "bold")}
        <div role="treeitem" aria-level="2" data-item-type="channel"
             data-fui-tree-item-value="${FOLDER}/OneGQL_ChannelConversation|19:chan@thread.tacv2">General</div>
      </div>
      <div role="treeitem" aria-level="1" data-item-type="chats" aria-expanded="false" data-fui-tree-item-value="${RECENT}">
        <div id="recent-row">Chats</div>
      </div>
    </div>`;
  // Like Teams, a collapsed folder renders no children; clicking its row toggles it.
  const recent = document.querySelector<HTMLElement>('[data-item-type="chats"]');
  document.getElementById("recent-row")?.addEventListener("click", () => {
    const open = recent?.getAttribute("aria-expanded") === "true";
    recent?.setAttribute("aria-expanded", String(!open));
    if (open) {
      for (const child of recent?.querySelectorAll('[aria-level="2"]') ?? []) {
        child.remove();
      }
    } else {
      recent?.insertAdjacentHTML("beforeend", RECENT_CHATS);
    }
  });
  document.addEventListener(
    "click",
    (event) => {
      const item = (event.target as HTMLElement).closest('[aria-level="2"]');
      if (item) {
        clicks.push(item.getAttribute("data-fui-tree-item-value") ?? "");
      }
    },
    { signal: listeners.signal },
  );
});

afterEach(() => listeners.abort());

describe("listChats", () => {
  it("lists chats with their stable id, kind and folder, skipping channels", async () => {
    const chats = await inPage(listChats)();
    expect(chats.map(({ id, name, kind, folder }) => ({ id, name, kind, folder }))).toEqual([
      { id: "19:group1@thread.v2", name: "Project Alpha", kind: "group", folder: "Favorites" },
      { id: "48:notes", name: "Doe, Jane (You)", kind: "self", folder: "RecentChats" },
      {
        id: "19:aaa_bbb@unq.gbl.spaces",
        name: "Roe, Rick",
        kind: "oneOnOne",
        folder: "RecentChats",
      },
      {
        id: "19:meeting_xyz@thread.v2",
        name: "Weekly sync",
        kind: "meeting",
        folder: "RecentChats",
      },
    ]);
  });

  it("detects unread from the unread label or from a bold title", async () => {
    const chats = await inPage(listChats)();
    expect(chats.filter((c) => c.unread).map((c) => c.name)).toEqual([
      "Project Alpha",
      "Roe, Rick",
    ]);
  });

  it("flags muted chats", async () => {
    const chats = await inPage(listChats)();
    expect(chats.filter((c) => c.muted).map((c) => c.name)).toEqual(["Weekly sync"]);
  });

  it("collapses folders it had to expand", async () => {
    await inPage(listChats)();
    expect(document.querySelector('[data-item-type="chats"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });
});

describe("clickChat", () => {
  it("clicks a chat inside a collapsed folder and collapses the folder again", async () => {
    const result = await inPage(clickChat)("19:aaa_bbb@unq.gbl.spaces");
    expect(result).toEqual({ clicked: true });
    expect(clicks).toEqual([`${RECENT}/OneGQL_OneOnOneChatConversation|19:aaa_bbb@unq.gbl.spaces`]);
    expect(document.querySelector('[data-item-type="chats"]')?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("matches the whole id, not a suffix of another id", async () => {
    expect(await inPage(clickChat)("notes")).toEqual({ clicked: false });
    expect(clicks).toEqual([]);
  });
});
