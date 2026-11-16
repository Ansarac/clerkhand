import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";

export interface DataHomeOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
}

/**
 * Root directory for clerkhand data (browser profiles, rules, state).
 * `CLERKHAND_HOME` wins; otherwise the platform convention is used.
 */
export function dataHome(options: DataHomeOptions = {}): string {
  // biome-ignore lint/style/noProcessEnv: default for the injectable env; callers and tests pass their own.
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();

  const override = env["CLERKHAND_HOME"];
  if (override) {
    return override;
  }

  switch (platform) {
    case "win32":
      return join(env["LOCALAPPDATA"] ?? join(home, "AppData", "Local"), "clerkhand");
    case "darwin":
      return join(home, "Library", "Application Support", "clerkhand");
    default:
      return join(env["XDG_DATA_HOME"] ?? join(home, ".local", "share"), "clerkhand");
  }
}

export interface ToolPaths {
  /** Per-tool data directory. */
  root: string;
  /** Browser profile; holds the login session. */
  profileDir: string;
  /** agent-browser action policy, rewritten on every run. */
  policyPath: string;
  /** agent-browser config, so user-level config never leaks in. */
  configPath: string;
}

export function toolPaths(tool: string, options: DataHomeOptions = {}): ToolPaths {
  const root = join(dataHome(options), tool);
  return {
    root,
    profileDir: join(root, "profile"),
    policyPath: join(root, "action-policy.json"),
    configPath: join(root, "agent-browser.json"),
  };
}
