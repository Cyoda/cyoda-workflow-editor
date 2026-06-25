import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicPackages = [
  { name: "@cyoda/workflow-core", dir: "packages/workflow-core" },
  { name: "@cyoda/workflow-graph", dir: "packages/workflow-graph" },
  { name: "@cyoda/workflow-layout", dir: "packages/workflow-layout" },
  { name: "@cyoda/workflow-monaco", dir: "packages/workflow-monaco" },
  { name: "@cyoda/workflow-react", dir: "packages/workflow-react" },
  { name: "@cyoda/workflow-viewer", dir: "packages/workflow-viewer" },
];
const privatePackages = [
  { name: "cyoda-workflow-editor", dir: "." },
  { name: "@cyoda/docs-embed-demo", dir: "apps/docs-embed-demo" },
];
const repositoryUrl = "git+https://github.com/Cyoda/cyoda-workflow-editor.git";
const homepageUrl = "https://github.com/Cyoda/cyoda-workflow-editor#readme";
const bugsUrl = "https://github.com/Cyoda/cyoda-workflow-editor/issues";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(rootDir, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectExportPaths(value, found = new Set()) {
  if (typeof value === "string") {
    found.add(value);
    return found;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectExportPaths(nested, found);
  }
  return found;
}

function runNpmPackDryRun(pkgDir) {
  execFileSync("npm", ["pack", "--dry-run"], {
    cwd: resolve(rootDir, pkgDir),
    stdio: "pipe",
    env: {
      ...process.env,
      HOME: rootDir,
      npm_config_cache: resolve(rootDir, ".npm-cache"),
    },
  });
}

for (const pkg of privatePackages) {
  const manifest = readJson(`${pkg.dir}/package.json`);
  assert(manifest.name === pkg.name, `Expected private package ${pkg.name} at ${pkg.dir}.`);
  assert(manifest.private === true, `${pkg.name} must remain private.`);
}

for (const pkg of publicPackages) {
  const manifestPath = `${pkg.dir}/package.json`;
  const manifest = readJson(manifestPath);
  const pkgRoot = resolve(rootDir, pkg.dir);

  assert(manifest.name === pkg.name, `Expected package name ${pkg.name} in ${manifestPath}.`);
  assert(manifest.private !== true, `${pkg.name} must be publishable, not private.`);
  assert(manifest.license === "Apache-2.0", `${pkg.name} must use Apache-2.0.`);
  assert(manifest.publishConfig?.access === "public", `${pkg.name} must publish with public access.`);
  assert(manifest.repository?.url === repositoryUrl, `${pkg.name} repository.url must target the public repo.`);
  assert(manifest.repository?.directory === pkg.dir, `${pkg.name} repository.directory must be ${pkg.dir}.`);
  assert(manifest.homepage === homepageUrl, `${pkg.name} homepage is invalid.`);
  assert(manifest.bugs?.url === bugsUrl, `${pkg.name} bugs.url is invalid.`);
  assert(Array.isArray(manifest.files), `${pkg.name} must declare files for npm publish.`);

  for (const expected of ["dist", "README.md", "LICENSE"]) {
    assert(manifest.files.includes(expected), `${pkg.name} files must include ${expected}.`);
  }

  for (const relPath of [manifest.main, manifest.module, manifest.types, ...collectExportPaths(manifest.exports)]) {
    assert(typeof relPath === "string" && relPath.length > 0, `${pkg.name} has an invalid export path entry.`);
    assert(existsSync(resolve(pkgRoot, relPath)), `${pkg.name} is missing expected build artifact ${relPath}.`);
  }

  for (const docPath of ["README.md", "LICENSE"]) {
    assert(existsSync(resolve(pkgRoot, docPath)), `${pkg.name} is missing ${docPath}.`);
  }

  runNpmPackDryRun(pkg.dir);
  console.log(`Validated ${pkg.name}`);
}

const prereleaseStatePath = resolve(rootDir, ".changeset/pre.json");
if (existsSync(prereleaseStatePath)) {
  const prereleaseState = JSON.parse(readFileSync(prereleaseStatePath, "utf8"));
  console.log(`Changesets prerelease mode: ${prereleaseState.mode} (${prereleaseState.tag ?? "no-tag"})`);
}

console.log("Release preflight checks passed.");
