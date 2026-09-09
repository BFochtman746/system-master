# SMR020 Runner Custody Forensics 001

Date: 2026-09-09
Owner: `SYSTEM_MASTER/CORE`
Status: **RUNNER-LOCAL CUSTODY SURFACES EXHAUSTED / EXACT RECONSTRUCTION OBJECT STILL ABSENT**

## Authority binding

This bounded forensic phase started from live Core control head:

`45818c226a198aa6db763f9a847176054f4aa5fb`

Current objective remains the dependency-current SMR021 rebuild, blocked on recovery or deterministic exact reconstruction of runnable SMR020 source/test subject:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

No prior PASS is transferred by this record.

## Preserved reconstruction evidence

Historical evidence commit `92516f958be3423949a459fa17a143852d95f7b0` records that the first irreducible missing reconstruction object in the predecessor chain is the exact temporal-to-final PLATFORM-005 unified diff with SHA-256:

`3721b21b26a2b71f762f09f2eab0ba4d1d8809909aa2d129d5960619a7672b34`

That evidence is treated as reconstruction evidence, not as live authority by virtue of being newer/older than the current control head.

The dependency identities remain:

- SMR018 / PLATFORM-005: `cc67826bb608fc82459e23c59d5e0106d10422c6fe79f45f0571be60356b7d54`
- SMR019 / CHAT-001A: `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`
- SMR020 / OPERATOR-OPS-001: `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

A recovered candidate may be called exact SMR020 only after independent recomputation matches `89066e56...`.

## Previously closed custody phases preserved

The broad current GitHub/Library exact-source search, including the September 9 ZIP census, is already durably closed by `SMR020-DEPENDENCY-CURRENT-SOURCE-CUSTODY-RECOVERY-001.md` and is not repeated here.

Historical SMR020 control commits `2ac6566e2de932728f4fca6f1ccb076120b0b6d1` and `96655bf454fa7d256321911cf2b0a12471ef97e8` preserve rebuild/qualification summaries only. Their associated GitHub Actions execution is Master System Control Drift; run `34404936563` has zero workflow artifacts. The summary/control commits therefore do not provide runnable reconstruction bytes.

## New bounded self-hosted runner forensics

All probes were read-only and confined to the GitHub Actions runner installation. No personal home directory was searched; no source-file content, credentials, or unrelated files were uploaded.

### 1. Actions work tree

Workflow: `.github/workflows/core-smr020-runner-work-custody-probe.yml`
Main commit: `9fd024dd12388264cf86e82dcb229b0618cf94b1`
Run: `34418402807`
Job: `102688287823`
Result: **NEGATIVE**

Scope: `C:\actions-runner\_work`

Observed:

- patch/diff files hashed: `0`
- exact `3721b21b...` matches: `0`
- no named runnable SMR020 / OPERATOR-OPS / PLATFORM-005 / CHAT-001A source tree recovered
- exact subject mentions were current governance/control text only, not runnable source custody

### 2. Runner diagnostic history

Initial workflow run `34418899583` demonstrated that apparent token matches were self-contamination from the probe script itself.

The corrected pre-probe pass excludes all runner diagnostic files modified at or after `2026-09-09T23:40:00Z`.

Workflow: `.github/workflows/core-smr020-runner-diag-custody-probe.yml`
Corrected main commit: `d0a9cb0b4aafcfb43ef3b579b55919af0d95ad58`
Run: `34418950441`
Job: `102689953787`
Result: **NEGATIVE**

Scope: `C:\actions-runner\_diag` only, pre-probe files only.

Observed:

- pre-probe diagnostic files scanned: `252`
- exact `3721b21b...` matches: `0`
- exact `cc67826...` matches: `0`
- exact `9571b3...` matches: `0`
- exact `89066e56...` matches: `0`

Therefore old runner diagnostics do not preserve the missing reconstruction token or exact-subject identifiers.

### 3. Runner installation root outside work/diag/binaries/credentials

Workflow: `.github/workflows/core-smr020-runner-root-custody-probe.yml`
Main commit: `8ff67090821b625c1aef1b8f766b5d3648ab1890`
Run: `34418981308`
Job: `102690054711`
Result: **NEGATIVE**

Scope: `C:\actions-runner` excluding `_work`, `_diag`, `bin`, `externals`, and credential/config identities.

Observed:

- candidate `.patch` / `.diff` / `.zip` files: `1`
- exact `3721b21b...` matches: `0`
- no target-named candidate was admitted as source custody

## Adjudication

The self-hosted Windows runner is no longer an unresolved generic custody possibility for this objective. The bounded legitimate runner-local surfaces have been inspected and are negative.

This does **not** prove the object never existed. It proves it is not recoverable from the bounded current runner custody surfaces inspected here.

The current blocker is therefore sharpened to:

**SOURCE_CUSTODY / EXTERNAL-OR-UNPRESERVED RECONSTRUCTION OBJECT**

Specifically, Core still requires either:

1. the exact unified diff whose independently recomputed SHA-256 is `3721b21b26a2b71f762f09f2eab0ba4d1d8809909aa2d129d5960619a7672b34`; or
2. an independently equivalent exact reconstruction input set that deterministically reproduces SMR018 `cc67826...`, then SMR019 `9571b3...`, then SMR020 `89066e56...`; or
3. the original exact runnable SMR020 tree/archive itself.

A reconstruction producing any different source/test digest is a new candidate lineage and receives no inherited PASS.

## Do not repeat

Do not repeat:

- broad current GitHub/Library custody census;
- `C:\actions-runner\_work` scan;
- pre-probe `C:\actions-runner\_diag` scan;
- bounded runner installation-root candidate scan;
- historical control-drift artifact lookup for the recorded SMR020 summary commit.

Reopen one of these surfaces only if a genuinely new artifact, retention restoration, branch/ref, workflow artifact, runner backup, external archive, or executable reconstruction input becomes available.

## Exact successor

`CORE-SMR020-EXTERNAL-RECONSTRUCTION-OBJECT-RECOVERY-001`

First action: identify and inspect only genuinely new custody surfaces outside the now-exhausted current GitHub/Library/current-runner surfaces, prioritizing any retained runner backup, prior machine backup, exported worktree/archive, or exact reconstruction artifact capable of proving `3721b21b...` or directly reproducing `89066e56...`.

If exact custody is recovered, independently verify identity before mutation and immediately resume `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md` from its first executable gate.

If no new custody surface is accessible, remain fail-closed rather than manufacturing bytes.