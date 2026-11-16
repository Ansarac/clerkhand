import { type ParseArgsConfig, parseArgs } from "node:util";
import { ClerkhandError, type Driver, EXIT_USAGE } from "@clerkhand/core";
import type { Clock } from "./teams.js";

export interface Context {
  /**
   * Creates the browser driver; only commands that need the browser call it.
   * `fill` additionally allows filling a field; only `draft` and `edit` ask for it.
   */
  driver: (options: { headed: boolean; fill?: boolean }) => Driver;
  home: string;
  cwd: string;
  clock?: Clock;
}

export type Command = (args: string[], ctx: Context) => Promise<unknown>;

/** `parseArgs` with usage errors mapped to exit code 2. */
export function parse<T extends ParseArgsConfig>(args: string[], config: T) {
  try {
    return parseArgs({ ...config, args, strict: true });
  } catch (error) {
    throw usage((error as Error).message);
  }
}

export function usage(message: string): ClerkhandError {
  return new ClerkhandError("usage", message, { exitCode: EXIT_USAGE });
}

export function positiveInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw usage(`${name} must be a positive integer, got "${value}".`);
  }
  return n;
}
