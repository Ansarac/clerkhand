import { describe, expect, it } from "vitest";
import { discover, listMessages } from "../src/api.js";
import { MESSAGE_API, teamsService, token } from "./helpers.js";

const session = { token: token(), messageApi: MESSAGE_API };
const messages = "/v1/users/ME/conversations/19%3Asynthetic%40thread.v2/messages";

describe("Teams chat service client", () => {
  it("discovers the region past 403 answers and sends the token only as a GET header", async () => {
    const { fetch, requests } = teamsService();
    expect(await discover(fetch, token())).toEqual({
      messageApi: MESSAGE_API,
      displayName: "Synthetic User",
    });
    expect(requests.map((r) => new URL(r.url).hostname)).toEqual([
      "amer.ng.msg.teams.microsoft.com",
      "emea.ng.msg.teams.microsoft.com",
    ]);
    for (const { url, init } of requests) {
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(url).not.toContain(token());
    }
  });
  it("maps 401 to an authentication failure and other errors without response bodies", async () => {
    const unauthorized = teamsService({
      "/v1/users/ME/properties": () => new Response("synthetic-secret", { status: 401 }),
    });
    await expect(discover(unauthorized.fetch, token())).rejects.toMatchObject({
      code: "authentication_failed",
    });
    const throttled = teamsService({
      "/v1/users/ME/properties": () => new Response("synthetic-secret", { status: 429 }),
    });
    const error = await discover(throttled.fetch, token()).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "teams_error" });
    expect(JSON.stringify(error)).not.toContain("synthetic-secret");
    expect(String((error as Error).message)).not.toContain("synthetic-secret");
  });
  it("refuses to send the token outside the Teams chat service", async () => {
    const { fetch, requests } = teamsService();
    await expect(
      listMessages(fetch, { ...session, messageApi: "https://example.test/v1" }, "48:notes", 1),
    ).rejects.toMatchObject({ code: "teams_error" });
    expect(requests).toEqual([]);
  });
  it("follows backward links on the same chat, skipping system messages", async () => {
    const { fetch, requests } = teamsService({
      [messages]: (url) =>
        url.searchParams.has("page")
          ? { messages: [{ id: "1", messagetype: "Text" }], ["_metadata"]: {} }
          : {
              messages: [
                { id: "3", messagetype: "Text" },
                { id: "2", messagetype: "ThreadActivity/AddMember" },
              ],
              ["_metadata"]: { backwardLink: `${new URL(MESSAGE_API).origin}${messages}?page=2` },
            },
    });
    const result = await listMessages(fetch, session, "19:synthetic@thread.v2", 5);
    expect(result.map((m) => (m as { id: string }).id)).toEqual(["3", "1"]);
    expect(requests).toHaveLength(2);
  });
  it("returns the newest messages by send time when old ones were modified recently", async () => {
    const link = `${new URL(MESSAGE_API).origin}${messages}?page=2`;
    const { fetch, requests } = teamsService({
      // Teams orders by version: messages 10 and 20 were deleted after 300 was sent.
      [messages]: (url) =>
        url.searchParams.has("page")
          ? {
              messages: [
                { id: "200", version: "200", messagetype: "Text" },
                { id: "100", version: "100", messagetype: "Text" },
              ],
              ["_metadata"]: { backwardLink: `${link}3` },
            }
          : {
              messages: [
                { id: "10", version: "500", messagetype: "Text", properties: { deletetime: "1" } },
                { id: "300", version: "400", messagetype: "Text" },
                { id: "20", version: "350", messagetype: "Text", properties: { deletetime: "1" } },
              ],
              ["_metadata"]: { backwardLink: link },
            },
    });
    const result = await listMessages(fetch, session, "19:synthetic@thread.v2", 2);
    expect(result.map((m) => (m as { id: string }).id)).toEqual(["300", "200"]);
    // Stops once no unseen message can be newer than the two kept ones.
    expect(requests).toHaveLength(2);
  });
  it("rejects pagination links that leave the requested chat", async () => {
    const { fetch, requests } = teamsService({
      [messages]: () => ({
        messages: [{ id: "1", messagetype: "Text" }],
        ["_metadata"]: { backwardLink: `${MESSAGE_API}/users/ME/conversations/other/messages` },
      }),
    });
    await expect(listMessages(fetch, session, "19:synthetic@thread.v2", 5)).rejects.toMatchObject({
      code: "teams_schema",
    });
    expect(requests).toHaveLength(1);
  });
});
