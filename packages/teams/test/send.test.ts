import { describe, expect, it } from "vitest";
import { draftHash } from "../src/commands/send.js";
import { main } from "../src/main.js";
import { context, MESSAGE_API, teamsService, USER_ID } from "./helpers.js";

const ONE_ON_ONE = "19:synthetic-a_synthetic-b@unq.gbl.spaces";
const CHAT_PATH = `/v1/users/ME/conversations/${encodeURIComponent(ONE_ON_ONE)}/messages`;
const TEXT = "Synthetic test message";
const ME = `${MESSAGE_API}/users/ME/contacts/8:orgid:${USER_ID}`;
const THEM = `${MESSAGE_API}/users/ME/contacts/8:orgid:synthetic-other`;

/** A 1:1 chat with one message from each side, the self-chat and a channel. */
function chatService(extra: Record<string, (url: URL) => unknown> = {}) {
  return teamsService({
    "/v1/users/ME/conversations": () => ({
      conversations: [
        { id: "48:notes", threadProperties: {}, lastMessage: {} },
        {
          id: ONE_ON_ONE,
          threadProperties: { productThreadType: "OneToOneChat" },
          lastMessage: { id: "2", from: ME, imdisplayname: "Synthetic Me" },
        },
        {
          id: "19:channel@thread.tacv2",
          threadProperties: { groupId: "synthetic-team", topic: "Synthetic Person updates" },
          lastMessage: {},
        },
      ],
    }),
    [CHAT_PATH]: () => ({
      messages: [
        {
          id: "2",
          messagetype: "Text",
          content: "Latest",
          from: ME,
          imdisplayname: "Synthetic Me",
          composetime: "2030-01-02",
        },
        {
          id: "1",
          messagetype: "Text",
          content: "Hello",
          from: THEM,
          imdisplayname: "Synthetic Person",
          composetime: "2030-01-01",
        },
      ],
    }),
    ...extra,
  });
}

function run(argv: string[], ctx: ReturnType<typeof context>["ctx"]) {
  let output = "";
  const stdout = (value: string) => {
    output = value;
  };
  return main(argv, { stdout }, ctx).then((code) => ({ code, body: JSON.parse(output) }));
}
const posts = (requests: { init: RequestInit | undefined }[]) =>
  requests.filter((r) => r.init?.method === "POST");

describe("find", () => {
  it("finds a 1:1 chat by the other person's name even when the user wrote last", async () => {
    const { ctx } = context({ credential: true });
    const service = chatService();
    ctx.fetch = service.fetch;
    const { body } = await run(["find", "person", "synthetic"], ctx);
    expect(body.data.matches).toEqual([
      { id: ONE_ON_ONE, kind: "oneOnOne", name: "", with: "Synthetic Person", lastMessageAt: "" },
    ]);
    expect(posts(service.requests)).toEqual([]);
  });
  it("never matches channels and returns nothing for unknown names", async () => {
    const { ctx } = context({ credential: true });
    ctx.fetch = chatService().fetch;
    expect((await run(["find", "nobody"], ctx)).body.data.matches).toEqual([]);
    expect((await run(["find", "updates"], ctx)).body.data.matches).toEqual([]);
  });
});

describe("draft and send", () => {
  it("drafts with the chat's participants and recent messages, sending nothing", async () => {
    const { ctx } = context({ credential: true });
    const service = chatService();
    ctx.fetch = service.fetch;
    const { code, body } = await run(["draft", ONE_ON_ONE, "--text", TEXT], ctx);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({
      chatId: ONE_ON_ONE,
      kind: "oneOnOne",
      participants: ["Synthetic Person"],
      text: TEXT,
      hash: draftHash(ONE_ON_ONE, TEXT),
    });
    expect(body.data.recent.map((m: { text: string }) => m.text)).toEqual(["Hello", "Latest"]);
    expect(posts(service.requests)).toEqual([]);
  });
  it("sends exactly the confirmed text as escaped HTML to the confirmed chat, once", async () => {
    const { ctx } = context({ credential: true });
    const service = chatService({
      [CHAT_PATH]: () => ({ ["OriginalArrivalTime"]: Date.UTC(2030, 0, 1) }),
    });
    ctx.fetch = service.fetch;
    const hash = draftHash(ONE_ON_ONE, TEXT);
    const { code, body } = await run(["send", ONE_ON_ONE, "--text", TEXT, "--confirm", hash], ctx);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({
      sent: true,
      chatId: ONE_ON_ONE,
      time: "2030-01-01T00:00:00.000Z",
    });
    const sent = posts(service.requests);
    expect(sent).toHaveLength(1);
    expect(new URL(String(service.requests.at(-1)?.url)).pathname).toBe(CHAT_PATH);
    expect(JSON.parse(String(sent[0]?.init?.body))).toMatchObject({
      content: `<p>${TEXT}</p>`,
      messagetype: "RichText/Html",
    });
  });
  it("mentions a recent participant and binds the mentioned person to the hash", async () => {
    const { ctx } = context({ credential: true });
    const service = chatService();
    ctx.fetch = service.fetch;
    const text = "@[Synthetic Person] please review";
    const drafted = await run(["draft", ONE_ON_ONE, "--text", text], ctx);
    expect(drafted.body.data.mentions).toEqual(["Synthetic Person"]);
    const plainHash = draftHash(ONE_ON_ONE, text);
    const unbound = await run(["send", ONE_ON_ONE, "--text", text, "--confirm", plainHash], ctx);
    expect(unbound.body.error.code).toBe("draft_changed");
    expect(posts(service.requests)).toEqual([]);
    const { hash } = drafted.body.data;
    expect((await run(["send", ONE_ON_ONE, "--text", text, "--confirm", hash], ctx)).code).toBe(0);
    const body = JSON.parse(String(posts(service.requests)[0]?.init?.body));
    expect(body.content).toContain('itemtype="http://schema.skype.com/Mention"');
    expect(JSON.parse(body.properties.mentions)[0]).toMatchObject({
      mri: "8:orgid:synthetic-other",
      displayName: "Synthetic Person",
    });
  });
  it("refuses to draft a mention of someone who is not a recent participant", async () => {
    const { ctx } = context({ credential: true });
    ctx.fetch = chatService().fetch;
    const drafted = await run(["draft", ONE_ON_ONE, "--text", "@[Nobody] hi"], ctx);
    expect(drafted.body.error).toMatchObject({
      code: "mention_unknown",
      details: { participants: ["Synthetic Me", "Synthetic Person"] },
    });
  });
  it("binds the hash to the chat: a hash for one chat cannot send to another", async () => {
    const { ctx, requests } = context({ credential: true });
    const selfHash = draftHash("48:notes", TEXT);
    const moved = await run(["send", ONE_ON_ONE, "--text", TEXT, "--confirm", selfHash], ctx);
    expect(moved.body.error).toEqual({ code: "draft_changed", message: expect.any(String) });
    const changed = await run(["send", "self", "--text", `${TEXT}!`, "--confirm", selfHash], ctx);
    expect(changed.body.error.code).toBe("draft_changed");
    expect(requests).toEqual([]);
  });
  it("refuses channels, display names and invalid input before any request", async () => {
    const { ctx, calls, requests } = context({ credential: true });
    const hash = draftHash("48:notes", TEXT);
    for (const chat of ["19:channel@thread.tacv2", "Synthetic Person"]) {
      const sent = await run(["send", chat, "--text", TEXT, "--confirm", hash], ctx);
      expect(sent.body.error.code).toBe("send_target_disabled");
      const drafted = await run(["draft", chat, "--text", TEXT], ctx);
      expect(drafted.body.error.code).toBe("send_target_disabled");
    }
    expect((await run(["send", "self", "--text", TEXT], ctx)).code).toBe(2);
    expect((await run(["draft", "self", "--text", "  "], ctx)).code).toBe(2);
    expect((await run(["draft", "self", "--text", "x".repeat(4001)], ctx)).code).toBe(2);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });
  it("refuses to draft for a chat ID that is not in the user's chat list", async () => {
    const { ctx } = context({ credential: true });
    const service = chatService();
    ctx.fetch = service.fetch;
    const drafted = await run(["draft", "19:not-mine@thread.v2", "--text", TEXT], ctx);
    expect(drafted.body.error.code).toBe("chat_not_found");
    expect(posts(service.requests)).toEqual([]);
  });
  it("never retries when the outcome of a send is unknown", async () => {
    const { ctx } = context({ credential: true });
    let attempts = 0;
    ctx.fetch = () => {
      attempts += 1;
      return Promise.reject(new Error("synthetic network failure"));
    };
    const hash = draftHash("48:notes", TEXT);
    const { body } = await run(["send", "self", "--text", TEXT, "--confirm", hash], ctx);
    expect(body.error.code).toBe("send_unconfirmed");
    expect(attempts).toBe(1);
  });
  it("retries once after a refresh only when Teams rejected the credential", async () => {
    const { ctx, calls } = context({ credential: true });
    const service = teamsService();
    let attempts = 0;
    ctx.fetch = (input, init) => {
      if (init?.method === "POST") {
        attempts += 1;
        return Promise.resolve(new Response(null, { status: attempts === 1 ? 401 : 201 }));
      }
      return service.fetch(input, init);
    };
    const hash = draftHash("48:notes", TEXT);
    expect((await run(["send", "self", "--text", TEXT, "--confirm", hash], ctx)).code).toBe(0);
    expect(attempts).toBe(2);
    expect(calls.filter((args) => args[0] === "open" && args[1] === "about:blank")).toHaveLength(1);
  });
});
