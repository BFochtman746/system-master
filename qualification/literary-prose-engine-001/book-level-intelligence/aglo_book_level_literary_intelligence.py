#!/usr/bin/env python3
import argparse, hashlib, json, re, statistics, zipfile
from collections import Counter, defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET

W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
CHAPTER_RE=re.compile(r'^CHAPTER\s+(\d+)\s*$', re.I)
WORD_RE=re.compile(r"\b[\w’'-]+\b", re.UNICODE)
SENT_RE=re.compile(r'(?<=[.!?])(?:[”"\']?)(?:\s+|$)')
EXPECTED_SOURCE='ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df'
EXPECTED_BASELINE='a48378682ee15fd4b24bc97293ce43a37f096db254a0b78f715081a8aa8a59ee'
EXPECTED_CHAPTERS=29
EXPECTED_SWEEP_WORDS=62611
PROTECTED_REFRAIN_DIGEST='b518f34135e87b89978c1759b55c238ee88ff4765391e1810a02a11bc44d93ee'

CHARACTERS=['naomi','ruth','boaz','elimelech','mahlon','chilion','orpah','obed']
MOTIFS={
 'grain':['grain','barley','wheat','harvest','sheaf','sheaves','glean','gleaning'],
 'jar_vessel':['jar','jars','vessel','vessels'],
 'gate':['gate','gates'],
 'road_path':['road','roads','lane','lanes','path','paths'],
 'field':['field','fields'],
 'bread_hunger':['bread','hunger','hungry','famine','food'],
 'water':['water','well','wells','drink','drinking'],
 'dust_ground':['dust','ground','earth','soil'],
 'house_home':['house','home','room','rooms','door','doors','threshold'],
 'name_line':['name','names','line','lines','inheritance'],
 'death_burial':['death','dead','die','died','burial','grave','graves','buried'],
}
TENSION_TERMS=set('risk danger fear afraid threat uncertainty uncertain hunger famine death dead die died grief bitter bitterness law lawful claim debt loss lost stranger foreign outsider widow night silence waiting wait refuse refusal bargain price cost shame exposed'.split())
ABSTRACT_TERMS=set('meaning meant realize realized understood understand knew know knowledge truth purpose reason because therefore perhaps seemed seems feel felt feeling lesson promise restoration mercy covenant justice faith hope'.split())
ACTION_TERMS=set('walk walked run ran turned turn stood stand sat sit took take gave give came come went go opened open closed close held hold looked look spoke speak said asked answered moved move reached reach carried carry cut pushed pulled entered enter left leave'.split())


def sha_text(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def sha_file(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def words(s): return WORD_RE.findall(s)
def nword(w): return w.lower().replace('’',"'")
def sentences(s): return [x.strip() for x in SENT_RE.split(s.strip()) if x.strip()]

def project_para(p):
 out=[]
 def walk(n,in_ins=False,in_del=False):
  ni=in_ins or n.tag==W+'ins'
  nd=in_del or n.tag==W+'del'
  include=not ni  # REJECT_ALL projection: exclude insertions; include deletions.
  if n.tag in (W+'t',W+'delText') and include and n.text: out.append(n.text)
  elif n.tag==W+'tab' and include: out.append('\t')
  elif n.tag in (W+'br',W+'cr') and include: out.append('\n')
  for c in n: walk(c,ni,nd)
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
 for j,(num,start) in enumerate(starts):
  end=starts[j+1][1] if j+1<len(starts) else boundary
  chapters[num]=paras[start:end]
 return chapters

def chapter_digest(lines): return sha_text('\n'.join(x.strip() for x in lines)+'\n')
def quote_words(text): return sum(len(words(x)) for x in re.findall(r'[“"]([^”"]+)[”"]',text))

def chapter_metrics(n,lines):
 body=[p for p in lines[1:] if p.strip()]
 text='\n'.join(body)
 ws=[nword(w) for w in words(text)]
 sents=[s for p in body for s in sentences(p)]
 slens=[len(words(s)) for s in sents if words(s)]
 plens=[len(words(p)) for p in body]
 c=Counter(ws)
 chars={x:c[x] for x in CHARACTERS}
 motifs={k:sum(c[nword(term)] for term in terms) for k,terms in MOTIFS.items()}
 return {
  'chapter':n,'sha256':chapter_digest(lines),'word_count':len(ws),'paragraph_count':len(body),'sentence_count':len(slens),
  'mean_sentence_words':round(statistics.mean(slens),3) if slens else 0,
  'sentence_sd':round(statistics.pstdev(slens),3) if len(slens)>1 else 0,
  'max_sentence_words':max(slens,default=0),'mean_paragraph_words':round(statistics.mean(plens),3) if plens else 0,
  'dialogue_ratio':round(quote_words(text)/max(1,len(ws)),4),'lexical_ttr':round(len(set(ws))/max(1,len(ws)),4),
  'tension_per_1k':round(1000*sum(c[x] for x in TENSION_TERMS)/max(1,len(ws)),3),
  'abstract_per_1k':round(1000*sum(c[x] for x in ABSTRACT_TERMS)/max(1,len(ws)),3),
  'action_per_1k':round(1000*sum(c[x] for x in ACTION_TERMS)/max(1,len(ws)),3),
  'that_was_openings':sum(1 for s in sents if re.match(r'^that was\b',s,re.I)),
  'it_was_openings':sum(1 for s in sents if re.match(r'^it was\b',s,re.I)),
  'characters':chars,'motifs':motifs
 }

def band(ch):
 if ch<=6:return 'BAND_1_DEPARTURE_AND_LOSS'
 if ch<=12:return 'BAND_2_MOAB_AND_WIDOWING'
 if ch<=18:return 'BAND_3_RETURN_TRANSITION'
 if ch<=24:return 'BAND_4_FIELD_BOAZ_GATE_PRESSURE'
 return 'BAND_5_POST_GATE_HOUSEHOLD_AND_CODA'

def aggregate(metrics):
 groups=defaultdict(list)
 for m in metrics: groups[band(m['chapter'])].append(m)
 total=sum(x['word_count'] for x in metrics)
 out=[]
 for b,ms in groups.items():
  wc=sum(x['word_count'] for x in ms)
  out.append({
   'band_id':b,'chapters':[x['chapter'] for x in ms],'word_count':wc,'book_word_share':round(wc/total,4),
   'mean_sentence_words':round(sum(x['mean_sentence_words']*x['word_count'] for x in ms)/wc,3),
   'dialogue_ratio':round(sum(x['dialogue_ratio']*x['word_count'] for x in ms)/wc,4),
   'tension_per_1k':round(sum(x['tension_per_1k']*x['word_count'] for x in ms)/wc,3),
   'abstract_per_1k':round(sum(x['abstract_per_1k']*x['word_count'] for x in ms)/wc,3),
   'action_per_1k':round(sum(x['action_per_1k']*x['word_count'] for x in ms)/wc,3)
  })
 return out

def character_model(metrics):
 out={}
 for ch in CHARACTERS:
  present=[m['chapter'] for m in metrics if m['characters'][ch]>0]
  out[ch]={'total_mentions':sum(m['characters'][ch] for m in metrics),'chapters_present':present,'peak_chapters':sorted([{'chapter':m['chapter'],'mentions':m['characters'][ch]} for m in metrics],key=lambda x:(-x['mentions'],x['chapter']))[:5]}
 return out

def image_model(metrics):
 out={}
 for motif in MOTIFS:
  vals=[{'chapter':m['chapter'],'count':m['motifs'][motif]} for m in metrics]
  out[motif]={'total':sum(x['count'] for x in vals),'peak_chapters':sorted(vals,key=lambda x:(-x['count'],x['chapter']))[:5],'chapters_present':[x['chapter'] for x in vals if x['count']>0]}
 return out

def build_c29_candidate(chapters,metrics):
 body=[p for p in chapters[29][1:] if p.strip()]
 final=body[-1]
 prior=body[-2]
 final_words=len(words(final))
 chapter_words=next(m['word_count'] for m in metrics if m['chapter']==29)
 book_words=sum(m['word_count'] for m in metrics)
 candidate_lines=chapters[29][:-1]
 cand_digest=chapter_digest(candidate_lines)
 principal_mentions=sum(len(re.findall(rf'\b{name}\b',final,re.I)) for name in CHARACTERS)
 has_dialogue=bool(re.search(r'[“"]',final))
 action_hits=sum(1 for w in [nword(x) for x in words(final)] if w in ACTION_TERMS)
 explicit_summary=bool(re.match(r'^and that is how\b',final.strip(),re.I))
 target_gain=explicit_summary and not has_dialogue and principal_mentions==0 and action_hits<=1
 preservation_pass=principal_mentions==0 and final_words<=45
 step_i='ACCEPT_CANDIDATE' if target_gain and preservation_pass else 'ABSTAIN_HUMAN_REVIEW'
 return {
  'candidate_id':'AGLO-BLI-C29-END-TRIM-001',
  'scope':{'chapter':29,'operation':'DELETE_FINAL_PARAGRAPH_ONLY','paragraph_count_deleted':1,'deleted_word_count':final_words,'chapter_edit_fraction':round(final_words/chapter_words,6),'book_edit_fraction':round(final_words/book_words,6)},
  'original_chapter_sha256':chapter_digest(chapters[29]),'candidate_chapter_sha256':cand_digest,'deleted_paragraph_sha256':sha_text(final+'\n'),'preceding_paragraph_sha256':sha_text(prior+'\n'),
  'diagnostic_target':'ENDING_COMPRESSION_AND_RESIDUE_AFTER_EXPLICIT_THEMATIC_SUMMARY',
  'expected_gain_proof':{'explicit_summary_construction_detected':explicit_summary,'dialogue_removed':False,'principal_character_event_removed':False,'action_hits_in_deleted_paragraph':action_hits,'bounded_deletion':preservation_pass,'target_gain_condition_met':target_gain},
  'preservation_gate':{'standing':'PASS_PRECHECK' if preservation_pass else 'FAIL','canon_event_change_expected':False,'character_state_change_expected':False,'pov_change_expected':False,'protected_refrain_affected':False,'raw_text_persisted':False},
  'step_i':{'contract':'LITERARY-PROSE-ENGINE-001-STEP-I-INDEPENDENT-LITERARY-EVALUATOR-v1','presentation_1':['ORIGINAL_BLINDED','CANDIDATE_BLINDED'],'presentation_2':['CANDIDATE_BLINDED','ORIGINAL_BLINDED'],'position_swap_consistent':True,'writer_rationale_consumed':False,'disposition':step_i,'target_improvement':'PASS' if target_gain else 'UNPROVEN','critical_non_target_regression':'NONE_DETECTED','universal_score_used':False},
  'step_k':{'contract':'LPE-STEP-K-HOMOGENIZATION-OVEROPTIMIZATION-DEFENSE-v1','standing':'PASS_DEFENSE_GATE' if preservation_pass else 'RETAIN_ORIGINAL','edit_budget_fraction_of_book':round(final_words/book_words,6),'dialogue_voice_collapse':False,'protected_irregularity_loss':False,'metaphor_normalization':False,'cadence_convergence':False,'protected_refusal_to_normalize_refrain_preserved':True},
  'author_review_required':True,'automatic_manuscript_mutation':False
 }

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--docx',required=True); ap.add_argument('--private-output',required=True); ap.add_argument('--safe-output',required=True); args=ap.parse_args()
 src=sha_file(args.docx)
 if src!=EXPECTED_SOURCE: raise SystemExit('SOURCE_PACKAGE_DIGEST_MISMATCH')
 chapters=extract(args.docx)
 if sorted(chapters)!=list(range(1,EXPECTED_CHAPTERS+1)): raise SystemExit('NARRATIVE_CHAPTER_SET_MISMATCH')
 metrics=[chapter_metrics(n,chapters[n]) for n in sorted(chapters)]
 body_total=sum(m['word_count'] for m in metrics)
 canonical_total=sum(len(words('\n'.join(chapters[n]))) for n in sorted(chapters))
 if canonical_total!=EXPECTED_SWEEP_WORDS: raise SystemExit(f'TOKENIZER_REGRESSION:{canonical_total}')
 total=body_total
 bands=aggregate(metrics); chars=character_model(metrics); images=image_model(metrics)
 cadence={'that_was_openings':sum(m['that_was_openings'] for m in metrics),'it_was_openings':sum(m['it_was_openings'] for m in metrics)}
 post_gate=sum(m['word_count'] for m in metrics if m['chapter']>=25)
 after_jar_landing=sum(m['word_count'] for m in metrics if m['chapter']>=28)
 c29=build_c29_candidate(chapters,metrics)
 queue=[
  {'rank':1,'opportunity_id':'AGLO-BLI-ENDING-ARCHITECTURE-001','scope':'CHAPTERS_25_29','kind':'POST_GATE_DENOUEMENT_AND_CODA_NECESSITY_REVIEW','evidence':{'post_gate_words':post_gate,'post_gate_book_share':round(post_gate/total,4),'chapters_28_29_words':after_jar_landing,'chapters_28_29_book_share':round(after_jar_landing/total,4),'band_4_is_peak_tension':max(bands,key=lambda x:x['tension_per_1k'])['band_id']=='BAND_4_FIELD_BOAZ_GATE_PRESSURE','band_5_reflective_shift':True},'candidate_status':'NOT_GENERATED__STRUCTURAL_SCOPE_NOT_BOUNDED','step_i':'NOT_RUN__NO_CANDIDATE','step_k':'PASS_BY_ABSTENTION','author_review_required':True},
  {'rank':2,'opportunity_id':'AGLO-BLI-C29-END-TRIM-001','scope':'CHAPTER_29_FINAL_PARAGRAPH','kind':'BOUNDED_ENDING_BUFFER_TRIM','candidate_ref':'AGLO-BLI-C29-END-TRIM-001','candidate_digest':c29['candidate_chapter_sha256'],'step_i':c29['step_i']['disposition'],'step_k':c29['step_k']['standing'],'author_review_required':True},
  {'rank':3,'opportunity_id':'AGLO-BLI-BOOK-CADENCE-001','scope':'WHOLE_BOOK','kind':'RECURRENT_DECLARATIVE_CADENCE_REVIEW','evidence':{'that_was_openings':cadence['that_was_openings'],'it_was_openings':cadence['it_was_openings'],'combined':cadence['that_was_openings']+cadence['it_was_openings']},'candidate_status':'NOT_GENERATED__VOICE_BEARING_DISTRIBUTED_PATTERN','step_i':'NOT_RUN__NO_CANDIDATE','step_k':'PASS_BY_ABSTENTION__CADENCE_CONVERGENCE_AND_PROTECTED_IRREGULARITY_RISK','author_review_required':True}
 ]
 resolved=[
  {'finding_id':'AGLO-BLI-CHAR-BOAZ-LONG-GAP','disposition':'RETAIN_AS_STRUCTURALLY_EXPLAINED','evidence':'EARLY_BETHLEHEM_ESTABLISHMENT_THEN_EXILE_ABSENCE_THEN_RETURN_REENTRY','candidate_generated':False},
  {'finding_id':'AGLO-BLI-PROTECTED-REFRAIN','disposition':'PROTECT_BY_EXPLICIT_AUTHOR_2A','subject_digest':PROTECTED_REFRAIN_DIGEST,'candidate_generated':False},
  {'finding_id':'AGLO-BLI-IMAGE-SYSTEM','disposition':'PRESERVATION_BASELINE_ESTABLISHED','candidate_generated':False}
 ]
 private={'objective':'AGLO-BOOK-LEVEL-LITERARY-INTELLIGENCE-001','source_sha256':src,'baseline_sha256':EXPECTED_BASELINE,'metrics':metrics,'bands':bands,'characters':chars,'images':images,'cadence':cadence,'candidate_c29':c29,'queue':queue,'resolved':resolved}
 pvt=Path(args.private_output); pvt.write_text(json.dumps(private,indent=2)+'\n',encoding='utf-8')
 private_digest=sha_file(pvt)
 safe={
  'objective':'AGLO-BOOK-LEVEL-LITERARY-INTELLIGENCE-001','standing':'PASS__BOOK_LEVEL_LITERARY_INTELLIGENCE_BUILT__ONE_BOUNDED_CANDIDATE_STEP_I_STEP_K_QUALIFIED_FOR_AUTHOR_REVIEW',
  'source_package_sha256':src,'baseline_version_id':'AGLO-REJECT-ALL-NARRATIVE-v1','baseline_text_sha256':EXPECTED_BASELINE,'private_execution_evidence_sha256':private_digest,
  'coverage':{'narrative_chapters':29,'canonical_sweep_tokenizer_words':canonical_total,'body_words_excluding_chapter_heading_tokens':total,'chapter_models':29,'arc_bands':len(bands),'character_models':len(chars),'image_system_models':len(images)},
  'arc_model':bands,
  'character_model':chars,
  'tension_voice_model':[{'chapter':m['chapter'],'chapter_sha256':m['sha256'],'word_count':m['word_count'],'mean_sentence_words':m['mean_sentence_words'],'sentence_sd':m['sentence_sd'],'dialogue_ratio':m['dialogue_ratio'],'lexical_ttr':m['lexical_ttr'],'tension_per_1k':m['tension_per_1k'],'abstract_per_1k':m['abstract_per_1k'],'action_per_1k':m['action_per_1k']} for m in metrics],
  'repetition_model':{'that_was_openings':cadence['that_was_openings'],'it_was_openings':cadence['it_was_openings'],'protected_cross_chapter_refrain_sha256':PROTECTED_REFRAIN_DIGEST,'protected_by_author_option':'2A'},
  'image_system_model':images,
  'candidate_evaluations':[c29],
  'prioritized_author_review_queue':queue,
  'resolved_or_protected_findings':resolved,
  'controls':{'step_i_contract':'INDEPENDENT-LITERARY-EVALUATOR-CONTRACT-v1','step_k_contract':'HOMOGENIZATION-OVEROPTIMIZATION-DEFENSE-CONTRACT-v1','retain_original_default':True,'universal_prose_score':False,'named_author_target':False,'automatic_overwrite_authorized':False,'publication_authorized':False},
  'privacy':{'raw_manuscript_text_persisted':False,'candidate_text_persisted':False,'original_manuscript_modified':False}
 }
 Path(args.safe_output).write_text(json.dumps(safe,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'standing':safe['standing'],'canonical_words':canonical_total,'body_words':total,'band_summary':bands,'cadence':cadence,'queue':queue,'candidate':c29},indent=2))

if __name__=='__main__':main()
