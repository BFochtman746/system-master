# DOCUMENTS-SPINE-REBUILD-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS CAPABILITY MATRIX COMPLETE / NO RUNTIME MUTATION**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0009` — REBUILD  
Live-base revalidated before mutation: `documents/control-v1@2bad66ac64399b06341c81b8169e6ccdea589135`  
Parent design lock: `DOCUMENTS-SPINE-PLAN-DESIGN-LOCK-001`  
Historical recovered source inspected: `documents/r4-current-capability-ledger-admission-007@dbea54620c6d3b6479f64d981b6ff3c8b4cdf01f`

## 1. Scope and authority

REBUILD is the first effectful document-spine stage after PLAN for jobs whose mode is `REBUILD`. It applies an admitted document operation to exact source bytes through a qualified document adapter, independently re-projects and preservation-checks the candidate, persists candidate bytes through the governed artifact gateway, and records an effect-stage receipt so restart can resume without replaying the document mutation.

This packet recovers, inventories and adjudicates that historical substrate only. It does not execute a mutation and does not claim current runtime qualification.

Documents owns document reconstruction/mutation mechanics and candidate artifact semantics. Core/shared policy/effect authority remains separate. Book, Learning and Programming retain specialist semantics. PROSE remains retired from Documents.

## 2. Recovered REBUILD path

The recovered universal spine chooses the effect stage as:

- `REBUILD` when `job.mode() == REBUILD`;
- otherwise `MASTER` for effectful existing-artifact work.

Before mutation, the spine records predecessor action-stage placeholders and creates a stage key from exact job/stage/source identity and `plan.digest()`.

If a prior REBUILD receipt is resumable for the exact key, the path:

1. reads the prior candidate digest from the stage receipt;
2. re-reads candidate bytes through the governed artifact gateway;
3. independently re-projects those bytes to CDG-2;
4. re-runs native-part preservation assessment against the exact source and expected changed parts;
5. refuses resume if preservation no longer passes;
6. returns the verified persisted candidate without replaying the native mutation.

If no resumable candidate exists, the path uses `SemanticCdg2NativeAdapter` through `GovernedCdg2MutationCoordinator.executeOperation(...)`, then persists the resulting candidate through governed artifact intake before recording the REBUILD PASS receipt.

This restart-safe candidate-before-proof shape is valuable substrate and should be retained.

## 3. Recovered governed mutation checks

The recovered `GovernedCdg2MutationCoordinator.executeOperation(...)` already enforces strong document-local integrity rules:

- adapter format must equal source-graph format;
- source bytes SHA must equal source graph SHA;
- source bytes SHA must equal operation source-artifact SHA;
- source graph semantic digest must equal operation source-semantic SHA;
- at least one target is required;
- mutation engine identity is required;
- NODE_ID selectors, when present, must exactly match the supplied target set;
- native parts implicated by targets/selectors/expected changes are checked by open-world loss gating;
- the adapter result must report the exact source digest;
- the adapter result digest must equal independently computed result SHA;
- the result is independently re-projected to CDG-2 and that graph must bind the exact result SHA;
- native-part preservation is independently assessed;
- a finalization evaluation is produced from operation, candidate, preservation, proof receipts and engine identity.

The adapter cannot simply declare its own output authoritative.

## 4. Recovered candidate persistence

After mutation/preservation succeeds, the universal spine creates a governed candidate intake request with:

- candidate artifact identity derived from the result artifact/job;
- exact mutation engine id;
- exact media type;
- exact result SHA and byte length;
- source artifact lineage;
- project/job/operation-intent labels.

The candidate bytes are ingested through the governed artifact gateway. If disposition is not `VERIFIED`, REBUILD fails. On success the stage receipt records candidate intake id, operation intent digest, result semantic digest, changed native parts, mutation engine and diagnostics.

The persisted candidate digest then becomes the restart/resume authority for later proof stages. This is preferable to replaying a mutation after process loss.

## 5. Material authority gap: PLAN is not effect admission

The recovered REBUILD path validates operation/source/targets/preservation, but the newly frozen PLAN law explicitly states that PLAN never grants consequential-effect authority.

Therefore a current REBUILD contract must bind a separate effect-admission receipt/decision owned by the shared Core/policy/effect boundary before invoking any mutation adapter.

A plan receipt, capability id, caller boolean, chat instruction or webhook metadata cannot fill that role.

This is the principal authority gap between the recovered effectful code and the new build method.

## 6. Material provenance gap: current candidate receipt is too coarse

The recovered REBUILD stage receipt carries useful evidence, but a current authority envelope needs to bind more explicitly:

- exact `DocumentPlanReceipt v1` digest;
- exact separate effect-admission decision ref/digest;
- exact adapter/capability qualification revision;
- exact mutation implementation identity;
- target-resolution digest;
- exact source and result CDG/PARSE semantic/native-inventory digests;
- exact preservation assessment digest/profile;
- exact open-world loss-gate result;
- candidate intake receipt/digest;
- restart/resume key identity;
- proof prerequisites still outstanding after candidate persistence;
- rollback evidence/ref and rollback eligibility standing.

The recovered bytes are useful substrate, but the effect-stage receipt should become a first-class immutable reconstruction receipt rather than free-form evidence strings.

## 7. Required effect sequencing law

A future REBUILD implementation must sequence:

1. re-read exact source/PARSE/UNDERSTAND/PLAN receipts;
2. re-read current capability/adapter qualification standing;
3. re-read separate effect-admission standing;
4. validate source/semantic/target identities;
5. validate open-world and loss/preservation preconditions;
6. validate rollback evidence availability;
7. only then invoke the admitted deterministic/native adapter;
8. independently hash result bytes;
9. independently re-project candidate semantics;
10. independently assess preservation/loss;
11. persist candidate through governed artifact intake;
12. commit immutable REBUILD receipt only after candidate persistence is verified;
13. perform later RENDER/COMPARE/VALIDATE/ACCESSIBILITY/SECURITY_PROOF/PROVE stages against that persisted candidate.

No later proof stage may require mutation replay merely to recover candidate bytes.

## 8. Idempotency and resume law

The recovered resumable stage-key pattern is retained but must bind the stronger current authority envelope.

A resumable REBUILD identity must include at minimum:

`source_sha + plan_receipt_digest + effect_admission_digest + operation_intent_digest + target_resolution_digest + adapter_qualification_digest + mutation_implementation_digest + preservation_profile_digest + contract_version`

Rules:

- a prior candidate can be reused only when every authority-bearing identity component matches;
- candidate bytes must be re-read and digest-verified from durable artifact custody;
- candidate CDG projection and preservation assessment are revalidated before reuse;
- changed plan/effect decision/adapter/profile/source/target identity invalidates reuse;
- an incomplete write without a verified candidate receipt cannot be promoted to PASS;
- duplicate execution after a lost wakeup/read must converge on the durable candidate or fail closed; it must not create ambiguous competing authority;
- no read-after-write freshness assumption is permitted.

## 9. Rollback law

The source/rollback artifact identified by the plan remains immutable recovery evidence. REBUILD does not delete or overwrite it.

A current reconstruction receipt must distinguish:

- rollback artifact digest/reference;
- rollback availability verified at pre-effect admission;
- whether candidate publication has occurred (it must not have at REBUILD time);
- whether rollback is a byte restoration or a compensating document operation;
- any format/native prerequisites required for actual rollback.

REBUILD must not claim rollback success merely because a rollback digest exists.

## 10. Loss and preservation law

The existing open-world loss gate and native-part preservation assessment remain mandatory.

Rules:

- unmodeled native content intersecting targeted/expected changed parts blocks unless exactly qualified;
- expected changed native parts remain a bounded allowlist, not permission for collateral changes;
- known loss must have been declared/admitted by PLAN and applicable effect policy;
- unknown loss cannot be authorized by a generic `lossyAllowed=true` flag;
- candidate mutation outside allowed native-part scope fails;
- semantic result reprojection cannot erase native-part preservation failures;
- a preservation PASS is exact to its format/profile/implementation and does not prove native Office/PDF application fidelity unless that environment was actually executed.

## 11. Adapter / engine fence

`SemanticCdg2NativeAdapter` is recovered portable substrate. It exposes only supported deterministic format operations and throws for unsupported operations.

A future REBUILD receipt must bind the exact adapter/engine identity and exact capability qualification class. If a requested operation requires Microsoft Office, a native PDF engine, OCR/VLM, external conversion or another provider, that must be an explicit prerequisite/port with separate evidence. Portable fallback evidence cannot be relabeled as native/external proof.

No macro/script/ActiveX/OLE/embedded package execution is authorized merely because the source document contains such content.

## 12. Candidate-state taxonomy

A current REBUILD authority contract should distinguish at least:

- `NOT_STARTED`
- `BLOCKED_EFFECT_AUTHORITY`
- `BLOCKED_CAPABILITY`
- `BLOCKED_TARGET_OR_SOURCE_MISMATCH`
- `BLOCKED_LOSS_OR_PRESERVATION`
- `BLOCKED_ROLLBACK_EVIDENCE`
- `MUTATION_FAILED`
- `CANDIDATE_PERSISTENCE_FAILED`
- `CANDIDATE_PERSISTED_UNPROVEN`
- `CANDIDATE_RESUMED_REVALIDATED`
- `FAILED_INTEGRITY`

REBUILD completion is **not** final-document completion. A persisted candidate remains unproven until later proof/finalization stages pass.

## 13. Lossless requirement / invariant matrix

| # | Requirement / invariant | Recovered substrate | Durable state / evidence | Interface / contract | Standing | Gap / blocker |
|---|---|---|---|---|---|---|
| 1 | REBUILD selected only for REBUILD mode | action-stage branch | stage receipt | spine | COVERED | none portable |
| 2 | exact source bytes bind source graph | coordinator check | source/CDG evidence | coordinator | COVERED | current receipt should bind exact upstream receipts |
| 3 | operation source SHA binds exact source | coordinator check | operation contract | DOC-OP-1 | COVERED | none portable |
| 4 | operation semantic SHA binds exact source graph | coordinator check | operation contract | DOC-OP-1 | COVERED | PLAN receipt binding needed |
| 5 | plan receipt binds reconstruction | historical plan digest only | stage key/evidence | generic stage | PARTIAL | `DocumentPlanReceipt v1` digest missing |
| 6 | separate effect admission required before mutation | no current explicit check | none | external Core boundary | MISSING | critical authority gap |
| 7 | capability qualification exact and current | adapter chosen in code | engine id string | implementation | PARTIAL | qualification revision/evidence not bound |
| 8 | target set required | coordinator | request | coordinator | COVERED | none portable |
| 9 | selector/target equality fail-closed | coordinator exact set check | operation + targets | coordinator | COVERED | retain |
| 10 | unmodeled targeted native features blocked | OpenWorld loss gate | diagnostics | coordinator | COVERED | bind result digest/profile in receipt |
| 11 | adapter cannot lie about source SHA | independent check | result | coordinator | COVERED | retain |
| 12 | adapter cannot lie about result SHA | independent hash check | result | coordinator | COVERED | retain |
| 13 | result re-projected independently to CDG-2 | projector check | result graph | coordinator | COVERED | bind projection identity/profile |
| 14 | preservation assessed independently | preservation map | assessment | coordinator | COVERED | first-class assessment digest missing |
| 15 | failed preservation blocks candidate | universal spine check | failure stage receipt | spine | COVERED | retain |
| 16 | candidate bytes persisted before later proof | governed candidate intake | artifact receipt | gateway | COVERED | first-class REBUILD receipt needed |
| 17 | failed candidate intake blocks stage | disposition check | failure receipt | gateway | COVERED | retain |
| 18 | candidate lineage to source/operation retained | intake lineage/labels | intake receipt | gateway | PARTIAL | exact PLAN/effect/target refs should be immutable fields |
| 19 | restart can resume without mutation replay | prior resumable receipt + verified read | stage receipt/candidate | checkpoint+gateway | COVERED COARSELY | stronger resume identity needed |
| 20 | resumed candidate is rehashed/read verified | gateway verified read | candidate digest | gateway | COVERED | retain |
| 21 | resumed candidate is independently reprojected | code path | result graph | spine | COVERED | retain |
| 22 | resumed candidate preservation is revalidated | code path | preservation assessment | spine | COVERED | retain |
| 23 | changed authority identity invalidates resume | old key binds plan digest/source | stage key | checkpoint | PARTIAL | effect/capability/profile identities missing |
| 24 | rollback evidence verified before effect | operation requires digest | operation field | DOC-OP-1 | PARTIAL | resolvability/standing check missing |
| 25 | known loss cannot exceed PLAN/effect admission | operation carries declarations | operation | DOC-OP-1 | PARTIAL | explicit effect-decision binding missing |
| 26 | unknown loss cannot be silently authorized | open-world gate helps | diagnostics | coordinator | PARTIAL | unknown non-target collateral loss must remain fenced |
| 27 | candidate is not final/publication authority | later proof/publish stages exist | stage sequence | spine | COVERED STRUCTURALLY | explicit candidate standing required |
| 28 | native/external evidence class stays separate | unsupported operations throw/ports separate | scattered evidence | adapters | PARTIAL | exact evidence-class binding needed |
| 29 | active content cannot execute implicitly | SECURE blocks effectful active-content source | prior stage | SECURE | COVERED PRECONDITION | REBUILD must bind SECURE receipt/current standing |
| 30 | no peer specialist semantics acquired | owner governance | governance | owner boundary | PARTIAL | explicit receipt/service fence needed |
| 31 | historical PASS does not transfer to reconstructed bytes | exact-subject governance | governance | qualification | COVERED GOVERNANCE | R4 custody still blocked |
| 32 | current runtime implementation/qualification is source-custody gated | tonight authority | blocked delegation | governance | BLOCKED | exact R4 GitHub-native source custody absent |

Result: **32/32 bounded REBUILD invariants accounted; 0 unaccounted rows.** This is forensic accounting, not runtime completion or qualification.

## 14. Central recovered design defects

Five material defects remain under the current build method:

1. **effect admission gap** — recovered code can enter mutation after PLAN without a first-class separate Core/policy effect-admission receipt;
2. **coarse reconstruction receipt** — generic stage evidence does not fully bind PLAN/effect/capability/target/preservation identities;
3. **resume-key incompleteness** — prior resumability does not bind the full new authority envelope;
4. **rollback evidence weakness** — rollback digest is required, but pre-effect durable resolvability/standing is not first-class REBUILD evidence;
5. **candidate-vs-final standing is implicit** — stage order implies it, but a persisted REBUILD candidate needs an explicit `UNPROVEN` standing until later proof gates succeed.

The repair should preserve the recovered candidate-before-proof, independent re-projection, preservation and durable-resume substrate while adding the missing authority envelope.

## 15. Required durable product

The design-lock successor should freeze `DocumentRebuildReceipt v1` with at minimum:

- source/identity/SECURE/PARSE/UNDERSTAND/PLAN receipt digests;
- separate effect-admission decision ref/digest;
- operation intent and target-resolution digests;
- capability/adapter descriptor + qualification refs;
- mutation implementation/engine identity;
- source/result SHA;
- source/result semantic and native-inventory digests;
- open-world loss-gate result/digest;
- preservation assessment digest/profile;
- rollback evidence ref/standing;
- candidate artifact/intake receipt digest;
- changed-native-part set;
- known loss declarations/standing;
- candidate state (`PERSISTED_UNPROVEN` or exact failure/block class);
- remaining proof prerequisites;
- resumability identity/key digest;
- diagnostics/reason classes;
- receipt digest.

## 16. Qualification implications

The design-lock successor must enumerate exact isolated cases covering:

- PLAN/effect/source/semantic/capability/target mismatch;
- missing/revoked effect authority;
- open-world targeted feature blocking;
- adapter source/result digest lies;
- independent result reprojection mismatch;
- preservation failure;
- candidate intake failure;
- persisted-candidate restart without mutation replay;
- stale authority identity invalidating resume;
- resumed candidate re-projection/preservation failure;
- rollback evidence unavailable/mismatched;
- known/unknown loss boundaries;
- native/external capability evidence-class separation;
- candidate-not-final/nonpublication standing;
- no hidden active-content execution;
- owner-boundary negative cases;
- cumulative INTAKE -> IDENTIFY -> SECURE -> FORENSICS -> PARSE -> EXTRACT -> UNDERSTAND -> PLAN -> REBUILD boundaries.

The exact case count must be frozen only when enumerated case-by-case.

## 17. Current blockers and non-claims

Runtime implementation remains blocked because exact R4 canonical source bytes are not established in current GitHub-native custody and fresh current-subject baseline qualification has not run.

This packet does not claim:

- implementation of `DocumentRebuildReceipt v1`;
- any current mutation execution;
- current exact-subject qualification;
- effect/policy authorization;
- rollback execution;
- native Office/PDF fidelity;
- external-provider or human authority;
- A-01 PASS;
- publication or production readiness.

## 18. Adjudication

Retain the recovered governed mutation coordinator, independent candidate re-projection, open-world loss gate, native preservation assessment, candidate-before-proof persistence and durable resume behavior. Add a first-class separate effect-admission binding and immutable REBUILD candidate receipt before any reconstructed runtime is authorized.

## Exact next operation

`DOCUMENTS-SPINE-REBUILD-DESIGN-LOCK-001 — FREEZE DOCUMENT REBUILD RECEIPT V1 + SEPARATE EFFECT-ADMISSION BINDING + PLAN/CAPABILITY/TARGET AUTHORITY + CANDIDATE-BEFORE-PROOF PERSISTENCE + RESUME/ROLLBACK/LOSS/PRESERVATION LAW + EXPLICIT ISOLATED QUALIFICATION DENOMINATOR, WITHOUT RUNTIME MUTATION.`
