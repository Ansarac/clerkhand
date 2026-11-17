import { spawn } from "node:child_process";
import { basename } from "node:path";
import process from "node:process";
import { ClerkhandError } from "@clerkhand/core";

const MAX_BYTES = 8_388_608;
const TIMEOUT_MS = 60_000;

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** No shell, no inherited stdin, bounded output; raw diagnostics stay inside the tool. */
export function runProcess(
  program: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<ProcessResult> {
  // Windows PowerShell 5 cannot import PowerShell 7's inherited modules.
  const childEnv = basename(program).toLowerCase() === "powershell.exe" ? powerShellEnv(env) : env;
  return new Promise((resolve, reject) => {
    const child = spawn(program, [...args], {
      env: childEnv,
      windowsHide: true,
      timeout: TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let overflow = false;
    const collect = (chunk: string, output: "stdout" | "stderr") => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_BYTES) {
        overflow = true;
        child.kill();
        return;
      }
      if (output === "stdout") {
        stdout += chunk;
      } else {
        stderr += chunk;
      }
    };
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => collect(chunk, "stdout"));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => collect(chunk, "stderr"));
    child.on("error", () =>
      reject(new ClerkhandError("process_error", "Cannot start the required subprocess.")),
    );
    child.on("close", (code, signal) => {
      if (overflow || signal) {
        reject(
          new ClerkhandError(
            overflow ? "output_limit" : "process_timeout",
            overflow ? "Subprocess output exceeded the limit." : "Subprocess timed out.",
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function powerShellEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: preserve the environment except version-specific module search paths.
  const inherited = env ?? process.env;
  return Object.fromEntries(
    Object.entries(inherited).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
  );
}
