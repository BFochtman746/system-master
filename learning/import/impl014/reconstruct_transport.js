const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fail(msg) { console.error(`IMPORT_RECONSTRUCT_FAILED:${msg}`); process.exit(1); }
const [chunkDir, outFile, expectedSha, expectedPartsText] = process.argv.slice(2);
const expectedParts = Number(expectedPartsText);
if (!chunkDir || !outFile || !expectedSha || !Number.isInteger(expectedParts)) fail('USAGE');
const parts = fs.readdirSync(chunkDir).filter(n => /^part-\d{3}\.b64$/.test(n)).sort();
if (parts.length !== expectedParts) fail(`CHUNK_COUNT:${parts.length}`);
const text = parts.map(n => fs.readFileSync(path.join(chunkDir, n), 'ascii').trim()).join('');
if (!/^[A-Za-z0-9+/=]+$/.test(text)) fail('NON_BASE64_DATA');
const bytes = Buffer.from(text, 'base64');
const digest = crypto.createHash('sha256').update(bytes).digest('hex');
if (digest.toLowerCase() !== expectedSha.toLowerCase()) fail(`TRANSPORT_SHA256:${digest}`);
fs.mkdirSync(path.dirname(outFile), {recursive:true});
fs.writeFileSync(outFile, bytes);
console.log(JSON.stringify({status:'PASS', chunks:parts.length, bytes:bytes.length, sha256:digest}));
