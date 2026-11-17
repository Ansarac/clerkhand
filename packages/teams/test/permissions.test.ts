import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../src/permissions.js";

describe("migration permissions", () => {
  it("keeps repository permissions aligned with the installed rules", () => {
    const settings = JSON.parse(
      readFileSync(new URL("../../../.claude/settings.json", import.meta.url), "utf8"),
    );
    for (const kind of ["allow", "ask", "deny"] as const) {
      expect(settings.permissions[kind]).toHaveLength(PERMISSIONS[kind].length);
      expect(settings.permissions[kind]).toEqual(expect.arrayContaining([...PERMISSIONS[kind]]));
    }
  });
  it("pins the upstream runtime dependency", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.dependencies["agent-messenger"]).toBe("2.43.0");
  });
});
