#!/usr/bin/env python3
import argparse, hashlib, json, re, statistics, zipfile
from collections import defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CHAPTER_RE = re.compile(r'^CHAPTER\s+(\d+)\s*$', re.I)
WORD_RE = re.compile(r"\b[\w’'-]+\b", re.UNICODE)
EXPECTED_SOURCE_SHA256 = 'ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df'
EXPECTED_BASELINE_SHA256 = 'a48378682ee15fd4b24bc97293ce43a37f096db254a0b78f715081a8aa8a59ee'
EXPECTED_CHAPTER_COUNT = 29

class SweepError(RuntimeError): pass

def sha256_bytes(b): return hashlib.sha256(b).hexdigest()
def sha256_text(s): return sha256_bytes(s.encode('utf-8'))
def sha256_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def words(text): return WORD_RE.findall(text)
def normalize_sentence(text):
    text=text.lower().strip()
    text=re.sub(r'[“”"‘’\'.,!?;:—–-]+',' ',text)
    return re.sub(r'\s+',' ',text).strip()

def split_sentences(text):
    parts=re.split(r'(?<=[.!?])(?:[”"\']?)(?:\s+|$)', text.strip())
    return [p.strip() for p in parts if p.strip()]

def project_paragraph(p, projection='REJECT_ALL'):
    out=[]
    def walk(node, in_ins=False, in_del=False):
        tag=node.tag
        ni=in_ins or tag==W+'ins'
        nd=in_del or tag==W+'del'
        include = (not ni) if projection=='REJECT_ALL' else (not nd)
        if tag in (W+'t', W+'delText') and include and node.text: out.append(node.text)
        elif tag==W+'tab' and include: out.append('\t')
        elif tag in (W+'br', W+'cr') and include: out.append('\n')
        for child in node: walk(child, ni, nd)
    walk(p)
    return ''.join(out).strip()

def extract_chapters(docx, projection='REJECT_ALL'):
    with zipfile.ZipFile(docx) as z:
        root=ET.fromstring(z.read('word/document.xml'))
    paragraphs=[project_paragraph(p, projection) for p in root.iter(W+'p')]
    repair_idx=next((i for i,t in enumerate(paragraphs) if t.strip().upper()=='EDITORIAL REPAIR LOG'), len(paragraphs))
    starts=[]
    for i,text in enumerate(paragraphs[:repair_idx]):
        m=CHAPTER_RE.match(text)
        if m: starts.append((int(m.group(1)),i))
    chapters={}
    for pos,(num,start) in enumerate(starts):
        end=starts[pos+1][1] if pos+1<len(starts) else repair_idx
        chapters[num]=paragraphs[start:min(end,repair_idx)]
    return chapters

def chapter_digest(lines):
    return sha256_text('\n'.join(x.strip() for x in lines)+'\n')

def chunk_passages(chapter, lines, target_words=250, hard_max_words=360):
    rows=[]; start=1; cur=[]; cur_words=0; idx=1; passage_no=1
    while idx < len(lines):
        p=lines[idx]
        pw=len(words(p))
        if cur and cur_words >= target_words and cur_words + pw > hard_max_words:
            payload='\n'.join(x.strip() for x in cur)+'\n'
            rows.append({'passage_id':f'AGLO-C{chapter:02d}-W{passage_no:03d}','chapter':chapter,'paragraph_start_index':start,'paragraph_end_index_exclusive':idx,'word_count':cur_words,'sha256':sha256_text(payload),'raw_text_persisted':False,'candidate_text_persisted':False,'edit_scope':'DIAGNOSIS_ONLY'})
            passage_no+=1; cur=[]; cur_words=0; start=idx
        cur.append(p); cur_words+=pw; idx+=1
        if cur_words >= hard_max_words:
            payload='\n'.join(x.strip() for x in cur)+'\n'
            rows.append({'passage_id':f'AGLO-C{chapter:02d}-W{passage_no:03d}','chapter':chapter,'paragraph_start_index':start,'paragraph_end_index_exclusive':idx,'word_count':cur_words,'sha256':sha256_text(payload),'raw_text_persisted':False,'candidate_text_persisted':False,'edit_scope':'DIAGNOSIS_ONLY'})
            passage_no+=1; cur=[]; cur_words=0; start=idx
    if cur:
        payload='\n'.join(x.strip() for x in cur)+'\n'
        rows.append({'passage_id':f'AGLO-C{chapter:02d}-W{passage_no:03d}','chapter':chapter,'paragraph_start_index':start,'paragraph_end_index_exclusive':len(lines),'word_count':cur_words,'sha256':sha256_text(payload),'raw_text_persisted':False,'candidate_text_persisted':False,'edit_scope':'DIAGNOSIS_ONLY'})
    return rows

def detect_findings(chapters):
    findings=[]; sentence_occ=defaultdict(list)
    for chapter,lines in chapters.items():
        sent_rows=[]
        for pi,p in enumerate(lines[1:],1):
            for si,s in enumerate(split_sentences(p)):
                ns=normalize_sentence(s)
                if ns and len(words(s))>=4:
                    sent_rows.append((pi,si,s,ns))
                    if len(words(s))>=8: sentence_occ[ns].append((chapter,pi,si,s))
            # duplicated adjacent token
            for m in re.finditer(r"\b([A-Za-z][A-Za-z’'-]{1,})\s+\1\b", p, flags=re.I):
                token=m.group(1)
                fixed=p[:m.start()] + token + p[m.end():]
                findings.append({'finding_id':f'AGLO-WBS-C{chapter:02d}-P{pi:03d}-REPEATED-WORD','finding_type':'OBJECTIVE_REPEATED_WORD','chapter':chapter,'paragraph_index':pi,'confidence':'HIGH','severity':'HIGH','original_paragraph_sha256':sha256_text(p+'\n'),'candidate_paragraph_sha256':sha256_text(fixed+'\n'),'candidate_transform':'REMOVE_ONE_IMMEDIATE_DUPLICATE_TOKEN','token_sha256':sha256_text(token.lower()),'raw_text_persisted':False,'candidate_text_persisted':False})
        # exact neighboring sentence repetition
        for j in range(len(sent_rows)-1):
            p1,s1,t1,n1=sent_rows[j]; p2,s2,t2,n2=sent_rows[j+1]
            if n1==n2 and p2-p1<=1:
                # candidate removes first exact occurrence, retaining following occurrence in context
                findings.append({'finding_id':f'AGLO-WBS-C{chapter:02d}-P{p1:03d}-EXACT-SENTENCE-DUP','finding_type':'OBJECTIVE_EXACT_DUPLICATE_SENTENCE_NEAR_ADJACENT','chapter':chapter,'positions':[[p1,s1],[p2,s2]],'confidence':'HIGH','severity':'HIGH','sentence_sha256':sha256_text(n1),'passage_sha256':sha256_text('\n'.join(lines[max(1,p1-1):min(len(lines),p2+2)])+'\n'),'candidate_transform':'REMOVE_FIRST_EXACT_DUPLICATE_OCCURRENCE_ONLY','raw_text_persisted':False,'candidate_text_persisted':False})
        # low-confidence structural screens
        for pi,p in enumerate(lines[1:],1):
            for si,s in enumerate(split_sentences(p)):
                sw=len(words(s))
                if sw>=60:
                    findings.append({'finding_id':f'AGLO-WBS-C{chapter:02d}-P{pi:03d}-S{si:02d}-DENSITY','finding_type':'HIGH_SENTENCE_DENSITY_SCREEN','chapter':chapter,'paragraph_index':pi,'sentence_index':si,'confidence':'LOW','severity':'SCREEN','word_count':sw,'passage_sha256':sha256_text(p+'\n'),'raw_text_persisted':False})
            sents=split_sentences(p)
            if len(sents)>=4:
                openers=[]
                for s in sents:
                    ww=words(s); openers.append(' '.join(w.lower() for w in ww[:3]))
                counts={o:openers.count(o) for o in set(openers) if o}
                if counts and max(counts.values())>=3:
                    op=max(counts,key=counts.get)
                    findings.append({'finding_id':f'AGLO-WBS-C{chapter:02d}-P{pi:03d}-ANAPHORA','finding_type':'REPETITIVE_SENTENCE_OPENING_SCREEN','chapter':chapter,'paragraph_index':pi,'confidence':'LOW','severity':'SCREEN','repeat_count':counts[op],'opener_sha256':sha256_text(op),'passage_sha256':sha256_text(p+'\n'),'raw_text_persisted':False})
    # exact repeated sentences across distinct chapters
    for ns,locs in sentence_occ.items():
        chapters_seen=sorted({x[0] for x in locs})
        if len(chapters_seen)>1:
            findings.append({'finding_id':'AGLO-WBS-CROSS-CHAPTER-EXACT-SENTENCE-'+sha256_text(ns)[:12],'finding_type':'EXACT_SENTENCE_REPEATED_ACROSS_CHAPTERS','chapters':chapters_seen,'locations':[[x[0],x[1],x[2]] for x in locs],'confidence':'HIGH','severity':'AUTHOR_INTENT_REVIEW','sentence_sha256':sha256_text(ns),'raw_text_persisted':False})
    # stable sort
    order={'OBJECTIVE_REPEATED_WORD':0,'OBJECTIVE_EXACT_DUPLICATE_SENTENCE_NEAR_ADJACENT':0,'EXACT_SENTENCE_REPEATED_ACROSS_CHAPTERS':1,'HIGH_SENTENCE_DENSITY_SCREEN':2,'REPETITIVE_SENTENCE_OPENING_SCREEN':3}
    findings.sort(key=lambda x:(order.get(x['finding_type'],9), x.get('chapter',min(x.get('chapters',[999]))), x['finding_id']))
    return findings

def run(docx, output):
    observed=sha256_file(docx)
    if observed!=EXPECTED_SOURCE_SHA256: raise SweepError('SOURCE_PACKAGE_DIGEST_MISMATCH')
    chapters=extract_chapters(docx,'REJECT_ALL')
    if sorted(chapters)!=list(range(1,EXPECTED_CHAPTER_COUNT+1)): raise SweepError('NARRATIVE_CHAPTER_SET_MISMATCH')
    chapter_rows=[]; passages=[]
    for n in sorted(chapters):
        lines=chapters[n]
        text='\n'.join(lines)
        sentence_lengths=[len(words(s)) for p in lines[1:] for s in split_sentences(p) if words(s)]
        chapter_rows.append({'chapter':n,'sha256':chapter_digest(lines),'word_count':len(words(text)),'paragraph_count':sum(1 for x in lines[1:] if x.strip()),'mean_sentence_words':round(statistics.mean(sentence_lengths),3) if sentence_lengths else 0,'max_sentence_words':max(sentence_lengths,default=0)})
        passages.extend(chunk_passages(n,lines))
    findings=detect_findings(chapters)
    result={'objective':'AGLO-REAL-BOOK-WHOLE-BOOK-NONDESTRUCTIVE-SWEEP-001','standing':'PASS__PRIVATE_29_CHAPTER_SWEEP_EXECUTED__ADJUDICATION_REQUIRED','source_package_sha256':observed,'baseline_version_id':'AGLO-REJECT-ALL-NARRATIVE-v1','baseline_text_sha256':EXPECTED_BASELINE_SHA256,'revision_projection':'REJECT_ALL','narrative_chapter_count':len(chapters),'total_word_count':sum(x['word_count'] for x in chapter_rows),'chapter_manifest':chapter_rows,'passage_state_count':len(passages),'passage_states':passages,'findings':findings,'raw_manuscript_text_persisted':False,'candidate_text_persisted':False,'original_source_mutated':False,'automatic_overwrite_authorized':False,'publication_authorized':False,'universal_prose_score_used':False,'named_author_target_used':False}
    Path(output).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    return result

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--docx',required=True); ap.add_argument('--output',required=True); args=ap.parse_args()
    r=run(Path(args.docx),Path(args.output))
    print(json.dumps({'standing':r['standing'],'chapter_count':r['narrative_chapter_count'],'total_word_count':r['total_word_count'],'passage_state_count':r['passage_state_count'],'finding_count':len(r['findings']),'finding_types':{k:sum(1 for f in r['findings'] if f['finding_type']==k) for k in sorted(set(f['finding_type'] for f in r['findings']))}},indent=2))
if __name__=='__main__': main()
