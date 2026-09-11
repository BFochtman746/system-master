# System Master Programming Controller

This directory is the **external development control plane** used to coordinate Programming/GitHub work while System Master is being built. It is not linked into the System Master iPhone product runtime.

## Current implementation slice

`WP-001M / SYSTEM-MODEL-001` is being implemented in dependency order from the R5AY Programming Controller Build Handoff.

This first slice implements `IMPL-001M-01` only:

- typed model entity and relationship registries;
- hard structural validation;
- explicit unknown-type / missing-endpoint failures;
- per-relationship cycle policy;
- dependency-cycle detection with rollback of a rejected edge;
- an explicit identity-validation port owned by 001N rather than reimplementing identity semantics here.

Not yet implemented in this slice: persistence, snapshots/change sets, authority graph resolution, import/export, authorization, evidence outbox, migration, durable job orchestration, or GitHub side effects. Those remain assigned to later 001M implementation packages or downstream authorities.

## Test

```sh
npm test
```
