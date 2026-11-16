import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALLOWED_COMMANDS, BIN, PERMISSIONS, SKILL_NAME, skillPath } from "../src/permissions.js";
import { ALLOWED_ACTIONS, DRAFT_ACTIONS } from "../src/teams.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
};
const usage = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const skill = readFileSync(skillPath(), "utf8");

describe("permission rules", () => {
  it("allow exactly the read and draft commands, nothing others can see", () => {
    expect(PERMISSIONS.allow).toEqual(ALLOWED_COMMANDS.map((c) => `Bash(${BIN} ${c} *)`));
  });

  it("refer only to commands the CLI has", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(usage).toMatch(new RegExp(`^  ${command}\\b`, "mu"));
    }
  });

  it("deny running agent-browser directly", () => {
    expect(PERMISSIONS.deny).toContain("Bash(agent-browser *)");
  });
});

describe("browser action policy", () => {
  const typing = ["press", "keydown", "keyup", "keyboard", "type", "fill", "inserttext"];

  it("never allows typing or key presses outside drafts", () => {
    for (const action of typing) {
      expect(ALLOWED_ACTIONS).not.toContain(action);
    }
  });

  it("adds only fill for drafts, which presses no keys", () => {
    expect(DRAFT_ACTIONS).toEqual([...ALLOWED_ACTIONS, "fill"]);
  });
});

describe("package", () => {
  it("exposes the bin the permission rules name", () => {
    expect(Object.keys(pkg.bin)).toEqual([BIN]);
  });

  it("ships the skill", () => {
    expect(pkg.files).toContain("skills");
  });
});

describe("tool skill", () => {
  it("is named after the tool", () => {
    expect(skill.startsWith(`---\nname: ${SKILL_NAME}\n`)).toBe(true);
  });

  it("documents every allowed command", () => {
    for (const command of ALLOWED_COMMANDS) {
      expect(skill).toContain(`${BIN} ${command}`);
    }
  });
});
