// Release publish step, run by changesets/action as `pnpm release` on `main`.
//
// We use npm *staged publishing* (ai/npm-release-mechanism.md, "Provenance and
// authentication"). Each package's trusted publisher on npmjs.com allows only
// `npm stage publish`, and a plain `npm publish` is refused with
// `E403 OIDC permission denied for this action`. `changeset publish` →
// `pnpm publish` can only run `npm publish`, so this script does the
// publish loop itself:
//
//   for each public workspace package whose version is not on npm yet:
//     1. `pnpm pack`: rewrites workspace:/catalog: specifiers to real versions,
//        the same as `pnpm publish` would
//     2. `npm stage publish <tarball>`: authenticates via OIDC trusted publishing
//        and creates the provenance statement; the version waits for a
//        maintainer to approve it on npmjs.com
//     3. create the git tag `<name>@<version>` and print `New tag: …`;
//        changesets/action reads those lines to push the tag and create a
//        GitHub release, which is what `changeset publish` used to do
//
// Re-runs: a version that is staged but not yet approved is not visible to
// `npm view`, so a re-run will try to stage it again. The registry rejects
// that, and the rejection is treated as "already staged" (see ALREADY_STAGED).

import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGES_DIR = "packages";
const preStatePath = ".changeset/pre.json";
const dryRun = process.argv.includes("--dry-run");

// The registry's rejection of a version that already exists or is already staged.
const ALREADY_STAGED =
  /E409|EPUBLISHCONFLICT|cannot publish over|already (been )?(staged|published|exists)/i;

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { status: res.status ?? 1, stdout: res.stdout ?? "", output };
}

function distTag() {
  if (existsSync(preStatePath)) {
    const preState = JSON.parse(readFileSync(preStatePath, "utf8"));
    if (preState.mode === "pre" && typeof preState.tag === "string" && preState.tag.length > 0) {
      console.error(
        `Changesets prerelease mode detected; staging with dist-tag "${preState.tag}".`,
      );
      return preState.tag;
    }
  }
  return "latest";
}

function publicPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PACKAGES_DIR, d.name, "package.json")))
    .map((d) => {
      const dir = join(PACKAGES_DIR, d.name);
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      return { dir, name: manifest.name, version: manifest.version, private: manifest.private };
    })
    .filter((p) => !p.private);
}

function isOnRegistry({ name, version }) {
  const res = run("npm", ["view", `${name}@${version}`, "version", "--json"]);
  if (res.status !== 0) {
    if (/E404/.test(res.output)) return false; // package does not exist yet
    throw new Error(`npm view ${name}@${version} failed:\n${res.output}`);
  }
  return res.stdout.trim().length > 0;
}

function tagExists(tag) {
  return run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]).status === 0;
}

function pack(pkg) {
  const dest = mkdtempSync(join(tmpdir(), "cyoda-stage-"));
  const res = run("pnpm", ["pack", "--pack-destination", dest], { cwd: pkg.dir });
  const tarballs = readdirSync(dest).filter((f) => f.endsWith(".tgz"));
  if (res.status !== 0 || tarballs.length !== 1) {
    throw new Error(`pnpm pack failed for ${pkg.name}:\n${res.output}`);
  }
  return { dir: dest, file: tarballs[0] };
}

const tag = distTag();
const failures = [];

for (const pkg of publicPackages()) {
  const id = `${pkg.name}@${pkg.version}`;

  if (isOnRegistry(pkg)) {
    console.error(`${id} is already on npm; skipping.`);
    continue;
  }

  const tarball = pack(pkg);
  const args = [
    "stage",
    "publish",
    `./${tarball.file}`,
    "--tag",
    tag,
    "--access",
    "public",
    "--provenance",
  ];
  if (dryRun) args.push("--dry-run");

  console.error(`Staging ${id} (dist-tag ${tag})${dryRun ? " [dry run]" : ""}...`);
  // Run from the tarball's directory so npm doesn't apply the workspace root's context.
  const res = run("npm", args, { cwd: tarball.dir });
  process.stderr.write(res.output);

  if (res.status !== 0) {
    if (ALREADY_STAGED.test(res.output)) {
      console.error(`${id} appears to be staged already (awaiting approval); treating as staged.`);
    } else {
      failures.push(id);
      continue;
    }
  }

  if (dryRun) continue;

  if (!tagExists(id)) {
    const t = run("git", ["tag", id]);
    if (t.status !== 0) {
      console.error(`git tag ${id} failed:\n${t.output}`);
      failures.push(id);
      continue;
    }
    // changesets/action reads this line from stdout to push the tag and create a GitHub release.
    console.log(`New tag: ${id}`);
  }
}

if (failures.length > 0) {
  console.error(`\nPackages that failed to stage:\n${failures.map((f) => `  ${f}`).join("\n")}`);
  process.exit(1);
}

console.error(
  "\nDone. Staged versions are NOT live until a maintainer approves them on npmjs.com " +
    "(see ai/npm-release-mechanism.md, 'Approving a staged release').",
);
