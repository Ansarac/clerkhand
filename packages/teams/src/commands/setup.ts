import { readFileSync } from "node:fs";
import { type ClaudeScope, setupClaude } from "@clerkhand/core";
import { type Command, parse, usage } from "../context.js";
import { PERMISSIONS, SKILL_NAME, skillPath } from "../permissions.js";

export const setup: Command = (args, ctx) => {
  const { values, positionals } = parse(args, {
    allowPositionals: true,
    options: { scope: { type: "string" }, write: { type: "boolean" } },
  });
  if (positionals.length !== 1 || positionals[0] !== "claude") {
    throw usage("Usage: clerkhand-teams setup claude [--scope user|project] [--write]");
  }
  const scope = values.scope ?? "user";
  if (scope !== "user" && scope !== "project") {
    throw usage(`--scope must be "user" or "project", got "${scope}".`);
  }
  return Promise.resolve(
    setupClaude({
      scope: scope satisfies ClaudeScope,
      home: ctx.home,
      cwd: ctx.cwd,
      rules: PERMISSIONS,
      skillName: SKILL_NAME,
      skillContent: readFileSync(skillPath(), "utf8"),
      write: values.write ?? false,
    }),
  );
};
