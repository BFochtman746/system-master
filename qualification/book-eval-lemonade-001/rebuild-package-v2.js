"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const workspace = process.env.GITHUB_WORKSPACE;
const runnerTemp = process.env.RUNNER_TEMP;
const runId = process.env.GITHUB_RUN_ID || "manual";
if (!workspace || !runnerTemp) throw new Error("GITHUB_WORKSPACE and RUNNER_TEMP are required");

const root = path.join(workspace, "qualification", "book-eval-lemonade-001");
const evidence = path.join(runnerTemp, `book-eval-package-v2-rebuild-${runId}`);
fs.mkdirSync(evidence, { recursive: true });

const expected = {
  jar: {
    sourceRel: "book-eval-lemonade.jar",
    filename: "book-eval-lemonade.jar",
    outDir: "jar-base64-v2",
    sha256: "fedd5bfcb122c4c0d5fd7a7912574705c582596978dd60796e804b26e7549248"
  },
  corpus: {
    sourceRel: path.join("provider-visible", "BOOK-EVAL-CORPUS-INPUT-v2.jsonl"),
    filename: "BOOK-EVAL-CORPUS-INPUT-v2.jsonl",
    outDir: "provider-visible-corpus-base64-v2",
    sha256: "30bd9d0b2c348b33e6b17a81d639e64c7e7e8eef63d7d6c0bfc3175e94fe2b53"
  },
  ontology: {
    sourceRel: path.join("provider-visible", "BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json"),
    filename: "BOOK-EVAL-PROVIDER-ONTOLOGY-v2.json",
    outDir: "provider-ontology-base64-v2",
    sha256: "3daf139be2c35eb706ad0d0a1b6275a72c1ff18c21bf09d97eb26c3eadd7b5d6"
  },
  execution_manifest: {
    sourceRel: path.join("runner-private", "RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json"),
    filename: "RUNNER-PRIVATE-EXECUTION-MANIFEST-v2.json",
    outDir: "runner-private-base64-v2",
    sha256: "7d9348ecdad344d8aa73dc0fe984aef85559084610504f50f8d35ef6a001fb06"
  }
};

const candidates = [
  "C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_RUNNER_POWERSHELL_AUDITED\\delivery",
  "C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_RUNNER_JAVA25_HOTFIX\\delivery",
  "C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_RUNNER\\delivery"
];

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function candidateComplete(dir) {
  return Object.values(expected).every(x => fs.existsSync(path.join(dir, x.sourceRel)));
}

const sourceIndex = candidates.findIndex(candidateComplete);
if (sourceIndex < 0) throw new Error("No approved canonical Book evaluator delivery directory contains all four frozen inputs");
const source = candidates[sourceIndex];

if (fs.existsSync(path.join(source, "scoring-private")) || fs.existsSync(path.join(source, "BOOK_EVAL_SCORING_PRIVATE_v2.zip"))) {
  throw new Error("Scoring-private material is present in the selected source; refusing blind package rebuild");
}
if (fs.existsSync(path.join(root, "scoring-private")) || fs.existsSync(path.join(root, "BOOK_EVAL_SCORING_PRIVATE_v2.zip"))) {
  throw new Error("Scoring-private material is present in the repository objective path; refusing rebuild");
}

const manifest = {
  schema: "BOOK-EVAL-LEMONADE-001-PACKAGE-V2-REBUILD/v1",
  part_size_chars: 6000,
  source_authority: "A-01-proven canonical package; selected only from approved bounded delivery paths",
  source_candidate_id: sourceIndex + 1,
  scoring_private_included: false,
  objects: {}
};

const reconstructedDir = path.join(evidence, "reconstructed");
fs.mkdirSync(reconstructedDir, { recursive: true });

for (const [key, spec] of Object.entries(expected)) {
  const sourcePath = path.join(source, spec.sourceRel);
  const bytes = fs.readFileSync(sourcePath);
  const actualHash = sha256(bytes);
  if (actualHash !== spec.sha256) throw new Error(`${key} source hash mismatch: ${actualHash}`);

  const b64 = bytes.toString("base64");
  const parts = [];
  for (let i = 0; i < b64.length; i += 6000) parts.push(b64.slice(i, i + 6000));

  const outDir = path.join(root, spec.outDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  parts.forEach((part, i) => fs.writeFileSync(path.join(outDir, `part-${String(i).padStart(3, "0")}`), part, "ascii"));

  const reread = [];
  for (let i = 0; i < parts.length; i++) {
    const part = fs.readFileSync(path.join(outDir, `part-${String(i).padStart(3, "0")}`), "ascii");
    if (sha256(Buffer.from(part, "ascii")) !== sha256(Buffer.from(parts[i], "ascii"))) throw new Error(`${key} part ${i} changed after write`);
    reread.push(part);
  }
  const reconstructed = Buffer.from(reread.join(""), "base64");
  const reconstructedHash = sha256(reconstructed);
  if (reconstructedHash !== spec.sha256) throw new Error(`${key} reconstructed hash mismatch: ${reconstructedHash}`);
  if (!reconstructed.equals(bytes)) throw new Error(`${key} reconstructed bytes differ from canonical source`);
  fs.writeFileSync(path.join(reconstructedDir, spec.filename), reconstructed);

  manifest.objects[key] = {
    filename: spec.filename,
    directory: spec.outDir,
    sha256: spec.sha256,
    source_bytes: bytes.length,
    base64_chars: b64.length,
    part_count: parts.length,
    last_part_chars: parts[parts.length - 1].length,
    part_sha256: parts.map(p => sha256(Buffer.from(p, "ascii")))
  };
}

fs.writeFileSync(path.join(root, "PACKAGE-V2-REBUILD-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

const summary = [
  "objective=BOOK-EVAL-LEMONADE-001-REPO-BIND-001-PACKAGE-V2-REBUILD",
  `repository=${process.env.GITHUB_REPOSITORY || "unknown"}`,
  `commit_before=${process.env.GITHUB_SHA || "unknown"}`,
  `runner=${process.env.RUNNER_NAME || "unknown"}`,
  `source_candidate_id=${sourceIndex + 1}`,
  "source_paths_enumerated=false",
  "scoring_private_included=false",
  "part_size_chars=6000",
  ...Object.entries(manifest.objects).map(([k, v]) => `${k}_sha256=${v.sha256}`),
  ...Object.entries(manifest.objects).map(([k, v]) => `${k}_part_count=${v.part_count}`),
  "canonical_inputs_verified=4/4",
  "repository_reconstruction_verified=4/4",
  "qualification=PASS_PACKAGE_V2_REBUILD_LOCAL_GENERATION"
].join("\r\n") + "\r\n";
fs.writeFileSync(path.join(evidence, "package-v2-rebuild-summary.txt"), summary, "utf8");
console.log(summary);
