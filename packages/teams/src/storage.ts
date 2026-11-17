import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ClerkhandError, toolPaths } from "@clerkhand/core";
import { runProcess } from "./process.js";

export const REFRESH_BUFFER_MS = 300_000;
const SECONDS_TO_MS = 1000;
const SESSION_HASH_LENGTH = 12;
const JWT_PARTS = 3;
const PRIVATE_DIRECTORY = 0o700;
const PRIVATE_FILE = 0o600;

export function authPaths() {
  const paths = toolPaths("teams-auth");
  const configDir = join(paths.root, "messenger");
  return {
    ...paths,
    configDir,
    credentialsPath: join(configDir, "teams-credentials.json"),
    lockPath: join(paths.root, "operation.lock"),
    session: `clerkhand-teams-auth-${createHash("sha256").update(paths.root).digest("hex").slice(0, SESSION_HASH_LENGTH)}`,
  };
}
export type AuthPaths = ReturnType<typeof authPaths>;
export interface Credential {
  token: string;
  expiresAt: string;
  userId: string;
  tenantId: string;
  userName?: string;
}

export function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function jwtClaims(token: string): Record<string, unknown> {
  try {
    const parts = token.split(".");
    if (parts.length !== JWT_PARTS || !parts[1]) {
      return {};
    }
    return record(JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")));
  } catch {
    return {};
  }
}
/** Structure checking is not signature verification; whoami validates the token with Teams. */
export function skypeCredential(token: string, tenantId: string, now: number): Credential {
  const claims = jwtClaims(token);
  const skypeId = claims["skypeid"];
  const exp = claims["exp"];
  if (typeof skypeId !== "string" || !skypeId.startsWith("orgid:") || typeof exp !== "number") {
    throw new ClerkhandError("invalid_credential", "Expected a work-account Skype credential.");
  }
  const userId = skypeId.slice("orgid:".length).toLowerCase();
  if (
    !(userId && tenantId && Number.isFinite(exp)) ||
    exp * SECONDS_TO_MS <= now + REFRESH_BUFFER_MS
  ) {
    throw new ClerkhandError(
      "invalid_credential",
      "Skype credential is invalid or nearly expired.",
    );
  }
  return { token, expiresAt: new Date(exp * SECONDS_TO_MS).toISOString(), userId, tenantId };
}
export function credentialConfig(credential: Credential): unknown {
  return {
    clerkhand: { schema: 1, userId: credential.userId, tenantId: credential.tenantId },
    ["current_account"]: "work",
    accounts: {
      work: {
        token: credential.token,
        ["token_expires_at"]: credential.expiresAt,
        ["account_type"]: "work",
        ["auth_method"]: "browser",
        ["user_name"]: credential.userName,
        ["current_team"]: null,
        teams: {},
      },
    },
  };
}
export function loadCredential(path: string): Credential | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error("link");
    }
    const config = record(JSON.parse(readFileSync(path, "utf8")));
    const owner = record(config["clerkhand"]);
    const account = record(record(config["accounts"])["work"]);
    if (
      owner["schema"] !== 1 ||
      config["current_account"] !== "work" ||
      typeof owner["userId"] !== "string" ||
      typeof owner["tenantId"] !== "string" ||
      typeof account["token"] !== "string" ||
      typeof account["token_expires_at"] !== "string"
    ) {
      throw new Error("format");
    }
    const claims = jwtClaims(account["token"]);
    if (
      claims["skypeid"] !== `orgid:${owner["userId"]}` ||
      typeof claims["exp"] !== "number" ||
      Date.parse(account["token_expires_at"]) !== claims["exp"] * SECONDS_TO_MS
    ) {
      throw new Error("identity");
    }
    return {
      token: account["token"],
      expiresAt: account["token_expires_at"],
      userId: owner["userId"],
      tenantId: owner["tenantId"],
      ...(typeof account["user_name"] === "string" ? { userName: account["user_name"] } : {}),
    };
  } catch {
    // biome-ignore lint/style/useErrorCause: parser errors may embed the secret file contents.
    throw new ClerkhandError(
      "credential_file_invalid",
      "Managed credential file is invalid; nothing was replaced.",
    );
  }
}
export function needsRefresh(credential: Credential | undefined, now: number): boolean {
  return !credential || Date.parse(credential.expiresAt) <= now + REFRESH_BUFFER_MS;
}
/** Secure directories before writing secrets, including Windows where mode bits are ignored. */
export async function protectDirectory(path: string): Promise<void> {
  mkdirSync(path, { recursive: true, mode: PRIVATE_DIRECTORY });
  if (lstatSync(path).isSymbolicLink()) {
    throw new ClerkhandError(
      "unsafe_data_path",
      "Managed data directory must not be a symbolic link.",
    );
  }
  if (process.platform !== "win32") {
    chmodSync(path, PRIVATE_DIRECTORY);
    return;
  }
  const acl = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; $taskSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User; $taskAcl = [System.Security.AccessControl.DirectorySecurity]::new(); $taskAcl.SetAccessRuleProtection($true, $false); $taskRule = [System.Security.AccessControl.FileSystemAccessRule]::new($taskSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'); $taskAcl.AddAccessRule($taskRule); ([System.IO.DirectoryInfo]::new($env:CLERKHAND_PRIVATE_DIRECTORY)).SetAccessControl($taskAcl)",
    ],
    {
      // biome-ignore lint/style/noProcessEnv: path passed as data, never interpolated into a shell command.
      ...process.env,
      CLERKHAND_PRIVATE_DIRECTORY: path,
    },
  );
  if (acl.code !== 0) {
    throw new ClerkhandError(
      "credential_permissions",
      "Cannot restrict the managed directory's Windows ACL.",
    );
  }
}
/** Exclusive ownership covers refresh and reads, so credentials cannot change mid-command. */
export async function withLock<T>(paths: AuthPaths, action: () => Promise<T>): Promise<T> {
  await protectDirectory(paths.root);
  let descriptor: number;
  try {
    descriptor = openSync(paths.lockPath, "wx", PRIVATE_FILE);
  } catch {
    // biome-ignore lint/style/useErrorCause: lock errors are intentionally reduced to an ownership status.
    throw new ClerkhandError(
      "profile_busy",
      "Another clerkhand operation holds the lock. Do not take over its browser; remove a stale lock only after its process has exited.",
    );
  }
  try {
    writeFileSync(descriptor, String(process.pid));
    return await action();
  } finally {
    closeSync(descriptor);
    rmSync(paths.lockPath);
  }
}
/** Atomic same-directory rename; failed writes leave the previous credential untouched. */
export function saveCredential(path: string, credential: Credential): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(credentialConfig(credential)), {
      flag: "wx",
      mode: PRIVATE_FILE,
    });
    renameSync(temporary, path);
  } catch {
    // biome-ignore lint/style/useErrorCause: never expose filesystem diagnostics from credential writes.
    throw new ClerkhandError(
      "credential_write_failed",
      "Cannot atomically replace the managed credential file.",
    );
  } finally {
    rmSync(temporary, { force: true });
  }
}
