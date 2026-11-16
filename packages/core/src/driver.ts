import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { ClerkhandError } from "./output.js";

const DEFAULT_TIMEOUT_MS = 60_000;

export interface DriverOptions {
  /** agent-browser session name; one per tool. */
  session: string;
  profileDir: string;
  executablePath: string;
  policyPath: string;
  configPath: string;
  /** Action names the browser may perform; everything else is denied. */
  allowedActions: readonly string[];
  headed?: boolean;
  /** Program and leading args that start agent-browser. Defaults to the bundled copy. */
  command?: readonly string[];
  timeoutMs?: number;
}

/** A function that runs inside the page. It must not reference anything outside its own body. */
export type PageFunction<A, R> = (arg: A) => R | Promise<R>;

export interface Driver {
  /** Runs an agent-browser command and returns its `data`. */
  run: (args: readonly string[], options?: { stdin?: string }) => Promise<unknown>;
  /** Serializes `fn` into the page, calls it with `arg`, and returns its JSON result. */
  evaluate: <A, R>(fn: PageFunction<A, R>, arg: A) => Promise<R>;
}

/** Builds the script that `evaluate` sends to the page. */
export function pageScript<A, R>(fn: PageFunction<A, R>, arg: A): string {
  return `(async () => JSON.stringify({ value: await (${fn.toString()})(${JSON.stringify(arg) ?? "undefined"}) }))()`;
}

export function bundledAgentBrowser(): string[] {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("agent-browser/package.json");
  const pkg = require(pkgPath) as { bin: Record<string, string> };
  const bin = pkg.bin["agent-browser"];
  if (!bin) {
    throw new ClerkhandError("browser_driver_missing", "agent-browser package has no bin entry.");
  }
  return [process.execPath, join(dirname(pkgPath), bin)];
}

export function createDriver(options: DriverOptions): Driver {
  writeSessionFiles(options);
  const [program, ...lead] = options.command ?? bundledAgentBrowser();
  if (!program) {
    throw new ClerkhandError("browser_driver_missing", "Empty agent-browser command.");
  }
  const base = [
    ...lead,
    "--config",
    options.configPath,
    "--session",
    options.session,
    "--profile",
    options.profileDir,
    "--executable-path",
    options.executablePath,
    "--action-policy",
    options.policyPath,
    "--json",
    ...(options.headed ? ["--headed"] : []),
  ];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const run: Driver["run"] = async (args, runOptions = {}) => {
    const { code, stdout, stderr } = await exec(program, [...base, ...args], {
      stdin: runOptions.stdin,
      timeoutMs,
    });
    const response = parseResponse(stdout);
    if (!response) {
      throw new ClerkhandError(
        "browser_error",
        `agent-browser ${args[0] ?? ""} failed (exit ${code}): ${stderr.trim() || stdout.trim()}`,
      );
    }
    if (!response.success) {
      throw new ClerkhandError("browser_error", String(response.error ?? "unknown error"));
    }
    return response.data;
  };

  return {
    run,
    async evaluate<A, R>(fn: PageFunction<A, R>, arg: A): Promise<R> {
      const data = (await run(["eval", "--stdin"], { stdin: pageScript(fn, arg) })) as {
        result?: unknown;
      };
      if (typeof data?.result !== "string") {
        throw new ClerkhandError("browser_error", "Page script returned no result.");
      }
      return (JSON.parse(data.result) as { value: R }).value;
    },
  };
}

function writeSessionFiles(options: DriverOptions): void {
  for (const path of [options.policyPath, options.configPath, join(options.profileDir, ".")]) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const policy = { default: "deny", allow: options.allowedActions };
  writeFileSync(options.policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  writeFileSync(options.configPath, "{}\n");
}

interface Response {
  success: boolean;
  data?: unknown;
  error?: unknown;
}

/** agent-browser prints one JSON object; warnings may precede it. */
function parseResponse(stdout: string): Response | undefined {
  const line = stdout
    .split("\n")
    .reverse()
    .find((l) => l.trimStart().startsWith("{"));
  if (!line) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(line) as Response;
    return typeof parsed.success === "boolean" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function exec(
  program: string,
  args: string[],
  options: { stdin: string | undefined; timeoutMs: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { timeout: options.timeoutMs, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      reject(new ClerkhandError("browser_error", `Cannot start agent-browser: ${error.message}`)),
    );
    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new ClerkhandError(
            "browser_timeout",
            `agent-browser timed out after ${options.timeoutMs}ms`,
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(options.stdin ?? "");
  });
}
