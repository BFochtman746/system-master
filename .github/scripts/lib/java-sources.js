'use strict';

/**
 * Shared derivation of javac source lists for the F-WP-* qualification scripts.
 *
 * Previously each qualify script carried a hand-typed array of .java paths. Those
 * lists silently drifted from reality: adding a source file to a work package left
 * the list untouched, so the new file was never compiled and never qualified, while
 * the script still reported PASS.
 *
 * Every work package already ships control/SOURCE-SLICE-MANIFEST.json, and the
 * qualify scripts already verify each manifest entry's size and SHA256 against the
 * committed blob before compiling. Deriving the compile list from that same manifest
 * means the sealed set and the compiled set cannot disagree — the seal check is the
 * single point of truth.
 *
 * The canonical build definition for these sources is the repository-root pom.xml.
 * These helpers exist so CI can keep using plain javac (no Maven required on the
 * runner) without reintroducing hand-typed lists.
 */

const fs = require('fs');
const path = require('path');

function manifestPath(workspace, packageRoot) {
  return path.join(workspace, packageRoot, 'control', 'SOURCE-SLICE-MANIFEST.json');
}

function readManifest(workspace, packageRoot) {
  const p = manifestPath(workspace, packageRoot);
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.files)) {
    throw new Error(`MANIFEST_SHAPE_INVALID:${packageRoot}`);
  }
  return parsed;
}

function isJava(entryPath) {
  return entryPath.endsWith('.java');
}

function isTestSource(entryPath) {
  // Manifest paths are package-relative ("src/test/java/..."), so a leading-slash
  // check would never match. Handle both relative and nested forms.
  const normalized = entryPath.replace(/\\/g, '/');
  return normalized.startsWith('src/test/java/') || normalized.includes('/src/test/java/');
}

/**
 * All .java sources belonging to a package, as absolute paths, taken from its
 * sealed manifest. Order follows the manifest so compile output stays stable.
 */
function packageSources(workspace, packageRoot, { includeTests = true } = {}) {
  const manifest = readManifest(workspace, packageRoot);
  const files = manifest.files
    .map((e) => e.path)
    .filter(isJava)
    .filter((p) => (includeTests ? true : !isTestSource(p)));
  if (files.length === 0) {
    throw new Error(`NO_JAVA_SOURCES_IN_MANIFEST:${packageRoot}`);
  }
  return files.map((p) => path.join(workspace, packageRoot, p));
}

/**
 * Production (non-test) sources of upstream dependency packages, in the order the
 * dependency roots are given. Test classes of a dependency are deliberately excluded:
 * a package qualifies against its dependencies' shipped code, not their harnesses.
 */
function dependencySources(workspace, dependencyRoots) {
  const out = [];
  for (const root of dependencyRoots) {
    for (const src of packageSources(workspace, root, { includeTests: false })) {
      if (!out.includes(src)) out.push(src);
    }
  }
  return out;
}

/**
 * Full compile list for a package: dependency production sources first, then the
 * package's own sealed sources including its qualification test class.
 */
function compileList(workspace, packageRoot, dependencyRoots = []) {
  return [
    ...dependencySources(workspace, dependencyRoots),
    ...packageSources(workspace, packageRoot, { includeTests: true }),
  ];
}

module.exports = {
  readManifest,
  packageSources,
  dependencySources,
  compileList,
};
