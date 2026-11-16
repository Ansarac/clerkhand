import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ClerkhandError } from "./output.js";

export interface PermissionRules {
  allow: readonly string[];
  ask: readonly string[];
  deny: readonly string[];
}

export type ClaudeScope = "user" | "project";

export interface ClaudeSetupOptions {
  scope: ClaudeScope;
  home: string;
  cwd: string;
  rules: PermissionRules;
  skillName: string;
  skillContent: string;
  /** Without `write`, only report what would change. */
  write: boolean;
}

export interface ClaudeSetupReport {
  settingsPath: string;
  added: { allow: string[]; ask: string[]; deny: string[] };
  skill: { path: string; status: "create" | "update" | "unchanged" };
  written: boolean;
}

type Settings = Record<string, unknown> & {
  permissions?: Record<string, unknown>;
};

/** Adds missing permission rules and installs the skill. Never removes existing rules. */
export function setupClaude(options: ClaudeSetupOptions): ClaudeSetupReport {
  const base = options.scope === "user" ? options.home : options.cwd;
  const settingsPath = join(base, ".claude", "settings.json");
  const skillPath = join(base, ".claude", "skills", options.skillName, "SKILL.md");

  const settings = readSettings(settingsPath);
  const permissions = { ...(settings.permissions ?? {}) };
  const added = { allow: [] as string[], ask: [] as string[], deny: [] as string[] };
  for (const kind of ["allow", "ask", "deny"] as const) {
    const current = ruleList(permissions[kind], settingsPath, kind);
    const missing = options.rules[kind].filter((rule) => !current.includes(rule));
    added[kind] = missing;
    if (missing.length > 0) {
      permissions[kind] = [...current, ...missing];
    }
  }

  const currentSkill = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : undefined;
  let skillStatus: ClaudeSetupReport["skill"]["status"] = "update";
  if (currentSkill === undefined) {
    skillStatus = "create";
  } else if (currentSkill === options.skillContent) {
    skillStatus = "unchanged";
  }

  if (options.write) {
    const changed = added.allow.length + added.ask.length + added.deny.length > 0;
    if (changed) {
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, `${JSON.stringify({ ...settings, permissions }, null, 2)}\n`);
    }
    if (skillStatus !== "unchanged") {
      mkdirSync(dirname(skillPath), { recursive: true });
      writeFileSync(skillPath, options.skillContent);
    }
  }

  return {
    settingsPath,
    added,
    skill: { path: skillPath, status: skillStatus },
    written: options.write,
  };
}

function readSettings(path: string): Settings {
  if (!existsSync(path)) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: ClerkhandError takes the cause in its third argument.
    throw new ClerkhandError(
      "invalid_settings",
      `Cannot parse ${path}: ${(error as Error).message}. Fix it first; nothing was changed.`,
      { cause: error },
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ClerkhandError("invalid_settings", `${path} is not a JSON object.`);
  }
  return parsed as Settings;
}

function ruleList(value: unknown, path: string, kind: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!(Array.isArray(value) && value.every((v) => typeof v === "string"))) {
    throw new ClerkhandError(
      "invalid_settings",
      `permissions.${kind} in ${path} is not a list of strings.`,
    );
  }
  return value;
}
