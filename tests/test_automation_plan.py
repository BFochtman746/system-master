import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.automation_plan import PLAN_NAME, AutomationPlanError, build, verify

ROOT = Path(__file__).resolve().parents[1]

class AutomationPlanTests(unittest.TestCase):
    def _spec(self, root: Path, execution_class="OVERNIGHT") -> Path:
        spec = root / "automation.json"
        spec.write_text(json.dumps({
            "schema_version":"AUTOMATION-SPEC-1.0",
            "automation_id":"foundation-flow",
            "name":"Foundation Flow",
            "execution_class":execution_class,
            "steps":[
                {"id":"prepare","capability_id":"C01","operation":"automation.prepare","effect_class":"LOCAL_ARTIFACT","depends_on":[]},
                {"id":"browse-intent","capability_id":"C02","operation":"browser.inspect","effect_class":"EXTERNAL_SIDE_EFFECT_INTENT","depends_on":["prepare"]}
            ]
        }, indent=2)+"\n")
        return spec

    def test_repeat_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); spec=self._spec(root)
            a=build(spec,root/'a',repo_root=ROOT); b=build(spec,root/'b',repo_root=ROOT)
            self.assertEqual(a['plan_sha256'],b['plan_sha256'])
            self.assertEqual((root/'a'/PLAN_NAME).read_bytes(),(root/'b'/PLAN_NAME).read_bytes())

    def test_overnight_requires_p11_and_no_execution(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); plan=build(self._spec(root),root/'out',repo_root=ROOT)
            self.assertEqual(plan['authority_boundary']['scheduling_requirement'],'SYSTEM_MASTER/CORE/P11_REQUIRED')
            self.assertTrue(all(step['execution_permitted_by_foundation'] is False for step in plan['steps']))
            self.assertEqual(plan['steps'][1]['authority_requirement'],'SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED')

    def test_on_demand_has_no_clock_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); plan=build(self._spec(root,'ON_DEMAND'),root/'out',repo_root=ROOT)
            self.assertEqual(plan['authority_boundary']['clock_authority'],'NOT_GRANTED')
            self.assertEqual(plan['authority_boundary']['scheduling_requirement'],'CALLER_OR_SEPARATELY_ADMITTED_EXECUTOR_REQUIRED')

    def test_cycle_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); spec=self._spec(root); obj=json.loads(spec.read_text())
            obj['steps'][0]['depends_on']=['browse-intent']; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(AutomationPlanError,'cycle'): build(spec,root/'out',repo_root=ROOT)

    def test_unknown_dependency_fails_closed(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); spec=self._spec(root); obj=json.loads(spec.read_text())
            obj['steps'][1]['depends_on']=['missing']; spec.write_text(json.dumps(obj))
            with self.assertRaisesRegex(AutomationPlanError,'unknown step'): build(spec,root/'out',repo_root=ROOT)

    def test_reserved_or_out_of_scope_capability_fails_closed(self):
        for capability in ('C35','C41'):
            with self.subTest(capability=capability), tempfile.TemporaryDirectory() as td:
                root=Path(td); spec=self._spec(root); obj=json.loads(spec.read_text()); obj['steps'][0]['capability_id']=capability; spec.write_text(json.dumps(obj))
                with self.assertRaisesRegex(AutomationPlanError,'unallocated, reserved, or out-of-scope'): build(spec,root/'out',repo_root=ROOT)

    def test_owner_is_bound_from_current_crosswalk(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); plan=build(self._spec(root),root/'out',repo_root=ROOT)
            self.assertEqual(plan['steps'][1]['target_owner'],'SYSTEM_MASTER/CONNECTED_ACTIONS')
            verify(root/'out',repo_root=ROOT)

    def test_tampered_plan_fails_verification(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); out=root/'out'; build(self._spec(root),out,repo_root=ROOT)
            p=out/PLAN_NAME; obj=json.loads(p.read_text()); obj['name']='tampered'; p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(AutomationPlanError,'plan_sha256'): verify(out,repo_root=ROOT)

    def test_existing_output_is_not_destroyed(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); spec=self._spec(root); out=root/'out'; out.mkdir(); marker=out/'keep'; marker.write_text('yes')
            with self.assertRaisesRegex(AutomationPlanError,'already exists'): build(spec,out,repo_root=ROOT)
            self.assertEqual(marker.read_text(),'yes')

    def test_cli_exposes_no_execution_or_scheduling_command(self):
        script=ROOT/'tools'/'automation_plan.py'
        for command in ('run','execute','schedule','shell','dispatch','publish'):
            result=subprocess.run([sys.executable,str(script),command],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0); self.assertIn('invalid choice',result.stderr)

    def test_rehashed_authority_escalation_still_fails_verification(self):
        from tools.automation_plan import _canonical, _sha
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); out=root/'out'; build(self._spec(root),out,repo_root=ROOT)
            p=out/PLAN_NAME; obj=json.loads(p.read_text())
            obj['steps'][1]['authority_requirement']='DOWNSTREAM_EXECUTOR_ADMISSION_REQUIRED'
            body=dict(obj); body.pop('plan_sha256')
            obj['plan_sha256']=_sha(_canonical(body))
            p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(AutomationPlanError,'authority requirement'):
                verify(out,repo_root=ROOT)

if __name__=='__main__': unittest.main()
