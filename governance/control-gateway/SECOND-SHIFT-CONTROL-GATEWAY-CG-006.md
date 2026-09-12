# SECOND-SHIFT-CONTROL-GATEWAY-CG-006 — CHAT CRASH / RESTART / CONTINUE RECOVERY GATE + HOST QUALIFICATION

Status: **HOST QUALIFIED / LIVE GITHUB CHAT-RECOVERY QUALIFIED / DEVELOPMENT FROZEN / PRODUCTION NOT ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor freeze: `c30404321e5e4cd296539443b224930ce83afed6`  
Code branch: `second-shift-control-gateway/cg-006-chat-recovery`  
Exact qualified implementation subject: `ee7f1d52e5b4421bcbb78947835f38c97cb6fd1e`  
Final qualification run: `34669313253`  
Development state revision: `4`  
Development state head: `49c8e5cc7d01166966cc89aa48cac9ca77644466`

## 1. Closure statement

CG-006 closes the development crash/restart/Continue recovery gate. A fresh process with no prior-chat state can recover the verified durable publication, re-derive the legal continuation, verify that the live governance work-ref packet is byte-semantically identical to the durable packet, prove the live governance head is a single-parent descendant of the qualified implementation subject, and return the exact live governance head SHA as the continuation base.

`Continue` is not a conversational inference. It resolves only to `CONTINUE_CURRENT` for an exact ACTIVE operation or `START_SUCCESSOR` for exactly one dependency-valid successor. Reconciliation-required, no-successor, multi-successor, stale, moved, tampered, or mismatched authority fails closed.

CG-006 does not activate production GitHub mutation execution, A-01 admission, A-01 scheduling, or production controller cutover.

## 2. Implemented surface

CG-006 adds:

- `control-gateway/src/chat-recovery-gate.js`
- `control-gateway/test/chat-recovery-gate.test.js`
- `.github/workflows/second-shift-control-gateway-cg-006.yml`

Primary protocol:

`control-gateway.chat-recovery-contract.v1`

The recovery contract binds mission/workstream, authority epoch, publication ref/head/revision/digests, qualified subject, repository, durable work ref, exact live governance head, current operation, exact continuation and predecessor receipt, gate standing, scope, and a recovery digest.

## 3. Recovery invariants

1. Chat memory is not recovery authority.
2. Stored `NEXT_LEGAL_OPERATION` is re-derived and must agree with deterministic derivation.
3. No-successor and multi-successor states never guess.
4. Failed/blocked/stale standing requires reconciliation.
5. The durable published packet and live governance packet must match exactly.
6. The live governance head must be connected to the qualified subject by a bounded single-parent ancestry chain.
7. Work-ref movement during recovery fails closed.
8. Durable publication movement during recovery fails closed.
9. Recovery contracts are content-digested and must be revalidated for freshness before use.
10. The exact live governance head is the branch/base predecessor returned for continuation.
11. Recovery does not bypass CG-005 mutation admission or exact-predecessor CAS.

## 4. Host and live GitHub qualification

The first test run exposed one adversarial-test scheduling defect: the simulated authority move was configured for a reconstruct call that did not occur. The production recovery logic itself and the live GitHub recovery test passed. The test was corrected without weakening the gate.

Final exact subject:

`ee7f1d52e5b4421bcbb78947835f38c97cb6fd1e`

Final run:

`34669313253`

Results:

- Node 22.23.2 — **104 tests / 102 pass / 0 fail / 2 inherited skips**;
- Node 24.20.0 — **104 tests / 102 pass / 0 fail / 2 inherited skips**;
- workflow conclusion — **SUCCESS**;
- workflow permissions — `contents: read`, `metadata: read`;
- live GitHub CG-006 recovery — **PASS** on both Node versions.

The live test reconstructed, without prior chat state, the CG-005 durable publication at `c3c29bb6...`, the exact qualified subject `632848de...`, the CG-005 governance branch, its exact freeze head `c3040432...`, operation CG-006, and its predecessor receipt.

## 5. Durable revision 4

Development state ref:

`control-gateway-state/active-work/second-shift-control-gateway-dev`

Revision 4 head:

`49c8e5cc7d01166966cc89aa48cac9ca77644466`

Revision 4 parent:

`c3c29bb6b6d4ae325b0c52743b3fb611967ae808`

Packet digest:

`b2d61b83b251dc695000f006e46455db114c3ea28b257b60791b1776bfd8fc4f`

Publication digest:

`397a82721f36c0151c9879e857b3bcc8917a647b53cf7e8ff87d7fc71d5dc67c`

`head.json` and immutable revision 4 both use Git blob:

`8c480d2526471196f444b42ff48ce8e124cea38c`

Revision 4 marks CG-006 terminal/PASSED and records exactly one dependency-valid successor: CG-007. GitHub admission is intentionally `PENDING`, not `ADMITTED`, because the production successor-ref creation contract is not yet closed.

## 6. Production blocker discovered by CG-006

CG-005 currently has two mutation target kinds: existing `WORK_REF` and `AUTHORITY_STATE_REF`. Its `WORK_REF` contract requires the target ref to equal the durable `branch_or_ref`.

Our development sequence creates a new branch for each successor operation. Therefore the current production admission contract does not yet authorize creating a new successor branch from the exact recovered governance freeze SHA.

This is not bypassed or hidden. `CG006-B001 — SUCCESSOR_BRANCH_CREATION_ADMISSION` remains OPEN. CG-007 must either:

- add and qualify a controlled successor-ref creation admission contract bound to the recovered freeze SHA; or
- explicitly replace per-operation branches with one durable admitted work-ref model.

No production GitHub mutation activation may claim closure while this remains unresolved.

## 7. A-01 boundary

The existing A-01 enforcement blocker is unchanged: `.github/workflows/second-shift-supervisor-v2-a01-windows-stress.yml` remains an unregistered direct self-hosted route and must later enter through `.github/workflows/a01-control-plane-gateway.yml`.

Actual A-01 qualification remains mandatory before production activation.

## 8. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-007 — VALIDATOR CLOSURE / CODE-ROUTING-SCHEMA-CONTRACT-DEPENDENCY GATE + HOST QUALIFICATION`

CG-007 must close semantic/code/routing/schema/contract/dependency validation before admission and must resolve `CG006-B001` as part of GitHub contract closure rather than creating a bypass.
