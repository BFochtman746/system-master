# FOUR-SYSTEM-LOCK-IMPLEMENTATION-001

Status: **ACTIVE / VERIFIED**  
Effective date: 2026-09-09

This record is the implementation receipt for the anti-drift controls established by `FOUR-SYSTEM-FORENSIC-AUDIT-001`.

## Canonical topology

Exactly four system IDs are permitted by `governance/SYSTEM-TOPOLOGY-001.json`:

- MASTER
- LEARNING
- BOOK
- PROSE, parented to BOOK

A fifth system requires explicit user intent plus a superseding ADR, registry change and validator change.

## Shared-control enforcement

The canonical Node validator `.github/scripts/validate-system-topology.js` is wired into:

1. hosted `A-01 Control Plane Enforcement` before the existing gateway/scheduler governance scan;
2. the canonical self-hosted A-01 gateway immediately after canonical control-plane checkout and before runner preflight, subject acquisition or qualification execution.

Verified hosted evidence:

- run `34386305934` — PASS — explicit four-system topology step PASS;
- run `34386622023` on gateway fail-closed binding subject `d0eae0ebdfd2d66c697d7adbccec6394f13772e2` — PASS;
- audit-seal job in run `34386982866` on `ae98d066476a1a5dae942c66afa2a7efd64a8b7e` — job PASS including topology validation and existing A-01 governance checks.

## Canonical system-control drift enforcement

A single reusable workflow on `main`, `.github/workflows/system-control-drift-reusable.yml`, validates:

- canonical topology/A-01 owner map from `main`;
- exact pushed control-subject SHA;
- canonical control record existence;
- system identity and parent boundaries.

Each canonical system control branch has a thin caller:

- MASTER — `system-master/control-v2`
- LEARNING — `learning/control-v1`
- BOOK — `book-system/control-v1`
- PROSE — `literary-prose-engine-001`

Initial exact verification runs:

- MASTER `34387121789` — PASS on `7de1f72675e0bf91e41cbcf32af12eede8265948`;
- LEARNING `34387131849` — PASS on `42cbeb3db6ba97c1baacb9f0b6cac1b673257f7e`;
- BOOK `34387139931` — PASS on `01c7522dce5c84261d660e8a51e008b691bb5054`;
- PROSE `34387149759` — PASS on `cad14b1d848ba3d235750f3f314c1955703e9c97`.

## Scheduled-control enforcement

The active recurring second-shift workers are aligned to the same topology:

- Master System Second Shift
- Learning System Second Shift
- Book System Second Shift
- Prose System Second Shift

Portfolio and morning handoff are explicitly shared control/infrastructure and are required to emit exactly four system sections plus a separate infrastructure/control section.

## GitHub-plan boundary

Native branch-protection/ruleset enforcement is not available under the current private-repository configuration; the GitHub ruleset API returned a plan/public-repository requirement. Therefore these controls detect/fail closed in workflows and qualification admission but cannot prevent every direct ungoverned Git push from landing momentarily.

If private-repository branch protection/rulesets become available later, require the topology/control-drift checks on `main` and all four canonical control branches and restrict bypass/force-push as appropriate.

## Authority boundary

This lock is architecture/control metadata and workflow governance only. It does not transfer exact-SHA qualification, private-data, human, author, publication, production or native-platform authority.
