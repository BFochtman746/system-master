#!/usr/bin/env python3
import argparse, hashlib, json, re, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CHAPTER_RE = re.compile(r'^CHAPTER\s+(\d+)\s*$', re.I)

class GateError(RuntimeError):
    pass

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def projected_paragraph_text(p, projection: str) -> str:
    out = []
    def walk(node, in_ins=False, in_del=False):
        tag = node.tag
        ni = in_ins or tag == W + 'ins'
        nd = in_del or tag == W + 'del'
        include = not ni and not nd
        if projection == 'REJECT_ALL':
            include = not ni
        elif projection == 'ACCEPT_ALL':
            include = not nd
        else:
            raise GateError(f'UNSUPPORTED_PROJECTION:{projection}')
        if tag in (W + 't', W + 'delText') and include and node.text:
            out.append(node.text)
        elif tag == W + 'tab' and include:
            out.append('\t')
        elif tag in (W + 'br', W + 'cr') and include:
            out.append('\n')
        for c in node:
            walk(c, ni, nd)
    walk(p)
    return ''.join(out).strip()

def extract_projected_paragraphs(docx: Path, projection: str):
    with zipfile.ZipFile(docx) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    return [projected_paragraph_text(p, projection) for p in root.iter(W + 'p')]

def chapter_map(paragraphs):
    starts = []
    for i, text in enumerate(paragraphs):
        m = CHAPTER_RE.match(text)
        if m:
            starts.append((int(m.group(1)), i))
    if not starts:
        raise GateError('NO_CHAPTER_HEADINGS_FOUND')
    repair_idx = next((i for i, t in enumerate(paragraphs) if t.strip().upper() == 'EDITORIAL REPAIR LOG'), len(paragraphs))
    result = {}
    for pos, (num, start) in enumerate(starts):
        if start >= repair_idx:
            continue
        end = starts[pos + 1][1] if pos + 1 < len(starts) else repair_idx
        result[num] = paragraphs[start:min(end, repair_idx)]
    return result

def chapter_digest(lines):
    payload = ('\n'.join(x.strip() for x in lines) + '\n').encode('utf-8')
    return hashlib.sha256(payload).hexdigest()

def word_count(lines):
    return sum(len(re.findall(r"\b\w+(?:['’]\w+)?\b", line, flags=re.UNICODE)) for line in lines)

def validate_authority(state, ratification):
    reasons = []
    if state.get('decision') != 'ADMITTED' or state.get('standing') != 'ADMITTED':
        reasons.append('REAL_BOOK_STATE_NOT_ADMITTED')
    if ratification.get('standing') not in ('PASS__ADMITTED_FOR_QUALIFICATION_ONLY', 'RATIFIED'):
        reasons.append('EXPLICIT_BASELINE_RATIFICATION_MISSING')
    projection = state.get('revision_projection')
    if projection not in ('REJECT_ALL', 'ACCEPT_ALL'):
        reasons.append('EXACT_TRACKED_CHANGE_PROJECTION_MISSING')
    auth = state.get('user_authorization') or {}
    if auth.get('explicit') is not True:
        reasons.append('EXPLICIT_USER_AUTHORIZATION_MISSING')
    if auth.get('qualification_only') is not True:
        reasons.append('QUALIFICATION_ONLY_AUTHORITY_MISSING')
    if auth and auth.get('publication_authorized') is not False:
        reasons.append('PUBLICATION_BOUNDARY_INVALID')
    if auth and auth.get('automatic_overwrite_authorized') is not False:
        reasons.append('AUTOMATIC_OVERWRITE_BOUNDARY_INVALID')
    return reasons

def passage_manifest(chapter_no, lines, windows=3):
    body_indices = [i for i, t in enumerate(lines) if t.strip()]
    if len(body_indices) <= 1:
        return []
    body_indices = body_indices[1:]
    anchors = []
    for frac in (0.18, 0.50, 0.82):
        idx = body_indices[min(len(body_indices)-1, max(0, round((len(body_indices)-1)*frac)))]
        anchors.append(idx)
    out=[]
    for n, anchor in enumerate(anchors[:windows], 1):
        start=max(1, anchor-2); end=min(len(lines), anchor+3)
        seg=lines[start:end]
        payload=('\n'.join(x.strip() for x in seg)+'\n').encode('utf-8')
        out.append({
            'passage_id': f'AGLO-C{chapter_no:02d}-P{n:02d}',
            'chapter': chapter_no,
            'paragraph_start_index': start,
            'paragraph_end_index_exclusive': end,
            'paragraph_count': end-start,
            'word_count': word_count(seg),
            'sha256': sha256_bytes(payload),
            'raw_text_persisted': False,
            'candidate_text_persisted': False,
        })
    return out

def run(docx, state, ratification, output):
    result = {
        'objective': 'AGLO-REAL-BOOK-CLOSED-LOOP-QUALIFICATION-001',
        'phase': 'PRIVATE_EXECUTION_HARNESS_AUTHORITY_AND_SAMPLE_GATE',
        'raw_manuscript_text_persisted': False,
        'candidate_revision_text_persisted': False,
    }
    reasons = validate_authority(state, ratification)
    if reasons:
        result.update({'standing':'BLOCKED_AUTHORITY_NOT_RATIFIED','authorized':False,'reasons':reasons})
        Path(output).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        return 2
    expected_source = state.get('source_package_digest') or state.get('source_digest')
    observed_source = sha256_file(Path(docx))
    if expected_source and expected_source != observed_source:
        result.update({'standing':'BLOCKED_SOURCE_PACKAGE_DIGEST_MISMATCH','authorized':False,'expected_source_sha256':expected_source,'observed_source_sha256':observed_source})
        Path(output).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        return 3
    projection = state['revision_projection']
    paragraphs = extract_projected_paragraphs(Path(docx), projection)
    chapters = chapter_map(paragraphs)
    sample = state.get('representative_sample') or state.get('representative_sample_candidate') or {}
    chapter_numbers = sample.get('chapter_numbers') or []
    expected_chapters = {int(x['chapter']): x for x in sample.get('chapters', []) if isinstance(x, dict) and 'chapter' in x}
    checks=[]; manifests=[]
    for num in chapter_numbers:
        if num not in chapters:
            raise GateError(f'SAMPLE_CHAPTER_MISSING:{num}')
        lines=chapters[num]
        dig=chapter_digest(lines); wc=word_count(lines)
        exp=expected_chapters.get(int(num), {})
        pass_digest = not exp.get('sha256') or exp.get('sha256') == dig
        pass_wc = not exp.get('word_count') or int(exp.get('word_count')) == wc
        checks.append({'chapter':num,'observed_sha256':dig,'observed_word_count':wc,'digest_match':pass_digest,'word_count_match':pass_wc})
        manifests.extend(passage_manifest(num, lines))
    if not all(c['digest_match'] for c in checks):
        result.update({'standing':'BLOCKED_SAMPLE_DIGEST_MISMATCH','authorized':False,'source_sha256':observed_source,'chapter_checks':checks})
        Path(output).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
        return 4
    result.update({
        'standing':'PASS__AUTHORIZED_PRIVATE_SAMPLE_GATE__READY_FOR_SEMANTIC_PASSAGE_STATE_BUILD',
        'authorized':True,
        'source_sha256':observed_source,
        'projection':projection,
        'baseline_version_id':state.get('baseline_version_id'),
        'sample_id':sample.get('sample_id'),
        'chapter_checks':checks,
        'content_identity_authority':'SHA256_CHAPTER_DIGESTS',
        'word_counts_advisory':True,
        'passage_manifest':manifests,
        'passage_count':len(manifests),
        'next_transition':'PRIVATE_SEMANTIC_PASSAGE_STATE_BUILD',
    })
    Path(output).write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
    return 0

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--docx', required=True)
    ap.add_argument('--state', required=True)
    ap.add_argument('--ratification', required=True)
    ap.add_argument('--output', required=True)
    args=ap.parse_args()
    state=json.loads(Path(args.state).read_text(encoding='utf-8'))
    rat=json.loads(Path(args.ratification).read_text(encoding='utf-8'))
    try:
        code=run(args.docx,state,rat,args.output)
    except Exception as e:
        Path(args.output).write_text(json.dumps({'standing':'HARNESS_ERROR','error':f'{type(e).__name__}:{e}','raw_manuscript_text_persisted':False},indent=2)+'\n',encoding='utf-8')
        raise
    raise SystemExit(code)

if __name__=='__main__':
    main()
