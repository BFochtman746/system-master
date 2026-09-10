import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "BFochtman746/system-master"
PARENT = Path("governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001.json")
ADMISSION = Path("governance/census/SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001-PROSE-OWNER-ADMISSION-001.json")


def require(condition, name):
    if not condition:
        raise AssertionError(name)
    print(f"PASS {name}")


def gh_json(url):
    token = os.environ.get("GITHUB_TOKEN")
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "system-master-foundation-reconciliation",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_contents_json(path, ref):
    encoded_path = urllib.parse.quote(path, safe="/")
    encoded_ref = urllib.parse.quote(ref, safe="")
    payload = gh_json(f"https://api.github.com/repos/{REPO}/contents/{encoded_path}?ref={encoded_ref}")
    import base64
    return json.loads(base64.b64decode(payload["content"]).decode("utf-8"))


def main():
    parent = json.loads(PARENT.read_text(encoding="utf-8"))
    admission = json.loads(ADMISSION.read_text(encoding="utf-8"))

    checks = 0

    def check(condition, name):
        nonlocal checks
        require(condition, name)
        checks += 1

    check(parent["census_id"] == "SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001", "parent_identity")
    check(parent["status"] == "ACTIVE", "parent_remains_active")
    check("PROSE" in parent.get("owner_lane_admissions", {}), "prose_admission_registered")
    p = parent["owner_lane_admissions"]["PROSE"]
    check(p["admission_ref"] == str(ADMISSION), "parent_points_to_admission")
    check(p["complete_with_evidence"] == 5 and p["active_gap"] == 0, "parent_prose_counts")
    check(p["durably_blocked_external_human_private_native"] == 1, "parent_preserves_durable_blocker")
    check(p["explicitly_out_of_scope_with_authority"] == 1, "parent_preserves_book_boundary")
    check(p["pass_transfer"] is False, "parent_forbids_pass_transfer")
    check(p["global_foundation_effect"] == "NONE__CENSUS_REMAINS_ACTIVE", "parent_global_nonclaim")

    check(admission["admission_type"] == "DELTA_ONLY__NO_FORENSIC_REPLAY__NO_PASS_TRANSFER", "delta_only_admission")
    check(admission["pass_transfer"] is False, "admission_pass_transfer_false")
    summary = admission["owner_lane_summary"]
    check(summary["rows"] == 7, "seven_owner_rows")
    check(summary["complete_with_evidence"] == 5 and summary["active_gap"] == 0, "five_complete_zero_active")
    check(summary["durably_blocked_external_human_private_native"] == 1, "one_durable_blocker")
    check(summary["explicitly_out_of_scope_with_authority"] == 1, "one_explicit_parent_boundary")
    check(summary["global_foundation_closed"] is False, "admission_global_nonclaim")
    check(admission["parent_effect"]["census_status_after_admission"] == "ACTIVE", "post_admission_parent_active")
    check(admission["parent_effect"]["global_closure_decision"] == "NOT_YET_AUTHORIZED", "global_closure_not_authorized")

    source_ref = admission["source_branch_sealed_head"]
    source_census = fetch_contents_json(admission["source_owner_census"], source_ref)
    source_summary = source_census["summary"]
    check(source_summary["rows"] == 7, "source_census_seven_rows")
    check(source_summary["complete_with_evidence"] == 5, "source_census_five_complete")
    check(source_summary["active_gap"] == 0, "source_census_zero_active")
    check(source_summary["durably_blocked"] == 1, "source_census_one_durable")
    check(source_summary["explicitly_out_of_scope"] == 1, "source_census_one_out_of_scope")
    check(source_summary["global_foundation_closed"] is False, "source_census_global_nonclaim")

    blocked = [x for x in source_census["successor_register"] if x["objective_id"] == "PROSE-REAL-LIMITATION-BLIND-MODEL-SCORING-001"]
    check(len(blocked) == 1 and "FRESH_EVALUATOR_REQUIRED" in blocked[0]["state"], "blind_blocker_preserved")
    check(source_census["rows"][-1]["canonical_owner"] == "SYSTEM_MASTER/BOOK", "book_canonical_writer_preserved")

    seen_runs = set()
    for row in admission["newly_closed_rows"]:
        run_id = row["workflow_run_id"]
        if run_id in seen_runs:
            continue
        seen_runs.add(run_id)
        run = gh_json(f"https://api.github.com/repos/{REPO}/actions/runs/{run_id}")
        check(run["status"] == "completed" and run["conclusion"] == "success", f"workflow_{run_id}_success")
        check(run["head_sha"] == row["tested_sha"], f"workflow_{run_id}_exact_subject")

    closure = admission["closure_consistency"]
    closure_run = gh_json(f"https://api.github.com/repos/{REPO}/actions/runs/{closure['workflow_run_id']}")
    check(closure_run["status"] == "completed" and closure_run["conclusion"] == "success", "closure_004_workflow_success")
    check(closure_run["head_sha"] == closure["tested_sha"], "closure_004_exact_subject")

    source_closure = fetch_contents_json(admission["source_owner_closure"], source_ref)
    check(
        source_closure["standing"] == "PROSE_OWNER_LANE_FOUNDATION_CENSUS_COMPLETE_WITH_ONE_DURABLE_FRESH_CONTEXT_BLOCKER__GLOBAL_FOUNDATION_NOT_CLAIMED",
        "source_owner_closure_standing",
    )
    check(source_closure["counts"]["active_gap"] == 0, "source_owner_closure_zero_active")
    check(source_closure["counts"]["complete_with_evidence"] == 5, "source_owner_closure_five_complete")
    check(source_closure["durable_blocker"]["must_not_be_bypassed"] is True, "source_owner_closure_blocker_fail_closed")
    check(source_closure["out_of_scope_authority"]["owner"] == "SYSTEM_MASTER/BOOK", "source_owner_closure_book_owner")
    check(
        "No global System Master Foundation 1.0 closure is claimed." in source_closure["preserved_nonclaims"],
        "source_owner_closure_global_nonclaim",
    )
    check(
        "Global Foundation 1.0 is closed." in source_closure["parent_handoff"]["parent_may_not_infer"],
        "source_owner_closure_parent_inference_guard",
    )

    print(json.dumps({
        "objective": "SYSTEM-MASTER-FOUNDATION-CLOSURE-CENSUS-001-PROSE-OWNER-ADMISSION-001",
        "status": "PASS",
        "checks_passed": checks,
        "parent_status": parent["status"],
        "global_foundation_closed": False,
        "pass_transfer": False,
        "source_branch_sealed_head": source_ref,
    }, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
