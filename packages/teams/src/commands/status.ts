import { type Command, parse } from "../context.js";
import { ensureTeams } from "../teams.js";

export const status: Command = async (args, ctx) => {
  const { values } = parse(args, { options: { headed: { type: "boolean" } } });
  const driver = ctx.driver({ headed: values.headed ?? false });
  const state = await ensureTeams(driver, {
    timeoutMs: 60_000,
    onSignIn: "return",
    ...(ctx.clock ? { clock: ctx.clock } : {}),
  });
  return { ready: state.ready, signedIn: !state.signIn, lang: state.lang };
};
