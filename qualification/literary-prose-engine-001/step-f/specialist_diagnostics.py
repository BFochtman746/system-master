from collections import defaultdict

HARD_FLAGS={'canon_conflict','protected_language_conflict','authorial_intent_conflict','pov_knowledge_violation','explicit_user_constraint_conflict'}
CONF={'HIGH':1.0,'MEDIUM':0.7,'LOW':0.35,'UNRESOLVED':0.0}

def emit(case):
    findings=[]
    readiness=case.get('passage_state',{}).get('readiness',{})
    critical_missing=set(readiness.get('missing_authorities',[]))
    for s in case.get('signals',[]):
        relevant=s.get('relevant',True)
        if not relevant:
            findings.append(_f(s,'NO_FINDING','not relevant to current passage state',False))
            continue
        if s.get('requires_authority') in critical_missing:
            findings.append(_f(s,'BLOCKED','required passage authority is missing',False,confidence='UNRESOLVED'))
            continue
        finding_type=s.get('finding_type','LIMITATION')
        opportunity=finding_type in {'LIMITATION','RISK','OPPORTUNITY_SUPPORT'} and s.get('opportunity_id') is not None
        findings.append(_f(s,finding_type,s.get('claim','diagnostic finding'),opportunity))
    return findings

def _f(s,typ,claim,opp,confidence=None):
    return {
      'evidence_id':s['evidence_id'],'specialist_id':s['specialist_id'],'finding_type':typ,
      'dimension':s.get('dimension','UNSPECIFIED'),'claim':claim,'signals':s.get('evidence_signals',[]),
      'purpose_relevance':s.get('purpose_relevance',0.5),'confidence':confidence or s.get('confidence','MEDIUM'),
      'severity':s.get('severity',0.5),'preservation_risk':s.get('preservation_risk',0.0),
      'voice_risk':s.get('voice_risk',0.0),'collateral_regression_risk':s.get('collateral_regression_risk',0.0),
      'scope_limit':s.get('scope_limit','SURGICAL'),'evidence_dependencies':s.get('evidence_dependencies',[]),
      'contradictions':s.get('contradictions',[]),'opportunity_candidate':s.get('opportunity_id') if opp else None,
      'rewrite_text_present':bool(s.get('rewrite_text')),'named_author_target':bool(s.get('named_author_target',False)),
      'hard_flags':s.get('hard_flags',[]),'expected_impact':s.get('expected_impact',0.5),'correlation_group':s.get('correlation_group'),
    }

def adjudicate(case, findings, max_opportunities=3):
    if any(f['rewrite_text_present'] or f['named_author_target'] for f in findings):
        return {'status':'REJECT_PRESERVATION_RISK','opportunities':[],'reason':'prohibited_specialist_output'}
    if case.get('passage_state',{}).get('readiness',{}).get('status')=='BLOCKED_NEEDS_CONTEXT':
        return {'status':'NO_ACTION','opportunities':[],'reason':'passage_state_blocked'}
    groups=defaultdict(list)
    for f in findings:
        if f['opportunity_candidate']:
            groups[f['opportunity_candidate']].append(f)
    out=[]
    for oid, fs in groups.items():
        hard=set(x for f in fs for x in f.get('hard_flags',[]))
        if hard & HARD_FLAGS:
            continue
        if any(f['confidence']=='UNRESOLVED' for f in fs) and not any(f['confidence'] in {'HIGH','MEDIUM'} for f in fs):
            continue
        by_corr={}
        for f in fs:
            k=f.get('correlation_group') or f['specialist_id']
            by_corr[k]=max(by_corr.get(k,0),CONF[f['confidence']])
        conf=max(by_corr.values()) if by_corr else 0
        purpose=max(f['purpose_relevance'] for f in fs)
        impact=max(f['expected_impact'] for f in fs)
        risk=max(max(f['preservation_risk'],f['voice_risk'],f['collateral_regression_risk']) for f in fs)
        conflict=any(f['contradictions'] for f in fs)
        score=impact*0.35+conf*0.25+purpose*0.30+(1-risk)*0.10
        out.append({'opportunity_id':oid,'score':round(score,4),'confidence':round(conf,3),'purpose_relevance':purpose,'expected_impact':impact,'max_risk':risk,'status':'REVIEW_CONFLICT' if conflict else 'ADMIT','supporting_evidence':[f['evidence_id'] for f in fs]})
    out.sort(key=lambda x:(x['status']=='ADMIT',x['score']),reverse=True)
    out=out[:max_opportunities]
    return {'status':'NO_ACTION' if not out else 'ADMIT','opportunities':out}
