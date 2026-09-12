#!/usr/bin/env python3
import argparse, base64, csv, hashlib, io, json, lzma, pathlib, subprocess, sys, tarfile, zipfile

EXPECTED_ZIP_SHA = 'ada701cfa15e6162b6cdf67bc6c0803540a611b08a23aeeeddd1045d8ce2d8ab'
EXPECTED_MANIFEST_SHA = 'ed36fc9cfd38b04a8d0174efed06b03e8e25b0a45fc0adc4d47fe3457c2ee367'
CHUNK_SIZE = 65536

def digest(data): return hashlib.sha256(data).hexdigest()

def load_inputs(zip_path, manifest_path):
    zip_bytes=zip_path.read_bytes(); manifest_bytes=manifest_path.read_bytes()
    if digest(zip_bytes)!=EXPECTED_ZIP_SHA: raise SystemExit('source handoff SHA-256 mismatch')
    if digest(manifest_bytes)!=EXPECTED_MANIFEST_SHA: raise SystemExit('canonical manifest SHA-256 mismatch')
    rows=list(csv.DictReader(io.StringIO(manifest_bytes.decode('utf-8-sig'))))
    if len(rows)!=225: raise SystemExit(f'expected 225 manifest rows, got {len(rows)}')
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        if len(z.namelist())!=227: raise SystemExit('expected 227 ZIP entries')
        for row in rows:
            data=z.read(row['path'])
            if len(data)!=int(row['bytes']) or digest(data)!=row['sha256']:
                raise SystemExit(f'source identity mismatch: {row["path"]}')
        for required in ('CANONICAL-SOURCE-TREE-MANIFEST.csv','RECONSTRUCTION-RECEIPT.json'):
            if required not in z.namelist(): raise SystemExit(f'missing {required}')
    return zip_bytes, manifest_bytes, rows

def build_carrier(zip_bytes, rows):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        out=io.BytesIO()
        with tarfile.open(fileobj=out,mode='w',format=tarfile.GNU_FORMAT) as tf:
            def add(name,data):
                info=tarfile.TarInfo(name); info.size=len(data); info.mtime=0; info.mode=0o644
                info.uid=info.gid=0; info.uname=info.gname=''; tf.addfile(info,io.BytesIO(data))
            for row in sorted(rows,key=lambda r:r['path'].encode('utf-8')):
                add('source/'+row['path'],z.read(row['path']))
            add('CANONICAL-SOURCE-TREE-MANIFEST.csv',z.read('CANONICAL-SOURCE-TREE-MANIFEST.csv'))
            add('RECONSTRUCTION-RECEIPT.json',z.read('RECONSTRUCTION-RECEIPT.json'))
    return lzma.compress(out.getvalue(),format=lzma.FORMAT_XZ,check=lzma.CHECK_CRC64,preset=9|lzma.PRESET_EXTREME)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('handoff_zip',type=pathlib.Path); ap.add_argument('canonical_manifest',type=pathlib.Path); ap.add_argument('output_dir',type=pathlib.Path); args=ap.parse_args()
    zip_bytes, manifest_bytes, rows=load_inputs(args.handoff_zip,args.canonical_manifest)
    first=build_carrier(zip_bytes,rows); second=build_carrier(zip_bytes,rows)
    if first!=second: raise SystemExit('deterministic double-build mismatch')
    args.output_dir.mkdir(parents=True,exist_ok=True)
    (args.output_dir/'carrier.tar.xz').write_bytes(first)
    chunks=[]
    for index,offset in enumerate(range(0,len(first),CHUNK_SIZE)):
        raw=first[offset:offset+CHUNK_SIZE]; text=base64.b64encode(raw).decode('ascii')+'\n'; name=f'chunk-{index:03d}.b64'
        (args.output_dir/name).write_text(text,encoding='ascii',newline='\n')
        chunks.append({'index':index,'filename':name,'raw_bytes':len(raw),'raw_sha256':digest(raw),'base64_bytes':len(text.encode()),'base64_sha256':digest(text.encode())})
    contract={'contract_id':'DOCUMENTS-R4-TRANSPORT-CONTRACT-001','contract_version':1,'source_handoff_name':args.handoff_zip.name,'source_handoff_sha256':EXPECTED_ZIP_SHA,'source_handoff_bytes':len(zip_bytes),'source_manifest_name':args.canonical_manifest.name,'source_manifest_sha256':EXPECTED_MANIFEST_SHA,'source_manifest_rows':225,'carrier_format':'deterministic GNU tar -> XZ','tar_format':'GNU_FORMAT','tar_member_order':'225 source members sorted by UTF-8 path, then CANONICAL-SOURCE-TREE-MANIFEST.csv, then RECONSTRUCTION-RECEIPT.json','tar_source_prefix':'source/','tar_metadata':{'mtime':0,'uid':0,'gid':0,'uname':'','gname':'','mode':'0644'},'xz_encoder':'Python lzma FORMAT_XZ CHECK_CRC64 preset=9|PRESET_EXTREME','python_version':sys.version.split()[0],'xz_version':subprocess.check_output(['xz','--version'],text=True).splitlines()[0],'carrier_sha256':digest(first),'carrier_bytes':len(first),'raw_chunk_size':CHUNK_SIZE,'chunk_count':len(chunks),'chunks':chunks,'ready_rule':'READY may exist only when every listed chunk exists and all per-chunk, carrier and 225-row source checks pass.','historical_pass_transfer':False}
    (args.output_dir/'TRANSPORT-CONTRACT.json').write_text(json.dumps(contract,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'carrier_sha256':digest(first),'carrier_bytes':len(first),'chunks':len(chunks),'source_rows':225,'result':'PASS'},sort_keys=True))
if __name__=='__main__': main()
