# CONTROLLER-FOUNDATION-003I — PROJECTION CHECKPOINT QUALIFICATION RECEIPT 001

Status: **PORTABLE BUILD QUALIFIED / 003I FROZEN FOR HOSTED CONTRACT**

Predecessor design lock: `CONTROLLER-FOUNDATION-003H-PROJECTION-CHECKPOINT-DESIGN-LOCK-001`.

Exact qualified executable subject: `2d6fc5e7c0940baa5d2904bf508b91b8571823bb` on `controller-v2/foundation-003-forensic-recovery`.

This receipt records hosted portable evidence only. It does not change or claim CORE/LEARNING/BOOK/DOCUMENTS authority, A-01 standing, native durability, real-provider installation, production principals/rulesets, or production Controller activation. C1 production activation remains `BLOCKED_EXTERNAL_SETUP`.

## 1. Implemented contract

003I implements the 003H design lock by preserving one semantic reducer while separating two read-model evidence classes:

- local SQLite projection is explicitly `LOCAL_PROVISIONAL`, `semantic_authority:false`, and reports local event/outbox standing without pretending wall-clock recency is durable-source currentness;
- durable projection is generated only from an exact verified 002C durable-journal checkpoint and is explicitly `DURABLE_VERIFIED`, `semantic_authority:false`;
- exact checkpoint equality is the only basis for `AT_OBSERVED_HEAD`; inequality is only `NOT_AT_OBSERVED_HEAD` and does not guess ancestry;
- the durable projection API remains provider-neutral and does not write semantic state, publish the outbox, or create a second cursor/journal authority.

## 2. Qualification denominator repair

Before qualification, the newly-added 18-case projection denominator contained two defects in the test implementation rather than in the locked runtime contract:

1. the journal-gap case contained an undefined placeholder and expected a non-contract error code;
2. the unsupported-schema case attempted asynchronous syntax inside a synchronous assertion callback.

Both were repaired at the exact qualified subject before freeze. The journal-gap case now asserts the actual fail-closed `JOURNAL_GAP` contract; the unsupported-schema case now reconstructs an integrity-valid journal entry first and then asserts `UNSUPPORTED_EVENT_SCHEMA` from semantic reduction.

## 3. Hosted cumulative evidence

GitHub Actions workflow: `Controller v2 Foundation`.

Exact push run: `34678396249`.

The workflow checked out the exact subject and executed the complete `controller-v2` Node test suite on both supported hosted runtimes:

- Node 24 job `103512283448`: PASS;
- Node 22 job `103512283515`: PASS.

Both jobs completed the `Run Controller v2 kernel tests` step successfully. No isolated projection PASS is being substituted for predecessor regression: the workflow runs `node --test` across the complete Controller v2 test set.

## 4. Frozen invariants

003I portable freeze preserves:

1. projections are derived read models, never canonical semantic truth;
2. 002C remains the sole durable-journal/checkpoint authority;
3. `reduceSemanticEvents` remains the single semantic reducer;
4. local PENDING events may appear only in the explicitly provisional local projection until durable publication advances the exact journal checkpoint;
5. durable projection generation fails closed on checkpoint mismatch, journal gaps/tamper, unsupported semantic schema, or reducer integrity failures;
6. External Effect Authority UNKNOWN/attempt state survives durable reduction rather than being guessed to success/failure;
7. generation time is metadata only and never a durability/currentness proof.

## 5. Evidence boundary

This hosted qualification proves the portable read-model/checkpoint contract at the exact tested subject. It does not prove native filesystem or power-loss behavior, A-01 execution, external-provider correctness, production policy/effect authorization, or production activation.

## 6. Exact successor

`CONTROLLER-FOUNDATION-003J-CLOSURE-CENSUS-001` — re-read the current Foundation-003 forensic recovery map and all 003A–003I evidence; losslessly adjudicate the original recovered 19-requirement denominator against current implementation/tests/evidence; identify any remaining portable dependency-valid gaps before declaring Foundation-003 frozen or advancing to the next Controller foundation stage.
