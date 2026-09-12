# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C — Implementation Contract

Status: **IMPLEMENTATION CANDIDATE — NOT PRODUCTION ACTIVE**

001C closes the executable side of the GitHub mutation boundary by adding a production gate and writer that consume the existing CG-005 admission contract, re-verify authority freshness, bind an exact mutation-plan digest, build the exact tree, create a single-parent commit from the admitted predecessor, and update the target ref with `force=false` only after a final predecessor check.

Production enforcement is a separate fact from writer correctness. The repository boundary is not closed until a live active branch ruleset targets `~ALL` branches, restricts creation/update/deletion, blocks non-fast-forward changes, and grants bypass only to one dedicated Control Gateway GitHub App integration. The ordinary ChatGPT GitHub connection, generic GitHub Actions App, repository-role bypasses, and human PATs are not production writer identities.

The dedicated writer GitHub App must have only `Contents: write` and `Metadata: read` on `BFochtman746/system-master`; it must not have Administration permission. Its client ID and private key are consumed only from the `control-gateway-production` GitHub Environment, which must be restricted to `main`. The writer workflow itself also fails closed unless `GITHUB_REF=refs/heads/main`.

The repository enforcement policy is an unbound deployment template: `writer_identity.actor_id` stays `null` in Git. At cutover/runtime, the installed dedicated App Integration actor ID is supplied as `CONTROL_GATEWAY_WRITER_INTEGRATION_ID`. The enforcement audit binds that runtime value to the template and fails closed for a missing, invalid, or conflicting identity. Deployment-specific actor identity must not be committed merely to complete the binding, because doing so would change the exact qualified SHA.

The final production cutover is ordered: qualify the executable 001C candidate; configure the dedicated App/environment; capture its Integration actor ID as runtime deployment data; fast-forward `main` to the qualified main-derived candidate as the final bootstrap write; activate the exact ruleset with only that App as bypass; read it back and audit it using the same runtime actor ID; prove the ordinary ChatGPT write path is denied; prove the dedicated receipt-consuming writer succeeds and exact replay is idempotent; only then freeze 001C as production active.

Nothing in this operation starts CG-012 or activates Second Shift Mastery.
