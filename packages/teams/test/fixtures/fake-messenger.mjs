import { appendFileSync } from "node:fs";
import process from "node:process";

const log = process.env["FAKE_MESSENGER_LOG"];
if (log) {
  appendFileSync(
    log,
    `${JSON.stringify({ argv: process.argv.slice(2), configDir: process.env["AGENT_MESSENGER_CONFIG_DIR"] })}\n`,
  );
}
process.stdout.write(process.env["FAKE_MESSENGER_STDOUT"] ?? "[]");
process.stderr.write(process.env["FAKE_MESSENGER_STDERR"] ?? "");
process.exitCode = Number(process.env["FAKE_MESSENGER_EXIT"] ?? 0);
