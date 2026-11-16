import { ClerkhandError, type Driver } from "@clerkhand/core";
import { normalize } from "./drafts.js";
import {
  type ActionResult,
  clickDelete,
  clickEdit,
  clickUndoDelete,
  discardEditor,
  dismissMenus,
  openActions,
  readEditor,
  saveEditor,
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

function refuse(code: string, message: string): never {
  throw new ClerkhandError(code, `Nothing changed: ${message}`);
}

/** Throws for a failed page step, after closing any popover it left open. */
async function check(driver: Driver, result: ActionResult): Promise<void> {
  if (!result.ok) {
    await driver.evaluate(dismissMenus, undefined);
    refuse(result.reason, `${result.reason.replaceAll("_", " ")}.`);
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

/** Discards the open edit and reports whether Teams actually closed the editor. */
async function discard(driver: Driver, code: string, why: string, details?: unknown) {
  const { closed } = await driver.evaluate(discardEditor, EDIT_MARK);
  const outcome = closed
    ? "The edit was discarded; the message is unchanged."
    : "The editor may still be open in Teams; check the chat.";
  return new ClerkhandError(code, `${why} ${outcome}`, { details });
}

/** Fills the open editor, reads it back and saves it; discards it on any failure. */
async function fillAndSave(driver: Driver, chat: Chat, text: string): Promise<void> {
  let state: { editing: boolean; text: string };
  try {
    await driver.run(["fill", `[${EDIT_MARK}]`, text]);
    state = await driver.evaluate(readEditor, EDIT_MARK);
  } catch (error) {
    throw await discard(driver, "edit_failed", `Filling the editor failed: ${String(error)}.`);
  }
  if (!state.editing || normalize(state.text) !== normalize(text)) {
    throw await discard(driver, "edit_mismatch", "The edit box did not hold the new text.", {
      expected: text,
      actual: state.text,
    });
  }
  const save = { chatId: chat.id, mark: EDIT_MARK, text: normalize(text) };
  if (!(await driver.evaluate(saveEditor, save)).clicked) {
    throw await discard(driver, "action_unavailable", "Done could not be clicked.");
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
  const current = await findMessage(driver, chat, id);
  if (current.deleted) {
    refuse("message_deleted", "the message is deleted.");
  }
  if (normalize(current.text) === normalize(text)) {
    refuse("unchanged", "the message already has this text.");
  }
  await check(driver, await driver.evaluate(openActions, { chatId: chat.id, id }));
  const opened = await driver.evaluate(clickEdit, { chatId: chat.id, id, mark: EDIT_MARK });
  if (!opened.ok) {
    throw await discard(driver, opened.reason, "The editor did not open.");
  }
  await fillAndSave(driver, chat, text);
  const edited = await confirm(
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
  if ((await driver.evaluate(readEditor, EDIT_MARK)).editing) {
    throw new ClerkhandError("edit_unconfirmed", "The editor is still open; check the chat.");
  }
  return edited;
}

/** Deletes the user's own message `id`. */
export async function deleteMessage(
  driver: Driver,
  chat: Chat,
  id: string,
  clock: Clock = realClock,
): Promise<Message> {
  if ((await findMessage(driver, chat, id)).deleted) {
    refuse("already_deleted", "the message is already deleted.");
  }
  await check(driver, await driver.evaluate(openActions, { chatId: chat.id, id }));
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
  if (!(await findMessage(driver, chat, id)).deleted) {
    refuse("not_deleted", "the message is not deleted.");
  }
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
