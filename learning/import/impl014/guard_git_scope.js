const fs = require('fs');
const cp = require('child_process');

function fail(msg) { console.error(`IMPORT_SCOPE_FAILED:${msg}`); process.exit(1); }
const [receiptPath] = process.argv.slice(2);
const out = cp.execSync('git status --porcelain=v1 --untracked-files=all', {encoding:'utf8'}).trim();
const lines = out ? out.split(/\r?\n/) : [];
if (lines.length !== 249) fail(`STATUS_FILE_COUNT:${lines.length}`);
for (const line of lines) {
  const p = line.slice(3).replace(/\\/g,'/');
  if (!p.startsWith('learning/lab/')) fail(`OUT_OF_SCOPE:${line}`);
}
const receipt={status:'PASS', changed_files:lines.length, allowed_prefix:'learning/lab/'};
if (receiptPath) fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n','utf8');
console.log(JSON.stringify(receipt));
