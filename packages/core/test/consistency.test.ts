import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

describe("dependencies", () => {
  it("pins agent-browser to an exact version", () => {
    // 0.x releases change behavior (e.g. policy matching) without notice.
    expect(pkg.dependencies["agent-browser"]).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
