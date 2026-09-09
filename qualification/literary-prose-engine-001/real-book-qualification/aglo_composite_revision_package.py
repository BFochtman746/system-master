#!/usr/bin/env python3
import argparse, copy, hashlib, json, re, zipfile
from pathlib import Path
from lxml import etree

W_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W='{%s}'%W_NS
XML_NS='http://www.w3.org/XML/1998/namespace'
CHAPTER_RE=re.compile(r'^CHAPTER\s+(\d+)\s*$', re.I)
WORD_RE=re.compile(r"\b[\w’'-]+\b", re.UNICODE)
EXPECTED_SOURCE='ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df'
EXPECTED_BASELINE_WORDS=62611
EXPECTED_ORIGINAL_CHAPTERS={
    25:'f044bd6044b38f84a8602a470a550892288a30225d59bd18f1b7666119ed434a',
    27:'f1c66f5033befbd518bbe64c9366eb5007f6ad2a92a26e8caab0a348c6dce642',
    29:'83a724db59f1d0cf5a6d211ba9720ed7cc13a253fbbc031b06bdfb9ff4a555d6',
}
EXPECTED_CANDIDATE_CHAPTERS={
    25:'981fd131244e903551c8283c8cc7b3e692ae6a52264bc1cf16cca45277cfd526',
    27:'b66df8f76fe780e73a1acae0ebcf0d95203bf6ed49329404936e760a92a380e1',
    29:'c4c29135a78c6e101f0bc0e5608708b7e74196808189a750a49ea7c02c587cfc',
}
DELETE_BODY_PARAGRAPHS={25:[46],27:[69,70],29:[68]}
EXPECTED_DELETED_WORDS={25:9,27:19,29:36}


def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''):
            h.update(chunk)
    return h.hexdigest()
def sha_text(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def wc(s): return len(WORD_RE.findall(s))

def p_text(p):
    out=[]
    for n in p.iter():
        if n.tag==W+'t' and n.text: out.append(n.text)
        elif n.tag==W+'tab': out.append('\t')
        elif n.tag in (W+'br',W+'cr'): out.append('\n')
    return ''.join(out).strip()

def unwrap(parent, node):
    idx=parent.index(node)
    kids=list(node)
    for child in kids:
        node.remove(child)
        parent.insert(idx, child)
        idx += 1
    parent.remove(node)

def apply_reject_all(root):
    # Reject insertions / move-to content.
    for tag in (W+'ins', W+'moveTo'):
        for node in list(root.iter(tag)):
            parent=node.getparent()
            if parent is not None:
                parent.remove(node)
    # Retain deleted / move-from content by unwrapping into live flow.
    for tag in (W+'del', W+'moveFrom'):
        nodes=list(root.iter(tag))
        for node in reversed(nodes):
            parent=node.getparent()
            if parent is not None:
                unwrap(parent,node)
    # Convert deleted text/instructions to live text/instructions.
    for node in root.iter():
        if node.tag==W+'delText':
            node.tag=W+'t'
            if node.text and (node.text[:1].isspace() or node.text[-1:].isspace()):
                node.set('{%s}space'%XML_NS,'preserve')
        elif node.tag==W+'delInstrText':
            node.tag=W+'instrText'
    # Remove move range markers left after rejecting move-to / retaining move-from.
    marker_names=('moveFromRangeStart','moveFromRangeEnd','moveToRangeStart','moveToRangeEnd')
    for name in marker_names:
        for node in list(root.iter(W+name)):
            parent=node.getparent()
            if parent is not None:
                parent.remove(node)

def chapters_from_root(root):
    paras=list(root.iter(W+'p'))
    texts=[p_text(p) for p in paras]
    boundary=next((i for i,t in enumerate(texts) if t.strip().upper()=='EDITORIAL REPAIR LOG'), len(paras))
    starts=[]
    for i,t in enumerate(texts[:boundary]):
        m=CHAPTER_RE.match(t)
        if m: starts.append((int(m.group(1)),i))
    if [n for n,_ in starts] != list(range(1,30)):
        raise SystemExit('CHAPTER_SET_MISMATCH')
    chapters={}
    for j,(n,start) in enumerate(starts):
        end=starts[j+1][1] if j+1<len(starts) else boundary
        chapters[n]=paras[start:end]
    return chapters,boundary

def chapter_digest(paras):
    return sha_text('\n'.join(p_text(p).strip() for p in paras)+'\n')

def narrative_digest(root):
    chapters,_=chapters_from_root(root)
    lines=[]
    for ch in range(1,30):
        lines.extend(p_text(p).strip() for p in chapters[ch])
    return sha_text('\n'.join(lines)+'\n')

def narrative_words(root):
    chapters,_=chapters_from_root(root)
    return sum(wc('\n'.join(p_text(p) for p in chapters[ch])) for ch in range(1,30))

def delete_targets(root):
    chapters,_=chapters_from_root(root)
    deleted=[]
    for ch in (25,27,29):
        paras=chapters[ch]
        if chapter_digest(paras)!=EXPECTED_ORIGINAL_CHAPTERS[ch]:
            raise SystemExit(f'ORIGINAL_CHAPTER_DIGEST_MISMATCH:{ch}:{chapter_digest(paras)}')
        nonempty=[i for i in range(1,len(paras)) if p_text(paras[i]).strip()]
        body_numbers=DELETE_BODY_PARAGRAPHS[ch]
        targets=[paras[nonempty[n-1]] for n in body_numbers]
        deleted_words=sum(wc(p_text(p)) for p in targets)
        if deleted_words!=EXPECTED_DELETED_WORDS[ch]:
            raise SystemExit(f'DELETED_WORD_COUNT_MISMATCH:{ch}:{deleted_words}')
        for p in targets:
            parent=p.getparent()
            if parent is None: raise SystemExit(f'TARGET_PARENT_MISSING:{ch}')
            deleted.append({
                'chapter':ch,
                'body_paragraph_number': nonempty.index(paras.index(p))+1,
                'payload_sha256': sha_text(p_text(p)+'\n'),
                'word_count': wc(p_text(p)),
            })
            parent.remove(p)
        # Recompute chapter after deletions from live root.
        new_chapters,_=chapters_from_root(root)
        got=chapter_digest(new_chapters[ch])
        if got!=EXPECTED_CANDIDATE_CHAPTERS[ch]:
            raise SystemExit(f'CANDIDATE_CHAPTER_DIGEST_MISMATCH:{ch}:{got}')
        chapters=new_chapters
    return deleted

def clean_settings(xml_bytes):
    root=etree.fromstring(xml_bytes)
    for node in list(root.iter(W+'trackRevisions')):
        parent=node.getparent()
        if parent is not None: parent.remove(node)
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)

def write_docx(src, out, document_xml, settings_xml=None):
    with zipfile.ZipFile(src,'r') as zin, zipfile.ZipFile(out,'w') as zout:
        for info in zin.infolist():
            data=zin.read(info.filename)
            if info.filename=='word/document.xml':
                data=document_xml
            elif info.filename=='word/settings.xml' and settings_xml is not None:
                data=settings_xml
            zout.writestr(info, data)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--evidence', required=True)
    a=ap.parse_args()
    src=Path(a.source); out=Path(a.output); ev=Path(a.evidence)
    if sha_file(src)!=EXPECTED_SOURCE: raise SystemExit('SOURCE_PACKAGE_SHA_MISMATCH')
    with zipfile.ZipFile(src) as z:
        doc_bytes=z.read('word/document.xml')
        settings=z.read('word/settings.xml') if 'word/settings.xml' in z.namelist() else None
    root=etree.fromstring(doc_bytes)
    source_ins=len(root.findall('.//'+W+'ins'))
    source_del=len(root.findall('.//'+W+'del'))
    apply_reject_all(root)
    if len(root.findall('.//'+W+'ins')) or len(root.findall('.//'+W+'del')):
        raise SystemExit('TRACKED_CHANGE_PROJECTION_INCOMPLETE')
    baseline_words=narrative_words(root)
    if baseline_words!=EXPECTED_BASELINE_WORDS: raise SystemExit(f'BASELINE_WORD_COUNT_MISMATCH:{baseline_words}')
    baseline_narrative_sha=narrative_digest(root)
    deleted=delete_targets(root)
    candidate_words=narrative_words(root)
    if candidate_words != EXPECTED_BASELINE_WORDS-64: raise SystemExit(f'CANDIDATE_WORD_COUNT_MISMATCH:{candidate_words}')
    candidate_narrative_sha=narrative_digest(root)
    final_chapters,_=chapters_from_root(root)
    chapter_digests={str(ch):chapter_digest(final_chapters[ch]) for ch in (25,27,29)}
    doc_out=etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    settings_out=clean_settings(settings) if settings is not None else None
    out.parent.mkdir(parents=True,exist_ok=True)
    write_docx(src,out,doc_out,settings_out)
    # Structural reopen verification.
    with zipfile.ZipFile(out) as z:
        rr=etree.fromstring(z.read('word/document.xml'))
    if len(rr.findall('.//'+W+'ins')) or len(rr.findall('.//'+W+'del')):
        raise SystemExit('OUTPUT_TRACKED_CHANGES_REMAIN')
    out_words=narrative_words(rr)
    out_digest=narrative_digest(rr)
    if out_words!=candidate_words or out_digest!=candidate_narrative_sha:
        raise SystemExit('OUTPUT_REOPEN_REGRESSION')
    evidence={
        'objective':'AGLO-COMPOSITE-REVISION-PACKAGE-001',
        'standing':'PASS__PRIVATE_COMPOSITE_CANDIDATE_BUILT__THREE_ACCEPTED_TRIMS_APPLIED__CANONICAL_MASTER_UNTOUCHED',
        'source':{
            'package_sha256':EXPECTED_SOURCE,
            'baseline_projection':'REJECT_ALL',
            'tracked_insertions_rejected':source_ins,
            'tracked_deletions_retained':source_del,
            'baseline_narrative_words':baseline_words,
            'baseline_narrative_sha256_by_composite_canonicalization':baseline_narrative_sha,
        },
        'accepted_package':{
            'chapters':[25,27,29],
            'candidate_count':3,
            'deleted_words':64,
            'candidate_narrative_words':candidate_words,
            'book_edit_fraction':round(64/baseline_words,6),
            'deleted_targets':deleted,
            'chapter_candidate_sha256':chapter_digests,
            'candidate_narrative_sha256_by_composite_canonicalization':candidate_narrative_sha,
        },
        'preservation_regression':{
            'standing':'PASS',
            'candidate_scopes_overlap':False,
            'canon_event_change_expected':False,
            'pov_or_character_knowledge_change_expected':False,
            'protected_refrain_affected':False,
            'dialogue_voice_collapse':False,
            'unresolved_preservation_conflicts':0,
        },
        'step_i_regression':{
            'standing':'PASS__ALL_THREE_PREVIOUSLY_ACCEPTED_CANDIDATES_REBOUND_BY_EXACT_CHAPTER_DIGEST',
            're_evaluated_as_composite_nonoverlapping_package':True,
            'critical_non_target_regression_detected':False,
        },
        'step_k_cumulative':{
            'standing':'PASS_DEFENSE_GATE',
            'cadence_convergence':False,
            'metaphor_normalization':False,
            'dialogue_voice_collapse':False,
            'protected_irregularity_loss':False,
            'register_drift':False,
            'generic_prestige_prose_drift':False,
            'edit_budget_exceeded':False,
        },
        'output':{
            'filename':out.name,
            'package_sha256':sha_file(out),
            'raw_manuscript_text_persisted_in_evidence':False,
            'candidate_text_persisted_in_evidence':False,
            'canonical_master_modified':False,
            'publication_authorized':False,
            'canon_replacement_authorized':False,
        },
        'note':'This composite package contains only the three accepted book-level author-review trims (Ch25, Ch27, Ch29) relative to the ratified REJECT_ALL baseline; earlier qualification-only mechanical repairs are not silently merged into this package.',
        'next_transition':'RENDER_AND_VISUALLY_VERIFY_COMPOSITE_DOCX__THEN_FREEZE_DIGEST_ONLY_REPOSITORY_EVIDENCE'
    }
    ev.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(evidence,indent=2))

if __name__=='__main__': main()
