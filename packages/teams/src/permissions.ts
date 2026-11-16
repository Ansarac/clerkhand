import { fileURLToPath } from "node:url";
import type { PermissionRules } from "@clerkhand/core";

export const BIN = "clerkhand-teams";
export const SKILL_NAME = "clerkhand-teams";

/**
 * Commands that run without a prompt: they read, or change only the user's own
 * unsent draft, which nobody else sees.
 */
export const ALLOWED_COMMANDS = ["status", "chats", "read", "draft"] as const;

export const PERMISSIONS: PermissionRules = {
  allow: ALLOWED_COMMANDS.map((command) => `Bash(${BIN} ${command} *)`),
  ask: [],
  // Direct driver access would bypass every check in this tool. Rules match
  // command prefixes only; the action policy in the browser is the backstop.
  deny: [
    "Bash(agent-browser *)",
    "Bash(npx agent-browser *)",
    "Bash(pnpm exec agent-browser *)",
    "Bash(pnpm dlx agent-browser *)",
  ],
};

/** The tool skill shipped with this package (works from src/ and dist/). */
export function skillPath(): string {
  return fileURLToPath(new URL(`../skills/${SKILL_NAME}/SKILL.md`, import.meta.url));
}
