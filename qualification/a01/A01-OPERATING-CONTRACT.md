# A-01 Operating Contract

Status: CANONICAL CANDIDATE — A01-CONTROL-PLANE-001

## Purpose

A-01 is the shared authoritative Windows/X64 machine-qualification resource for BFochtman746/system-master. This contract governs every workstream that requests, consumes, interprets, or promotes evidence produced by A-01.

## Non-negotiable rules

1. A workstream MUST perform all safe, deterministic prequalification possible before requesting A-01.
2. A workstream MUST NOT use an ad-hoc direct A-01 workflow when a registered control-plane qualification applies.
3. A-01 qualifications MUST be identified by a registry-owned `qualification_id`; chats and workflows MUST NOT inject arbitrary shell commands into the gateway.
4. The exact tested commit SHA is the qualification subject. Evidence for one SHA MUST NOT authorize promotion of another SHA.
5. A milestone that requires A-01 assurance MUST NOT enter `A01_PASSED`, `PROMOTION_ELIGIBLE`, or `CANONICAL` without a valid control-plane receipt.
6. At most the policy-defined number of outstanding A-01 requests may exist per workstream.
7. Obsolete queued subjects SHOULD be superseded before consuming A-01. Running subjects may finish when their evidence remains useful.
8. A focused gate proves the changed boundary and its immediate integration dependencies. A consolidated gate proves an accumulated slice. A promotion gate proves the exact promotion subject.
9. A workstream waiting on A-01 SHOULD continue dependency-valid work that does not consume the pending subject as authoritative.
10. Failures MUST be classified as `SUBJECT_FAILURE`, `INFRA_FAILURE`, or `CONTROL_PLANE_FAILURE`. Repair scope SHOULD be limited to the failing boundary unless evidence proves broader repair is required.
11. Every run MUST preserve a request record, an immutable result receipt, timing telemetry, the exact subject SHA, runner identity, and evidence location.
12. The authoritative state machine is repository-owned. Conversation memory, prose claims, screenshots, or local reasoning are not substitutes for a receipt.

## Standing states

`BUILDING -> PREQUALIFIED -> A01_ELIGIBLE -> A01_QUEUED -> A01_RUNNING -> A01_FAILED | A01_PASSED -> PROMOTION_ELIGIBLE -> CANONICAL`

A failure may transition to `REPAIR_REQUIRED`, then back through prequalification. A superseded request transitions to `SUPERSEDED` and cannot authorize promotion.

## Return contract

Every request carries a return ticket containing at least:

- `workstream_id`
- `qualification_id`
- `subject_sha`
- `origin_ref`
- `resume_on_pass`
- `resume_on_failure`
- `notification_target`

The return ticket tells the control plane where the result belongs and what the next authorized action is. It does not grant permission to bypass qualification policy.

## Receipt authority

A valid receipt MUST bind all of the following:

- registered qualification ID and registry version
- exact subject SHA and verified checkout SHA
- workstream ID and gate class
- runner name, labels, OS/architecture, and runner version when available
- start/completion timestamps and execution telemetry
- result classification
- evidence artifact name/path
- return ticket
- promotion authorization decision

`promotion_authorized=true` is allowed only when the qualification result is `PASS`, the checkout SHA equals the subject SHA, and all required evidence was produced.

## Cross-chat rule

All System Master workstreams use this repository contract as shared authority. A chat starting or resuming work MUST read `SYSTEM-MASTER-WORKSTREAM-BOOTSTRAP.md` and this contract before scheduling A-01 work. The repository, not any single conversation, is the communication bus between workstreams.

## Migration rule

Legacy A-01 workflows may remain temporarily while being migrated, but they MUST NOT be treated as control-plane-authoritative unless they emit a receipt conforming to the active receipt schema and are registered by `qualification/a01/registry.json`.
