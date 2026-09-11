#!/usr/bin/env python3
import argparse
import base64
import binascii
import csv
import hashlib
import io
import json
import pathlib
import tarfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fail(msg):
    raise SystemExit(msg)


def load(path):
    return json.loads(path.read_text())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--contract', required=True, type=pathlib.Path)
    ap.add_argument('--chunk-manifest', required=True, type=pathlib.Path)
    ap.add_argument('--chunks', required=True, type=pathlib.Path)
    ap.add_argument('--carrier-out', required=True, type=pathlib.Path)
    ap.add_argument('--extract-out', type=pathlib.Path)
    a = ap.parse_args()

    c = load(a.contract)
    m = load(a.chunk_manifest)
    s = c['source_subject']
    dc = c['deterministic_carrier']
    cc = c['chunk_contract']

    if c.get('owner') != 'SYSTEM_MASTER/DOCUMENTS':
        fail('wrong contract owner')
    if cc['chunk_manifest_sha256'] != sha(a.chunk_manifest.read_bytes()):
        fail('chunk manifest file digest mismatch')
    if m.get('carrier_sha256') != dc['carrier_sha256'] or m.get('carrier_bytes') != dc['carrier_bytes']:
        fail('contract/manifest carrier mismatch')
    if m.get('raw_bytes_per_full_chunk') != cc['raw_bytes_per_full_chunk'] or m.get('chunk_count') != cc['chunk_count']:
        fail('contract/manifest chunk policy mismatch')

    rows = m.get('chunks', [])
    expected_names = [cc['naming'] % i for i in range(cc['chunk_count'])]
    if [r.get('ordinal') for r in rows] != list(range(cc['chunk_count'])):
        fail('chunk ordinal mismatch')
    if [r.get('filename') for r in rows] != expected_names:
        fail('chunk filename/order mismatch')
    actual = sorted(p.name for p in a.chunks.iterdir() if p.is_file() and p.name.startswith('chunk-'))
    if actual != expected_names:
        fail(f'chunk file-set mismatch actual={actual} expected={expected_names}')

    decoded = []
    for i, (name, row) in enumerate(zip(expected_names, rows)):
        encoded = (a.chunks / name).read_bytes()
        if sha(encoded) != row['base64_file_sha256'] or len(encoded) != row['base64_file_bytes']:
            fail(f'base64 file identity mismatch {name}')
        if not encoded.endswith(b'\n') or b'\n' in encoded[:-1] or b'\r' in encoded:
            fail(f'base64 normalization mismatch {name}')
        try:
            raw = base64.b64decode(encoded[:-1], validate=True)
        except binascii.Error as e:
            fail(f'base64 decode failure {name}: {e}')
        if sha(raw) != row['raw_sha256'] or len(raw) != row['raw_bytes']:
            fail(f'raw chunk identity mismatch {name}')
        if i < len(rows) - 1 and len(raw) != cc['raw_bytes_per_full_chunk']:
            fail(f'non-final chunk size mismatch {name}')
        if i == len(rows) - 1 and not 0 < len(raw) <= cc['raw_bytes_per_full_chunk']:
            fail('final chunk size invalid')
        decoded.append(raw)

    carrier = b''.join(decoded)
    if len(carrier) != dc['carrier_bytes'] or sha(carrier) != dc['carrier_sha256']:
        fail('carrier identity mismatch')
    a.carrier_out.parent.mkdir(parents=True, exist_ok=True)
    a.carrier_out.write_bytes(carrier)

    with tarfile.open(fileobj=io.BytesIO(carrier), mode='r:xz') as tf:
        regular = [x for x in tf.getmembers() if x.isfile()]
        if len(regular) != s['regular_carrier_entries']:
            fail(f'carrier regular-entry count mismatch {len(regular)}')
        by = {}
        for member in regular:
            rel = pathlib.PurePosixPath(member.name)
            if rel.is_absolute() or '..' in rel.parts or member.name in by:
                fail(f'unsafe/duplicate carrier path {member.name}')
            fh = tf.extractfile(member)
            if fh is None:
                fail(f'unreadable carrier member {member.name}')
            by[member.name] = fh.read()

    manifest_name = s['canonical_manifest_name']
    receipt = 'RECONSTRUCTION-RECEIPT.json'
    if manifest_name not in by or receipt not in by:
        fail('required carrier evidence missing')
    manifest_bytes = by[manifest_name]
    if sha(manifest_bytes) != s['canonical_manifest_sha256']:
        fail('canonical source manifest digest mismatch')
    source_rows = list(csv.DictReader(io.StringIO(manifest_bytes.decode('utf-8-sig'))))
    if len(source_rows) != s['source_rows']:
        fail(f'source row count mismatch {len(source_rows)}')

    seen = set()
    for row in source_rows:
        rel = pathlib.PurePosixPath(row['path'])
        rs = str(rel)
        if rel.is_absolute() or '..' in rel.parts or rs in seen:
            fail(f'unsafe/duplicate source path {rs}')
        seen.add(rs)
        key = 'source/' + rs
        if key not in by:
            fail(f'missing source {rs}')
        data = by[key]
        if len(data) != int(row['bytes']) or sha(data) != row['sha256']:
            fail(f'source identity mismatch {rs}')
        data.decode('utf-8')

    if set(by) != {'source/' + x for x in seen} | {manifest_name, receipt}:
        fail('carrier has unexpected/missing regular entries')

    if a.extract_out:
        if a.extract_out.exists():
            fail('extract destination already exists')
        source_dest = a.extract_out / 'source'
        evidence_dest = a.extract_out / 'evidence'
        for rs in sorted(seen):
            target = source_dest.joinpath(*pathlib.PurePosixPath(rs).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(by['source/' + rs])
        evidence_dest.mkdir(parents=True, exist_ok=True)
        (evidence_dest / manifest_name).write_bytes(manifest_bytes)
        (evidence_dest / receipt).write_bytes(by[receipt])

    print(json.dumps({
        'result': 'PASS',
        'carrier_sha256': sha(carrier),
        'carrier_bytes': len(carrier),
        'chunks_verified': len(rows),
        'source_rows_verified': len(source_rows)
    }, indent=2))


if __name__ == '__main__':
    main()
