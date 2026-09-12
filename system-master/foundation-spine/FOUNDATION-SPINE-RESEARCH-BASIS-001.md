# FOUNDATION-SPINE-RESEARCH-BASIS-001

Status: CANONICAL DESIGN BASIS

Old documents are evidence sources, not normative authority. This register records the lessons retained because they improve the fresh design.

## Internal/archival lessons adopted

### Foundation & Spine forensic audit (2026-08-31)
Adopted lessons: preserve strong durable runtime and shared platform primitives; avoid rewrite-for-rewrite's-sake; close trust and workload-scale gaps. Specific historical weaknesses to prevent in the fresh design include process-local resource admission, short universal long-job defaults, unbounded full-file/model-stream memory patterns and unproven high-growth persistence retention/partitioning.

### Long Project Management Audit (2026-08-30)
Adopted lessons: durable jobs/leases/fencing/checkpoints/timers/signals/idempotency/outbox/recovery remain low-level canonical primitives; project management belongs above runtime and must not create another worker engine; Keel owns goal/scope/ceilings while orchestration owns plan.

### 021I execution-placement repair research
Adopted lessons: placement sits above existing runtime; consumes a resource grant and a digest-bound route; cannot self-admit, self-route or grant effects; hard eligibility filtering precedes soft scoring.

### Global coverage census
Adopted lesson: historical 25-authority, later 021F-021AC and other generations contain useful capabilities but old dependency edges/contracts cannot be treated as current architecture merely because they were once canonical. Recompute ownership and dependencies under the fresh map.

## External research adopted

### Kubernetes Scheduling Framework
Source: https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/
Adopted: explicit queueing/filtering/scoring/reservation/permit/pre-bind/bind phases; hard feasibility before score; reservation/unreserve around binding. We use the pattern, not Kubernetes-specific implementation assumptions.

### Temporal durable execution
Source: https://docs.temporal.io/
Adopted: durable workflow/job state must resume across crashes, network failures and infrastructure outages; long-lived work is a first-class reliability case, not a special exception.

### NIST SP 800-207 Zero Trust Architecture
Source: https://csrc.nist.gov/pubs/sp/800/207/final
Adopted: no implicit trust based on location/ownership; identity and authorization are explicit resource-access decisions.

### NIST AI RMF Generative AI Profile (NIST AI 600-1)
Source: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
Adopted: AI risk/trustworthiness must be governed across design, development, use and evaluation rather than being reduced to one model-routing setting.

### OWASP LLM06:2025 Excessive Agency
Source: https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
Adopted: minimize unnecessary tool functionality, permissions and autonomy; model/tool choice is not action authority.

### OpenTelemetry Semantic Conventions
Source: https://opentelemetry.io/docs/specs/semconv/
Adopted: common semantic naming for traces, metrics, logs, profiles and resources improves correlation across a multi-language/multi-service system. Telemetry remains non-authoritative evidence-wise.

### SLSA v1.2
Source: https://slsa.dev/spec/v1.2/
Adopted: provenance/attestation and increasing supply-chain guarantees should bind build/release/dependency standing.

## Research rule for future changes

Research may challenge this architecture. New findings are not appended as extra authorities by default. They must show which existing responsibility is wrong/missing, whether a new unique truth owner is actually required, and what is superseded.