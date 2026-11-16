// Page functions are serialized into the browser: no imports, no outer references.
//
// Message actions live in a popover that opens from the message's hidden
// "More message options" button. Each function checks the open chat and that
// the message is the user's own before it clicks anything.

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
  | "action_unavailable";

export type ActionResult = { ok: true } | { ok: false; reason: ActionFailure };

export interface EditTarget extends MessageTarget {
  /** Attribute to mark the edit box with, so the driver can fill it. */
  mark: string;
}

/**
 * Opens the editor of the user's own message `id`, marks the edit box and
 * selects its content so the next fill replaces it.
 */
export async function openEditor(target: EditTarget): Promise<ActionResult> {
  const pollMs = 100;
  const timeoutMs = 5000;
  const list = '[data-tid="message-pane-list-viewport"]';
  const boxSelector = '[role="textbox"][contenteditable="true"]';
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
  if ([...document.querySelectorAll(boxSelector)].some((b) => b.closest(list))) {
    return { ok: false, reason: "already_editing" };
  }
  for (const el of document.querySelectorAll(`[${target.mark}]`)) {
    el.removeAttribute(target.mark);
  }
  const wait = async <T>(find: () => T | null | undefined): Promise<T | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = find();
      if (found) {
        return found;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return null;
  };

  item.querySelector<HTMLElement>('[data-tid="message-actions-menu-hidden-button"]')?.click();
  const edit = await wait(() =>
    document.querySelector<HTMLElement>(
      '[data-tid="message-actions-container"] [data-tid="message-actions-edit"]',
    ),
  );
  if (!edit) {
    return { ok: false, reason: "action_unavailable" };
  }
  edit.click();
  // The editor opens inside the message's own list item.
  const box = await wait(() => item.querySelector<HTMLElement>(boxSelector));
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
 * Clicks a button of the marked edit box: "Done" saves, "Cancel" discards
 * (confirming Teams' "Discard draft" dialog). Only buttons in the editor's own
 * container inside the message list are considered.
 */
export async function finishEditor(args: {
  mark: string;
  action: "done" | "cancel";
}): Promise<{ clicked: boolean }> {
  const settleMs = 500;
  const box = document.querySelector<HTMLElement>(`[${args.mark}]`);
  const tid =
    args.action === "done" ? "newMessageCommands-send" : "newMessageCommands-discard-draft";
  let scope = box?.parentElement;
  while (scope && !scope.querySelector(`button[data-tid="${tid}"]`)) {
    scope = scope.parentElement;
  }
  const buttons = scope?.querySelectorAll<HTMLElement>(`button[data-tid="${tid}"]`);
  const button = buttons?.[0];
  if (
    !(scope?.closest('[data-tid="message-pane-list-viewport"]') && buttons?.length === 1 && button)
  ) {
    return { clicked: false };
  }
  button.click();
  if (args.action === "cancel") {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    document
      .querySelector<HTMLElement>(
        '[data-tid="messagedraft-discard-dialog"] [data-tid="messagedraft-discard-confirm"]',
      )
      ?.click();
  }
  return { clicked: true };
}

/** Deletes the user's own message `id` through its "More options" menu. */
export async function clickDelete(target: MessageTarget): Promise<ActionResult> {
  const pollMs = 100;
  const timeoutMs = 5000;
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
  const wait = async (selector: string): Promise<HTMLElement | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = document.querySelectorAll<HTMLElement>(selector);
      if (found.length === 1) {
        return found[0] ?? null;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return null;
  };

  const opener = item.querySelector<HTMLElement>('[data-tid="message-actions-menu-hidden-button"]');
  opener?.click();
  const more = await wait(
    '[data-tid="message-actions-container"] [data-tid="message-actions-more"]',
  );
  if (!(more && opener?.getAttribute("aria-expanded") === "true")) {
    return { ok: false, reason: "action_unavailable" };
  }
  more.click();
  const remove = await wait('[role="menu"] [role="menuitem"][data-tid="message-actions-delete"]');
  if (!remove) {
    return { ok: false, reason: "action_unavailable" };
  }
  remove.click();
  return { ok: true };
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

/** Closes any open message popover or menu without choosing an action. */
export function dismissMenus(): void {
  for (let i = 0; i < 2; i += 1) {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
  }
}
