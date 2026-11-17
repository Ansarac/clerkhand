import { describe, expect, it } from "vitest";
import { draftHash } from "../src/commands/send.js";
import { main } from "../src/main.js";
import { context, teamsService } from "./helpers.js";

const SELF_PATH = "/v1/users/ME/conversations/48%3Anotes/messages";
const TEXT = "Synthetic test message";

function run(argv: string[], ctx: ReturnType<typeof context>["ctx"]) {
  let output = "";
  const stdout = (value: string) => {
    output = value;
  };
  return main(argv, { stdout }, ctx).then((code) => ({ code, body: JSON.parse(output) }));
}
const posts = (requests: { init: RequestInit | undefined }[]) =>
  requests.filter((r) => r.init?.method === "POST");

describe("self-chat send", () => {
  it("drafts without any network or browser access", async () => {
    const { ctx, calls, requests } = context({ credential: true });
    const { code, body } = await run(["draft", "self", "--text", TEXT], ctx);
    expect(code).toBe(0);
    expect(body.data).toEqual({
      chatId: "48:notes",
      text: TEXT,
      hash: draftHash("48:notes", TEXT),
    });
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
  });
  it("sends exactly the confirmed text as plain text to the self-chat, once", async () => {
    const { ctx, requests } = context({ credential: true });
    ctx.fetch = teamsService({
      [SELF_PATH]: () => ({ ["OriginalArrivalTime"]: Date.UTC(2030, 0, 1) }),
    }).fetch;
    const service = ctx.fetch;
    ctx.fetch = (input, init) => {
      requests.push({ url: String(input), init });
      return service(input, init);
    };
    const hash = draftHash("48:notes", TEXT);
    const { code, body } = await run(["send", "self", "--text", TEXT, "--confirm", hash], ctx);
    expect(code).toBe(0);
    expect(body.data).toMatchObject({
      sent: true,
      chatId: "48:notes",
      time: "2030-01-01T00:00:00.000Z",
    });
    const sent = posts(requests);
    expect(sent).toHaveLength(1);
    expect(new URL(String(requests[0]?.url)).pathname).toBe(SELF_PATH);
    expect(JSON.parse(String(sent[0]?.init?.body))).toMatchObject({
      content: TEXT,
      messagetype: "Text",
    });
    expect(String(sent[0]?.init?.body)).not.toContain("synthetic");
  });
  it("refuses changed text, other targets and missing confirmation before any request", async () => {
    const { ctx, calls, requests } = context({ credential: true });
    const hash = draftHash("48:notes", TEXT);
    const changed = await run(["send", "self", "--text", `${TEXT}!`, "--confirm", hash], ctx);
    expect(changed.body.error).toEqual({
      code: "draft_changed",
      message: expect.any(String),
    });
    const other = await run(
      ["send", "19:someone@unq.gbl.spaces", "--text", TEXT, "--confirm", hash],
      ctx,
    );
    expect(other.body.error.code).toBe("send_target_disabled");
    expect((await run(["send", "self", "--text", TEXT], ctx)).code).toBe(2);
    expect((await run(["draft", "self", "--text", "  "], ctx)).code).toBe(2);
    expect((await run(["draft", "self", "--text", "x".repeat(4001)], ctx)).code).toBe(2);
    expect(calls).toEqual([]);
    expect(requests).toEqual([]);
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
