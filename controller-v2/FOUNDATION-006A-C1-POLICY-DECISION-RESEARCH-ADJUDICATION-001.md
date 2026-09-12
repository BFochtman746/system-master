# CONTROLLER-FOUNDATION-006A-C1 — Policy Decision Targeted Research + Adjudication 001

Status: TARGETED RESEARCH COMPLETE / ADJUDICATED / DESIGN-LOCK AUTHORIZED
Predecessor recovery: `FOUNDATION-006-C1-RECOVERY-INVENTORY-001.md`
Working branch: `controller-v2/foundation-006-c1-rebind`
Production Controller activation: `BLOCKED_EXTERNAL_SETUP`

## 1. Research questions

Research was intentionally limited to questions that can change the Foundation-006 architecture:

1. Should the Controller embed a generalized policy language, or enforce a narrow decision-port boundary?
2. What must be bound to a durable authorization decision so it remains auditable and replay-safe when policy changes?
3. How should policy evaluation errors/incomplete data behave?
4. How should sensitive identity/approval inputs be represented in Controller evidence?
5. Where should policy decision versus enforcement happen relative to the SQLite admission transaction?

## 2. Sources and material findings

### NIST SP 800-207 — policy decision and enforcement separation

Source: <https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-207.pdf>

NIST's Zero Trust Architecture separates a Policy Decision Point from the Policy Enforcement Point and describes a policy engine making/logging allow/deny judgments while the enforcement side applies them. Authentication and authorization are distinct concerns.

**Design impact:** Foundation-006 will not make transport authentication synonymous with authorization. The Controller acts as the durable enforcement/commit boundary. Policy evaluation is behind a narrow decision port and occurs before the SQLite commit transaction.

### Cedar authorization semantics — explicit permit, default deny, forbid precedence

Sources:

- <https://docs.cedarpolicy.com/auth/authorization.html>
- <https://docs.cedarpolicy.com/policies/validation.html>

Cedar models authorization as principal/action/resource/context and returns Allow or Deny plus diagnostics. Its model is default-deny; explicit forbids override permits. Cedar also exposes evaluation errors in diagnostics and separately recommends schema validation.

**Design impact:** Foundation-006 request projection will be structured around bounded principal/action/resource/context-like inputs rather than feeding arbitrary Controller internals to a policy adapter. No admission occurs without explicit ALLOW. Policy diagnostics/errors are not ignored by the Controller even if a particular policy engine can still compute a decision: an evaluation with unresolved errors/incomplete required inputs maps to fail-closed `DEFER/INDETERMINATE` unless the selected policy contract explicitly proves those errors irrelevant. Foundation-006 itself does not adopt Cedar as a mandatory engine.

### OPA — decision/enforcement decoupling, bundle revisions and decision evidence

Sources:

- <https://www.openpolicyagent.org/docs>
- <https://www.openpolicyagent.org/docs/management-bundles>
- <https://www.openpolicyagent.org/docs/management-decision-logs>

OPA explicitly decouples policy decision-making from application enforcement. Its bundle model supports revision metadata and can update policy/data independently of application deployment. Decision logs can include decision IDs, input/result and bundle revision metadata. OPA also documents masking/erasing sensitive decision-log fields.

**Design impact:** the Foundation-006 policy port must return a policy snapshot/revision identity and a content digest suitable for exact decision binding. A mutable label such as `latest` is insufficient. The Controller stores bounded decision metadata/digests/references, not full private identity or approval payloads. Foundation-006 does not mandate OPA; OPA is evidence that a revisioned decision-port contract is practical.

### OPA eventual policy distribution

OPA documents that policy/data bundles may update asynchronously and are eventually consistent.

**Design impact:** Foundation-006 may never interpret "current policy" as an implicit read-after-write guarantee. The policy decision response must identify the exact active revision used. If the command requires a specific policy version and the active revision does not satisfy that exact contract, admission does not proceed.

## 3. Engine choice adjudication

**Decision: do not select Cedar, OPA, or any other generalized policy engine as Foundation-006 runtime authority.**

Reasons:

- the Controller must not absorb generalized identity/delegation/domain policy semantics;
- production deployment constraints are still external and activation remains blocked;
- multiple engines can satisfy the required decision-port contract;
- embedding a policy language now would enlarge the foundation surface without evidence it is necessary;
- the critical invariant is not which language evaluates policy, but that an exact immutable decision is bound to the exact command/transaction/subject/policy snapshot and enforced once.

Foundation-006 therefore defines a reusable `PolicyDecisionPort` and durable `AdmissionDecisionV1` receipt. A future deployment may adapt Cedar, OPA, a locally compiled policy evaluator, or a Core-owned authority only if it satisfies that contract and is separately qualified.

## 4. Decision/evidence contract adjudication

A policy evaluation response used by Foundation-006 must provide, at minimum:

- `decision_id` — stable decision identity from the adapter or Controller-derived content identity;
- `outcome` — `ALLOW`, `DENY`, or `DEFER`;
- `policy_version` — exact selected logical policy version;
- `policy_revision` — exact active immutable revision/snapshot identity;
- `policy_digest` — SHA-256 over the normalized policy snapshot identity/manifest or an adapter-provided equivalent with a documented profile;
- `input_digest` — SHA-256 over the canonical bounded authorization input sent for evaluation;
- `reason_codes` — bounded non-secret machine codes;
- `determining_policy_ids` — optional bounded identifiers, never free-form source text;
- `diagnostic_error_codes` — bounded codes for evaluation/schema/data errors;
- opaque evidence references/digests for identity/delegation/approval inputs where required;
- optional `valid_until` only when the selected policy contract defines freshness/expiry semantics.

The Controller computes its own durable decision fingerprint over these fields plus exact command/transaction/subject bindings. It does not trust an adapter-supplied fingerprint as the only integrity check.

## 5. Authorization input adjudication

The policy request is a bounded Controller projection, not the entire SQLite database or entire chat payload.

Conceptual shape:

- principal: opaque verified identity/delegation references and bounded transport provenance;
- action: Controller command type plus requested Controller action class;
- resource: target repository + exact canonical subject + bounded resource class;
- context: command fingerprint, required policy version, constraints relevant to authorization, requested completion contract class, and bounded Controller facts needed by policy.

Specialist Book/Learning/Documents/Core payload meaning remains opaque to Foundation-006. If a specialist command requires domain-specific authorization facts, that owner must supply a validated bounded fact/receipt through an explicit interface rather than Foundation-006 reinterpreting specialist semantics.

## 6. Error / incomplete-input semantics

Foundation-006 distinguishes three categories:

- `DENY`: the exact policy snapshot evaluated the complete required request and explicitly refused it. Commit may reject the transaction.
- `DEFER`: no safe final decision exists because required evidence/policy revision is unavailable, stale, incomplete, mismatched, expired, revoked, or evaluation produced unresolved errors. Transaction remains `OPEN`.
- transport/adapter failure: classified as transient or permanent adapter failure. It is not a semantic policy decision; the reconciliation loop may retry only transient failures under one bounded retry owner.

**No error or missing-data path maps to ALLOW.**

## 7. Concurrency / reconciliation adjudication

Policy evaluation is read/evaluate work outside the SQLite transaction. The enforcement commit then re-reads current durable state and verifies:

1. transaction still exists and is `OPEN`;
2. command ID/fingerprint still match the decision input;
3. repository/subject still match;
4. selected transaction policy version and command `required_policy_version` are compatible with the decision;
5. evidence references/digests required by the decision remain at the standing required by their owner contract;
6. any decision expiry has not elapsed;
7. no prior conflicting admission decision has committed.

If any condition changed, the Controller does not "fix up" the old decision. It returns a stale-decision result and re-enters reconciliation from current durable state.

## 8. Idempotency adjudication

The durable `AdmissionDecisionV1` fingerprint is semantic. Re-submission of the same exact decision for the same transaction is idempotent. A different decision fingerprint for a transaction that already has a committed terminal admission decision is `ADMISSION_DECISION_CONFLICT`.

If an ALLOW commit succeeded but the caller lost the response, replay of the same decision returns the existing committed result without a second state transition/event.

## 9. Privacy / evidence adjudication

Following the decision-log privacy concern documented by OPA, durable Controller admission evidence stores only what is needed for audit/reconciliation:

- digests;
- bounded IDs/revisions;
- bounded reason/diagnostic codes;
- opaque evidence references;
- no raw authentication secret;
- no raw private approval text;
- no copied identity documents;
- no unrestricted policy input dump.

If a future deployment needs richer decision logs, that belongs to a separately governed evidence store with explicit masking/access controls, not the Controller foundation SQLite by default.

## 10. Additional requirements discovered by targeted research

The research adds six explicit requirements to the recovery denominator:

- F006-R19 — policy decision/enforcement roles are separate; generalized policy evaluation is behind a narrow port;
- F006-R20 — exact policy revision/snapshot identity and digest are required; mutable `latest` is insufficient;
- F006-R21 — authorization input has an exact canonical digest and bounded projection contract;
- F006-R22 — unresolved policy evaluation/schema/data errors cannot result in ALLOW;
- F006-R23 — durable decision evidence supports privacy-minimized IDs/digests/references rather than raw private input;
- F006-R24 — policy engine is pluggable; no Cedar/OPA-specific runtime semantics become Controller foundation authority.

Updated bounded denominator: **24/24 accounted; 0 unaccounted** at this stage.

## 11. Gate standing

RECOVER: PASS
INVENTORY: PASS
ANALYZE: PASS
TARGETED RESEARCH: PASS
ADJUDICATE: PASS
DESIGN-LOCK: AUTHORIZED NEXT
BUILD: NOT AUTHORIZED YET
ISOLATED QUALIFICATION: NOT RUN
CUMULATIVE REGRESSION/CALIBRATION: NOT RUN
FREEZE: NOT AUTHORIZED

Exact successor: `CONTROLLER-FOUNDATION-006B-C1-ADMISSION-DECISION-DESIGN-LOCK-001`.
