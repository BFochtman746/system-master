# P01 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P01 System topology and ownership allocation · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`)
**Topology** `governance/SYSTEM-TOPOLOGY-007.json`
**Owner allocation** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`

## 1. Contract / interface

P01 defines the canonical System Master ownership shape through two current artifacts selected by P00:

- `SYSTEM-TOPOLOGY-007` declares the product root and exactly nine active peer systems: CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.
- `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006` maps 36 owned module keys to their canonical owner paths, records five explicitly deferred modules, and preserves the cross-lane boundary rules.

Website Building is C40 under PROGRAMMING and is not a peer system. PROSE is historically complete and terminally retired and has no active execution lane.

P01 offers canonical answers to “what active systems exist?” and “who owns this module?” It does not claim implementation completion for an owner or capability.

## 2. Ingress routes

Changes enter through owner-authorized repository governance mutations admitted by the current control plane. P00 must select the topology and owner-allocation artifacts before they are current authority.

No product/runtime component may create a peer system, reassign module ownership, resurrect PROSE, or alter an authority boundary as an incidental side effect.

## 3. Egress routes

P01 is consumed by topology validation, lane briefs, Foundation closure, Second Shift owner coverage, obligation routing, governance validation and system-state reconciliation.

A current ownership change therefore changes routing and lane scope only after the corresponding authority/topology/allocation artifacts are admitted together. Consumers must resolve the current files through P00 rather than hard-code an older numbered artifact.

## 4. Persistence and canonical writer

Topology and owner allocation are durable versioned JSON governance artifacts in git. New versions supersede prior numbered records; historical records remain immutable evidence.

Canonical writer: an owner-authorized governance change. `governance/CURRENT-AUTHORITY.json` is repointed to the new version in the same admitted architecture transition. Automated validators and qualification workflows are readers only.

## 5. Dependencies

- **P00** — selects the current topology and owner-allocation records.
- **P05** — validates current governance schemas and pointer coherence.
- `validate-system-topology.js` — enforces topology, retirement, readiness and ownership invariants across current governance state.
- `lane-brief.js` — proves the current allocation can be resolved into executable owner lanes without a hand-maintained ownership copy.

P01 has no private, native, publication, credential or external-provider dependency.

## 6. Failure semantics

**Fail closed on topology or ownership disagreement.**

- Missing/malformed current topology or owner allocation → qualification fails.
- Topology peer set differs from the execution-readiness partition → topology validation fails.
- Duplicate system IDs, duplicate module keys, missing owners or invalid owner paths → qualification fails.
- An owned module resolving to a lane outside the nine active peers → qualification fails.
- PROSE appearing as an active peer/lane → qualification fails.
- Current lane briefs not resolving exactly nine owner lanes covering exactly 36 owned modules → qualification fails.
- A changed topology, allocation, contract, validator, lane renderer or qualification workflow invalidates prior P01 PASS until fresh exact-subject evidence is produced.

There is no fallback to historical P6 ownership for current authority.

## 7. Evidence target

`.github/workflows/p01-topology-ownership-foundation-qualification.yml` must execute the P01 acceptance target and preserve machine-readable `p01-foundation-1.0-evidence`.

The receipt binds `CURRENT-AUTHORITY-005`, `SYSTEM_MASTER/CORE`, source commit identity, PASS, acceptance-log hashes, and exact Git blob identities for the current authority pointer, P01 contract, Topology 007, Allocation 006, the validating/rendering scripts and the qualification workflow.

Foundation census completion additionally requires admission of that exact successful receipt into `governance/census/FOUNDATION-CLOSURE-EVIDENCE-REGISTRY-001.json`. Contract prose alone is not completion evidence.

## 8. Acceptance target

```bash
node .github/scripts/validate-governance.js
node .github/scripts/validate-system-topology.js
node .github/scripts/lane-brief.js --list
```

**PASS** only when all commands return zero on the same source identity and the qualifier additionally proves:

1. current authority is `CURRENT-AUTHORITY-005`;
2. current topology is `SYSTEM-TOPOLOGY-007`;
3. current allocation is `SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006`;
4. topology declares exactly the nine active peers and excludes PROSE from active peers;
5. allocation contains exactly 36 unique owned module keys;
6. all 36 owned modules resolve to those nine peer owner lanes;
7. lane-brief `--list` renders those same nine lanes with a total of 36 modules;
8. exact-subject machine-readable evidence is emitted.

Historical verification against Topology 006 or Allocation 005 does not satisfy this acceptance target.

## 9. Authority boundary

**Lane may decide alone (`agent`):** read, validate, render and qualify the current topology/allocation without changing ownership semantics.

**Requires owner/human-authorized governance change (`owner`):** admitting/retiring a peer, changing module ownership, changing deferred disposition, changing execution-readiness classification, amending cross-lane boundary rules, or modifying product-root/peer hierarchy.

Qualification proves the current ownership model; it does not grant authority to change that model.

## 10. Open gaps

P01 remains `ACTIVE_GAP` until a fresh exact-subject `CURRENT-AUTHORITY-005` qualification receipt is produced and admitted to the Foundation evidence registry.
