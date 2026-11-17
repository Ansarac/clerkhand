import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createMessenger,
  messengerArgs,
  parseMessengerResult,
  type ReadOperation,
} from "../src/messenger.js";
import { authPaths } from "../src/storage.js";

const fake = fileURLToPath(new URL("fixtures/fake-messenger.mjs", import.meta.url));
describe("upstream subprocess boundary", () => {
  it("passes IDs as literal arguments and isolates the config directory without token arguments", async () => {
    const paths = authPaths();
    const log = join(process.env["CLERKHAND_HOME"] ?? "", "calls.jsonl");
    vi.stubEnv("FAKE_MESSENGER_LOG", log);
    vi.stubEnv("AGENT_MESSENGER_CONFIG_DIR", "/unrelated-user-config");
    await createMessenger([process.execPath, fake])(
      { kind: "history", chatId: "--synthetic;echo unsafe", limit: 20 },
      paths.configDir,
    );
    const call = JSON.parse(readFileSync(log, "utf8"));
    expect(call.argv).toEqual([
      "teams",
      "chat",
      "history",
      "--limit",
      "20",
      "--",
      "--synthetic;echo unsafe",
    ]);
    expect(call.configDir).toBe(paths.configDir);
    expect(call.argv).not.toContain("--token");
    expect(process.env["AGENT_MESSENGER_CONFIG_DIR"]).toBe("/unrelated-user-config");
  });
  it("refuses operations outside the read allowlist", () => {
    expect(() => messengerArgs({ kind: "send" } as unknown as ReadOperation)).toThrow(
      expect.objectContaining({ code: "write_disabled" }),
    );
  });
  it("recognizes only explicit authentication errors and suppresses raw diagnostics", () => {
    expect(() =>
      parseMessengerResult({
        code: 1,
        stdout: "",
        stderr: JSON.stringify({ code: "http_401", error: "synthetic-secret" }),
      }),
    ).toThrow(expect.objectContaining({ code: "authentication_failed" }));
    expect(() =>
      parseMessengerResult({
        code: 1,
        stdout: "",
        stderr: JSON.stringify({ code: "rate_limited", error: "synthetic-secret" }),
      }),
    ).toThrow(expect.objectContaining({ code: "messenger_error" }));
    expect(() => parseMessengerResult({ code: 1, stdout: "synthetic-secret", stderr: "" })).toThrow(
      expect.not.objectContaining({ message: expect.stringContaining("synthetic-secret") }),
    );
  });
});
