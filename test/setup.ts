import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

// Every test gets its own CLERKHAND_HOME so nothing touches the real data directory.
let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "clerkhand-test-"));
  vi.stubEnv("CLERKHAND_HOME", home);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});
