# GITHUB-A01-CONTROLLER-FORENSIC-RECONCILIATION-001C — Implementation Contract

Status: **IMPLEMENTATION CANDIDATE — NOT PRODUCTION ACTIVE**

001C closes the executable side of the GitHub mutation boundary by adding a production gate and writer that consume the existing CG-005 admission contract, re-verify authority freshness, bind an exact mutation-plan digest, build the exact tree, create a single-parent commit from the admitted predecessor, and update the target ref with `force=false` only after a final predecessor check.

Production enforcement is a separate fact from writer correctness. The repository boundary is not closed until a live active branch ruleset targets `~ALL` branches, restricts creation/update/deletion, blocks non-fast-forward changes, and grants bypass only to one dedicated Control Gateway GitHub App integration. The ordinary ChatGPT GitHub connection, generic GitHub Actions App, repository-role bypasses, and human PATs are not production writer identities.

The dedicated writer GitHub App must have only `Contents: write` and `Metadata: read` on `BFochtman746/system-master`; it must not have Administration permission. Its client ID and private key are consumed only from the `control-gateway-production` GitHub Environment, which must be restricted to `main`. The writer workflow itself also fails closed unless `GITHUB_REF=refs/heads/main`.

The final production cutover is ordered: qualify the executable 001C candidate; configure the dedicated App/environment; bind its Integration actor ID; fast-forward `main` to the qualified main-derived candidate as the final bootstrap write; activate the exact ruleset; read it back; prove the ordinary ChatGPT write path is denied; prove the dedicated receipt-consuming writer succeeds and exact replay is idempotent; only then freeze 001C as production active.

Nothing in this operation starts CG-012 or activates Second Shift Mastery.
