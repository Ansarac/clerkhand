// Builds the GitHub release for the current version. Run by .github/workflows/release.yml.
//   check  - reports whether the release tag `v<version>` exists yet
//   pack   - writes the release tarballs to `release/`
//   notes  - writes the release notes to `release/notes.md`
// All packages share one version (changesets "fixed" group). The teams tarball depends on the
// core tarball of the same release by URL, so one `npm install -g <url>` installs both.
import { execFileSync } from "node:child_process";
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const REPOSITORY = "Ansarac/clerkhand";
const OUT = "release";
const NEXT_SECTION = /^## /mu;
const [, , mode] = process.argv;

const manifest = (name) => JSON.parse(readFileSync(join("packages", name, "package.json"), "utf8"));
const { version } = manifest("teams");
const tag = `v${version}`;

function run(program, args, options = {}) {
  return execFileSync(program, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    // pnpm and gh are .cmd shims on Windows (local dry runs); arguments are fixed, not user input.
    shell: process.platform === "win32",
    ...options,
  });
}

function released() {
  try {
    run("gh", ["release", "view", tag, "--repo", REPOSITORY, "--json", "tagName"]);
    return true;
  } catch {
    return false;
  }
}

/** The CHANGELOG.md section changesets wrote for this version. */
function section(name) {
  try {
    const changelog = readFileSync(join("packages", name, "CHANGELOG.md"), "utf8");
    const heading = `## ${version}\n`;
    const start = changelog.indexOf(heading);
    if (start === -1) {
      return "";
    }
    const rest = changelog.slice(start + heading.length);
    const end = rest.search(NEXT_SECTION);
    return (end === -1 ? rest : rest.slice(0, end)).trim();
  } catch {
    return "";
  }
}

if (manifest("core").version !== version) {
  throw new Error("core and teams must share one version (changesets fixed group).");
}

if (mode === "check") {
  const exists = released();
  console.log(exists ? `${tag} is released` : `${tag} is not released yet`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `unreleased=${!exists}\n`);
  }
} else if (mode === "pack") {
  mkdirSync(OUT, { recursive: true });
  const destination = join("..", "..", OUT);
  const coreFile = `clerkhand-core-${version}.tgz`;
  run("pnpm", ["pack", "--pack-destination", destination], { cwd: join("packages", "core") });
  // Point teams at the core tarball of this same release instead of a registry version.
  // This edits the CI checkout only.
  const teams = manifest("teams");
  // CLERKHAND_CORE_URL lets a local dry run point at a file: URL instead.
  teams.dependencies["@clerkhand/core"] =
    process.env.CLERKHAND_CORE_URL ??
    `https://github.com/${REPOSITORY}/releases/download/${tag}/${coreFile}`;
  writeFileSync(join("packages", "teams", "package.json"), `${JSON.stringify(teams, null, 2)}\n`);
  run("pnpm", ["pack", "--pack-destination", destination], { cwd: join("packages", "teams") });
  // A stable name, so `releases/latest/download/clerkhand-teams.tgz` always installs the newest.
  copyFileSync(join(OUT, `clerkhand-teams-${version}.tgz`), join(OUT, "clerkhand-teams.tgz"));
  console.log(`packed ${tag}`);
} else if (mode === "notes") {
  mkdirSync(OUT, { recursive: true });
  const asset = `clerkhand-teams-${version}.tgz`;
  const body = [
    "## Install",
    "",
    "```sh",
    `npm install -g https://github.com/${REPOSITORY}/releases/download/${tag}/${asset}`,
    "clerkhand-teams setup claude --write",
    "```",
    "",
    `Verify a downloaded tarball: \`gh attestation verify ${asset} --repo ${REPOSITORY}\``,
    "",
    "## Changes",
    "",
    section("teams") || "See the commit history.",
  ].join("\n");
  writeFileSync(join(OUT, "notes.md"), `${body}\n`);
  console.log(`wrote notes for ${tag}`);
} else {
  console.error("Usage: node scripts/release.mjs check|pack|notes");
  process.exitCode = 2;
}
