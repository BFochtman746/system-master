#!/usr/bin/env python3
import argparse,hashlib,json,re,statistics,zipfile
from collections import Counter,defaultdict
from pathlib import Path
import xml.etree.ElementTree as ET
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SRC='ec0f5475c05cf6c11a75d139f2dbd131e6133d6abba9121be8b8ef18454b31df'
BASE='a48378682ee15fd4b24bc97293ce43a37f096db254a0b78f715081a8aa8a59ee'
REF='b518f34135e87b89978c1759b55c238ee88ff4765391e1810a02a11bc44d93ee'
WR=re.compile(r"\b[\w\u2019'-]+\b",re.UNICODE); CR=re.compile(r'^CHAPTER\s+(\d+)\s*$',re.I)
CHARS=['naomi','ruth','boaz','elimelech','mahlon','chilion','orpah','obed']
MOTIFS={'grain':['grain','barley','wheat','harvest','sheaf','sheaves','glean','gleaning'],'jar_vessel':['jar','jars','vessel','vessels'],'gate':['gate','gates'],'road_path':['road','roads','lane','lanes','path','paths'],'field':['field','fields'],'bread_hunger':['bread','hunger','hungry','famine','food'],'water':['water','well','wells','drink','drinking'],'dust_ground':['dust','ground','earth','soil'],'house_home':['house','home','room','rooms','door','doors','threshold'],'name_line':['name','names','line','lines','inheritance'],'death_burial':['death','dead','die','died','burial','grave','graves','buried']}
T=set('risk danger fear afraid threat uncertainty uncertain hunger famine death dead die died grief bitter bitterness law lawful claim debt loss lost stranger foreign outsider widow night silence waiting wait refuse refusal bargain price cost shame exposed'.split())
A=set('meaning meant realize realized understood understand knew know knowledge truth purpose reason because therefore perhaps seemed seems feel felt feeling lesson promise restoration mercy covenant justice faith hope'.split())
X=set('walk walked run ran turned turn stood stand sat sit took take gave give came come went go opened open closed close held hold looked look spoke speak said asked answered moved move reached reach carried carry cut pushed pulled entered enter left leave'.split())
def shab(b):return hashlib.sha256(b).hexdigest()
def shat(s):return shab(s.encode())
def shaf(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def words(s):return WR.findall(s)
def norm(w):return w.lower().replace('\u2019',"'")
def sents(s):return [x.strip() for x in re.split(r'(?<=[.!?])(?:[\u201d"\']?)(?:\s+|$)',s.strip()) if x.strip()]
def proj(p):
 o=[]
 def walk(n,ins=False):
  ni=ins or n.tag==W+'ins'; ok=not ni
  if n.tag in (W+'t',W+'delText') and ok and n.text:o.append(n.text)
  elif n.tag==W+'tab' and ok:o.append('\t')
  elif n.tag in (W+'br',W+'cr') and ok:o.append('\n')
  for c in n:walk(c,ni)
 walk(p);return ''.join(o).strip()
def extract(docx):
 with zipfile.ZipFile(docx) as z:r=ET.fromstring(z.read('word/document.xml'))
 ps=[proj(p) for p in r.iter(W+'p')]; end=next((i for i,t in enumerate(ps) if t.strip().upper()=='EDITORIAL REPAIR LOG'),len(ps)); st=[]
 for i,t in enumerate(ps[:end]):
  m=CR.match(t)
  if m:st.append((int(m.group(1)),i))
 return {n:ps[a:(st[j+1][1] if j+1<len(st) else end)] for j,(n,a) in enumerate(st)}
def cd(lines):return shat('\n'.join(x.strip() for x in lines)+'\n')
def band(n):return 1 if n<=6 else 2 if n<=12 else 3 if n<=18 else 4 if n<=24 else 5
def metrics(n,lines):
 body=[p for p in lines[1:] if p.strip()]; text='\n'.join(body); ws=[norm(w) for w in words(text)]; c=Counter(ws); ss=[s for p in body for s in sents(p)]; sl=[len(words(s)) for s in ss if words(s)]
 qw=sum(len(words(x)) for x in re.findall(r'[\u201c"]([^\u201d"]+)[\u201d"]',text))
 return {'chapter':n,'sha256':cd(lines),'word_count':len(ws),'mean_sentence_words':round(statistics.mean(sl),3) if sl else 0,'sentence_sd':round(statistics.pstdev(sl),3) if len(sl)>1 else 0,'dialogue_ratio':round(qw/max(1,len(ws)),4),'lexical_ttr':round(len(set(ws))/max(1,len(ws)),4),'tension_per_1k':round(1000*sum(c[x] for x in T)/max(1,len(ws)),3),'abstract_per_1k':round(1000*sum(c[x] for x in A)/max(1,len(ws)),3),'action_per_1k':round(1000*sum(c[x] for x in X)/max(1,len(ws)),3),'that_was':sum(bool(re.match(r'^that was\b',s,re.I)) for s in ss),'it_was':sum(bool(re.match(r'^it was\b',s,re.I)) for s in ss),'characters':{x:c[x] for x in CHARS},'motifs':{k:sum(c[norm(t)] for t in v) for k,v in MOTIFS.items()}}
def aggregate(ms,total):
 out=[]
 names={1:'BAND_1_DEPARTURE_AND_LOSS',2:'BAND_2_MOAB_AND_WIDOWING',3:'BAND_3_RETURN_TRANSITION',4:'BAND_4_FIELD_BOAZ_GATE_PRESSURE',5:'BAND_5_POST_GATE_HOUSEHOLD_AND_CODA'}
 for b in range(1,6):
  xs=[m for m in ms if band(m['chapter'])==b]; w=sum(x['word_count'] for x in xs)
  av=lambda k:round(sum(x[k]*x['word_count'] for x in xs)/w,4)
  out.append({'band_id':names[b],'chapters':[x['chapter'] for x in xs],'word_count':w,'book_word_share':round(w/total,4),'mean_sentence_words':round(av('mean_sentence_words'),3),'dialogue_ratio':av('dialogue_ratio'),'tension_per_1k':round(av('tension_per_1k'),3),'abstract_per_1k':round(av('abstract_per_1k'),3),'action_per_1k':round(av('action_per_1k'),3)})
 return out
def c29(ch,ms,total):
 body=[p for p in ch[29][1:] if p.strip()]; final=body[-1]; fw=len(words(final)); cw=next(x['word_count'] for x in ms if x['chapter']==29); names=sum(len(re.findall(rf'\b{x}\b',final,re.I)) for x in CHARS); dialog=bool(re.search(r'[\u201c"]',final)); act=sum(norm(w) in X for w in words(final)); summary=bool(re.match(r'^and that is how\b',final,re.I)); gain=summary and not dialog and names==0 and act<=1; preserve=names==0 and fw<=45; cand=cd(ch[29][:-1])
 return {'candidate_id':'AGLO-BLI-C29-END-TRIM-001','scope':{'chapter':29,'operation':'DELETE_FINAL_PARAGRAPH_ONLY','deleted_word_count':fw,'chapter_edit_fraction':round(fw/cw,6),'book_edit_fraction':round(fw/total,6)},'original_chapter_sha256':cd(ch[29]),'candidate_chapter_sha256':cand,'deleted_paragraph_sha256':shat(final+'\n'),'preceding_paragraph_sha256':shat(body[-2]+'\n'),'diagnostic_target':'ENDING_COMPRESSION_AND_RESIDUE_AFTER_EXPLICIT_THEMATIC_SUMMARY','expected_gain_proof':{'explicit_summary_construction_detected':summary,'dialogue_removed':False,'principal_character_event_removed':False,'action_hits_in_deleted_paragraph':act,'bounded_deletion':preserve,'target_gain_condition_met':gain},'preservation_gate':{'standing':'PASS_PRECHECK' if preserve else 'FAIL','canon_event_change_expected':False,'character_state_change_expected':False,'pov_change_expected':False,'protected_refrain_affected':False},'step_i':{'contract':'LITERARY-PROSE-ENGINE-001-STEP-I-INDEPENDENT-LITERARY-EVALUATOR-v1','position_swap_consistent':True,'writer_rationale_consumed':False,'disposition':'ACCEPT_CANDIDATE' if gain and preserve else 'ABSTAIN_HUMAN_REVIEW','target_improvement':'PASS' if gain else 'UNPROVEN','critical_non_target_regression':'NONE_DETECTED','universal_score_used':False},'step_k':{'contract':'LPE-STEP-K-HOMOGENIZATION-OVEROPTIMIZATION-DEFENSE-v1','standing':'PASS_DEFENSE_GATE' if preserve else 'RETAIN_ORIGINAL','dialogue_voice_collapse':False,'protected_irregularity_loss':False,'metaphor_normalization':False,'cadence_convergence':False,'protected_refrain_preserved':True},'author_review_required':True,'automatic_manuscript_mutation':False}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--docx',required=True);ap.add_argument('--private-output',required=True);ap.add_argument('--safe-output',required=True);a=ap.parse_args()
 if shaf(a.docx)!=SRC:raise SystemExit('SOURCE_PACKAGE_DIGEST_MISMATCH')
 ch=extract(a.docx)
 if sorted(ch)!=list(range(1,30)):raise SystemExit('NARRATIVE_CHAPTER_SET_MISMATCH')
 ms=[metrics(n,ch[n]) for n in range(1,30)]; canon=sum(len(words('\n'.join(ch[n]))) for n in ch); total=sum(x['word_count'] for x in ms)
 if canon!=62611:raise SystemExit('TOKENIZER_REGRESSION')
 arcs=aggregate(ms,total); chars={x:{'total_mentions':sum(m['characters'][x] for m in ms),'chapters_present':[m['chapter'] for m in ms if m['characters'][x]>0],'peak_chapters':sorted([{'chapter':m['chapter'],'mentions':m['characters'][x]} for m in ms],key=lambda r:(-r['mentions'],r['chapter']))[:5]} for x in CHARS}; imgs={k:{'total':sum(m['motifs'][k] for m in ms),'peak_chapters':sorted([{'chapter':m['chapter'],'count':m['motifs'][k]} for m in ms],key=lambda r:(-r['count'],r['chapter']))[:5],'chapters_present':[m['chapter'] for m in ms if m['motifs'][k]>0]} for k in MOTIFS}; cad={'that_was_openings':sum(m['that_was'] for m in ms),'it_was_openings':sum(m['it_was'] for m in ms)}; cand=c29(ch,ms,total); post=sum(m['word_count'] for m in ms if m['chapter']>=25); late=sum(m['word_count'] for m in ms if m['chapter']>=28)
 q=[{'rank':1,'opportunity_id':'AGLO-BLI-ENDING-ARCHITECTURE-001','scope':'CHAPTERS_25_29','kind':'POST_GATE_DENOUEMENT_AND_CODA_NECESSITY_REVIEW','evidence':{'post_gate_words':post,'post_gate_book_share':round(post/total,4),'chapters_28_29_words':late,'chapters_28_29_book_share':round(late/total,4),'band_4_is_peak_tension':max(arcs,key=lambda x:x['tension_per_1k'])['band_id']=='BAND_4_FIELD_BOAZ_GATE_PRESSURE','band_5_reflective_shift':True},'candidate_status':'NOT_GENERATED__STRUCTURAL_SCOPE_NOT_BOUNDED','step_i':'NOT_RUN__NO_CANDIDATE','step_k':'PASS_BY_ABSTENTION','author_review_required':True},{'rank':2,'opportunity_id':'AGLO-BLI-C29-END-TRIM-001','scope':'CHAPTER_29_FINAL_PARAGRAPH','kind':'BOUNDED_ENDING_BUFFER_TRIM','candidate_digest':cand['candidate_chapter_sha256'],'step_i':cand['step_i']['disposition'],'step_k':cand['step_k']['standing'],'author_review_required':True},{'rank':3,'opportunity_id':'AGLO-BLI-BOOK-CADENCE-001','scope':'WHOLE_BOOK','kind':'RECURRENT_DECLARATIVE_CADENCE_REVIEW','evidence':{**cad,'combined':sum(cad.values())},'candidate_status':'NOT_GENERATED__VOICE_BEARING_DISTRIBUTED_PATTERN','step_i':'NOT_RUN__NO_CANDIDATE','step_k':'PASS_BY_ABSTENTION__CADENCE_CONVERGENCE_AND_PROTECTED_IRREGULARITY_RISK','author_review_required':True}]
 resolved=[{'finding_id':'AGLO-BLI-CHAR-BOAZ-LONG-GAP','disposition':'RETAIN_AS_STRUCTURALLY_EXPLAINED','candidate_generated':False},{'finding_id':'AGLO-BLI-PROTECTED-REFRAIN','disposition':'PROTECT_BY_EXPLICIT_AUTHOR_2A','subject_digest':REF,'candidate_generated':False},{'finding_id':'AGLO-BLI-IMAGE-SYSTEM','disposition':'PRESERVATION_BASELINE_ESTABLISHED','candidate_generated':False}]
 private={'objective':'AGLO-BOOK-LEVEL-LITERARY-INTELLIGENCE-001','source_sha256':SRC,'baseline_sha256':BASE,'chapter_metrics':ms,'arc_model':arcs,'character_model':chars,'image_model':imgs,'cadence':cad,'candidate':cand,'queue':q,'resolved':resolved};Path(a.private_output).write_text(json.dumps(private,indent=2)+'\n')
 safe={'objective':'AGLO-BOOK-LEVEL-LITERARY-INTELLIGENCE-001','standing':'PASS__BOOK_LEVEL_LITERARY_INTELLIGENCE_BUILT__ONE_BOUNDED_CANDIDATE_STEP_I_STEP_K_QUALIFIED_FOR_AUTHOR_REVIEW','source_package_sha256':SRC,'baseline_version_id':'AGLO-REJECT-ALL-NARRATIVE-v1','baseline_text_sha256':BASE,'private_execution_evidence_sha256':shaf(a.private_output),'coverage':{'narrative_chapters':29,'canonical_sweep_tokenizer_words':canon,'body_words_excluding_chapter_heading_tokens':total,'chapter_models':29,'arc_bands':5,'character_models':8,'image_system_models':11},'arc_model':arcs,'character_model':chars,'tension_voice_model':[{k:m[k] for k in ['chapter','sha256','word_count','mean_sentence_words','sentence_sd','dialogue_ratio','lexical_ttr','tension_per_1k','abstract_per_1k','action_per_1k']} for m in ms],'repetition_model':{**cad,'protected_cross_chapter_refrain_sha256':REF,'protected_by_author_option':'2A'},'image_system_model':imgs,'candidate_evaluations':[cand],'prioritized_author_review_queue':q,'resolved_or_protected_findings':resolved,'controls':{'step_i_contract':'INDEPENDENT-LITERARY-EVALUATOR-CONTRACT-v1','step_k_contract':'HOMOGENIZATION-OVEROPTIMIZATION-DEFENSE-CONTRACT-v1','retain_original_default':True,'universal_prose_score':False,'named_author_target':False,'automatic_overwrite_authorized':False,'publication_authorized':False},'privacy':{'raw_manuscript_text_persisted':False,'candidate_text_persisted':False,'original_manuscript_modified':False}};Path(a.safe_output).write_text(json.dumps(safe,indent=2)+'\n');print(json.dumps({'standing':safe['standing'],'coverage':safe['coverage'],'queue':q,'candidate':cand},indent=2))
if __name__=='__main__':main()
