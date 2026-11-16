import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { beforeEach, describe, expect, it } from "vitest";
import { type ClaudeSetupOptions, setupClaude } from "../src/claude.js";

let options: ClaudeSetupOptions;
let settingsPath: string;
let skillPath: string;

beforeEach(() => {
  const root = process.env["CLERKHAND_HOME"] ?? "";
  options = {
    scope: "user",
    home: join(root, "home"),
    cwd: join(root, "project"),
    rules: { allow: ["Bash(tool read *)"], ask: ["Bash(tool send *)"], deny: ["Bash(driver *)"] },
    skillName: "tool",
    skillContent: "# tool\n",
    write: false,
  };
  settingsPath = join(options.home, ".claude", "settings.json");
  skillPath = join(options.home, ".claude", "skills", "tool", "SKILL.md");
});

function writeSettings(value: unknown): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(value));
}

describe("setupClaude", () => {
  it("reports every rule and the skill as new without touching disk by default", () => {
    const report = setupClaude(options);
    expect(report).toEqual({
      settingsPath,
      added: options.rules,
      skill: { path: skillPath, status: "create" },
      written: false,
    });
    expect(existsSync(settingsPath)).toBe(false);
    expect(existsSync(skillPath)).toBe(false);
  });

  it("writes the rules and the skill with --write", () => {
    setupClaude({ ...options, write: true });
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({ permissions: options.rules });
    expect(readFileSync(skillPath, "utf8")).toBe("# tool\n");
  });

  it("keeps existing settings and rules and only adds missing ones", () => {
    writeSettings({
      model: "x",
      permissions: { allow: ["Bash(ls *)", "Bash(tool read *)"], defaultMode: "plan" },
    });
    const report = setupClaude({ ...options, write: true });
    expect(report.added.allow).toEqual([]);
    expect(JSON.parse(readFileSync(settingsPath, "utf8"))).toEqual({
      model: "x",
      permissions: {
        allow: ["Bash(ls *)", "Bash(tool read *)"],
        defaultMode: "plan",
        ask: ["Bash(tool send *)"],
        deny: ["Bash(driver *)"],
      },
    });
  });

  it("reports nothing to add on a second run", () => {
    setupClaude({ ...options, write: true });
    const report = setupClaude(options);
    expect(report.added).toEqual({ allow: [], ask: [], deny: [] });
    expect(report.skill.status).toBe("unchanged");
  });

  it("marks a changed skill for update", () => {
    setupClaude({ ...options, write: true });
    expect(setupClaude({ ...options, skillContent: "# v2\n" }).skill.status).toBe("update");
  });

  it("uses the project directory for project scope", () => {
    const report = setupClaude({ ...options, scope: "project" });
    expect(report.settingsPath).toBe(join(options.cwd, ".claude", "settings.json"));
    expect(report.skill.path).toBe(join(options.cwd, ".claude", "skills", "tool", "SKILL.md"));
  });

  it("refuses to touch settings that are not valid JSON", () => {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, "{ nope");
    expect(() => setupClaude({ ...options, write: true })).toThrow(
      expect.objectContaining({ code: "invalid_settings" }),
    );
    expect(readFileSync(settingsPath, "utf8")).toBe("{ nope");
  });

  it("refuses rule lists that are not string arrays", () => {
    writeSettings({ permissions: { deny: "Bash(x)" } });
    expect(() => setupClaude(options)).toThrow(
      expect.objectContaining({ code: "invalid_settings" }),
    );
  });
});
