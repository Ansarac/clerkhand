#!/usr/bin/env node
import { homedir } from "node:os";
import process from "node:process";
import { createDriver, findEdge } from "@clerkhand/core";
import { profileBusy, sleep } from "./auth.js";
import { main } from "./main.js";
import { createMessenger } from "./messenger.js";
import { authPaths } from "./storage.js";

const paths = authPaths();
process.exitCode = await main(
  process.argv.slice(2),
  { stdout: (text) => process.stdout.write(`${text}\n`) },
  {
    paths,
    home: homedir(),
    cwd: process.cwd(),
    now: Date.now,
    sleep,
    profileBusy,
    messenger: (operation, configDir) => createMessenger()(operation, configDir),
    driver: (headed) =>
      createDriver({
        ...paths,
        executablePath: findEdge(),
        allowedActions: [
          "navigate",
          "reload",
          "requests",
          "request_detail",
          "evaluate",
          "wait",
          "close",
        ],
        headed,
      }),
  },
);
