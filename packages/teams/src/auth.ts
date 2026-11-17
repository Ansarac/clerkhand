import { lstatSync, rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers/promises";
import { ClerkhandError, type Driver } from "@clerkhand/core";
import { discover, type Fetch } from "./api.js";
import { invalidateSkypeCache } from "./auth-cache.js";
import { runProcess } from "./process.js";
import {
  type AuthPaths,
  type Credential,
  jwtClaims,
  loadCredential,
  protectDirectory,
  REFRESH_BUFFER_MS,
  record,
  saveCredential,
  skypeCredential,
} from "./storage.js";

const AUTHZ_PATH = "/api/authsvc/v1.0/authz";
const TEAMS_HOSTS = new Set(["teams.microsoft.com", "teams.cloud.microsoft"]);
const POLL_MS = 1000;
const HTTP_OK = 200;
const BEARER = /^Bearer\s+(?<token>.+)$/iu;
const CAPABILITIES = { chats: true, history: true, search: false, send: "self" };

export interface AuthOptions {
  headed: boolean;
  waitSeconds: number;
}
export interface AuthDependencies {
  driver: (headed: boolean) => Driver;
  fetch: Fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  profileBusy: (profileDir: string) => Promise<boolean>;
}

export function isAuthzRequest(value: unknown): boolean {
  const request = record(value);
  if (
    request["method"] !== "POST" ||
    request["status"] !== HTTP_OK ||
    typeof request["url"] !== "string"
  ) {
    return false;
  }
  try {
    const url = new URL(request["url"]);
    return (
      url.protocol === "https:" && TEAMS_HOSTS.has(url.hostname) && url.pathname === AUTHZ_PATH
    );
  } catch {
    return false;
  }
}

/** The AAD identity in this exact browser request must match the returned Skype identity. */
export function credentialFromDetail(value: unknown, now: number): Credential {
  const detail = record(value);
  if (!isAuthzRequest(detail) || typeof detail["responseBody"] !== "string") {
    throw new ClerkhandError(
      "auth_response_invalid",
      "Teams authentication response is missing or changed.",
    );
  }
  let body: Record<string, unknown>;
  try {
    body = record(JSON.parse(detail["responseBody"]));
  } catch {
    // biome-ignore lint/style/useErrorCause: raw parser errors can include the secret response body.
    throw new ClerkhandError("auth_response_invalid", "Teams authentication response is not JSON.");
  }
  const tokens = record(body["tokens"]);
  const skypeToken = body["skypeToken"] ?? tokens["skypeToken"];
  const nested = record(skypeToken);
  const token = typeof skypeToken === "string" ? skypeToken : nested["skypetoken"];
  if (typeof token !== "string") {
    throw new ClerkhandError("auth_response_invalid", "Teams did not return a Skype credential.", {
      details: {
        fields: Object.keys(body),
        tokenFields: Object.keys(tokens),
        nestedFields: Object.keys(nested),
      },
    });
  }
  const headers = record(detail["headers"]);
  const authorization = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "authorization",
  )?.[1];
  const match = typeof authorization === "string" ? BEARER.exec(authorization) : null;
  const aad = jwtClaims(match?.groups?.["token"] ?? "");
  const oid = aad["oid"];
  const tid = aad["tid"];
  if (typeof oid !== "string" || typeof tid !== "string") {
    throw new ClerkhandError(
      "auth_identity_unavailable",
      "Cannot verify the signed-in identity from the Teams authentication request.",
    );
  }
  const credential = skypeCredential(token, tid.toLowerCase(), now);
  if (credential.userId !== oid.toLowerCase()) {
    throw new ClerkhandError(
      "auth_identity_mismatch",
      "Teams authentication request and response belong to different identities.",
    );
  }
  return credential;
}

export function authStatus(credential: Credential | undefined, now: number) {
  const expired = !credential || Date.parse(credential.expiresAt) <= now;
  return {
    authenticated: !expired,
    verified: false,
    expiresAt: credential?.expiresAt ?? null,
    refreshNeeded: !credential || Date.parse(credential.expiresAt) <= now + REFRESH_BUFFER_MS,
    capabilities: CAPABILITIES,
  };
}

/** Caller holds the operation lock. Always close only the browser this invocation owns. */
export async function refreshCredential(
  paths: AuthPaths,
  options: AuthOptions,
  deps: AuthDependencies,
) {
  const previous = loadCredential(paths.credentialsPath);
  if (await deps.profileBusy(paths.profileDir)) {
    throw new ClerkhandError(
      "profile_busy",
      "The dedicated Teams profile is already open. Close it yourself before refreshing.",
    );
  }
  await protectDirectory(paths.profileDir);
  const driver = deps.driver(options.headed);
  let owned = false;
  try {
    const opened = record(await driver.run(["open", "about:blank"]));
    const lifecycle = record(opened["lifecycle"]);
    if (lifecycle["reused"] === true && lifecycle["launched"] !== true) {
      throw new ClerkhandError(
        "profile_busy",
        "An existing browser session owns the authentication profile.",
      );
    }
    owned = true;
    // Attach capture before navigation; authenticated cached loads can finish authz before open returns.
    await driver.run(["network", "requests", "--clear"]);
    await driver.run(["open", "https://teams.cloud.microsoft/"]);
    const credential = await captureCredential(driver, options.waitSeconds, deps);
    if (
      previous &&
      (previous.userId !== credential.userId || previous.tenantId !== credential.tenantId)
    ) {
      throw new ClerkhandError(
        "auth_identity_changed",
        "The browser is signed into another account. The managed credential was kept; use a separate CLERKHAND_HOME for that account.",
      );
    }
    return await validateAndSave(paths, credential, deps.fetch);
  } catch (error) {
    if (error instanceof ClerkhandError && !error.code.startsWith("browser_")) {
      throw error;
    }
    // biome-ignore lint/style/useErrorCause: browser diagnostics can contain authentication headers and responses.
    throw new ClerkhandError(
      "auth_browser_error",
      "The authentication browser failed. The previous credential was kept; raw browser diagnostics were suppressed.",
    );
  } finally {
    if (owned) {
      await driver.run(["close"]).catch(() => undefined);
    }
  }
}

async function captureCredential(
  driver: Driver,
  waitSeconds: number,
  deps: AuthDependencies,
): Promise<Credential> {
  const deadline = deps.now() + waitSeconds * POLL_MS;
  let invalidated = false;
  while (deps.now() < deadline) {
    const captured = record(await driver.run(["network", "requests", "--filter", AUTHZ_PATH]));
    const requests = captured["requests"];
    const request = Array.isArray(requests)
      ? [...requests].reverse().find(isAuthzRequest)
      : undefined;
    if (request) {
      const id = record(request)["requestId"];
      if (typeof id !== "string") {
        throw new ClerkhandError(
          "auth_response_invalid",
          "Teams authentication request has no identifier.",
        );
      }
      return credentialFromDetail(await driver.run(["network", "request", id]), deps.now());
    }
    if (
      !invalidated &&
      record(await driver.evaluate(invalidateSkypeCache, undefined))["invalidated"] === true
    ) {
      invalidated = true;
      await driver.run(["reload"]);
    }
    await deps.sleep(POLL_MS);
  }
  throw new ClerkhandError(
    "login_required",
    "Sign in to Teams using clerkhand-teams auth refresh --headed --wait 180, then let the command finish. Tenant restrictions must be resolved through normal IT approval.",
  );
}

/** The new credential must work against Teams before it replaces the previous one. */
async function validateAndSave(paths: AuthPaths, credential: Credential, fetchImpl: Fetch) {
  const { messageApi, displayName } = await discover(fetchImpl, credential.token);
  saveCredential(paths.credentialsPath, { ...credential, userName: displayName, messageApi });
  rmSync(paths.legacyDir, { recursive: true, force: true });
  return {
    authenticated: true,
    verified: true,
    expiresAt: credential.expiresAt,
    capabilities: CAPABILITIES,
  };
}

/** Windows Chromium does not expose a portable SingletonLock: inspect process arguments privately. */
export async function profileBusy(profileDir: string): Promise<boolean> {
  if (lstatSync(join(profileDir, "SingletonLock"), { throwIfNoEntry: false })) {
    return true;
  }
  if (process.platform !== "win32") {
    return false;
  }
  const result = await runProcess(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$taskProcesses = Get-CimInstance Win32_Process -ErrorAction Stop; [bool]($taskProcesses | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:CLERKHAND_AUTH_PROFILE) })",
    ],
    {
      // biome-ignore lint/style/noProcessEnv: the path is passed as data, never embedded in PowerShell code.
      ...process.env,
      CLERKHAND_AUTH_PROFILE: profileDir,
    },
  );
  if (result.code !== 0) {
    throw new ClerkhandError(
      "profile_check_failed",
      "Cannot check authentication profile ownership.",
    );
  }
  return result.stdout.trim().toLowerCase() === "true";
}

export const sleep = (ms: number) => setTimeout(ms);
