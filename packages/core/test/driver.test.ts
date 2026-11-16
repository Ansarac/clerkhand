import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDriver, type DriverOptions, pageScript } from "../src/driver.js";
import { ClerkhandError } from "../src/output.js";
import { toolPaths } from "../src/paths.js";

const fake = fileURLToPath(new URL("fixtures/fake-agent-browser.mjs", import.meta.url));

let log: string;
let options: DriverOptions;

beforeEach(() => {
  const paths = toolPaths("demo");
  log = join(paths.root, "calls.jsonl");
  vi.stubEnv("FAKE_AB_LOG", log);
  options = {
    ...paths,
    session: "clerkhand-demo",
    executablePath: "/edge",
    allowedActions: ["navigate", "evaluate"],
    command: [process.execPath, fake],
  };
});

function calls(): { argv: string[]; stdin: string }[] {
  return readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("createDriver", () => {
  it("writes a deny-by-default action policy with only the allowed actions", () => {
    createDriver(options);
    expect(JSON.parse(readFileSync(options.policyPath, "utf8"))).toEqual({
      default: "deny",
      allow: ["navigate", "evaluate"],
    });
  });

  it("writes an empty agent-browser config so user config is never loaded", () => {
    createDriver(options);
    expect(JSON.parse(readFileSync(options.configPath, "utf8"))).toEqual({});
  });

  it("passes the session, profile, browser, policy and config on every call", async () => {
    await createDriver(options).run(["open", "https://example.test/"]);
    const [call] = calls();
    expect(call?.argv).toEqual([
      "--config",
      options.configPath,
      "--session",
      "clerkhand-demo",
      "--profile",
      options.profileDir,
      "--executable-path",
      "/edge",
      "--action-policy",
      options.policyPath,
      "--json",
      "open",
      "https://example.test/",
    ]);
  });

  it("adds --headed only when asked", async () => {
    await createDriver({ ...options, headed: true }).run(["close"]);
    expect(calls()[0]?.argv).toContain("--headed");
  });

  it("returns the data of a successful reply", async () => {
    vi.stubEnv("FAKE_AB_STDOUT", '{"success":true,"data":{"closed":true},"error":null}');
    await expect(createDriver(options).run(["close"])).resolves.toEqual({ closed: true });
  });

  it("ignores warning lines before the JSON reply", async () => {
    vi.stubEnv("FAKE_AB_STDOUT", '⚠ something changed\n{"success":true,"data":1,"error":null}\n');
    await expect(createDriver(options).run(["close"])).resolves.toBe(1);
  });

  it("turns a failed reply into a browser_error", async () => {
    vi.stubEnv(
      "FAKE_AB_STDOUT",
      '{"success":false,"data":null,"error":"Action \'press\' denied by policy"}',
    );
    await expect(createDriver(options).run(["press", "Enter"])).rejects.toMatchObject({
      code: "browser_error",
      message: "Action 'press' denied by policy",
    });
  });

  it("reports output that is not a reply", async () => {
    vi.stubEnv("FAKE_AB_STDOUT", "boom");
    vi.stubEnv("FAKE_AB_EXIT", "3");
    const error = await createDriver(options)
      .run(["close"])
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClerkhandError);
    expect((error as ClerkhandError).message).toContain("exit 3");
  });

  it("sends page functions through stdin and unwraps their result", async () => {
    vi.stubEnv(
      "FAKE_AB_STDOUT",
      JSON.stringify({ success: true, data: { result: '{"value":[1,2]}' }, error: null }),
    );
    const add = (n: number) => [n, n + 1];
    await expect(createDriver(options).evaluate(add, 1)).resolves.toEqual([1, 2]);
    const [call] = calls();
    expect(call?.argv.slice(-2)).toEqual(["eval", "--stdin"]);
    expect(call?.stdin).toBe(pageScript(add, 1));
  });
});

describe("pageScript", () => {
  it("evaluates to the JSON-wrapped result of the function", async () => {
    const script = pageScript((n: number) => ({ doubled: n * 2 }), 21);
    // biome-ignore lint/security/noGlobalEval: verifying the exact script the browser runs.
    const json = await eval(script);
    expect(JSON.parse(json)).toEqual({ value: { doubled: 42 } });
  });

  it("awaits async functions and keeps undefined results", async () => {
    const script = pageScript(async () => undefined, undefined);
    // biome-ignore lint/security/noGlobalEval: verifying the exact script the browser runs.
    expect(JSON.parse(await eval(script))).toEqual({});
  });
});
