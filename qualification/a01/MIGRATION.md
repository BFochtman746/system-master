# A-01 Workflow Migration

## Target shape

A workstream owns a small Node qualification wrapper. The wrapper may invoke Java, Python, HTTP fixtures, or repository-specific tests. It is registered in `qualification/a01/registry.json`. The workstream then calls the shared gateway rather than declaring its own A-01 job.

## Migration steps

1. Identify the existing A-01 workflow's exact qualification boundary.
2. Move orchestration into a repository-owned `.github/scripts/<qualification>-qualify.js` wrapper if it is not already there.
3. Ensure the wrapper exits non-zero for subject failure and writes useful detailed evidence under `A01_EVIDENCE_DIR` when provided.
4. Add a registry entry with workstream ID, gate class, Node wrapper, artifact name, and description.
5. Replace direct A-01 jobs with a thin reusable-workflow caller of `.github/workflows/a01-control-plane-gateway.yml`.
6. Supply the exact subject SHA and return-routing fields.
7. Remove workstream-specific runner concurrency after the gateway is proven; the shared gateway owns `a01-global`.
8. Preserve legacy evidence semantics until the migrated gate passes equivalence qualification.

## Thin caller example

```yaml
jobs:
  qualify:
    uses: ./.github/workflows/a01-control-plane-gateway.yml
    with:
      qualification_id: LEARNING-IMPL-XYZ
      workstream_id: LEARNING
      subject_sha: ${{ github.sha }}
      origin_ref: ${{ github.ref }}
      resume_on_pass: Promote exact tested SHA and continue to the next dependency-valid objective.
      resume_on_failure: Diagnose evidence, repair only the failing gate when sufficient, and rerun the minimum gate.
      notification_target: originating-workstream
```

Do not pass executable or shell command text from the caller. Execution is resolved from the registry.
