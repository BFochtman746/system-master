from __future__ import annotations
import datetime as dt, importlib.util, json, sys, tempfile, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/"control-gateway"/"python"))
from a01_night_scheduler import A01NightScheduler
from a01_run_now_once import A01RunNowExecutionWorker, EventBoundRunNowSource
from a01_supervisor_coordination import SupervisorCoordinationAdapter
from tools.second_shift_supervisor_v2 import SupervisorStore
spec=importlib.util.spec_from_file_location("helpers",ROOT/"tests"/"test_control_gateway_a01_supervisor_coordination.py");helpers=importlib.util.module_from_spec(spec);sys.modules[spec.name]=helpers;spec.loader.exec_module(helpers)
UTC=dt.timezone.utc;DAY=dt.datetime(2026,9,23,16,0,tzinfo=UTC);NIGHT=dt.datetime(2026,9,23,5,0,tzinfo=UTC)
def handoff(name,lane,klass):
 h=helpers.make_handoff(name,lane,execution_class=klass);sha="d"*40;p={"qualification_id":"A01-CONTROL-PLANE-SELFTEST","workstream_id":"SYSTEM-MASTER","subject_sha":sha,"control_plane_sha":sha,"origin_ref":"main","qualifier_timeout_minutes":5};r=h["admission_receipt"];r["payload_digest"]=helpers.digest(p);b=dict(r);b.pop("admission_digest");r["admission_digest"]=helpers.digest(b);h["payload"]=p;h["payload_digest"]=r["payload_digest"];b=dict(h);b.pop("handoff_digest");h["handoff_digest"]=helpers.digest(b);return h
class T(unittest.TestCase):
 def setUp(self): self.t=tempfile.TemporaryDirectory();self.s=SupervisorStore(Path(self.t.name)/"s.db")
 def tearDown(self): self.s.close();self.t.cleanup()
 def test_bound_issue(self):
  i={"number":1};self.assertEqual(EventBoundRunNowSource("BFochtman746","system-master",i).list_run_now_issues(),[i])
 def test_immediate_executes_without_night_queue(self):
  h=handoff("R","LANE-R","IMMEDIATE");c=helpers.make_coord(h,resource="OWNER-LANE:LANE-R",graph="R");a=SupervisorCoordinationAdapter(self.s);a.bind(h,c,now=DAY);claim=a.claim(h,c,now=DAY);self.assertIsNone(self.s.conn.execute("SELECT 1 FROM night_scheduler_queue WHERE delegation_id=?",(h["delegation_id"],)).fetchone())
  w=A01RunNowExecutionWorker(self.s,scheduler=A01NightScheduler(self.s),root=ROOT,lease_seconds=60,renew_seconds=10,heartbeat_sla_seconds=120,clock=lambda:DAY,worker_id="w");w._git_head=lambda:"d"*40;cap={}
  class P:
   returncode=0
   def communicate(self,timeout=None): return ("OK","")
  def spawn(argv,*,cwd,env):
   cap.update(env);e=Path(env["A01_EVIDENCE_DIR"]);e.mkdir(parents=True,exist_ok=True);(e/"receipt.json").write_text(json.dumps({"result_class":"PASS"}),encoding="utf-8");return P()
  w._spawn_managed_process=spawn;r=w.consume_dispatch(claim.dispatch_id,now=DAY);self.assertEqual(r["state"],"SUCCEEDED");self.assertEqual(cap["A01_EXECUTION_CONTEXT"],"normal")
 def test_refuses_overnight(self):
  h=handoff("N","LANE-N","OVERNIGHT");c=helpers.make_coord(h,resource="OWNER-LANE:LANE-N",graph="N");a=SupervisorCoordinationAdapter(self.s);a.bind(h,c,now=NIGHT);claim=a.claim(h,c,now=NIGHT);w=A01RunNowExecutionWorker(self.s,scheduler=A01NightScheduler(self.s),root=ROOT,clock=lambda:NIGHT,worker_id="n");w._git_head=lambda:"d"*40;r=w.consume_dispatch(claim.dispatch_id,now=NIGHT);self.assertEqual(r["state"],"FAILED");self.assertIn("IMMEDIATE work only",r["error_message"])
 def test_workflow_guardrails(self):
  x=(ROOT/".github"/"workflows"/"control-gateway-native-a01-run-now-ingress.yml").read_text();self.assertIn("types: [opened]",x);self.assertIn("github.actor == github.repository_owner",x);self.assertIn("author_association == 'OWNER'",x);self.assertIn("a01-global-r2",x);self.assertNotIn("contents: write",x)
if __name__=="__main__":unittest.main(verbosity=2)
