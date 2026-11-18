import { ClerkhandError } from "@clerkhand/core";
import { isMessageApi, record } from "./storage.js";

const REGIONS = ["amer", "emea", "apac"] as const;
const TIMEOUT_MS = 30_000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const PAGE_SIZE = 100;
const CHAT_PAGE_SIZE = 500;
const MAX_PAGES = 10;
const SYSTEM_MESSAGE = /^(?:ThreadActivity|Event|Control)\//u;

export type Fetch = typeof fetch;
export interface Session {
  token: string;
  messageApi: string;
}

export const SELF_CHAT_ID = "48:notes";
const MAX_CLIENT_ID = 1e15;
/** Self chat, 1:1 chats and group/meeting chats. Channels (`@thread.tacv2`) are refused. */
const CHAT_ID = /^(?:48:notes|19:[\w.-]+@unq\.gbl\.spaces|19:[\w.-]+@thread\.v2)$/u;

export function isSendableChatId(chatId: string): boolean {
  return CHAT_ID.test(chatId);
}

/**
 * The only write: a plain-text message to one chat. Never retried here; a request that does not
 * complete leaves the outcome unknown.
 */
export async function sendMessage(
  fetchImpl: Fetch,
  session: Session,
  chatId: string,
  text: string,
) {
  if (!isSendableChatId(chatId)) {
    throw new ClerkhandError(
      "send_target_disabled",
      "Only chats can receive messages, not channels.",
    );
  }
  if (!isMessageApi(session.messageApi)) {
    throw new ClerkhandError("teams_error", "Refused a request outside the Teams chat service.");
  }
  const clientMessageId = String(Math.floor(Math.random() * MAX_CLIENT_ID));
  let response: Response;
  try {
    response = await fetchImpl(
      `${session.messageApi}/users/ME/conversations/${encodeURIComponent(chatId)}/messages`,
      {
        method: "POST",
        headers: { ["X-Skypetoken"]: session.token, ["content-type"]: "application/json" },
        body: JSON.stringify({
          content: text,
          messagetype: "Text",
          contenttype: "text",
          clientmessageid: clientMessageId,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
  } catch {
    // biome-ignore lint/style/useErrorCause: network errors can echo request headers.
    throw new ClerkhandError(
      "send_unconfirmed",
      "The send request did not complete; the message may or may not exist. Read the chat before trying again.",
    );
  }
  if (response.status === HTTP_UNAUTHORIZED) {
    throw new ClerkhandError("authentication_failed", "Teams rejected the credential; not sent.");
  }
  if (!response.ok) {
    throw new ClerkhandError("teams_error", `Teams returned HTTP ${response.status}; not sent.`, {
      details: { status: response.status },
    });
  }
  const body = record(await response.json().catch(() => undefined));
  const arrival = body["OriginalArrivalTime"];
  return {
    chatId,
    clientMessageId,
    ...(typeof arrival === "number" ? { time: new Date(arrival).toISOString() } : {}),
  };
}

/** Reads. Errors never include response bodies. */
async function get(fetchImpl: Fetch, session: Session, url: string): Promise<unknown> {
  if (!(url.startsWith(`${session.messageApi}/`) && isMessageApi(session.messageApi))) {
    throw new ClerkhandError("teams_error", "Refused a request outside the Teams chat service.");
  }
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { ["X-Skypetoken"]: session.token, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // biome-ignore lint/style/useErrorCause: network errors can echo request headers.
    throw new ClerkhandError("teams_error", "Cannot reach the Teams chat service.");
  }
  if (response.status === HTTP_UNAUTHORIZED) {
    throw new ClerkhandError("authentication_failed", "Teams rejected the credential.");
  }
  if (response.status === HTTP_NOT_FOUND) {
    throw new ClerkhandError("chat_not_found", "No such chat. Use an exact ID from chats.");
  }
  if (!response.ok) {
    throw new ClerkhandError("teams_error", `Teams returned HTTP ${response.status}.`, {
      details: { status: response.status },
    });
  }
  try {
    return await response.json();
  } catch {
    // biome-ignore lint/style/useErrorCause: parser errors can quote the response body.
    throw new ClerkhandError("teams_schema", "Teams returned an invalid response.");
  }
}

/** Finds the user's region (other regions answer 403) and returns it with the identity. */
export async function discover(fetchImpl: Fetch, token: string) {
  for (const region of REGIONS) {
    const session = { token, messageApi: `https://${region}.ng.msg.teams.microsoft.com/v1` };
    try {
      const properties = record(
        await get(fetchImpl, session, `${session.messageApi}/users/ME/properties`),
      );
      return { messageApi: session.messageApi, displayName: displayName(properties) };
    } catch (error) {
      if (!(error instanceof ClerkhandError && hasStatus(error, HTTP_FORBIDDEN))) {
        throw error;
      }
    }
  }
  throw new ClerkhandError("teams_error", "No Teams chat service region accepted the credential.");
}

export async function whoami(fetchImpl: Fetch, session: Session): Promise<string> {
  return displayName(
    record(await get(fetchImpl, session, `${session.messageApi}/users/ME/properties`)),
  );
}

export async function listConversations(fetchImpl: Fetch, session: Session): Promise<unknown[]> {
  const body = record(
    await get(
      fetchImpl,
      session,
      `${session.messageApi}/users/ME/conversations?view=msnp24Equivalent&pageSize=${CHAT_PAGE_SIZE}`,
    ),
  );
  return array(body["conversations"]);
}

/** Newest first, user messages only; follows Teams' backward links on the same chat. */
export async function listMessages(
  fetchImpl: Fetch,
  session: Session,
  chatId: string,
  limit: number,
): Promise<unknown[]> {
  const path = `/users/ME/conversations/${encodeURIComponent(chatId)}/messages`;
  let url: string | undefined =
    `${session.messageApi}${path}?startTime=0&view=msnp24Equivalent&pageSize=${Math.min(limit, PAGE_SIZE)}`;
  const messages: unknown[] = [];
  for (let page = 0; url && messages.length < limit && page < MAX_PAGES; page += 1) {
    const body = record(await get(fetchImpl, session, url));
    const fetched = array(body["messages"]);
    messages.push(
      ...fetched.filter((m) => !SYSTEM_MESSAGE.test(String(record(m)["messagetype"] ?? ""))),
    );
    const next = record(body["_metadata"])["backwardLink"];
    url = fetched.length > 0 && typeof next === "string" && next ? next : undefined;
    // get() pins the origin; the path must stay on this chat (Teams may encode the ID differently).
    if (url && decodedPath(url) !== decodedPath(`${session.messageApi}${path}`)) {
      throw new ClerkhandError("teams_schema", "Teams returned an unexpected pagination link.");
    }
  }
  return messages.slice(0, limit);
}

function displayName(properties: Record<string, unknown>): string {
  let name: unknown;
  try {
    name = record(JSON.parse(String(properties["userDetails"] ?? "{}")))["name"];
  } catch {
    name = undefined;
  }
  const value = typeof name === "string" && name ? name : properties["primaryMemberName"];
  if (typeof value !== "string" || !value) {
    throw new ClerkhandError("teams_schema", "Teams returned an invalid identity.");
  }
  return value;
}

function decodedPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return "";
  }
}

function hasStatus(error: ClerkhandError, status: number): boolean {
  return record(error.details)["status"] === status;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ClerkhandError("teams_schema", "Teams returned an unexpected response shape.");
  }
  return value;
}
