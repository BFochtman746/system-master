#!/usr/bin/env python3
import argparse, importlib.util, json, os, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
V2 = HERE / 'generate-repair005-gate-d-teacher-v2.py'
spec = importlib.util.spec_from_file_location('gate_d_v2', V2)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

VERSION = 'BOOK-EVAL-REPAIR-005-GATE-D-TEACHER-v3'
PER_TOKEN = int(os.environ.get('BOOK_EVAL_TEACHER_EXAMPLES_PER_TOKEN','8'))
BATCH = int(os.environ.get('BOOK_EVAL_TEACHER_BATCH','2'))
GENERATION_ATTEMPTS = int(os.environ.get('BOOK_EVAL_GENERATION_ATTEMPTS','8'))


def prompt_for(task, specialist, token, siblings, n, serials):
    hint = mod.BOUNDARY_HINTS[token]
    near = '; '.join(f'{s}: {mod.BOUNDARY_HINTS[s]}' for s in siblings if s != token)
    mode = {
        'MANUSCRIPT_DIAGNOSIS': 'Write invented provider-style manuscript/evaluation facts that make this diagnosis semantically clear.',
        'PAIRWISE_COMPARISON': 'Write invented Candidate A/Candidate B material plus a clear governing brief.',
        'REVISION_ASSESSMENT': 'Write invented BEFORE/AFTER material plus explicit preservation constraints.'
    }[task]
    return f'''{VERSION}\nYou are an offline teacher creating ORIGINAL synthetic literary-evaluation training material. Never quote, imitate, or transform a named author or existing book. No hidden or scored data is present.\n\nTASK_MODE={task}\nSPECIALIST={specialist}\nTARGET={token}\nTARGET_DEFINITION={hint}\nNEAR_NEIGHBORS={near}\n\n{mode}\n\nGenerate exactly {n} semantically different examples for serials {serials}. Each must unambiguously fit TARGET rather than its near neighbors. Do not write any ontology token inside input_body. Keep each input_body between 140 and 650 characters.\n\nReturn one JSON object only with this exact shape: {{"examples":[{{"input_body":"..."}}]}}. Do not add commentary, explanations, labels, fingerprints, or counterfactual fields.'''


def normalize_body(ex):
    if not isinstance(ex, dict):
        raise ValueError('example not object')
    body = str(ex.get('input_body','')).strip()
    if not (120 <= len(body) <= 900):
        raise ValueError('input_body length')
    leaked = [t for t in mod.BOUNDARY_HINTS if t in body]
    if leaked:
        raise ValueError('ontology token leaked: ' + ','.join(leaked))
    return body


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--taxonomy', required=True)
    ap.add_argument('--out-dir', required=True)
    args = ap.parse_args()

    tax = mod.read_json(args.taxonomy)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rows_path = out / 'GATE-D-TEACHER-SYNTHETIC.jsonl'
    status_path = out / 'GATE-D-TEACHER-STATUS.json'

    done = set()
    if rows_path.exists():
        for line in rows_path.read_text(encoding='utf-8').splitlines():
            if line.strip():
                done.add(json.loads(line)['teacher_record_id'])

    specs = []
    for task, tobj in tax['task_modes'].items():
        for specialist, tokens in tobj['specialists'].items():
            for token in tokens:
                specs.append((task, specialist, token, list(tokens)))

    expected = len(specs) * PER_TOKEN
    added = 0
    for task, specialist, token, siblings in specs:
        pending = []
        for serial in range(1, PER_TOKEN + 1):
            rid = f'DT-{task[:3]}-{specialist[:6]}-{token}-{serial:02d}'
            if rid not in done:
                pending.append((serial, rid))

        pos = 0
        while pos < len(pending):
            chunk = pending[pos:pos+BATCH]
            serials = [x[0] for x in chunk]
            ids = [x[1] for x in chunk]
            prompt = prompt_for(task, specialist, token, siblings, len(chunk), serials)
            last = None
            for generation_try in range(1, GENERATION_ATTEMPTS + 1):
                try:
                    root, raw, http_attempt = mod.call(prompt)
                    obj = json.loads(mod.output_text(root))
                    examples = obj.get('examples')
                    if not isinstance(examples, list) or len(examples) != len(chunk):
                        raise ValueError('wrong example count')
                    bodies = [normalize_body(ex) for ex in examples]
                    last = None
                    break
                except Exception as e:
                    last = e
                    print(f'GATE-D-v3 reject token={token} serials={serials} try={generation_try} error={type(e).__name__}:{e}', flush=True)
                    if generation_try < GENERATION_ATTEMPTS:
                        time.sleep(min(2.0, 0.35 * generation_try))
            if last is not None:
                raise last

            neighbor = next((s for s in siblings if s != token), 'NO_MATERIAL_PROBLEM')
            fingerprint = 'Decisive semantic boundary: ' + mod.BOUNDARY_HINTS[token]
            counterfactual = 'Counterfactual neighbor ' + neighbor + ': alter the decisive facts so that ' + mod.BOUNDARY_HINTS.get(neighbor, neighbor)
            for rid, serial, body in zip(ids, serials, bodies):
                text = body + '\nREFERENCE_LABELS: REF_A, REF_B, DECOY_1'
                row = {
                    'teacher_record_id': rid,
                    'task_mode': task,
                    'specialist_id': specialist,
                    'target_token': token,
                    'input_text': text,
                    'semantic_fingerprint': fingerprint,
                    'counterfactual_neighbor': counterfactual,
                    'serial': serial,
                    'source_lane': 'TEACHER_SYNTHETIC',
                    'rights_class': 'SYNTHETIC_ORIGINAL',
                    'hidden_holdout_gold_used': False,
                    'visible_regression_gold_used': False,
                    'teacher_model': mod.MODEL,
                    'teacher_request_id': root.get('id'),
                    'generation_attempt': http_attempt,
                    'generation_prompt_sha256': mod.sha(prompt),
                    'raw_response_sha256': mod.sha(raw),
                    'teacher_version': VERSION,
                    'metadata_synthesis': 'DETERMINISTIC_FROM_PUBLIC_TAXONOMY'
                }
                with open(rows_path, 'a', encoding='utf-8') as f:
                    f.write(json.dumps(row, sort_keys=True, separators=(',',':')) + '\n')
                done.add(rid)
                added += 1

            status = {
                'objective': 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
                'state': 'TEACHER_DISTILLATION_IN_PROGRESS',
                'teacher_version': VERSION,
                'teacher_model': mod.MODEL,
                'expected_records': expected,
                'completed_records': len(done),
                'added_this_run': added,
                'examples_per_token': PER_TOKEN,
                'batch_size': BATCH,
                'hidden_holdout_gold_used': False,
                'visible_regression_gold_used': False
            }
            status_path.write_text(json.dumps(status, indent=2, sort_keys=True) + '\n', encoding='utf-8')
            print(f'GATE-D-v3 teacher {len(done)}/{expected} token={token}', flush=True)
            pos += len(chunk)

    status = {
        'objective': 'BOOK-EVAL-LEMONADE-001-REPAIR-005-GATE-D',
        'state': 'TEACHER_SYNTHETIC_FROZEN',
        'teacher_version': VERSION,
        'teacher_model': mod.MODEL,
        'expected_records': expected,
        'completed_records': len(done),
        'added_this_run': added,
        'examples_per_token': PER_TOKEN,
        'batch_size': BATCH,
        'hidden_holdout_gold_used': False,
        'visible_regression_gold_used': False,
        'output_sha256': mod.fsha(rows_path),
        'taxonomy_sha256': mod.fsha(args.taxonomy)
    }
    status_path.write_text(json.dumps(status, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps(status, indent=2, sort_keys=True), flush=True)
    if len(done) != expected:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
