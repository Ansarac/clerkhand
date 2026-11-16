#!/usr/bin/env node
import process from "node:process";
import { main } from "./main.js";

process.exitCode = main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(`${text}\n`),
});
