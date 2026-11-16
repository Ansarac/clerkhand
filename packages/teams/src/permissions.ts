import { fileURLToPath } from "node:url";
import type { PermissionRules } from "@clerkhand/core";

export const BIN = "clerkhand-teams";
export const SKILL_NAME = "clerkhand-teams";

/** Commands that only read. They run without a prompt. */
export const READ_COMMANDS = ["status", "chats", "read"] as const;

export const PERMISSIONS: PermissionRules = {
  allow: READ_COMMANDS.map((command) => `Bash(${BIN} ${command} *)`),
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
