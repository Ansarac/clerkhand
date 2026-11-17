import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { invalidateSkypeCache } from "../src/auth-cache.js";
import { USER_ID } from "./helpers.js";

function fixture(selected = USER_ID, host = "teams.cloud.microsoft") {
  const skype = `tmp.auth.v1.${USER_ID}.Discover.SKYPE-TOKEN`;
  const api = `tmp.auth.v1.${USER_ID}.Token.HTTPS://API.SPACES.SKYPE.COM`;
  const entries = new Map([
    ["tmp.react-web-client.cachedPrimaryUser", JSON.stringify({ userId: USER_ID })],
    ["tmp.auth.v1.GLOBAL.PrimaryUserId.PrimaryUserId", JSON.stringify({ item: selected })],
    [skype, "synthetic-encrypted-skype"],
    [api, "synthetic-encrypted-skype"],
    ["msal.synthetic-access", "synthetic-aad"],
    ["tmp.auth.v1.other-account.Discover.SKYPE-TOKEN", "synthetic-other-account"],
  ]);
  const result = runInNewContext(`(${invalidateSkypeCache.toString()})()`, {
    location: { protocol: "https:", hostname: host },
    localStorage: {
      getItem: (key: string) => entries.get(key) ?? null,
      removeItem: (key: string) => entries.delete(key),
    },
  }) as { invalidated: boolean };
  return { entries, result, skype, api };
}
describe("normal Teams Skype renewal", () => {
  it("invalidates only the selected account's two Skype caches, retaining SSO and other accounts", () => {
    const { entries, result, skype, api } = fixture();
    expect(result.invalidated).toBe(true);
    expect(entries.has(skype)).toBe(false);
    expect(entries.has(api)).toBe(false);
    expect(entries.get("msal.synthetic-access")).toBe("synthetic-aad");
    expect(entries.get("tmp.auth.v1.other-account.Discover.SKYPE-TOKEN")).toBe(
      "synthetic-other-account",
    );
  });
  it("does not invalidate a mismatched account or an unrelated origin", () => {
    for (const state of [fixture("other-account"), fixture(USER_ID, "example.test")]) {
      expect(state.result.invalidated).toBe(false);
      expect(state.entries.has(state.skype)).toBe(true);
    }
  });
});
