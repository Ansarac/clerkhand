import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";
import { ClerkhandError } from "@clerkhand/core";
import { describe, expect, it } from "vitest";
import { credentialFromDetail, refreshCredential } from "../src/auth.js";
import { main } from "../src/main.js";
import { runProcess } from "../src/process.js";
import {
  loadCredential,
  needsRefresh,
  protectDirectory,
  saveCredential,
  withLock,
} from "../src/storage.js";
import { context, detail, jwt, NOW, TENANT_ID, token } from "./helpers.js";

const options = { headed: false, waitSeconds: 2 };
describe("credential validation", () => {
  it("checks expiry and the exact browser request's identity for flat and nested responses", () => {
    expect(credentialFromDetail(detail(), NOW).expiresAt).toBe("2030-01-01T01:00:00.000Z");
    expect(
      credentialFromDetail(
        {
          ...detail(),
          responseBody: JSON.stringify({ tokens: { skypeToken: { skypetoken: token() } } }),
        },
        NOW,
      ).expiresAt,
    ).toBe("2030-01-01T01:00:00.000Z");
    expect(
      credentialFromDetail(
        { ...detail(), responseBody: JSON.stringify({ skypeToken: token() }) },
        NOW,
      ).tenantId,
    ).toBe(TENANT_ID);
    expect(() => credentialFromDetail(detail(token(), "someone-else"), NOW)).toThrow(
      expect.objectContaining({ code: "auth_identity_mismatch" }),
    );
    expect(() => credentialFromDetail(detail(token(undefined, NOW / 1000 + 300)), NOW)).toThrow(
      expect.objectContaining({ code: "invalid_credential" }),
    );
  });
  it("rejects AAD bearers, foreign origins and unverifiable request identities", () => {
    expect(() =>
      credentialFromDetail(detail(jwt({ oid: "synthetic", exp: NOW / 1000 + 3600 })), NOW),
    ).toThrow(expect.objectContaining({ code: "invalid_credential" }));
    expect(() =>
      credentialFromDetail(
        { ...detail(), url: "https://example.test/api/authsvc/v1.0/authz" },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: "auth_response_invalid" }));
    expect(() => credentialFromDetail({ ...detail(), headers: {} }, NOW)).toThrow(
      expect.objectContaining({ code: "auth_identity_unavailable" }),
    );
  });
  it("refreshes missing and near-expiry credentials, retaining valid ones", () => {
    const credential = credentialFromDetail(detail(), NOW);
    expect(needsRefresh(undefined, NOW)).toBe(true);
    expect(needsRefresh(credential, NOW)).toBe(false);
    expect(needsRefresh(credential, NOW + 55 * 60 * 1000)).toBe(true);
  });
});
describe("authentication transaction", () => {
  it("reloads at most once to request normal Teams renewal when the response is cached", async () => {
    const { ctx, driver, calls } = context({ noResponse: true });
    driver.evaluate = () => Promise.resolve({ invalidated: true }) as never;
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "login_required" });
    expect(calls.filter((args) => args[0] === "reload")).toHaveLength(1);
  });
  it("verifies from a private staging directory before replacing credentials, then removes staging", async () => {
    const { ctx, operations, calls } = context();
    await withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx));
    expect(operations[0]?.configDir).not.toBe(ctx.paths.configDir);
    expect(loadCredential(ctx.paths.credentialsPath)?.userName).toBe("Synthetic User");
    expect(readdirSync(ctx.paths.root).some((name) => name.startsWith("verify-"))).toBe(false);
    expect(calls.at(-1)).toEqual(["close"]);
    expect(existsSync(ctx.paths.lockPath)).toBe(false);
  });
  it("keeps the previous file byte-for-byte when verification fails", async () => {
    const { ctx, calls } = context({ credential: true });
    const before = readFileSync(ctx.paths.credentialsPath, "utf8");
    ctx.messenger = () =>
      Promise.reject(new ClerkhandError("authentication_failed", "Synthetic rejection"));
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "authentication_failed" });
    expect(readFileSync(ctx.paths.credentialsPath, "utf8")).toBe(before);
    expect(calls.at(-1)).toEqual(["close"]);
    expect(readdirSync(ctx.paths.root).some((name) => name.startsWith("verify-"))).toBe(false);
  });
  it("rejects an account or tenant switch without replacing credentials", async () => {
    const { ctx } = context({
      credential: true,
      detail: detail(token("other-user"), "other-user"),
    });
    const before = readFileSync(ctx.paths.credentialsPath, "utf8");
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "auth_identity_changed" });
    expect(readFileSync(ctx.paths.credentialsPath, "utf8")).toBe(before);
  });
  it("does not create or close a browser when the profile is occupied", async () => {
    const { ctx, calls } = context();
    ctx.profileBusy = () => Promise.resolve(true);
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "profile_busy" });
    expect(calls).toEqual([]);
  });
  it("does not close a reused external session", async () => {
    const { ctx, driver, calls } = context();
    driver.run = (args) => {
      calls.push([...args]);
      return Promise.resolve({ lifecycle: { reused: true, launched: false } });
    };
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "profile_busy" });
    expect(calls).toHaveLength(1);
  });
  it("times out with login instructions and keeps old credentials", async () => {
    const { ctx } = context({ credential: true, noResponse: true });
    const before = readFileSync(ctx.paths.credentialsPath, "utf8");
    await expect(
      withLock(ctx.paths, () => refreshCredential(ctx.paths, options, ctx)),
    ).rejects.toMatchObject({ code: "login_required" });
    expect(readFileSync(ctx.paths.credentialsPath, "utf8")).toBe(before);
  });
  it("does not expose tokens or raw browser diagnostics in CLI output", async () => {
    const { ctx, driver } = context();
    driver.run = () =>
      Promise.reject(new ClerkhandError("browser_error", `Synthetic secret ${token()}`));
    let output = "";
    await main(
      ["auth", "refresh", "--wait", "1"],
      {
        stdout: (value) => {
          output = value;
        },
      },
      ctx,
    );
    expect(output).not.toContain(token());
    expect(JSON.parse(output).error.code).toBe("auth_browser_error");
  });
});
describe("protected storage", () => {
  it("sets a current-user-only Windows ACL before secret files are written", {
    skip: process.platform !== "win32",
  }, async () => {
    const { ctx } = context();
    await protectDirectory(ctx.paths.configDir);
    saveCredential(ctx.paths.credentialsPath, credentialFromDetail(detail(), NOW));
    const result = await runProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$taskSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $taskAcl = Get-Acl -LiteralPath $env:CLERKHAND_TEST_ACL; @{ userOnly = @($taskAcl.Access | Where-Object { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $taskSid }).Count -eq 0; ruleCount = @($taskAcl.Access).Count } | ConvertTo-Json -Compress",
      ],
      { ...process.env, CLERKHAND_TEST_ACL: ctx.paths.credentialsPath },
    );
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ userOnly: true, ruleCount: 1 });
  });
  it("rejects unmanaged files and malformed expiry without overwriting them", () => {
    const { ctx } = context({ credential: true });
    writeFileSync(ctx.paths.credentialsPath, JSON.stringify({ token: token() }));
    expect(() => loadCredential(ctx.paths.credentialsPath)).toThrow(
      expect.objectContaining({ code: "credential_file_invalid" }),
    );
  });
  it("cleans up a failed atomic replacement", async () => {
    const { ctx } = context();
    await protectDirectory(ctx.paths.configDir);
    expect(() => saveCredential(ctx.paths.configDir, credentialFromDetail(detail(), NOW))).toThrow(
      expect.objectContaining({ code: "credential_write_failed" }),
    );
    expect(readdirSync(ctx.paths.root).some((name) => name.endsWith(".tmp"))).toBe(false);
  });
  it("rejects concurrent operations and leaves the owner lock untouched", async () => {
    const { ctx } = context();
    await withLock(ctx.paths, async () => {
      const before = readFileSync(ctx.paths.lockPath, "utf8");
      await expect(withLock(ctx.paths, () => Promise.resolve())).rejects.toMatchObject({
        code: "profile_busy",
      });
      expect(readFileSync(ctx.paths.lockPath, "utf8")).toBe(before);
    });
    expect(existsSync(ctx.paths.lockPath)).toBe(false);
  });
  it("writes private Unix modes", { skip: process.platform === "win32" }, async () => {
    const { ctx } = context();
    await protectDirectory(ctx.paths.configDir);
    saveCredential(ctx.paths.credentialsPath, credentialFromDetail(detail(), NOW));
    expect(statSync(ctx.paths.configDir).mode % 0o1000).toBe(0o700);
    expect(statSync(ctx.paths.credentialsPath).mode % 0o1000).toBe(0o600);
  });
});
