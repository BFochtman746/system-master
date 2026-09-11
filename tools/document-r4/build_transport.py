#!/usr/bin/env python3
import argparse
import base64
import csv
import hashlib
import io
import json
import pathlib
import subprocess
import tarfile
import zipfile

RECORD_VERSION = 1
RAW_CHUNK_BYTES = 65536
EXPECTED_HANDOFF_SHA256 = 'ada701cfa15e6162b6cdf67bc6c0803540a611b08a23aeeeddd1045d8ce2d8ab'
EXPECTED_MANIFEST_SHA256 = 'ed36fc9cfd38b04a8d0174efed06b03e8e25b0a45fc0adc4d47fe3457c2ee367'
EXPECTED_MANIFEST_ROWS = 225
MANIFEST_NAME = 'CANONICAL-SOURCE-TREE-MANIFEST.csv'
RECEIPT_NAME = 'RECONSTRUCTION-RECEIPT.json'


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def load_and_verify_handoff(handoff: pathlib.Path, external_manifest: pathlib.Path):
    if file_sha(handoff) != EXPECTED_HANDOFF_SHA256:
        raise SystemExit('handoff digest mismatch')
    if file_sha(external_manifest) != EXPECTED_MANIFEST_SHA256:
        raise SystemExit('external manifest digest mismatch')
    ext_manifest_bytes = external_manifest.read_bytes()
    with zipfile.ZipFile(handoff, 'r') as zf:
        names = zf.namelist()
        if len(names) != 227 or len(set(names)) != 227:
            raise SystemExit(f'expected 227 unique zip entries, got {len(names)}')
        if MANIFEST_NAME not in names or RECEIPT_NAME not in names:
            raise SystemExit('required evidence entries missing from handoff')
        embedded_manifest = zf.read(MANIFEST_NAME)
        if embedded_manifest != ext_manifest_bytes:
            raise SystemExit('embedded/external canonical manifests are not byte-identical')
        rows = list(csv.DictReader(io.StringIO(embedded_manifest.decode('utf-8-sig'))))
        if len(rows) != EXPECTED_MANIFEST_ROWS:
            raise SystemExit(f'expected {EXPECTED_MANIFEST_ROWS} manifest rows, got {len(rows)}')
        seen = set()
        source_payload = {}
        for row in rows:
            rel = pathlib.PurePosixPath(row['path'])
            rels = str(rel)
            if rel.is_absolute() or '..' in rel.parts or rels in seen:
                raise SystemExit(f'unsafe/duplicate manifest path: {rels}')
            seen.add(rels)
            if rels not in names:
                raise SystemExit(f'missing source entry in handoff: {rels}')
            data = zf.read(rels)
            if len(data) != int(row['bytes']):
                raise SystemExit(f'byte-size mismatch: {rels}')
            if sha256(data) != row['sha256']:
                raise SystemExit(f'sha256 mismatch: {rels}')
            data.decode('utf-8')
            source_payload['source/' + rels] = data
        expected_names = set(seen) | {MANIFEST_NAME, RECEIPT_NAME}
        if set(names) != expected_names:
            extra = sorted(set(names) - expected_names)
            missing = sorted(expected_names - set(names))
            raise SystemExit(f'handoff entry-set mismatch extra={extra} missing={missing}')
        evidence = {MANIFEST_NAME: embedded_manifest, RECEIPT_NAME: zf.read(RECEIPT_NAME)}
    return source_payload, evidence


def deterministic_tar(path: pathlib.Path, source_payload: dict[str, bytes], evidence: dict[str, bytes]):
    members = dict(source_payload)
    members.update(evidence)
    with path.open('wb') as raw:
        with tarfile.open(fileobj=raw, mode='w', format=tarfile.GNU_FORMAT) as tf:
            for name in sorted(members):
                data = members[name]
                info = tarfile.TarInfo(name=name)
                info.size = len(data)
                info.mode = 0o644
                info.uid = 0
                info.gid = 0
                info.uname = ''
                info.gname = ''
                info.mtime = 0
                info.type = tarfile.REGTYPE
                tf.addfile(info, io.BytesIO(data))


def compress_xz(tar_path: pathlib.Path, carrier_path: pathlib.Path):
    cmd = ['xz', '-9e', '--threads=1', '--check=crc64', '--stdout', str(tar_path)]
    with carrier_path.open('wb') as out:
        subprocess.run(cmd, check=True, stdout=out)


def split_chunks(carrier_path: pathlib.Path, chunk_dir: pathlib.Path):
    raw = carrier_path.read_bytes()
    chunk_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for i, start in enumerate(range(0, len(raw), RAW_CHUNK_BYTES)):
        chunk = raw[start:start + RAW_CHUNK_BYTES]
        filename = f'chunk-{i:03d}.b64'
        encoded = base64.b64encode(chunk) + b'\n'
        target = chunk_dir / filename
        target.write_bytes(encoded)
        rows.append({
            'ordinal': i,
            'filename': filename,
            'raw_bytes': len(chunk),
            'raw_sha256': sha256(chunk),
            'base64_file_bytes': len(encoded),
            'base64_file_sha256': sha256(encoded),
        })
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--handoff', required=True, type=pathlib.Path)
    ap.add_argument('--manifest', required=True, type=pathlib.Path)
    ap.add_argument('--out', required=True, type=pathlib.Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    source_payload, evidence = load_and_verify_handoff(args.handoff, args.manifest)
    tar_path = args.out / 'CR001_R4_225_SOURCE_WITH_EVIDENCE_20260910.tar'
    carrier = args.out / 'CR001_R4_225_SOURCE_WITH_EVIDENCE_20260910.tar.xz'
    deterministic_tar(tar_path, source_payload, evidence)
    compress_xz(tar_path, carrier)
    chunks = split_chunks(carrier, args.out / 'chunks')
    xz_version = subprocess.check_output(['xz', '--version'], text=True).splitlines()[0]
    receipt = {
        'record_version': RECORD_VERSION,
        'handoff_sha256': file_sha(args.handoff),
        'canonical_manifest_sha256': file_sha(args.manifest),
        'manifest_rows': EXPECTED_MANIFEST_ROWS,
        'carrier_recipe': {
            'tar_writer': 'Python tarfile GNU_FORMAT',
            'member_order': 'bytewise lexicographic member name',
            'tar_member_mode': '0644',
            'tar_uid': 0,
            'tar_gid': 0,
            'tar_uname': '',
            'tar_gname': '',
            'tar_mtime': 0,
            'tar_member_type': 'regular-file-only',
            'source_prefix': 'source/',
            'root_evidence': [MANIFEST_NAME, RECEIPT_NAME],
            'compression': 'XZ --format=xz implicit; -9e --threads=1 --check=crc64',
            'xz_version': xz_version,
            'raw_bytes_per_full_chunk': RAW_CHUNK_BYTES,
            'chunk_encoding': 'RFC4648 base64, no wrapping, one LF terminator per file',
            'chunk_naming': 'chunk-%03d.b64',
        },
        'tar_sha256': file_sha(tar_path),
        'tar_bytes': tar_path.stat().st_size,
        'carrier_sha256': file_sha(carrier),
        'carrier_bytes': carrier.stat().st_size,
        'chunk_count': len(chunks),
        'chunks': chunks,
    }
    (args.out / 'TRANSPORT-BUILD-RECEIPT.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (args.out / 'CHUNK-MANIFEST.json').write_text(json.dumps({
        'record_version': 1,
        'carrier_sha256': receipt['carrier_sha256'],
        'carrier_bytes': receipt['carrier_bytes'],
        'raw_bytes_per_full_chunk': RAW_CHUNK_BYTES,
        'chunk_count': len(chunks),
        'encoding': 'base64-rfc4648-single-line-lf',
        'chunks': chunks,
    }, indent=2) + '\n')
    print(json.dumps({k: receipt[k] for k in (
        'handoff_sha256', 'canonical_manifest_sha256', 'manifest_rows',
        'tar_sha256', 'tar_bytes', 'carrier_sha256', 'carrier_bytes', 'chunk_count')}, indent=2))


if __name__ == '__main__':
    main()
