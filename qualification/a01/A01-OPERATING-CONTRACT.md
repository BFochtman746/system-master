# A-01 Operating Contract

Status: CANONICAL CANDIDATE - A01-CONTROL-PLANE-001 / POLICY V8 TRUSTED METADATA ADMISSION

## Purpose

A-01 is the shared authoritative Windows/X64 machine-qualification resource for `BFochtman746/system-master`. This contract governs every System Master lane that requests, consumes, interprets, retries, or promotes A-01 evidence.

A-01 is shared infrastructure administratively integrated through `SYSTEM_MASTER/CORE`. It is not a peer product system and it does not transfer product authority between CORE, LEARNING, BOOK, and DOCUMENTS. PROSE is completed/retired; historical Prose/Literary/Book-Evaluator qualification identities remain provenance only and newly authorized execution resolves through current topology.

## Non-negotiable rules

1. Perform all safe deterministic prequalification before requesting A-01.
2. No workstream may create a direct subject-execution path when a registered control-plane qualification applies.
3. Every request uses a registry-owned `qualification_id`; arbitrary command injection is prohibited.
4. The exact tested Git commit SHA is the qualification subject. Evidence never transfers to changed bytes.
5. No subject may enter `A01_PASSED`, `PROMOTION_ELIGIBLE`, or `CANONICAL` without a valid authoritative receipt.
6. Registration and immutable subject metadata admission are prerequisites to subject checkout and execution.
7. Policy v8 admission is a trusted metadata-only preflight on A-01 for non-disruptive qualifications. Before `ADMITTED`, it may checkout only the exact canonical control plane. It must not checkout, load, or execute qualification-subject bytes.
8. The metadata barrier must prove the exact control-plane SHA, registered qualification/workstream, safe wrapper path/source, execution context/runtime, exact subject commit existence, and registered subject-wrapper presence from GitHub commit/tree metadata.
9. Only a successful `ADMITTED` preflight may invoke the private subject executor. The executor then independently checks out and verifies the exact control-plane SHA and exact subject SHA before running the registered wrapper.
10. A receipt must bind both identities: `subject_sha`/`checkout_sha` and `control_plane_sha`/`control_plane_checkout_sha`.
11. A GitHub Actions rerun is never evidence that a branch reference was refreshed. If registry, policy, gateway, admission, or executor authority changes, create a fresh workflow run.
12. Blocked requests may consume a short trusted A-01 admission slot, but may not checkout or execute subject bytes and may not be mislabeled as product failures.
13. If no matching self-hosted runner is online, admission or execution may remain queued. Runner absence does not change product bytes or authorize bypass.
14. Workstreams waiting on A-01 should continue dependency-valid work that does not consume the pending subject as authoritative.
15. Failures remain `SUBJECT_FAILURE`, `INFRA_FAILURE`, or `CONTROL_PLANE_FAILURE`; repair scope stays at the proven boundary.
16. Every authoritative run preserves request, admission evidence, receipt, exact identities, runner identity, telemetry, evidence location, and return ticket.
17. Product failures return to the current owner resolved through CURRENT-AUTHORITY/topology. Shared control-plane defects route to CORE/shared A-01 repair.
18. Existing global queue serialization, bounded repair lineage, overnight scheduling, and evidence ordering remain mandatory.
19. A-01 may deterministically inventory, hash, validate, classify machine-verifiable evidence, emit manifests/attestations, run registered extractors and qualification, and verify trace/custody integrity for the System Master catalog program.
20. A-01 may not create a first-class system, assign semantic ownership, reinterpret ambiguous historical evidence as fact, erase historical taxonomy, or turn catalog metadata into product authority.
21. Historical qualification IDs may remain in the registry to preserve evidence continuity. Names do not resurrect retired systems.
22. Policy v8 trusted metadata admission is non-disruptive only. Any qualification with a registered post action such as `windows_reboot` fails closed with `DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER` until an independently safe hosted/lease-based disruptive path is restored and requalified.

## Canonical request architecture

For non-disruptive normal, repair, overnight, and catalog-processing requests:

`CALLER -> A01 GATEWAY -> TRUSTED A01 METADATA-ONLY ADMISSION -> ADMITTED -> PRIVATE A01 SUBJECT EXECUTOR -> RECEIPT/EVIDENCE`

The gateway is the compatibility surface. The admission job runs only canonical control-plane code and GitHub metadata reads. It does not acquire subject bytes. The separate executor job is the only phase allowed to checkout and execute an admitted subject.

Using A-01 for the trusted admission preflight does not merge admission and execution authority: they remain separate jobs, and the executor requires both a successful admission job result and `admitted == true`.

## Admission states

Only `ADMITTED` may reach subject checkout/execution. Blocked states include `WAITING_FOR_REGISTRATION`, `REGISTERED_EXECUTABLE_MISSING`, `WORKSTREAM_MISMATCH`, `INVALID_SUBJECT_SHA`, `SUBJECT_METADATA_READ_FAILURE`, `SUBJECT_METADATA_IDENTITY_MISMATCH`, `SUBJECT_METADATA_TREE_TRUNCATED`, `CONTROL_PLANE_CHECKOUT_MISMATCH`, `INVALID_CONTROL_PLANE_POLICY`, `INVALID_REGISTRY`, `INVALID_REGISTERED_WRAPPER_PATH`, `INVALID_REGISTERED_WRAPPER_SOURCE`, `INVALID_EXECUTION_CONTEXT`, `INVALID_QUALIFIER_TIMEOUT`, `QUALIFICATION_NOT_OVERNIGHT_ELIGIBLE`, `QUALIFIER_TIMEOUT_EXCEEDS_REGISTRY`, `DISRUPTIVE_QUALIFICATION_NOT_ALLOWED_OVERNIGHT`, `DISRUPTIVE_QUALIFICATION_REQUIRES_HOSTED_BARRIER`, and `CONTROL_PLANE_READ_FAILURE`.

A blocked admission emits a durable reason and `fresh_dispatch_required`. It cannot fabricate a qualification receipt.

## Fresh-run and retry law

GitHub may preserve the originally resolved reusable-workflow SHA when a failed job or specific job is rerun. Therefore registry/policy/gateway/broker/executor changes require a fresh workflow run. A stale attempt remains historical evidence and is never rewritten into PASS. Product repair that changes bytes gets a new subject SHA and new deterministic prequalification.

## Historical/archive processing law

A-01 catalog processing is evidence production, not architecture promotion. Every ingest/process run binds immutable input identity where possible, produces an ingest/run identity, records exact inputs/outputs, classifies uncertainty explicitly, and preserves rejected/quarantined/conflicting material. A newly computed digest proves only the bytes actually presented, not identity with unavailable historical archives.

## Normal, repair, overnight, and runner-unavailable compatibility

Normal workstreams prequalify and enter the gateway. Closed-loop repair preserves transaction identity and enters the same gateway. The central night planner remains the only independent A-01 schedule. Non-disruptive overnight tickets may use trusted metadata admission; disruptive tickets are rejected by policy v8. Queueing for the self-hosted runner is infrastructure waiting, not product failure.

## Receipt authority

Current receipts bind policy/registry version, qualification/workstream, gate class, exact subject and subject checkout, exact control plane and control-plane checkout, workflow attempt, runner identity, timing, result class, evidence artifact, return ticket, and promotion authorization. Catalog-processing receipts additionally bind input manifests, output catalog/trace artifacts, extractor/schema version, and classification boundaries.

## Security

Third-party actions remain pinned to full commit SHAs. Registered wrappers remain repository-owned `.github/scripts/` paths. Nested reusable-workflow permissions cannot be elevated. No caller may inject an arbitrary shell command, workflow reference, or post action. Pre-admission subject checkout/execution is prohibited. Provenance/attestations supplement semantic qualification; they never replace exact-subject qualification or product authority.

## Disruptive handoff

The historical reboot ordering remains a required invariant, but policy v8 does not admit disruptive qualifications through the metadata-only fallback. Reboot-capable requests stay blocked until a separately qualified safe admission/settle mechanism exists.

## Change control

A control-plane baseline change requires demonstrated shared infrastructure/platform evidence. Policy v8 is justified by repeated GitHub-hosted runner non-assignment (`runner_id:0`, zero executed steps) while A-01 itself remained online. New catalog-processing capability still enters through registry/qualification discipline; the metadata-only preflight is not a bypass around exact identity or registration controls.
