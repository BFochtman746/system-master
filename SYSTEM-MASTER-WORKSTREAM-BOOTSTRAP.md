# System Master Workstream Bootstrap

This file is the cross-chat entry point for work in `BFochtman746/system-master`.

## Required startup

Before a workstream schedules or adjudicates A-01 machine qualification, read:

1. `qualification/a01/A01-OPERATING-CONTRACT.md`
2. `qualification/a01/a01-policy.json`
3. `qualification/a01/registry.json`

These repository artifacts, not conversation memory, are authoritative for A-01 usage.

## Workstream behavior

- Build and prequalify before requesting A-01.
- Use a registered qualification through `.github/workflows/a01-control-plane-gateway.yml` when available.
- Do not create an independent A-01 scheduling policy for a new workstream.
- Continue dependency-valid work while a qualification is queued or running.
- Never promote a different SHA under another SHA's evidence.
- Treat only a conforming control-plane receipt as A-01 authority for migrated qualifications.
- On failure, distinguish subject failure from infrastructure/control-plane failure before repair.
- When adding a new A-01 qualification, add a repository-owned Node wrapper to `.github/scripts/`, register it in `qualification/a01/registry.json`, and make the workstream workflow a thin caller of the gateway.

## Return routing

Every request supplies a return ticket: workstream, origin ref, pass continuation, failure continuation, and notification target. Completion belongs to the workstream named by that ticket even if another chat observes the GitHub run first.

## Migration

Legacy A-01 workflows are transitional. Migrate them to the gateway instead of adding more direct `runs-on: [self-hosted, Windows, X64]` jobs. See `qualification/a01/MIGRATION.md`.
