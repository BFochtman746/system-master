# P02 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P02 Work obligation registry · **Effective** 2026-09-14  
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`)  
**Current registry selector** `CURRENT-AUTHORITY.json -> obligation_registry`

## 1. Contract / interface

P02 is the authority-selected durable work-obligation registry for System Master. The current numbered registry is whatever `CURRENT-AUTHORITY-005` selects through `obligation_registry`; the P02 contract must not hardcode an older numbered registry as permanent authority.

P02 exposes the current obligation graph: registry identity, effective date, product root, topology/job/completion bindings, supersession lineage, current obligations, central objective and highest-discretionary objective.

The closed accepted obligation-state vocabulary is:

`READY`, `ACTIVE`, `BLOCKED`, `HOLD`, `DEFERRED`, `OWNER_SELECTION_REQUIRED`, `SUPERSEDED`, `CLOSED`.

Every current obligation must use exactly one state from that vocabulary. A numbered registry may additionally publish a `states` field; when present it must match the closed P02 vocabulary exactly. Absence of that optional convenience field does not weaken the vocabulary because the qualifier and current-registry enforcer validate every current obligation state fail-closed.

P02 answers what obligations currently exist, who owns them, what state each is in and which estate-level objectives are selected. It does not itself execute, schedule or complete work.

## 2. Ingress routes

Changes enter through owner-authorized governance mutations admitted by the repository control plane. P00 must select a numbered obligation registry before it is current authority.

No product executor, ingress consumer, Second Shift worker or lane runtime may rewrite the registry as an incidental side effect of executing an obligation. Changes to obligation identity, ownership, state, central selection or acceptance semantics are governance mutations and require the corresponding owner authority.

## 3. Egress routes

Current consumers include:

- `.github/scripts/current-obligation-registry-enforce.js` — fail-closed validation against current topology, program-job locks, completion state, retirement and objective selectors;
- `.github/scripts/validate-governance.js` — schema and cross-file validation;
- `.github/scripts/system-brief.js` and `.github/scripts/lane-brief.js` — current-state/owner-lane rendering;
- A-01 ingress, Second Shift and scheduling components — consumers of admitted eligible work without becoming canonical P02 writers.

`READY` is explicit eligibility consumed by downstream execution machinery; changing an obligation to or from an executable state is an authority-bearing registry mutation, not a runtime default.

## 4. Persistence and canonical writer

The registry is a versioned JSON governance artifact in git. Successor numbered registries supersede prior current selections; prior versions remain immutable historical evidence.

Canonical writer: an owner-authorized governance mutation. Runtime consumers are readers. When the current work graph changes materially, a successor numbered registry is admitted and P00 is repointed; historical numbered registries are not rewritten to simulate current state.

## 5. Dependencies

- **P00** selects the current obligation registry and estate-level objective pointers.
- **P01** supplies the current nine-peer topology and owner boundaries used to validate obligation owners.
- `SYSTEM-PROGRAM-JOB-LOCK-001` and `SYSTEM-COMPLETION-STATUS-002` constrain active/retired jobs and completion truth.
- `current-obligation-registry-enforce.js` and `validate-governance.js` are qualification mechanisms, not semantic owners.

P02 does not require private, native, external-provider, publication or credential authority.

## 6. Failure semantics

**Fail closed on obligation-graph disagreement.** Qualification fails when any of the following is true:

- P00 selects no registry, selects a missing/malformed registry, or registry bindings disagree with current authority;
- obligation IDs are missing/duplicated or the graph is empty;
- any current obligation state falls outside the closed P02 state vocabulary;
- a registry-level `states` declaration exists but disagrees with the closed P02 vocabulary;
- current obligation ownership is invalid, retired, or conflicts with Topology 007/job-lock authority;
- an open obligation lacks its required objective;
- the selected central or highest-discretionary objective is absent or disagrees with P00;
- the central objective is not owned by an active execution-ready peer;
- PROSE is resurrected as a current execution owner;
- a changed registry, contract, enforcement script, authority pointer, topology/job/completion input or qualification workflow is used with an older P02 PASS.

## 7. Evidence target

`.github/workflows/p02-obligation-registry-foundation-qualification.yml` executes the P02 acceptance target and preserves machine-readable `p02-foundation-1.0-evidence`.

The receipt binds `CURRENT-AUTHORITY-005`, the exact authority-selected numbered registry and current obligation count, `SYSTEM_MASTER/CORE`, source commit identity, the accepted state vocabulary, acceptance-log hashes and exact Git blob identities for every repository subject used to qualify P02.

Foundation census completion additionally requires admission of that exact successful receipt into `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`. Contract prose or a green unrelated workflow is not completion evidence.

## 8. Acceptance target

```bash
node .github/scripts/validate-governance.js
node .github/scripts/current-obligation-registry-enforce.js
node .github/scripts/system-brief.js
```

**PASS** only when all three commands return zero on the same source identity and the qualifier additionally proves:

1. current authority is `CURRENT-AUTHORITY-005` and selects an existing numbered `WORK-OBLIGATION-REGISTRY-###.json`;
2. registry identity matches the selected path;
3. the obligation graph is non-empty and all obligation IDs are unique;
4. every current obligation state belongs to the closed eight-state P02 vocabulary, and any explicit registry-level vocabulary matches it exactly;
5. registry topology, program-job-lock and completion-status bindings match current authority;
6. `central_next_objective` is `FOUNDATION-1-0-CLOSURE-001`, exists, is `ACTIVE`, and is owned by `SYSTEM_MASTER/CORE`;
7. `highest_discretionary_objective` is `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001` and exists in the current graph;
8. no current obligation is owned by terminally retired PROSE;
9. exact-subject machine-readable evidence records the selected registry identity, exact current obligation count and subject blobs.

## 9. Authority boundary

**Lane may decide alone (`agent`):** read, render and validate the current obligation graph; execute an already-admitted obligation only within its separate owner/action authority.

**Requires owner/governance authority (`owner`):** add/remove an obligation; change `owner_path`, state, priority, central/highest-discretionary selection, evidence/acceptance semantics or supersession lineage; or admit a successor registry.

P02 qualification proves the current work graph. It does not grant authority to execute external side effects, change another peer's semantic job, or mark work complete without its required evidence.

## 10. Open gaps

P02 remains `ACTIVE_GAP` until a fresh exact-subject qualification receipt for the authority-selected current registry is produced and admitted to the Foundation evidence registry. Historical P02 PASS receipts remain exact-subject evidence and never transfer across registry or authority changes.

<!-- 2026-09-14: non-semantic trigger for fresh current-subject P02 qualification. -->
