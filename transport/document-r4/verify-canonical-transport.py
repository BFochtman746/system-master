#!/usr/bin/env python3
import argparse, base64, csv, hashlib, io, json, lzma, pathlib, tarfile

def sha(data): return hashlib.sha256(data).hexdigest()
def safe(name):
    p=pathlib.PurePosixPath(name)
    return not p.is_absolute() and '..' not in p.parts

def reconstruct(stage, contract):
    listed={item['filename'] for item in contract['chunks']}
    present={p.name for p in stage.glob('chunk-*.b64') if p.is_file()}
    if present!=listed: raise SystemExit(f'chunk set mismatch expected={sorted(listed)} present={sorted(present)}')
    parts=[]
    for item in sorted(contract['chunks'],key=lambda x:x['index']):
        text=(stage/item['filename']).read_bytes()
        if len(text)!=item['base64_bytes'] or sha(text)!=item['base64_sha256']: raise SystemExit(f'base64 identity mismatch: {item["filename"]}')
        try: raw=base64.b64decode(text.strip(),validate=True)
        except Exception as exc: raise SystemExit(f'base64 decode failure: {item["filename"]}: {exc}')
        if len(raw)!=item['raw_bytes'] or sha(raw)!=item['raw_sha256']: raise SystemExit(f'raw chunk identity mismatch: {item["filename"]}')
        parts.append(raw)
    carrier=b''.join(parts)
    if len(carrier)!=contract['carrier_bytes'] or sha(carrier)!=contract['carrier_sha256']: raise SystemExit('carrier identity mismatch')
    return carrier

def verify_source(carrier, contract, dest=None):
    raw=lzma.decompress(carrier,format=lzma.FORMAT_XZ)
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as tf:
        regular=[m for m in tf.getmembers() if m.isfile()]
        if len(regular)!=227: raise SystemExit(f'expected 227 regular entries, got {len(regular)}')
        by={}
        for m in regular:
            if not safe(m.name) or m.name in by: raise SystemExit(f'unsafe/duplicate tar path: {m.name}')
            by[m.name]=tf.extractfile(m).read()
        manifest_name='CANONICAL-SOURCE-TREE-MANIFEST.csv'; receipt_name='RECONSTRUCTION-RECEIPT.json'
        if manifest_name not in by or receipt_name not in by: raise SystemExit('required evidence missing')
        rows=list(csv.DictReader(io.StringIO(by[manifest_name].decode('utf-8-sig'))))
        if len(rows)!=contract['source_manifest_rows']: raise SystemExit('manifest row count mismatch')
        seen=set()
        for row in rows:
            rel=row['path']; key='source/'+rel
            if not safe(rel) or rel in seen or key not in by: raise SystemExit(f'unsafe/duplicate/missing source: {rel}')
            seen.add(rel); data=by[key]
            if len(data)!=int(row['bytes']) or sha(data)!=row['sha256']: raise SystemExit(f'source identity mismatch: {rel}')
            data.decode('utf-8')
            if dest:
                target=dest/'source'/pathlib.PurePosixPath(rel); target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
        if dest:
            evidence=dest/'evidence'; evidence.mkdir(parents=True,exist_ok=True)
            (evidence/manifest_name).write_bytes(by[manifest_name]); (evidence/receipt_name).write_bytes(by[receipt_name])
            (evidence/'GITHUB-NATIVE-IMPORT-VERIFICATION.json').write_text(json.dumps({'transport_contract_id':contract['contract_id'],'transport_tar_xz_sha256':contract['carrier_sha256'],'transport_regular_entries':len(regular),'manifest_rows':len(rows),'verified_source_files':len(seen),'identity_result':'PASS__225_OF_225_EXACT_MATCH'},indent=2)+'\n')
    return len(rows)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('stage',type=pathlib.Path); ap.add_argument('--extract-to',type=pathlib.Path); args=ap.parse_args()
    contract=json.loads((args.stage/'TRANSPORT-CONTRACT.json').read_text())
    if contract['contract_id']!='DOCUMENTS-R4-TRANSPORT-CONTRACT-001' or contract['historical_pass_transfer'] is not False: raise SystemExit('transport contract authority mismatch')
    carrier=reconstruct(args.stage,contract); rows=verify_source(carrier,contract,args.extract_to)
    print(json.dumps({'contract_id':contract['contract_id'],'carrier_sha256':contract['carrier_sha256'],'chunk_count':contract['chunk_count'],'verified_source_rows':rows,'result':'PASS'},sort_keys=True))
if __name__=='__main__': main()
