# PROGRAMMING-EXTERNAL-BYTE-MATERIALIZATION-AND-FULL-CORPUS-INGEST-001

**Effective date:** 2026-09-10  
**Standing:** ACTIVE — SECOND SHIFT SAFE PREPARATION / BYTE-CUSTODY RECOVERY  
**Parent objective:** `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001`  
**Semantic owner:** `SYSTEM_MASTER` product-root governance  
**Execution administrator:** `SYSTEM_MASTER/CORE`  
**Candidate corpus:** `PROGRAMMING`  
**Architecture authority:** none

## Purpose

Continue from the accepted supervised Programming proving run by recovering the externally held source bytes that the pilot could only index by locator or historical claim. The end state is a full-corpus ingest candidate in which every known source is either backed by exact staged bytes and immutable provenance or is explicitly classified as unavailable, identity-unproven, contradictory/quarantined, or superseded.

This contract is a custody and evidence-recovery operation. It does not activate Programming as a peer system and does not authorize changes to CORE, LEARNING, BOOK, BOOK/PROSE, DOCUMENTS, or System Master topology.

## Starting evidence

The supervised topology-004 pilot is accepted by `SYSTEM-MASTER-KNOWLEDGE-RECOVERY-001-SUPERVISED-ACCEPTANCE.json` on exact subject `4a2d4f7168f48728ef67d187ff43afb97c9568d9`.

The accepted pilot processed 36 source records with:

- 8 exact subject-byte sources;
- 26 `EXTERNAL_BYTES_PENDING` sources;
- 2 `IDENTITY_UNPROVEN` sources;
- 0 quarantine conflicts;
- 100% metadata disposition coverage;
- no claim of full historical byte verification.

## Source-custody state machine

Each unresolved source must end this contract in exactly one of these states:

1. `STAGED_EXACT_BYTES` — exact bytes are present in an approved immutable intake location with source locator, byte length and SHA-256 recorded.
2. `A01_VERIFIED` — A-01 has actually read the exact staged bytes and the resulting receipt binds the observed digest to an exact qualification subject.
3. `MISSING_BYTES` — the known source locator was checked through the permitted source surface and exact bytes cannot currently be obtained.
4. `IDENTITY_UNPROVEN` — candidate bytes or references exist, but identity cannot be established against the historical source claim.
5. `CONFLICT_QUARANTINED` — two or more non-equivalent identities/digest claims compete for the same historical source and the conflict is preserved rather than normalized.
6. `SUPERSEDED` — an exact source is preserved for provenance but a later admitted source explicitly supersedes it.
7. `DUPLICATE` — exact byte identity is proven against another source while preserving both source records and provenance.

`STAGED_EXACT_BYTES` is not equivalent to `A01_VERIFIED`. Only an A-01 execution that reads those exact bytes may produce the latter standing.

## Intake identity requirements

For every byte-bearing source, record at minimum:

- immutable source record id;
- original surface and original locator;
- original filename/title and version identifier where available;
- acquisition/materialization method;
- exact byte length;
- SHA-256 of the bytes actually observed during staging;
- staging locator;
- custody timestamp and actor/executor class;
- system/capability affinity as discovery metadata only;
- prior digest claims and whether they match the observed digest;
- duplicate/supersedes/conflicts relationships;
- evidence standing and explicit non-claims.

A ChatGPT Library file id/version is a source locator, not a digest. A pre-stage digest is not A-01 verification. A historical filename is not sufficient proof that newly found bytes are the historical object.

## Approved processing boundary

Second Shift may autonomously perform deterministic discovery, retrieval through already-authorized source access, materialization, hashing, manifest construction, duplicate detection, conflict classification, trace generation and repository-safe preparation.

Second Shift must stop at any source boundary that requires new user permission, inaccessible private data, external-provider authority, destructive mutation, ambiguous identity choice, architecture promotion, or unsupported transport. The blocker must be written as durable evidence with the exact next executable condition.

No source may be silently substituted because another file has a similar title, content, date, module id, or historical role.

## Repository intake rule

Where repository-native staging is technically supported, use an immutable, source-specific intake location and preserve original bytes. Generated normalized extracts are separate derived assets and never replace source custody.

Where the available connector/tool path cannot place the original bytes into an A-01-readable immutable location, record the materialization result and transport blocker explicitly. Do not claim repository custody or A-01 availability merely because ChatGPT or another processing environment could read the file.

## Manifest progression

`PROGRAMMING-INGEST-MANIFEST-001` and `PROGRAMMING-INGEST-MANIFEST-002` are immutable historical proving inputs.

When the unresolved-source census is complete enough for the next qualification, create `PROGRAMMING-INGEST-MANIFEST-003` as a new version. It must reference Manifest 002 lineage, preserve all existing source records, add byte-custody observations or blocker dispositions, and never rewrite a historical digest claim into an observed fact.

## Trace requirements

The resulting trace/provenance graph must support at least these relations when applicable:

- `MATERIALIZED_FROM`
- `DERIVED_FROM`
- `HAS_AFFINITY_TO`
- `DUPLICATES`
- `CONFLICTS_WITH`
- `SUPERSEDES`
- `DEPENDS_ON`
- `IMPLEMENTS`
- `SATISFIES`
- `QUALIFIED_BY`
- `GENERATED_BY`
- `DOCUMENTS`
- `RESEARCHES`

Every edge must identify its source record(s). Semantic affinity does not imply architecture authority.

## Second Shift execution contract

Unattended execution is allowed only while all of the following remain true:

- Current Authority still selects topology 004 or a successor explicitly compatible with this contract;
- Programming remains a non-active catalog candidate unless the user separately changes architecture authority;
- CORE remains the administrative execution lane for this shared recovery operation;
- the active CORE delegation is bound to the live Core control head;
- source access does not require new human/private/external authorization;
- no A-01 qualification is launched unless that exact qualification is admitted by the current A-01 registry/policy for the requested execution context.

If any condition changes, preserve the checkpoint and re-resolve authority before mutation.

## Completion gate

This contract completes when all 28 unresolved pilot records have a durable terminal custody disposition, and the system can produce a full-corpus qualification candidate without inventing missing evidence.

Completion requires:

- all 26 prior external-byte-pending records resolved to exact staged bytes or explicit `MISSING_BYTES` / `IDENTITY_UNPROVEN` / `CONFLICT_QUARANTINED` standing;
- both prior identity-unproven records resolved or durably retained as identity-unproven/quarantined with reason;
- byte-length and SHA-256 for every staged source;
- duplicate/conflict relationships preserved;
- no historical source overwritten;
- Manifest 003 prepared;
- asset-catalog and trace-graph candidate regenerated deterministically;
- exact-subject qualification request prepared;
- the A-01 execution remains pending unless current registry/policy explicitly admits it.

## Successor

After this contract completes, the next step is `PROGRAMMING-FULL-CORPUS-A01-QUALIFICATION-001`: freeze the exact staged corpus/current authority subject, admit the qualification through the A-01 control plane, execute it on A-01, and compare its resulting source observations/catalog/trace evidence to this custody census.
