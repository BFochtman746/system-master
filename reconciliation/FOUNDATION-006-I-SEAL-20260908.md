# FOUNDATION-006-I Seal Registration — 2026-09-08

Work item: `UAF-S1-FOUNDATION006-I-REFERENCE-BOUND-SCHEMA-EVOLUTION-001`

## Source lineage

- Closure commit: `9bac3e6b289b3af627bc2ee3f3d066c6047d5d78`
- Qualified source commit: `176d873f41b22a7e1e528b1a81c8f98ea48716e3`
- Implementation parent: `06b365266980d5cf94406475527ca8bae69b0f7c`
- Sealed H predecessor: `f0c567467462744d28fbff67d26807ad5779349e`
- Sealed G ancestor: `238fa67703c0818a9b84cf9d613512ddd6689d83`
- Sealed CQ-003 Step-003F ancestor: `75b643d740e0f6d27ecc5da603a188074455fa22`
- Source-time subject digest excluding UAF control: `d2f591d806dafae5b195111061b0699d92cdb94652bb94239d8dfa16d9134592`

## Qualification standing

`FOUNDATION-006-I = PORTABLE PROVEN / VERSION SEALED`

Exact-source evidence:
- strict Java 21 `--release 21 -Xlint:all -Werror`: PASS, 769 production / 110 test sources
- I semantic/adversarial suite: 21 PASS
- I static verifier: 50/50 PASS
- I source/structure mutation campaign: 8/8 killed (after an initial 7/8 test-isolation finding was repaired without changing production behavior)
- FOUNDATION-006 contract parity: 35/35 PASS
- FOUNDATION-005 contract parity: 119/119 PASS
- DATA-001 migration 066 parity PASS; current allocator high-water 066 / next 067
- installer census/controller: 15/15 + 12/12 PASS
- whole non-live Java continuity: 81/81 PASS

I closes the last explicitly identified portable FOUNDATION-006 feature/design gap: reference fan-in bounds and schema/version evolution. FOUNDATION-005 remains compatibility authority; FOUNDATION-006 consumes that truth rather than duplicating it.

## Durable custody

Independent recovery artifacts were sealed to ChatGPT Library path:

`/System Master/Architecture 1.0/Checkpoints/`

including:
- `UAF_FOUNDATION006_I.gitbundle`
- `UAF_FOUNDATION006_I.patch`
- `UAF_FOUNDATION006_I_EVIDENCE_20260908.zip`
- `UAF_FOUNDATION006_I_EVIDENCE_20260908.zip.sha256`
- `UAF_FOUNDATION006_I_GIT_BUNDLE_VERIFY.txt`
- `FOUNDATION-006-I-CLOSURE.md`

The Git bundle verifies as COMPLETE and has head `9bac3e6b289b3af627bc2ee3f3d066c6047d5d78`.

Evidence ZIP SHA-256:
`761679549267b80da91464ca62cf0cdb13ddb469ce38abfe9db157805cba206f`

## Reconciliation finding

The legacy `compute_working_subject_digest.py` helper traverses `.git` metadata. Therefore its worktree digest changes after a bookkeeping commit even when qualified subject source bytes do not. I preserves the exact source-time digest above as historical evidence; this helper must not be treated as a clone-independent source identity until the broader subject-custody boundary adjudicates or repairs it. The qualified Git commit and complete Git bundle remain exact source authority.

## Boundary not claimed

No PASS is claimed for live PostgreSQL 064–066 behavior, production signer private-key custody, independent deployed witness trust, A-01/native execution, FOUNDATION-006 portable completion, or production certification.

## Exact successor

`UAF-S1-FOUNDATION006-J-PORTABLE-CLOSURE-NATIVE-OBLIGATION-ADJUDICATION-001`

J is an adjudication/freeze gate, not another feature packet. It must classify every remaining obligation by standing level and either freeze FOUNDATION-006 portable standing or identify one exact evidence-backed prerequisite.