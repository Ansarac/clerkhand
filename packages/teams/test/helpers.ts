import type { Driver, PageFunction } from "@clerkhand/core";
import type { Clock } from "../src/teams.js";

/**
 * Rebuilds a page function from its source, the way the browser receives it.
 * Any reference to module scope fails here instead of in the browser.
 */
export function inPage<F extends PageFunction<never, unknown>>(fn: F): F {
  // Global scope only, like the page: no access to this module's bindings.
  return new Function(`return (${fn.toString()});`)() as F;
}

type Handler = (fn: PageFunction<never, unknown>, arg: unknown) => unknown;

/** A driver that answers page functions from `handler` and records run() calls. */
export function fakeDriver(handler: Handler): Driver & { runs: string[][] } {
  const runs: string[][] = [];
  return {
    runs,
    run: (args) => {
      runs.push([...args]);
      return Promise.resolve({});
    },
    evaluate: <A, R>(fn: PageFunction<A, R>, arg: A) =>
      Promise.resolve(handler(fn as PageFunction<never, unknown>, arg) as R),
  };
}

/** A clock that advances only when slept on. */
export function fakeClock(): Clock {
  let now = 0;
  return {
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
  };
}
