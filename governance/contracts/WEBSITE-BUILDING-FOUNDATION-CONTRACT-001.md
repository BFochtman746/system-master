# WEBSITE_BUILDING — Foundation Contract 001

**Capability** `C40` · **Owner** `SYSTEM_MASTER/PROGRAMMING` · **Lane** PROGRAMMING · **Effective** 2026-09-13
**Authority** `governance/architecture/SYSTEM-MASTER-TOOL-OWNER-ALLOCATION-006.json`
**Architecture decision** `governance/ADR-0006-PROGRAMMING-PEER-ADMISSION-WEBSITE-BUILDING.md`

> **Architecture disposition complete; implementation closure remains open.** This contract establishes owner/boundary semantics for Foundation Census accounting. Empty implementation/evidence details remain ACTIVE_GAP rather than inferred completion.

## Known from the architecture decision

- Website Building is a first-class Programming capability, not a separate peer system.
- It owns website/web-application construction and engineering semantics.
- It consumes browser/action interfaces from CONNECTED_ACTIONS without inheriting side-effect authority.
- Production hosting, credentials, domain/DNS changes, publication and external-provider actions require explicit authority.

## 1. Contract / interface

Provide headless website/web-application engineering operations for architecture, scaffold/construction, source transformation, dependency/build configuration, test preparation/execution, deployment preparation and maintenance/repair inside PROGRAMMING authority.

Not offered by this capability: user-authorized external side effects, credential authority, browser policy ownership, production publication authority, canonical research/media/document ownership or shared Core runtime ownership.

## 2. Ingress routes

- Chat/System Master request admitted to PROGRAMMING.
- Programming-owned project/build packets and current obligations.
- Explicit cross-system inputs from MEDIA, DOCUMENTS and RESEARCH_KNOWLEDGE.
- CONNECTED_ACTIONS browser interface only when action authority is separately admitted.

## 3. Egress routes

- Source code and project artifacts.
- Build/test/qualification evidence.
- Deployment packages/configuration proposals.
- Repair findings and successor packets.
- External deployment/browser actions only through separately authorized CONNECTED_ACTIONS/provider boundaries.

## 4. Persistence and canonical writer

Programming is canonical writer for Website Building engineering/project state. Shared artifact storage may be supplied by CORE/DOCUMENTS but service consumption does not transfer semantic ownership.

## 5. Dependencies

- CORE: shared runtime/storage/model/A-01/evidence infrastructure.
- CONNECTED_ACTIONS: browser/action interfaces.
- RESEARCH_KNOWLEDGE: research/provenance services.
- MEDIA: media assets.
- DOCUMENTS: generic artifact/document services.

## 6. Failure semantics

Fail closed on owner/control-head drift, missing dependency authority, credential/provider requirements, conflicting canonical writes or ambiguous production/publication authority. State-changing external effects require idempotency and explicit action authority.

## 7. Evidence target

Programming-owned exact-subject project/build/test/qualification evidence bound to current control head and source identity. Logs alone are insufficient.

## 8. Acceptance target

Architecture acceptance requires Topology 007, owner allocation 006, capability crosswalk 003, Programming control record, Programming Second Shift coverage and current enforcement to agree. Implementation acceptance remains open until a concrete Website Building qualification command and representative build corpus are admitted.

## 9. Authority boundary

Programming may decide engineering implementation details within the admitted owner boundary. Human/user/external-provider decisions remain required for credentials, domains/DNS, billing, publication, production deployment and side effects beyond repository execution authority.

## 10. Open gaps

- Representative website/web-app qualification corpus not yet selected.
- Production deployment providers and credential transport are not admitted here.
- Concrete implementation acceptance command remains to be bound during Programming foundation closure.
