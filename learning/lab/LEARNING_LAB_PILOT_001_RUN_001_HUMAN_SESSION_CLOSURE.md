# LEARNING-LAB-PILOT-001-RUN-001 Human Session Integrity Closure

Status: PASS / CANONICAL / REAL-PARTICIPANT EXECUTION ELIGIBLE.

## Qualified boundary

This closure qualifies the software boundary required before the first real participant can enter `PILOT-001-RUN-001`:

- human-source attestation is required for each captured participant turn;
- participant presence and actual participant response are explicitly attested;
- independent baseline/verification/retention/transfer evidence rejects assistance and pre-commit answer reveal before Learning state mutation;
- raw participant responses are not persisted in the human attestation or pilot evidence record;
- SHA-256 response digests bind the transient response across Learning submission and pilot capture;
- every captured pilot turn must have a matching durable human-turn attestation;
- stage-one completion resolves to `STAGE_1_COMPLETE_RETENTION_PENDING`;
- earliest retention is verification time plus `3600` seconds;
- software explicitly does not claim to independently prove human identity.

## Authoritative implementation

- Exact tested source SHA: `84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`
- Canonical branch: `learning/pilot-001-run-001-human-session-integrity`
- Human session version: `REAL-LEARNER-PILOT-HUMAN-SESSION-V1`
- System Master bridge: `SYSTEM-MASTER-REAL-LEARNER-HUMAN-SESSION-BRIDGE-V1`
- Pilot protocol: `PILOT-001-v1`
- Current-runtime binding: `PILOT-001-CURRENT-RUNTIME-BINDING-V1`
- A-01 qualification ID: `LEARNING-PILOT-001-RUN-001-HUMAN-SESSION`
- A-01 gate class: `promotion`

## A01-CONTROL-PLANE-001 migration

The Learning branch adopted canonical A-01 control-plane baseline `c51046152eaf749d672ce923ea983e1c7893d3f2` with a forward merge-style commit. Existing Learning branch history was not reset, rewritten, or rebased.

Historical direct Learning A-01 workflow blobs inherited by the branch were frozen by exact blob SHA for migration enforcement. They were not modified or relabeled as control-plane receipts.

The new RUN-001 qualification uses:

- repository-owned Node qualifier `.github/scripts/learning-pilot-001-run-001-human-session-qualify.js`;
- registered qualification `LEARNING-PILOT-001-RUN-001-HUMAN-SESSION`;
- the shared `.github/workflows/a01-control-plane-gateway.yml`;
- exact subject SHA binding;
- workstream return routing.

No new independent `runs-on: [self-hosted, Windows, X64]` Learning qualification workflow was created for this boundary.

## Prequalification

Hosted deterministic prequalification run: `34290715284`

Exact prequalified SHA: `84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`

Results:

- human-session + current pilot binding + frozen PILOT-001 tests: `26/26 PASS`;
- current Learning predecessor regressions: `57/57 PASS`;
- total deterministic tests: `83/83 PASS`;
- shared control-plane enforcement: PASS;
- raw-response persistence: NONE;
- human evidence manufactured: FALSE.

Prequalification artifact:

- artifact ID: `10081240101`
- SHA-256: `8e9b70eef806c2945629dccd4671e08a52d3fbcabcdec02ccd7e9cb6dbe8768c`

## Authoritative control-plane qualification

Caller workflow run: `34290852784`

A-01 job: `102276836288`

Runner evidence:

- runner name: `A-01`
- runner labels: `self-hosted`, `Windows`, `X64`
- job log runner version: `2.337.0`
- Python observed by registered qualifier: `3.14.6`

Registered qualifier results:

- focused human/pilot tests: `26/26 PASS`;
- Learning predecessor regressions: `57/57 PASS`;
- total tests: `83/83 PASS`;
- raw-response persistence: NONE;
- qualification manufactured human evidence: FALSE.

Authoritative control-plane artifact:

- artifact ID: `10081332248`
- artifact name: `a01-control-plane-34290852784-evidence`
- artifact SHA-256: `8b1fcfa326bf33ecb58df2608bca836b4157e007b779c9f62f5d383d7f071226`
- retained through: `2026-10-08T23:31:31Z`

## Authoritative receipt adjudication

The emitted `receipt.json` reports:

- `receipt_version = 1`
- `policy_version = 1`
- `registry_version = 2`
- `qualification_id = LEARNING-PILOT-001-RUN-001-HUMAN-SESSION`
- `workstream_id = LEARNING`
- `gate_class = promotion`
- `subject_sha = 84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`
- `checkout_sha = 84a4d72dccd05230e6fc85b3d0ff0a1fa4ec2535`
- `result_class = PASS`
- `child_exit_code = 0`
- `evidence_artifact = learning-pilot-001-run-001-human-session-evidence`
- `promotion_authorized = true`

The receipt return ticket routes to:

- `origin_ref = refs/heads/learning/pilot-001-run-001-real-participant-stage-1`
- `notification_target = learning-pilot-001-run-001`
- pass continuation: promote this exact tested SHA unchanged and permit explicit-consent real-participant execution.

Because `subject_sha == checkout_sha`, result is PASS, gate class is promotion, required evidence exists, and `promotion_authorized=true`, exact-SHA promotion is authorized by the canonical A-01 operating contract.

## Qualification repair history

There was no Learning subject repair.

Safe prequalification initially found a control-plane migration enforcement failure because inherited historical Learning direct A-01 workflows were not yet represented in the branch's legacy freeze map. This was classified as a migration/control-plane prequalification defect, not a Learning subject defect. The repair added their exact existing blob SHAs to the branch migration freeze map without modifying the workflows. Hosted control-plane enforcement then passed.

The actual registered A-01 promotion qualification passed on its first execution.

## Human execution boundary

This closure does **not** create a participant record and does **not** imply consent.

A real `PILOT-001-RUN-001` record may begin only when an actual participant explicitly consents. The participant must personally provide the learner responses. ChatGPT, A-01, deterministic fixtures, or model-generated responses may not be attested or relabeled as human responses.

Stage 1 is:

`EXPLICIT CONSENT -> BASELINE -> ADAPTIVE ROUTE -> INSTRUCTION/REMEDIATION OR SKIP -> INDEPENDENT VERIFICATION -> RETENTION WAIT`

Delayed retention and novel transfer remain later stages of the same participant record under `PILOT-001-v1`.

## Truth boundary

Proven:

- software enforcement of durable human-source attestation requirements;
- contamination rejection for independent evidence;
- raw-response exclusion from pilot persistence;
- digest binding across submission and pilot capture;
- exact replay/fail-closed behavior covered by the registered qualification;
- current Learning predecessor compatibility;
- A01-CONTROL-PLANE-001 registration, gateway execution, receipt production, and promotion authorization for the exact tested SHA.

Not proven:

- that any qualification fixture was a real human response;
- any real participant record;
- real-learner effectiveness;
- psychometric validity;
- population validity;
- native iPhone behavior;
- certification or job readiness.

## Dependency-valid successor

`LEARNING-LAB-PILOT-001-RUN-001-EXECUTE — obtain explicit participant consent, create the pseudonymous runtime-bound pilot record, present the first baseline turn with the answer withheld, accept only the participant's attested response, and continue the canonical adaptive path through independent verification until stage one reaches RETENTION_PENDING.`
