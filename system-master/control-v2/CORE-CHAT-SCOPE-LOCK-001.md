# CORE CHAT SCOPE LOCK 001

Status: ACTIVE SCOPE GUARD / OWNER-CHAT BOUNDARY
Date: 2026-09-11
Owner path: `SYSTEM_MASTER/CORE`
Control ref: `system-master/control-v2`
Authority inputs: `governance/CURRENT-AUTHORITY.json`, `governance/SYSTEM-TOPOLOGY-005.json`, `governance/SYSTEM-PROGRAM-JOB-LOCK-001.json`, `system-master/control-v2/SYSTEM-MASTER-CORE-CONTROL-RECORD-003.md`

## Purpose

This record locks the responsibility boundary for the Core / Foundation & Spine owner chat so work selection cannot silently drift into another system or work program.

## Core owns

Core owns reusable shared System Master primitives and infrastructure, including:

- Foundation contracts and shared system invariants;
- authority, identity, principal/session, grant, approval and admission infrastructure;
- DATA-001 shared persistence, migration, transaction, concurrency, idempotency, cache/invalidation, synchronization, backup/restore, recovery, projection and blob infrastructure;
- PLATFORM shared capability registration/discovery, route/admission, command/query/event transport, execution/effects boundary, retries, cancellation, timeout, deduplication, resource admission and durable-work infrastructure;
- continuity, resilience, recovery and shared lifecycle infrastructure;
- assurance, evidence, provenance, exact-subject identity, reconciliation, qualification-state, repair-state and promotion-gate infrastructure;
- A-01/control-plane registration, routing, evidence ingestion, repair/retry and shared qualification infrastructure;
- common Chat/Work/USER-EXPERIENCE foundations such as shared intent/admission/action/progress/attention/session contracts, but not domain-specific presentation or semantics;
- shared connector, model, artifact, runtime and integration primitives;
- System-Master-facing ports/contracts/envelopes required for peer-system integration, without ownership transfer;
- `PROGRAMMING_KNOWLEDGE_RECOVERY` only as bounded custody/provenance/support work, never as Programming product implementation.

## Core does not own

### LEARNING
Core must not implement or reconcile learner, curriculum, course, lesson, assessment, mastery, adaptation, Learning workflow, or Learning canonical-state semantics.

### BOOK
Core must not implement or reconcile canonical manuscript, Story Bible/canon, Book lifecycle, author decisions, Book literary intelligence, Book workflow/orchestration semantics, Book admission/version/publication semantics, or remaining completed-Prose-to-Book integration.

### DOCUMENTS
Core must not implement or reconcile DOCX/PDF/PPTX/OCR/document-artifact semantics, document structure/conversion/preservation/render/export behavior, generic document-writing mechanics, or Documents-specific qualification/state. Core may provide only shared storage/runtime/artifact/interface primitives consumed by Documents.

### PROGRAMMING
Core must not implement or reconcile Programming-specific project/repository, build, compiler/toolchain, dependency, test, static-analysis, mutation, fuzzing, performance, release/deployment, or autonomous software-engineering semantics. Core may recover exact Programming assets/custody/provenance under the explicitly authorized Knowledge Recovery support boundary.

### PROSE
PROSE is complete and terminally retired. Core must not create, dispatch, repair, qualify, research, telemeter, mutate or bind successor Prose work. Any genuinely open integration of preserved completed Prose capability is BOOK-owned.

### SYSTEM_MASTER product root
Product-level topology, creation/admission of first-class systems, product composition, cross-system acceptance and product-level completion remain `SYSTEM_MASTER` root authority. Core may administer shared integration infrastructure but is not the product root.

## Scope-admission test before substantive Core work

A proposed task may execute in this chat only when all applicable answers remain inside Core authority:

1. Is the task a reusable shared primitive or infrastructure concern used across systems? If yes, it is presumptively Core.
2. Is it primarily authority, persistence, platform/runtime, continuity, assurance/evidence, qualification/A-01, shared connector/model/artifact infrastructure, or cross-system transport? If yes, it is presumptively Core.
3. Does it define specialized Learning, Book, Documents or Programming meaning/behavior? If yes, STOP and route to that owner.
4. Is it a cross-system interface? Core may define and implement only the Core-owned side and shared envelope; the peer retains its semantics and canonical writes.
5. Is it a product-level topology/composition/completion decision? Route to SYSTEM_MASTER root authority.
6. If ownership remains uncertain, classify ownership before mutation. No implementation begins from ambiguity.

## UI boundary

Core owns shared user-intent/admission/state contracts and USER-EXPERIENCE shared infrastructure. Presentation composition, navigation, gestures, layouts, accessibility behavior and other visual interaction implementation remain the separate UI/experience coordinator responsibility except where a future explicit topology/job-lock record assigns otherwise. Domain systems expose state/projections/intents; they do not duplicate UI-coordinator implementation.

## Write rule

No chat title, branch name, convenience, dependency pressure or apparent implementation adjacency may transfer another owner's semantic authority into Core. Cross-lane work stops at an explicit contract/interface boundary.

## Conflict rule

If this scope-lock text conflicts with a newer canonical `CURRENT-AUTHORITY`, topology, program job lock or Core control record, the newer canonical authority wins. The conflict must be reconciled before substantive mutation.
