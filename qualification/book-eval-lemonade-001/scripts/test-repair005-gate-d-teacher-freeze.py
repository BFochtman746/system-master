#!/usr/bin/env python3
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FREEZE = HERE / 'freeze-repair005-gate-d-teacher.py'
VALIDATE = HERE / 'validate-repair005-gate-d-teacher.py'
TASK = 'MANUSCRIPT_DIAGNOSIS'
SPECIALIST = 'SPECFREEZE'
TOKENS = [f'TEST_TOKEN_{i:02d}' for i in range(55)]


def sha(path):
    h = hashlib.sha256()
    h.update(Path(path).read_bytes())
    return h.hexdigest()


def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, indent=2, sort_keys=True) + '\n', encoding='utf-8')


def taxonomy(path):
    write_json(path, {
        'task_modes': {
            TASK: {'specialists': {SPECIALIST: TOKENS}}
        }
    })


def row(token, serial):
    rid = f'DT-{TASK[:3]}-{SPECIALIST[:6]}-{token}-{serial:02d}'
    return {
        'teacher_record_id': rid,
        'task_mode': TASK,
        'specialist_id': SPECIALIST,
        'target_token': token,
        'input_text': f'Invented evaluation facts for slot {serial}; no ontology names appear here.\nREFERENCE_LABELS: REF_A, REF_B, DECOY_1',
        'semantic_fingerprint': 'Decisive semantic distinction is represented by synthetic facts only.',
        'counterfactual_neighbor': 'Counterfactual changes the decisive facts to a nearby semantic boundary.',
        'serial': serial,
        'source_lane': 'TEACHER_SYNTHETIC',
        'rights_class': 'SYNTHETIC_ORIGINAL',
        'hidden_holdout_gold_used': False,
        'visible_regression_gold_used': False,
        'teacher_model': 'synthetic-test-model',
        'teacher_version': 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-v3',
        'metadata_synthesis': 'DETERMINISTIC_FROM_PUBLIC_TAXONOMY'
    }


def corpus():
    return [row(token, serial) for token in TOKENS for serial in range(1, 9)]


def write_rows(path, rows):
    with Path(path).open('w', encoding='utf-8', newline='\n') as f:
        for item in rows:
            f.write(json.dumps(item, sort_keys=True, separators=(',', ':')) + '\n')


def write_status(path, raw, tax):
    write_json(path, {
        'objective': 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
        'state': 'TEACHER_SYNTHETIC_FROZEN',
        'teacher_version': 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-v3',
        'teacher_model': 'synthetic-test-model',
        'expected_records': 440,
        'completed_records': 440,
        'hidden_holdout_gold_used': False,
        'visible_regression_gold_used': False,
        'output_sha256': sha(raw),
        'taxonomy_sha256': sha(tax)
    })


def freeze_case(root, rows, expect_pass):
    raw = root / 'raw.jsonl'
    tax = root / 'taxonomy.json'
    status = root / 'status.json'
    output = root / 'canonical.jsonl'
    manifest = root / 'manifest.json'
    taxonomy(tax)
    write_rows(raw, rows)
    write_status(status, raw, tax)
    cmd = [sys.executable, str(FREEZE), '--raw', str(raw), '--status', str(status), '--taxonomy', str(tax), '--output', str(output), '--manifest', str(manifest), '--expected-raw-sha', sha(raw)]
    result = subprocess.run(cmd, text=True, capture_output=True)
    if expect_pass and result.returncode != 0:
        raise AssertionError(f'freeze unexpectedly failed: {result.stdout}\n{result.stderr}')
    if not expect_pass and result.returncode == 0:
        raise AssertionError('freeze unexpectedly passed')
    return output, manifest


def main():
    base = corpus()
    assert len(base) == 440

    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / 'unique'
        root.mkdir()
        output, manifest = freeze_case(root, base, True)
        m = json.loads(manifest.read_text(encoding='utf-8'))
        assert m['canonical_records'] == 440
        assert m['duplicate_physical_rows_removed'] == 0
        checked = subprocess.run([sys.executable, str(VALIDATE), '--rows', str(output), '--taxonomy', str(root / 'taxonomy.json'), '--examples-per-token', '8'], text=True, capture_output=True)
        assert checked.returncode == 0, checked.stdout + checked.stderr

    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / 'exact-duplicate'
        root.mkdir()
        rows = list(base) + [dict(base[0])]
        output, manifest = freeze_case(root, rows, True)
        m = json.loads(manifest.read_text(encoding='utf-8'))
        assert m['raw_physical_records'] == 441
        assert m['unique_teacher_ids'] == 440
        assert m['canonical_records'] == 440
        assert m['duplicate_teacher_id_count'] == 1
        assert m['duplicate_physical_rows_removed'] == 1
        assert len(output.read_text(encoding='utf-8').splitlines()) == 440

    with tempfile.TemporaryDirectory() as td:
        root = Path(td) / 'conflicting-duplicate'
        root.mkdir()
        divergent = dict(base[0])
        divergent['input_text'] = 'Different invented facts for the same slot create a conflicting duplicate.\nREFERENCE_LABELS: REF_A, REF_B, DECOY_1'
        _, manifest = freeze_case(root, list(base) + [divergent], False)
        m = json.loads(manifest.read_text(encoding='utf-8'))
        assert m['state'] == 'TEACHER_FREEZE_CONFLICT'
        assert m['failure_reason'] == 'duplicate teacher IDs contain conflicting payloads'
        assert m['unique_teacher_ids'] == 440
        assert len(m['conflicting_duplicate_ids']) == 1

    wrapper = (HERE.parent.parent.parent / '.github' / 'scripts' / 'book-eval-repair005-gate-d-teacher-freeze-qualify.js')
    text = wrapper.read_text(encoding='utf-8')
    for forbidden in ['BASE_TRAINING_PATH', 'DEVELOPMENT_GOLD_PATH', 'hidden-holdout', 'visible-regression']:
        if forbidden in text:
            raise AssertionError(f'teacher-only qualifier contains forbidden downstream/private dependency token: {forbidden}')
    if 'raw_teacher_persisted_to_evidence: false' not in text or 'canonical_teacher_persisted_to_evidence: false' not in text:
        raise AssertionError('teacher qualifier must explicitly refuse corpus persistence to evidence')

    print('BOOK_EVAL_GATE_D_TEACHER_FREEZE_SELFTEST=PASS cases=unique,exact-duplicate,conflicting-duplicate records=440')


if __name__ == '__main__':
    main()
