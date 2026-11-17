import { fileURLToPath } from "node:url";
import type { PermissionRules } from "@clerkhand/core";

export const BIN = "clerkhand-teams";
export const SKILL_NAME = "clerkhand-teams";
export const ALLOWED_COMMANDS = [
  "auth status",
  "auth refresh",
  "status",
  "whoami",
  "chats",
  "read",
] as const;
export const DISABLED_COMMANDS = ["draft", "send", "edit", "delete", "undo-delete"] as const;

/** Prefix rules are a cooperative agent boundary; arbitrary shell/code access requires a sandbox. */
export const PERMISSIONS: PermissionRules = {
  allow: ALLOWED_COMMANDS.map((command) => `Bash(${BIN} ${command} *)`),
  ask: [],
  deny: [
    ...DISABLED_COMMANDS.map((command) => `Bash(${BIN} ${command} *)`),
    // The browser driver can reach the authenticated profile; only clerkhand may run it.
    ...["", "npx ", "pnpm exec ", "pnpm dlx ", "npm exec ", "bunx "].map(
      (runner) => `Bash(${runner}agent-browser *)`,
    ),
    "Bash(node *agent-browser*)",
  ],
};
export function skillPath(): string {
  return fileURLToPath(new URL(`../skills/${SKILL_NAME}/SKILL.md`, import.meta.url));
}
