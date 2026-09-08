#!/usr/bin/env python3
import json, re, hashlib, statistics, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

def extract_docx(path):
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read("word/document.xml"))
    ns={"w":"http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    out=[]
    for p in root.findall(".//w:p",ns):
        t="".join((x.text or "") for x in p.findall(".//w:t",ns)).strip()
        if t: out.append(t)
    return out

def wc(s): return len(re.findall(r"\b[\w’'-]+\b",s))
def features(path):
    path=Path(path); raw=path.read_bytes(); paras=extract_docx(path); text="\n".join(paras)
    sentences=[s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z“\"\'])",text) if s.strip()]
    sw=[wc(s) for s in sentences if wc(s)]; pw=[wc(p) for p in paras if wc(p)]; words=re.findall(r"\b[\w’'-]+\b",text.lower()); n=max(1,len(words))
    def p10(pattern,flags=re.I): return round(len(re.findall(pattern,text,flags))*10000/n,2)
    dialogue=sum(1 for p in paras if p.lstrip().startswith(('“','"','‘',"'")))
    return {"content_sha256":hashlib.sha256(raw).hexdigest(),"paragraph_count":len(paras),"sentence_count":len(sw),"word_count":n,"avg_sentence_words":round(statistics.mean(sw),2),"avg_paragraph_words":round(statistics.mean(pw),2),"dialogue_paragraph_rate_pct":round(dialogue*100/len(paras),2),"short_sentence_rate_pct":round(sum(x<=5 for x in sw)*100/len(sw),2),"not_but_per_10k":p10(r"\bnot\b[^\n.!?]{0,120}\bbut\b"),"as_if_per_10k":p10(r"\bas if\b"),"like_per_10k":p10(r"\blike\b"),"hand_per_10k":p10(r"\bhands?\b"),"body_lexicon_per_10k":p10(r"\b(body|bodies|bone|bones|blood|skin|breath|mouth|eyes?|face|fingers?|palms?)\b"),"concrete_motif_lexicon_per_10k":p10(r"\b(dust|water|stone|bread|scroll|reed|staff|awl|chain|chains|rope|wood|fire|ash|blood|hands?)\b")}

def classify_trait(evidence):
    if evidence.get('named_author_target'): return 'REJECT'
    freq=evidence.get('frequency',0); effect=evidence.get('effect_support',0); projects=evidence.get('project_count',1); harm=evidence.get('harm_support',0)
    if harm>=0.8 and effect<0.3: return 'SUPPRESS'
    if effect>=0.8 and (projects>=2 or evidence.get('project_specific')): return 'PROTECT'
    if freq>=0.7 and effect<0.5: return 'CHALLENGE'
    return 'RANGE'

def classify_change(e):
    if e.get('critical_preservation_failure'): return 'VOICE_DEGRADATION'
    if not e.get('target_improvement_supported'): return 'VOICE_UNCERTAIN'
    if not e.get('independent_evaluation_available') and not e.get('explicit_user_approval'): return 'EVOLUTION_CANDIDATE'
    return 'VOICE_EVOLUTION'
