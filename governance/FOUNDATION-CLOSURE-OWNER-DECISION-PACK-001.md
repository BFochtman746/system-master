# Foundation Closure — Owner Decision Pack 001

**Purpose.** Foundation Closure Census 001 reports 35 ACTIVE_GAPs, of which 27 are
"no canonical owner registered." Owner registration is an authority decision, not
engineering work, so no amount of building closes them. This pack converts those 27
open module decisions into **7 decisions you can ratify in one sitting.**

**Status of this document.** RECOMMENDATION ONLY. Nothing here is authoritative until
you accept it and it is written into the catalog and topology. Every recommendation is
derived from artifacts already in this repository — principally
`SYSTEM-MASTER-SYSTEM-CATALOG-003.json` (`future_system_candidates`),
`SYSTEM-COMPLETION-STATUS-001.json` (system job statements), and the P6 allocation.
Nothing is invented.

**Method.** Your catalog already declares 7 `future_system_candidates`. Four of them,
if admitted as peers, absorb 17 unowned modules at a stroke. Two existing systems
absorb 8 more under job statements they already hold. That is the whole trick: you do
not need 27 owners, you need to admit candidates you already wrote down.

---

## Decision 1 — DOCUMENTS absorbs the document tool cluster

**Modules (6):** DOCX, PDF, PPTX, OCR, FILE, IMG-INGEST

**Recommendation: YES.** No new system required.

DOCUMENTS already exists as an active peer, and its job statement in
`SYSTEM-COMPLETION-STATUS-001.json` reads: *"DOCX/PDF/PPTX/document artifact mechanics,
conversion, preservation, rendering and export."* These six modules are that job. OCR,
FILE and IMG-INGEST are ingestion and artifact-handling primitives for the same
pipeline. Registering them elsewhere would split one pipeline across two owners.

**Boundary to state explicitly:** DOCUMENTS owns artifact *mechanics*. It does not own
authoring semantics — see Decision 6.

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 2 — Admit SPREADSHEET_DATA as a peer system

**Modules (4):** EXCEL, MATH, DATA, LEDGER

**Recommendation: YES, admit as peer.**

Already declared in your catalog as `SPREADSHEET_DATA` (Spreadsheet / Math / Data
System Candidate, `CANDIDATE_REVIEW_REQUIRED`). You also already hold
`HEADLESS-COMPUTE-DATA-SPREADSHEET-CONTRACT-001` on HOLD in the obligation registry —
the contract is written and waiting for an owner to bind it to.

DATA currently carries a split disposition (`CORE_FOR_SHARED_DATA_FOUNDATION__PRODUCT_BI_SEMANTICS_REQUIRE_OWNER_DECISION`).
Recommended resolution: **CORE keeps the shared data foundation; SPREADSHEET_DATA owns
product BI/analysis semantics.** That is the boundary the disposition is asking you to
draw. LEDGER (currently `OWNER_SELECTION_REQUIRED`) is financial-record semantics over
the same data primitives and belongs here rather than in CORE.

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 3 — Admit MEDIA as a peer system

**Modules (6):** AUDIOBOOK, IMAGE, MEDIA, PHOTO, VIDEO, VOICE

**Recommendation: YES, admit as peer.**

Already declared as candidate `MEDIA`. `HEADLESS-MEDIA-CAPABILITY-CONTRACT-001` is
already on HOLD awaiting it. All six modules currently sit in
`OWNER_REGISTRATION_REQUIRED__MEDIA_TOOL_PORTFOLIO` — the portfolio exists, it just has
no registered owner.

**Sequencing note:** this cluster is the least entangled with Foundation 1.0. Admit it,
then leave it dormant until CORE closes. Admission is cheap; building it now is not.

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 4 — Admit CONNECTED_ACTIONS as a peer system

**Modules (4):** BROWSER, CALENDAR, COMMS, PLUGINS

**Recommendation: YES, admit as peer — with a hard authority boundary.**

Already declared as candidate `CONNECTED_ACTIONS`.
`HEADLESS-CONNECTED-ACTION-AUTHORITY-CONTRACT-001` is on HOLD awaiting it.

PLUGINS currently sits in
`SYSTEM_MASTER/CORE_SHARED_TOOL_CONNECTOR_INFRASTRUCTURE_WITH_MODULE_POLICY_GAP`.
Recommended resolution: **CORE owns the connector runtime; CONNECTED_ACTIONS owns
module policy.** The named "policy gap" is exactly that boundary.

**This is the highest-risk cluster in the estate.** These are the only modules that
take real-world actions — sending mail, booking time, driving a browser. Recommend
admitting it with a standing rule that no CONNECTED_ACTIONS module reaches production
authority before Foundation 1.0 closes.

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 5 — Admit RESEARCH_KNOWLEDGE as a peer system

**Modules (3):** RESEARCH, KNOWLEDGE, GEO

**Recommendation: YES, admit as peer.**

Already declared as candidate `RESEARCH_KNOWLEDGE` (Research / Knowledge / Browser /
Geo System Candidate). `HEADLESS-RESEARCH-KNOWLEDGE-CONTRACT-001` is on HOLD awaiting it.

**Deviation from the candidate definition:** the candidate name includes Browser.
Recommend BROWSER goes to CONNECTED_ACTIONS instead (Decision 4), because browsing is
an *action* with side effects, not a *retrieval* capability. Research consumes browsing;
it should not own it.

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 6 — Resolve the three split-ownership modules

**Modules (3):** WRITING, EXPECTATION, CODE/AUTOMATION

| Module | Current disposition | Recommendation |
|---|---|---|
| WRITING | `COMPOSITE_CAPABILITY__OWNER_BOUNDARY_REQUIRED` | **BOOK** owns authoring/prose semantics; **DOCUMENTS** owns the artifact it renders into. The composite splits cleanly on that line. |
| EXPECTATION | `OWNER_RECONCILIATION_REQUIRED__LIKELY_CORE_CHAT_POLICY` | **CORE.** Your own disposition already says "likely Core chat policy," and `EXPECTATION-REGISTRY-005.json` is already a CORE governance artifact. Confirm it. |
| CODE, AUTOMATION | Headless tool portfolio / core work-execution | **PROGRAMMING.** Already an active non-peer work program with its own lock and system packet. These two are its subject matter. Do not create a separate owner. |

**Ratify:** ☐ accept ☐ modify: ______________________

---

## Decision 7 — Confirm the deferrals

**Modules (5):** CAD, PHONEOPS, PHYSICALAI, AIINCOME, PORTFOLIO

**Recommendation: defer all five, explicitly, with authority.**

| Module | Recommendation |
|---|---|
| CAD | `EXPLICITLY_OUT_OF_SCOPE_WITH_AUTHORITY` — headless interop only, per existing disposition. No dedicated module owed. |
| PHONEOPS | `EXPLICITLY_OUT_OF_SCOPE` — already absorbed into the experience/automation foundation. |
| PHYSICALAI | `EXPLICITLY_OUT_OF_SCOPE` — already `DEFERRED_OPTIONAL`. Confirm rather than revisit. |
| AIINCOME | **Defer until Foundation 1.0 closes.** Declared `OWNER_AND_ARCHITECTURE_DECISION_REQUIRED`. Deciding this now adds a system before the foundation under it exists. |
| PORTFOLIO | **Defer until Foundation 1.0 closes.** Same reasoning. |

The point of an explicit deferral is that it is not a gap. Four allowed states exist
precisely so "we decided not to" is distinguishable from "we forgot."

**Ratify:** ☐ accept ☐ modify: ______________________

---

## What ratifying all seven does

| | Before | After |
|---|---:|---:|
| Modules with no canonical owner | 27 | 0 |
| ACTIVE_GAP modules | 35 | ~18 |
| Peer systems | 4 | 8 |
| Open owner decisions | 27 | 0 |

The remaining ~18 gaps are then genuine engineering gaps — unpopulated contracts,
routes, writers, failure semantics — which *is* work a night shift can be pointed at.
That is the actual unlock: it converts an authority backlog into a build backlog.

## What it does not do

Registering an owner does not implement anything. After ratification every one of these
modules still needs its foundation contract filled — contract, ingress, egress,
canonical writer, dependencies, failure semantics, evidence target, acceptance target.
Ownership is the precondition, not the work.

## Write-back checklist

Once ratified, these files change — and they are the only files that should:

1. `governance/catalog/SYSTEM-MASTER-SYSTEM-CATALOG-004.json` — move admitted candidates
   from `future_system_candidates` to `active_peer_systems`.
2. `governance/SYSTEM-TOPOLOGY-006.json` — add the new peer lanes.
3. `governance/SYSTEM-COMPLETION-STATUS-002.json` — add job statements for each new peer.
4. `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-005.json` — register
   module ownership.
5. `governance/WORK-OBLIGATION-REGISTRY-013.json` — move the four HOLD headless contracts
   to READY, bound to their new owners.
6. `governance/CURRENT-AUTHORITY.json` — repoint to all of the above.

Then re-run `node .github/scripts/foundation-closure-matrix.js --summary` and the gap
count should drop from 35 to roughly 18. If it doesn't, the write-back is incomplete and
the matrix will tell you which module was missed.
