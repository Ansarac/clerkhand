import { type Command, parse, usage } from "../context.js";
import { type Draft, readDraft, writeDraft } from "../drafts.js";
import { ensureTeams, getChats, openChat, resolveChat } from "../teams.js";

const OPEN_CHAT_TIMEOUT_MS = 20_000;
const USAGE = `Usage: clerkhand-teams draft <chat> --text T
       clerkhand-teams draft show <chat>
       clerkhand-teams draft clear <chat>`;

type DraftCall =
  | { action: "write"; query: string; text: string; headed: boolean }
  | { action: "show" | "clear"; query: string; headed: boolean };

function parseDraft(args: string[]): DraftCall {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { text: { type: "string" }, headed: { type: "boolean" } },
  });
  const headed = values.headed ?? false;
  const [first, second, ...extra] = positionals;
  if (first === undefined || extra.length > 0) {
    throw usage(USAGE);
  }
  if (second === undefined) {
    if (values.text === undefined) {
      throw usage(`--text is required.\n${USAGE}`);
    }
    if (values.text.trim() === "") {
      throw usage("--text is empty. Use `draft clear` to remove a draft.");
    }
    return { action: "write", query: first, text: values.text, headed };
  }
  if (!(first === "show" || first === "clear") || values.text !== undefined) {
    throw usage(USAGE);
  }
  return { action: first, query: second, headed };
}

/** Writes, shows or clears the unsent draft of a chat. Never sends. */
export const draft: Command = async (args, ctx) => {
  const call = parseDraft(args);
  const driver = ctx.driver({ headed: call.headed, fill: call.action !== "show" });
  await ensureTeams(driver, { timeoutMs: 60_000, ...(ctx.clock ? { clock: ctx.clock } : {}) });
  const chat = resolveChat(await getChats(driver), call.query);
  await openChat(driver, chat, OPEN_CHAT_TIMEOUT_MS);
  let result: Draft;
  if (call.action === "write") {
    result = await writeDraft(driver, chat, call.text);
  } else if (call.action === "clear") {
    result = await writeDraft(driver, chat, "");
  } else {
    result = await readDraft(driver, chat);
  }
  return {
    chat: { id: chat.id, name: chat.name, kind: chat.kind },
    draft: result.text,
    hash: result.hash,
  };
};
