# CONTROLLER-V2-002D-C1 FORENSIC RESEARCH + ADJUDICATION 001

Date: 2026-09-12
Standing: **RECOVERED / INVENTORIED / ANALYZED / TARGETED-RESEARCH COMPLETE FIRST PASS / ADJUDICATED / DESIGN-LOCK NOT YET AUTHORIZED**
Classification: **SUPPLEMENTAL NON-PEER WORK**

## 1. Authority and lineage recovered

The qualified Controller V2 lineage is:

`CONTROLLER-FOUNDATION-002B -> CONTROLLER-FOUNDATION-002C -> CONTROLLER-FOUNDATION-002C-C1 -> CONTROLLER-FOUNDATION-002D`

Frozen/observed subjects:

- 002B qualified transaction kernel: `f15a5e7bfd910ed2239af954ee29ad42e9b866d7`
- 002C qualified GitHub durability subject: `8b0f9517570fa29f3f09bc7f1db38c34fcbe84fa`
- 002C-C1 current qualified branch head: `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`
- pre-C1 002D discovery/design branch head: `9436cf761888542c0a801089615271a9fff4ab66`
- C1/002D merge base: `040947b8ac82e78071caa34d3de2e484d8e9be81`

Git comparison proves the old 002D branch is **diverged** from C1: it is one commit ahead of the old merge base and three commits behind the qualified C1 branch. The only 002D-specific delta is the provisional `controller-v2/FOUNDATION-002D.md` document. Therefore the old 002D branch is useful research/provisional design evidence, but it is **not** a valid implementation or qualification descendant of C1.

### Adjudication A

**Do not build on `controller-v2/foundation-002d` as if it were the current parent.** The next Controller V2 work must be reconstructed/rebased from exact qualified C1 head `a2ed4205...`, carrying forward only adjudicated 002D requirements/design evidence.

## 2. C1 production boundary recovered

C1 is implemented and targeted portable qualification passed 11/11, but live production activation remains `BLOCKED_EXTERNAL_SETUP`.

C1 requires, among other things:

- exact frozen 002C subject binding;
- authoritative preflight;
- a control-state repository distinct from the System Master subject repository;
- stable numeric repository identity;
- distinct journal and anchor refs;
- distinct journal and anchor GitHub App principals;
- exact verified journal/checkpoint agreement;
- immutable Git transport revision;
- valid anchor standing;
- bound control-state genesis Git object ID.

No current repository state may be treated as live production Controller authority merely because C1 portable code passed.

### Adjudication B

002D can proceed through portable specification, implementation and isolated qualification against the frozen C1 contract, but **production ingress activation must remain blocked until C1's external control-state installation is actually present and revalidated**.

## 3. 002D requirement inventory recovered

The prior 002D document already contains a strong first-pass requirement set. The core invariants survive C1 reconciliation:

1. Submitted commands remain durably discoverable while the local Controller is offline.
2. Chat history, notifications, webhooks, GitHub Actions queueing and dispatch events are not command authority.
3. Concurrent chat submissions must not overwrite each other.
4. A command is immutable after submission; corrections/supersession are new commands.
5. Same command identity + same canonical bytes is idempotent; same identity + different bytes is a hard conflict.
6. Git commit/tag author text is not authenticated logical-user authority.
7. Transport authorization and semantic command authorization are separate.
8. Accepted commands enter the frozen 002B idempotency/transaction layer semantically once.
9. Rejected ingress is auditable without creating a product transaction.
10. Wake delivery may be lost or duplicated without losing command truth.
11. Local-state loss must be recoverable by rescanning durable command authority.
12. Inbox state must not mutate System Master subject state or the 002C journal/anchor refs.
13. Production protections must be mechanically preflighted.
14. Ingress writer authority is create-once, never update/delete existing command authority.
15. High-impact command arrival is candidate intent, never automatic execution authority.

## 4. Targeted external research

Authoritative current sources were checked on 2026-09-12.

### GitHub Git tag/ref model

GitHub's REST Git Tags documentation confirms that the API creates **annotated tag objects**, and creating a tag object does **not** create the `refs/tags/...` reference; the reference is created separately. This supports the provisional three-object representation: canonical command blob -> annotated tag object -> immutable tag ref.

Source: https://docs.github.com/en/rest/git/tags

GitHub's Git References API supports listing matching references and creating references. Fine-grained create-ref authority requires repository Contents write permission. This supports durable prefix discovery, but the exact production principal and raw-Git-object write path still require environment verification.

Source: https://docs.github.com/en/rest/git/refs

### GitHub rulesets

GitHub rulesets can target tags using `fnmatch`, and can restrict creation, updates and deletion. Bypass actors can include GitHub Apps. Multiple rulesets targeting the same ref layer together, with the effective restrictions aggregated.

Sources:

- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://docs.github.com/en/rest/repos/rules

This supports the prior design choice to use **separate layered rulesets**: one creation-authorization ruleset with the ingress principal as creation bypass, and a second immutability ruleset restricting update/deletion without granting that ingress principal a bypass that would weaken immutability.

### Webhooks / wakeups

GitHub explicitly states failed webhook deliveries are **not automatically redelivered**. Manual/API redelivery is possible for a bounded historical window, but webhook delivery cannot be durable command truth.

Sources:

- https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries
- https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks

This confirms the existing invariant: notification/wakeup is only a hint; startup/periodic polling of durable command refs is mandatory.

### Idempotency

AWS Builders' Library guidance recommends a caller-provided unique request identifier, preserves that identifier across retries, and treats reuse of the same identifier with changed intent/parameters as a validation conflict. It also emphasizes atomically coupling idempotency state with mutating effects.

Source: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

This independently supports the frozen 002B/002D rule: command ID + exact canonical command identity is the duplicate guard; same ID with different bytes must fail closed rather than be silently treated as a retry.

### Queue concurrency

PostgreSQL documents `SKIP LOCKED` as appropriate for reducing lock contention among multiple consumers of queue-like tables, while explicitly warning that it provides an inconsistent view unsuitable for general-purpose truth reads.

Source: https://www.postgresql.org/docs/current/sql-select.html

This is relevant only to a future local execution projection/claim queue. It does **not** replace the immutable Git command authority or 002B semantic journal.

## 5. Design alternatives re-adjudicated

### Shared mutable inbox branch

**REJECT for authoritative v1 ingress.** It reintroduces a shared CAS head and grants an ingress writer update authority over the same persistent authority surface.

### GitHub Issues/comments

**REJECT as command authority.** Useful only as a UI/projection because records are editable/deletable and issue semantics would become part of authority.

### `repository_dispatch` / webhook / workflow dispatch

**REJECT as authority; retain only as wakeup hints.** Durable polling remains mandatory.

### One immutable protected ref per command

**RETAIN as preferred v1 architecture**, subject to the unresolved production-principal and protection-preflight gates below. It removes shared-head submission contention and maps one command identity to one create-once authority object.

## 6. C1-aligned provisional 002D design

Preferred namespace remains:

`refs/tags/controller-inbox/v1/<command-id>`

Preferred object chain remains:

`canonical CommandEnvelope blob -> annotated tag object -> protected immutable tag ref`

The Controller must validate at discovery:

- exact namespace/version;
- exact command ID syntax and ref/blob identity match;
- tag object target type is `blob`;
- canonical UTF-8 JSON;
- frozen 002B strict envelope validation;
- content/fingerprint consistency;
- activated control-state repository ID equals the C1-bound repository identity;
- effective protection/ruleset evidence is observable and satisfies the frozen ingress rules;
- notification payload is never sufficient evidence;
- command admission policy is evaluated after transport validation.

Recovery remains authoritative from protected refs + semantic journal, not from a disposable index or notification history.

## 7. Required new lossless trace dimensions

Every 002D requirement must be closed through:

`requirement/invariant -> implementation -> durable state -> interface/contract -> tests -> evidence -> environment -> blocker`

Minimum durable-state objects to specify before BUILD:

- `CommandIngressObservation`
- `CommandIngressDecision`
- `CommandIngressProvenance`
- `IngressProtectionStanding`
- `IngressRecoveryCheckpoint` (projection only; never sole authority)

Minimum interfaces/contracts to freeze before BUILD:

- command ref discovery adapter;
- immutable tag/blob reader;
- effective-protection preflight;
- frozen 002B `acceptCommand` handoff;
- 002C semantic journal event publisher;
- rejected/deferred ingress audit contract;
- recovery/rescan contract;
- optional wake-hint adapter.

## 8. Unresolved blockers before DESIGN-LOCK

The following are real blockers and must not be guessed:

1. **Ingress principal identity/capability.** Verify the exact principal available to the intended ChatGPT-to-GitHub write path and whether it can create raw Git blobs/tag objects/refs under a dedicated least-privilege GitHub App or equivalent authority.
2. **Production ruleset preflight for tag refs.** Freeze the exact ruleset target expression and the machine-verifiable method for proving all active layered rules applicable to a candidate `controller-inbox/v1/*` tag.
3. **Schema persistence boundary.** Bind ingress provenance/decision state to a schema that cannot weaken or mutate the frozen 002B CommandEnvelope semantics.
4. **Bounded rejection taxonomy.** Freeze error classes without storing secrets/raw sensitive diagnostics.
5. **Resource limits.** Determine and test maximum command envelope size, scan page size, backlog limits, retry/backoff and rate-limit behavior from measured/contractual constraints rather than arbitrary values.
6. **Recovery equivalence.** Formally specify behavior when local ingress observations are lost but a command already exists in the 002B/002C semantic history.
7. **High-impact approval boundary.** Preserve as a later admission/approval layer; 002D transport acceptance must not imply authorization to execute destructive/high-impact commands.
8. **C1 production installation.** Production activation remains blocked externally even if portable 002D code later passes.

## 9. Test denominator disposition

The prior 26-test denominator is preserved as a **minimum**, not as closure proof. C1 reconciliation adds mandatory tests for:

- C1 activation fingerprint/repository identity mismatch blocks ingress;
- command namespace in System Master subject repo is rejected for production authority;
- inbox write never changes journal or anchor refs;
- layered ruleset ambiguity/missing visibility blocks authoritative activation;
- creation-authorized ingress principal still cannot update/delete an existing command ref;
- a different principal with repository write access but no ingress creation authority cannot submit an authoritative command;
- semantic acceptance remains idempotent after local observation database loss;
- same command ID/different canonical bytes yields hard conflict with no product mutation;
- wake-only events with forged command data cannot create or alter a transaction;
- full authoritative rescan reaches the same accepted/rejected/deferred semantic result as uninterrupted ingestion, modulo explicitly nondeterministic external admission dependencies.

No test is marked PASS by this research artifact.

## 10. Exact successor

`CONTROLLER-FOUNDATION-002D-C1-REBIND-001`

Execute from exact qualified C1 head `a2ed4205cb7674b41f09db42fd9e687cdcf8eb2d`:

1. create a C1-descended 002D work lineage;
2. port the adjudicated 002D requirements/design, not the stale branch ancestry;
3. resolve or explicitly fence the blockers above;
4. freeze formal schemas/contracts and expanded test denominator;
5. only then enter BUILD;
6. run isolated qualification, adversarial/failure-injection tests and cumulative Controller regression before any freeze;
7. preserve `BLOCKED_EXTERNAL_SETUP` for production activation until actual C1 control-state installation evidence exists.

## 11. Current standing

- RECOVER: **PASS**
- INVENTORY: **PASS first forensic pass**
- ANALYZE: **PASS first forensic pass**
- TARGETED RESEARCH: **PASS first current-source pass**
- ADJUDICATE: **PASS first pass**
- DESIGN-LOCK: **BLOCKED on enumerated unresolved authority/environment/schema limits**
- BUILD: **NOT STARTED from C1 lineage**
- ISOLATED QUALIFICATION: **NOT STARTED for C1-descended 002D**
- CUMULATIVE REGRESSION/CALIBRATION: **NOT STARTED**
- FREEZE: **NOT STARTED**

No A-01, native, external production, private, author, human or publication evidence is claimed by this record.
