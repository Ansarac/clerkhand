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
