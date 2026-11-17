import { type ParseArgsConfig, parseArgs } from "node:util";
import { ClerkhandError, EXIT_USAGE } from "@clerkhand/core";
import type { AuthDependencies } from "./auth.js";
import type { AuthPaths } from "./storage.js";

export interface Context extends AuthDependencies {
  paths: AuthPaths;
  home: string;
  cwd: string;
}
export type Command = (args: string[], ctx: Context) => Promise<unknown>;
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
const MAX_RESULTS = 200;
export function limit(value: string | undefined, fallback = 20): number {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_RESULTS) {
    throw usage("Limit must be an integer from 1 to 200.");
  }
  return n;
}
