# Capability Crosswalk — Proposal 001

**Status: RECOMMENDATION ONLY.** Nothing here is authoritative until ratified and written
into the catalog. Same pattern as the Owner Decision Pack: I did the derivation, you
ratify or amend.

## The problem this resolves

Foundation Closure Census 001 declares its scope as *"all canonical foundational
requirements and capability crosswalk entries including C00-C49 and P00-P15."* Those 66
identifiers appear in exactly one file on this ref: the census specification itself.
Nothing defines what C00 or P15 is.

As written, **the census can never close**, because it is scoped to a register that was
never authored. That is not a gap in the work — it is a gap in the standard the work is
measured against, which is worse, because it makes the measurement meaningless rather
than merely incomplete.

Two ways out. This document proposes the first.

**Option A — author the crosswalk (proposed).** Define the 66 entries from what the
estate already contains. Census scope becomes satisfiable; the matrix gains a stable
identifier space that survives module renames.

**Option B — amend the census scope.** Strike the crosswalk clause and scope the census
to the 40 censused modules plus the shared infrastructure. Cheaper, honest, and loses the
stable identifier space. Legitimate if you decide the crosswalk was aspirational.

Do not take Option C, which is to leave it as-is. A standard nobody can satisfy stops
being a standard and becomes a reason to ignore the census.

---

## C00–C49 — Capability entries

C00–C34 are the 35 owned modules in allocation order. C35–C39 are the five explicitly
deferred. C40–C49 are reserved so future modules get identifiers without renumbering —
the renumbering is what would break every contract cross-reference.

| ID | Module | Owner lane |
|---|---|---|
| C00 | AUDIOBOOK | MEDIA |
| C01 | AUTOMATION | PROGRAMMING |
| C02 | BROWSER | CONNECTED_ACTIONS |
| C03 | CALENDAR | CONNECTED_ACTIONS |
| C04 | CHAT | CORE |
| C05 | CODE | PROGRAMMING |
| C06 | COMMS | CONNECTED_ACTIONS |
| C07 | CURRICULUM | LEARNING |
| C08 | DATA | SPREADSHEET_DATA |
| C09 | DOCX | DOCUMENTS |
| C10 | EXCEL | SPREADSHEET_DATA |
| C11 | EXPECTATION | CORE |
| C12 | EXPERIENCE | CORE |
| C13 | FILE | DOCUMENTS |
| C14 | GEO | RESEARCH_KNOWLEDGE |
| C15 | IMAGE | MEDIA |
| C16 | IMG-INGEST | DOCUMENTS |
| C17 | KNOWLEDGE | RESEARCH_KNOWLEDGE |
| C18 | LEARNING | LEARNING |
| C19 | LEDGER | SPREADSHEET_DATA |
| C20 | LOCALAI | CORE |
| C21 | MANUSCRIPT | BOOK |
| C22 | MATH | SPREADSHEET_DATA |
| C23 | MEDIA | MEDIA |
| C24 | OCR | DOCUMENTS |
| C25 | PDF | DOCUMENTS |
| C26 | PHOTO | MEDIA |
| C27 | PLUGINS | CONNECTED_ACTIONS |
| C28 | PPTX | DOCUMENTS |
| C29 | PROJECTS | CORE |
| C30 | RESEARCH | RESEARCH_KNOWLEDGE |
| C31 | STORYBIBLE | BOOK |
| C32 | VIDEO | MEDIA |
| C33 | VOICE | MEDIA |
| C34 | WRITING | BOOK |
| C35 | AIINCOME | deferred until Foundation 1.0 closure |
| C36 | CAD | deferred — headless interop only |
| C37 | PHONEOPS | deferred — absorbed into experience/automation |
| C38 | PHYSICALAI | deferred — optional |
| C39 | PORTFOLIO | deferred until Foundation 1.0 closure |
| C40–C49 | *reserved* | unallocated, for future admission |

## P00–P15 — Platform requirements

Not modules. These are the shared foundations every module depends on, drawn from what
the repository actually runs. Each needs the same foundation contract as a module, and
each is `ACTIVE_GAP` until it has one. P00–P05 are the ones every other entry depends on;
they come first.

| ID | Platform requirement | Present in repo as |
|---|---|---|
| P00 | Authority pointer of record | `governance/CURRENT-AUTHORITY.json` + validator |
| P01 | System topology and ownership allocation | `SYSTEM-TOPOLOGY-006`, `TOOL-OWNER-ALLOCATION-005` |
| P02 | Work obligation registry | `WORK-OBLIGATION-REGISTRY-013` |
| P03 | Evidence store and retention | Actions artifacts; **no local A-01 policy — gap** |
| P04 | Content-addressed authority writes | `control-gateway-authority-bootstrap` CAS |
| P05 | Governance schema validation | `governance/schemas/` + `validate-governance.js` |
| P06 | Control gateway dispatch and admission | `a01-control-plane-gateway`, dispatch bridge |
| P07 | A-01 admission barrier | `.github/scripts/a01-admission-barrier.js` |
| P08 | Qualification execution and PASS semantics | A-01 registered qualification |
| P09 | Repair broker and durable repair lineage | repair ledger, `repair_transaction_id` |
| P10 | Second-shift supervisor: lanes, leases, fencing | `tools/second_shift_supervisor_v2.py` |
| P11 | Night scheduler and claim authority | `a01_night_scheduler.py` |
| P12 | GitHub → A-01 ingress transport | `a01_github_ingress.py`, `a01_ingress_service.py` |
| P13 | Model routing and local inference | LOCALAI under CORE; **contract absent — gap** |
| P14 | Connector action runtime | CORE-owned; policy split to CONNECTED_ACTIONS |
| P15 | Observability, morning receipt, rollback | **absent — gap** |

## What ratifying this does

- Census scope area 1 gains a source artifact. `scope_uncovered` drops from 9 to 8.
- The matrix gains a stable identifier space: a module rename no longer orphans its
  history, because the C-ID persists.
- **P03, P13 and P15 become tracked gaps** rather than things nobody had written down.
  P15 in particular covers the morning receipt and the rollback procedure — both real
  holes I have flagged repeatedly and neither of which appears anywhere in your registers
  today.
- Total foundation surface becomes 35 modules + 16 platform requirements = **51 contracts
  owed**, not 35. That number will feel worse. It is the honest one, and it is the first
  time the platform layer has been counted at all.

## What it does not do

Zero modules move to `COMPLETE_WITH_EVIDENCE`. Identifiers are not evidence. This makes
the census satisfiable; the contracts are still the work.

## Write-back if ratified

1. `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json` — machine-readable,
   both tables.
2. `governance/CURRENT-AUTHORITY.json` — add `capability_crosswalk` pointer.
3. Add a `capability_id` field to each foundation contract stub.
4. Extend `foundation-closure-matrix.js` to census P00–P15 alongside the modules.
5. Re-run the matrix. Expect total entries 40 → 56, gaps 33 → roughly 46.

That last line is the point. The number goes up because the measurement got honest, and a
count that only ever improves was never measuring anything.
