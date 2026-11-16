import { createHash } from "node:crypto";
import { ClerkhandError, type Driver } from "@clerkhand/core";
import type { Chat } from "./page/chats.js";
import {
  COMPOSE_MARK,
  type ComposeResult,
  clickSend,
  readCompose,
  selectCompose,
} from "./page/compose.js";
import { type Message, readMessages } from "./page/messages.js";
import { type Clock, realClock } from "./teams.js";

const HASH_LENGTH = 12;
const SEND_TIMEOUT_MS = 15_000;
const SEND_POLL_MS = 500;

export interface Draft {
  text: string;
  /** Identifies `text`; `send --confirm` must quote it. */
  hash: string;
}

/** The editor adds a trailing line break and may differ in line endings and trailing spaces. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function toDraft(text: string): Draft {
  return { text, hash: createHash("sha256").update(text).digest("hex").slice(0, HASH_LENGTH) };
}

function checkCompose(result: ComposeResult, chat: Chat): string {
  if (result.chatId !== chat.id) {
    throw new ClerkhandError("chat_changed", `"${chat.name}" is no longer the open chat.`);
  }
  if (result.boxes !== 1) {
    throw new ClerkhandError(
      "compose_not_found",
      `Expected one compose box in "${chat.name}", found ${result.boxes}.`,
    );
  }
  return result.text;
}

/** The draft in the open chat's compose box; text is "" when there is none. */
export async function readDraft(driver: Driver, chat: Chat): Promise<Draft> {
  return toDraft(normalize(checkCompose(await driver.evaluate(readCompose, undefined), chat)));
}

/**
 * Replaces the draft of the open chat with `text` and reads it back.
 * Nothing is sent: only `fill` touches the box, and it presses no keys.
 */
export async function writeDraft(driver: Driver, chat: Chat, text: string): Promise<Draft> {
  checkCompose(await driver.evaluate(selectCompose, { chatId: chat.id, mark: COMPOSE_MARK }), chat);
  await driver.run(["fill", `[${COMPOSE_MARK}]`, text]);
  const actual = await readDraft(driver, chat);
  if (actual.text !== normalize(text)) {
    throw new ClerkhandError(
      "draft_mismatch",
      "The compose box does not hold the requested text.",
      {
        details: { expected: text, actual: actual.text },
      },
    );
  }
  return actual;
}

/**
 * Sends the open chat's draft if its hash is `confirm`, then waits until the
 * message shows up in the chat and the compose box is empty.
 */
export async function sendDraft(
  driver: Driver,
  chat: Chat,
  confirm: string,
  clock: Clock = realClock,
): Promise<Message> {
  const draft = await readDraft(driver, chat);
  if (draft.text === "") {
    throw new ClerkhandError("draft_empty", `"${chat.name}" has no draft to send.`);
  }
  if (draft.hash !== confirm) {
    throw new ClerkhandError(
      "draft_changed",
      "The draft is not the one confirmed. Show the current draft to the user and confirm again.",
      { details: { draft: draft.text, hash: draft.hash } },
    );
  }
  const before = new Set((await messagesIn(driver, chat)).map((m) => m.id));

  const result = await driver.evaluate(clickSend, { chatId: chat.id, text: draft.text });
  if (!result.clicked) {
    throw new ClerkhandError(result.reason, `Not sent: ${result.reason.replaceAll("_", " ")}.`);
  }

  const deadline = clock.now() + SEND_TIMEOUT_MS;
  while (true) {
    const sent = (await messagesIn(driver, chat)).find(
      (m) => !before.has(m.id) && normalize(m.text) === draft.text,
    );
    if (sent && (await readDraft(driver, chat)).text === "") {
      return sent;
    }
    if (clock.now() > deadline) {
      // Send was clicked; never retry, a second click could send twice.
      throw new ClerkhandError(
        "send_unconfirmed",
        "Send was clicked but the message did not appear. Check the chat before trying again.",
      );
    }
    await clock.sleep(SEND_POLL_MS);
  }
}

async function messagesIn(driver: Driver, chat: Chat): Promise<Message[]> {
  const page = await driver.evaluate(readMessages, undefined);
  if (page.chatId !== chat.id) {
    throw new ClerkhandError("chat_changed", `"${chat.name}" is no longer the open chat.`);
  }
  return page.messages;
}
