// Page functions are serialized into the browser: no imports, no outer references.

/** Attribute that marks the compose box so the driver can address it by selector. */
export const COMPOSE_MARK = "data-clerkhand-compose";

export interface ComposeTarget {
  /** Thread id the open chat must have. */
  chatId: string;
  /** Same as COMPOSE_MARK; passed in because page functions cannot see module scope. */
  mark: string;
}

export interface ComposeResult {
  /** Thread id of the open chat, if any. */
  chatId: string | null;
  /** How many compose boxes were found; anything but 1 is refused. */
  boxes: number;
  /** Current draft text; empty when there is no draft. */
  text: string;
}

/**
 * Finds the compose box of the open chat, checks that the chat is `chatId`,
 * marks the box, and selects its whole content so the next fill replaces it.
 * The in-message edit box shares the compose box's label, so boxes inside the
 * message list are skipped.
 */
export function selectCompose(target: ComposeTarget): ComposeResult {
  const header = document.querySelector('[id^="chat-header-"]');
  const chatId = header ? header.id.slice("chat-header-".length) : null;
  for (const el of document.querySelectorAll(`[${target.mark}]`)) {
    el.removeAttribute(target.mark);
  }
  const boxes = [
    ...document.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]'),
  ].filter((el) => !el.closest('[data-tid="message-pane-list-viewport"]'));
  const [box] = boxes;
  if (chatId !== target.chatId || boxes.length !== 1 || !box) {
    return { chatId, boxes: boxes.length, text: "" };
  }
  box.setAttribute(target.mark, "");
  box.focus();
  const range = document.createRange();
  range.selectNodeContents(box);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
  return { chatId, boxes: 1, text: box.innerText };
}

/** Reads the draft in the compose box of the open chat. */
export function readCompose(): ComposeResult {
  const header = document.querySelector('[id^="chat-header-"]');
  const chatId = header ? header.id.slice("chat-header-".length) : null;
  const boxes = [
    ...document.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]'),
  ].filter((el) => !el.closest('[data-tid="message-pane-list-viewport"]'));
  const [box] = boxes;
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
  const text = boxes.length === 1 && box ? box.innerText : "";
  return { chatId, boxes: boxes.length, text };
}

export interface SendTarget {
  chatId: string;
  /** The confirmed draft, normalized; the box must still hold exactly this. */
  text: string;
}

export type SendResult =
  | { clicked: true }
  | {
      clicked: false;
      reason: "chat_changed" | "compose_not_found" | "draft_changed" | "no_button";
    };

/**
 * Clicks Send for the open chat, but only if it is `chatId` and its compose
 * box still holds `text`. Checking and clicking happen in one script, so
 * nothing can change in between. Only the Send button that shares a container
 * with the compose box (and not with the message list) is clicked.
 */
export function clickSend(target: SendTarget): SendResult {
  const header = document.querySelector('[id^="chat-header-"]');
  if (!header || header.id !== `chat-header-${target.chatId}`) {
    return { clicked: false, reason: "chat_changed" };
  }
  const list = '[data-tid="message-pane-list-viewport"]';
  const boxes = [
    ...document.querySelectorAll<HTMLElement>('[role="textbox"][contenteditable="true"]'),
  ].filter((el) => !el.closest(list));
  const [box] = boxes;
  if (boxes.length !== 1 || !box) {
    return { clicked: false, reason: "compose_not_found" };
  }
  // Same normalization as the CLI: line endings, trailing spaces, outer blank lines.
  // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
  const current = box.innerText
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  if (current === "" || current !== target.text) {
    return { clicked: false, reason: "draft_changed" };
  }
  let scope = box.parentElement;
  while (scope && !scope.querySelector('button[data-tid="sendMessageCommands-send"]')) {
    scope = scope.parentElement;
  }
  const buttons = scope?.querySelectorAll<HTMLButtonElement>(
    'button[data-tid="sendMessageCommands-send"]',
  );
  const button = buttons?.[0];
  if (!scope || scope.querySelector(list) || buttons?.length !== 1 || !button || button.disabled) {
    return { clicked: false, reason: "no_button" };
  }
  button.click();
  return { clicked: true };
}
