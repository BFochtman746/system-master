#!/usr/bin/env python3
import argparse
import base64
import collections
import gzip
import hashlib
import json
import lzma
import pathlib
import subprocess

XLSX_SHA256 = 'dee2126069ef769983e305b2a351d7583cab02722dbdf32c82a5c36ff6a8b8bc'
XLSX_BYTES = 303526
ENCODED_BYTES = 64296
ENCODED_SHA256 = '3897fc8b40151a1bb2ba7fb13fd17dc0a3e969720c2cd3e88295b071a20a4dbd'
XZ_BYTES = 48220
XZ_SHA256 = '0131f413c11630f3cac996122bb91a7ab682ed1ca093c39b620e50cdbfdd2393'
XZ_GIT_BLOB = '98a43b0e936677def435a0de261d53c6895bff07'
RAW_BYTES = 1673268
RAW_SHA256 = '1f3f325048af88a20c776f3f9aad8f8faf14cf878a39e780952e099b4d3cac83'
SOURCE_005_SHA = 'ded21b569e29b7d162c50f7cb0692874e3f3acc2'
QUALIFICATION_ID = 'CR001-R4-GITHUB-NATIVE-QUALIFICATION-005'
BASE_006_SHA = '7c720c41c15a7e569368f3923f706ca89a97c037'
EXPECTED_COLUMNS = {
    'capability_id','pillar','stage','domain','atomic_capability','requirement',
    'target_support','current_status','current_evidence','source_claim_ids',
    'dependencies','defect_refs','standard_refs','next_packet','notes'
}
EXPECTED_OWNERS = collections.Counter({
    'SYSTEM_MASTER/DOCUMENTS': 2802,
    'DOCUMENTS_DOMAIN_FOUNDATION__CORE_SHARED_BOUNDARY_REVIEW': 88,
    'DOCUMENTS_DOMAIN_QUALIFICATION__CORE_SHARED_ASSURANCE_DEPENDENCY': 25,
    'DOCUMENTS_DOCUMENT_SECURITY__CORE_SHARED_DEPENDENCY': 20,
})
EXPECTED_EVIDENCE = collections.Counter({
    'RECOVERED_IMPLEMENTATION_OR_EVIDENCE__STANDING_AS_RECORDED': 1612,
    'REQUIREMENT_ONLY_OR_BACKFILL_REQUIRED': 690,
    'HISTORICAL_EXACT_SUBJECT_EVIDENCE__CURRENT_REQUALIFICATION_REQUIRED': 553,
    'CURRENT_EXACT_SUBJECT_005__T13_T14_FRESH_REQUALIFICATION_PASS': 80,
})

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def git_blob(path: pathlib.Path) -> str:
    return subprocess.check_output(['git','hash-object',str(path)], text=True).strip()

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--incoming', required=True)
    ap.add_argument('--trigger-sha', required=True)
    ap.add_argument('--run-id', required=True, type=int)
    args = ap.parse_args()

    incoming = pathlib.Path(args.incoming)
    expected = [incoming / f'part-{i:03d}.b64' for i in range(33)]
    actual = sorted(incoming.glob('part-*.b64'))
    if actual != expected:
        raise SystemExit(f'carrier fileset mismatch: {len(actual)} files')
    for i, p in enumerate(expected):
        want = 2000 if i < 32 else 296
        if p.stat().st_size != want:
            raise SystemExit(f'carrier part size mismatch: {p}={p.stat().st_size}, expected={want}')
    extras = [p.name for p in incoming.iterdir() if p not in expected]
    if extras:
        raise SystemExit(f'unexpected incoming files: {extras}')

    encoded = b''.join(p.read_bytes() for p in expected)
    if len(encoded) != ENCODED_BYTES or sha256(encoded) != ENCODED_SHA256:
        raise SystemExit('encoded carrier identity mismatch')
    compressed = base64.b64decode(encoded, validate=True)
    if len(compressed) != XZ_BYTES or sha256(compressed) != XZ_SHA256:
        raise SystemExit('compressed denominator identity mismatch')
    raw = lzma.decompress(compressed)
    if len(raw) != RAW_BYTES or sha256(raw) != RAW_SHA256:
        raise SystemExit('raw denominator identity mismatch')

    rows = [json.loads(line) for line in raw.decode('utf-8').splitlines()]
    if len(rows) != 2935:
        raise SystemExit(f'row denominator mismatch: {len(rows)}')
    if any(set(row) != EXPECTED_COLUMNS for row in rows):
        raise SystemExit('15-column schema mismatch')
    ids = [str(row['capability_id']) for row in rows]
    if len(set(ids)) != 2935:
        raise SystemExit('capability IDs not unique')
    docx = [x for x in ids if x.startswith('UDM-DOCX-')]
    nums = sorted(int(x.rsplit('-', 1)[1]) for x in docx)
    if len(docx) != 674 or nums != list(range(1, 675)):
        raise SystemExit('DOCX denominator mismatch')
    if sum(595 <= n <= 634 for n in nums) != 40 or sum(635 <= n <= 674 for n in nums) != 40:
        raise SystemExit('T13/T14 denominator mismatch')
    r674 = next(row for row in rows if row['capability_id'] == 'UDM-DOCX-0674')
    text = str(r674['atomic_capability'])
    if 'full ISO XSD conformance' not in text or 'exact Microsoft Word fidelity' not in text:
        raise SystemExit('UDM-DOCX-0674 nonclaim boundary missing')

    root = pathlib.Path('governance/documents/capability-ledger')
    root.mkdir(parents=True, exist_ok=True)
    denominator = root / 'ATOMIC_CAPABILITY_LEDGER_CR001_PROMOTED.atomic-capabilities.jsonl.xz'
    denominator.write_bytes(compressed)
    if git_blob(denominator) != XZ_GIT_BLOB:
        raise SystemExit('denominator Git blob mismatch')

    overlay = []
    for row in rows:
        cid = str(row['capability_id'])
        pillar = str(row.get('pillar') or '')
        status = str(row.get('current_status') or '')
        owner = {
            'FOUNDATION': 'DOCUMENTS_DOMAIN_FOUNDATION__CORE_SHARED_BOUNDARY_REVIEW',
            'QUALIFICATION': 'DOCUMENTS_DOMAIN_QUALIFICATION__CORE_SHARED_ASSURANCE_DEPENDENCY',
            'SECURITY': 'DOCUMENTS_DOCUMENT_SECURITY__CORE_SHARED_DEPENDENCY',
        }.get(pillar, 'SYSTEM_MASTER/DOCUMENTS')
        n = int(cid.rsplit('-', 1)[1]) if cid.startswith('UDM-DOCX-') else None
        if n is not None and 595 <= n <= 674:
            evidence = 'CURRENT_EXACT_SUBJECT_005__T13_T14_FRESH_REQUALIFICATION_PASS'
            binding = f'{QUALIFICATION_ID}@{SOURCE_005_SHA}'
        elif 'VERIFIED' in status and not status.startswith('PARTIAL'):
            evidence = 'HISTORICAL_EXACT_SUBJECT_EVIDENCE__CURRENT_REQUALIFICATION_REQUIRED'
            binding = None
        elif (('PENDING' in status and not status.startswith('PARTIAL')) or status == 'ENGINE_REQUIRED'):
            evidence = 'REQUIREMENT_ONLY_OR_BACKFILL_REQUIRED'
            binding = None
        else:
            evidence = 'RECOVERED_IMPLEMENTATION_OR_EVIDENCE__STANDING_AS_RECORDED'
            binding = None
        overlay.append({
            'capability_id': cid,
            'source_pillar': pillar,
            'source_current_status': status,
            'reconciled_owner_disposition': owner,
            'evidence_class': evidence,
            'qualification_binding': binding,
            'historical_pass_transfer': False,
        })

    owners = collections.Counter(x['reconciled_owner_disposition'] for x in overlay)
    evidence_counts = collections.Counter(x['evidence_class'] for x in overlay)
    if owners != EXPECTED_OWNERS:
        raise SystemExit(f'owner counts mismatch: {owners}')
    if evidence_counts != EXPECTED_EVIDENCE:
        raise SystemExit(f'evidence counts mismatch: {evidence_counts}')

    overlay_raw = ''.join(json.dumps(x, sort_keys=True, separators=(',', ':')) + '\n' for x in overlay).encode()
    overlay_path = root / 'CURRENT_CAPABILITY_OWNER_EVIDENCE_OVERLAY_007.jsonl.gz'
    overlay_path.write_bytes(gzip.compress(overlay_raw, compresslevel=9, mtime=0))

    provenance = {
        'record_id': 'DOCUMENTS-R4-PROMOTED-CAPABILITY-LEDGER-SOURCE-007',
        'source_artifact': 'ATOMIC_CAPABILITY_LEDGER_CR001_PROMOTED.xlsx',
        'source_artifact_bytes': XLSX_BYTES,
        'source_artifact_sha256': XLSX_SHA256,
        'source_artifact_literal_binary_committed': False,
        'git_native_denominator_representation': str(denominator),
        'representation_scope': 'LOSSLESS_ATOMIC_CAPABILITY_LEDGER_SHEET__ALL_2935_ROWS__ALL_15_COLUMNS',
        'representation_rows': 2935,
        'representation_raw_bytes': RAW_BYTES,
        'representation_raw_sha256': RAW_SHA256,
        'representation_xz_bytes': XZ_BYTES,
        'representation_xz_sha256': XZ_SHA256,
        'representation_git_blob_sha1': XZ_GIT_BLOB,
        'promotion_provenance': {
            'repair_packet': 'DOCUMENT-DOCX-CLOSURE-REPAIR-001',
            'exit_gate': 'CUMULATIVE_DOCX_SOURCE_AND_LEDGER_RECONCILIATION_PASS',
        },
        'nonclaim': 'The XLSX digest is provenance-bound; 007 imports the exact 2935-row capability denominator as a lossless Git-native logical representation and does not claim the literal XLSX binary is committed.',
    }
    (root / 'SOURCE-ARTIFACT-PROVENANCE-007.json').write_text(json.dumps(provenance, indent=2, sort_keys=True) + '\n')

    summary = {
        'schema': 'DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-007',
        'date': '2026-09-11',
        'standing': 'PASS__EXACT_PROMOTED_2935_DENOMINATOR_ADMITTED__CURRENT_OWNER_EVIDENCE_OVERLAY_BOUND',
        'workflow_trigger_sha': args.trigger_sha,
        'denominator': {
            'unique_capabilities': 2935,
            'docx_rows': 674,
            't13_rows': 40,
            't14_rows': 40,
            'raw_sha256': RAW_SHA256,
            'xz_sha256': XZ_SHA256,
            'git_blob_sha1': XZ_GIT_BLOB,
        },
        'source_xlsx': {'filename': 'ATOMIC_CAPABILITY_LEDGER_CR001_PROMOTED.xlsx', 'bytes': XLSX_BYTES, 'sha256': XLSX_SHA256},
        'overlay': {
            'path': str(overlay_path),
            'bytes': overlay_path.stat().st_size,
            'sha256': sha256(overlay_path.read_bytes()),
            'git_blob_sha1': git_blob(overlay_path),
            'rows': 2935,
            'owner_counts': dict(owners),
            'evidence_class_counts': dict(evidence_counts),
        },
        'current_exact_subject_binding': {
            'source_subject_sha': SOURCE_005_SHA,
            'qualification_id': QUALIFICATION_ID,
            'fresh_t13_t14_rows_bound': 80,
        },
        'historical_pass_transfer': False,
        'nonclaims': [
            'LITERAL_XLSX_BINARY_COMMITTED','ALL_2935_CURRENTLY_IMPLEMENTED','ALL_2935_CURRENTLY_QUALIFIED',
            'FULL_ISO_XSD_CONFORMANCE','EXACT_MICROSOFT_WORD_FIDELITY','A01_PASS','PRODUCTION_PASS',
            'DOCUMENTS_COMPLETE','FIRST_CLASS_DOCUMENT_SYSTEM_CREATED'
        ],
    }
    (root / 'CURRENT-CAPABILITY-LEDGER-ADMISSION-007.json').write_text(json.dumps(summary, indent=2, sort_keys=True) + '\n')

    receipt = {
        'receipt_id': 'DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-CLOSURE-RECEIPT-007',
        'date': '2026-09-11',
        'owner': 'SYSTEM_MASTER/DOCUMENTS',
        'work_package': 'DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-007',
        'standing': 'CLOSED_PASS__EXACT_2935_DENOMINATOR_ADMITTED__CURRENT_OWNER_EVIDENCE_OVERLAY_BOUND',
        '006_base_commit': BASE_006_SHA,
        'workflow_trigger_sha': args.trigger_sha,
        'workflow_run_id': args.run_id,
        'source_xlsx_sha256': XLSX_SHA256,
        'source_xlsx_bytes': XLSX_BYTES,
        'literal_xlsx_binary_committed': False,
        'denominator_representation': 'LOSSLESS_ATOMIC_CAPABILITY_LEDGER_SHEET__ALL_2935_ROWS__ALL_15_COLUMNS',
        'denominator_raw_sha256': RAW_SHA256,
        'denominator_xz_sha256': XZ_SHA256,
        'denominator_git_blob_sha1': XZ_GIT_BLOB,
        'unique_capabilities': 2935,
        'docx_rows': 674,
        't13_rows': 40,
        't14_rows': 40,
        'overlay_sha256': summary['overlay']['sha256'],
        'overlay_git_blob_sha1': summary['overlay']['git_blob_sha1'],
        'overlay_rows': 2935,
        'owner_counts': summary['overlay']['owner_counts'],
        'evidence_class_counts': summary['overlay']['evidence_class_counts'],
        'fresh_005_t13_t14_bindings': 80,
        'admitted_source_subject_sha': SOURCE_005_SHA,
        'qualification_id': QUALIFICATION_ID,
        'source_mutated': False,
        'transport_payload_mutated': False,
        'ready_mutated': False,
        'qualification_mutated': False,
        'historical_pass_transfer': False,
        'nonclaims': [
            'LITERAL_XLSX_BINARY_COMMITTED','ALL_2935_CURRENTLY_IMPLEMENTED','ALL_2935_CURRENTLY_QUALIFIED',
            'FULL_ISO_XSD_CONFORMANCE','EXACT_MICROSOFT_WORD_FIDELITY','A01_PASS','PRODUCTION_PASS','DOCUMENTS_COMPLETE'
        ],
        'next_permitted_operation': 'DOCUMENTS-R4-CAPABILITY-TRACE-RECONCILIATION-008 — bind the admitted 2935 capability denominator to current source/component/interface/test/dependency evidence, preserving owner and qualification boundaries and producing an exact open/reuse/repair/build denominator without completion inflation.',
    }
    recon = pathlib.Path('documents/reconciliation')
    recon.mkdir(parents=True, exist_ok=True)
    (recon / 'DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-CLOSURE-RECEIPT-007.json').write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n')
    (recon / 'DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-007.md').write_text(
        '# DOCUMENTS-R4-CURRENT-CAPABILITY-LEDGER-ADMISSION-007\n\n'
        'Status: CLOSED / PASS — EXACT 2,935-CAPABILITY DENOMINATOR ADMITTED / CURRENT OWNER-EVIDENCE OVERLAY BOUND\n\n'
        'The exact 2,935-row, 15-column Atomic Capability Ledger denominator from `ATOMIC_CAPABILITY_LEDGER_CR001_PROMOTED.xlsx` is admitted as a lossless canonical Git-native representation. '
        f'The original XLSX is provenance-bound by {XLSX_BYTES:,}-byte size and SHA-256 `{XLSX_SHA256}`; this package does not claim that the literal XLSX binary is committed. '
        'Counts are 2,935 unique capabilities, 674 DOCX, T13 40, T14 40. Historical PASS is not transferred. Frozen 005 source, transport chunks, READY, and qualification remain unchanged.\n'
    )
    print(json.dumps({'result':'PASS','unique_capabilities':2935,'docx_rows':674,'t13_rows':40,'t14_rows':40,'denominator_git_blob_sha1':XZ_GIT_BLOB,'overlay_sha256':summary['overlay']['sha256']}, sort_keys=True))

if __name__ == '__main__':
    main()
