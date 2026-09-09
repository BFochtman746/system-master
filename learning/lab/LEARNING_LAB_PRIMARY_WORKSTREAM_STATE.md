# LEARNING LAB — PRIMARY WORKSTREAM STATE

Status: **PRIMARY / MACHINE PROMOTION CLOSED / HUMAN EXECUTION NEXT**  
Effective date: 2026-09-09  
Workstream: `LEARNING`

This document is the durable post-Night-Shift handoff for the Learning workstream. It records the current repository-backed standing after reconciliation of hosted qualification, A-01 receipts, exact SHAs, historical repair attempts, Night Shift tickets, frozen human/privacy boundaries, and downstream evidence architecture.

## 1. Current authority

Authoritative promoted code branch:

`learning/pilot-001-run-001-final-human-execution-ready`

Authoritative exact branch-head SHA:

`f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`

Last authoritative qualification:

`LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION`

Authoritative A-01 run:

`34373368907`

Standing:

- exact subject checkout: `PASS`
- registered qualifier: `PASS`
- result class: `PASS`
- promotion authorized: `TRUE`
- exact-SHA promotion: `COMPLETED`
- machine preparation for first real participant: `COMPLETED`
- real participant execution: `BLOCKED — HUMAN`

The separate branch `learning/pilot-001-run-001-final-human-execution-a01-closure` contains documentation-only closure/handoff commits. Those commits are not qualification subjects and must not replace the promoted code SHA.

## 2. Hosted-test standing

Repair-004 exact subject `f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf` passed hosted qualification before authoritative A-01 execution.

Required evidence preserved by the qualifier:

- closed-loop current: `54/54`
- predecessor regressions: `57/57`
- local-first evidence boundary: `13/13`
- remaining unique base tests: `574/574`
- base coverage union: `698/698`
- critical repeat campaign: `216/216`
- frozen PILOT-001-v1 changed: `FALSE`
- test coverage reduced: `FALSE`
- real participant evidence created by qualification: `FALSE`

Hosted qualification proves prequalification only. The A-01 receipt is the promotion authority.

## 3. Authoritative evidence standing

Authoritative A-01 evidence artifact:

- artifact ID: `10113621506`
- artifact name: `LEARNING-PILOT-001-RUN-001-FINAL-HUMAN-EXECUTION-34373368907-evidence`
- ZIP SHA-256: `30fb18db5dae75eb835e59b2cb10785448e6f0cd97048d466182e0ae10df1866`
- receipt policy version: `6`
- receipt registry version: `14`
- runner: `A-01 / Windows / X64`
- `subject_sha == checkout_sha == f49ac9eaf6e0f11894bf47f5d773090b4ef60ebf`
- `result_class = PASS`
- `promotion_authorized = true`

Historical failure receipts and artifacts remain part of the evidence chain and must not be deleted or rewritten.

## 4. Frozen boundaries

Frozen PILOT-001-v1 authority remains unchanged:

- protocol blob: `0db3de824060f4eb7ce3c2c7ffa0ed4b57ba9d35`
- runtime blob: `0c9f7a8b7850cef15643e3c11899585d2c25a08d`
- runtime tests blob: `e77d423078af4662f2c72b0cc1f8501e20d29851`
- qualifier blob: `44aa0124f194f074a421f0a87a0695d96d7bae11`

Frozen sequence:

`CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> DELAYED RETENTION -> NOVEL TRANSFER -> OUTCOME`

Human/privacy constraints remain binding:

- participant consent must be personally supplied by an actual participant;
- ChatGPT, A-01, fixtures, schedulers, or an operator acting for the participant cannot supply consent;
- independent evidence must reject assistance or answer reveal;
- raw participant free-text is not persisted as pilot evidence;
- direct PII is not part of the pilot evidence record;
- participant evidence is local-by-default;
- external upload/export is not implied by local review-intake generation;
- retention must satisfy the frozen minimum delay and fresh-family rules;
- valid novel transfer follows only after qualifying retention;
- withdrawal and complete non-PASS outcomes remain valid evidence and must not be rewritten as success;
- a single participant cannot prove population effectiveness, psychometric validity, certification, accreditation, or job readiness.

## 5. Night Shift closure classification

Every known Learning Night Shift item is classified below.

| Item | Classification | Exact disposition / unblock event |
|---|---|---|
| execution-prep overnight ticket | `SUPERSEDED` | Replaced by later closed-loop/final-human gates; no rerun required. |
| closed-loop overnight ticket | `SUPERSEDED` | Replaced by final-human execution gate; no rerun required. |
| original final-human ticket for `effcc16b...` | `SUPERSEDED` | Historical failed subject; must not be rerun as current authority. |
| `effcc16b...` Windows frozen-authority attempt | `NO LONGER REQUIRED` | Historical `SUBJECT_FAILURE`; defect repaired by successor subjects. Evidence retained. |
| Repair-001 `ec83f726...` A-01 attempt | `NO LONGER REQUIRED` | Historical runtime-budget `SUBJECT_FAILURE`; evidence retained. |
| Repair-002 `2568265...` hosted aggregate/parser attempt | `NO LONGER REQUIRED` | Hosted defect repaired by successor; never promotion authority. |
| Repair-003 `66f25c8...` A-01 attempt | `NO LONGER REQUIRED` | Historical runtime-budget `SUBJECT_FAILURE`; evidence retained. |
| Repair-004 hosted qualification `f49ac9...` | `COMPLETED` | Exact hosted prequalification passed. |
| Repair-004 A-01 qualification `34373368907` | `COMPLETED` | Exact A-01 receipt PASS; promotion authorized. |
| exact-SHA ready-branch promotion | `COMPLETED` | Ready branch pinned exactly to `f49ac9...`. |
| first actual PILOT-001 participant execution | `BLOCKED — HUMAN` | Unblocks only when an actual participant is present and personally supplies explicit PILOT-001-v1 consent. |
| descriptive effectiveness review using genuine pilot evidence | `BLOCKED — PREDECESSOR` | Requires genuine eligible participant evidence from the real-human pilot chain. |
| prospective effectiveness study execution | `BLOCKED — PREDECESSOR` | Requires actual authorized study execution under the frozen prospective design and real evidence; software scaffolding alone does not satisfy it. |
| executed-study receipt population | `BLOCKED — PREDECESSOR` | Requires an actual executed study and its governed evidence inputs. |

There is no current Learning Night Shift item classified `READY FOR NEXT GATE` for A-01. The next gate is human, not unattended machine qualification.

## 6. Downstream evidence architecture

The following prequalified downstream branches remain separate evidence architecture; they do not substitute for a genuine participant or study:

- descriptive effectiveness review: `learning/pilot-001-effectiveness-review-001-prequalified` at `5c709c00578dd465644f90f9ca26da8774cbe6e6`
- prospective study-design gate: `learning/pilot-001-study-design-001-prequalified` at `8a1fecea8af2dff49b88815ee141882afa21908a`
- executed-study receipt gate: `learning/pilot-001-study-execution-receipt-001-prequalified` at `bf1d1190a7e520e4f68d223f973a73bed80522ec`

Their proper dependency chain is evidence-driven:

`real human PILOT-001 record -> integrity handoff / review intake -> descriptive review -> prospectively authorized study -> executed-study receipt -> prespecified analysis`

Do not build generic inferential machinery or invent synthetic human/study evidence merely to keep work moving.

## 7. Critical path

Current critical path:

1. actual participant is present;
2. operator surfaces the frozen participant consent and verifies presence;
3. participant personally provides explicit consent;
4. only then initialize the pseudonymous pilot state;
5. execute baseline and adaptive route under frozen rules;
6. preserve independent verification integrity;
7. observe the real retention wait rather than bypassing it;
8. execute qualifying delayed retention when due;
9. execute novel transfer only after valid retention;
10. produce the minimized completion/integrity handoff and preserve the truthful participant outcome.

The software may surface `READY_FOR_EXPLICIT_PARTICIPANT_CONSENT`, but that state is not consent.

## 8. Immediate successor

Single next objective:

`LEARNING-PILOT-001-RUN-001-REAL-HUMAN-EXECUTION`

Objective: conduct the first genuine real-human closed-loop PILOT-001-v1 execution without fabricating consent, responses, independence, delay, transfer, or human attestation.

PASS at this next objective means only that one genuine participant produced a valid, integrity-bound closed-loop record under the frozen protocol. It unlocks participant-level evidence intake and descriptive review. It does not prove population effectiveness.

On participant withdrawal, contamination, incomplete execution, failed verification, failed retention, failed transfer, or other non-PASS outcome, preserve the truthful outcome. Do not repair human evidence into success.

## 9. A-01 admission after closure

No new Learning A-01 ticket is justified at this standing.

Reason: the promotion-class machine boundary has passed and the immediate successor requires genuine human consent/evidence that A-01 cannot supply. A new A-01 ticket becomes justified only if a genuinely new software qualification boundary is created by later authorized work, or if a future evidence-processing gate has valid non-human executable prerequisites and is independently registered.

Do not schedule A-01 work merely to keep the runner busy.

## 10. Primary / predecessor status

This chat is the primary Learning planning/adjudication workstream chat for this repository-backed state.

The predecessor Learning/Night Shift chats are historical/read-only sources. This reconciliation found no unresolved predecessor-only authority required to execute the current Learning critical path. The repository durably records the exact promoted SHA, authoritative receipt/evidence, repair lineage, Night Shift dispositions, frozen human/privacy boundaries, downstream evidence dependencies, and the single next objective.

No known predecessor-only Learning decision remains a retirement blocker. If a later historical audit discovers a predecessor-only decision that conflicts with this repository-backed state, it must be reconciled explicitly and must not silently override frozen contracts or exact-SHA qualification evidence.
