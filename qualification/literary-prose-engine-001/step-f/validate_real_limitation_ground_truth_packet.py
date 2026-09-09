import json, sys
from pathlib import Path

ALLOWED={"REAL_LIMITATION","WORKING_AS_INTENDED","NEUTRAL_OBSERVATION","UNCERTAIN"}
EXPECTED_SOURCES={"MOSES_I","UNHINDERED_3","UNHINDERED_4"}

def validate(data, require_labels=False):
    assert data.get('packet_id')=='PROSE-REAL-LIMITATION-GROUND-TRUTH-AUTHOR-PACKET-001'
    assert data.get('raw_prose_present') is False
    assert data.get('candidate_prose_present') is False
    assert data.get('manuscript_mutated') is False
    cases=data.get('cases',[])
    assert len(cases)==6
    assert {c['source_id'] for c in cases}==EXPECTED_SOURCES
    assert len({c['case_id'] for c in cases})==6
    assert all(c.get('revision_authority') is False for c in cases)
    assert all(isinstance(c.get('passage_sha256'),str) and len(c['passage_sha256'])==64 for c in cases)
    assert all(c.get('word_count',0)>0 for c in cases)
    labels=[c.get('author_label') for c in cases]
    if require_labels:
        assert all(x in ALLOWED for x in labels)
        assert data.get('labels_authoritative') is True
        assert data.get('labels_recorded')==6
    else:
        assert all(x is None or x in ALLOWED for x in labels)
        if data.get('labels_authoritative') is False:
            assert data.get('labels_recorded')==sum(x in ALLOWED for x in labels)
    contract=data['selection_contract']
    assert contract.get('selection_is_ground_truth') is False
    assert contract.get('author_view_blinded_to_model_labels') is True
    assert contract.get('revision_authority_after_labeling') is False
    assert set(contract.get('permitted_labels',[]))==ALLOWED
    return {
        'packet_id':data['packet_id'],
        'case_count':len(cases),
        'labels_recorded':sum(x in ALLOWED for x in labels),
        'real_limitation_count':sum(x=='REAL_LIMITATION' for x in labels),
        'revision_authority_count':sum(bool(c.get('revision_authority')) for c in cases),
        'standing':'PASS__GROUND_TRUTH_PACKET_STRUCTURE_VALID__REVISION_AUTHORITY_ZERO'
    }

def main():
    if len(sys.argv)<2:
        raise SystemExit('usage: validate_real_limitation_ground_truth_packet.py PACKET.json [--require-labels]')
    p=Path(sys.argv[1]); data=json.loads(p.read_text(encoding='utf-8'))
    result=validate(data,'--require-labels' in sys.argv[2:])
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__': main()
