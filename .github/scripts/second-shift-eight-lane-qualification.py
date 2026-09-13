#!/usr/bin/env python3
"""Deterministic current-lane Second Shift execution-control qualification.

Side-effect-free outside a temporary SQLite database. Exercises the repository's
actual SupervisorStore lane, delegation, fenced claim, dispatch acknowledgement,
heartbeat and terminal-state machinery for every current execution-ready peer.
"""
from __future__ import annotations
import argparse, datetime as dt, json, sys, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path: sys.path.insert(0,str(ROOT))
from tools.second_shift_supervisor_v2 import SupervisorStore

def load(rel:str)->dict: return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def exact(label:str,actual:list[str],expected:list[str])->None:
    if len(actual)!=len(set(actual)): raise RuntimeError(f'{label} contains duplicates: {actual}')
    if set(actual)!=set(expected): raise RuntimeError(f'{label} mismatch expected={sorted(expected)} actual={sorted(actual)}')

def qualify(out:Path)->dict:
    authority=load('governance/CURRENT-AUTHORITY.json'); topology=load(authority['topology']); registry=load(authority['second_shift_registry'])
    lanes=list(topology['execution_readiness']['execution_ready_peer_system_ids'])
    if not lanes: raise RuntimeError('selected topology has no execution-ready peer lanes')
    exact('topology peer_system_ids',list(topology['peer_system_ids']),lanes); exact('authority active_peer_execution_lanes',authority['active_peer_execution_lanes'],lanes); exact('registry owner_files',list(registry['owner_files'].keys()),lanes)
    systems={x['system_id']:x for x in topology['canonical_internal_systems']}
    if set(lanes)-set(systems): raise RuntimeError(f'topology lacks canonical system records for {sorted(set(lanes)-set(systems))}')
    base=dt.datetime(2026,9,13,5,0,0,tzinfo=dt.timezone.utc); results=[]
    with tempfile.TemporaryDirectory(prefix='second-shift-current-lanes-') as tmp:
      with SupervisorStore(Path(tmp)/'qualification.sqlite3') as store:
        for index,lane in enumerate(lanes):
          system=systems[lane]; at=base+dt.timedelta(seconds=index*10); owner=f'SYSTEM_MASTER/{lane}'; head=f"qualification:{topology['topology_id']}:{lane}"; delegation=f'QUAL-{lane}-001'; objective=f'QUALIFY-{lane}-SECOND-SHIFT'; idem=f"qualification:{topology['topology_id']}:{lane}:001"
          store.register_lane(lane=lane,owner_path=owner,control_ref=system['control_ref'],control_head=head,now=at)
          store.bind_ready(lane=lane,delegation_id=delegation,objective_id=objective,control_head=head,payload={'qualification_only':True,'topology_id':topology['topology_id']},now=at+dt.timedelta(seconds=1))
          claim=store.claim_ready(lane=lane,delegation_id=delegation,objective_id=objective,control_head=head,idempotency_key=idem,executor_kind='SECOND_SHIFT_QUALIFICATION',dispatch_payload={'qualification_only':True,'lane':lane},lease_seconds=300,now=at+dt.timedelta(seconds=2),allow_outside_shift=True)
          store.mark_dispatched(claim.dispatch_id,external_run_id=f'qualification-run:{lane}',now=at+dt.timedelta(seconds=3)); store.heartbeat(claim.lease_id,claim.fencing_token,checkpoint_pointer=f'qualification://{lane}/heartbeat',now=at+dt.timedelta(seconds=4)); store.terminal(claim.lease_id,claim.fencing_token,'COMPLETED',payload={'qualification_only':True,'lane':lane},now=at+dt.timedelta(seconds=5))
          delegation_row=store.conn.execute('SELECT state FROM delegations WHERE delegation_id=?',(delegation,)).fetchone(); persisted=store.conn.execute('SELECT status,released_at,fencing_token FROM claims WHERE lease_id=?',(claim.lease_id,)).fetchone(); dispatch=store.conn.execute('SELECT state,external_run_id FROM dispatch_outbox WHERE dispatch_id=?',(claim.dispatch_id,)).fetchone(); events={r[0] for r in store.conn.execute('SELECT event_type FROM events WHERE lane=? AND delegation_id=?',(lane,delegation)).fetchall()}; required={'READY','CLAIMED','DISPATCH_INTENT','DISPATCHED','HEARTBEAT','COMPLETED'}
          if delegation_row is None or delegation_row['state']!='COMPLETED': raise RuntimeError(f'{lane}: delegation did not reach COMPLETED')
          if persisted is None or persisted['status']!='COMPLETED' or persisted['released_at'] is None: raise RuntimeError(f'{lane}: claim did not terminalize cleanly')
          if int(persisted['fencing_token'])!=int(claim.fencing_token): raise RuntimeError(f'{lane}: fencing token changed unexpectedly')
          if dispatch is None or dispatch['state']!='DISPATCHED' or not dispatch['external_run_id']: raise RuntimeError(f'{lane}: dispatch acknowledgement missing')
          missing=sorted(required-events)
          if missing: raise RuntimeError(f'{lane}: missing lifecycle events {missing}')
          results.append({'lane':lane,'control_ref':system['control_ref'],'claim_fencing_token':claim.fencing_token,'dispatch_acknowledged':True,'heartbeat_recorded':True,'terminal_state':'COMPLETED','required_events_present':True})
        active=store.conn.execute('SELECT COUNT(*) AS n FROM claims WHERE released_at IS NULL').fetchone()['n']
        if int(active)!=0: raise RuntimeError(f'qualification left {active} active mutation claims')
    report={'status':'PASS','qualification':'SECOND_SHIFT_CURRENT_LANE_EXECUTION_CONTROL','side_effect_scope':'TEMPORARY_SQLITE_ONLY','authority_id':authority['authority_id'],'topology_id':topology['topology_id'],'registry_id':registry['registry_id'],'qualified_lane_count':len(results),'qualified_lanes':[x['lane'] for x in results],'lane_results':results,'assertions':{'all_current_execution_ready_lanes_exercised':True,'one_fenced_claim_per_lane':True,'dispatch_acknowledgement_exercised':True,'heartbeat_authority_exercised':True,'terminal_completion_exercised':True,'no_live_claims_remaining':True,'external_side_effects_performed':False}}
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2,sort_keys=True)+'\n',encoding='utf-8'); return report

def main()->int:
    p=argparse.ArgumentParser(description='Qualify all current Second Shift peer lanes'); p.add_argument('--out',default='.second-shift-enforcement/current-lane-qualification.json'); args=p.parse_args(); print(json.dumps(qualify(Path(args.out)),indent=2,sort_keys=True)); return 0
if __name__=='__main__': raise SystemExit(main())
