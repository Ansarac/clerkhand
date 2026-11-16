import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findEdge } from "../src/browser.js";

const present =
  (...paths: string[]) =>
  (path: string) =>
    paths.includes(path);

describe("findEdge", () => {
  it("prefers CLERKHAND_BROWSER when it exists", () => {
    expect(
      findEdge({
        env: { CLERKHAND_BROWSER: "/my/edge" },
        platform: "linux",
        exists: present("/my/edge"),
      }),
    ).toBe("/my/edge");
  });

  it("fails when CLERKHAND_BROWSER points nowhere", () => {
    expect(() =>
      findEdge({ env: { CLERKHAND_BROWSER: "/nope" }, platform: "linux", exists: present() }),
    ).toThrow(expect.objectContaining({ code: "browser_not_found" }));
  });

  it("finds Edge under Program Files (x86) on Windows", () => {
    const edge = join("C:/PF86", "Microsoft", "Edge", "Application", "msedge.exe");
    expect(
      findEdge({
        env: { "PROGRAMFILES(X86)": "C:/PF86", PROGRAMFILES: "C:/PF" },
        platform: "win32",
        exists: present(edge),
      }),
    ).toBe(edge);
  });

  it("finds Edge in /Applications on macOS", () => {
    const edge = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    expect(findEdge({ env: {}, platform: "darwin", exists: present(edge) })).toBe(edge);
  });

  it("finds the stable package on Linux", () => {
    expect(
      findEdge({ env: {}, platform: "linux", exists: present("/usr/bin/microsoft-edge-stable") }),
    ).toBe("/usr/bin/microsoft-edge-stable");
  });

  it("explains how to fix a missing browser", () => {
    expect(() => findEdge({ env: {}, platform: "linux", exists: present() })).toThrow(
      /CLERKHAND_BROWSER/u,
    );
  });
});
