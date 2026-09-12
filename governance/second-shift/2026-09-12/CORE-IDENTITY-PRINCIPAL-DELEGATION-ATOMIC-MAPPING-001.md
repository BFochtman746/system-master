# CORE-IDENTITY-PRINCIPAL-DELEGATION-ATOMIC-MAPPING-001

Status: **RECOVERED + INVENTORIED + FIRST-PASS ANALYZED / TARGETED RESEARCH COMPLETE / ADJUDICATION PARTIAL / DESIGN-LOCK NOT AUTHORIZED**
Owner: `SYSTEM_MASTER/CORE`
Live owner subject verified immediately before this write: `system-master/control-v2@2e6ab006a48a5908d59642d36c567f447c66f49b`
Fresh architecture source: `system-master/foundation-spine/SYSTEM-SPECIFICATION.md` blob `8a03c8a80f02e1c153e7bba6874f6f65366f422d`
Implementation-status source: `system-master/foundation-spine/IMPLEMENTATION-STATUS.md` blob `f68b84b1a7bdace7968af104a71188e17fd89509`
Predecessor forensic packet: `CORE-FOUNDATION-SPINE-FORENSIC-RECOVERY-START-001.md`

## 1. Method standing

This packet follows the current Foundation/Spine build method in order:

1. RECOVER — complete for the current GitHub-native F-WP and selected recovered-session evidence surfaces enumerated below; broader historical identity/security archaeology remains open.
2. INVENTORY — complete first pass for the 13 Identity / Principal / Delegation responsibilities named by the fresh System Specification.
3. ANALYZE — complete first pass for ownership collisions, installation class and durability gaps.
4. TARGETED RESEARCH — complete for the exact unresolved architecture questions of workload identity and delegation semantics.
5. ADJUDICATE — partial. Reuse/delegate/rebind/build dispositions are safe where evidence is sufficient; final BUILD scope is not frozen while historical identity/security archaeology remains incomplete.
6. DESIGN-LOCK — NOT AUTHORIZED YET.
7. BUILD — NOT STARTED for the fresh Identity boundary.
8. ISOLATED QUALIFICATION — NOT APPLICABLE YET to a fresh Identity implementation.
9. CUMULATIVE REGRESSION/CALIBRATION — NOT APPLICABLE YET to a fresh Identity implementation.
10. FREEZE — NOT AUTHORIZED.

No owner-branch code is mutated by this packet. Historical or portable PASS evidence is not transferred to a fresh Identity subject.

## 2. Canonical ownership boundary

The fresh Foundation specification asks Identity, Principal & Delegation one canonical question: **who or what actor is this, and what authority was delegated to it?**

Identity owns user/device/session/service/workload identity, actor chains, delegated authority, capability grants, expiry/revocation and actor attribution. It must support short-lived workload identity and least-privilege delegation.

It explicitly does **not** own:

- user goal/intent semantics (Keel);
- executable plan semantics (Planning & Orchestration);
- resource admission/reservation or execution-grant truth (Resource Admission & Budgeting / execution authority);
- placement lease/fence truth (Execution Placement / Durable Runtime);
- effect/action authorization decisions at commit time (Effect / Action Authority);
- specialist Book, Learning, Documents or Programming semantics.

The System Root & Authority Registry remains the owner of system identities/topology/admission/retirement; it is not the actor identity store.

## 3. Current evidence classes used

### CURRENT GITHUB-NATIVE SUBSTRATE

- `system-master/f-wp-005/` — bounded governance authorization, approval, principal-equivalence/SoD, revocation-epoch and emergency-authority evidence.
- `system-master/f-wp-003/` — semantic-owner versus executor/provider identity separation.
- `system-master/f-wp-006/` — exact, expiring, non-transferable execution grant that consumes principal and current authorization standing.
- `system-master/f-wp-007/` — leases/fences/idempotency that consume owner/principal references but own execution coordination, not identity.
- `system-master/control-v2/SMR021-AUTHORIZATION-CONTEXT-BINDING-RESEARCH-DELTA-001.md` — current research/invariant input for exact authorization-context binding.

### HISTORICAL / RECOVERED SUBSTRATE REQUIRING REBIND

- `system-master/control-v2/PLATFORM003-RECONCILIATION-001.md` — recovered durable session identity/authentication-generation/transport-generation and terminal REVOKED/CLOSED semantics; source custody is not current GitHub-native runnable identity implementation.

### NOT FOUND AS A FRESH INSTALLED BOUNDARY

The exact current tree at `2e6ab006...` contains the fresh `foundation-spine/system-root` runtime but no dedicated fresh Identity / Principal / Delegation runtime subtree. Current F-WP packages and recovered reconciliation records therefore remain evidence inputs, not proof that the target Identity boundary is installed.

## 4. Lossless atomic responsibility mapping — first pass

| ID | Target responsibility / invariant | Current component or evidence | Current durable state | Interface / contract role | Tests / evidence | Environment | First-pass classification | Blocker / disposition |
|---|---|---|---|---|---|---|---|---|
| ID-001 | User identity | Generic `principalRef` in F-WP-005 authorization/approval contracts | No canonical durable user-principal registry proven | Identity must provide stable principal reference to policy, grants, effects and evidence | F-WP-005 validates exact principal binding, SoD and revocation epoch | Current GitHub-native portable code; no fresh Identity qualification | PARTIAL SUBSTRATE | Recover any canonical user-principal/issuer lifecycle before BUILD decision. Do not equate a string principalRef with installed identity authority. |
| ID-002 | Device identity | No dedicated current device-identity implementation demonstrated in inspected current source | None proven | Must identify/attest device separately from user/session and feed policy context without becoming network-location trust | No dedicated current test found in this pass | UNKNOWN | GAP | Historical security/device archaeology required; otherwise BUILD. |
| ID-003 | Session identity | PLATFORM003 recovered session model includes identity/authentication generation, transport generation, cursors, timestamps and terminal state | Historical durable PostgreSQL model is described; current GitHub-native runnable custody not established | Session identity must compose user/device/service identity and revocation without becoming actor authority itself | Recovered portable replay and terminal-state repair evidence; A-01/native/production not established | Historical/recovered local portable | HISTORICAL SUBSTRATE — REBIND | Recover/import exact runnable session identity slice and bind to fresh Identity contracts; preserve terminal REVOKED/CLOSED monotonicity. |
| ID-004 | Service identity | Generic principalRef can represent a service, but no typed current service-identity issuer/lifecycle is proven | No canonical durable service-principal registry proven | Must issue/resolve a stable service identity independently of IP/network location | F-WP-005/F-WP-006 only prove consumption of principal references | Current portable consumers only | PARTIAL / GAP | Recover historical service-identity infrastructure; likely adapt a generic Principal model rather than invent per-service identity stores. |
| ID-005 | Workload identity | No current short-lived workload identity mint/attestation/runtime found in inspected target/current substrate | None proven | Must provide short-lived cryptographically verifiable workload identity to policy/enforcement boundaries; no embedded reusable secret requirement | No target test found | UNKNOWN | GAP | Targeted research supports short-lived workload identity; architecture mechanism remains product decision after archaeology. |
| ID-006 | Actor chains | F-WP-005 `PrincipalLineage` records one principal plus equivalent principals, roles and attributes; it is not a delegation chain | In-memory/value-object only in current bounded F-WP scope | Must preserve actor-on-behalf-of lineage through descendants/effects/evidence | F-WP-005 SoD/equivalence tests; no generic chain-depth/ancestry test | Current portable F-WP-005 | PARTIAL | KEEP equivalence semantics; BUILD/REBIND an explicit actor/delegation chain with bounded depth and immutable attribution. |
| ID-007 | Delegated authority | F-WP-005 authorization evidence and bounded emergency scope demonstrate exact actor/action/resource/time/revocation concepts; no generic parent-child delegation authority is installed | Approval orchestrator is in-memory; no canonical delegation ledger proven | Identity owns delegation issuance/ancestry/ceilings; effect/resource/plan-specific authorities remain separate consumers/owners | F-WP-005 exact authorization/approval/emergency tests | Current portable F-WP-005 | PARTIAL | KEEP/ADAPT invariants; do not reuse change approval as generic delegation. Need durable generic delegation record and ceiling rules if archaeology finds no stronger substrate. |
| ID-008 | Capability grants | F-WP-006 `ExecutionGrant` is exact, expiring and non-transferable but is an execution/resource authorization artifact, not canonical Identity grant truth | Immutable grant value; canonical persistence not established in inspected F-WP-006 surface | Identity may own generic delegated capability/authority record; Resource/Execution and Effect authorities own their exact decision/grant products | F-WP-006 eligibility/use validation, principal/action/target/revocation checks | Current portable F-WP-006 | ADJACENT / DELEGATE | Do not migrate ExecutionGrant ownership into Identity. Identity should provide principal/delegation standing consumed by specialized grants. |
| ID-009 | Expiry | AuthorizationEvidence, approval obligations, emergency windows, execution grants and leases all have bounded time semantics | Scattered; F-WP-005 approval state is in-memory; F-WP-007 leases in-memory | Identity owns credential/delegation validity interval; specialized authorities own their own TTLs | Portable tests exist per bounded subsystem | Current portable bounded subsystems | PARTIAL / SCATTERED | Consolidate only identity/delegation expiry, not all subsystem expiry. Require current-time fail closed at enforcement boundary. |
| ID-010 | Revocation | F-WP-005 `Standing` + `revocationEpoch`; F-WP-006 binds grant to authorization revocation epoch; PLATFORM003 recovered session terminal REVOKED semantics | Current durable canonical revocation ledger not proven; recovered session durability historical only | Identity must publish current revocation standing/version/epoch that downstream grants/effects can bind and revalidate | F-WP-005/F-WP-006 portable tests; PLATFORM003 recovered portable replay | Mixed current/historical portable | PARTIAL | KEEP revocation-epoch semantics; REBIND durable session terminal revocation; build canonical identity revocation truth only if stronger recovered authority absent. |
| ID-011 | Actor attribution | principalRef is preserved across approvals, emergency decisions, execution grants and execution/effect records | Distributed bounded records; no single actor-chain truth demonstrated | Identity supplies immutable actor identity/chain; evidence/effects preserve references rather than duplicate identity truth | F-WP tests establish exact references; no whole-chain current test | Current portable consumers | PARTIAL | Preserve references and build one canonical actor/delegation lineage; projections must not become authority. |
| ID-012 | Short-lived workload identity | No installed current issuer/rotation/attestation path found | None proven | Workload identity must be short-lived, rotatable, verifiable and bound to runtime workload rather than pre-shared long-lived credential | No current target test | UNKNOWN | GAP | Targeted external research confirms this is a modern baseline; mechanism must remain pluggable and not force a specific deployment platform. |
| ID-013 | Least-privilege delegation | Exact action/resource binding, non-transferable grants, SoD, bounded emergency scope and authorization-context anti-swapping are established as local invariants | Generic durable parent->child ceiling not proven | Delegation may only narrow inherited permissions/scope/privacy/rights/cost/deadline and must remain attributable/revocable | F-WP-005/006 + SMR021 research provide partial proofs/invariants | Current portable + research | DESIGN-INVARIANT / PARTIAL | KEEP exact binding/SoD; add explicit non-expansion proof across delegation chain. Do not let child work mint new authority. |

## 5. Durability and truth-owner findings

### 5.1 F-WP-005 is not the canonical Identity store

`ApprovalOrchestrator` holds decisions in a process-local `LinkedHashMap`. It proves bounded approval semantics, exact binding, SoD and replay behavior inside its test scope. It does not prove restart-safe principal or delegation truth.

`CONTRACT-GATE-021O-P.json` is explicit that F-WP-005 **consumes** `principal identity reference`, action/resource-scoped authorization evidence, principal lineage and revocation/current standing, and that it does not implement 021O. This is decisive evidence against promoting F-WP-005 into the new Identity owner.

### 5.2 F-WP-006 is a consumer, not Identity ownership

`ExecutionGrantIssuer` rejects non-current authorization, creates an expiring exact grant for one executor principal/action/target set, and revalidates the current authorization revocation epoch when the grant is used. Those are valuable downstream invariants. The execution grant remains owned by execution/resource authority rather than Identity.

### 5.3 F-WP-007 is a consumer, not Identity ownership

`ExecutionLeaseManager` owns execution lease/fence behavior and currently holds its lease/epoch state in memory. `ownerRef` identifies the lease holder; it is not a canonical principal issuer. Identity cannot absorb placement/runtime lease truth.

### 5.4 F-WP-003 establishes a hard semantic-owner fence

`AuthorityResolver` derives semantic ownership from the immutable change revision and explicitly prevents executor/provider identity from becoming semantic authority. Preserve this as a cross-boundary invariant.

### 5.5 PLATFORM003 is useful historical substrate, not installation proof

The recovered session authority provides important terminal revocation and restart/durability semantics. Its current reconciliation explicitly says GitHub-native source custody is not established, so it must be recovered/rebound and freshly qualified before use in the fresh Identity boundary.

## 6. Targeted external research delta

External research was limited to the two questions that can materially alter the Identity design now: **workload identity** and **delegation semantics**.

### 6.1 Workload/service identity

NIST SP 800-207A (final, September 2023; official NIST/CSRC) recommends identity-tier policy using application/service identities rather than implicit network-location trust. It identifies application identity infrastructure such as SPIFFE as an example, not a mandated implementation.

Sources:
- https://csrc.nist.gov/pubs/sp/800/207/a/final
- https://www.nist.gov/news-events/news/2023/09/zero-trust-architecture-model-access-control-cloud-native-applications

SPIFFE's current documentation demonstrates a useful implementation pattern: a workload receives a stable workload identifier and short-lived X.509/JWT identity documents via a workload API, with automatic rotation and no need to ship a long-lived authentication secret with the workload.

Sources:
- https://spiffe.io/docs/latest/spiffe/concepts/
- https://spiffe.io/docs/latest/deploying/svids/

**Architecture effect:** System Master should lock the properties, not SPIFFE as a required technology: unique workload identity; attested binding to the running workload; short lifetime; rotation; verifiability; no ambient trust from network location; downstream authorization remains separate. A provider adapter may later use SPIFFE/SPIRE, native platform identity, cloud identity or another mechanism satisfying the contract.

### 6.2 Delegation versus impersonation

IETF RFC 8693 distinguishes delegation from impersonation. In delegation, the acting principal keeps its own identity while acting on behalf of another principal, and composite tokens may preserve subject plus actor/delegation-chain information. It also recommends limiting delegated rights by scope and lifetime.

Source:
- https://www.rfc-editor.org/rfc/rfc8693.html

**Architecture effect:** System Master should default to explicit delegation lineage, not identity substitution. A child/service/workload acting for a user must preserve both the originating subject and current actor identity. Impersonation, if ever supported, must be an explicitly separate high-risk authority class and must not be the generic delegation model.

## 7. First-pass adjudication

| Evidence/capability | Disposition | Reason |
|---|---|---|
| F-WP-005 `AuthorizationEvidence`, `PrincipalLineage`, revocation epoch, SoD, bounded emergency invariants | **KEEP-BUT-ADAPT** | Strong exact-binding and revocation/SoD substrate, but bounded to change governance and not durable canonical identity. |
| F-WP-003 semantic-owner/executor separation | **KEEP-AS-INVARIANT** | Prevents identity/executor from taking domain semantic ownership. |
| F-WP-006 `ExecutionGrant` | **DELEGATE / KEEP IN RESOURCE-EXECUTION OWNER** | Identity supplies current principal/delegation evidence; the specialized grant remains downstream authority. |
| F-WP-007 execution lease/fence | **DELEGATE / KEEP IN PLACEMENT-RUNTIME OWNER** | Lease ownership is runtime coordination, not actor identity. |
| PLATFORM003 durable session terminal/revocation semantics | **MIGRATE/REBIND CANDIDATE** | Durable/revocation behavior is valuable, but exact runnable custody/current qualification is missing. |
| Generic principal/delegation canonical registry + journal | **BUILD CANDIDATE, NOT YET LOCKED** | Fresh target needs one durable truth owner; no installed current owner is proven. Historical archaeology must first test whether a stronger reusable implementation exists. |
| Workload identity issuer/provider adapter | **BUILD/DELEGATE CANDIDATE, NOT YET LOCKED** | Required properties are clear; mechanism should be provider-pluggable and deployment-neutral. |
| Identity-owned execution grants/effect grants/leases | **REJECT OWNERSHIP** | Would create competing truth and violate specialist/shared authority boundaries. |
| Ambient identity from roles/network/IP/session possession | **REJECT** | Violates current boundary laws and zero-trust identity-tier findings. |

No REMOVE disposition is authorized in this pass.

## 8. Proposed target invariant set — not yet design-locked

These are candidate invariants for the next design step after archaeology, not a frozen implementation contract:

1. Every actor has one stable canonical `principal_id` and typed principal class; aliases are projections, never alternate identity authority.
2. Authentication evidence and authorization/delegation are distinct facts.
3. A delegation record always preserves `subject_principal`, `actor_principal`, parent delegation (if any), scope, constraints, issue/expiry/revocation standing and immutable evidence identity.
4. Delegation descendants may only narrow parent ceilings; widening is rejected before issuance.
5. Delegation never changes semantic ownership of specialist state.
6. Impersonation is not the generic delegation model.
7. Workload credentials are short-lived and renewable/rotatable; long-lived reusable secrets are not embedded in workloads.
8. Network location, role label or possession of a session alone cannot grant ambient privilege.
9. Revocation is versioned/monotonic or equivalently protected so downstream grants can prove whether their bound authorization standing is still current.
10. Unknown identity, delegation, chain ancestry, revocation or expiry fails closed for consequential work.
11. Identity records survive restart; UI/session/cache projections cannot become identity truth.
12. Downstream grants/effects persist immutable references to the exact identity/delegation evidence they consumed.
13. Actor/delegation chains are bounded in depth and cannot be cyclic.
14. Identity records do not store raw reusable secret/private-key material; credential material is provider/secret-system governed.
15. Every consequential effect can be attributed to both the immediate actor and originating authority chain without rewriting history.

## 9. Qualification denominator required before freeze

A future fresh Identity implementation must at minimum prove:

- stable user/device/session/service/workload principal identities without collisions;
- alias resolution cannot create a second canonical principal;
- service/workload identity cannot be inferred from network location alone;
- short-lived workload credential expiry/rotation/reissue and stale-credential rejection;
- parent-to-child delegation narrowing and attempted privilege/scope/budget/privacy/rights expansion rejection;
- subject + actor attribution and multi-hop delegation-chain preservation;
- cycle/depth/fan-out bounds;
- expiry and revocation races;
- monotonic revocation standing/version or equivalent stale-proof mechanism;
- restart/replay recovery of principal/delegation/revocation state;
- idempotent same-command issuance versus same-identity/different-bytes conflict;
- concurrent delegation issuance/revocation/currentness races;
- SoD/equivalent-principal bypass attempts;
- exact downstream binding by resource/action/work/current goal revision where applicable;
- semantic-owner takeover attempts by executor/provider identity;
- fail-closed unknown principal/delegation/revocation/evidence state;
- no raw reusable secret/private-key material in ordinary identity records;
- cumulative regression through System Root + Identity and representative downstream F-WP-005/006/007 consumers.

Portable/hosted qualification is distinct from A-01/native/production standing. A-01 remains unexecuted for the fresh Foundation System Root environment where unavailable and no A-01 claim is made here.

## 10. Exact remaining archaeology before design-lock

The next recovery pass must search historical/recovered Core security identity material specifically for:

- principal registry and typed principal schemas;
- user/device/service/workload issuer/attestation logic;
- actor/delegation chain persistence;
- generic capability delegation issuance;
- revocation ledger/versioning;
- session-to-principal binding and recovery;
- workload credential rotation;
- cryptographic identity/provider adapters;
- existing migrations/stores/tests that satisfy the fresh target without semantic collision.

Any recovered implementation is classified by current installation truth and must be rebound to the fresh architecture rather than inherited by historical label.

## 11. Exact safe successor

`CORE-IDENTITY-PRINCIPAL-DELEGATION-HISTORICAL-ARCHAEOLOGY-002 — RECOVER HISTORICAL SECURITY/IDENTITY/WORKLOAD/DELEGATION IMPLEMENTATION -> PATH-LEVEL SOURCE/STORE/TEST MAP -> DUPLICATE/CONFLICT CENSUS -> FINAL REUSE/BUILD ADJUDICATION`

Do not enter Identity DESIGN-LOCK or BUILD until this successor either recovers a stronger reusable canonical identity substrate or establishes, with explicit evidence, that the residual target must be built fresh.
