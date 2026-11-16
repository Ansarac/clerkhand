import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ClerkhandError } from "./output.js";

export interface FindEdgeOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
}

/** Locates Microsoft Edge. `CLERKHAND_BROWSER` overrides the search. */
export function findEdge(options: FindEdgeOptions = {}): string {
  // biome-ignore lint/style/noProcessEnv: default for the injectable env; callers and tests pass their own.
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;

  const override = env["CLERKHAND_BROWSER"];
  if (override) {
    if (!exists(override)) {
      throw new ClerkhandError(
        "browser_not_found",
        `CLERKHAND_BROWSER does not exist: ${override}`,
      );
    }
    return override;
  }

  const found = edgeCandidates(env, platform).find(exists);
  if (!found) {
    throw new ClerkhandError(
      "browser_not_found",
      "Microsoft Edge not found. Install it or set CLERKHAND_BROWSER to its executable.",
    );
  }
  return found;
}

function edgeCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  switch (platform) {
    case "win32": {
      const suffix = join("Microsoft", "Edge", "Application", "msedge.exe");
      return [env["PROGRAMFILES(X86)"], env["PROGRAMFILES"], env["LOCALAPPDATA"]]
        .filter((dir): dir is string => Boolean(dir))
        .map((dir) => join(dir, suffix));
    }
    case "darwin":
      return ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"];
    default:
      return [
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable",
        "/opt/microsoft/msedge/msedge",
      ];
  }
}
