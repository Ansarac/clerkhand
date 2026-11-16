/** An expected failure with a stable, machine-readable code. */
export class ClerkhandError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details: unknown;

  constructor(
    code: string,
    message: string,
    options: { exitCode?: number; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ClerkhandError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
  }
}

export const EXIT_USAGE = 2;

export function success(data: unknown): string {
  return JSON.stringify({ ok: true, data });
}

export function failure(error: unknown): { text: string; exitCode: number } {
  if (error instanceof ClerkhandError) {
    const body: { code: string; message: string; details?: unknown } = {
      code: error.code,
      message: error.message,
    };
    if (error.details !== undefined) {
      body.details = error.details;
    }
    return { text: JSON.stringify({ ok: false, error: body }), exitCode: error.exitCode };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    text: JSON.stringify({ ok: false, error: { code: "internal", message } }),
    exitCode: 1,
  };
}
