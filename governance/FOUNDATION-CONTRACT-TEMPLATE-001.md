# Foundation Contract Template — 001

**Effective** 2026-09-13 · **Current authority** `governance/CURRENT-AUTHORITY.json` · **Ownership allocation** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json` · Satisfies Foundation Closure Census 001 scope areas 3–10

The closure matrix uses the canonical capability crosswalk to determine what is owned and what foundation-contract fields remain unproved. A registered owner is a precondition, not evidence of implementation: the contract must still state how the capability routes, who writes canonical state, how it fails, what evidence it emits and what exact acceptance target proves it.

The current capability identifier/owner source is `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`. Historical allocations and proposals remain provenance only when they conflict with current Authority-005 / Topology-007 ownership.

**One file per owned capability/module**, at `governance/contracts/<MODULE_KEY>-FOUNDATION-CONTRACT-001.md`.
A matrix state cannot leave an active gap merely because the contract file exists. All gap-forcing sections must be populated with current owner-valid semantics. Writing `TBD` leaves the section unproved.

Work order comes from the current obligation registry, dependency graph and foundation-closure matrix. Do not use a historical lane count or pre-Programming-admission allocation to choose ownership or priority.

---

## Template — copy below this line

```markdown
# <MODULE_KEY> — Foundation Contract 001

**Capability** <C-ID> · **Owner** <SYSTEM_MASTER/LANE> · **Effective** <YYYY-MM-DD>
**Authority** governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json
**Capability crosswalk** governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json

## 1. Contract / interface
What this module promises to callers. Name operations, inputs and outputs, and what is explicitly not offered. If another lane must call it, this is the only section they should need to read.

## 2. Ingress routes
Every way work enters. Name the caller, transport and authority that admits it. A route with no named admitting authority is a gap, not a route.

## 3. Egress routes
Every way results leave — return values, emitted artifacts, notifications and side effects on other modules. If this module can change another module's state, name the admitted interface and authority; service use does not silently transfer ownership.

## 4. Persistence and canonical writer
Exactly one authority owns each piece of durable canonical state. Name the writer, store and rejection behavior for unauthorized writes. Shared storage or runtime service consumption does not transfer semantic ownership.

## 5. Dependencies
Modules and shared infrastructure this capability requires, and the direction of each. Note any cross-owner boundary and the current admitted interface/authority. Missing authority remains a gap.

## 6. Failure semantics
What happens when each ingress route fails, a dependency is unavailable or a write is refused. State fail-closed/fail-open behavior and justify any fail-open path. Include retry, idempotency/deduplication and stale-owner/live-head behavior where applicable.

## 7. Evidence target
The durable artifact that proves this capability did what it claimed — path, format, subject identity and required contents. A log line alone is not evidence. Historical receipts remain bound to their original subject and are never relabeled.

## 8. Acceptance target
The exact command/workflow that returns PASS or FAIL and the condition for PASS. It must be runnable/reviewable independently. No PASS transfers across changed SHA, topology, ownership, readiness or qualification subject.

## 9. Authority boundary
What this capability may decide alone and what remains owner/human/private/native/external/provider/publication/production/user-action authority. Mirrors `governance/DECISION-RIGHTS-001.md`, scoped to this capability.

## 10. Open gaps
Anything in sections 1–9 not yet true. Each becomes an unresolved successor. An empty section is allowed only when current evidence proves there is genuinely no remaining gap.
```

---

## Current architecture guardrails

- Current active peers are CORE, LEARNING, BOOK, DOCUMENTS, SPREADSHEET_DATA, MEDIA, CONNECTED_ACTIONS, RESEARCH_KNOWLEDGE and PROGRAMMING.
- PROSE is historically complete and terminally retired; no new foundation contract may recreate a Prose execution domain.
- Any genuinely open integration of preserved completed Prose capability is BOOK-owned changed work; DOCUMENTS receives no Prose work.
- PROGRAMMING owns AUTOMATION, CODE and WEBSITE_BUILDING C40.
- WEBSITE_BUILDING is a PROGRAMMING capability, not a tenth peer; its browser/external side effects remain under separately admitted CONNECTED_ACTIONS/user/provider authority.
- Platform requirements P00–P15 are dependencies/shared requirements, not peer systems.
- Reserved capability IDs remain reserved unless explicit current authority allocates them.

## Worked example — the shape to aim for

The following illustrates specificity; it is not an ownership change or implementation claim.

> **4. Persistence and canonical writer**
> The artifact index at `control-gateway/state/artifacts.sqlite` is written only by the admitted artifact writer. No other component opens that database for unauthorized write. A write arriving outside the admitted path is rejected and recorded. Readers use the read-only path; a read path that needs a write is a design defect, not a case to normalize.
>
> **6. Failure semantics**
> Fail closed on unavailable canonical store or digest mismatch. Do not return mismatched bytes. Idempotency binds repeat ingest to stable content identity so retries do not create duplicate canonical effects.
>
> **8. Acceptance target**
> Name an exact command and explicit PASS boundary, including unauthorized-write rejection, integrity failure behavior and idempotent repeat behavior where relevant.

## Why the acceptance target matters

Sections 1–5 describe intended behavior. Section 8 converts that intent into an objective proof boundary. Foundation closure cannot be inferred from planning volume, file existence or owner registration; it requires current evidence against the exact admitted subject.
