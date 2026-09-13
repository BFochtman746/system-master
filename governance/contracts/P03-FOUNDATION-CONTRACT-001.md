# P03 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P03 Evidence store and retention · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`)
**Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json` · P03 `BUILT`
**Implementation** `control-gateway/python/a01_evidence_retention.py`

## 1. Contract / interface

P03 provides local, tamper-evident evidence indexing and tiered retention under an evidence root.

- `EvidenceManifest`: append-only `entries()`, `head()`, `append(body)`, `verify()`, `recorded_paths()`.
- `EvidenceStore`: `index()`, `plan(now)`, `prune(now, dry_run)`, `report(now)`.
- `RetentionPolicy`: 30-day whole-retention window, 365-day summary window, and never-prune prefixes `authority/`, `qualification/`, `closure/`.
- CLI: `--index`, `--verify`, `--plan`, `--prune [--dry-run]`, `--report`.

Foundation 1.0 guarantees append-only manifest lineage, detectable chain tampering, record-before-delete pruning, protected prefixes and fail-closed prune refusal on integrity doubt. It does **not** claim WORM/tamper-proof storage or an absolute free-space guarantee. `min_free_bytes` exists in the policy object but is not currently enforced and is outside this Foundation acceptance claim.

## 2. Ingress routes

- `--index` records new or changed local artifacts idempotently.
- `--verify` replays manifest integrity.
- `--plan` computes retention disposition without mutation.
- `--prune` applies the tiered policy only after successful manifest verification; `--dry-run` performs no deletion.
- `--report` renders current local evidence/retention state.

Evidence producers write artifacts into the root; P03 records and governs retention of those artifacts but does not manufacture their semantic evidence claims.

## 3. Egress routes

- append-only `<root>/EVIDENCE-MANIFEST-001.jsonl`;
- JSON CLI results;
- artifact deletion only after a durable `PRUNED` manifest record is appended and fsynced;
- exit 0 on success, exit 1 for retention/policy refusal, exit 2 for missing root or chain-integrity failure.

A `PRUNED` record retains the deleted artifact content digest, preserving post-deletion identity.

## 4. Persistence and canonical writer

The manifest is P03 durable state. `EvidenceManifest.append` is the canonical writer and opens the manifest only in append mode, writes canonical JSON, flushes and fsyncs.

Every record carries `previous_entry_digest` plus `entry_digest`, allowing replay to detect edit, removal or insertion. P03 never updates or deletes manifest entries. Evidence artifacts remain producer-owned; P03 may delete only artifacts admitted by its retention policy and only after recording the deletion.

Hash chaining is tamper-evidence, not tamper-proofing: a principal with unrestricted local filesystem write authority could rewrite the chain end-to-end. External anchoring/WORM storage is not granted by this contract.

## 5. Dependencies

- local filesystem evidence root (`A01_EVIDENCE_ROOT`, default `control-gateway/state/evidence`);
- Python 3.12 standard library only;
- P00 current authority and Crosswalk 003 establish current P03 ownership/disposition for census qualification.

P03 has no network, private-data, publication, credential or external-provider dependency for Foundation 1.0 qualification.

## 6. Failure semantics

**Fail closed; never delete on doubt.**

- absent evidence root → exit 2;
- malformed or broken manifest chain → verification fails and prune is refused before deletion;
- failure to append a prune record → corresponding artifact is not deleted and is reported refused;
- protected prefixes → never prunable regardless of age;
- dry-run → no deletion;
- repeated index/prune operations are idempotent with respect to unchanged/already-pruned artifacts.

Artifact disappearance caused outside P03 is not relabeled as a successful P03 prune.

## 7. Evidence target

`.github/workflows/p03-evidence-retention-foundation-qualification.yml` executes the exact current implementation/test subject and preserves `p03-foundation-1.0-evidence`.

The receipt binds `CURRENT-AUTHORITY-005`, Crosswalk 003 P03 `BUILT`, `SYSTEM_MASTER/CORE`, source commit identity, the implementation/test/contract/workflow Git blobs, the 17-test result, acceptance-log digest and immutable workflow artifact identity. Foundation census completion requires admission of that successful exact-subject receipt into `FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`.

## 8. Acceptance target

```bash
cd control-gateway/python
PYTHONPATH="$PWD:$(cd ../.. && pwd)" python -m unittest test_a01_evidence_retention -v
```

**PASS** only when all 17 tests pass with zero skips on the same exact source identity and the qualifier additionally proves:

1. current authority is `CURRENT-AUTHORITY-005` and selects Crosswalk 003;
2. Crosswalk 003 contains P03 owned by `SYSTEM_MASTER/CORE`, disposition `BUILT`, implementation `control-gateway/python/a01_evidence_retention.py`;
3. the implementation exposes append/index/verify/plan/prune/report behavior but no manifest update/delete method;
4. default protected prefixes are exactly `authority/`, `qualification/`, `closure/`;
5. `min_free_bytes` is not represented as a qualified Foundation guarantee;
6. exact-subject machine-readable evidence is emitted and preserved.

## 9. Authority boundary

**Lane may decide alone (`agent`):** implementation details preserving the accepted invariants, report formatting, performance and additional tests.

**Requires owner authority (`owner`):** manifest mutation/deletion semantics; protected-prefix removal; permitting prune on an unverified chain; reversing record-before-delete; external anchoring/WORM integration; or promoting `min_free_bytes` into an enforcement/availability guarantee.

Repository qualification grants none of those broader authorities.

## 10. Open gaps

No open gap blocks the P03 Foundation 1.0 claim above once exact-subject acceptance evidence is admitted.

Follow-on adoption work remains separately owed: schedule indexing/pruning in the admitted execution environment, and decide/implement actual free-space pressure enforcement if `min_free_bytes` is to become a runtime guarantee. Those items must not be silently inferred from this Foundation acceptance.
