const USAGE = "Usage: clerkhand-teams <command>\n\nNo commands yet.";

export interface Io {
  stdout: (text: string) => void;
}

/** Runs the CLI and returns the process exit code. */
export function main(argv: readonly string[], io: Io): number {
  const [command] = argv;
  if (command === undefined || command === "--help" || command === "-h") {
    io.stdout(USAGE);
    return 0;
  }
  io.stdout(
    JSON.stringify({
      ok: false,
      error: { code: "unknown_command", message: `Unknown command: ${command}` },
    }),
  );
  return 2;
}
