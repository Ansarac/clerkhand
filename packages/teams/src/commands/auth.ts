import { authStatus, refreshCredential } from "../auth.js";
import { type Command, parse, usage } from "../context.js";
import { loadCredential, withLock } from "../storage.js";

const WAIT_MAX = 300;
const WAIT_DEFAULT = 30;
export const auth: Command = (args, ctx) => {
  const [sub, ...rest] = args;
  const { values, positionals } = parse(rest, {
    allowPositionals: true,
    options: sub === "refresh" ? { headed: { type: "boolean" }, wait: { type: "string" } } : {},
  });
  if (positionals.length > 0 || (sub !== "refresh" && sub !== "status")) {
    throw usage("Usage: clerkhand-teams auth status|refresh [--headed] [--wait N]");
  }
  if (sub === "status") {
    return Promise.resolve(authStatus(loadCredential(ctx.paths.credentialsPath), ctx.now()));
  }
  const waitSeconds = Number(values["wait"] ?? WAIT_DEFAULT);
  if (!Number.isInteger(waitSeconds) || waitSeconds < 1 || waitSeconds > WAIT_MAX) {
    throw usage("--wait must be an integer from 1 to 300 seconds.");
  }
  return withLock(ctx.paths, () =>
    refreshCredential(ctx.paths, { headed: Boolean(values["headed"]), waitSeconds }, ctx),
  );
};
