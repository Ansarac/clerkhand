import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { dataHome, toolPaths } from "../src/paths.js";

describe("dataHome", () => {
  const home = join("/", "home", "u");

  it("prefers CLERKHAND_HOME over the platform default", () => {
    expect(dataHome({ env: { CLERKHAND_HOME: "/x" }, platform: "win32", home })).toBe("/x");
  });

  it("uses LOCALAPPDATA on Windows", () => {
    expect(dataHome({ env: { LOCALAPPDATA: "/la" }, platform: "win32", home })).toBe(
      join("/la", "clerkhand"),
    );
  });

  it("uses Application Support on macOS", () => {
    expect(dataHome({ env: {}, platform: "darwin", home })).toBe(
      join(home, "Library", "Application Support", "clerkhand"),
    );
  });

  it("uses XDG_DATA_HOME on Linux when set", () => {
    expect(dataHome({ env: { XDG_DATA_HOME: "/xdg" }, platform: "linux", home })).toBe(
      join("/xdg", "clerkhand"),
    );
  });

  it("falls back to ~/.local/share on Linux", () => {
    expect(dataHome({ env: {}, platform: "linux", home })).toBe(
      join(home, ".local", "share", "clerkhand"),
    );
  });

  it("is isolated to a temporary directory during tests", () => {
    expect(process.env["CLERKHAND_HOME"]).toBeTruthy();
    expect(dataHome()).toBe(process.env["CLERKHAND_HOME"]);
  });
});

describe("toolPaths", () => {
  it("keeps each tool's profile, policy and config under its own directory", () => {
    const paths = toolPaths("teams", { env: { CLERKHAND_HOME: "/data" } });
    expect(paths).toEqual({
      root: join("/data", "teams"),
      profileDir: join("/data", "teams", "profile"),
      policyPath: join("/data", "teams", "action-policy.json"),
      configPath: join("/data", "teams", "agent-browser.json"),
    });
  });
});
