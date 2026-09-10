# A-01 Control-Plane Selftest A1 — Repair Qualification 001

Date: 2026-09-10
Owner: `SYSTEM_MASTER/CORE`
Transaction: `A01-REPAIR-a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST-A1`
Standing: **A01_REQUEUE_READY / AUTHORITATIVE A-01 PASS PENDING**

## Exact lineage

- Failed receipt: `a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST`
- Failed subject and admitted control plane: `3a8004813e18d7defbf1f9ebc47f5bd8fcd30fb9`
- A-01 run: [34431764843](https://github.com/BFochtman746/system-master/actions/runs/34431764843)
- Evidence artifact: `A01-CONTROL-PLANE-SELFTEST-34431764843-evidence` (artifact ID `10134738800`, ZIP SHA-256 `ead6aaee218fb3fe5ac0557e31e5711925cc9371cdb001862a223018d35bc849`)
- Replacement subject: `ceb6870546012b789caea56499a1d219a195dc8b`
- Deterministic hosted prequalification: [A-01 Control Plane Enforcement run 34435547400](https://github.com/BFochtman746/system-master/actions/runs/34435547400), exact head `ceb6870546012b789caea56499a1d219a195dc8b`, PASS
- Replacement ticket: `qualification/a01/repair-requests/A01-REPAIR-a01-run-34431764843-A01-CONTROL-PLANE-SELFTEST-A1.json`

## Truthful failure classification

The hosted admission barrier passed. Exact control-plane and subject checkouts matched `3a8004813e18d7defbf1f9ebc47f5bd8fcd30fb9`. A-01 runner preflight and postflight passed on `A-01 / Windows / X64`; memory, disk, GitHub HTTPS, tool-path and sleep-guard capability checks were healthy. The registered qualifier then returned `SUBJECT_FAILURE`.

The immutable stderr identifies the repairable subject defect: enforcement rejected the admission broker and gateway routing topology and the legacy `core-smr020-runner-root-custody-probe.yml` direct self-hosted path. This was not infrastructure, window, dependency, human, private, native, or production failure.

## Candidate delta and bounded proof

Candidate `ceb6870546012b789caea56499a1d219a195dc8b` installs the hosted admission barrier, separates broker and executor responsibilities, updates enforcement/selftests, removes the stale direct Core probe, and preserves the canonical gateway entry. Main contains this commit as an ancestor; later governance-only commits do not change the exact repair subject.

Run 34435547400 passed the candidate's control-plane enforcement and hosted registration-admission selftests. This satisfies deterministic same-SHA prequalification for changed-subject requeue. It does not grant or transfer A-01 PASS.

## Remaining gate

The same transaction must enter `.github/workflows/a01-repair-rerun.yml` using this replacement ticket. Only a real receipt whose `qualification_id`, `workstream_id`, `subject_sha` and `checkout_sha` match the transaction may close it. Until then `promotion_authorized`, `authoritative_pass`, `publication_authorized`, and `production_authorized` remain false. No Apple/native/device, human, private/external, publication, or production evidence is claimed.
