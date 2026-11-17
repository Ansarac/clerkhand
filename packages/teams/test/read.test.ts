import { ClerkhandError } from "@clerkhand/core";
import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";
import { compactChats, compactMessages, readOperation } from "../src/read.js";
import { context, SELF_ID } from "./helpers.js";

describe("bounded read workflows", () => {
  it("shares one refresh budget across self-chat resolution and history", async () => {
    const { ctx, calls } = context();
    const original = ctx.messenger;
    ctx.messenger = (operation, dir) => {
      if (operation.kind === "history") {
        throw new ClerkhandError("authentication_failed", "Synthetic rejection");
      }
      return original(operation, dir);
    };
    expect(await main(["read", "self"], { stdout: () => undefined }, ctx)).toBe(1);
    expect(calls.filter((args) => args[0] === "open" && args[1] === "about:blank")).toHaveLength(1);
  });
  it("uses the API without starting a browser while credentials are valid", async () => {
    const { ctx, calls } = context({ credential: true });
    await readOperation({ kind: "chats" }, ctx);
    expect(calls).toEqual([]);
  });
  it("refreshes after an explicit authentication failure and retries once", async () => {
    const { ctx, calls } = context({ credential: true });
    let reads = 0;
    const original = ctx.messenger;
    ctx.messenger = (operation, dir) => {
      if (operation.kind === "chats") {
        reads += 1;
        if (reads === 1) {
          throw new ClerkhandError("authentication_failed", "Synthetic auth failure");
        }
      }
      return original(operation, dir);
    };
    await readOperation({ kind: "chats" }, ctx);
    expect(reads).toBe(2);
    expect(calls.filter((args) => args[0] === "open" && args[1] === "about:blank")).toHaveLength(1);
  });
  it("does not refresh rate limits, schema failures or arbitrary network errors", async () => {
    const { ctx, calls } = context({ credential: true });
    ctx.messenger = () => {
      throw new ClerkhandError("messenger_error", "Synthetic rate limit");
    };
    await expect(readOperation({ kind: "chats" }, ctx)).rejects.toMatchObject({
      code: "messenger_error",
    });
    expect(calls).toEqual([]);
  });
  it("does not refresh twice when a newly verified credential is rejected", async () => {
    const { ctx, calls } = context();
    const original = ctx.messenger;
    ctx.messenger = (operation, dir) => {
      if (operation.kind === "chats") {
        throw new ClerkhandError("authentication_failed", "Synthetic auth failure");
      }
      return original(operation, dir);
    };
    await expect(readOperation({ kind: "chats" }, ctx)).rejects.toMatchObject({
      code: "authentication_failed",
    });
    expect(calls.filter((args) => args[0] === "open" && args[1] === "about:blank")).toHaveLength(1);
  });
  it("bounds item counts and text, omitting raw responses, HTML and extra credentials", () => {
    const chat = {
      id: SELF_ID,
      type: "self",
      topic: "Synthetic",
      token: "synthetic-secret",
      raw: { secret: "synthetic" },
    };
    expect(JSON.stringify(compactChats([chat, chat], 1))).not.toContain("synthetic-secret");
    expect(compactChats([chat, chat], 1).truncated).toBe(true);
    const message = {
      id: "synthetic",
      content: "x".repeat(5000),
      html: "synthetic-secret",
      raw: {},
    };
    const result = compactMessages([message], 1);
    expect(result.messages[0]?.text).toHaveLength(4000);
    expect(result.messages[0]?.textTruncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic-secret");
  });
  it("reads the unique self-chat and rejects ambiguity", async () => {
    const { ctx } = context({ credential: true });
    let output = "";
    const io = {
      stdout: (value: string) => {
        output = value;
      },
    };
    expect(await main(["read", "self"], io, ctx)).toBe(0);
    expect(JSON.parse(output).data.chatId).toBe(SELF_ID);
    ctx.messenger = () =>
      Promise.resolve([
        { id: SELF_ID, type: "self" },
        { id: "19:other@thread.v2", type: "self" },
      ]);
    expect(await main(["read", "self"], io, ctx)).toBe(1);
    expect(JSON.parse(output).error.code).toBe("self_chat_not_found");
  });
  it("rejects writes, upstream pass-through and invalid limits before any backend call", async () => {
    const { ctx, calls, operations } = context();
    for (const command of ["send", "edit", "delete", "undo-delete", "draft"]) {
      let output = "";
      expect(
        await main(
          [command],
          {
            stdout: (value) => {
              output = value;
            },
          },
          ctx,
        ),
      ).toBe(1);
      expect(JSON.parse(output).error.code).toBe("write_disabled");
    }
    expect(await main(["teams", "chat", "send"], { stdout: () => undefined }, ctx)).toBe(2);
    expect(await main(["constructor"], { stdout: () => undefined }, ctx)).toBe(2);
    expect(await main(["chats", "--limit", "201"], { stdout: () => undefined }, ctx)).toBe(2);
    expect(await main(["read", SELF_ID, "--last", "0"], { stdout: () => undefined }, ctx)).toBe(2);
    expect(calls).toEqual([]);
    expect(operations).toEqual([]);
  });
  it("reports the search limitation without acquiring credentials or retrying", async () => {
    const { ctx, calls, operations } = context();
    let output = "";
    await main(
      ["search", "synthetic query"],
      {
        stdout: (value) => {
          output = value;
        },
      },
      ctx,
    );
    expect(JSON.parse(output).error.code).toBe("search_unavailable");
    expect(calls).toEqual([]);
    expect(operations).toEqual([]);
  });
});
