import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { Driver } from "@clerkhand/core";
import { describe, expect, it } from "vitest";
import type { Context } from "../src/context.js";
import { main } from "../src/main.js";
import type { Chat } from "../src/page/chats.js";
import { listChats } from "../src/page/chats.js";
import { readPageState } from "../src/page/state.js";
import { TEAMS_URL } from "../src/teams.js";
import { fakeClock, fakeDriver } from "./helpers.js";

const CHATS: Chat[] = [
  {
    id: "19:a@thread.v2",
    name: "Alpha",
    kind: "group",
    folder: "Favorites",
    unread: true,
    muted: false,
  },
  {
    id: "48:notes",
    name: "Me (You)",
    kind: "self",
    folder: "RecentChats",
    unread: false,
    muted: false,
  },
  {
    id: "19:b@thread.v2",
    name: "Beta",
    kind: "group",
    folder: "RecentChats",
    unread: true,
    muted: true,
  },
];

function teamsDriver(): Driver {
  return fakeDriver((fn) => {
    if (fn === readPageState) {
      return { url: TEAMS_URL, signIn: false, ready: true, lang: "en-US", openChatId: null };
    }
    if (fn === listChats) {
      return CHATS;
    }
    throw new Error("unexpected page function");
  });
}

function context(driver: () => Driver = teamsDriver): Context {
  const root = process.env["CLERKHAND_HOME"] ?? "";
  return { driver, home: join(root, "home"), cwd: join(root, "project"), clock: fakeClock() };
}

async function run(argv: string[], ctx: Context = context()) {
  const out: string[] = [];
  const code = await main(argv, { stdout: (text) => out.push(text) }, ctx);
  return { code, out: out.join("\n") };
}

const noBrowser = () => {
  throw new Error("must not start a browser");
};

describe("main", () => {
  it("prints usage and exits 0 without arguments", async () => {
    const { code, out } = await run([]);
    expect(code).toBe(0);
    expect(out).toContain("Usage: clerkhand-teams");
  });

  it("reports an unknown command as a usage error with exit code 2", async () => {
    const { code, out } = await run(["nope"]);
    expect(code).toBe(2);
    expect(JSON.parse(out).error.code).toBe("usage");
  });

  it("rejects unknown options as usage errors", async () => {
    const { code } = await run(["chats", "--bogus"]);
    expect(code).toBe(2);
  });
});

describe("chats", () => {
  it("lists all chats", async () => {
    const { code, out } = await run(["chats"]);
    expect(code).toBe(0);
    expect(JSON.parse(out)).toEqual({ ok: true, data: { chats: CHATS } });
  });

  it("filters unread chats and applies the limit", async () => {
    const { out } = await run(["chats", "--unread", "--limit", "1"]);
    expect(JSON.parse(out).data.chats.map((c: Chat) => c.name)).toEqual(["Alpha"]);
  });

  it("rejects a limit that is not a positive integer", async () => {
    const { code, out } = await run(["chats", "--limit", "0"]);
    expect(code).toBe(2);
    expect(JSON.parse(out).error.message).toContain("--limit");
  });
});

describe("read", () => {
  it("requires exactly one chat", async () => {
    expect((await run(["read"], context(noBrowser))).code).toBe(2);
    expect((await run(["read", "a", "b"], context(noBrowser))).code).toBe(2);
  });

  it("reports an unknown chat with candidates instead of guessing", async () => {
    const { code, out } = await run(["read", "Alph"]);
    expect(code).toBe(1);
    expect(JSON.parse(out).error).toMatchObject({
      code: "chat_not_found",
      details: { candidates: [{ id: "19:a@thread.v2", name: "Alpha", kind: "group" }] },
    });
  });
});

describe("setup claude", () => {
  it("shows the changes without writing or starting a browser", async () => {
    const ctx = context(noBrowser);
    const { code, out } = await run(["setup", "claude"], ctx);
    expect(code).toBe(0);
    const report = JSON.parse(out).data;
    expect(report.written).toBe(false);
    expect(report.added.allow).toContain("Bash(clerkhand-teams read *)");
    expect(report.added.deny).toContain("Bash(agent-browser *)");
    expect(existsSync(report.settingsPath)).toBe(false);
  });

  it("writes user settings and the skill with --write", async () => {
    const ctx = context(noBrowser);
    const { out } = await run(["setup", "claude", "--write"], ctx);
    const report = JSON.parse(out).data;
    expect(report.settingsPath).toBe(join(ctx.home, ".claude", "settings.json"));
    expect(readFileSync(report.skill.path, "utf8")).toContain("name: clerkhand-teams");
  });

  it("rejects an unknown scope or target", async () => {
    expect((await run(["setup", "claude", "--scope", "global"], context(noBrowser))).code).toBe(2);
    expect((await run(["setup", "cursor"], context(noBrowser))).code).toBe(2);
  });
});
