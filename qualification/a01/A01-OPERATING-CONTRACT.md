# A-01 Operating Contract

Status: CANONICAL CANDIDATE - A01-CONTROL-PLANE-001 / REGISTRATION-DISPATCH-BARRIER

## Purpose

A-01 is the shared authoritative Windows/X64 machine-qualification resource for `BFochtman746/system-master`. This contract governs every System Master lane that requests, consumes, interprets, retries, or promotes A-01 evidence.

A-01 is shared infrastructure administratively integrated through `SYSTEM_MASTER/CORE`. It is not a peer product system and it does not transfer product authority between CORE, LEARNING, BOOK, or BOOK/PROSE.

## Non-negotiable rules

1. Perform all safe deterministic hosted/local prequalification before requesting A-01.
2. No workstream may create a direct self-hosted A-01 path when a registered control-plane qualification applies.
3. Every A-01 request uses a registry-owned `qualification_id`; arbitrary command injection is prohibited.
4. The exact tested Git commit SHA is the qualification subject. Evidence never transfers to changed bytes.
5. No subject may enter `A01_PASSED`, `PROMOTION_ELIGIBLE`, or `CANONICAL` without a valid authoritative receipt.
6. Registration is a prerequisite to runner admission, not a condition discovered after the A-01 runner is acquired.
7. A hosted admission barrier must prove the requested qualification exists in the exact control-plane registry, the workstream matches, the registered wrapper exists in its declared source, the exact subject checkout matches, and execution-window/runtime policy is valid.
8. Only an `ADMITTED` request may reach the private A-01 executor.
9. The private A-01 executor must run policy and registry from the exact admitted `control_plane_sha` and the product qualifier from the exact requested `subject_sha` when `source=subject`.
10. A receipt must bind both identities: `subject_sha`/`checkout_sha` and `control_plane_sha`/`control_plane_checkout_sha`.
11. A GitHub Actions rerun is never evidence that a branch reference was refreshed. If registry, policy, gateway, admission, or executor authority changes, create a fresh workflow run. Do not use a specific-job or failed-job rerun as a control-plane refresh mechanism.
12. `WAITING_FOR_REGISTRATION`, `REGISTERED_EXECUTABLE_MISSING`, or other admission failures are hosted control/admission states. They must not consume A-01 and must not be mislabeled as product subject failures.
13. If no matching self-hosted runner is online, the admitted A-01 job may remain queued. Runner absence does not change product bytes or authorize bypass.
14. Workstreams waiting on A-01 should continue dependency-valid work that does not consume the pending subject as authoritative.
15. Failures are classified as `SUBJECT_FAILURE`, `INFRA_FAILURE`, or `CONTROL_PLANE_FAILURE`; repair scope stays at the proven boundary.
16. Every authoritative run preserves request, admission, receipt, exact identities, runner identity, telemetry, evidence location, and return ticket.
17. Product failures return to the owning workstream. Shared control-plane defects route to CORE/shared A-01 repair without replacing the owner's product critical path.
18. Existing global queue serialization, bounded repair lineage, overnight scheduling, and disruptive-action evidence ordering remain mandatory.

## Canonical request architecture

All normal, repair, and overnight A-01 requests use:

`CALLER -> A01 GATEWAY FRONT DOOR -> HOSTED ADMISSION BROKER -> PRIVATE A01 EXECUTOR`

The gateway is the compatibility surface for workstreams and must not itself own a self-hosted job. The hosted broker is the registration/identity barrier. The private executor is the only canonical non-legacy workflow permitted to use `[self-hosted, Windows, X64]`.

## Admission states

Only `ADMITTED` may reach the executor. Blocked states include `WAITING_FOR_REGISTRATION`, `REGISTERED_EXECUTABLE_MISSING`, `WORKSTREAM_MISMATCH`, `SUBJECT_CHECKOUT_MISMATCH`, `CONTROL_PLANE_CHECKOUT_MISMATCH`, `INVALID_CONTROL_PLANE_POLICY`, `INVALID_REGISTRY`, `INVALID_REGISTERED_WRAPPER_PATH`, `INVALID_REGISTERED_WRAPPER_SOURCE`, `INVALID_EXECUTION_CONTEXT`, `INVALID_QUALIFIER_TIMEOUT`, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE`, `QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY`, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT`, and `CONTROL_PLANE_READ_FAILURE`.

A blocked admission emits a durable reason and `fresh_dispatch_required` when a later registry/control-plane generation could resolve it. It cannot fabricate an A-01 receipt.

## Fresh-run and retry law

GitHub may preserve the originally resolved reusable-workflow SHA when a failed job or specific job is rerun. Therefore:

- same-subject infrastructure retry with unchanged control-plane bytes may reuse the same admitted control-plane SHA when policy permits;
- product repair that changes the subject gets a new subject SHA and new deterministic prequalification;
- registry/policy/gateway/broker/executor changes require a fresh workflow run;
- a specific-job or failed-job rerun is never used to pick up a new `main` registry entry;
- a stale attempt remains historical evidence and is never rewritten into a PASS;
- a fresh dispatch may target the same unchanged product subject while binding a newer admitted control-plane SHA.

## Normal, repair, overnight, and runner-unavailable compatibility

Normal workstreams prequalify the exact subject and enter the gateway. Closed-loop repair preserves its transaction ID and attempt budget but enters the same gateway; its rerun workflow resolves one exact commit and calls the same-commit gateway. The central night planner remains the only independent A-01 schedule and calls the same-commit gateway, so all overnight slots inherit hosted admission. An admitted job may wait for A-01 to come online; queueing is not product failure.

## Receipt authority

Current receipts bind policy/registry version, qualification/workstream, gate class, exact subject and subject checkout, exact control plane and control-plane checkout, workflow attempt, runner identity, timing, result class, evidence artifact, return ticket, and promotion authorization.

## Security

Third-party actions used by the shared control plane remain pinned to full commit SHAs. Registered wrappers remain repository-owned `.github/scripts/` paths. Nested reusable-workflow permissions cannot be elevated. No caller may inject an arbitrary shell command, workflow reference, or post action. Artifact attestations may be added later as supplementary provenance but do not replace semantic qualification or exact-SHA receipts.

## Disruptive handoff

Registered post actions such as `windows_reboot` retain the ordering: qualifier PASS -> receipt/evidence upload -> delayed action -> hosted settle window.

## Change control

A control-plane baseline change requires demonstrated shared infrastructure/platform evidence. `A01-REGISTRATION-DISPATCH-BARRIER-001` is justified by reproduced failures in which a job rerun retained an older reusable-workflow SHA after the registry changed, causing a valid newly registered qualification to be rejected until a genuinely fresh run resolved the newer control plane.
