# MANUSCRIPT — Foundation Contract 001

**Owner** `SYSTEM_MASTER/BOOK` · **Lane** BOOK · **Effective** <UNSET>
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json`
**Scaffolded** 2026-09-13 from `.github/scripts/scaffold-foundation-contracts.js`

> **This contract is a stub.** Sections 1–8 are the census gap-forcing columns and
> are empty on purpose. A section containing "TBD", a placeholder, or a plausible
> guess counts as unpopulated — the census forbids inferring completion from
> planning volume. Delete this block when all eight are genuinely filled.

## Known from the census

- **Module name:** Manuscript / Book Library
- **Interaction direction:** BOOK_FIRST_CLASS_DURABLE_ARTIFACT_CAPABILITY
- **Census standing:** `CURRENT_CANONICAL_OWNER_CAPABILITY__PARTIAL`
- **Census evidence summary:** P3 Book proves canonical representation, lifecycle/version/author/export machine spine. New canonical content-object creation/version/admission is implemented with hosted PASS on e993806a... but A-01 remains pending; real author/publication authority remains separate.

This is what P6 recorded. It is background, not a populated section.

## Boundary rules touching this module

- BOOK owns authoring and prose semantics; DOCUMENTS owns the artifact mechanics they render into.

Crossing any of these is an `owner` decision, never lane discretion.

## 1. Contract / interface

<!-- What this module promises callers: named operations, inputs, outputs, and what is explicitly not offered. -->

**UNPOPULATED**

## 2. Ingress routes

<!-- Every way work enters. Name the caller, the transport, and the authority that admits it. A route with no named admitting authority is a gap, not a route. -->

**UNPOPULATED**

## 3. Egress routes

<!-- Every way results leave: return values, emitted artifacts, notifications, side effects on other modules. -->

**UNPOPULATED**

## 4. Persistence and canonical writer

<!-- Exactly one component may write each piece of durable state. Name it, name the store, and name what happens to a write arriving from anywhere else. -->

**UNPOPULATED**

## 5. Dependencies

<!-- Modules and shared infrastructure required, and the direction of each. Flag any that cross a boundary rule below. -->

**UNPOPULATED**

## 6. Failure semantics

<!-- What happens when each ingress route fails, a dependency is unavailable, or a write is refused. State fail-closed or fail-open, and justify any fail-open. Include the idempotency rule. -->

**UNPOPULATED**

## 7. Evidence target

<!-- The artifact that proves this module did what it claimed: path, format, required contents. A log line is not evidence. -->

**UNPOPULATED**

## 8. Acceptance target

<!-- The exact command returning PASS or FAIL, and the PASS condition. Must be runnable by someone who did not write the module. -->

**UNPOPULATED**

## 9. Authority boundary

<!-- What this module may decide alone vs. what needs the owner. Mirrors
     governance/DECISION-RIGHTS-001.md, scoped to this module. -->

**UNPOPULATED**

## 10. Open gaps

- Sections 1–9 are unpopulated. This module remains `ACTIVE_GAP` in
  Foundation Closure Census 001 until they are filled.

