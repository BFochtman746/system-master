# SECOND-SHIFT-CONTROL-GATEWAY-CG-005 — GITHUB MUTATION ADMISSION / REPOSITORY-BRANCH-PATH-PREDECESSOR GATE + HOST QUALIFICATION

Status: **HOST QUALIFIED / LIVE DEVELOPMENT GITHUB ADMISSION QUALIFIED / DEVELOPMENT FROZEN / PRODUCTION MUTATION EXECUTION NOT ACTIVATED**  
Mission authority: `SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0`  
Exact predecessor freeze: `76c63ca0d48e3691142cb02ffa37f9a4e6a1f005`  
Code branch: `second-shift-control-gateway/cg-005-github-admission`  
Exact qualified implementation subject: `632848deb3045c80338246ccf9ea4163c61218a0`  
Final qualification run: `34668105764`  
Development state ref: `control-gateway-state/active-work/second-shift-control-gateway-dev`  
Development state head after CG-005: `c3c29bb6b6d4ae325b0c52743b3fb611967ae808`

## 1. Closure statement

CG-005 closes the development GitHub mutation-admission contract that must run before any controller-authorized GitHub state-changing operation.

A mutation request is not admitted because a chat proposes it, because a branch exists, or because code appears plausible. The gate reconstructs the verified CG-004 durable authority, binds the request to the exact mission/workstream/authority epoch/publication head/packet digest/authoritative subject, verifies repository and mutation-transport identity, verifies the exact legal operation and predecessor receipt, checks target ref, path/effect scope and live predecessor SHA, rechecks that durable authority and target ref remain stable, and only then emits a content-digested admission receipt.

An admission receipt is **not** itself a GitHub write. Any executor consuming the grant must still enforce the receipt's `EXACT_PREDECESSOR_CAS_REQUIRED` condition immediately before the state-changing effect.

CG-005 does not activate production GitHub mutation execution, production state-ref protection/rulesets, A-01 admission, A-01 scheduling, or production controller cutover.

## 2. Implemented surface

CG-005 adds:

- `control-gateway/src/github-mutation-admission.js`
- `control-gateway/src/github-mutation-authority-adapter.js`
- `control-gateway/test/github-mutation-admission.test.js`
- `.github/workflows/second-shift-control-gateway-cg-005.yml`

Primary components:

- `GitHubMutationAdmissionGate`
- `GitHubMutationAuthorityAdapter`
- mutation request protocol `control-gateway.github-mutation-request.v1`
- mutation admission protocol `control-gateway.github-mutation-admission.v1`

The authority adapter does not weaken or reinterpret CG-004. It cross-checks the CG-004 chat reconstruction summary against the same verified publication packet and exposes only the additional packet fields required for mutation admission: authority epoch, allowed scope and successor-candidate standing.

## 3. Required mutation-request bindings

Every request must bind, at minimum:

- unique `mutation_id`;
- frozen mission version;
- exact workstream;
- exact authority epoch;
- exact CG-004/CG-005 authority publication commit;
- exact authority packet digest;
- exact authoritative subject;
- exact repository;
- target kind;
- target ref;
- exact expected predecessor SHA;
- exact operation ID;
- exact predecessor receipt ID;
- exact repository paths to change;
- declared effects.

Request paths are exact normalized paths. Request-side wildcards, traversal segments, duplicate paths/effects, unsafe paths and empty mutation scopes fail closed.

## 4. Repository / ref / scope admission

For `WORK_REF` mutations:

- request repository must equal durable authority repository;
- mutation transport owner/repository must equal durable authority repository;
- target ref must equal the durable `branch_or_ref`;
- every exact requested path must fall under a durable allowed-path rule;
- every effect must be present in the durable allowed-effect set.

For `AUTHORITY_STATE_REF` mutations:

- target ref must equal the reconstructed durable publication ref;
- the only permitted effect is `CONTROL_GATEWAY_STATE_PUBLICATION`;
- paths are restricted to `control-gateway-state/active-work/head.json` and immutable `control-gateway-state/active-work/revisions/...` records.

The authority-state path is deliberately separate from ordinary work-ref mutation admission.

## 5. Operation / predecessor admission

If the durable current operation is ACTIVE, a request may be admitted only for that exact current operation and exact predecessor receipt.

If the durable current operation is BLOCKED, GitHub mutation admission is denied.

If the durable current operation is TERMINAL, a request may be admitted only when `NEXT_LEGAL_OPERATION` is `START_SUCCESSOR` and the request exactly matches that single dependency-valid successor and its predecessor receipt. Missing, different or ambiguous successors are not guessed.

The successor candidate's GitHub standing must not be `DENIED` or `STALE`.

The live target ref must equal `expected_predecessor_sha`. A mismatched predecessor fails closed before grant issuance.

## 6. Race and stale-authority behavior

CG-005 reconstructs durable authority before the predecessor check and reconstructs it again before grant issuance. If publication commit or packet digest changes, admission fails with an authority-movement error.

The target ref is also read before and after authority revalidation. Target movement fails closed.

The resulting grant contains a request digest and admission digest. `verifyGrantFresh` revalidates both digests and rechecks the current durable authority and target predecessor. If either moved after grant issuance, the grant is stale and cannot be consumed.

This is a pre-mutation admission protocol. The eventual mutation executor must perform an exact predecessor CAS at the effect boundary; a previously valid receipt cannot authorize a write against a later branch head.

## 7. Host qualification

Exact qualified implementation subject:

`632848deb3045c80338246ccf9ea4163c61218a0`

Final hosted run:

`34668105764`

Results on that exact subject:

- Node 22.23.2 — **90 tests / 89 pass / 0 fail / 1 intentional inherited skip**;
- Node 24.20.0 — **90 tests / 89 pass / 0 fail / 1 intentional inherited skip**;
- workflow conclusion — **SUCCESS**;
- workflow permissions — `contents: read`, `metadata: read`;
- CG-005's live GitHub admission test passed on both Node versions;
- the live test reconstructed the real CG-004 development state, verified the exact CG-004 governance predecessor `76c63ca...`, issued an exact predecessor-bound CG-005 admission receipt and revalidated that grant without using chat memory.

The one skip is the older CG-004 standalone live-test case whose `CG004_*` environment was intentionally not configured in the CG-005 workflow. CG-005's own live remote admission test was executed and passed.

## 8. Failure cases qualified by CG-005

The host suite covers, at minimum:

- correct exact-successor admission;
- deterministic request ordering/digest binding;
- wrong repository;
- mutation-transport repository mismatch;
- wrong work ref;
- wrong predecessor SHA;
- target ref movement during admission;
- durable authority movement during admission;
- publication-head expectation mismatch;
- authority packet-digest mismatch;
- authority-epoch mismatch;
- authoritative-subject mismatch;
- mission/workstream mismatch;
- failed qualification standing;
- denied/stale GitHub standing;
- blocked operation;
- wrong active-operation predecessor receipt;
- wrong or ambiguous terminal successor;
- denied/stale successor candidate;
- path outside durable authority;
- unsafe/wildcard/duplicate/empty request scope;
- effect outside durable authority;
- authority-state ref/path/effect restrictions;
- tampered admission receipt;
- post-grant authority movement;
- post-grant target movement;
- CG-004 summary/publication cross-check;
- live remote admission from actual GitHub durable authority without chat memory.

## 9. Durable development-state transition

CG-005 then advanced the existing development authority state by non-force fast-forward from revision 2 to revision 3.

State ref:

`control-gateway-state/active-work/second-shift-control-gateway-dev`

Revision 3 head:

`c3c29bb6b6d4ae325b0c52743b3fb611967ae808`

Revision 3 parent:

`e71d19360562c2f6e5d40c9d1b87fc9bca80e47b`

Revision 3 packet digest:

`6728947361523faa60d06435efaf9a1ff301f81a0b85a6df4086880793aaa43b`

Revision 3 publication digest:

`59c20f05d27ca84e7bc0298040c31f6eb50596e2ba248473d3f99883ce6083d6`

Revision 3 `head.json` and immutable revision mirror both resolve to Git blob:

`dbf203de3b9b8fd00f487a1a0f8b7bbaa5347d47`

The revision binds the CG-005 qualified implementation subject `632848de...`, marks CG-005 TERMINAL/PASSED with GitHub admission standing `ADMITTED`, and records exactly one dependency-valid successor: CG-006.

This development state does not equal production activation.

## 10. Explicit non-claims and open blocker

CG-005 does **not** prove or activate:

- production GitHub mutation execution;
- repository rulesets/protection sufficient to make every external writer pass the controller;
- production control-state ref activation;
- A-01 admission;
- A-01 Windows qualification;
- A-01 scheduler cutover;
- production controller activation.

The pre-existing A-01 enforcement collision remains unchanged: `.github/workflows/second-shift-supervisor-v2-a01-windows-stress.yml` is an unregistered direct self-hosted path and current enforcement requires `.github/workflows/a01-control-plane-gateway.yml`. CG-005 does not weaken or bypass that enforcement.

## 11. Frozen invariants

Later implementation may change internal mechanics but may not weaken these rules without explicit versioned reopening:

1. chat memory is never GitHub mutation authority;
2. mutation admission consumes verified durable publication state;
3. request repository and actual mutation-transport repository must both equal durable authority;
4. target kind and target ref must match durable authority;
5. every requested path/effect must be within durable allowed scope;
6. every grant is bound to an exact live predecessor SHA;
7. every mutation request is bound to the exact current/legal operation and predecessor receipt;
8. qualification and GitHub standing must permit mutation;
9. durable authority and target ref must remain stable throughout admission;
10. admission receipts are content-digested and request-bound;
11. a grant becomes stale when durable authority or target predecessor moves;
12. every executor consuming a grant must enforce exact predecessor CAS at the state-changing boundary;
13. authority-state publication uses a dedicated target kind/effect and reserved state paths;
14. admission is not production activation.

## 12. Exact successor

`SECOND-SHIFT-CONTROL-GATEWAY-CG-006 — CHAT CRASH / RESTART / CONTINUE RECOVERY GATE + HOST QUALIFICATION`

CG-006 must prove that a new or restarted ChatGPT conversation can recover the durable state, determine the exact legal continuation, reject stale/duplicate/ambiguous continuation attempts, and resume without relying on prior conversational memory.
