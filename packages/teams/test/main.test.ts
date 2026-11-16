import { describe, expect, it } from "vitest";
import { main } from "../src/main.js";

function run(argv: string[]) {
  const out: string[] = [];
  const code = main(argv, { stdout: (text) => out.push(text) });
  return { code, out: out.join("\n") };
}

describe("main", () => {
  it("prints usage and exits 0 without arguments", () => {
    const { code, out } = run([]);
    expect(code).toBe(0);
    expect(out).toContain("Usage: clerkhand-teams");
  });

  it("reports an unknown command as a JSON error with exit code 2", () => {
    const { code, out } = run(["nope"]);
    expect(code).toBe(2);
    expect(JSON.parse(out)).toEqual({
      ok: false,
      error: { code: "unknown_command", message: "Unknown command: nope" },
    });
  });
});
