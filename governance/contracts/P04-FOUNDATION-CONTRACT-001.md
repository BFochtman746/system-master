# P04 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P04 Content-addressed authority writes · **Effective** 2026-09-13
**Authority** `governance/CURRENT-AUTHORITY.json` (`CURRENT-AUTHORITY-005`) · **Crosswalk** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-003.json`

## 1. Contract / interface

`control-gateway/src/github-authority-bootstrap.js` implements the create-only genesis authority write used by `.github/workflows/control-gateway-authority-bootstrap.yml`.

- `assertBootstrapStateRef(stateRef)` guards the `control-gateway-state/active-work/` namespace.
- `validateBootstrapRequest(request)` binds the exact publication commit, predecessor, digests, subject, target ref, epoch, operation and allowed paths.
- `validateBootstrapWriterCredential(identity)` requires a credential-derived GitHub App slug, an owner-configured expected App slug, and a positive installation id. A slug mismatch fails `BOOTSTRAP_WRITER_UNAUTHORIZED` before any write.
- `GitHubAuthorityBootstrapExecutor.execute(input)` performs a create-only ref write and reconstructs the result after mutation.

Foundation 1.0 does not treat a caller-supplied numeric integration id as credential proof. Writer identity is derived from `actions/create-github-app-token` outputs and is preserved in the execution receipt.

## 2. Ingress routes

One production ingress: `control-gateway-authority-bootstrap.yml`, `workflow_dispatch` only, with `bootstrap_request_json` as one JSON input.

The job must run at exact `refs/heads/main` inside `control-gateway-production`. The token step uses owner-controlled `CONTROL_GATEWAY_WRITER_CLIENT_ID` plus the private key; the bootstrap step receives the token step's actual `app-slug` and `installation-id`, and separately receives owner-controlled `CONTROL_GATEWAY_WRITER_APP_SLUG` as the expected identity. Missing identity metadata or actual/expected slug mismatch fails closed.

The workflow itself retains `contents: read`; create-ref authority exists only in the repository-scoped App installation token and requests `permission-contents: write` for that token.

## 3. Egress routes

- One newly-created git ref under `control-gateway-state/active-work/`.
- `bootstrap-receipt.json` containing publication identity plus `writer_app_slug`, `writer_installation_id`, and `writer_identity_source`.
- Immutable workflow evidence artifact with `if-no-files-found: error`.
- Structured fail-closed errors including `BOOTSTRAP_REF_EXISTS`, `BOOTSTRAP_WRITER_UNAUTHORIZED`, `BOOTSTRAP_REF_RACE`, and `BOOTSTRAP_POSTWRITE_MISMATCH`.

No update or delete path is offered.

## 4. Persistence and canonical writer

The git ref is durable state. The canonical writer is `GitHubAuthorityBootstrapExecutor` only when invoked through the production workflow with a repository-scoped GitHub App installation token whose credential-derived App slug equals owner-configured `CONTROL_GATEWAY_WRITER_APP_SLUG` and whose credential-derived installation id is valid.

Write-once is enforced twice: the executor requires the ref to be absent, and GitHub's create-ref operation is atomic. A race returning 409/422 is converted to `BOOTSTRAP_REF_RACE`; it is never reinterpreted as success.

The previous constant `4923612` is not used as authorization evidence because the old wrapper supplied that expected value to the executor itself. Foundation 1.0 authorization now binds to the token-mint step's identity outputs instead of a self-asserted constructor value.

## 5. Dependencies

- GitHub refs/commits API through `GitHubAuthorityBootstrapTransport`.
- `GitHubActiveWorkPublisher` for exact publication verification and reconstruction.
- `actions/create-github-app-token`, pinned by commit, for a repository-scoped installation token and credential-derived identity outputs.
- Owner-controlled GitHub environment `control-gateway-production` containing the writer client id, private key and expected App slug.

P04 does not own GitHub App provisioning, secret storage, environment administration or external provider policy.

## 6. Failure semantics

**Fail closed before mutation on authority, identity or content doubt.**

- Missing/invalid actual App slug, expected App slug or installation id → `BOOTSTRAP_WRITER_UNAUTHORIZED`.
- Actual App slug != owner-configured expected App slug → `BOOTSTRAP_WRITER_UNAUTHORIZED`.
- Existing authority ref → `BOOTSTRAP_REF_EXISTS`.
- Namespace escape/traversal → `BOOTSTRAP_NAMESPACE_FORBIDDEN`.
- Commit/predecessor/digest/subject/target/epoch/operation/allowed-path mismatch → the corresponding deterministic bootstrap error.
- Create race/rejection → `BOOTSTRAP_REF_RACE`.
- Post-write reconstruction mismatch → `BOOTSTRAP_POSTWRITE_MISMATCH`.

A completed bootstrap is intentionally not idempotent-as-success: retrying it fails `BOOTSTRAP_REF_EXISTS`, preserving the write-once meaning.

## 7. Evidence target

Foundation qualification must preserve machine-readable exact-subject evidence containing current authority/crosswalk identity, qualification run/head identity, exact Git blob SHAs for the executor, wrapper, production workflow, tests, contract and qualification workflow, exact test counts, identity-wiring assertions and immutable Actions artifact identity when admitted.

Production execution evidence is `bootstrap-request.json` plus `bootstrap-receipt.json`; the receipt identifies the credential-derived App slug and installation id used for the create-only mutation.

A Foundation PASS proves the repository implementation and fail-closed identity routing. It does **not** claim that production secrets/environment variables are configured, does not grant publication authority, and does not transfer a historical live run across changed subjects.

## 8. Acceptance target

```bash
cd control-gateway
node --test test/github-control-adapter-repair.test.js
```

**PASS** requires exactly **21 tests** in this focused file, including exactly **17 `bootstrap ...` cases**, zero failures, and explicit coverage for App-slug mismatch, missing writer identity, invalid installation id, credential-derived identity receipt, existing-ref refusal, namespace restriction, content/predecessor/digest checks, create race and post-write reconstruction.

Qualification must additionally prove by exact workflow text that the production token step exposes its real `app-slug` and `installation-id` to the wrapper, that expected slug comes from `vars.CONTROL_GATEWAY_WRITER_APP_SLUG`, that the App token requests contents-write permission, and that the job remains environment-gated with workflow-level contents-read permission.

Repository qualification: `.github/workflows/p04-content-addressed-authority-write-foundation-qualification.yml`.

## 9. Authority boundary

**CORE/P04 may decide:** deterministic validation/refactoring, additional negative tests, receipt fields and implementation details that preserve create-only behavior and strengthen identity/content checks.

**Owner authority required:** changing the namespace; changing the expected writer App identity/configuration; provisioning/replacing GitHub App credentials; changing environment protection; adding update/delete/move behavior; relaxing post-write verification; or granting broader repository/provider authority.

Repository qualification cannot grant native/private/external/publication/production authority. A missing production identity variable must fail closed rather than be filled by a guessed value.

## 10. Open gaps

No Foundation-local implementation gap remains once the exact-subject P04 qualification passes.

Operational production use still requires the owner-controlled `control-gateway-production` environment to contain a valid writer client id, private key and expected App slug. That is configuration/credential authority outside repository evidence and is not silently counted as Foundation implementation proof.
