import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHANGESET = /^---\n(?:"@clerkhand\/[a-z]+": (?:major|minor|patch)\n)+---\n\n\S/u;

describe("changesets", () => {
  it("keeps the front matter changesets can parse", () => {
    // A Markdown formatter once rewrote it into headings, which broke versioning.
    const dir = new URL("../../../.changeset/", import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md")) {
      expect(readFileSync(new URL(file, dir), "utf8"), file).toMatch(CHANGESET);
    }
  });
});

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

describe("dependencies", () => {
  it("pins agent-browser to an exact version", () => {
    // 0.x releases change behavior (e.g. policy matching) without notice.
    expect(pkg.dependencies["agent-browser"]).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
