import { describe, expect, it } from "vitest";
import { listConversations } from "../src/api.js";
import { main } from "../src/main.js";
import { compactChats, compactMessages, htmlToText, withReadSession } from "../src/read.js";
import { context, teamsService, USER_ID } from "./helpers.js";

function run(argv: string[], ctx: ReturnType<typeof context>["ctx"]) {
  let output = "";
  const stdout = (value: string) => {
    output = value;
  };
  return main(argv, { stdout }, ctx).then((code) => ({
    code,
    body: JSON.parse(output),
  }));
}
const opens = (calls: string[][]) =>
  calls.filter((args) => args[0] === "open" && args[1] === "about:blank");
const rejecting =
  (status = 401) =>
  () =>
    new Response(null, { status });

describe("bounded read workflows", () => {
  it("uses the API without starting a browser while credentials are valid", async () => {
    const { ctx, calls } = context({ credential: true });
    const { code, body } = await run(["read", "self"], ctx);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({ chatId: "48:notes", truncated: false });
    expect(body.data.messages[0]).toMatchObject({ text: "Synthetic message", edited: false });
    expect(calls).toEqual([]);
  });
  it("accepts every chat ID kind returned by chats", async () => {
    const { ctx, requests } = context({ credential: true });
    for (const id of ["19:a_b@unq.gbl.spaces", "19:synthetic@thread.v2"]) {
      await run(["read", id], ctx);
    }
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      "/v1/users/ME/conversations/19%3Aa_b%40unq.gbl.spaces/messages",
      "/v1/users/ME/conversations/19%3Asynthetic%40thread.v2/messages",
    ]);
  });
  it("refreshes after an explicit authentication failure and retries once", async () => {
    const { ctx, calls } = context({ credential: true });
    const service = teamsService();
    let reads = 0;
    ctx.fetch = (input, init) => {
      if (String(input).includes("/conversations?")) {
        reads += 1;
        if (reads === 1) {
          return Promise.resolve(rejecting()());
        }
      }
      return service.fetch(input, init);
    };
    await withReadSession(ctx, (session) => listConversations(ctx.fetch, session));
    expect(reads).toBe(2);
    expect(opens(calls)).toHaveLength(1);
  });
  it("does not refresh twice when a newly verified credential is rejected", async () => {
    const { ctx, calls } = context();
    ctx.fetch = teamsService({ "/v1/users/ME/conversations": rejecting() }).fetch;
    expect((await run(["chats"], ctx)).body.error.code).toBe("authentication_failed");
    expect(opens(calls)).toHaveLength(1);
  });
  it("does not refresh for throttling or service errors", async () => {
    const { ctx, calls } = context({ credential: true });
    ctx.fetch = teamsService({ "/v1/users/ME/conversations": rejecting(429) }).fetch;
    expect((await run(["chats"], ctx)).body.error).toMatchObject({
      code: "teams_error",
      details: { status: 429 },
    });
    expect(calls).toEqual([]);
  });
  it("lists only self, 1:1 and group chats, omitting raw fields", () => {
    const result = compactChats(
      [
        { id: "48:notes", threadProperties: {}, lastMessage: { content: "<p>Hi&amp;bye</p>" } },
        { id: "19:a_b@unq.gbl.spaces", threadProperties: { productThreadType: "OneToOneChat" } },
        { id: "19:g@thread.v2", threadProperties: { threadType: "chat", topic: "Synthetic" } },
        { id: "19:channel@thread.tacv2", threadProperties: { groupId: "synthetic-team" } },
        { id: "19:meeting@thread.v2", threadProperties: { threadType: "meeting" } },
      ],
      2,
      { userId: USER_ID },
    );
    expect(result.chats).toEqual([
      {
        id: "48:notes",
        kind: "self",
        name: "",
        lastMessage: "Hi&bye",
        lastMessageAt: "",
        unread: false,
      },
      {
        id: "19:a_b@unq.gbl.spaces",
        kind: "oneOnOne",
        name: "",
        lastMessage: "",
        lastMessageAt: "",
        unread: false,
      },
    ]);
    expect(result.truncated).toBe(true);
  });
  it("marks chats unread from the read marker, ignoring the user's own messages", () => {
    const chat = (
      id: string,
      lastId: string,
      readId: string | undefined,
      from = "8:orgid:other",
    ) => ({
      id,
      threadProperties: { threadType: "chat" },
      lastMessage: {
        id: lastId,
        from: `https://emea.ng.msg.teams.microsoft.com/v1/users/ME/contacts/${from}`,
      },
      properties: readId === undefined ? {} : { consumptionhorizon: `${readId};${readId};0` },
    });
    const conversations = [
      chat("19:unread@thread.v2", "200", "100"),
      chat("19:read@thread.v2", "200", "200"),
      chat("19:mine@thread.v2", "200", "100", `8:orgid:${USER_ID}`),
      chat("19:unknown@thread.v2", "200", undefined),
    ];
    expect(
      compactChats(conversations, 10, { userId: USER_ID }).chats.map((c) => [c.id, c.unread]),
    ).toEqual([
      ["19:unread@thread.v2", true],
      ["19:read@thread.v2", false],
      ["19:mine@thread.v2", false],
      ["19:unknown@thread.v2", null],
    ]);
    const unread = compactChats(conversations, 10, { userId: USER_ID, unreadOnly: true });
    expect(unread.chats.map((c) => c.id)).toEqual(["19:unread@thread.v2"]);
    expect(unread.truncated).toBe(false);
  });
  it("bounds text, reports edits and deletions, and omits HTML and raw fields", () => {
    const result = compactMessages(
      [
        {
          id: "2",
          messagetype: "RichText/Html",
          content: `<p>${"x".repeat(5000)}</p>`,
          composetime: "2030-01-02",
          properties: { edittime: "1" },
          token: "synthetic-secret",
        },
        { id: "1", content: "", composetime: "2030-01-01", properties: { deletetime: "1" } },
        { id: "0", content: "older", composetime: "2029-12-31" },
      ],
      2,
    );
    expect(result.messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(result.messages[1]).toMatchObject({ edited: true, textTruncated: true });
    expect(result.messages[1]?.text).toHaveLength(4000);
    expect(result.messages[0]?.deleted).toBe(true);
    expect(result.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
    expect(JSON.stringify(result)).not.toContain("<p>");
  });
  it("converts Teams rich text to plain text", () => {
    expect(
      htmlToText(
        '<p>Hello <b>there</b>&nbsp;&#x1F600;<img itemtype="http://schema.skype.com/Emoji" alt="🙂"></p><p>See <a href="https://example.test/x">docs</a><br>and https://example.test</p>',
      ),
    ).toBe("Hello there 😀🙂\n\nSee docs (https://example.test/x)\nand https://example.test");
  });
  it("rejects writes, removed commands and invalid input before any backend call", async () => {
    const { ctx, calls, requests } = context();
    for (const command of ["edit", "delete", "undo-delete"]) {
      expect((await run([command], ctx)).body.error.code).toBe("write_disabled");
    }
    for (const argv of [
      ["search", "synthetic"],
      ["teams", "chat", "send"],
      ["constructor"],
      ["chats", "--limit", "201"],
      ["read", "48:notes", "--last", "0"],
      ["read", "Synthetic Person"],
    ]) {
      expect((await run(argv, ctx)).code).toBe(2);
    }
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });
});
