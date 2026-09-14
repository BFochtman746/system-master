#!/usr/bin/env python3
from __future__ import annotations

import argparse, hashlib, json, os, re, shutil, tempfile
from pathlib import Path

SPEC_SCHEMA = "AUTOMATION-SPEC-1.0"
PLAN_SCHEMA = "AUTOMATION-PLAN-1.0"
CONTRACT_ID = "AUTOMATION-FOUNDATION-1.0"
CAPABILITY_ID = "C01"
OWNER = "SYSTEM_MASTER/PROGRAMMING"
PLAN_NAME = "automation-plan.json"
EXECUTION_CLASSES = {"ON_DEMAND", "OVERNIGHT"}
EFFECTS = {"READ_ONLY", "LOCAL_ARTIFACT", "EXTERNAL_SIDE_EFFECT_INTENT"}
ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,63}$")
OP_RE = re.compile(r"^[a-z][a-z0-9._-]{0,95}$")
CAP_RE = re.compile(r"^C(?:0[0-9]|[1-4][0-9])$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")

class AutomationPlanError(RuntimeError): pass

def _canon(v): return (json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
def _pretty(v): return (json.dumps(v, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode()
def _sha(data): return hashlib.sha256(data).hexdigest()
_canonical = _canon
def _root(): return Path(__file__).resolve().parents[1]

def _json(path: Path, label: str):
    if not path.exists() or not path.is_file() or path.is_symlink():
        raise AutomationPlanError(f"{label} must be an existing regular non-symlink file")
    try: value = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc: raise AutomationPlanError(f"invalid {label}: {exc}") from exc
    if not isinstance(value, dict): raise AutomationPlanError(f"{label} must contain a JSON object")
    return value

def _text(value, field, pattern=None):
    if not isinstance(value, str) or not value.strip(): raise AutomationPlanError(f"{field} must be a non-empty string")
    value = value.strip()
    if pattern and not pattern.fullmatch(value): raise AutomationPlanError(f"{field} has invalid format")
    return value

def _binding(root: Path):
    ap = root / "governance/CURRENT-AUTHORITY.json"; authority = _json(ap, "CURRENT-AUTHORITY.json")
    rel = authority.get("capability_crosswalk")
    if not isinstance(rel, str) or not rel: raise AutomationPlanError("current authority does not name capability_crosswalk")
    cp = root / rel; crosswalk = _json(cp, "capability crosswalk")
    rows = crosswalk.get("capability_entries")
    if not isinstance(rows, list): raise AutomationPlanError("capability crosswalk has no capability_entries array")
    entries = {r["capability_id"]: r for r in rows if isinstance(r, dict) and isinstance(r.get("capability_id"), str)}
    return {"authority_id": authority.get("authority_id"), "authority_path": "governance/CURRENT-AUTHORITY.json",
            "authority_sha256": _sha(ap.read_bytes()), "crosswalk_id": crosswalk.get("crosswalk_id"),
            "crosswalk_path": rel, "crosswalk_sha256": _sha(cp.read_bytes()), "entries": entries}

def _normalize(raw, binding):
    allowed = {"schema_version", "automation_id", "name", "execution_class", "steps"}
    if set(raw) - allowed: raise AutomationPlanError("unknown automation fields: " + ", ".join(sorted(set(raw)-allowed)))
    if raw.get("schema_version") != SPEC_SCHEMA: raise AutomationPlanError(f"schema_version must be {SPEC_SCHEMA}")
    automation_id = _text(raw.get("automation_id"), "automation_id", ID_RE); name = _text(raw.get("name"), "name")
    execution_class = _text(raw.get("execution_class"), "execution_class")
    if execution_class not in EXECUTION_CLASSES: raise AutomationPlanError("execution_class is not admitted")
    rows = raw.get("steps")
    if not isinstance(rows, list) or not rows or len(rows) > 128: raise AutomationPlanError("steps must contain 1-128 entries")
    steps=[]; seen=set()
    for n, row in enumerate(rows, 1):
        if not isinstance(row, dict): raise AutomationPlanError(f"step {n} must be an object")
        if set(row) - {"id","capability_id","operation","effect_class","depends_on"}: raise AutomationPlanError(f"step {n} has unknown fields")
        sid=_text(row.get("id"), f"step {n} id", ID_RE)
        if sid in seen: raise AutomationPlanError(f"duplicate step id: {sid}")
        seen.add(sid); cap=_text(row.get("capability_id"), f"step {sid} capability_id", CAP_RE); entry=binding["entries"].get(cap)
        if not isinstance(entry, dict) or not isinstance(entry.get("owner_path"), str) or not str(entry.get("disposition", "")).startswith("OWNED"):
            raise AutomationPlanError(f"step {sid} targets unallocated, reserved, or out-of-scope capability: {cap}")
        op=_text(row.get("operation"), f"step {sid} operation", OP_RE); effect=_text(row.get("effect_class"), f"step {sid} effect_class")
        if effect not in EFFECTS: raise AutomationPlanError(f"step {sid} effect_class is not admitted")
        deps=row.get("depends_on", [])
        if not isinstance(deps, list) or any(not isinstance(x,str) or not x for x in deps) or len(set(deps)) != len(deps): raise AutomationPlanError(f"step {sid} dependencies are invalid")
        steps.append({"sequence":n,"id":sid,"capability_id":cap,"target_owner":entry["owner_path"],"operation":op,"effect_class":effect,"depends_on":list(deps),
                      "execution_permitted_by_foundation":False,
                      "authority_requirement":"SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED" if effect=="EXTERNAL_SIDE_EFFECT_INTENT" else "DOWNSTREAM_EXECUTOR_ADMISSION_REQUIRED"})
    ids={s["id"] for s in steps}
    for s in steps:
        for dep in s["depends_on"]:
            if dep not in ids: raise AutomationPlanError(f"step {s['id']} depends on unknown step: {dep}")
            if dep == s["id"]: raise AutomationPlanError(f"step {s['id']} may not depend on itself")
    return {"schema_version":SPEC_SCHEMA,"automation_id":automation_id,"name":name,"execution_class":execution_class,"steps":steps}

def _order(steps):
    seq={s["id"]:s["sequence"] for s in steps}; remaining={s["id"]:set(s["depends_on"]) for s in steps}; result=[]
    while remaining:
        ready=sorted((k for k,v in remaining.items() if not v), key=lambda k:(seq[k],k))
        if not ready: raise AutomationPlanError("automation dependency graph contains a cycle")
        for sid in ready:
            result.append(sid); remaining.pop(sid)
            for deps in remaining.values(): deps.discard(sid)
    return result

def _body(spec, binding):
    overnight = spec["execution_class"] == "OVERNIGHT"
    return {"schema_version":PLAN_SCHEMA,"contract_id":CONTRACT_ID,"capability_id":CAPABILITY_ID,"owner":OWNER,
            "automation_id":spec["automation_id"],"name":spec["name"],"execution_class":spec["execution_class"],"source_sha256":_sha(_canon(spec)),
            "authority_binding":{k:binding[k] for k in ("authority_id","authority_path","authority_sha256","crosswalk_id","crosswalk_path","crosswalk_sha256")},
            "topological_order":_order(spec["steps"]),"steps":spec["steps"],
            "authority_boundary":{"programming_owner":OWNER,"clock_authority":"NOT_GRANTED","claim_authority":"NOT_GRANTED","shell_execution_authority":"NOT_GRANTED",
                                  "network_access":False,"credentials_authority":"NOT_GRANTED","connector_action_authority":"NOT_GRANTED","browser_action_authority":"NOT_GRANTED",
                                  "external_side_effects":False,"scheduling_requirement":"SYSTEM_MASTER/CORE/P11_REQUIRED" if overnight else "CALLER_OR_SEPARATELY_ADMITTED_EXECUTOR_REQUIRED"}}

def build(spec_file, output_dir, repo_root=None):
    spec_path=Path(spec_file); output=Path(output_dir).resolve(strict=False); root=Path(repo_root).resolve() if repo_root else _root()
    if spec_path.is_symlink(): raise AutomationPlanError("automation spec may not be a symlink")
    if output.exists(): raise AutomationPlanError("output path already exists; refusing destructive replacement")
    binding=_binding(root); spec=_normalize(_json(spec_path,"automation spec"),binding); body=_body(spec,binding); plan=dict(body); plan["plan_sha256"]=_sha(_canon(body))
    output.parent.mkdir(parents=True,exist_ok=True); staging=Path(tempfile.mkdtemp(prefix=f".{output.name}.c01-",dir=output.parent))
    try:
        (staging/PLAN_NAME).write_bytes(_pretty(plan)); os.replace(staging,output); staging=None; return plan
    finally:
        if staging is not None and staging.exists(): shutil.rmtree(staging,ignore_errors=True)

def verify(output_dir, repo_root=None):
    output=Path(output_dir); root=Path(repo_root).resolve() if repo_root else _root()
    if not output.exists() or not output.is_dir() or output.is_symlink(): raise AutomationPlanError("output directory must be an existing non-symlink directory")
    plan=_json(output/PLAN_NAME,PLAN_NAME); digest=plan.get("plan_sha256"); body=dict(plan); body.pop("plan_sha256",None)
    if not isinstance(digest,str) or _sha(_canon(body)) != digest: raise AutomationPlanError("plan_sha256 does not match plan body")
    expected_top={"schema_version","contract_id","capability_id","owner","automation_id","name","execution_class","source_sha256","authority_binding","topological_order","steps","authority_boundary","plan_sha256"}
    if set(plan)!=expected_top: raise AutomationPlanError("plan fields do not match Foundation 1.0 schema")
    for key,val in {"schema_version":PLAN_SCHEMA,"contract_id":CONTRACT_ID,"capability_id":CAPABILITY_ID,"owner":OWNER}.items():
        if plan.get(key)!=val: raise AutomationPlanError(f"plan {key} mismatch")
    _text(plan.get("automation_id"),"plan automation_id",ID_RE); _text(plan.get("name"),"plan name")
    if plan.get("execution_class") not in EXECUTION_CLASSES or not isinstance(plan.get("source_sha256"),str) or not SHA_RE.fullmatch(plan["source_sha256"]): raise AutomationPlanError("plan identity fields are invalid")
    binding=_binding(root); expected_binding={k:binding[k] for k in ("authority_id","authority_path","authority_sha256","crosswalk_id","crosswalk_path","crosswalk_sha256")}
    if plan.get("authority_binding")!=expected_binding: raise AutomationPlanError("automation plan authority binding is stale or invalid")
    steps=plan.get("steps"); expected_step={"sequence","id","capability_id","target_owner","operation","effect_class","depends_on","execution_permitted_by_foundation","authority_requirement"}
    if not isinstance(steps,list) or not steps: raise AutomationPlanError("plan steps must be a non-empty array")
    ids=set()
    for n,s in enumerate(steps,1):
        if not isinstance(s,dict) or set(s)!=expected_step or s.get("sequence")!=n: raise AutomationPlanError("plan step fields or sequence are invalid")
        sid=_text(s.get("id"),f"plan step {n} id",ID_RE)
        if sid in ids: raise AutomationPlanError("plan contains duplicate step ids")
        ids.add(sid); cap=_text(s.get("capability_id"),f"plan step {sid} capability_id",CAP_RE); entry=binding["entries"].get(cap)
        if not isinstance(entry,dict) or s.get("target_owner")!=entry.get("owner_path") or not str(entry.get("disposition","")).startswith("OWNED"): raise AutomationPlanError("plan step target ownership is stale or invalid")
        _text(s.get("operation"),f"plan step {sid} operation",OP_RE); effect=s.get("effect_class")
        if effect not in EFFECTS: raise AutomationPlanError("plan step effect_class is invalid")
        deps=s.get("depends_on")
        if not isinstance(deps,list) or any(not isinstance(x,str) or not x for x in deps) or len(set(deps))!=len(deps): raise AutomationPlanError("plan step dependencies are invalid")
        if s.get("execution_permitted_by_foundation") is not False: raise AutomationPlanError("Foundation 1.0 may not grant step execution authority")
        req="SEPARATE_CONNECTED_ACTIONS_AND_USER_AUTHORITY_REQUIRED" if effect=="EXTERNAL_SIDE_EFFECT_INTENT" else "DOWNSTREAM_EXECUTOR_ADMISSION_REQUIRED"
        if s.get("authority_requirement")!=req: raise AutomationPlanError("plan step authority requirement is invalid")
    for s in steps:
        if any(dep not in ids or dep==s["id"] for dep in s["depends_on"]): raise AutomationPlanError("plan dependency reference is invalid")
    if _order(steps)!=plan.get("topological_order"): raise AutomationPlanError("plan topological order is invalid")
    overnight=plan["execution_class"]=="OVERNIGHT"
    boundary={"programming_owner":OWNER,"clock_authority":"NOT_GRANTED","claim_authority":"NOT_GRANTED","shell_execution_authority":"NOT_GRANTED","network_access":False,
              "credentials_authority":"NOT_GRANTED","connector_action_authority":"NOT_GRANTED","browser_action_authority":"NOT_GRANTED","external_side_effects":False,
              "scheduling_requirement":"SYSTEM_MASTER/CORE/P11_REQUIRED" if overnight else "CALLER_OR_SEPARATELY_ADMITTED_EXECUTOR_REQUIRED"}
    if plan.get("authority_boundary")!=boundary: raise AutomationPlanError("plan authority boundary mismatch")
    return plan

def main():
    p=argparse.ArgumentParser(description="C01 deterministic automation plan compiler/verifier"); sub=p.add_subparsers(dest="command",required=True)
    b=sub.add_parser("build"); b.add_argument("spec"); b.add_argument("output"); v=sub.add_parser("verify"); v.add_argument("output"); args=p.parse_args()
    try: result=build(args.spec,args.output) if args.command=="build" else verify(args.output)
    except AutomationPlanError as exc: print(json.dumps({"status":"FAIL","contract_id":CONTRACT_ID,"error":str(exc)},sort_keys=True)); return 2
    print(json.dumps({"status":"PASS","contract_id":CONTRACT_ID,"automation_id":result["automation_id"],"plan_sha256":result["plan_sha256"]},sort_keys=True)); return 0

if __name__ == "__main__": raise SystemExit(main())
