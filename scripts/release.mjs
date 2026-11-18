// Publishes workspace packages whose version is not on npm yet, then creates their GitHub
// releases. Run by .github/workflows/release.yml; `check` only reports whether anything is
// unpublished. Packages are published in dependency order (core before tools).
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const ORDER = ["core", "teams"];
const [, , mode] = process.argv;
const NEXT_SECTION = /^## /mu;

function run(program, args, options = {}) {
  return execFileSync(program, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}

function published(name, version) {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"]).trim() === version;
  } catch {
    return false; // E404: the package or this version does not exist yet.
  }
}

/** The CHANGELOG.md section changesets wrote for `version`. */
function notes(dir, version) {
  try {
    const changelog = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    const start = changelog.indexOf(`## ${version}\n`);
    if (start === -1) {
      return "";
    }
    const rest = changelog.slice(start + `## ${version}\n`.length);
    const end = rest.search(NEXT_SECTION);
    return (end === -1 ? rest : rest.slice(0, end)).trim();
  } catch {
    return "";
  }
}

const packages = readdirSync("packages")
  .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
  .map((dir) => ({
    dir: join("packages", dir),
    ...JSON.parse(readFileSync(join("packages", dir, "package.json"), "utf8")),
  }))
  .filter((pkg) => !pkg.private);
const pending = packages.filter((pkg) => !published(pkg.name, pkg.version));

if (mode === "check") {
  console.log(
    pending.length > 0
      ? `unpublished: ${pending.map((p) => `${p.name}@${p.version}`).join(", ")}`
      : "all published",
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `unpublished=${pending.length > 0}\n`);
  }
} else if (mode === "publish") {
  const out = mkdtempSync(join(tmpdir(), "clerkhand-release-"));
  for (const pkg of pending) {
    // pnpm pack replaces workspace: ranges with real versions; npm publish uses trusted publishing.
    run("pnpm", ["pack", "--pack-destination", out], { cwd: pkg.dir });
    const tarball = readdirSync(out).find(
      (file) => file.endsWith(`-${pkg.version}.tgz`) && file.includes(pkg.name.split("/")[1]),
    );
    run("npm", ["publish", join(out, tarball), "--access", "public"], { stdio: "inherit" });
    const tag = `${pkg.name}@${pkg.version}`;
    const notesFile = join(out, `${pkg.name.split("/")[1]}-notes.md`);
    writeFileSync(notesFile, notes(pkg.dir, pkg.version) || `Release ${tag}.`);
    run(
      "gh",
      [
        "release",
        "create",
        tag,
        "--title",
        tag,
        "--notes-file",
        notesFile,
        "--target",
        process.env.GITHUB_SHA ?? "main",
      ],
      { stdio: "inherit" },
    );
    console.log(`published ${tag}`);
  }
} else {
  console.error("Usage: node scripts/release.mjs check|publish");
  process.exitCode = 2;
}
