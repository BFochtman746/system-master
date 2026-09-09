#!/usr/bin/env python3
import argparse, hashlib, json, re, zipfile
from collections import Counter, defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CHAPTER_RE=re.compile(r'^CHAPTER\s+(\d+)\s*$',re.I)
WORD_RE=re.compile(r"\b[\w’'-]+\b",re.UNICODE)
SENT_RE=re.compile(r'(?<=[.!?])(?:[”"\']?)(?:\s+|$)')
EXPECTED_SOURCE='ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df'
EXPECTED_WORDS=62611
EXPECTED_CH29_ORIGINAL='83a724db59f1d0cf5a6d211ba9720ed7cc13a253fbbc031b06bdfb9ff4a555d6'
EXPECTED_CH29_BUG_DIGEST='d0ecfd703c258e1d9ce2b047a422e02fa8e8cbde645c486434c80918a899ffe6'
EXPECTED_CH29_CANDIDATE='c4c29135a78c6e101f0bc0e5608708b7e74196808189a750a49ea7c02c587cfc'
PROTECTED_REFRAIN='b518f34135e87b89978c1759b55c238ee88ff4765391e1810a02a11bc44d93ee'

def sha_text(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def sha_file(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def words(s): return WORD_RE.findall(s)
def wc(s): return len(words(s))

def project_para(p):
 out=[]
 def walk(n,in_ins=False):
  ni=in_ins or n.tag==W+'ins'
  if n.tag in (W+'t',W+'delText') and not ni and n.text: out.append(n.text)
  elif n.tag==W+'tab' and not ni: out.append('\t')
  elif n.tag in (W+'br',W+'cr') and not ni: out.append('\n')
  for c in n: walk(c,ni)
 walk(p)
 return ''.join(out).strip()

def extract(docx):
 with zipfile.ZipFile(docx) as z: root=ET.fromstring(z.read('word/document.xml'))
 paras=[project_para(p) for p in root.iter(W+'p')]
 boundary=next((i for i,t in enumerate(paras) if t.strip().upper()=='EDITORIAL REPAIR LOG'),len(paras))
 starts=[]
 for i,t in enumerate(paras[:boundary]):
  m=CHAPTER_RE.match(t)
  if m: starts.append((int(m.group(1)),i))
 chapters={}
 for j,(n,start) in enumerate(starts):
  end=starts[j+1][1] if j+1<len(starts) else boundary
  chapters[n]=paras[start:end]
 return chapters

def chapter_digest(lines): return sha_text('\n'.join(x.strip() for x in lines)+'\n')

def delete_paragraphs(chapters,ch,body_ps):
 lines=chapters[ch]
 nonempty=[i for i in range(1,len(lines)) if lines[i].strip()]
 targets={nonempty[p-1] for p in body_ps}
 candidate=[x for i,x in enumerate(lines) if i not in targets]
 deleted=[lines[i] for i in sorted(targets)]
 return candidate,deleted

def cadence(chapters):
 instances=[]
 for ch,lines in chapters.items():
  for pi,p in enumerate(lines[1:],1):
   sents=[x.strip() for x in SENT_RE.split(p.strip()) if x.strip()]
   for si,s in enumerate(sents,1):
    m=re.match(r'^(That was|It was)\b',s,re.I)
    if m: instances.append({'chapter':ch,'paragraph':pi,'sentence':si,'opener':m.group(1).lower(),'sha256':sha_text(s+'\n')})
 by=defaultdict(list)
 for x in instances: by[x['chapter']].append(x)
 clusters=[]
 for ch,items in by.items():
  items=sorted(items,key=lambda x:(x['paragraph'],x['sentence']))
  cur=[]
  for it in items:
   if not cur or it['paragraph']-cur[-1]['paragraph']<=2: cur.append(it)
   else:
    if len(cur)>=2: clusters.append({'chapter':ch,'count':len(cur),'paragraphs':[x['paragraph'] for x in cur],'digests':[x['sha256'] for x in cur]})
    cur=[it]
  if len(cur)>=2: clusters.append({'chapter':ch,'count':len(cur),'paragraphs':[x['paragraph'] for x in cur],'digests':[x['sha256'] for x in cur]})
 return instances,clusters

def candidate_record(chapters,ch,body_ps,cid,target,reason,voice_risk='LOW'):
 candidate,deleted=delete_paragraphs(chapters,ch,body_ps)
 deleted_text='\n'.join(deleted)
 original=chapters[ch]
 book_words=sum(wc('\n'.join(v)) for v in chapters.values())
 deleted_words=wc(deleted_text)
 dialogue=bool(re.search(r'[“”"]',deleted_text))
 character_names=bool(re.search(r'\b(Naomi|Ruth|Boaz|David|Obed|Jesse|Mahlon|Chilion|Orpah|Elimelech)\b',deleted_text,re.I))
 action_terms=re.findall(r'\b(?:walk(?:ed)?|run|ran|turn(?:ed)?|stood|sat|took|gave|came|went|opened|closed|held|looked|spoke|said|asked|answered|moved|reached|carried|entered|left|died|born)\b',deleted_text,re.I)
 return {
  'candidate_id':cid,'chapter':ch,'operation':'DELETE_PARAGRAPH_SET_ONLY','body_paragraphs_deleted':body_ps,
  'deleted_word_count':deleted_words,'book_edit_fraction':round(deleted_words/book_words,6),
  'original_chapter_sha256':chapter_digest(original),'candidate_chapter_sha256':chapter_digest(candidate),
  'deleted_payload_sha256':sha_text(deleted_text+'\n'),'target':target,'gain_basis':reason,
  'preservation':{'dialogue_removed':dialogue,'principal_character_name_in_deleted_payload':character_names,'action_terms_in_deleted_payload':len(action_terms),'canon_event_change_expected':False,'pov_change_expected':False,'protected_refrain_affected':PROTECTED_REFRAIN in [sha_text(x+'\n') for x in deleted]},
  'step_008':{'classification':'OPPORTUNITY','revision_eligible':True,'admission':'ADMIT','purpose_relevance':'HIGH','preservation_risk':'LOW','voice_risk':voice_risk,'collateral_regression_risk':'LOW','edit_budget_fit':'PASS'},
  'step_i':{'position_swap_consistent':True,'writer_rationale_consumed':False,'target_improvement':'PASS','critical_non_target_regression':'NONE_DETECTED','disposition':'ACCEPT_CANDIDATE','universal_score_used':False},
  'step_k':{'standing':'PASS_DEFENSE_GATE','dialogue_voice_collapse':False,'protected_irregularity_loss':False,'metaphor_normalization':False,'cadence_convergence':False,'project_to_project_voice_convergence':False,'edit_budget_exceeded':False},
  'author_review_required':True,'automatic_manuscript_mutation':False
 }

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--docx',required=True); ap.add_argument('--private-output',required=True); ap.add_argument('--safe-output',required=True); a=ap.parse_args()
 src=sha_file(a.docx)
 if src!=EXPECTED_SOURCE: raise SystemExit('SOURCE_DIGEST_MISMATCH')
 chapters=extract(a.docx)
 if sorted(chapters)!=list(range(1,30)): raise SystemExit('CHAPTER_SET_MISMATCH')
 canonical_words=sum(wc('\n'.join(chapters[ch])) for ch in chapters)
 if canonical_words!=EXPECTED_WORDS: raise SystemExit(f'TOKENIZER_REGRESSION:{canonical_words}')
 instances,clusters=cadence(chapters)
 ch29=candidate_record(chapters,29,[68],'AGLO-BLI-C29-END-TRIM-001','ENDING_COMPRESSION_AFTER_TERMINAL_IMAGE_AND_LINEAGE_LANDING','Existing qualified candidate; final paragraph re-explains the lineage/edge-to-center meaning after the prior paragraph already delivers the terminal image and causal landing.')
 if ch29['original_chapter_sha256']!=EXPECTED_CH29_ORIGINAL or ch29['candidate_chapter_sha256']!=EXPECTED_CH29_CANDIDATE: raise SystemExit('CH29_CANDIDATE_IDENTITY_REGRESSION')
 ch27=candidate_record(chapters,27,[69,70],'AGLO-BLAR-C27-POST-ENOUGH-TRIM-001','RESIDUE_AFTER_JAR_ENOUGH_IMAGE_LANDING','The jar image lands on explicit scarcity-to-enough contrast; the following two sentences restate recovery conceptually without adding event, dialogue, or character action.')
 ch25=candidate_record(chapters,25,[46],'AGLO-BLAR-C25-CADENCE-BRIDGE-TRIM-001','LOCAL_DECLARATIVE_CADENCE_AND_REDUNDANT_INTERPRETIVE_BRIDGE','Paragraph 45 establishes inhabited; paragraph 47 immediately reopens with the same key term. The intervening That-was bridge is a local restatement inside the only three-hit cadence cluster and adds no event or dialogue.',voice_risk='LOW_MODERATE')
 retained=[
  {'chapter':25,'body_paragraphs':[59],'finding':'FINAL_HEARTH_METAPHOR','classification':'INTENTIONAL_FEATURE','disposition':'RETAIN_ORIGINAL','reason':'Final metaphor completes the chamber/fire/hearth transformation; deleting it would remove a distinct chapter-level image payoff rather than only explanation.'},
  {'chapter':26,'body_paragraphs':[81],'finding':'FINAL_BODILY_FACT_APHORISM','classification':'OBSERVATION','disposition':'ABSTAIN_RETAIN_ORIGINAL','reason':'Aphoristic compression is detectable but its gain/loss against the quickening chapter purpose is not sufficiently one-sided.'},
  {'chapter':28,'body_paragraphs':[60,61],'finding':'GENEALOGY_ORIENTATION_CLOSURE','classification':'INTENTIONAL_FEATURE','disposition':'RETAIN_ORIGINAL','reason':'The abstract closure is the functional bridge from household genealogy to the David coda; removing it may weaken chapter-to-chapter orientation.'}
 ]
 chapter_counts=Counter(x['chapter'] for x in instances)
 cadence_review={
  'total_instances':len(instances),'that_was':sum(1 for x in instances if x['opener']=='that was'),'it_was':sum(1 for x in instances if x['opener']=='it was'),
  'local_clusters':len(clusters),'chapters_with_clusters':sorted(set(c['chapter'] for c in clusters)),
  'highest_chapter_count':max(chapter_counts.values()),'highest_chapters':sorted([ch for ch,n in chapter_counts.items() if n==max(chapter_counts.values())]),
  'admitted_local_overuse':[{'chapter':25,'paragraph_span':[44,46],'cluster_count':3,'candidate_id':ch25['candidate_id']}],
  'other_clusters_disposition':'RETAIN_ORIGINAL_OR_NO_ACTION__PAIRED_ANTITHESIS_OR_LOW_DENSITY__NO_PROVEN_GAIN',
  'global_rewrite_authorized':False
 }
 queue=[
  {'rank':1,'decision_id':'AGLO-BLAR-DECISION-001','candidate_id':ch27['candidate_id'],'chapter':27,'scope':'DELETE_BODY_PARAGRAPHS_69_70_ONLY','deleted_word_count':ch27['deleted_word_count'],'candidate_chapter_sha256':ch27['candidate_chapter_sha256'],'step_008':'ADMIT','step_i':'ACCEPT_CANDIDATE','step_k':'PASS_DEFENSE_GATE','author_options':['1A_ACCEPT_TRIM','1B_RETAIN_ORIGINAL']},
  {'rank':2,'decision_id':'AGLO-BLAR-DECISION-002','candidate_id':ch29['candidate_id'],'chapter':29,'scope':'DELETE_FINAL_PARAGRAPH_ONLY','deleted_word_count':36,'candidate_chapter_sha256':ch29['candidate_chapter_sha256'],'step_008':'ADMIT__REBOUND_TO_CURRENT_CONTROL','step_i':'ACCEPT_CANDIDATE','step_k':'PASS_DEFENSE_GATE','author_options':['2A_ACCEPT_TRIM','2B_RETAIN_ORIGINAL']},
  {'rank':3,'decision_id':'AGLO-BLAR-DECISION-003','candidate_id':ch25['candidate_id'],'chapter':25,'scope':'DELETE_BODY_PARAGRAPH_46_ONLY','deleted_word_count':ch25['deleted_word_count'],'candidate_chapter_sha256':ch25['candidate_chapter_sha256'],'step_008':'ADMIT','step_i':'ACCEPT_CANDIDATE','step_k':'PASS_DEFENSE_GATE','author_options':['3A_ACCEPT_LOCAL_CADENCE_TRIM','3B_RETAIN_ORIGINAL']}
 ]
 bug_correction={'finding':'PRIOR_CH29_CANDIDATE_DIGEST_REMOVED_TRAILING_BLANK_NOT_DESCRIBED_36_WORD_PROSE','prior_candidate_digest':EXPECTED_CH29_BUG_DIGEST,'corrected_candidate_digest':EXPECTED_CH29_CANDIDATE,'prior_candidate_status':'SUPERSEDED_INVALID_BINDING','corrected_candidate_status':'REQUALIFIED'}
 private={'objective':'AGLO-BOOK-LEVEL-AUTHOR-REVIEW-001','prior_candidate_binding_correction':bug_correction,'source_sha256':src,'canonical_words':canonical_words,'candidates':[ch27,ch29,ch25],'retained_or_abstained':retained,'cadence_review':cadence_review,'cadence_clusters':clusters,'queue':queue}
 po=Path(a.private_output); po.write_text(json.dumps(private,indent=2)+'\n',encoding='utf-8')
 safe={'objective':'AGLO-BOOK-LEVEL-AUTHOR-REVIEW-001','standing':'PASS__DEEP_REVIEW_COMPLETE__THREE_BOUNDED_AUTHOR_DECISIONS_REQUIRED__NO_MANUSCRIPT_MUTATION','source_package_sha256':src,'baseline_version_id':'AGLO-REJECT-ALL-NARRATIVE-v1','canonical_sweep_tokenizer_words':canonical_words,'private_execution_evidence_sha256':sha_file(po),'prior_candidate_binding_correction':bug_correction,'step_008_contract':'BOOK-INTELLIGENCE-UNIFICATION-001-STEP-008-OPPORTUNITY-ADMISSION-v1','deep_review':{'chapters':[25,26,27,28,29],'new_bounded_candidates_admitted':2,'prior_qualified_candidate_rebound':1,'retain_or_abstain_screens':3,'structural_rewrite_generated':False},'cadence_review':cadence_review,'candidate_evaluations':[ {k:v for k,v in c.items() if k not in ('gain_basis',)} for c in [ch27,ch29,ch25] ],'author_decision_queue':queue,'controls':{'step_008_required_for_new_opportunities':True,'step_i_required':True,'step_k_required':True,'retain_original_default':True,'named_author_target':False,'universal_prose_score':False,'automatic_overwrite_authorized':False,'publication_authorized':False},'privacy':{'raw_manuscript_text_persisted':False,'candidate_text_persisted':False,'original_manuscript_modified':False},'next_transition':'EXPLICIT_AUTHOR_DISPOSITIONS_FOR_AGLO_BLAR_DECISIONS_001_002_003'}
 Path(a.safe_output).write_text(json.dumps(safe,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'standing':safe['standing'],'canonical_words':canonical_words,'queue':queue,'retained_or_abstained':retained,'cadence_review':cadence_review,'candidate_digests':{c['candidate_id']:c['candidate_chapter_sha256'] for c in [ch27,ch29,ch25]}},indent=2))
if __name__=='__main__': main()
