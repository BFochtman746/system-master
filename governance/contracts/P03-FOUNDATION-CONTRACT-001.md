# P03 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P03 Evidence store and retention · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`) · **Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`
**Disposition lineage** `governance/PLATFORM-DISPOSITION-DECISIONS-001.md` (`BUILD`)

## 1. Contract / interface

`control-gateway/python/a01_evidence_retention.py` governs local evidence under one admitted evidence root.

- `EvidenceManifest` — append-only hash-chain operations `entries()`, `head()`, `append(body)`, `verify()`, `recorded_paths()`.
- `EvidenceStore` — `index()`, `plan(now)`, `prune(now, dry_run)`, `report(now)`.
- `RetentionPolicy` — keep-all and summary windows, protected prefixes, and a `min_free_bytes` alert threshold.
- CLI — `--index`, `--verify`, `--plan`, `--prune [--dry-run]`, `--report`, with policy-window and free-space-threshold overrides.

Foundation 1.0 provides deterministic local retention policy and tamper-evident deletion lineage. `min_free_bytes` is deliberately an **observability threshold**, not permission to destroy recent or protected evidence under disk pressure. A low-space condition is reported; it never overrides retention/protection authority.

No update/delete method exists for manifest entries. P03 does not provide external WORM storage, publication, remote anchoring, scheduler ownership, or authority to weaken protected evidence classes.

## 2. Ingress routes

1. `--index` records new or changed local artifacts idempotently.
2. `--verify` replays the manifest chain and is mandatory before destructive prune execution.
3. `--plan` computes retention candidates plus free-space threshold state without mutation.
4. `--prune` applies admitted retention policy; `--dry-run` reports candidates without deleting.
5. `--report` surfaces chain status, unrecorded artifacts, retention counts and free-space threshold state.

Evidence producers may write artifacts into the root, but they do not become P03 canonical writers. Scheduling these commands belongs to the scheduler/operations platform requirements rather than this retention module.

## 3. Egress routes

- `<root>/EVIDENCE-MANIFEST-001.jsonl`, append-only.
- `INDEXED` records for observed artifacts.
- `PRUNE_INTENT` records, including content digest and size, written before every destructive attempt.
- `PRUNED` completion records only after filesystem deletion succeeds.
- `PRUNE_FAILED` records when filesystem deletion is refused after a valid intent record.
- JSON command results containing actual deletion/refusal counts and actual reclaimed bytes.
- Exit `0` on clean success, `1` when a prune is refused or its completion record fails, `2` on broken/unreadable chain/root conditions.

## 4. Persistence and canonical writer

The manifest is the durable P03 state. `EvidenceManifest.append` is the sole P03 writer and opens the manifest in append mode, emits one canonical JSON line, flushes and fsyncs it.

Every record carries `previous_entry_digest` and `entry_digest`; `verify()` replays from `GENESIS` and reports the first detected break. Artifacts remain producer-owned. P03 may delete an artifact only after a traceable `PRUNE_INTENT` containing that artifact's digest and size exists.

The post-delete `PRUNED` record confirms successful deletion. If that final append fails, the deletion is still traceable through `PRUNE_INTENT`, the command reports `completion_record_failures`, and the CLI exits `1`; it may not silently claim a clean prune.

Hash chaining is tamper-*evidence*, not tamper-*proofing*. A principal with unrestricted local write authority could rewrite the chain end-to-end. External anchoring would cross the standing local-sovereignty boundary and is not granted by P03 Foundation 1.0.

## 5. Dependencies

- Local filesystem evidence root (`A01_EVIDENCE_ROOT`, default `control-gateway/state/evidence`).
- Python 3.12 standard library only.
- P00/P01/P02 provide current authority/topology/obligation context but are not runtime libraries.

P04/P06/P08/P15 may produce or consume evidence around this root. P11/P15 may later schedule/index/report retention operations. Those integrations do not transfer semantic ownership to P03.

## 6. Failure semantics

**Fail closed on integrity doubt and never make an untraceable deletion.**

- Root absent → exit `2`; no mutation.
- Malformed/broken hash chain → verification failure/exit `2`; prune raises before any deletion.
- `PRUNE_INTENT` append/fsync failure → artifact remains; refusal is reported; CLI exits `1`.
- Filesystem delete failure after a valid intent → artifact remains; `PRUNE_FAILED` is appended when possible; refusal is reported; CLI exits `1`.
- `PRUNED` completion-record failure after a successful delete → pre-delete intent preserves content identity; failure is surfaced explicitly; CLI exits `1`.
- Dry run → no manifest mutation and no deletion; `would_prune` reports candidate count, `pruned` remains zero.
- Protected prefix → never a prune candidate at any age.
- Low free space → surfaced through `below_min_free_bytes`; it does not authorize deletion outside the tiered retention plan.

`index()` is content-idempotent; `verify()`/`plan()` are non-destructive; repeated successful prune converges to no remaining candidates.

## 7. Evidence target

Qualification must preserve machine-readable exact-subject evidence containing:

- current authority and P03 identity;
- qualification workflow/run/head identity;
- exact Git blob SHAs for the contract, implementation, tests, disposition rationale and qualification workflow;
- Python runtime and exact test count;
- hash of the captured test log;
- PASS result and immutable Actions artifact identity when admitted into the Foundation evidence registry.

Runtime evidence remains the append-only manifest: verification proves chain continuity; prune intent/completion/failure records preserve deletion lineage and content identity after artifact removal.

## 8. Acceptance target

```bash
cd control-gateway/python
PYTHONPATH="$PWD:$(cd ../.. && pwd)" python -m unittest test_a01_evidence_retention -v
```

**PASS** requires exactly **20 tests**, zero failures/errors/skips, including tamper detection, removed-entry detection, idempotent indexing, protected-prefix retention, low-free-space observability without authority expansion, pre/post deletion evidence ordering, broken-chain refusal, dry-run truthfulness, actual reclaimed-byte accounting on delete refusal, retained proof after deletion, and CLI exit `1` on a refused prune.

Repository qualification is `.github/workflows/p03-evidence-retention-foundation-qualification.yml` and must emit `p03-foundation-1.0-evidence` bound to the exact qualifying source SHA.

## 9. Authority boundary

**CORE/P03 may decide:** deterministic local implementation details, report formatting, test expansion, and default retention/alert values that do not weaken protected-prefix or integrity rules.

**Owner authority required:** adding manifest mutation/deletion, weakening/removing protected prefixes, pruning on an unverified chain, bypassing pre-delete trace recording, converting low-space observation into emergency authority to delete otherwise protected/recent evidence, or adding external anchoring/remote retention.

P03 repository qualification proves only the local retention substrate. It grants no native/private/external/publication/production authority.

## 10. Open gaps

No Foundation-local implementation gap remains once the exact-subject qualification passes.

Operational scheduling of index/prune/report is intentionally a downstream P11/P15 integration obligation; it is not silently counted as P03 scheduler authority. External WORM/anchor storage remains outside P03 Foundation 1.0 under the standing sovereignty boundary.
