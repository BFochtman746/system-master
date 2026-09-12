# CORE Durable Runtime / Continuity Qualification Denominator Freeze 001

**Date:** 2026-09-12  
**Lane:** Foundation / Spine — Durable Runtime / Continuity  
**Active branch reread before mutation:** `second-shift/core-durable-runtime-continuity-recovery-001-20260912@1ae459bee3e0497cd8bcee227ef5a4b83fe0f864`  
**Live Foundation owner:** `system-master/control-v2@54de1268b1036f966dd9235f5463e430ab1fcd19`  
**Predecessor:** `CORE-DURABLE-RUNTIME-CONTINUITY-COLLISION-BLOCKER-MATRIX-001.md`  
**Standing:** `QUALIFICATION_DENOMINATOR_FROZEN__OVERLAP_AWARE__FIRST_BOUNDED_ADAPTER_SLICE_IDENTIFIED__FULL_CONTINUITY_BUILD_REMAINS_BLOCKED`

## 1. Purpose

Freeze the non-shrinkable qualification obligations for the reconstructed Durable Runtime / Continuity lane without falsely summing overlapping behaviors as independent proof, and determine whether any changed adapter slice can be built using only current concrete providers.

This document is a test/evidence contract. It is not PASS evidence and does not authorize the full continuity build.

## 2. Evidence classes

Every obligation is classified into one of these execution classes:

- `EXECUTABLE_NOW_BASE` — exact current hosted-portable subject exists and its existing regression can run now.
- `EXECUTABLE_AFTER_BOUNDED_ADAPTER_BUILD` — all semantic providers needed by the slice are current and concrete; only the changed adapter subject is missing.
- `PROVIDER_BLOCKED` — one or more exact current provider contracts/implementations are missing or source-authority blocked.
- `LIVE_DATABASE_BLOCKED` — requires live PostgreSQL / target database behavior not executed by the current portable evidence.
- `NATIVE_A01_PRODUCTION_BLOCKED` — requires native/device/A-01/production evidence not executed here.
- `HUMAN_OR_EXTERNAL_PROVIDER_BLOCKED` — requires real human, credential, provider or externally authoritative evidence.
- `SPECIALIST_EXTERNAL` — Book/Learning/Documents/Programming semantic correctness; outside this lane and never manufactured here.

Hosted/portable PASS can satisfy only hosted/portable claims. It cannot be promoted into any stronger class.

## 3. Master non-shrinkable obligation registry

| Obligation family | Frozen denominator / identity | Current execution class | What is already evidenced | What remains |
|---|---:|---|---|---|
| Recovered continuity requirements | **42 exact G-WP-008..015 rows** | mixed: base + provider-blocked | all 42 are losslessly accounted against current F003/backend and foreign seams | changed continuity implementation must prove every affected row; provider-owned rows stay blocked until current provider contracts exist |
| Owner-local continuity persistence | **80 cases** | `EXECUTABLE_AFTER_BOUNDED_ADAPTER_BUILD` with live-DB subset additionally blocked | current F003 provides substantial durable substrate and fresh portable base regression | full P1-P8 / TX1-TX7 changed-subject denominator not yet executed |
| Effect seam | **48 cases** | `PROVIDER_BLOCKED` | consumer-side semantic boundary frozen | exact current Effect Authority provider/runtime absent |
| Evidence seam | **40 cases** | `PROVIDER_BLOCKED` | consumer-side semantic boundary frozen | exact durable Evidence provider/interface not frozen/qualified |
| Transport seam | **36 cases** | `PROVIDER_BLOCKED` | carriage semantics/recovery rules frozen | generic current Transport provider/source custody absent |
| Security seam | **40 cases** | `PROVIDER_BLOCKED`; real secret/provider cases also `HUMAN_OR_EXTERNAL_PROVIDER_BLOCKED` | consumer-side policy/privacy/secret/crypto semantics frozen | exact shared provider interfaces and production secret-provider standing absent |
| Resource / Placement / Runtime fence | **52 cases** | `PROVIDER_BLOCKED` | owner split and Runtime fence semantics frozen | current Resource Admission and Placement providers/interfaces absent; Routing also unresolved |
| Identity / Delegation regression | **36 cases; 16/16 invariants** | `EXECUTABLE_NOW_BASE` | frozen hosted-portable current authority mechanics | changed Runtime adapter cases still need execution; real credentials/native/production remain external |
| Contracts / Versioning regression | **48 cases; 30/30 invariants** | `EXECUTABLE_NOW_BASE` | frozen hosted-portable current authority mechanics | changed Runtime adapter cases still need execution; real format validators/native/production remain external |
| Keel regression | **56 isolated cases; 32/32 invariants** | component regression `EXECUTABLE_NOW_BASE`; Runtime attachment `PROVIDER_BLOCKED` | frozen hosted-portable governed-intent reference authority | exact Goal -> Work attachment blocked by Work/Project source authority |
| System Root / Authority Registry regression | current frozen Foundation regression | `EXECUTABLE_NOW_BASE` | current hosted-qualified owner identity/version boundary | execute whenever changed adapter consumes owner/version identity |
| Current F003 Durable Runtime base | F003 parity + strict Java compile + **24,253 authority assertions + 95 JDBC-contract assertions** | `EXECUTABLE_NOW_BASE` | fresh portable PASS on byte-verified bounded substrate | live PostgreSQL, full changed continuity/adapters, native/A-01/production remain open |
| Work / Project adapter cases | numeric denominator intentionally **not fabricated** | `PROVIDER_BLOCKED` | owner boundary known | current semantic authority/interface absent (`BLOCKED_RECOVERY_SOURCE_AUTHORITY`) |
| Planning / Orchestration adapter cases | numeric denominator intentionally **not fabricated** | `PROVIDER_BLOCKED` | owner boundary known | current Plan/Step/readiness contract absent (`BLOCKED_RECOVERY_SOURCE_AUTHORITY`) |
| Capability Routing adapter cases | numeric denominator intentionally **not fabricated** | `PROVIDER_BLOCKED` | owner boundary known | exact route receipt/provider contract absent |

## 4. No fake cumulative total

The master denominator is the **union of obligations**, not the arithmetic sum of every row above.

The 42 recovered requirements overlap the persistence and seam families. Identity, Contracts, Keel and F003 component regressions also overlap behaviors exercised by future adapter cases. Therefore this freeze deliberately does **not** publish a fake single independent case total.

Qualification reporting must provide:

1. every frozen obligation identifier/family;
2. exact changed-subject test case(s) that satisfy it;
3. exact evidence artifact/run;
4. environment/evidence class;
5. provider dependencies;
6. blocker or PASS standing;
7. explicit overlap links when one executed case satisfies multiple obligations.

An overlap is allowed. An omitted obligation is not.

## 5. Environment fence

### Hosted-portable executable now

- current Identity / Delegation regression;
- current Contracts / Versioning regression;
- current Keel component regression;
- current System Root affected regression;
- current bounded F003 parity/strict-compile/portable authority/JDBC-contract regression.

### Live PostgreSQL blocked

At minimum:

- F003 JDBC transaction, locking, restart and concurrency behavior against a real current PostgreSQL target;
- any changed adapter behavior whose correctness depends on real transaction/isolation/database-clock semantics.

### Native / A-01 / production blocked

At minimum:

- device/native power-loss semantics;
- A-01 execution;
- production persistence/admission/SLO evidence;
- distributed/network-filesystem writer safety when applicable.

### Human / external-provider blocked

At minimum:

- real credential/provider standing;
- real secret provider lifecycle;
- human approval/participant-response truth;
- external effect/provider truth when required.

### Specialist external

Book, Learning, Documents and Programming semantic correctness are explicitly outside this denominator except for generic Foundation interface conformance. Their domain truth remains owned by those systems.

## 6. First bounded executable adapter slice

A safe first changed slice **does exist** without guessing any blocked provider schema:

**`CORE-DURABLE-RUNTIME-CONTINUITY-IDENTITY-CONTRACTS-PREFLIGHT-ADAPTER-001`**

### Scope

Build a side-effect-free Durable Runtime preflight adapter that consumes only the already current hosted-portable Identity and Contracts authorities before a Runtime-owned mutation boundary.

It may consume:

- Identity `CapabilityUseRequest` -> `CapabilityValidationReceipt` / required delegation receipt refs;
- Contracts `GateReceipt` and `CompatibilityDecisionReceiptV1` for the exact structural/version subject being used by the Runtime operation;
- System Root owner/version identity only as needed to verify the provider identities.

It must return only bounded prerequisite standing such as `ALLOW_CURRENT_PREREQUISITES`, `DENY`, `UNKNOWN/BLOCKED`, plus exact receipt refs/digests and reason codes. The name is illustrative; the implementation must preserve the existing provider contracts rather than create a new authority type.

### Explicit exclusions

This first slice must **not** consume or fabricate:

- Keel -> Work lineage attachment;
- WorkId / ProjectId / lifecycle / completion;
- Plan/Step readiness or cancellation authority;
- Resource grants or budgets;
- route/provider selection;
- Placement assignment;
- Transport delivery standing;
- Effect authorization;
- Evidence PASS/standing;
- Security/secret resolution;
- specialist semantics.

A successful Identity + Contracts preflight therefore does **not** mean the overall Runtime operation is authorized. It means only that those two prerequisite authorities are current and compatible.

## 7. Frozen first-slice changed-subject denominator

The first adapter slice may be implemented only with this new **26-case minimum changed-subject denominator**, plus all affected current component regressions.

### IC-A — exact Identity receipt binding: 6

1. exact principal/grant/subject/action binding succeeds;
2. wrong principal fails closed;
3. wrong grant/subject fails closed;
4. wrong action/scope fails closed;
5. exact receipt digest/reference is preserved;
6. caller-supplied boolean/claim without current receipt is rejected.

### IC-B — Identity freshness and invalidation: 6

7. revoked grant denied;
8. suspended/non-usable grant denied;
9. expired grant denied;
10. advanced authority generation invalidates stale receipt/use;
11. UNKNOWN/unavailable principal or standing blocks;
12. retry/reconnect re-reads current Identity state rather than trusting cached success.

### IC-C — Contracts structural/version gate: 6

13. exact current compatible contract passes;
14. unknown subject/version blocks;
15. incompatible decision blocks;
16. validator UNKNOWN/error blocks;
17. migration-required subject cannot be treated as directly compatible;
18. exact gate/compatibility receipt subject/version/digest is preserved.

### IC-D — separation and semantic idempotency: 4

19. Identity allow cannot grant Effect permission;
20. Contracts compatible cannot grant Identity, Resource, Placement or Runtime authority;
21. same semantic preflight request id + same digest reconciles idempotently;
22. same request identity + changed semantic digest fails conflict.

### IC-E — restart / evidence-class boundary: 4

23. process restart does not turn cached preflight success into current standing without revalidation where required;
24. stale provider version/owner identity blocks until rebound;
25. hosted-portable provider evidence remains labeled hosted-portable and is not promoted to native/A-01/production;
26. preflight result contains no bearer secret/raw credential/private key material.

**Changed-slice minimum: 26 cases.**

These 26 cases are not an independent cumulative total. They may satisfy parts of the 42-row/persistence/cross-owner obligations and must be cross-referenced accordingly.

## 8. Required regressions for the first slice

Any candidate implementing the 26-case slice must also execute, on the exact candidate tree where available:

- current System Root affected regression;
- all 36 Identity / Delegation cases;
- all 48 Contracts / Versioning cases;
- current bounded F003 portable regression: parity verifier, strict Java compile, authority suite, JDBC-contract portable suite;
- ungoverned A-01 rejection/evidence-class guard where that Foundation workflow policy applies.

Keel component regression is required if the changed candidate imports or touches Keel code/contracts, but the first slice is deliberately designed so it does not need to make a Keel -> Work attachment claim.

## 9. Build authorization decision

**Full Durable Runtime / Continuity build remains NOT AUTHORIZED.**

**The first bounded Identity + Contracts preflight adapter slice is AUTHORIZED FOR DESIGN/IMPLEMENTATION/PORTABLE QUALIFICATION ONLY**, subject to all of these fences:

- no schema invention outside the current Identity/Contracts contracts;
- no mutation of peer authority state;
- no claim that preflight success authorizes a whole Runtime operation;
- no Work/Project, Orchestration, Resource, Routing, Placement, Transport, Effect, Evidence, Security or specialist semantics;
- no A-01/native/production claim;
- no historical PASS transfer;
- exact 26-case changed-subject denominator plus affected regressions must pass before this slice can be frozen/merged.

## 10. Exact next operation

**`CORE-DURABLE-RUNTIME-CONTINUITY-IDENTITY-CONTRACTS-PREFLIGHT-ADAPTER-001`**

Implement the smallest side-effect-free Runtime prerequisite adapter described above, bind it directly to the frozen Identity and Contracts interfaces, add the exact 26-case changed-subject qualifier, run all affected hosted-portable regressions, preserve environment labels, and freeze only if the exact candidate tree passes without denominator narrowing.

If implementation inspection reveals that either provider requires an unbound Work/Project, Orchestration, Resource, Routing, Placement, Transport, Effect, Evidence or Security field to perform this bounded validation, stop and classify that dependency rather than inventing it.

## 11. Evidence fence

This freeze is a qualification/design authorization only. It claims no changed adapter PASS yet, no whole-continuity PASS, no live PostgreSQL result, no native/A-01/production standing, no real provider/credential/human evidence and no specialist-system correctness.
