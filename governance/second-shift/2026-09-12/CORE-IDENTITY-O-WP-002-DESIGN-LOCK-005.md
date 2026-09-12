# CORE-IDENTITY-O-WP-002-DESIGN-LOCK-005

Status: **RECOVERED / INVENTORIED / ANALYZED / TARGETED-RESEARCHED / ADJUDICATED / MECHANICAL DESIGN-LOCKED / REAL PROOFING EVIDENCE FENCED**
Owner: `SYSTEM_MASTER/CORE`
Fresh logical owner: `Foundation & Spine / Identity, Principal & Delegation`
Prerequisite: bounded O-WP-001 hosted-portable freeze at `system-master/control-v2@4da156f9707c2f9aa31984d3fb958fd01e5b375b`
Historical source package SHA-256: `cc8d7567ee2a1f307eba7add206d5c12c25db5a6dfa4fe7d09fc8499db21cc37`

## 1. Exact recovered package

`O-WP-002 — Identity proofing and enrollment profiles`

Prerequisite: `O-WP-001`

Components:
- `IdentityProofingProfileRegistry`
- `IdentityEnrollmentService`

Data entities:
- `IdentityProofingProfile`
- `IdentityEnrollmentRecord`

Typed APIs:
- `PublishIdentityProofingProfile`
- `BeginIdentityEnrollment`
- `CompleteIdentityEnrollment`
- `GetEnrollmentStanding`

Exact recovered atomic requirement denominator: **13**

`O-RQ-003, O-RQ-004, O-RQ-053, O-RQ-054, O-RQ-105, O-RQ-106, O-RQ-164, O-RQ-165, O-RQ-166, O-RQ-167, O-RQ-272, O-RQ-310, O-RQ-317`

## 2. Exact recovered requirement meaning

- Principal identity stays distinct from session, process, executor, provider, model, device and semantic-domain ownership.
- Principal kinds include HUMAN, SERVICE, AGENT, PROVIDER, PROCESS and SYSTEM, with explicit kind-specific enrollment/proofing evidence.
- `IdentityProofingProfileRegistry` versions applicability and assurance requirements for human identity proofing/enrollment.
- `IdentityEnrollmentService` records enrollment/proofing sessions and evidence references without storing raw proofing secrets.
- `IdentityProofingProfile` and `IdentityEnrollmentRecord` are typed versioned/immutable contracts with exact principal lineage, standing/freshness and evidence semantics.
- All four APIs are typed/versioned; mutations require stale-base/revocation/idempotency protections where applicable.
- Successful authentication without authorization never permits the protected action; authentication receipt is evidence only.
- Qualification remains exact-subject and evidence-class truthful.
- O-WP-002 may implement only its declared scope.

## 3. Exact recovered data contracts

### IdentityProofingProfile
Identity: `profile_id`

Fields:
- `profile_id`
- `version`
- `applicability`
- `required_assurance`
- `allowed_methods`
- `evidence_requirements`
- `standing`

### IdentityEnrollmentRecord
Identity: `enrollment_id`

Fields:
- `enrollment_id`
- `principal_id`
- `profile_ref`
- `proofing_evidence_refs`
- `assurance`
- `decision`
- `created_at`
- `standing`

Privacy handling remains delegated to the privacy authority. Retention/disposition remains delegated to lifecycle/data-governance authority. O-WP-002 stores references/minimum security metadata, not raw proofing documents, biometrics, reusable credentials or private proofing payloads.

## 4. Targeted current external research

Research was limited to identity-proofing decisions that can materially change the current design.

NIST SP 800-63A-4 is the current final U.S. NIST identity-proofing/enrollment guidance (final July 31, 2025 / publication August 1, 2025), superseding SP 800-63A. It defines requirements across three identity assurance levels and treats proofing as evidence used to establish confidence in a claimed real-life identity.

NIST SP 800-63-4 also makes a critical architectural distinction: identity proofing is not automatically required for every service. The relying party first determines whether validated identity/attributes are actually needed and chooses an initial identity assurance level based on impact when proofing is required. Revision 4 also strengthens fraud controls and includes controls aimed at injection attacks and forged media/deepfakes.

Current official sources:
- `https://csrc.nist.gov/pubs/sp/800/63/a/4/final`
- `https://www.nist.gov/publications/nist-sp-800-63a-4digital-identity-guidelines-identity-proofing-and-enrollment`
- `https://pages.nist.gov/800-63-4/sp800-63/dirm/`
- `https://pages.nist.gov/800-63-4/`

### Architecture effect

1. O-WP-002 must not force real-world human identity proofing for every HUMAN principal. A profile must explicitly state applicability/purpose and required assurance.
2. The proofing profile is policy/configuration about **what evidence/method/assurance is acceptable**; it does not itself prove a person.
3. An enrollment record may record evidence references, provider/method result standing and the decision, but cannot fabricate the underlying evidence.
4. Real human proofing, document/biometric verification, external provider validity and anti-fraud/deepfake effectiveness are separate evidence classes and must remain blocked until actually exercised.
5. SERVICE/AGENT/PROVIDER/PROCESS/SYSTEM enrollment is first-class but must use kind-specific non-human evidence/attestation rules; it must not be mislabeled as human proofing or used to fabricate HUMAN assurance.
6. Authentication remains downstream and separate. O-WP-002 enrollment/proofing standing cannot itself authorize an action.

## 5. Ownership and collision adjudication

### O-WP-002 owns
- versioned proofing/enrollment profile identity and standing;
- applicability and required-assurance declarations;
- allowed-method and evidence-requirement references;
- enrollment session/record identity and lifecycle;
- binding of enrollment to one stable PrincipalId and one exact profile version;
- evidence/provider receipt references and declared assurance/decision standing;
- idempotency/currentness of profile publication and enrollment state changes.

### O-WP-002 does not own
- PrincipalId creation/lifecycle itself (O-WP-001);
- authenticator issuance/verification or authentication receipts (later Identity package);
- authorization policy/decision (later Identity package);
- raw proofing documents/biometric images/video/private payloads;
- external proofing provider truth;
- privacy eligibility/purpose authority;
- cryptographic key/trust authority;
- Book/Learning/Documents/Programming semantics;
- effect authority;
- target/native/production evidence.

## 6. Mechanical design lock

### IdentityProofingProfile invariants

- `profile_id + version` is immutable once published.
- one profile version declares principal kinds/applicability, assurance target, allowed method identifiers, evidence-requirement identifiers and current standing.
- changing policy creates a new version; historical profile versions remain addressable.
- profile standing can prevent new enrollments without rewriting historical enrollment evidence.
- profile metadata contains no raw proofing payloads/secrets.

### IdentityEnrollmentRecord invariants

- one enrollment binds one stable `principal_id` to one exact `profile_id + version`.
- enrollment begins in an explicit non-success state.
- completion requires an evidence/provider-result reference set appropriate to the selected profile; empty evidence cannot be promoted to VERIFIED/PASSED for proofing-required profiles.
- same enrollment/command replay is idempotent; same identity with changed semantic bytes conflicts.
- stale profile version or blocked profile standing fails closed.
- completion records the asserted/measured assurance result separately from the profile's required assurance.
- result cannot exceed the exact external evidence/provider assertion consumed; mechanics cannot elevate assurance.
- human proofing decisions and non-human enrollment/attestation decisions remain distinguishable.
- rejection/quarantine/unknown remain explicit terminal or review states; no guess-to-success behavior.
- enrollment records are append-only/immutable receipts for completed decisions; correction is superseding evidence/record, not history rewrite.

## 7. Evidence-class fence

The following can be mechanically qualified in hosted/portable fixtures:
- schema/versioning;
- state transitions;
- profile-version currentness;
- PrincipalId/profile binding;
- idempotency/conflict handling;
- evidence-reference presence and exact matching;
- assurance ceiling enforcement against a supplied provider/evidence assertion;
- human-vs-nonhuman classification and policy fences;
- unknown/rejected/quarantined behavior;
- restart/replay/concurrency.

The following cannot be synthesized by O-WP-002 tests:
- a real person's identity;
- authenticity of a government document;
- liveness/biometric validity;
- fraud/deepfake resistance of an external provider;
- human proofing usability/equity outcomes;
- native device/provider behavior;
- production identity assurance.

Those remain explicit external/human/native/production blockers until real evidence exists.

## 8. Required qualification denominator before bounded freeze

At minimum:
- exact 13 O-RQ traceability with zero unaccounted requirements;
- profile immutable-version semantics;
- profile applicability and proofing-not-required path;
- human vs non-human kind-specific enrollment separation;
- exact PrincipalId + profile-version binding;
- stale/blocked profile denial;
- begin/complete idempotency and changed-byte conflict;
- concurrent begin/complete and profile-publication races;
- proofing-required completion without evidence rejected;
- supplied assurance below required assurance cannot become VERIFIED/PASSED;
- supplied/provider assurance cannot be silently increased;
- authentication success cannot imply authorization or protected-action permission;
- no raw proofing secret/document/biometric payload in ordinary enrollment state;
- rejection/quarantine/unknown preserved explicitly;
- restart/replay and corruption handling;
- O-WP-001 + O-WP-002 cumulative regression;
- unchanged Foundation System Root cumulative regression.

## 9. Build authorization standing

The mechanical profile/enrollment runtime is **AUTHORIZED TO BUILD** on a fresh candidate rooted at exact then-live CORE head, subject to the pre-mutation head/claim check.

Real proofing/provider/human evidence is **NOT AUTHORIZED TO SYNTHESIZE**. A bounded hosted-portable freeze may close only deterministic mechanics and preserve those authority/evidence gaps explicitly.

## 10. Exact successor

`CORE-IDENTITY-O-WP-002-BUILD-006 — BIND LIVE CORE HEAD -> IMPLEMENT PROOFING PROFILE REGISTRY + ENROLLMENT SERVICE AGAINST EXACT 13 O-RQ -> ISOLATED HOSTED MECHANICAL QUALIFICATION -> O-WP-001+002+SYSTEM-ROOT CUMULATIVE -> FREEZE BOUNDED MECHANICS OR PRESERVE EXACT BLOCKER`
