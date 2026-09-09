# SMR021 Dependency-Current Source Custody Reconciliation 002

Date: 2026-09-09
Owner path: `SYSTEM_MASTER/CORE`
Status: **BLOCKED — SOURCE CUSTODY / EXACT SMR020 RUNNABLE PREDECESSOR NOT RECOVERED**

## Authority delta reconciled

Startup reconciliation compared the sealed CORE checkpoint head `f0f7338aaefb87f12c36186af696876ae69d7a70` with the live CORE head `360d9129a7d7f9f1b5e2e1f546e9f1b2c3fa2d81` and classified `AUTHORITY_DELTA`.

The live delta already closes:

- SMR019 cumulative local portable reconciliation on exact subject `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3`;
- SMR020 local portable reconciliation on exact subject `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`;
- SMR021 historical v2.0.24 carrier replay;
- the bounded R025 database-parity repair and corrected-historical-candidate portable qualification.

Those completed boundaries are not rerun here.

## Fresh exact-source recovery audit

The current dependency-current SMR021 rebuild requires runnable predecessor bytes whose independently recomputed source/test digest equals:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

Fresh Library search found metadata artifacts, including generated README records that state the exact SMR020 subject and portable standing, plus `OPERATOROPS001-RECONCILIATION-001.md`.

Those records are evidence metadata only. No runnable archive/source tree for the exact subject was found alongside them. A focused Library time-window listing around the metadata generation event surfaced only README/reconciliation artifacts, not source/archive bytes.

The current working container was also inspected for `89066e56`, `SMR020`, `SYSTEM_MASTER_REBUILD_020`, and `OPERATOROPS001` candidate bytes; no runnable predecessor copy was present.

## Reconstruction route adjudication

The exact-recovery contract allows deterministic reconstruction from preserved predecessors and bounded repair artifacts only if the independently recomputed result equals exact `89066e56...`.

The durable `OPERATOROPS001_R024_REBUILD_001.patch` is a lineage/qualification summary, not a byte-level executable patch. Likewise, the SMR018/SMR019 assembly records preserve semantic inputs and diff digests but do not contain the complete runnable local diffs needed to deterministically reconstruct the exact prior local trees from GitHub text alone.

Therefore exact reconstruction cannot currently be completed without inventing bytes. It remains fail-closed.

## Current disposition

`SYSTEM-MASTER-REBUILD-021-DEPENDENCY-CURRENT-REBUILD-001` is **BLOCKED — SOURCE CUSTODY** until one of these succeeds:

1. recover the original runnable SMR020 tree/archive and independently recompute exact source/test digest `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`; or
2. recover sufficient exact predecessor + executable reconstruction artifacts to deterministically reproduce that same digest.

If recovered/reconstructed bytes produce a different digest, they are a new candidate with a new qualification lineage and may not inherit the SMR020 PASS.

## Preserved completed SMR021 phase

The SMR021 historical replay and bounded database-parity repair remain completed local portable evidence under `USEREXPERIENCE001-RECONCILIATION-001.md`. They do not satisfy the dependency-current predecessor requirement.

## A-01 / hosted boundary

No A-01 ticket is justified for SMR021 at this blocker. Missing exact runnable source custody is not a Windows-compute problem.

Do not queue A-01 until an ordinary GitHub-native immutable dependency-current candidate exists and hosted exact-SHA qualification passes on that same subject with a distinct A-01 evidence delta.

## Next-state rule

While this source-custody block remains unresolved, CORE may re-evaluate another independently READY CORE/shared-infrastructure obligation. It must not silently substitute historical v2.0.23/v2.0.24 bytes for the exact dependency-current predecessor.
