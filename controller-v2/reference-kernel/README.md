# Controller 2.0 Reference Transaction Kernel

Status: **NON-AUTHORITATIVE REFERENCE IMPLEMENTATION**

This directory is the executable specification for `CONTROLLER-FOUNDATION-002B`.
It is intentionally isolated from the live System Master controller, Second Shift,
A-01, and subject-repository mutation paths.

## Purpose

Prove the foundation semantics before any production adapter is connected:

- immutable command identity and fingerprinting
- one command -> at most one logical transaction
- explicit transaction and operation state transitions
- per-resource mutation leases
- monotonically increasing fencing generations
- stale-worker rejection at the controller write boundary
- per-stream semantic event versions
- hash-linked event integrity
- transactional outbox
- durable barrier before consequential external mutation
- immutable exact-SHA qualification binding
- qualification / promotion separation
- ambiguous external-result reconciliation
- replayable semantic projections
- fail-closed schema/version handling

## Deliberate non-goals

This reference kernel does **not**:

- replace the live controller
- mutate `main`
- dispatch Second Shift
- perform A-01 qualification
- choose the production programming language
- choose the final DurableInbox/DurableJournal transport
- grant GitHub credentials
- claim production readiness

GitHub, SQLite, Actions, and Second Shift remain implementation/adaptor concerns.
The kernel defines the semantics they must preserve.

## Run tests

```bash
python -m unittest discover -s controller-v2/reference-kernel -p 'test_*.py' -v
```

The required denominator is `CF-T001` through `CF-T030`; seven additional
adversarial/transition-guard tests are included (37 total).

## Safety rule

No code in this directory may be wired into the current controller until the
reference tests pass independently in CI and the subsequent adapter/failure-
injection gates are complete.
