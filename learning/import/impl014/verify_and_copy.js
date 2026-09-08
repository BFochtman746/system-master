const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(msg) { console.error(`IMPORT_VERIFY_FAILED:${msg}`); process.exit(1); }
function sha256File(p) { const h=crypto.createHash('sha256'); h.update(fs.readFileSync(p)); return h.digest('hex'); }
function safeRel(p) {
  const n = p.replace(/\\/g,'/');
  if (!n || n.startsWith('/') || n.includes('../') || n.includes('/..') || n === '..') fail(`UNSAFE_PATH:${p}`);
  return n;
}

const [sourceDir, destDir, receiptPath, zipSha] = process.argv.slice(2);
if (!sourceDir || !destDir || !receiptPath || !zipSha) fail('USAGE');
const manifestPath = path.join(sourceDir,'MANIFEST.json');
const sumsPath = path.join(sourceDir,'SHA256SUMS.txt');
if (!fs.existsSync(manifestPath) || !fs.existsSync(sumsPath)) fail('MISSING_GOVERNANCE_FILES');
let manifest;
try { manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')); } catch(e) { fail('BAD_MANIFEST_JSON'); }
if (manifest.objective !== 'LEARNING-LAB-IMPL-014') fail(`OBJECTIVE:${manifest.objective}`);
if (manifest.file_count !== 247 || !Array.isArray(manifest.files) || manifest.files.length !== 247) fail('MANIFEST_FILE_COUNT');

const manifestMap = new Map();
for (const rec of manifest.files) {
  const rel=safeRel(rec.path);
  if (manifestMap.has(rel)) fail(`DUP_MANIFEST_PATH:${rel}`);
  manifestMap.set(rel, rec.sha256.toLowerCase());
}

const sumLines = fs.readFileSync(sumsPath,'utf8').split(/\r?\n/).filter(Boolean);
if (sumLines.length !== 248) fail(`SUM_LINE_COUNT:${sumLines.length}`);
const sumMap = new Map();
for (const line of sumLines) {
  const m=line.match(/^([0-9a-fA-F]{64})  (.+)$/);
  if(!m) fail(`BAD_SUM_LINE:${line}`);
  const rel=safeRel(m[2]);
  if(sumMap.has(rel)) fail(`DUP_SUM_PATH:${rel}`);
  sumMap.set(rel,m[1].toLowerCase());
}
if (!sumMap.has('MANIFEST.json')) fail('MANIFEST_NOT_HASHED');

for (const [rel, expected] of sumMap) {
  const src=path.join(sourceDir,...rel.split('/'));
  if(!fs.existsSync(src) || !fs.statSync(src).isFile()) fail(`MISSING:${rel}`);
  const got=sha256File(src);
  if(got!==expected) fail(`HASH:${rel}:${got}`);
  if(rel!=='MANIFEST.json') {
    const mex=manifestMap.get(rel);
    if(!mex || mex!==expected) fail(`MANIFEST_SUM_DISAGREE:${rel}`);
  }
}
for (const rel of manifestMap.keys()) if(!sumMap.has(rel)) fail(`MANIFEST_PATH_NOT_HASHED:${rel}`);

if (fs.existsSync(destDir)) fail('DEST_ALREADY_EXISTS');
fs.mkdirSync(destDir,{recursive:true});
const copySet=[...sumMap.keys(),'SHA256SUMS.txt'];
for (const rel of copySet) {
  const src=path.join(sourceDir,...rel.split('/'));
  const dst=path.join(destDir,...rel.split('/'));
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(src,dst);
}
for (const [rel, expected] of sumMap) {
  const got=sha256File(path.join(destDir,...rel.split('/')));
  if(got!==expected) fail(`DEST_HASH:${rel}:${got}`);
}

const receipt={
  objective:'LEARNING-REPO-BASELINE-IMPORT-014',
  imported_objective:manifest.objective,
  source_zip_sha256:zipSha.toLowerCase(),
  manifest_file_count:manifest.file_count,
  governed_hash_count:sumMap.size,
  copied_file_count:copySet.length,
  standing:'VERIFIED_BYTES_READY_FOR_GIT_COMMIT'
};
fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify(receipt));
