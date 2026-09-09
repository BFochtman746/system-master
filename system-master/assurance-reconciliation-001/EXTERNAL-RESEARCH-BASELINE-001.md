# EXTERNAL-RESEARCH-BASELINE-001

Workstream: SYSTEM-MASTER-ASSURANCE-RECONCILIATION-001
Status: ACTIVE RESEARCH BASELINE
Purpose: independent external challenge evidence for whole-system capability audits

## Rule

External sources are used to challenge completeness, failure coverage and currentness. They do not automatically create System Master authority or override a bounded internal owner. A material external finding becomes a gap candidate that must be mapped to the existing authority graph before any design or implementation change.

## Initial current authoritative references

### NIST SSDF — SP 800-218 v1.1
Use for secure software-development lifecycle challenge coverage: development environment protection, secure production, vulnerability prevention, response and recurrence prevention. The System Master audit must verify that security claims are supported across the lifecycle rather than only by end-stage tests.

Primary: https://csrc.nist.gov/pubs/sp/800/218/final

### SLSA Specification v1.2
Use for supply-chain/source/build provenance challenge coverage. Exact artifacts, source revisions, build definitions, builder identity and provenance integrity must be distinguishable from ordinary test success. Higher assurance requires stronger provenance and build isolation; System Master must not infer trustworthy production artifacts merely from a passing local build.

Primary: https://slsa.dev/spec/v1.2/

### OpenTelemetry Specification 1.60.0 and Semantic Conventions 1.44.0
Use for observability challenge coverage. Metrics, logs, traces and events require consistent semantics and stability; telemetry is operational evidence but must not be confused with domain truth or qualification truth. Audit PLATFORM-012/021T for end-to-end correlation, useful error context, stable signal contracts, coverage and operational overhead.

Primary: https://opentelemetry.io/docs/specs/otel/
Primary semantic conventions: https://opentelemetry.io/docs/specs/semconv/

### NIST AI RMF 1.0 / Generative AI Profile NIST AI 600-1
Use for PLATFORM-009, LocalAI, 021AB and AI-assisted subsystem challenge coverage. Risk management must span design, development, deployment, evaluation and use; model output or benchmark wins cannot self-authorize production standing. Audit evaluation quality, provenance, human oversight, misuse/abuse risks, data/privacy/security risks, model/behavior drift and incident response.

Primary: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence

## System-specific research rule

Before a system is marked COMPLETE_FOR_BUILD_SUCCESSOR, add the current primary references relevant to that system. Examples include:

- Apple platform/runtime/accessibility/security documentation for iOS/client/UX/continuity claims;
- PostgreSQL documentation for transaction, locking, WAL, backup/PITR, replication and durability claims;
- protocol/RFC authority for HTTP/WebSocket/MCP/A2A/identity/crypto behavior;
- current provider documentation where behavior depends on an external runtime/service;
- authoritative security and safety guidance for authentication, cryptography, software supply chain and AI systems;
- current specialist literature/benchmarks where system quality depends on empirical performance rather than protocol compliance.

The audit must record source date/version and whether the source changed an existing requirement, exposed a gap, or merely confirmed the current design.

## Current research conclusion

The existing System Master separation of exact-subject evidence, provenance, qualification standing, runtime telemetry and domain truth is directionally consistent with current external practice. That is not a completeness finding. The next work is system-by-system challenge testing to prove those boundaries are actually implemented and cannot be bypassed.
