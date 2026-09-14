# P03 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P03 Evidence store and retention · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-002.json`
**Disposition** BUILT by `governance/PLATFORM-DISPOSITION-DECISIONS-001.md`

## 1. Contract / interface

`a01_evidence_retention` governs local evidence under a root directory.

- `EvidenceManifest` — `entries()`, `head()`, `append(body)`, `verify()`, `recorded_paths()`.
- `EvidenceStore` — `index()`, `plan(now)`, `prune(now, dry_run)`, `report(now)`.
- `RetentionPolicy` — `keep_all_days` 30, `keep_summary_days` 365,
  `never_prune_prefixes` (`authority/`, `qualification/`, `closure/`).
- CLI: `--index`, `--verify`, `--plan`, `--prune [--dry-run]`, `--report`.

Offers: a tamper-evident record of every artifact that has existed, and bounded disk use.
Does not offer: an update or delete path for manifest entries. Neither class has one.

## 2. Ingress routes

1. **`--index` after a night**, recording new artifacts. Idempotent.
2. **`--prune`**, scheduled or manual, applying the policy.
3. **`--verify`**, any time, and mandatorily before any prune.

Writes into the evidence root come from producers — the gateway, the supervisor, the
morning receipt. This module never creates evidence, only records and prunes it.

## 3. Egress routes

- The manifest at `<root>/EVIDENCE-MANIFEST-001.jsonl`, append-only.
- Deletion of prunable artifacts, each preceded by its own recorded entry.
- JSON on stdout for every subcommand.
- Exit 0 ok, 1 policy violation or prune refused, 2 chain broken or root absent.

Exit 2 for a broken chain is deliberate: that is an integrity failure, not a retention one,
and must not be retried like a transient.

## 4. Persistence and canonical writer

The manifest is the durable state. Canonical writer: `EvidenceManifest.append`, and nothing
else. It opens the file `"a"`, writes one canonical JSON line, flushes and fsyncs.

Each entry carries `previous_entry_digest` and an `entry_digest` over the entry body, so
the chain is verifiable by replay from `GENESIS`. Modification, deletion or insertion at
any position is detectable — `verify()` reports the index of the first break rather than
only rejecting, so a damaged manifest can be diagnosed.

Artifacts are owned by their producers. This module deletes them under policy and never
modifies them.

**Honest limit:** hash-chaining is tamper-*evidence*, not tamper-*proofing*. Anyone with
local write access to A-01 could rewrite the chain end to end. Closing that needs an
external anchor, which conflicts with the standing sovereignty rule and is an owner
decision. Recorded, not glossed.

## 5. Dependencies

- A local filesystem root (`A01_EVIDENCE_ROOT`, default `control-gateway/state/evidence`).
- Python 3.12 stdlib only.

Consumers: **P04** authority writes, **P06** gateway, **P08** qualification and **P15**
receipt all produce evidence into this root. None depends on this module to function —
retention is governance over their output, not a path in it.

## 6. Failure semantics

**Fail-closed, and asymmetrically: never delete on doubt.**

- Root absent → exit 2, nothing attempted.
- Manifest line unparseable → `ChainError`, exit 2.
- Chain broken → `prune()` raises before deleting anything. A test asserts the artifact
  survives a broken-chain prune attempt.
- Record write fails during prune → that artifact is **not** deleted and is reported under
  `refused`. Record first, delete second, always.
- Artifact vanished between plan and prune → skipped silently. Something else removed it;
  that is not this module's failure to report.
- Protected prefix → never prunable at any age, regardless of policy values.

Idempotent throughout. `index()` re-records only changed content. `verify()` and `plan()`
are pure. Repeated `prune()` is a no-op once the plan is empty.

## 7. Evidence target

The manifest itself, and it is self-proving: `--verify` replays the chain and reports
entry count and head digest. A `PRUNED` entry retains the artifact's content digest, so a
deleted artifact remains provably identifiable after deletion. The record outlives the
artifact, which is the entire purpose.

## 8. Acceptance target

```
cd control-gateway/python && PYTHONPATH="$PWD:$(cd ../.. && pwd)" \
  python -m unittest test_a01_evidence_retention
```

**PASS** when all 17 tests pass with zero skips. The suite proves the properties that make
this evidence rather than a log: an edited entry is detected, a removed entry is detected,
a broken chain refuses to prune, a pruned artifact stays provable, and protected prefixes
are never prunable.

## 9. Authority boundary

**Lane may decide alone (`agent`):** default window values within the tiered shape, report
formatting, additional tests, walk performance.

**Requires the owner (`owner`):** adding any update or delete path to the manifest;
changing or removing a protected prefix; permitting a prune on an unverified chain;
reversing the record-then-delete order; adding an external anchor, which is a sovereignty
decision.

Reversing record-then-delete would make untraceable deletion possible again. That is the
one invariant this capability is.

## 10. Open gaps

None in the module. Two adoption items:

- Not yet scheduled. Run `--index` after the night and `--prune` weekly, after the ingress
  and receipt tasks are registered.
- `min_free_bytes` is defined in the policy but not yet enforced against actual free space.
  Low priority while the tiered windows hold, and it is the natural next addition.
