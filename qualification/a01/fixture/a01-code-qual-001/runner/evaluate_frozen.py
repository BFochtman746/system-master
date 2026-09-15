#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import sqlite3
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path, timeout: int = 120) -> dict:
    try:
        p = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, timeout=timeout)
        return {'cmd': cmd, 'returncode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr}
    except Exception as exc:
        return {'cmd': cmd, 'returncode': 999, 'stdout': '', 'stderr': f'{type(exc).__name__}: {exc}'}


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'cannot import {path}')
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def add(results: dict, name: str, ok: bool, detail=None) -> None:
    results[name] = {'ok': bool(ok), 'detail': detail}


def summarize(results: dict) -> dict:
    vals = [v for v in results.values() if isinstance(v, dict) and 'ok' in v]
    return {
        'passed': sum(1 for v in vals if v['ok']),
        'failed': sum(1 for v in vals if not v['ok']),
        'checks': results,
    }


def hidden_python(candidate: Path, cases: dict) -> dict:
    results: dict[str, object] = {}
    try:
        mod = load_module('a01_candidate_store', candidate / 'python' / 'store.py')
        Store, Conflict = mod.Store, mod.Conflict
    except Exception as exc:
        return {'passed': 0, 'failed': 1, 'checks': {'import': {'ok': False, 'detail': str(exc)}}}

    class Clock:
        def __init__(self, now=1000.0): self.now = float(now)
        def __call__(self): return self.now

    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / 'stress.db'
        rid = cases['request_ids'][0]
        workers = int(cases['concurrency_workers'])
        c = Clock()

        def claim(i: int):
            s = Store(db, clock=c, lease_seconds=int(cases['lease_seconds']))
            try:
                try:
                    return ('ok', s.claim(rid, f'worker-{i}', 'alpha'))
                except Exception as exc:
                    return ('err', type(exc).__name__, str(exc))
            finally:
                s.close()

        with ThreadPoolExecutor(max_workers=workers) as ex:
            responses = list(ex.map(claim, range(workers)))
        oks = [r[1] for r in responses if r[0] == 'ok']
        errs = [r for r in responses if r[0] == 'err']
        add(results, 'concurrent_claim_no_errors', len(errs) == 0, errs)
        add(results, 'concurrent_claim_single_acquired', len(oks) == workers and sum(bool(v[1]) for v in oks) == 1)
        try:
            con = sqlite3.connect(db)
            row = con.execute('SELECT COUNT(*), MIN(generation), MAX(generation), MIN(payload), MAX(payload) FROM claims WHERE request_id=?', (rid,)).fetchone()
            con.close()
            add(results, 'concurrent_claim_single_durable_row', row[0] == 1, row)
            add(results, 'concurrent_claim_generation_stable', row[1] == 1 and row[2] == 1, row)
            add(results, 'concurrent_claim_payload_stable', row[3] == 'alpha' and row[4] == 'alpha', row)
        except Exception as exc:
            add(results, 'concurrent_claim_single_durable_row', False, str(exc))
            add(results, 'concurrent_claim_generation_stable', False, str(exc))
            add(results, 'concurrent_claim_payload_stable', False, str(exc))

        s = Store(db, clock=c, lease_seconds=int(cases['lease_seconds']))
        try:
            existing = s.get(rid)
            replay, replay_new = s.claim(rid, 'other-owner', 'alpha')
            add(results, 'idempotent_replay_not_new', replay_new is False)
            add(results, 'idempotent_replay_preserves_claim', replay == existing, {'existing': repr(existing), 'replay': repr(replay)})
            before = s.get(rid)
            conflict_raised = False
            try:
                s.claim(rid, 'other-owner', 'DIFFERENT')
            except Conflict:
                conflict_raised = True
            except Exception as exc:
                add(results, 'conflict_uses_declared_exception', False, type(exc).__name__)
            else:
                add(results, 'conflict_uses_declared_exception', False, 'no exception')
            if conflict_raised:
                add(results, 'conflict_uses_declared_exception', True)
            add(results, 'conflict_preserves_durable_state', s.get(rid) == before)

            rid2 = cases['request_ids'][1]
            first, _ = s.claim(rid2, 'owner-a', 'payload')
            add(results, 'premature_recovery_not_acquired', s.recover(rid2, 'owner-b')[1] is False)
            c.now = first.expires_at + 0.001
            second, took = s.recover(rid2, 'owner-b')
            add(results, 'expired_recovery_acquired', took is True)
            add(results, 'expired_recovery_generation_once', second.generation == first.generation + 1, (first.generation, second.generation))
            add(results, 'expired_recovery_owner_changed', second.owner == 'owner-b', second.owner)
            add(results, 'stale_complete_rejected', s.complete(rid2, first.owner, first.generation) is False)
            old_exp = second.expires_at
            c.now += 1
            add(results, 'stale_renew_rejected', s.renew(rid2, first.owner, first.generation) is False)
            add(results, 'current_renew_accepted', s.renew(rid2, second.owner, second.generation) is True)
            renewed = s.get(rid2)
            add(results, 'renew_extends_expiry', renewed is not None and renewed.expires_at > old_exp, getattr(renewed, 'expires_at', None))
            add(results, 'current_complete_accepted', s.complete(rid2, second.owner, second.generation) is True)
            add(results, 'repeat_complete_no_second_effect', s.complete(rid2, second.owner, second.generation) is False)
            add(results, 'done_cannot_renew', s.renew(rid2, second.owner, second.generation) is False)
        except Exception as exc:
            add(results, 'python_semantics_unhandled_exception', False, f'{type(exc).__name__}: {exc}')
        finally:
            s.close()

        try:
            s2 = Store(db, clock=c, lease_seconds=int(cases['lease_seconds']))
            row = s2.get(cases['request_ids'][1])
            add(results, 'restart_preserves_done', row is not None and row.status == 'DONE')
            add(results, 'restart_preserves_generation', row is not None and row.generation >= 2, getattr(row, 'generation', None))
            s2.close()
        except Exception as exc:
            add(results, 'restart_preserves_done', False, str(exc))
            add(results, 'restart_preserves_generation', False, str(exc))

        try:
            rid3 = cases['request_ids'][2]
            c3 = Clock(5000)
            setup = Store(db, clock=c3, lease_seconds=5)
            initial, _ = setup.claim(rid3, 'owner-0', 'p')
            setup.close()
            c3.now = initial.expires_at + 1

            def recover(i: int):
                st = Store(db, clock=c3, lease_seconds=5)
                try:
                    return st.recover(rid3, f'recover-{i}')
                except Exception as exc:
                    return exc
                finally:
                    st.close()

            with ThreadPoolExecutor(max_workers=workers) as ex:
                rr = list(ex.map(recover, range(workers)))
            tuples = [x for x in rr if isinstance(x, tuple)]
            errors = [x for x in rr if isinstance(x, Exception)]
            add(results, 'concurrent_recovery_no_errors', len(errors) == 0, [type(x).__name__ for x in errors])
            add(results, 'concurrent_recovery_single_acquired', len(tuples) == workers and sum(bool(x[1]) for x in tuples) == 1)
            check = Store(db, clock=c3, lease_seconds=5)
            final = check.get(rid3)
            check.close()
            add(results, 'concurrent_recovery_single_generation_bump', final is not None and final.generation == initial.generation + 1, getattr(final, 'generation', None))
        except Exception as exc:
            add(results, 'concurrent_recovery_no_errors', False, str(exc))
            add(results, 'concurrent_recovery_single_acquired', False, str(exc))
            add(results, 'concurrent_recovery_single_generation_bump', False, str(exc))

    return summarize(results)


def hidden_javascript(candidate: Path, cases: dict) -> dict:
    results = {}
    test_cases = [
        (None, False, 'null'),
        ({}, False, 'missing fields'),
        ({'requestId': None, 'owner': 'x', 'payload': 'p'}, False, 'null id'),
        ({'requestId': 'r', 'owner': None, 'payload': 'p'}, False, 'null owner'),
        ({'requestId': 'r', 'owner': 'o', 'payload': {'danger': True}}, False, 'object payload'),
        ({'requestId': 'r', 'owner': 'o', 'payload': ['x']}, False, 'array payload'),
        ({'requestId': 'r', 'owner': 'o', 'payload': 7}, False, 'number payload'),
        ({'requestId': 'r', 'owner': 'o', 'payload': 'p', 'extra': True}, False, 'unknown field'),
        ({'requestId': 'bad id', 'owner': 'o', 'payload': 'p'}, False, 'invalid id chars'),
        ({'requestId': 'r', 'owner': 'bad owner', 'payload': 'p'}, False, 'invalid owner chars'),
        ({'requestId': 'r' * 65, 'owner': 'o', 'payload': 'p'}, False, 'id too long'),
        ({'requestId': 'r', 'owner': 'o', 'payload': 'x' * 1025}, False, 'payload too long'),
        ({'requestId': 'r', 'owner': 'o', 'payload': 'a\u0000b'}, False, 'nul payload'),
        ({'requestId': ' r-1 ', 'owner': ' worker:1 ', 'payload': 'alpha'}, True, 'valid trim'),
    ]
    js_cases = json.dumps([x[0] for x in test_cases], ensure_ascii=False)
    js = f"""
import {{ validateRequest }} from './javascript/validate.js';
const cases = {js_cases};
for (let i=0; i<cases.length; i++) {{
  let r;
  try {{ r = validateRequest(cases[i]); }} catch (e) {{ r = {{ok:false, thrown:String(e)}}; }}
  console.log(JSON.stringify({{i, result:r}}));
}}
"""
    script = candidate / '.hidden-validate.mjs'
    script.write_text(js, encoding='utf-8')
    try:
        res = run(['node', script.name], candidate)
        lines = [line for line in res['stdout'].splitlines() if line.strip()]
        parsed = []
        for line in lines:
            try: parsed.append(json.loads(line))
            except Exception: pass
        by_i = {int(x['i']): x['result'] for x in parsed if 'i' in x}
        for i, (_, expected, label) in enumerate(test_cases):
            got = by_i.get(i, {})
            add(results, f'validation_{i}_{label.replace(" ", "_")}', bool(got.get('ok')) is expected, got)
        valid = by_i.get(len(test_cases)-1, {})
        add(results, 'validation_trims_identifiers', valid.get('requestId') == 'r-1' and valid.get('owner') == 'worker:1', valid)
        add(results, 'validation_preserves_payload', valid.get('payload') == 'alpha', valid)
    finally:
        script.unlink(missing_ok=True)
    return summarize(results)


def canonical_expected(request_id: str, payload: str) -> str:
    import re
    normalized = payload.replace('\r\n', '\n').replace('\r', '\n')
    normalized = re.sub(r'[ \t\n\f]+', ' ', normalized).strip()
    return f'{request_id.strip()}:{normalized}'


def hidden_cross_language(candidate: Path, cases: dict) -> dict:
    results = {}
    vectors = []
    for i, payload in enumerate(cases['payloads'][:6]):
        rid = cases['request_ids'][3 + i]
        vectors.append((f' {rid} ', payload))

    pyvals = {}
    try:
        mod = load_module('a01_candidate_canonical', candidate / 'python' / 'canonical.py')
        for i, (rid, payload) in enumerate(vectors):
            pyvals[i] = (mod.canonical(rid, payload), mod.sha256(rid, payload))
    except Exception as exc:
        for i in range(len(vectors)): pyvals[i] = (f'ERR:{exc}', '')

    js_vectors = json.dumps(vectors, ensure_ascii=False)
    js = f"""
import {{ canonical, sha256 }} from './javascript/canonical.js';
const vectors = {js_vectors};
for (let i=0; i<vectors.length; i++) {{
 const [r,p] = vectors[i];
 try {{ console.log(JSON.stringify({{i,c:canonical(r,p),h:sha256(r,p)}})); }}
 catch (e) {{ console.log(JSON.stringify({{i,error:String(e)}})); }}
}}
"""
    script = candidate / '.hidden-canonical.mjs'
    script.write_text(js, encoding='utf-8')
    jsvals = {}
    try:
        res = run(['node', script.name], candidate)
        for line in res['stdout'].splitlines():
            try:
                x=json.loads(line); jsvals[int(x['i'])]=(x.get('c','ERR'),x.get('h',''))
            except Exception: pass
    finally:
        script.unlink(missing_ok=True)

    hdir = candidate / '.hidden-java'
    hdir.mkdir(exist_ok=True)
    source = candidate / 'java' / 'src' / 'main' / 'java' / 'benchmark' / 'RequestKey.java'
    harness = hdir / 'HiddenCanonical.java'
    def jquote(s: str) -> str:
        return json.dumps(s, ensure_ascii=False)
    body=[]
    for i,(rid,payload) in enumerate(vectors):
        body.append(
            'String c{0}=RequestKey.canonical({1}, {2}); '.format(i, jquote(rid), jquote(payload))
            + 'String b{0}=Base64.getEncoder().encodeToString(c{0}.getBytes(StandardCharsets.UTF_8)); '.format(i)
            + 'System.out.println({0}+"\\t"+b{0}+"\\t"+RequestKey.sha256({1}, {2}));'.format(i, jquote(rid), jquote(payload))
        )
    harness.write_text(
        'import benchmark.RequestKey;\n'
        'import java.nio.charset.StandardCharsets;\n'
        'import java.util.Base64;\n'
        'public class HiddenCanonical { public static void main(String[] a) {\n'
        + '\n'.join(body) + '\n}}\n',
        encoding='utf-8'
    )
    javavals={}
    try:
        out=hdir/'classes'; out.mkdir(exist_ok=True)
        c=run(['javac','-encoding','UTF-8','-d',str(out),str(source),str(harness)],candidate)
        if c['returncode']==0:
            r=run(['java','-cp',str(out),'HiddenCanonical'],candidate)
            for line in r['stdout'].splitlines():
                parts=line.split('\t',2)
                if len(parts)==3:
                    try:
                        canonical_text=base64.b64decode(parts[1]).decode('utf-8')
                        javavals[int(parts[0])]=(canonical_text,parts[2])
                    except Exception:
                        pass
    finally:
        import shutil; shutil.rmtree(hdir,ignore_errors=True)

    for i,(rid,payload) in enumerate(vectors):
        expected=canonical_expected(rid,payload)
        expected_hash=hashlib.sha256(expected.encode('utf-8')).hexdigest()
        add(results,f'python_canonical_{i}',pyvals.get(i)==(expected,expected_hash),pyvals.get(i))
        add(results,f'javascript_canonical_{i}',jsvals.get(i)==(expected,expected_hash),jsvals.get(i))
        add(results,f'java_canonical_{i}',javavals.get(i)==(expected,expected_hash),javavals.get(i))
        add(results,f'cross_language_agree_{i}',pyvals.get(i)==jsvals.get(i)==javavals.get(i)==(expected,expected_hash))
    return summarize(results)


def main() -> int:
    ap=argparse.ArgumentParser()
    ap.add_argument('--candidate',required=True)
    ap.add_argument('--hidden',required=True)
    ap.add_argument('--out',required=True)
    args=ap.parse_args()
    candidate=Path(args.candidate).resolve(); hidden=Path(args.hidden).resolve(); out=Path(args.out).resolve(); out.mkdir(parents=True,exist_ok=True)
    cases=json.loads((hidden/'cases.json').read_text(encoding='utf-8'))
    visible=run([sys.executable,'tests-visible/run_all.py'],candidate)
    py=hidden_python(candidate,cases)
    js=hidden_javascript(candidate,cases)
    cross=hidden_cross_language(candidate,cases)
    evidence={
      'operation_id':'A01-CODE-QUAL-001',
      'visible_tests':{'passed':1 if visible['returncode']==0 else 0,'failed':0 if visible['returncode']==0 else 1,'raw':visible},
      'hidden_tests':{
        'passed':int(py['passed'])+int(js['passed'])+int(cross['passed']),
        'failed':int(py['failed'])+int(js['failed'])+int(cross['failed']),
        'python':py,'javascript':js,'cross_language':cross,
      }
    }
    p=out/'functional-evidence.json'; p.write_text(json.dumps(evidence,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({'functional_evidence_sha256':sha256(p),'hidden_passed':evidence['hidden_tests']['passed'],'hidden_failed':evidence['hidden_tests']['failed']},sort_keys=True))
    return 0

if __name__=='__main__': raise SystemExit(main())
