import { ClerkhandError, type Driver } from "@clerkhand/core";
import { normalize } from "./drafts.js";
import {
  type ActionResult,
  clickDelete,
  clickUndoDelete,
  dismissMenus,
  finishEditor,
  openEditor,
  readEditor,
} from "./page/actions.js";
import type { Chat } from "./page/chats.js";
import { loadOlderMessages, type Message, readMessages } from "./page/messages.js";
import { type Clock, realClock } from "./teams.js";

/** Marks the edit box of the message being edited. */
export const EDIT_MARK = "data-clerkhand-edit";

const LOAD_OLDER_TIMEOUT_MS = 5000;
const CONFIRM_TIMEOUT_MS = 15_000;
const POLL_MS = 500;

async function messagesIn(driver: Driver, chat: Chat): Promise<Message[]> {
  const page = await driver.evaluate(readMessages, undefined);
  if (page.chatId !== chat.id) {
    throw new ClerkhandError("chat_changed", `"${chat.name}" is no longer the open chat.`);
  }
  return page.messages;
}

/** Scrolls up until message `id` is rendered; ids are post times, so older ones stop the search. */
export async function findMessage(driver: Driver, chat: Chat, id: string): Promise<Message> {
  while (true) {
    const messages = await messagesIn(driver, chat);
    const found = messages.find((m) => m.id === id);
    if (found) {
      return found;
    }
    const [oldest] = messages;
    const passed = oldest !== undefined && Number(oldest.id) < Number(id);
    if (passed || !(await driver.evaluate(loadOlderMessages, LOAD_OLDER_TIMEOUT_MS)).loaded) {
      throw new ClerkhandError("message_not_found", `No message ${id} in "${chat.name}".`);
    }
  }
}

async function check(driver: Driver, result: ActionResult): Promise<void> {
  if (!result.ok) {
    await driver.evaluate(dismissMenus, undefined);
    throw new ClerkhandError(
      result.reason,
      `Nothing changed: ${result.reason.replaceAll("_", " ")}.`,
    );
  }
}

interface Confirmation {
  find: (messages: Message[]) => Message | undefined;
  /** Error when `find` never succeeds. */
  code: string;
  message: string;
}

/** Polls the chat until `find` returns a message; never repeats the action. */
async function confirm(
  driver: Driver,
  chat: Chat,
  { find, code, message }: Confirmation,
  clock: Clock,
): Promise<Message> {
  const deadline = clock.now() + CONFIRM_TIMEOUT_MS;
  while (true) {
    const found = find(await messagesIn(driver, chat));
    if (found) {
      return found;
    }
    if (clock.now() > deadline) {
      throw new ClerkhandError(code, message);
    }
    await clock.sleep(POLL_MS);
  }
}

/**
 * Replaces the text of the user's own message `id`. The new text is filled into
 * Teams' edit box and read back before "Done" is clicked; on a mismatch the
 * edit is discarded and the message stays as it was.
 */
export async function editMessage(
  driver: Driver,
  chat: Chat,
  { id, text }: { id: string; text: string },
  clock: Clock = realClock,
): Promise<Message> {
  await findMessage(driver, chat, id);
  await check(driver, await driver.evaluate(openEditor, { chatId: chat.id, id, mark: EDIT_MARK }));
  await driver.run(["fill", `[${EDIT_MARK}]`, text]);
  const state = await driver.evaluate(readEditor, EDIT_MARK);
  if (!state.editing || normalize(state.text) !== normalize(text)) {
    await driver.evaluate(finishEditor, { mark: EDIT_MARK, action: "cancel" });
    throw new ClerkhandError(
      "edit_mismatch",
      "The edit box did not hold the new text; discarded.",
      {
        details: { expected: text, actual: state.text },
      },
    );
  }
  if (!(await driver.evaluate(finishEditor, { mark: EDIT_MARK, action: "done" })).clicked) {
    await driver.evaluate(finishEditor, { mark: EDIT_MARK, action: "cancel" });
    throw new ClerkhandError("action_unavailable", "No Done button for the edit; discarded.");
  }
  return confirm(
    driver,
    chat,
    {
      find: (messages) =>
        messages.find((m) => m.id === id && m.edited && normalize(m.text) === normalize(text)),
      code: "edit_unconfirmed",
      message: "Done was clicked but the edit did not show up. Read the chat before trying again.",
    },
    clock,
  );
}

/** Deletes the user's own message `id`. */
export async function deleteMessage(
  driver: Driver,
  chat: Chat,
  id: string,
  clock: Clock = realClock,
): Promise<Message> {
  await findMessage(driver, chat, id);
  await check(driver, await driver.evaluate(clickDelete, { chatId: chat.id, id }));
  return confirm(
    driver,
    chat,
    {
      find: (messages) => messages.find((m) => m.id === id && m.deleted),
      code: "delete_unconfirmed",
      message: "Delete was clicked but the message still shows. Read the chat before trying again.",
    },
    clock,
  );
}

/** Restores the user's own deleted message `id`. */
export async function undoDelete(
  driver: Driver,
  chat: Chat,
  id: string,
  clock: Clock = realClock,
): Promise<Message> {
  await findMessage(driver, chat, id);
  await check(driver, await driver.evaluate(clickUndoDelete, { chatId: chat.id, id }));
  return confirm(
    driver,
    chat,
    {
      find: (messages) => messages.find((m) => m.id === id && !m.deleted),
      code: "undo_unconfirmed",
      message:
        "Undo was clicked but the message is still deleted. Read the chat before trying again.",
    },
    clock,
  );
}
