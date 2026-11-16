// Page functions are serialized into the browser: no imports, no outer references.

export type ChatKind = "oneOnOne" | "group" | "meeting" | "self" | "other";

export interface Chat {
  /** Teams thread id, stable across renames. */
  id: string;
  name: string;
  kind: ChatKind;
  /** Sidebar folder, e.g. "Favorites" or "RecentChats". */
  folder: string;
  unread: boolean;
  muted: boolean;
}

/**
 * Lists chats in the sidebar. Collapsed chat folders are expanded for the read
 * and collapsed again afterwards, so the user's layout is left as it was.
 */
export async function listChats(): Promise<Chat[]> {
  const expandMs = 500;
  const boldWeight = 600;
  const folderSelector =
    '[role="treeitem"][aria-level="1"][aria-expanded="false"]:is([data-item-type="chats"], [data-item-type="custom-folder"])';
  const collapsed = [...document.querySelectorAll<HTMLElement>(folderSelector)];
  const toggle = (folder: HTMLElement) => (folder.firstElementChild as HTMLElement | null)?.click();
  collapsed.forEach(toggle);
  if (collapsed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, expandMs));
  }

  const kinds = new Map<string, ChatKind>([
    ["OneOnOneChat", "oneOnOne"],
    ["GroupChat", "group"],
    ["MeetingChat", "meeting"],
    ["SelfChat", "self"],
  ]);
  const chats: Chat[] = [];
  const itemSelector = '[role="treeitem"][aria-level="2"][data-item-type$="chat"]';
  for (const item of document.querySelectorAll<HTMLElement>(itemSelector)) {
    const value = item.getAttribute("data-fui-tree-item-value") ?? "";
    const match = /(?:^|\/)OneGQL_(?<type>\w+?)Conversation\|(?<id>[^/]+)$/u.exec(value);
    const id = match?.groups?.["id"];
    if (id) {
      const title = document.getElementById(`title-chat-list-item_${id}`);
      const labelIds = (item.getAttribute("aria-labelledby") ?? "").trim().split(/\s+/u);
      const unreadLabel = labelIds.some((l) => /unread/iu.test(l) && document.getElementById(l));
      const bold = title ? Number(getComputedStyle(title).fontWeight) >= boldWeight : false;
      chats.push({
        id,
        name: (title?.textContent ?? "").trim(),
        kind: kinds.get(match.groups?.["type"] ?? "") ?? "other",
        folder: value.split("~")[2]?.split("/")[0] ?? "",
        unread: unreadLabel || bold,
        muted: item.getAttribute("data-item-type") === "muted-chat",
      });
    }
  }

  collapsed.forEach(toggle);
  return chats;
}

/**
 * Opens a chat by clicking its sidebar entry. Collapsed chat folders are
 * expanded only for the click and collapsed again afterwards.
 */
export async function clickChat(id: string): Promise<{ clicked: boolean }> {
  const expandMs = 500;
  const settleMs = 300;
  const folderSelector =
    '[role="treeitem"][aria-level="1"][aria-expanded="false"]:is([data-item-type="chats"], [data-item-type="custom-folder"])';
  const collapsed = [...document.querySelectorAll<HTMLElement>(folderSelector)];
  const toggle = (folder: HTMLElement) => (folder.firstElementChild as HTMLElement | null)?.click();
  collapsed.forEach(toggle);
  if (collapsed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, expandMs));
  }

  const itemSelector = '[role="treeitem"][aria-level="2"][data-item-type$="chat"]';
  const item = [...document.querySelectorAll<HTMLElement>(itemSelector)].find((el) =>
    (el.getAttribute("data-fui-tree-item-value") ?? "").endsWith(`|${id}`),
  );
  const target = item?.querySelector<HTMLElement>('[data-inp="simple-collab-chat-switch"]') ?? item;
  target?.click();

  if (collapsed.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    collapsed.forEach(toggle);
  }
  return { clicked: Boolean(target) };
}
