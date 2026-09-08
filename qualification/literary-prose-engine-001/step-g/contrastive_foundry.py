import hashlib, json

CRITICAL={'canon','protected_language','pov','character_knowledge','semantic_core'}
FORBIDDEN={'named_author_target','nearest_author_target','author_similarity'}

def stable_id(prefix,payload):
    raw=json.dumps(payload,sort_keys=True,separators=(',',':')).encode()
    return f"{prefix}-{hashlib.sha256(raw).hexdigest()[:16]}"

def qualify_pair(pair):
    if pair.get('named_author_target') or any(x in pair for x in FORBIDDEN if pair.get(x)):
        return {'outcome':'REJECT','reason':'NAMED_AUTHOR_TARGET'}
    if pair.get('base_reference_state_id') != pair.get('variant_reference_state_id'):
        return {'outcome':'REJECT','reason':'REFERENCE_STATE_MISMATCH'}
    changed=set(pair.get('changed_dimensions',[]))
    if changed & CRITICAL:
        return {'outcome':'HARD_NEGATIVE','reason':'PRESERVATION_CRITICAL_CHANGE'}
    checks=pair.get('preservation_checks',{})
    failed=[k for k,v in checks.items() if v is False]
    if failed:
        return {'outcome':'HARD_NEGATIVE','reason':'PRESERVATION_CHECK_FAILED','failed':failed}
    if len(changed)==0:
        return {'outcome':'DIAGNOSTIC_ONLY','reason':'NO_CONTROLLED_DELTA'}
    if len(changed)>2 and not pair.get('interaction_justification'):
        return {'outcome':'DIAGNOSTIC_ONLY','reason':'MULTIVARIABLE_CONFUSION'}
    if len(changed)==2 and not pair.get('interaction_justification'):
        return {'outcome':'DIAGNOSTIC_ONLY','reason':'INTERACTION_NOT_JUSTIFIED'}
    effect=pair.get('effect_state','UNRESOLVED')
    if effect not in {'SUPPORTED','MIXED','NOT_SUPPORTED','UNRESOLVED'}:
        return {'outcome':'REJECT','reason':'INVALID_EFFECT_STATE'}
    return {'outcome':'QUALIFIED_CONTRAST','reason':'CONTROLLED_DELTA'}

def build_pair(record):
    result=qualify_pair(record)
    core={'reference_state_id':record.get('base_reference_state_id'),'source_class':record.get('source_class','SYNTHETIC'),'primary_technique':record.get('primary_technique'),'changed_dimensions':record.get('changed_dimensions',[]),'base_id':record.get('base_id'),'variant_id':record.get('variant_id')}
    return {**record,'pair_id':stable_id('PAIR',core),'qualification':result}

def technique_record(technique_id,pairs):
    qualified=[p for p in pairs if p['qualification']['outcome']=='QUALIFIED_CONTRAST' and p.get('primary_technique')==technique_id]
    supported=sum(p.get('effect_state')=='SUPPORTED' for p in qualified)
    mixed=sum(p.get('effect_state')=='MIXED' for p in qualified)
    unresolved=sum(p.get('effect_state')=='UNRESOLVED' for p in qualified)
    if not qualified: confidence='UNRESOLVED'
    elif supported>=2 and mixed==0 and unresolved==0: confidence='HIGH'
    elif supported>=1: confidence='MEDIUM'
    else: confidence='LOW'
    return {'technique_id':technique_id,'qualified_pair_count':len(qualified),'supported_count':supported,'mixed_count':mixed,'unresolved_count':unresolved,'confidence':confidence}
