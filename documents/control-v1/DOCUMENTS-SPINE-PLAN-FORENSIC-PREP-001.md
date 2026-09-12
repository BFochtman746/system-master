# DOCUMENTS-SPINE-PLAN-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS CAPABILITY MATRIX COMPLETE / NO RUNTIME MUTATION**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0008` — PLAN  
Live-base revalidated before mutation: `documents/control-v1@376dbfc5b5d33ebcdcca4a2d7768d033f9d63f24`  
Parent design lock: `DOCUMENTS-SPINE-UNDERSTAND-DESIGN-LOCK-001`  
Historical recovered source inspected: `documents/r4-current-capability-ledger-admission-007@dbea54620c6d3b6479f64d981b6ff3c8b4cdf01f`

## 1. Scope and authority

PLAN converts admitted document intent plus exact source/UNDERSTAND evidence into a bounded, capability-constrained document execution plan. It selects document targets, operation semantics, preservation expectations, loss declarations and required proof gates. It does not execute mutations and does not authorize consequential effects by itself.

This packet recovers and inventories the historical planning substrate without modifying runtime bytes. Documents owns document-operation planning mechanics; Core retains shared policy/effect authority, and Book/Learning/Programming retain their specialist semantic truth.

## 2. Recovered PLAN path

The recovered `UniversalDocumentSpine.plan(...)` validates an already-created `DocumentSpineExecutionPlan` and then writes the generic PLAN stage receipt.

Current checks include:

- plan `jobId` must equal job `jobId`;
- plan mode must equal job mode;
- every plan capability id must already be bound to the job;
- when an operation exists, its source artifact SHA must equal the exact source SHA;
- when an operation exists, its source semantic SHA must equal the current CDG-2 semantic digest;
- effectful plans require at least one target element id;
- every target id must exist in the current CDG-2 graph;
- the receipt records plan digest, mode, sorted capabilities, and operation intent digest or `READ_ONLY`.

This is useful validation substrate but not yet a complete PLAN authority contract under the new build standard.

## 3. Recovered immutable execution-plan substrate

`DocumentSpineExecutionPlan` is immutable and contains:

- `jobId`;
- `mode`;
- optional `DocumentOperationContract`;
- target CDG element ids;
- capability ids;
- declared limitations.

Its constructor enforces:

- effectful `MASTER` / `REBUILD` modes require an operation;
- `READ` / `EXTRACT` modes cannot carry a mutation operation;
- capability ids are mandatory;
- target/capability/limitation collections are copied immutably.

Its digest binds job id, mode, operation intent digest or read-only marker, sorted target ids, sorted capability ids and sorted declared limitations.

## 4. Recovered operation-contract substrate

`DocumentOperationContract` (`DOC-OP-1`) already carries strong document-local mutation intent:

- exact source artifact SHA;
- exact source semantic SHA;
- operation type;
- selectors;
- intended effect;
- parameters;
- risk class;
- rollback artifact SHA where required;
- expected changed native parts;
- visual-impact class;
- explicit lossy allowance + declared losses;
- final-candidate standing;
- required proof gates.

The constructor enforces several important fail-closed invariants:

- effectful operations require rollback artifact identity;
- read-only operations cannot carry rollback state;
- lossy transforms require explicit loss allowance and declared losses;
- declared losses are forbidden unless loss is allowed;
- effectful operations require an expected native-part change set;
- blanket native-part `*` is forbidden;
- only safe exact/trailing-wildcard native-part patterns are accepted;
- effectful operations automatically require package, semantic, security and provenance proof gates;
- visual-impact operations require rendered proof;
- final candidates require all proof gates.

This substrate should be preserved and rebound rather than rewritten without cause.

## 5. UNDERSTAND-to-PLAN authority handoff

The new UNDERSTAND design introduces explicit semantic claim authority and standing. PLAN must consume that standing without promoting it.

Rules required by the handoff:

- a plan may target only source/CDG elements supported by exact admitted source/UNDERSTAND evidence;
- `SOURCE_OBSERVED` or deterministic-derived evidence may support deterministic targeting within the declared operation contract;
- heuristic/model-inferred claims cannot silently become source/native truth;
- `PROVISIONAL_UNKNOWN_FEATURE`, `AMBIGUOUS`, `ENGINE_DISAGREEMENT`, `REVIEW_REQUIRED`, `BOUNDS_EXCEEDED` or material `PARTIAL` standing must either block the affected operation or appear as an explicit admitted limitation under a policy that permits the exact risk;
- the plan must bind the exact `DocumentUnderstandingReceipt v1` or explicitly declare why a read-only/no-understanding path is sufficient;
- no plan may erase upstream omission/loss/unknown-feature evidence.

## 6. Capability and ownership fence

Job-bound `capabilityIds` are necessary but not sufficient. PLAN must distinguish:

- **document capability availability** — the exact Documents-owned operation is implemented/qualified;
- **semantic applicability** — the operation is valid for the exact source/target/evidence;
- **effect authorization** — shared Core/policy authority permits the consequence;
- **external/native authority** — separately admitted when a provider/native engine is required.

A plan may express a requested capability but cannot grant itself authority merely by naming the capability id.

PLAN must not create or infer Book manuscript/editorial decisions, Learning curriculum/mastery decisions, Programming execution policy or Core authorization truth.

## 7. Target-selection law

Every effectful plan target must be stable and source-accountable.

At minimum:

- target CDG element ids must resolve against the exact current graph;
- selectors in the operation contract must resolve to the same admitted target set or a deterministic documented superset/subset rule;
- target native anchors must remain source-bound;
- targeting an unmodeled native feature must remain blocked by `OpenWorldFeatureDiscovery` loss-gate logic unless exact newly qualified support exists;
- stale target ids after source/PARSE/UNDERSTAND change invalidate the plan;
- mutable UI/chat references, filenames or ordinal positions cannot be target authority without resolution to immutable source-bound ids.

## 8. Loss and preservation law

PLAN is the last pre-effect stage that can fail closed on known loss before mutation begins.

Rules:

- upstream EXTRACT/UNDERSTAND omissions and unknown-feature limitations must be considered when material to the requested operation;
- `lossyAllowed=false` forbids a plan whose demonstrated execution requires known semantic/native loss;
- `lossyAllowed=true` requires exact declared losses and an allowed risk/policy boundary; it is not blanket permission for unknown loss;
- expected changed native parts must be the smallest justified bounded set;
- preserved unknown/unmodeled parts remain protected outside that set;
- rollback identity must bind the exact source/candidate lineage required by the operation contract;
- a plan cannot weaken required proof gates to accommodate an unsupported operation.

## 9. Recovered PLAN digest strengths and gaps

The existing plan digest is deterministic and includes mode, operation intent, targets, capabilities and declared limitations. This is useful.

Missing from the current reusable authority identity are explicit bindings to:

- current `DocumentUnderstandingReceipt v1`;
- exact capability-descriptor/qualification revisions;
- target-resolution result and source-anchor evidence;
- planning ruleset/implementation identity;
- effect/policy decision reference when required;
- external/native provider/engine prerequisite receipts when required;
- exact proof profile/version beyond the operation contract's gate set.

These should be added by a durable PLAN receipt/envelope without discarding the existing operation intent digest.

## 10. Lossless requirement / invariant matrix

| # | Requirement / invariant | Recovered substrate | Durable state / evidence | Interface / contract | Standing | Gap / blocker |
|---|---|---|---|---|---|---|
| 1 | job identity binds plan | exact equality check | stage receipt + plan digest | `plan(...)` | COVERED | none portable |
| 2 | job mode binds plan | exact equality check | plan | execution-plan record | COVERED | none portable |
| 3 | effectful modes require operation | execution-plan constructor | immutable plan | `DocumentSpineExecutionPlan` | COVERED | none portable |
| 4 | read/extract cannot carry mutation | constructor | immutable plan | execution-plan record | COVERED | none portable |
| 5 | source SHA binds operation | exact check | operation contract | `DOC-OP-1` | COVERED | none portable |
| 6 | source semantic SHA binds operation | exact CDG digest check | operation contract | `DOC-OP-1` | COVERED | UNDERSTAND receipt not yet bound |
| 7 | UNDERSTAND receipt/standing binds plan | no current field/check | none | none | MISSING | must bind new UDM-SPINE-0007 product |
| 8 | effectful target set non-empty | runtime check | plan | `plan(...)` | COVERED | none portable |
| 9 | all targets resolve against exact graph | `requireElement` | no target-resolution receipt | CDG | PARTIAL | durable target-resolution evidence needed |
| 10 | selectors and target ids cannot conflict | both exist | operation + plan | separate fields | MISSING | reconciliation law required |
| 11 | target native anchors remain source-bound | CDG carries anchors | graph evidence | CDG | PARTIAL | plan receipt should bind target evidence digest |
| 12 | unmodeled native features remain loss-gated | OpenWorld loss gate exists | separate substrate | discovery API | PARTIAL | PLAN does not currently invoke/bind it |
| 13 | capability ids must be job-bound | subset check | plan/job | `plan(...)` | COVERED | availability/qualification revision not bound |
| 14 | naming capability id cannot self-authorize | no explicit rule | none | governance only | MISSING EXPLICIT LAW | freeze authority separation |
| 15 | operation type is explicit | enum | operation contract | `DOC-OP-1` | COVERED | none portable |
| 16 | intended effect is non-empty | constructor | operation contract | `DOC-OP-1` | COVERED | no external policy reference |
| 17 | risk class is explicit | enum | operation contract | `DOC-OP-1` | COVERED | shared policy/effect authority separate |
| 18 | effectful operation has rollback identity | constructor | operation contract | `DOC-OP-1` | COVERED | exact rollback availability not reverified by PLAN |
| 19 | expected changed native parts are bounded | required + wildcard restrictions | operation contract | `DOC-OP-1` | COVERED | semantic sufficiency not proven by pattern alone |
| 20 | lossy transformation is explicit | constructor invariants | operation contract | `DOC-OP-1` | COVERED | unknown/unmodeled loss must remain separately fenced |
| 21 | visual impact is explicit | enum | operation contract | `DOC-OP-1` | COVERED | none portable |
| 22 | proof gates derive from effect/visual/final standing | normalization logic | operation contract | proof-gate set | COVERED | exact proof profile/version not bound |
| 23 | plan digest deterministic | sorted identity material | plan digest | `digest()` | COVERED | new authority inputs must extend identity |
| 24 | declared limitations are durable | included in plan/digest | plan | execution-plan record | COVERED | limitation taxonomy not stable/machine-readable |
| 25 | mutable chat/UI metadata cannot become target/semantic authority | no explicit runtime contract | none | none | MISSING | immutable resolution law required |
| 26 | effect authorization is separate from planning | later mutation path/governance separate | no PLAN decision ref | architecture | PARTIAL | explicit non-authorizing plan receipt required |
| 27 | external/native prerequisite cannot silently execute | upstream fences exist | separate evidence | ports | PARTIAL | PLAN should carry prerequisites, not invoke them |
| 28 | historical PASS does not transfer to current reconstructed subject | governance requires exact subject | governance | qualification | COVERED GOVERNANCE | exact R4 source custody still blocked |

Result: **28/28 bounded PLAN invariants accounted; 0 unaccounted rows.** This is forensic accounting, not runtime completion.

## 11. Central recovered design defects

The recovered PLAN path is stronger than a free-form planner, but six gaps remain material:

1. the plan predates the explicit UNDERSTAND receipt and therefore cannot bind semantic standing/claim evidence;
2. selectors and explicit target ids are not durably reconciled into one target-resolution authority record;
3. capability ids are checked against the job but exact capability qualification/version standing is not bound;
4. planning ruleset/implementation identity is absent from reusable plan authority;
5. operation loss/preservation expectations do not explicitly consume upstream unknown/omission limitations;
6. PLAN has no durable explicit statement that it is intent/planning evidence rather than consequential-effect authorization.

The repair should preserve `DocumentSpineExecutionPlan` and `DocumentOperationContract` semantics while adding an immutable source/UNDERSTAND/capability-bound planning receipt.

## 12. Required durable product

The design-lock successor should freeze `DocumentPlanReceipt v1` containing at minimum:

- exact source/identity/PARSE/UNDERSTAND receipt identities;
- optional EXTRACT evidence refs as inherited through UNDERSTAND;
- job id and mode;
- exact operation intent digest or read-only marker;
- resolved target set + target-resolution digest;
- source-anchor evidence digest for targets;
- capability ids + exact capability descriptor/qualification refs;
- planning profile/ruleset/implementation identity;
- risk/visual/loss/preservation standing;
- expected changed native-part patterns;
- rollback evidence ref when effectful;
- required proof profile/gates;
- explicit blocked prerequisites for external/native/human authority;
- explicit non-authorizing standing for consequential effects;
- plan standing + stable reason classes;
- receipt digest.

## 13. Qualification implications

Future isolated qualification must prove at minimum:

- job/mode/source/semantic/UNDERSTAND mismatches fail;
- effectful vs read-only operation-mode rules remain intact;
- stale target ids fail;
- selector/target reconciliation is deterministic and fail-closed;
- unmodeled-native targeting remains blocked;
- capability not bound to job fails;
- capability revision/qualification mismatch invalidates reuse;
- plan cannot grant itself effect authority;
- lossy operations require exact declared known losses and cannot hide unknown loss;
- expected changed native-part set cannot use blanket wildcard or escape patterns;
- required proof gates cannot be weakened;
- rollback evidence is exact and available where required;
- upstream `AMBIGUOUS` / `REVIEW_REQUIRED` / unknown limitations block or remain explicit under an admitted policy;
- deterministic plan identity reproduces on exact inputs;
- mutable chat/UI/file-name metadata cannot become canonical targeting authority;
- no hidden external/native execution occurs in PLAN;
- owner-boundary negative cases keep Book/Learning/Programming/Core specialist semantics out;
- cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND -> PLAN evidence and authority boundaries remain intact.

The exact isolated case count should be frozen only after case-by-case design enumeration.

## 14. Current blockers and non-claims

Runtime implementation remains custody-gated with the reconstructed spine. Exact R4 canonical source bytes are still not established in current GitHub-native custody and fresh current-subject baseline qualification has not run.

This packet does not claim:

- implementation of `DocumentPlanReceipt v1`;
- current exact-subject PASS;
- effect/policy authorization;
- real rollback execution;
- native Office/PDF-engine proof;
- external-provider/human authority;
- A-01 PASS;
- publication or production readiness.

## 15. Adjudication

Reuse the recovered immutable execution-plan and `DOC-OP-1` operation-contract substrate. Add the missing UNDERSTAND/capability/target-resolution/planning-ruleset authority envelope and explicitly keep effect authorization downstream/outside PLAN.

## Exact next operation

`DOCUMENTS-SPINE-PLAN-DESIGN-LOCK-001 — FREEZE DOCUMENT PLAN RECEIPT V1 + UNDERSTAND/OPERATION/CAPABILITY BINDING + TARGET-RESOLUTION AUTHORITY + LOSS/PRESERVATION PRECONDITIONS + EFFECT-AUTHORIZATION FENCE + EXPLICIT ISOLATED QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
