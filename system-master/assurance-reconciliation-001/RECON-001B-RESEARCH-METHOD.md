# RECON-001B — ASSURANCE-001 Capability Completeness Challenge

Status: ACTIVE
Workstream: SYSTEM-MASTER-ASSURANCE-RECON
Purpose: Independently determine whether the current ASSURANCE-001 implementation is complete enough to judge successor System Master systems.

## Core research questions

1. What exact decisions, evidence classes, qualification standings, invalidation transitions and promotion decisions must ASSURANCE-001 own?
2. Can any component, builder, tool, model, evaluator, workflow or fake Assurance identity self-promote or forge standing?
3. Are requirement -> gate -> test -> evidence -> adjudication -> standing bindings complete and reconstructible?
4. Does qualification selection include the complete direct and transitive dependency closure required by the requested assurance claim?
5. Can stale, wrong-subject, wrong-build, wrong-policy, wrong-evaluator, withdrawn, corrupted, duplicated or conflicting evidence be accepted as current proof?
6. Are invalidation, requalification, restoration and audit history durable, idempotent, crash-safe and concurrency-safe?
7. Are target/native/provider/human residual obligations explicit and non-waivable, rather than inferred from portable evidence?
8. Is provenance/authenticity strong enough to establish what produced evidence, not merely that a local hash or test output exists?
9. Can independent mutations/adversarial probes detect removed controls, missing hard gates, replay defects and false success paths?
10. Are PILOT and PRODUCTION_READY standings fail-closed until their role-specific policies and required evidence are actually implemented?
11. Is Assurance protected against circular self-certification and against treating its own output as sufficient evidence for itself?
12. Can exact standing, evidence and audit history be reconstructed after restart from authoritative durable state?
13. Does the current repository actually contain or reach the exact source bytes claimed by historical Assurance evidence?
14. Where does Assurance rely on FOUNDATION-006, DATA-001, A-01 and SYSTEM-MODEL-001, and which authority is canonical at each boundary?

## Internal source strategy

Inspect and reconcile, without bulk-promoting historical labels:

- current `main` and `system-master/assurance-reconciliation-001`;
- all repository branches/refs likely to contain ASSURANCE/CQ-001/CQ-002/CQ-003/UAF/System Model/Orchestrator qualification source;
- exact commits, manifests, source hashes and supersession records;
- qualification test census and dependency DAG;
- FOUNDATION-006 evidence/audit implementation and UAF hardening lineage;
- DATA-001 migrations used by Assurance durable repositories;
- A-01 policy, registry, receipts and exact-subject execution evidence;
- System Orchestrator verified-output and fault/recovery evidence;
- current source reachability for every historical SHA used as a material proof anchor.

Historical evidence establishes lineage only until its exact subject and dependency closure are proven current.

## External challenge strategy

Use current primary sources as independent challenge evidence, not as replacement System Master authorities:

- NIST SP 800-218 SSDF for lifecycle-wide secure development, verification and recurrence prevention;
- SLSA v1.2 Source and Build requirements for source history, provenance, builder identity, authenticity and isolation distinctions;
- in-toto Attestation Framework v1.0 for structured evidence/attestation semantics;
- NIST AI 600-1 / AI RMF Generative AI Profile where AI evaluators, model qualification or AI-assisted assurance introduce model-risk concerns.

A material external mismatch becomes a gap candidate and must be mapped to an existing System Master owner before any architecture change is authorized.

## Evidence classes remain independent

- RESEARCH_OR_DESIGN_EVIDENCE
- STATIC_SOURCE_EVIDENCE
- PORTABLE_EXECUTABLE_EVIDENCE
- LIVE_DEPENDENCY_EVIDENCE
- A01_TARGET_WINDOWS_EVIDENCE
- IOS_SIMULATOR_TARGET_EVIDENCE
- IOS_PHYSICAL_TARGET_EVIDENCE
- PROVIDER_NATIVE_EVIDENCE
- HUMAN_EMPIRICAL_EVIDENCE
- PRODUCTION_EVIDENCE

No weaker class may silently satisfy a stronger one.

## Overnight executable scope

A-01 overnight work for RECON-001B is intentionally bounded and non-reasoning. It may:

1. verify exact-subject and reconciliation-artifact integrity;
2. run the current F-WP-001..012 regression chain available from the exact subject;
3. run Git object integrity checks;
4. enumerate repository branches and discover source-bearing Assurance/test/qualification trees;
5. test reachability of material historical SHA references;
6. preserve a machine-readable source/evidence census for later in-chat adjudication.

It may not declare ASSURANCE-001 complete, alter promotion standing, perform autonomous architectural reasoning, weaken evidence gates, create a second scheduler, or infer production authorization.

## Completion rule

RECON-001B completes only after current-source capability mapping, independent challenge/disproof, evidence-class adjudication and all material gaps are recorded. A successful overnight census is evidence acquisition for that decision, not the decision itself.
