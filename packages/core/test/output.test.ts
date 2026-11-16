import { describe, expect, it } from "vitest";
import { ClerkhandError, failure, success } from "../src/output.js";

describe("output", () => {
  it("wraps data in an ok envelope", () => {
    expect(JSON.parse(success({ a: 1 }))).toEqual({ ok: true, data: { a: 1 } });
  });

  it("reports a ClerkhandError with its code, details and exit code", () => {
    const { text, exitCode } = failure(
      new ClerkhandError("usage", "bad flag", { exitCode: 2, details: { flag: "--x" } }),
    );
    expect(exitCode).toBe(2);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: { code: "usage", message: "bad flag", details: { flag: "--x" } },
    });
  });

  it("omits details when there are none", () => {
    expect(JSON.parse(failure(new ClerkhandError("x", "y")).text).error).toEqual({
      code: "x",
      message: "y",
    });
  });

  it("reports unexpected errors as internal with exit code 1", () => {
    const { text, exitCode } = failure(new TypeError("oops"));
    expect(exitCode).toBe(1);
    expect(JSON.parse(text)).toEqual({ ok: false, error: { code: "internal", message: "oops" } });
  });
});
