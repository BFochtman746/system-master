#!/usr/bin/env python3
import argparse
import json
import pathlib
import shutil
import subprocess
import tempfile


def run(verifier, contract, manifest, chunks, carrier):
    return subprocess.run([
        'python3', str(verifier), '--contract', str(contract), '--chunk-manifest', str(manifest),
        '--chunks', str(chunks), '--carrier-out', str(carrier)
    ], capture_output=True, text=True)


def edit_json(path, fn):
    obj = json.loads(path.read_text())
    fn(obj)
    path.write_text(json.dumps(obj, indent=2) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--verifier', required=True, type=pathlib.Path)
    ap.add_argument('--contract', required=True, type=pathlib.Path)
    ap.add_argument('--chunk-manifest', required=True, type=pathlib.Path)
    ap.add_argument('--chunks', required=True, type=pathlib.Path)
    a = ap.parse_args()

    base = run(a.verifier, a.contract, a.chunk_manifest, a.chunks, pathlib.Path(tempfile.gettempdir()) / 'r4-good.tar.xz')
    if base.returncode:
        raise SystemExit('baseline failed: ' + base.stderr)
    print('BASELINE=PASS')

    cases = []
    def case(name, mutator): cases.append((name, mutator))

    case('MISSING_CHUNK', lambda c, m, k: (k / 'chunk-002.b64').unlink())
    case('UNEXPECTED_EXTRA_CHUNK', lambda c, m, k: shutil.copy2(k / 'chunk-000.b64', k / 'chunk-005.b64'))
    case('DUPLICATE_PAYLOAD_AS_EXTRA', lambda c, m, k: shutil.copy2(k / 'chunk-001.b64', k / 'chunk-999.b64'))

    def reorder(c, m, k):
        p0 = k / 'chunk-000.b64'
        p1 = k / 'chunk-001.b64'
        x = p0.read_bytes()
        y = p1.read_bytes()
        p0.write_bytes(y)
        p1.write_bytes(x)
    case('REORDERED_NAME_PAYLOAD_MAPPING', reorder)

    def modify(c, m, k):
        p = k / 'chunk-003.b64'
        b = bytearray(p.read_bytes())
        b[20] = 65 if b[20] != 65 else 66
        p.write_bytes(b)
    case('MODIFIED_CHUNK_BYTE', modify)

    case('WRONG_CHUNK_COUNT', lambda c, m, k: edit_json(c, lambda o: o['chunk_contract'].__setitem__('chunk_count', o['chunk_contract']['chunk_count'] + 1)))
    case('WRONG_CHUNK_DIGEST', lambda c, m, k: edit_json(m, lambda o: o['chunks'][0].__setitem__('raw_sha256', '0' * 64)))
    case('WRONG_CARRIER_DIGEST', lambda c, m, k: edit_json(c, lambda o: o['deterministic_carrier'].__setitem__('carrier_sha256', '0' * 64)))
    case('WRONG_CHUNK_ORDINAL', lambda c, m, k: edit_json(m, lambda o: o['chunks'][1].__setitem__('ordinal', 3)))
    case('WRONG_CHUNK_FILENAME_ORDER', lambda c, m, k: edit_json(m, lambda o: o['chunks'][1].__setitem__('filename', 'chunk-003.b64')))
    case('WRONG_CHUNK_MANIFEST_BINDING', lambda c, m, k: edit_json(c, lambda o: o['chunk_contract'].__setitem__('chunk_manifest_sha256', '0' * 64)))
    case('WRONG_SOURCE_MANIFEST_BINDING', lambda c, m, k: edit_json(c, lambda o: o['source_subject'].__setitem__('canonical_manifest_sha256', '0' * 64)))

    for name, mutator in cases:
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            contract = root / 'contract.json'
            manifest = root / 'manifest.json'
            chunks = root / 'chunks'
            shutil.copy2(a.contract, contract)
            shutil.copy2(a.chunk_manifest, manifest)
            shutil.copytree(a.chunks, chunks)
            mutator(contract, manifest, chunks)
            p = run(a.verifier, contract, manifest, chunks, root / 'carrier.tar.xz')
            if p.returncode == 0:
                raise AssertionError(name + ' unexpectedly passed')
            print(name + '=PASS_FAIL_CLOSED')

    print(f'ADVERSARIAL_CASES_PASS={len(cases)}')


if __name__ == '__main__':
    main()
