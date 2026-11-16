#!/usr/bin/env node
import { homedir } from "node:os";
import process from "node:process";
import { createDriver, findEdge, toolPaths } from "@clerkhand/core";
import { main } from "./main.js";
import { ALLOWED_ACTIONS, DRAFT_ACTIONS, SESSION } from "./teams.js";

process.exitCode = await main(
  process.argv.slice(2),
  { stdout: (text) => process.stdout.write(`${text}\n`) },
  {
    driver: ({ headed, fill }) =>
      createDriver({
        ...toolPaths("teams"),
        session: SESSION,
        executablePath: findEdge(),
        allowedActions: fill ? DRAFT_ACTIONS : ALLOWED_ACTIONS,
        headed,
      }),
    home: homedir(),
    cwd: process.cwd(),
  },
);
