// Page functions are serialized into the browser: no imports, no outer references.

export interface Message {
  /** Teams message id (epoch milliseconds of the original post). */
  id: string;
  author: string | null;
  /** ISO 8601. */
  time: string | null;
  text: string;
  edited: boolean;
}

/** Waits until the chat with `id` is open and its message list has settled. */
export async function waitForChat(args: {
  id: string;
  timeoutMs: number;
}): Promise<{ open: boolean }> {
  const headerPollMs = 200;
  const settlePollMs = 400;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + args.timeoutMs;
  while (!document.getElementById(`chat-header-${args.id}`)) {
    if (Date.now() > deadline) {
      return { open: false };
    }
    await sleep(headerPollMs);
  }
  const count = () => document.querySelectorAll('[data-tid="chat-pane-message"]').length;
  let last = -1;
  while (Date.now() < deadline) {
    const now = count();
    if (now > 0 && now === last) {
      break;
    }
    last = now;
    await sleep(settlePollMs);
  }
  return { open: true };
}

/** Messages currently rendered in the open chat, oldest first. */
export function readMessages(): { chatId: string | null; messages: Message[] } {
  const header = document.querySelector('[id^="chat-header-"]');
  const messages: Message[] = [];
  for (const group of document.querySelectorAll<HTMLElement>(
    '[data-tid="chat-pane-message"][data-mid]',
  )) {
    const id = group.dataset["mid"] ?? "";
    const part = (name: string) => document.getElementById(`${name}-${id}`);
    const content = part("content");
    // biome-ignore lint/performance/useDomNodeTextContent: innerText keeps the line breaks of paragraphs.
    const rendered = content?.innerText;
    const text = (rendered || content?.getAttribute("aria-label") || "")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    messages.push({
      id,
      author: part("author")?.textContent?.trim() || null,
      time: part("timestamp")?.getAttribute("datetime") ?? null,
      text,
      edited: part("edited") !== null,
    });
  }
  return { chatId: header ? header.id.slice("chat-header-".length) : null, messages };
}

/** Scrolls the message list to the top and waits for older messages to load. */
export async function loadOlderMessages(timeoutMs: number): Promise<{ loaded: boolean }> {
  const pollMs = 250;
  const viewport = document.querySelector<HTMLElement>('[data-tid="message-pane-list-viewport"]');
  if (!viewport) {
    return { loaded: false };
  }
  const first = () =>
    document.querySelector<HTMLElement>('[data-tid="chat-pane-message"][data-mid]')?.dataset["mid"];
  const before = first();
  viewport.scrollTop = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (first() !== before) {
      return { loaded: true };
    }
  }
  return { loaded: false };
}
