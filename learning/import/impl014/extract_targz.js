const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function fail(msg) { console.error(`IMPORT_EXTRACT_FAILED:${msg}`); process.exit(1); }
function safeRel(p) {
  const n=p.replace(/\\/g,'/').replace(/^\.\//,'');
  if(!n || n.startsWith('/') || /^[A-Za-z]:/.test(n) || n==='..' || n.includes('../') || n.includes('/..')) fail(`UNSAFE_PATH:${p}`);
  return n;
}
function octal(buf, start, len) {
  const s=buf.subarray(start,start+len).toString('ascii').replace(/\0.*$/,'').trim();
  if(!s) return 0;
  if(!/^[0-7]+$/.test(s)) fail(`BAD_OCTAL:${s}`);
  return parseInt(s,8);
}

const [archivePath, destDir, expectedFilesText] = process.argv.slice(2);
const expectedFiles=Number(expectedFilesText);
if(!archivePath || !destDir || !Number.isInteger(expectedFiles)) fail('USAGE');
if(fs.existsSync(destDir)) fail('DEST_ALREADY_EXISTS');
fs.mkdirSync(destDir,{recursive:true});
let tar;
try { tar=zlib.gunzipSync(fs.readFileSync(archivePath)); } catch(e) { fail(`GZIP:${e.message}`); }
let off=0, count=0;
while(off+512<=tar.length) {
  const hdr=tar.subarray(off,off+512); off+=512;
  if(hdr.every(b=>b===0)) break;
  const name=hdr.subarray(0,100).toString('utf8').replace(/\0.*$/,'');
  const prefix=hdr.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
  const rel=safeRel(prefix ? `${prefix}/${name}` : name);
  const size=octal(hdr,124,12);
  const type=String.fromCharCode(hdr[156]||48);
  if(type!=='0' && type!=='\0') fail(`UNSUPPORTED_TAR_TYPE:${type}:${rel}`);
  if(off+size>tar.length) fail(`TRUNCATED:${rel}`);
  const out=path.join(destDir,...rel.split('/'));
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,tar.subarray(off,off+size));
  count++;
  off += Math.ceil(size/512)*512;
}
if(count!==expectedFiles) fail(`FILE_COUNT:${count}`);
console.log(JSON.stringify({status:'PASS', files:count}));
