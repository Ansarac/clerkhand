// Page functions are serialized into the browser: no imports, no outer references.
//
// Message actions live in a popover that opens from the message's hidden
// "More message options" button. `openActions` opens it for one message and
// checks the chat, ownership and that no other popover is open; the next step
// re-checks that the popover still belongs to that message before clicking.

export interface MessageTarget {
  chatId: string;
  /** Message id (`data-mid`) from `read`. */
  id: string;
}

export type ActionFailure =
  | "chat_changed"
  | "message_not_found"
  | "not_own_message"
  | "already_editing"
  | "menu_open"
  | "action_unavailable";

export type ActionResult = { ok: true } | { ok: false; reason: ActionFailure };

/** Opens the action popover of the user's own message `id`. */
export async function openActions(target: MessageTarget): Promise<ActionResult> {
  const pollMs = 100;
  const timeoutMs = 5000;
  const popover = '[data-tid="message-actions-container"]';
  const header = document.querySelector('[id^="chat-header-"]');
  if (!header || header.id !== `chat-header-${target.chatId}`) {
    return { ok: false, reason: "chat_changed" };
  }
  const group = document.querySelector<HTMLElement>(
    `[data-tid="chat-pane-message"][data-mid="${CSS.escape(target.id)}"]`,
  );
  const opener = group
    ?.closest('[data-tid="chat-pane-item"]')
    ?.querySelector<HTMLElement>('[data-tid="message-actions-menu-hidden-button"]');
  if (!(group && opener)) {
    return { ok: false, reason: "message_not_found" };
  }
  if (!group.classList.contains("fui-ChatMyMessage__body")) {
    return { ok: false, reason: "not_own_message" };
  }
  const editing = [...document.querySelectorAll('[role="textbox"][contenteditable="true"]')].some(
    (box) => box.closest('[data-tid="message-pane-list-viewport"]'),
  );
  if (editing) {
    return { ok: false, reason: "already_editing" };
  }
  // A popover left open on another message would take the next click.
  if (document.querySelector(`${popover}, [role="menu"]`)) {
    return { ok: false, reason: "menu_open" };
  }
  opener.click();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      document.querySelectorAll(popover).length === 1 &&
      opener.getAttribute("aria-expanded") === "true"
    ) {
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { ok: false, reason: "action_unavailable" };
}

export interface EditTarget extends MessageTarget {
  /** Attribute to mark the edit box with, so the driver can fill it. */
  mark: string;
}

/**
 * Clicks Edit in the popover opened for `id`, then marks the edit box inside
 * that message and selects its content so the next fill replaces it.
 */
export async function clickEdit(target: EditTarget): Promise<ActionResult> {
  const pollMs = 100;
  const timeoutMs = 5000;
  const group = document.querySelector<HTMLElement>(
    `[data-tid="chat-pane-message"][data-mid="${CSS.escape(target.id)}"]`,
  );
  const item = group?.closest<HTMLElement>('[data-tid="chat-pane-item"]');
  const opener = item?.querySelector('[data-tid="message-actions-menu-hidden-button"]');
  const popovers = document.querySelectorAll('[data-tid="message-actions-container"]');
  const edit = popovers[0]?.querySelector<HTMLElement>('[data-tid="message-actions-edit"]');
  if (
    !(item && opener?.getAttribute("aria-expanded") === "true" && popovers.length === 1 && edit)
  ) {
    return { ok: false, reason: "action_unavailable" };
  }
  for (const el of document.querySelectorAll(`[${target.mark}]`)) {
    el.removeAttribute(target.mark);
  }
  edit.click();
  const deadline = Date.now() + timeoutMs;
  let box: HTMLElement | null = null;
  while (!box && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    // The editor opens inside the message's own list item.
    box = item.querySelector<HTMLElement>('[role="textbox"][contenteditable="true"]');
  }
  if (!box) {
    return { ok: false, reason: "action_unavailable" };
  }
  box.setAttribute(target.mark, "");
  box.focus();
  const range = document.createRange();
  range.selectNodeContents(box);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
  return { ok: true };
}

/** Clicks More options, then Delete, in the popover opened for `id`. */
export async function clickDelete(target: MessageTarget): Promise<ActionResult> {
  const pollMs = 100;
  const timeoutMs = 5000;
  const opener = document
    .querySelector(`[data-tid="chat-pane-message"][data-mid="${CSS.escape(target.id)}"]`)
    ?.closest('[data-tid="chat-pane-item"]')
    ?.querySelector('[data-tid="message-actions-menu-hidden-button"]');
  const popovers = document.querySelectorAll('[data-tid="message-actions-container"]');
  const more = popovers[0]?.querySelector<HTMLElement>('[data-tid="message-actions-more"]');
  if (!(opener?.getAttribute("aria-expanded") === "true" && popovers.length === 1 && more)) {
    return { ok: false, reason: "action_unavailable" };
  }
  more.click();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = document.querySelectorAll<HTMLElement>(
      '[role="menu"] [role="menuitem"][data-tid="message-actions-delete"]',
    );
    const [remove] = items;
    if (items.length === 1 && remove) {
      remove.click();
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { ok: false, reason: "action_unavailable" };
}

export interface EditState {
  /** The marked edit box is still open. */
  editing: boolean;
  text: string;
}

/** Text of the marked edit box. */
export function readEditor(mark: string): EditState {
  const box = document.querySelector<HTMLElement>(`[${mark}]`);
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
  return { editing: box !== null, text: box?.innerText ?? "" };
}

/**
 * Saves the marked edit box with its own Done button, but only if the open chat
 * is `chatId` and the box holds exactly `text` (normalized like the CLI).
 * Only a Done button in the editor's container inside the message list counts.
 */
export function saveEditor(args: { chatId: string; mark: string; text: string }): {
  clicked: boolean;
} {
  const header = document.querySelector('[id^="chat-header-"]');
  const box = document.querySelector<HTMLElement>(`[${args.mark}]`);
  if (!(box && header?.id === `chat-header-${args.chatId}`)) {
    return { clicked: false };
  }
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
  const current = box.innerText
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  let scope = box.parentElement;
  while (scope && !scope.querySelector('button[data-tid="newMessageCommands-send"]')) {
    scope = scope.parentElement;
  }
  const buttons = scope?.querySelectorAll<HTMLButtonElement>(
    'button[data-tid="newMessageCommands-send"]',
  );
  const done = buttons?.[0];
  const inList = scope?.closest('[data-tid="message-pane-list-viewport"]');
  if (current !== args.text || !inList || buttons?.length !== 1 || !done || done.disabled) {
    return { clicked: false };
  }
  done.click();
  return { clicked: true };
}

/**
 * Discards the marked edit box: Cancel, then Discard in Teams' "Discard draft"
 * dialog. Reports whether the editor actually closed.
 */
export async function discardEditor(mark: string): Promise<{ closed: boolean }> {
  const pollMs = 100;
  const timeoutMs = 5000;
  const box = document.querySelector<HTMLElement>(`[${mark}]`);
  let scope = box?.parentElement;
  while (scope && !scope.querySelector('button[data-tid="newMessageCommands-discard-draft"]')) {
    scope = scope.parentElement;
  }
  const cancel = scope?.querySelector<HTMLElement>(
    'button[data-tid="newMessageCommands-discard-draft"]',
  );
  if (!(box && cancel && scope?.closest('[data-tid="message-pane-list-viewport"]'))) {
    return { closed: !box };
  }
  cancel.click();
  const deadline = Date.now() + timeoutMs;
  let confirmed = false;
  while (Date.now() < deadline) {
    if (!document.querySelector(`[${mark}]`)) {
      return { closed: true };
    }
    const discard = document.querySelector<HTMLElement>(
      '[data-tid="messagedraft-discard-dialog"] [data-tid="messagedraft-discard-confirm"]',
    );
    if (discard && !confirmed) {
      discard.click();
      confirmed = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { closed: false };
}

/** Restores the user's own deleted message `id` with its "Undo" button. */
export function clickUndoDelete(target: MessageTarget): ActionResult {
  const header = document.querySelector('[id^="chat-header-"]');
  if (!header || header.id !== `chat-header-${target.chatId}`) {
    return { ok: false, reason: "chat_changed" };
  }
  const group = document.querySelector<HTMLElement>(
    `[data-tid="chat-pane-message"][data-mid="${CSS.escape(target.id)}"]`,
  );
  const item = group?.closest<HTMLElement>('[data-tid="chat-pane-item"]');
  if (!(group && item)) {
    return { ok: false, reason: "message_not_found" };
  }
  if (!group.classList.contains("fui-ChatMyMessage__body")) {
    return { ok: false, reason: "not_own_message" };
  }
  const buttons = item.querySelectorAll<HTMLElement>('button[data-tid="message-undo-delete-btn"]');
  const [button] = buttons;
  if (!(group.querySelector('[data-tid="message-tombstone"]') && buttons.length === 1 && button)) {
    return { ok: false, reason: "action_unavailable" };
  }
  button.click();
  return { ok: true };
}

/**
 * Closes open message popovers and menus without choosing an action, by
 * sending Escape to each of them and to the focused element. Returns how many
 * are still open.
 */
export async function dismissMenus(): Promise<{ open: number }> {
  const settleMs = 300;
  const selector = '[data-tid="message-actions-container"], [role="menu"]';
  for (let i = 0; i < 2; i += 1) {
    const targets = [...document.querySelectorAll(selector), document.activeElement];
    for (const target of targets) {
      target?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      );
    }
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
  return { open: document.querySelectorAll(selector).length };
}
