import { mkdirSync } from "node:fs";
import type { Driver } from "@clerkhand/core";
import type { Context } from "../src/context.js";
import type { ReadOperation } from "../src/messenger.js";
import { authPaths, saveCredential, skypeCredential } from "../src/storage.js";

export const NOW = Date.UTC(2030, 0, 1);
export const USER_ID = "11111111-1111-1111-1111-111111111111";
export const TENANT_ID = "22222222-2222-2222-2222-222222222222";
export const SELF_ID = "19:synthetic-self@thread.v2";
export function jwt(claims: Record<string, unknown>): string {
  return `${Buffer.from(JSON.stringify({ alg: "synthetic" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.synthetic`;
}
export function token(userId = USER_ID, exp = NOW / 1000 + 3600): string {
  return jwt({ skypeid: `orgid:${userId}`, exp });
}
export function detail(
  skype = token(),
  oid = USER_ID,
  tenant = TENANT_ID,
): Record<string, unknown> {
  return {
    url: "https://teams.microsoft.com/api/authsvc/v1.0/authz",
    method: "POST",
    status: 200,
    requestId: "synthetic.1",
    headers: { ["Authorization"]: `Bearer ${jwt({ oid, tid: tenant })}` },
    responseBody: JSON.stringify({ skypeToken: { skypetoken: skype } }),
  };
}
export function context(
  options: { credential?: boolean; detail?: unknown; noResponse?: boolean } = {},
) {
  let now = NOW;
  const paths = authPaths();
  const calls: string[][] = [];
  const operations: { operation: ReadOperation; configDir: string }[] = [];
  const response = options.detail ?? detail();
  const driver: Driver = {
    run: (args) => {
      calls.push([...args]);
      if (args[0] === "open") {
        return Promise.resolve({ lifecycle: { launched: true, reused: false } });
      }
      if (args[1] === "requests") {
        return Promise.resolve({ requests: options.noResponse ? [] : [response] });
      }
      if (args[1] === "request") {
        return Promise.resolve(response);
      }
      return Promise.resolve({ closed: true });
    },
    evaluate: () => Promise.resolve(undefined) as never,
  };
  const ctx: Context = {
    paths,
    home: paths.root,
    cwd: paths.root,
    now: () => now,
    sleep: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    profileBusy: () => Promise.resolve(false),
    driver: () => driver,
    messenger: (operation, configDir) => {
      operations.push({ operation, configDir });
      if (operation.kind === "whoami") {
        return Promise.resolve({ id: "ME", displayName: "Synthetic User" });
      }
      if (operation.kind === "chats") {
        return Promise.resolve([{ id: SELF_ID, type: "self", topic: "Synthetic self" }]);
      }
      return Promise.resolve([
        {
          id: "synthetic-message",
          content: "Synthetic message",
          author: "Synthetic User",
          timestamp: "2030-01-01T00:00:00Z",
        },
      ]);
    },
  };
  if (options.credential) {
    mkdirSync(paths.configDir, { recursive: true });
    saveCredential(paths.credentialsPath, skypeCredential(token(), TENANT_ID, NOW));
  }
  return { ctx, calls, operations, driver };
}
