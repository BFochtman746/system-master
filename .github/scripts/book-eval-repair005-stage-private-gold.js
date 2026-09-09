'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROLE = 'DEVELOPMENT_GOLD';
const EXPECTED_SHA256 = '51cd4790ddd89d067a6e85ee6c6f3092ec3a6fba94faac8e77e31041277da91a';
const EXPECTED_BYTES = 180313;
const DESTINATION_FILENAME = 'BOOK-EVAL-GOLD-CORPUS-v2.jsonl';
const DEFAULT_PRIVATE_ROOT = 'C:\\AI Test Kit\\Books Testing\\BOOK_EVAL_LEMONADE_001_REPAIR005_PRIVATE_RECOVERY';
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function isWithin(parent, candidate) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function stageExactPrivateFile({
  sourcePath,
  destinationRoot,
  expectedSha256 = EXPECTED_SHA256,
  expectedBytes = EXPECTED_BYTES,
  repoRoot = REPO_ROOT,
  destinationFilename = DESTINATION_FILENAME
}) {
  if (!sourcePath) throw new Error('SOURCE_PATH_REQUIRED');
  const source = path.resolve(sourcePath);
  const destination = path.resolve(destinationRoot || DEFAULT_PRIVATE_ROOT);
  const repo = path.resolve(repoRoot);

  if (isWithin(repo, source)) throw new Error('SOURCE_INSIDE_REPOSITORY_REFUSED');
  if (isWithin(repo, destination)) throw new Error('DESTINATION_INSIDE_REPOSITORY_REFUSED');
  if (process.env.GITHUB_WORKSPACE && isWithin(process.env.GITHUB_WORKSPACE, destination)) {
    throw new Error('DESTINATION_INSIDE_GITHUB_WORKSPACE_REFUSED');
  }
  if (process.env.GITHUB_WORKSPACE && isWithin(process.env.GITHUB_WORKSPACE, source)) {
    throw new Error('SOURCE_INSIDE_GITHUB_WORKSPACE_REFUSED');
  }

  let stat;
  try {
    stat = fs.statSync(source);
  } catch (_) {
    throw new Error('SOURCE_FILE_NOT_ACCESSIBLE');
  }
  if (!stat.isFile()) throw new Error('SOURCE_IS_NOT_A_FILE');
  if (stat.size !== expectedBytes) throw new Error('SOURCE_BYTE_COUNT_MISMATCH');
  if (sha256File(source) !== expectedSha256) throw new Error('SOURCE_SHA256_MISMATCH');

  fs.mkdirSync(destination, { recursive: true });
  const finalPath = path.join(destination, destinationFilename);

  if (fs.existsSync(finalPath)) {
    const existing = fs.statSync(finalPath);
    if (!existing.isFile() || existing.size !== expectedBytes || sha256File(finalPath) !== expectedSha256) {
      throw new Error('EXISTING_DESTINATION_CONFLICT_REFUSED');
    }
    return {
      role: ROLE,
      state: 'ALREADY_STAGED_EXACT',
      bytes: expectedBytes,
      sha256: expectedSha256,
      destination_path_disclosed: false,
      content_disclosed: false
    };
  }

  const tempName = `.${destinationFilename}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  const tempPath = path.join(destination, tempName);
  try {
    fs.copyFileSync(source, tempPath, fs.constants.COPYFILE_EXCL);
    const copied = fs.statSync(tempPath);
    if (!copied.isFile() || copied.size !== expectedBytes) throw new Error('STAGED_BYTE_COUNT_MISMATCH');
    if (sha256File(tempPath) !== expectedSha256) throw new Error('STAGED_SHA256_MISMATCH');
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
    throw error;
  }

  return {
    role: ROLE,
    state: 'STAGED_EXACT',
    bytes: expectedBytes,
    sha256: expectedSha256,
    destination_path_disclosed: false,
    content_disclosed: false
  };
}

function parseArgs(argv) {
  let sourcePath = null;
  let destinationRoot = process.env.BOOK_EVAL_PRIVATE_RECOVERY_ROOT || DEFAULT_PRIVATE_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') {
      sourcePath = argv[++i];
    } else if (arg === '--destination-root') {
      destinationRoot = argv[++i];
    } else {
      throw new Error('UNRECOGNIZED_ARGUMENT');
    }
  }
  return { sourcePath, destinationRoot };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = stageExactPrivateFile(args);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(`BOOK_EVAL_PRIVATE_GOLD_STAGE_FAILED:${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  ROLE,
  EXPECTED_SHA256,
  EXPECTED_BYTES,
  DESTINATION_FILENAME,
  DEFAULT_PRIVATE_ROOT,
  stageExactPrivateFile,
  isWithin
};
