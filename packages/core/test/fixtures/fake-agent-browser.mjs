// Stand-in for agent-browser: records each call and prints a canned reply.
// FAKE_AB_LOG: file to append {argv, stdin} lines to.
// FAKE_AB_STDOUT: exact stdout to print (default: a success reply).
// FAKE_AB_EXIT: exit code (default 0).
import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

const stdin = readFileSync(0, "utf8");
if (process.env.FAKE_AB_LOG) {
  appendFileSync(
    process.env.FAKE_AB_LOG,
    `${JSON.stringify({ argv: process.argv.slice(2), stdin })}\n`,
  );
}
process.stdout.write(process.env.FAKE_AB_STDOUT ?? '{"success":true,"data":{},"error":null}\n');
process.exitCode = Number(process.env.FAKE_AB_EXIT ?? 0);
