#!/usr/bin/env python3
import importlib.util
import pathlib
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('v',HERE/'semantic_evidence_validator.py')
v=importlib.util.module_from_spec(spec); spec.loader.exec_module(v)
D='a'*64
A=[{'locator_id':'P1-S3','sha256':'b'*64}]

def check(c,m):
    if not c: raise AssertionError(m)

good={
 'provider_id':'MODEL-X','provider_kind':'MODEL','source_id':'S1','passage_digest':D,
 'passage_state_claims':[{'claim_id':'C1','field':'pov','value_code':'THIRD_LIMITED','confidence':0.86,'authority_status':'MODEL_HYPOTHESIS','evidence_anchors':A,'alternatives':['OMNISCIENT']}],
 'diagnostic_signals':[{'evidence_id':'E1','specialist_id':'PACKET_012_PROSE_CRAFT','dimension':'CADENCE_INTENT','confidence':0.74,'finding_type':'HYPOTHESIS','claim_code':'CADENCE_PATTERN_PRESENT','evidence_anchors':A}],
 'revision_authorized':False,'named_author_target':False
}
r=v.validate(good); check(r['standing']=='PASS','grounded hypothesis rejected'); check(r['normalized']['passage_state_claims'][0]['disposition']=='ADMIT_HYPOTHESIS','hypothesis not admitted'); check(r['normalized']['diagnostic_signals'][0]['finding_type']=='OBSERVATION','signal not normalized to observation')

low={**good,'passage_state_claims':[{'claim_id':'C2','field':'focalization','value_code':'INTERNAL','confidence':0.45,'authority_status':'MODEL_HYPOTHESIS','evidence_anchors':A}]}
r=v.validate(low); check(r['standing']=='PASS','low confidence should be valid unresolved evidence'); check(r['normalized']['passage_state_claims'][0]['disposition']=='UNRESOLVED','low confidence not unresolved')

author={**good,'passage_state_claims':[{'field':'authorial_intent','value_code':'INTENTIONAL_REFRAIN','confidence':0.95,'authority_status':'MODEL_HYPOTHESIS','evidence_anchors':A}]}
check(v.validate(author)['standing']=='REJECT','model escalated to author intent')
canon={**good,'passage_state_claims':[{'field':'canon_facts','value_code':'FACT_X','confidence':0.95,'authority_status':'MODEL_HYPOTHESIS','evidence_anchors':A}]}
check(v.validate(canon)['standing']=='REJECT','model escalated to canon')
wrong={**good,'diagnostic_signals':[{'specialist_id':'PACKET_012_PROSE_CRAFT','dimension':'ACTIVE_GOAL','confidence':0.9,'evidence_anchors':A}]}
check(v.validate(wrong)['standing']=='REJECT','wrong dimension owner accepted')
defect={**good,'diagnostic_signals':[{'specialist_id':'PACKET_012_PROSE_CRAFT','dimension':'CADENCE_INTENT','confidence':0.9,'finding_type':'LIMITATION','evidence_anchors':A}]}
check(v.validate(defect)['standing']=='REJECT','provider self-certified defect')
harm={**good,'diagnostic_signals':[{'specialist_id':'PACKET_012_PROSE_CRAFT','dimension':'CADENCE_INTENT','confidence':0.9,'evidence_anchors':A,'functional_harm_evidence':True}]}
check(v.validate(harm)['standing']=='REJECT','provider self-certified harm')
raw={**good,'raw_text':'private prose'}; check(v.validate(raw)['standing']=='REJECT','raw text leakage accepted')
rev={**good,'revision_authorized':True}; check(v.validate(rev)['standing']=='REJECT','provider revision authority accepted')
name={**good,'named_author_target':True}; check(v.validate(name)['standing']=='REJECT','named author target accepted')
reader={**good,'diagnostic_signals':[{'specialist_id':'PACKET_013_READER_EXPERIENCE','dimension':'LOCAL_MEANING','confidence':0.8,'evidence_anchors':A}]}; check(v.validate(reader)['standing']=='REJECT','reader dimension admitted through text semantic provider')
noanchor={**good,'passage_state_claims':[{'field':'pov','value_code':'THIRD_LIMITED','confidence':0.9,'authority_status':'MODEL_HYPOTHESIS','evidence_anchors':[]}]}; check(v.validate(noanchor)['standing']=='REJECT','unanchored semantic claim accepted')
print('PASS: 14/14 semantic evidence authority assertions')
