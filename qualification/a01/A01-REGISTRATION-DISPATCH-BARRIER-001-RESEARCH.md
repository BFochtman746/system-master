# A01-REGISTRATION-DISPATCH-BARRIER-001 — Research Record

Date: 2026-09-09
Owner: SYSTEM_MASTER/CORE
Scope: shared A-01 qualification admission/retry reliability

## Reproduced incident

A Book qualification caller referenced `a01-control-plane-gateway.yml@main`. The first workflow attempt resolved the reusable gateway to an older control-plane SHA. After the qualification was registered on newer `main`, rerunning the failed/specific job still used the original reusable-workflow SHA and returned `UNREGISTERED_QUALIFICATION`. A genuinely new workflow run resolved `@main` to the newer control-plane commit and the unchanged product subject passed. The Windows A-01 runner preflight and exact subject checkout had already succeeded, isolating the defect to control-plane resolution/retry semantics rather than the machine or subject.

## Current official GitHub behavior verified

1. Reusable workflow reruns: when a reusable workflow is referenced by branch/tag instead of SHA, failed-job or specific-job reruns use the same reusable-workflow commit SHA as the first attempt. Full reruns resolve the specified reference again.
   Source: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
2. General reruns retain the original event's `GITHUB_SHA` and `GITHUB_REF`; rerun is not a safe authority-refresh primitive.
   Source: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs
3. Same-repository `./.github/workflows/...` reusable calls execute the called workflow from the same commit as the caller. Full commit-SHA references are safest for immutable external references.
   Source: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
4. Current GitHub.com supports up to ten nested reusable-workflow levels; the proposed caller -> gateway -> broker -> executor -> repair-broker chain stays within that limit. Permissions in nested calls can only be maintained or reduced.
   Source: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
5. `workflow_dispatch` creates a fresh workflow run from an explicit branch/tag ref and typed inputs. Fine-grained credentials require Actions:write. The receiver must exist on the default branch.
   Sources: https://docs.github.com/en/rest/actions/workflows and https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
6. `workflow_dispatch` and `repository_dispatch` are exceptions to normal `GITHUB_TOKEN` recursive-trigger suppression and can create new workflow runs.
   Source: https://docs.github.com/en/actions/concepts/security/github_token
7. Self-hosted routing: an online idle matching runner is assigned; if it fails to pick up within 60 seconds the job is requeued; without a matching online runner the job remains queued and fails only after 24 hours.
   Source: https://docs.github.com/en/actions/reference/runners/self-hosted-runners
8. `queue: max` allows up to 100 pending items in a concurrency group and cannot be combined with `cancel-in-progress:true`; existing `a01-global-r2` serialization remains valid.
   Source: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
9. GitHub recommends full-length commit-SHA pins for immutable third-party Actions references. Existing checkout/upload pins should remain.
   Source: https://docs.github.com/en/actions/reference/security/secure-use
10. Workflow execution protections can restrict actor/event classes such as manual dispatch. This is optional repository-policy hardening after the functional repair, not a substitute for application-level admission.
    Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/actions-policies/workflow-execution-protections

## Root causes

- RC-1 Registration/execution race: registration was checked only after A-01 had been acquired.
- RC-2 Wrong retry primitive: a failed/specific-job rerun was treated as if it refreshed a branch-based reusable workflow.
- RC-3 Control-plane SHA was implicit in GitHub metadata instead of a first-class evidence identity.
- RC-4 Wrapper existence/source checks occurred too late.
- RC-5 Shared prose documentation lagged executable policy (operating mode still described an older policy generation).
- RC-6 Normal, repair, and overnight paths had different orchestration shapes without one enforceable pre-run invariant.

## Adopted architecture

`CALLER -> CANONICAL GATEWAY -> HOSTED ADMISSION BROKER -> PRIVATE A-01 EXECUTOR`

Before any Windows job exists, the hosted broker proves:
- exact control-plane checkout;
- exact subject checkout;
- registry contains qualification ID at that control-plane SHA;
- requested workstream matches registration;
- wrapper path/source is safe and wrapper exists;
- execution context and runtime budget satisfy policy;
- overnight eligibility/disruptive restrictions are valid;
- optional repair transaction remains bound to the same subject/qualification/workstream/origin.

Only `ADMITTED` reaches A-01. The private executor checks out the exact admitted control-plane SHA and exact subject SHA, revalidates both on Windows, preserves existing runner health/global serialization/evidence/reboot/repair behavior, and records both identities in evidence.

## Retry law

A GitHub rerun is never interpreted as control-plane refresh. If registry, policy, gateway, broker, or executor authority changed, create a fresh workflow run. Old attempts remain historical evidence. Same-product-subject execution against a newer control-plane generation is allowed only through a fresh run that records the new exact control-plane SHA.

## Process coverage

- Normal lanes: existing gateway filename remains compatibility front door.
- Closed-loop repair: repair rerun resolves one exact commit and calls same-commit gateway; no floating `gateway@main` inside the rerun chain.
- Overnight/Second Shift: existing central scheduler already calls same-commit gateway and automatically gains the hosted barrier.
- Offline A-01: admitted job waits in GitHub queue; not product failure and no user at keyboard required.
- Reboot: receipt/evidence upload still precedes delayed reboot and hosted settle lock.
- Legacy direct workflows: remain frozen historical exceptions; new direct self-hosted or direct executor paths are rejected by enforcement.

## Rejected alternatives

- Assume `@main` refreshes on failed-job rerun: conflicts with documented GitHub behavior.
- Read floating live `main` from A-01 after execution starts: can mix workflow/policy generations and destroys reproducibility.
- Remove exact-SHA freezing: weakens authority/evidence.
- Give every lane its own self-hosted workflow: recreates drift and scheduling races.
- Rotate `a01-global-r2`: unrelated to root cause and can create overlap.
- Require physical operator presence: unnecessary; runner routing is functioning.
- Make artifact attestations the fix: potentially useful future provenance but not causal to registration/rerun failure.

## Qualification requirements

The repair is not canonical until one exact candidate proves: policy/registry/topology validation; admission unit and integration selftests; synthetic unregistered ID blocks before A-01; registered selftest admits; direct executor bypass is rejected; exact control-plane and subject SHA are bound in evidence; predecessor A-01 selftest regressions pass; overnight planner/enforcement regressions pass; repair lineage remains bounded; global concurrency/reboot ordering remain unchanged; and authoritative A-01 selftest passes on the exact candidate.
