import { mkdirSync } from "node:fs";
import type { Driver } from "@clerkhand/core";
import type { Fetch } from "../src/api.js";
import type { Context } from "../src/context.js";
import { authPaths, saveCredential, skypeCredential } from "../src/storage.js";

export const NOW = Date.UTC(2030, 0, 1);
export const USER_ID = "11111111-1111-1111-1111-111111111111";
export const TENANT_ID = "22222222-2222-2222-2222-222222222222";
export const MESSAGE_API = "https://emea.ng.msg.teams.microsoft.com/v1";
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

export interface Request {
  url: string;
  init: RequestInit | undefined;
}
/** Synthetic Teams chat service: answers only in the EMEA region, others return 403. */
export function teamsService(routes: Record<string, (url: URL) => unknown> = {}): {
  fetch: Fetch;
  requests: Request[];
} {
  const requests: Request[] = [];
  const defaults: Record<string, (url: URL) => unknown> = {
    "/v1/users/ME/properties": () => ({ userDetails: JSON.stringify({ name: "Synthetic User" }) }),
    "/v1/users/ME/conversations": () => ({
      conversations: [{ id: "48:notes", threadProperties: {}, lastMessage: {} }],
    }),
    "/v1/users/ME/conversations/48%3Anotes/messages": () => ({
      messages: [
        {
          id: "1",
          messagetype: "Text",
          content: "Synthetic message",
          imdisplayname: "Synthetic User",
          composetime: "2030-01-01T00:00:00Z",
        },
      ],
      ["_metadata"]: {},
    }),
  };
  const fake = (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url: url.href, init });
    if (!url.href.startsWith(MESSAGE_API)) {
      return Promise.resolve(new Response(null, { status: 403 }));
    }
    const route = routes[url.pathname] ?? defaults[url.pathname];
    if (!route) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    const body = route(url);
    return Promise.resolve(
      body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 }),
    );
  };
  return { fetch: fake as Fetch, requests };
}

export function context(
  options: { credential?: boolean; detail?: unknown; noResponse?: boolean } = {},
) {
  let now = NOW;
  const paths = authPaths();
  const calls: string[][] = [];
  const response = options.detail ?? detail();
  const service = teamsService();
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
    fetch: service.fetch,
  };
  if (options.credential) {
    mkdirSync(paths.root, { recursive: true });
    saveCredential(paths.credentialsPath, {
      ...skypeCredential(token(), TENANT_ID, NOW),
      userName: "Synthetic User",
      messageApi: MESSAGE_API,
    });
  }
  return { ctx, calls, requests: service.requests, driver };
}
