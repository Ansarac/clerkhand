import { ClerkhandError } from "@clerkhand/core";
import { type Command, parse } from "../context.js";
import { ensureTeams } from "../teams.js";

const LOGIN_TIMEOUT_MS = 300_000;

/** Opens a visible browser so the user can sign in; later commands run headless. */
export const login: Command = async (args, ctx) => {
  parse(args, { options: {} });
  // A running headless session would be reused; start over with a window.
  await ctx
    .driver({ headed: false })
    .run(["close"])
    .catch(() => undefined);

  const driver = ctx.driver({ headed: true });
  const state = await ensureTeams(driver, {
    timeoutMs: LOGIN_TIMEOUT_MS,
    onSignIn: "wait",
    ...(ctx.clock ? { clock: ctx.clock } : {}),
  });
  if (!state.ready) {
    throw new ClerkhandError("login_timeout", "Sign-in did not finish within 5 minutes.");
  }
  await driver.run(["close"]);
  return { signedIn: true };
};
