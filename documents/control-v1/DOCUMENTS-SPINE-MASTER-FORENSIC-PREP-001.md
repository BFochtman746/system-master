# DOCUMENTS-SPINE-MASTER-FORENSIC-PREP-001

Status: **FORENSIC RECOVERY / LOSSLESS MASTER MATRIX COMPLETE / NO NEW RUNTIME MUTATION CLAIM**

Owner: `SYSTEM_MASTER/DOCUMENTS`  
Capability: `UDM-SPINE-0010` — MASTER  
Live base revalidated before mutation: `documents/control-v1@4634c7ee052ec1a733c79dc3d0f0b6c7418099ab`  
Parent design lock: `DOCUMENTS-SPINE-REBUILD-DESIGN-LOCK-001`  
Exact recovered runtime source subject: `f8d869388676c367766b7ea1e0205faae8db5cec`  
Fresh baseline receipt: `qualification/document-r4/CR001-R4-CURRENT-LINEAGE-QUALIFICATION-001/receipt.json`

## 1. Authority and method

This packet applies the current Documents build discipline to UDM-SPINE-0010 MASTER:

`RECOVER -> INVENTORY -> ANALYZE -> TARGETED RESEARCH -> ADJUDICATE -> DESIGN-LOCK -> BUILD -> ISOLATED QUALIFICATION -> CUMULATIVE REGRESSION -> FREEZE`.

This unit completes RECOVER, INVENTORY, ANALYZE and ADJUDICATE for MASTER. Targeted external research was not expanded because the material design questions are answered by the exact current source, frozen Documents authority laws and existing proof/publication boundaries; adding generic external references would not change the design decision. No runtime byte is changed by this packet.

Documents owns generic document mutation/mastering mechanics, preservation, candidate custody, document proof and document-artifact evidence. Core owns identity/delegation/policy/effect authority. Book owns manuscript/author/editorial/publication-domain truth. Learning and Programming retain their specialist semantics. PROSE remains retired and receives no work.

## 2. Recovered MASTER semantics

The exact runtime establishes MASTER as an **effectful same-format existing-artifact mode**:

- `DocumentSpineMode.MASTER` is distinct from READ, EXTRACT, REBUILD and CREATE;
- `DocumentSpineExecutionPlan` requires an operation for MASTER;
- IDENTIFY rejects source-format/target-format inequality for every existing-artifact mode except REBUILD, therefore MASTER cannot silently become cross-format conversion;
- SECURE treats MASTER as effectful and blocks active-content mutation where the security inspection forbids it;
- `UniversalDocumentSpine` selects `DocumentSpineStage.MASTER` for the shared existing-artifact effect path whenever mode is not REBUILD;
- MASTER and REBUILD currently call the same `GovernedCdg2MutationCoordinator` and `SemanticCdg2NativeAdapter` substrate;
- result bytes are independently hashed, re-projected to CDG-2, native-part preservation assessed, and persisted as a governed `#candidate` artifact before later proof stages;
- restart can reuse the persisted candidate when the action-stage key matches, then independently re-project and re-assess preservation without replaying mutation;
- later RENDER, COMPARE, VALIDATE, ACCESSIBILITY, SECURITY_PROOF, PROVE, VERSION and PUBLISH stages are separate from the MASTER action stage.

The recovered implementation therefore already proves that MASTER is not equivalent to “final,” “publish,” “author approved,” or “native Office verified.” Those are separate authority/evidence questions.

## 3. MASTER-specific distinction from REBUILD

MASTER and REBUILD should reuse one governed effect execution substrate, but they are not the same contract.

MASTER-specific laws are:

1. **same-format law** — MASTER modifies an existing artifact without changing its document format; cross-format intent belongs to REBUILD;
2. **existing-artifact law** — MASTER requires exact source artifact custody and exact source semantic/native identity;
3. **mastering-intent law** — operation targets bounded document-native/semantic elements and preserves unrelated content; MASTER is not a generic whole-file rewrite license;
4. **candidate-not-final law** — a MASTER action produces an unproven persisted candidate, not a final artifact merely because the mode is called MASTER;
5. **final-candidate hint fence** — `DocumentOperationContract.finalCandidate()` may be a planning/proof prerequisite, but it is not publication authority;
6. **publication-class hint fence** — `DocumentSpinePublicationClass` is downstream requested treatment, not an authorization credential;
7. **author metadata fence** — `DocumentSpineJob.author` is descriptive routing/provenance metadata, not proof of human/author consent or approval;
8. **proof handoff law** — downstream proof/version/release work binds the exact persisted MASTER candidate digest and cannot silently regenerate it.

## 4. Shared governed mutation substrate retained

MASTER retains every frozen REBUILD integrity law that is mode-independent:

- exact source byte SHA / source graph SHA equality;
- exact operation source SHA and semantic digest binding;
- exact target/selector equality;
- open-world feature/loss gating;
- bounded expected changed-native-parts scope;
- adapter source/result digest distrust and independent verification;
- independent candidate CDG-2 reprojection;
- independent native-part preservation assessment;
- candidate-before-proof governed persistence;
- restart-safe persisted candidate reuse;
- no read-after-write freshness assumption;
- duplicate/lost-response convergence on durable candidate identity;
- separate effect admission before mutation;
- rollback evidence resolvability before effect;
- portable/native/external evidence-class separation.

A MASTER implementation must not fork a second mutation engine merely to create a mode-specific API.

## 5. Material authority defects recovered from current source

The exact source has five material gaps under current authority law.

### 5.1 Separate effect admission is absent

As in REBUILD, the recovered shared action path can invoke the mutation coordinator after PLAN without binding a first-class separately owned effect-admission decision. PLAN does not grant effect authority. MASTER must inherit the repaired REBUILD effect-admission boundary before adapter invocation.

### 5.2 MASTER receipt is only a generic stage receipt

The generic `DocumentSpineStageReceipt` does not explicitly bind the full authority envelope: source/PARSE/UNDERSTAND/PLAN, effect admission, target resolution, adapter qualification, loss/preservation profile, rollback evidence, candidate intake and resumability identity. MASTER needs a first-class immutable receipt.

### 5.3 `finalCandidate` is too easy to misread as final authority

The recovered validation requires `operation.finalCandidate()` when publication class is FINAL. That flag can remain a document-operation intent/property, but it cannot itself grant final-document, author, publication or release authority.

### 5.4 Publication class is not publication authorization

The recovered downstream `publish(...)` path can decide eligibility from `publicationClass` plus proof state. A current authority model must distinguish **technical document proof eligibility** from **publication/release authorization**. MASTER must never mint publication standing, and downstream PUBLISH must require its own exact release/publication authority when publication is consequential.

### 5.5 Job author/producer metadata is not semantic authorization

`DocumentSpineJob.author` and `producerRef` are included in job identity material, but they are caller-supplied metadata. They may support provenance labels; they cannot be trusted as human identity, delegated authority, consent or author approval.

## 6. MASTER candidate state

A current MASTER action should terminate in one of these document-local states:

- `BLOCKED_EFFECT_AUTHORITY`
- `BLOCKED_CAPABILITY`
- `BLOCKED_FORMAT_MISMATCH`
- `BLOCKED_SOURCE_OR_TARGET_MISMATCH`
- `BLOCKED_LOSS_OR_PRESERVATION`
- `BLOCKED_ROLLBACK_EVIDENCE`
- `MUTATION_FAILED`
- `CANDIDATE_PERSISTENCE_FAILED`
- `MASTER_CANDIDATE_PERSISTED_UNPROVEN`
- `MASTER_CANDIDATE_RESUMED_REVALIDATED_UNPROVEN`
- `FAILED_INTEGRITY`

MASTER success does not mean PROVE, VERSION, PUBLISH, native fidelity or production success.

## 7. Required `DocumentMasterReceipt v1`

The design-lock successor should freeze an immutable mode-specific receipt binding at minimum:

- contract version and job id;
- exact mode = MASTER;
- source artifact id / source SHA / same-format identity;
- identity, SECURE, PARSE, UNDERSTAND and PLAN receipt digests as applicable;
- source semantic and native-inventory digests;
- operation intent and target-resolution digests;
- separate effect-admission ref/digest;
- capability binding and qualification refs;
- adapter id/version/implementation digest;
- preservation and loss-gate profile digests;
- rollback evidence ref/digest/standing;
- source-to-candidate lineage digest;
- candidate artifact id / SHA / size / intake receipt digest;
- candidate semantic/native-inventory digests;
- changed native parts and preservation assessment digest;
- admitted known-loss refs;
- candidate state;
- remaining proof prerequisites;
- `final_candidate_requested` as a non-authoritative intent fact;
- `publication_class_requested` as a non-authoritative downstream request fact;
- resumability key digest;
- stable reason classes / diagnostics;
- receipt digest.

The receipt must not contain an `author_approved=true` or `publication_authorized=true` field unless backed by a separately owned immutable authority receipt, and MASTER itself must not create such authority.

## 8. Lossless requirement / invariant matrix

| # | Requirement / invariant | Current component | Durable state | Contract/interface | Test/evidence standing | Gap/blocker |
|---|---|---|---|---|---|---|
| 1 | MASTER is an explicit mode | `DocumentSpineMode` | job | spine mode | recovered source | covered |
| 2 | MASTER is effectful | `DocumentSpineStage.MASTER` / SECURE | stage receipt | spine | recovered source | covered |
| 3 | MASTER requires an operation | execution plan constructor | plan | plan | portable baseline | covered |
| 4 | MASTER job/plan mode must match | `validateJobAndPlan` | job+plan | spine | portable baseline | covered |
| 5 | MASTER capability set is bounded by job | `validateJobAndPlan` | job+plan | capability IDs | portable baseline | current qualification ref not receipt-bound |
| 6 | MASTER is same-format | IDENTIFY format check | IDENTIFY receipt | spine | recovered source | first-class receipt binding needed |
| 7 | cross-format existing-artifact work is REBUILD | IDENTIFY exception only for REBUILD | stage evidence | spine | recovered source | covered |
| 8 | source bytes are governed intake | gateway intake | artifact receipt | PLATFORM-008/gateway | baseline | covered |
| 9 | source SHA binds projected source graph | coordinator | operation/source graph | DOC-OP-1 | baseline | retain |
| 10 | source semantic digest binds operation | coordinator | operation | DOC-OP-1 | baseline | retain |
| 11 | current SECURE standing gates effect | SECURE stage | receipt | spine | baseline | MASTER receipt must bind it |
| 12 | active content cannot execute implicitly | SECURE | receipt | security | baseline | retain |
| 13 | PLAN does not grant effect authority | frozen plan law | plan receipt | plan | governance | covered law |
| 14 | separate effect admission required | absent in recovered action path | none | Core policy port | missing runtime | critical repair |
| 15 | target set must be non-empty/bounded | coordinator | operation targets | DOC-OP-1 | baseline | retain |
| 16 | selector/target equality is fail-closed | coordinator | operation/targets | coordinator | baseline | retain |
| 17 | open-world targeted features gate mutation | loss gate | diagnostics | coordinator | baseline | bind profile/result digest |
| 18 | expected native changes are bounded | preservation map | operation/preservation | coordinator | baseline | retain |
| 19 | adapter source SHA is independently checked | coordinator | mutation result | adapter contract | baseline | retain |
| 20 | adapter result SHA is independently checked | coordinator | mutation result | adapter contract | baseline | retain |
| 21 | candidate is independently re-projected | coordinator/spine | candidate graph | projector | baseline | bind projector/profile identity |
| 22 | preservation is independently assessed | coordinator/spine | assessment | preservation contract | baseline | first-class digest needed |
| 23 | preservation failure blocks candidate success | spine | FAIL receipt | spine | baseline | retain |
| 24 | candidate persists before later proof | governed candidate intake | candidate artifact receipt | gateway | baseline | retain |
| 25 | candidate intake rejection fails closed | spine | FAIL receipt | gateway | baseline | retain |
| 26 | restart reuses persisted candidate | action-stage resume | stage receipt+artifact | checkpoint/gateway | baseline | stronger authority-key binding needed |
| 27 | resumed candidate is re-read verified | gateway | candidate digest | gateway | baseline | retain |
| 28 | resumed candidate is re-projected/preservation checked | spine | new assessment | spine | baseline | retain |
| 29 | changed authority identity invalidates reuse | coarse stage key | stage key | checkpoint | partial | full effect/capability/profile key needed |
| 30 | rollback evidence exists before effect | operation field | operation | DOC-OP-1 | partial | resolvability/standing needed |
| 31 | MASTER candidate is not final authority | later proof stages | candidate/stage | spine | structural | explicit state needed |
| 32 | `finalCandidate` does not grant final/publication authority | validation flag | operation | DOC-OP-1 | missing explicit fence | repair required |
| 33 | publication class is only downstream requested treatment | job | job identity | spine | current code | authorization fence required |
| 34 | author/producer metadata is not human/delegation authority | job metadata | job | spine | current code | explicit fence required |
| 35 | proof stages bind exact candidate digest | proof stage keys/receipts | proof receipts | proof service | baseline | retain |
| 36 | VERSION is downstream of proof | `version(...)` | version receipt | version store | baseline | MASTER cannot pre-authorize it |
| 37 | PUBLISH is downstream and separately consequential | `publish(...)` | publication receipt | gateway | baseline mechanism | separate publication/release authority required |
| 38 | no Book/Learning/Core/Programming/Prose semantic authority is emitted | owner boundary | governance | service boundary | governance | retain |
| 39 | exact R4 source custody exists | recovered Git source tree | Git + manifest | source custody | fresh PASS | closed |
| 40 | fresh current-lineage baseline qualification exists | qualification receipt | durable receipt | qualification | 31 portable + T13/T14 PASS | native/A-01/production remain unclaimed |

Result: **40/40 bounded MASTER invariants accounted; unaccounted requirements = 0.** Rows marked partial/missing are design-repair requirements, not lost archaeology.

## 9. Adjudication

The correct design is **shared effect executor, mode-specific authority receipt**.

Do not duplicate the REBUILD mutation coordinator. Reuse one governed existing-artifact mutation substrate for REBUILD and MASTER, while preserving mode-specific rules:

- REBUILD may cross format when explicitly planned/admitted;
- MASTER is same-format only;
- both require separate effect admission and durable candidate-before-proof persistence;
- each emits its own immutable receipt/state names;
- neither grants proof/version/publication/human/native/A-01 authority.

The recovered generic stage receipt remains useful checkpoint evidence but is insufficient as the sole authority record.

## 10. Qualification implications

The design-lock successor must enumerate a fixed MASTER denominator covering at minimum:

- mode/plan/job mismatch;
- same-format enforcement and cross-format denial;
- missing/revoked/mismatched effect admission;
- source/semantic/target mismatch;
- capability and adapter qualification mismatch;
- active-content fence;
- open-world and preservation failures;
- rollback evidence failure;
- candidate persistence and durable resume;
- lost-response/duplicate reconcile convergence;
- candidate-not-final standing;
- finalCandidate nonpromotion;
- publication-class nonpromotion;
- author/producer metadata nonpromotion;
- proof/version/publish separation;
- native/external evidence-class separation;
- peer-owner negative cases;
- cumulative INTAKE through MASTER boundaries.

Historical PASS may support archaeology but cannot be transferred to changed runtime bytes.

## 11. Non-claims

This packet does not establish a new MASTER runtime implementation, a current MASTER effect execution, publication authorization, human/author approval, native Office fidelity, production standing or A-01 PASS.

The fresh R4 baseline proves exact source custody and bounded hosted baseline qualification only.

## Exact next operation

`DOCUMENTS-SPINE-MASTER-DESIGN-LOCK-001 — FREEZE DOCUMENTMASTERRECEIPT V1 + SAME-FORMAT MASTER LAW + SHARED EFFECT-EXECUTOR REUSE + EFFECT-ADMISSION / CANDIDATE-BEFORE-PROOF / FINALCANDIDATE-NONPROMOTION / PUBLICATION-AUTHORITY FENCES + ENUMERATED ISOLATED DENOMINATOR.`
