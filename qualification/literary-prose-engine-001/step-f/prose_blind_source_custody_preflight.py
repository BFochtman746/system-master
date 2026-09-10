#!/usr/bin/env python3
import argparse, hashlib, json, re, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
WORD_RE = re.compile(r"\b\w+(?:['’]\w+)?\b", re.UNICODE)

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def nonempty_docx_paragraphs(path: Path):
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    out = []
    for p in root.iter(W + 'p'):
        text = ''.join((t.text or '') for t in p.iter(W + 't')).strip()
        if text:
            out.append(text)
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--contract', required=True)
    ap.add_argument('--source-dir', required=True)
    ap.add_argument('--output')
    args = ap.parse_args()

    contract = json.loads(Path(args.contract).read_text(encoding='utf-8'))
    source_dir = Path(args.source_dir)
    errors = []
    source_results = []
    paragraphs = {}

    for source in contract['source_custody']:
        path = source_dir / source['filename']
        if not path.is_file():
            errors.append(f"SOURCE_MISSING:{source['source_id']}:{source['filename']}")
            continue
        observed = sha256_file(path)
        matched = observed == source['source_package_sha256']
        source_results.append({
            'source_id': source['source_id'],
            'filename': source['filename'],
            'expected_sha256': source['source_package_sha256'],
            'observed_sha256': observed,
            'digest_match': matched,
        })
        if not matched:
            errors.append(f"SOURCE_DIGEST_MISMATCH:{source['source_id']}")
            continue
        paragraphs[source['source_id']] = nonempty_docx_paragraphs(path)

    recon = contract['passage_reconstruction_contract']
    if recon.get('index_base') != 0 or recon.get('range_end') != 'INCLUSIVE':
        errors.append('CONTRACT_INDEX_SEMANTICS_NOT_0_BASED_INCLUSIVE')
    if recon.get('text_extraction_rule') != 'CONCAT_DESCENDANT_W_T_PER_W_P__STRIP_OUTER_WHITESPACE__DROP_EMPTY':
        errors.append('CONTRACT_TEXT_EXTRACTION_RULE_MISMATCH')

    case_results = []
    for case in contract['cases']:
        arr = paragraphs.get(case['source_id'])
        if arr is None:
            continue
        a, b = int(case['source_paragraph_start']), int(case['source_paragraph_end'])
        if a < 0 or b < a or b >= len(arr):
            errors.append(f"RANGE_INVALID:{case['case_id']}")
            continue
        selected = arr[a:b+1]
        passage = ' '.join(selected)
        observed = hashlib.sha256(passage.encode('utf-8')).hexdigest()
        words = len(WORD_RE.findall(passage))
        matched = observed == case['passage_sha256']
        case_results.append({
            'case_id': case['case_id'],
            'source_id': case['source_id'],
            'source_paragraph_start': a,
            'source_paragraph_end': b,
            'paragraph_count': len(selected),
            'expected_passage_sha256': case['passage_sha256'],
            'observed_passage_sha256': observed,
            'digest_match': matched,
            'recorded_word_count': case.get('word_count'),
            'observed_word_count': words,
            'word_count_match': case.get('word_count') == words,
            'word_count_authority': 'ADVISORY_ONLY',
        })
        if not matched:
            errors.append(f"PASSAGE_DIGEST_MISMATCH:{case['case_id']}")

    result = {
        'objective': contract.get('objective'),
        'phase': 'BLIND_SOURCE_CUSTODY_AND_RECONSTRUCTION_PREFLIGHT',
        'standing': 'PASS__SOURCE_CUSTODY_AND_ALL_PASSAGE_DIGESTS_VERIFIED' if not errors else 'FAIL__EVIDENCE_MISMATCH',
        'source_results': source_results,
        'case_results': case_results,
        'source_digest_matches': sum(1 for x in source_results if x['digest_match']),
        'source_digest_total': len(contract['source_custody']),
        'passage_digest_matches': sum(1 for x in case_results if x['digest_match']),
        'passage_digest_total': len(contract['cases']),
        'word_counts_advisory': True,
        'raw_prose_persisted': False,
        'author_labels_accessed': False,
        'revision_authority': False,
        'errors': errors,
    }
    text = json.dumps(result, indent=2) + '\n'
    if args.output:
        Path(args.output).write_text(text, encoding='utf-8')
    print(text, end='')
    raise SystemExit(0 if not errors else 2)

if __name__ == '__main__':
    main()
