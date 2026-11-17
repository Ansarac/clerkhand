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
  /** Exact obsolete rules owned by this tool; preserve every other setting. */
  retiredRules?: readonly string[];
}

export interface ClaudeSetupReport {
  settingsPath: string;
  added: { allow: string[]; ask: string[]; deny: string[] };
  skill: { path: string; status: "create" | "update" | "unchanged" };
  written: boolean;
  removed?: { allow: string[]; ask: string[]; deny: string[] };
}

type Settings = Record<string, unknown> & {
  permissions?: Record<string, unknown>;
};

/** Adds current rules and installs the skill; removes only explicitly retired tool rules. */
export function setupClaude(options: ClaudeSetupOptions): ClaudeSetupReport {
  const base = options.scope === "user" ? options.home : options.cwd;
  const settingsPath = join(base, ".claude", "settings.json");
  const skillPath = join(base, ".claude", "skills", options.skillName, "SKILL.md");

  const settings = readSettings(settingsPath);
  const permissions = { ...(settings.permissions ?? {}) };
  const { added, removed } = updateRules(permissions, settingsPath, options);

  const currentSkill = existsSync(skillPath) ? readFileSync(skillPath, "utf8") : undefined;
  let skillStatus: ClaudeSetupReport["skill"]["status"] = "update";
  if (currentSkill === undefined) {
    skillStatus = "create";
  } else if (currentSkill === options.skillContent) {
    skillStatus = "unchanged";
  }

  if (options.write) {
    const changed =
      Object.values(added).some((rules) => rules.length > 0) ||
      Object.values(removed).some((rules) => rules.length > 0);
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
    ...(options.retiredRules ? { removed } : {}),
  };
}

function updateRules(
  permissions: Record<string, unknown>,
  settingsPath: string,
  options: ClaudeSetupOptions,
) {
  const added = { allow: [] as string[], ask: [] as string[], deny: [] as string[] };
  const removed = { allow: [] as string[], ask: [] as string[], deny: [] as string[] };
  for (const kind of ["allow", "ask", "deny"] as const) {
    const previous = ruleList(permissions[kind], settingsPath, kind);
    const retired = kind === "deny" ? [] : (options.retiredRules ?? []);
    removed[kind] = previous.filter((rule) => retired.includes(rule));
    const current = previous.filter((rule) => !removed[kind].includes(rule));
    const missing = options.rules[kind].filter((rule) => !current.includes(rule));
    added[kind] = missing;
    if (missing.length > 0 || removed[kind].length > 0) {
      permissions[kind] = [...current, ...missing];
    }
  }

  return { added, removed };
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
