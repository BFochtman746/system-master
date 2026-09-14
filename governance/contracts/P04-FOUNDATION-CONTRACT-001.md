# P04 — Foundation Contract 001

**Owner** `SYSTEM_MASTER/CORE` · **Capability** P04 Content-addressed authority writes · **Effective** 2026-09-13
**Authority** `governance/catalog/SYSTEM-MASTER-CAPABILITY-CROSSWALK-001.json`

## 1. Contract / interface

`control-gateway/src/github-authority-bootstrap.js` creates a genesis authority ref under
`control-gateway-state/active-work/` exactly once, with compare-and-swap semantics, and
proves the result by reconstruction.

- `assertBootstrapStateRef(stateRef)` — namespace and traversal guard.
- `validateBootstrapRequest(request)` — frozen request shape.
- `GitHubAuthorityBootstrapExecutor.execute(input)` — create-only ref write.
- Operation constant `CONTROL-GATEWAY-AUTHORITY-BOOTSTRAP-001`; writer Integration
  `4923612`.

Create-only by contract. There is no update and no delete, which is the entire guarantee:
an authority ref, once written, means one thing forever.

## 2. Ingress routes

One. `control-gateway-authority-bootstrap.yml`, `workflow_dispatch` only, taking
`bootstrap_request_json` as a single JSON string input.

Admission is triple-guarded: the job-level `if: github.ref == 'refs/heads/main'`, a second
ref check inside the script, and `environment: control-gateway-production`. The workflow
holds `contents: read` only — write authority comes from a per-run App token, so the
workflow itself can never write contents even if the script is wrong.

## 3. Egress routes

- The created git ref, under the active-work namespace.
- An evidence artifact uploaded with `if-no-files-found: error`.
- A structured error on failure, carrying one of eleven codes
  (`BOOTSTRAP_REF_EXISTS`, `BOOTSTRAP_POSTWRITE_MISMATCH`, and so on).

## 4. Persistence and canonical writer

The git ref is the durable state. The canonical writer is
`GitHubAuthorityBootstrapExecutor`, running as Integration `4923612` — asserted in the
constructor, so a differently-identified writer cannot construct the executor at all.

Write-once is enforced at two layers: the executor refuses when the ref already exists
(`BOOTSTRAP_REF_EXISTS`), and GitHub's create-ref API is itself atomic, so two concurrent
bootstraps cannot both succeed. Application logic and transport agree; neither is trusted
alone.

**A ref in this namespace is never deleted or moved.** Deleting one to clean up destroys
the write-once guarantee permanently and silently — recorded as a prohibition in
`ROLLBACK-PROCEDURE-001.md`.

## 5. Dependencies

- GitHub refs and commits API, via `GitHubAuthorityBootstrapTransport`.
- A publication verifier exposing `readEnvelopeAtCommit`, `verifyHistory`, `reconstruct`.
- The App installation token for Integration `4923612`.

Crosses no boundary rule; CORE-internal.

## 6. Failure semantics

**Fail-closed at every guard, and verified after the write as well as before.**

Pre-write: ref already exists → `BOOTSTRAP_REF_EXISTS` with the observed sha. Commit does
not resolve exactly → `BOOTSTRAP_COMMIT_MISMATCH`. Parent is not the exact expected
predecessor, or there is not exactly one parent → `BOOTSTRAP_PREDECESSOR_MISMATCH`.
Publication head missing → `BOOTSTRAP_PUBLICATION_INVALID`. Namespace escape or traversal
→ `BOOTSTRAP_NAMESPACE_FORBIDDEN`. Wrong writer → `BOOTSTRAP_WRITER_UNAUTHORIZED`.

Post-write: the executor re-reads and reconstructs. If the ref does not resolve to the
exact publication commit, or revision is not 1, or either digest differs →
`BOOTSTRAP_POSTWRITE_MISMATCH`.

Post-write verification is the part most systems omit. A CAS that only checks preconditions
proves what it intended, not what happened.

Idempotency: retrying a completed bootstrap fails closed with `BOOTSTRAP_REF_EXISTS`. Safe
to retry; never silently a no-op that a caller could read as success.

## 7. Evidence target

The workflow's evidence artifact per run, plus the created ref itself, which is
self-describing: envelope, revision 1, packet digest, publication digest, writer
integration id.

Live proof: `Control Gateway Authority Bootstrap #1`, 2026-09-13, Success, 1 artifact.

## 8. Acceptance target

```
cd control-gateway && node --test test/github-control-adapter-repair.test.js
```

**PASS** when all 14 bootstrap cases pass: ref exists, forbidden namespace, commit
mismatch, predecessor mismatch, revision invalid, subject mismatch, missing mirror, packet
digest, publication digest, stale qualification, unauthorized writer, concurrent race, and
post-write mismatch. Runs in the `control-gateway-suite` CI job.

## 9. Authority boundary

**Lane may decide alone (`agent`):** error message wording, additional negative tests,
internal refactoring preserving the request shape and error codes.

**Requires the owner (`owner`):** changing the active-work namespace; changing the writer
integration id; adding any update or delete path; relaxing a post-write check; granting
the workflow `contents: write`.

Any change that makes a write non-create-only ends this capability. There is no
incremental version of that.

## 10. Open gaps

None in the module. One operational note: `actions/checkout` is pinned to a different SHA
here than in the enforcement workflow. Harmless today, worth converging for supply-chain
consistency.
