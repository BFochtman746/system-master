# SMR020 Dependency-Current Source Custody Recovery 001

Date: 2026-09-09
Status: **BLOCKED — SOURCE CUSTODY / EXACT PREDECESSOR BYTES NOT PRESENT IN CURRENT GITHUB OR LIBRARY SEARCH SURFACES**

## Required predecessor

SMR021 dependency-current rebuild requires the exact locally qualified SMR020 source/test subject:

`89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`

The durable SMR020 reconciliation proves that this subject was derived from SMR019 subject `9571b3f4f876980047facbdd77cf17f8a8a2d3255bab9704ceb3fd49cddbd5f3` and passed the recorded local portable campaign. That evidence does not substitute for the runnable source bytes.

## Recovery audit performed

The current GitHub control branch contains SMR020 reconciliation, source-custody records and a rebuild-summary artifact, but not an ordinary GitHub-native runnable source tree for exact subject `89066e56...`.

Library searches were performed using:

- exact subject `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`;
- `OPERATOROPS001 R024 REBUILD`;
- `OPERATOR-OPS-001 SMR020`;
- `SYSTEM MASTER REBUILD 020 OPERATOR`;
- `89066e56` title variants;
- a September 9 ZIP metadata census.

Those searches recovered the historical v2.0.23 OPERATOR carrier and its receipts/review artifacts, but did not surface a runnable archive/source tree whose recomputed source/test digest is `89066e56...`.

## Fail-closed disposition

Do not:

- use historical v2.0.23 as the dependency-current SMR020 base;
- use corrected historical R025/v2.0.24 as the SMR021 base;
- infer that reconciliation text or a summary patch is equivalent to runnable source custody;
- manufacture a new tree and label it exact `89066e56...` without recomputing and matching the digest;
- transfer the prior local PASS to any newly reconstructed bytes;
- queue SMR021 A-01 work before exact current source custody and hosted exact-SHA qualification exist.

## Exact recovery gate

A valid recovery must do one of the following:

1. recover the original runnable SMR020 tree/archive and independently recompute the source/test digest to exact `89066e5662554b1810691473e0ed9bf49d8cc2fd4964444043b878461ed75477`; or
2. deterministically reconstruct from preserved exact predecessors and bounded repair artifacts, then independently recompute the same exact digest.

If reconstruction yields a different digest, it is a **new candidate**, not recovered SMR020 authority. It must receive its own qualification lineage before SMR021 can depend on it.

## Unlock

Exact recovery of `89066e56...` unlocks:

`SYSTEM-MASTER-REBUILD-021-DEPENDENCY-CURRENT-REBUILD-001`

which will transplant recovered R025 USER-EXPERIENCE semantics plus `USEREXPERIENCE001_R025_DB_PARITY_REPAIR_001.patch` onto that exact predecessor, produce a new SMR021 subject, and run the current-lineage qualification set.

## A-01

No A-01 ticket is justified at this boundary. The missing evidence is exact runnable source custody, not Windows compute capacity.
