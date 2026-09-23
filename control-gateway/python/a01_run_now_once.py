from __future__ import annotations
import argparse, datetime as dt, json, os, subprocess
from pathlib import Path
from typing import Any, Optional
from a01_execution_worker import A01ExecutionWorker, ROOT, WorkExecutionFailed
from a01_ingress_service import RunNowGitHubSource, UserDirectedRunNowIngress
from a01_night_scheduler import A01NightScheduler
from a01_supervisor_coordination import SupervisorCoordinationAdapter
from tools.second_shift_supervisor_v2 import StaleWorker, SupervisorStore

class RunNowOnceError(RuntimeError): pass

class EventBoundRunNowSource(RunNowGitHubSource):
    def __init__(self, owner: str, repo: str, issue: dict[str, Any], **kwargs: Any):
        super().__init__(owner, repo, **kwargs); self.issue = issue
    def list_run_now_issues(self): return [self.issue]

class A01RunNowExecutionWorker(A01ExecutionWorker):
    def _execute_a01_qualification(self, payload, context):
        if not isinstance(payload, dict): raise WorkExecutionFailed("qualification payload must be an object")
        qid=self._require_string(payload,"qualification_id"); wid=self._require_string(payload,"workstream_id"); sha=self._require_string(payload,"subject_sha")
        if len(sha)!=40 or any(ch not in "0123456789abcdefABCDEF" for ch in sha): raise WorkExecutionFailed("subject_sha must be a 40-character hexadecimal Git SHA")
        checkout=self._git_head()
        if checkout.lower()!=sha.lower(): raise WorkExecutionFailed("local checkout does not match admitted qualification subject",{"expected_subject_sha":sha,"checkout_sha":checkout})
        control=payload.get("control_plane_sha",checkout)
        if not isinstance(control,str) or control.lower()!=checkout.lower(): raise WorkExecutionFailed("local worker requires admitted control plane to match its exact checkout")
        timeout=int(payload.get("qualifier_timeout_minutes",28))
        if timeout<1 or timeout>240: raise WorkExecutionFailed("qualifier_timeout_minutes must be 1..240")
        row=self.store.conn.execute("SELECT payload_json FROM delegations WHERE delegation_id=?",(context.delegation_id,)).fetchone()
        if row is None: raise WorkExecutionFailed("RUN NOW dispatch is missing durable delegation metadata")
        meta=json.loads(row["payload_json"])
        if meta.get("execution_class")!="IMMEDIATE": raise WorkExecutionFailed("RUN NOW one-shot executor accepts IMMEDIATE work only")
        if meta.get("not_before") or meta.get("not_after"): raise WorkExecutionFailed("RUN NOW IMMEDIATE work must not carry an autonomous time window")
        evidence=context.evidence_dir; evidence.mkdir(parents=True,exist_ok=False)
        env=os.environ.copy(); env.update({
            "A01_QUALIFICATION_ID":qid,"A01_WORKSTREAM_ID":wid,"A01_SUBJECT_SHA":sha,"A01_CONTROL_PLANE_SHA":control,
            "A01_ORIGIN_REF":str(payload.get("origin_ref") or "a01-user-directed-run-now"),
            "A01_RESUME_ON_PASS":str(payload.get("resume_on_pass") or "Continue the next dependency-valid objective."),
            "A01_RESUME_ON_FAILURE":str(payload.get("resume_on_failure") or "Adjudicate evidence and repair the failing boundary."),
            "A01_NOTIFICATION_TARGET":str(payload.get("notification_target") or "originating-workstream"),
            "A01_EXECUTION_CONTEXT":"normal","A01_QUALIFIER_TIMEOUT_MINUTES":str(timeout),"A01_NOT_BEFORE":"","A01_NOT_AFTER":"",
            "A01_CONTROL_ROOT":str(self.root),"A01_SUBJECT_ROOT":str(self.root),"A01_EVIDENCE_DIR":str(evidence),
            "A01_ARTIFACT_NAME":f"{qid}-{context.attempt_id}-evidence","A01_IDEMPOTENCY_KEY":context.idempotency_key,
            "A01_DISPATCH_ID":context.dispatch_id,"A01_EXECUTION_GENERATION":str(context.execution_generation),
            "A01_EXECUTION_OWNER":context.execution_owner,"A01_EXECUTION_ATTEMPT_ID":context.attempt_id,"A01_RETRY_SAFETY":context.retry_safety})
        script=self.root/".github"/"scripts"/"a01-control-plane.js"
        if not script.is_file(): raise WorkExecutionFailed("A-01 control-plane executor script is missing")
        proc=self._spawn_managed_process(["node",str(script),"execute"],cwd=self.root,env=env); stdout=stderr=""
        try:
            while True:
                try: stdout,stderr=proc.communicate(timeout=self.renew_seconds); break
                except subprocess.TimeoutExpired: context.renew(checkpoint_pointer=f"execution:{context.dispatch_id}:run-now-qualification")
        except StaleWorker:
            self._terminate_process_tree(proc); raise
        rp=evidence/"receipt.json"; receipt=json.loads(rp.read_text(encoding="utf-8-sig")) if rp.is_file() else None
        details={"returncode":proc.returncode,"stdout_tail":stdout[-4000:],"stderr_tail":stderr[-4000:],"evidence_dir":str(evidence),"receipt":receipt}
        if proc.returncode!=0 or not isinstance(receipt,dict) or receipt.get("result_class")!="PASS": raise WorkExecutionFailed("registered A-01 qualification did not PASS",details)
        return details

def _load_event(path):
    event=json.loads(Path(path).read_text(encoding="utf-8"))
    if event.get("action")!="opened": raise RunNowOnceError("RUN NOW accepts issues:opened only")
    issue=event.get("issue"); repository=event.get("repository")
    if not isinstance(issue,dict) or not isinstance(repository,dict): raise RunNowOnceError("event lacks issue/repository")
    full=repository.get("full_name")
    if not isinstance(full,str) or full.count("/")!=1: raise RunNowOnceError("repository full_name invalid")
    owner,repo=full.split("/",1); return owner,repo,issue

def run_once(db,event_path,root,evidence_root=None,now=None):
    owner,repo,issue=_load_event(event_path); source=EventBoundRunNowSource(owner,repo,issue,ref="main",token=os.environ.get("A01_INGRESS_TOKEN"))
    store=SupervisorStore(Path(db))
    try:
        scheduler=A01NightScheduler(store); coord=SupervisorCoordinationAdapter(store)
        result=UserDirectedRunNowIngress(source,coord).run_once(now=now,dry_run=False)
        if len(result["claimed"])!=1 or result["skipped"]: raise RunNowOnceError(f"RUN NOW did not produce exactly one claim: {result}")
        dispatch=result["claimed"][0]["dispatch_id"]
        worker=A01RunNowExecutionWorker(store,scheduler=scheduler,root=Path(root),evidence_root=Path(evidence_root) if evidence_root else None)
        execution=worker.consume_dispatch(dispatch,now=now)
        if execution.get("state")!="SUCCEEDED": raise RunNowOnceError(f"RUN NOW dispatch failed: {execution}")
        return {"protocol_version":"control-gateway.a01-user-directed-run-now-once.v1","status":"PASS","issue_number":issue.get("number"),"dispatch_id":dispatch,"execution":execution}
    finally: store.close()

def main():
    p=argparse.ArgumentParser();p.add_argument("--db",required=True);p.add_argument("--event-path",default=os.environ.get("GITHUB_EVENT_PATH",""));p.add_argument("--root",default=str(ROOT));p.add_argument("--evidence-root",default="");a=p.parse_args()
    if not a.event_path:p.error("--event-path or GITHUB_EVENT_PATH required")
    print(json.dumps(run_once(a.db,a.event_path,a.root,a.evidence_root or None),sort_keys=True));return 0
if __name__=="__main__": raise SystemExit(main())
