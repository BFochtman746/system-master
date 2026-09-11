# Controller 2.0 State Machines

## Execution

`ADMITTED -> PLANNED -> CLAIMABLE -> CLAIMED -> RUNNING -> VERIFYING -> SUCCEEDED`

Permitted recovery/terminal branches:

- `ADMITTED -> CANCELLED`
- `PLANNED -> BLOCKED | CANCELLED`
- `CLAIMABLE -> BLOCKED | CANCELLED`
- `CLAIMED -> RECOVERING | CANCELLED`
- `RUNNING -> FAILED | BLOCKED | RECOVERING | CANCELLED`
- `VERIFYING -> FAILED | BLOCKED | RECOVERING`
- `RECOVERING -> CLAIMABLE | FAILED | BLOCKED | CANCELLED`
- `BLOCKED -> PLANNED | CANCELLED`

`SUCCEEDED`, `FAILED`, and `CANCELLED` are terminal for the execution identity. A repair that changes the subject is a new transaction.

## Qualification

`NOT_REQUESTED -> PENDING -> RUNNING -> QUALIFIED | REJECTED | INDETERMINATE`

`INDETERMINATE -> PENDING` is permitted for infrastructure/retry recovery of the same immutable subject and policy identity.

Qualification may enter `PENDING` only after execution is `SUCCEEDED` and a candidate subject is bound.

## Promotion

`NOT_ELIGIBLE -> ELIGIBLE -> PROMOTING -> PROMOTED | FAILED | CONFLICT`

`FAILED -> ELIGIBLE` is permitted only when the same qualified subject remains valid and reconciliation proves the remote side effect did not occur. `CONFLICT` requires a new rebase/successor transaction rather than rewriting the original subject.

Promotion may enter `ELIGIBLE` only when execution is `SUCCEEDED`, qualification is `QUALIFIED`, and an immutable candidate subject exists.

## Lease

`ACTIVE -> RELEASED | EXPIRED | REVOKED`

A lease can never reactivate. Every new lease for the same protected resource receives the next monotonically increasing fencing token.

## Outbox delivery

`PENDING -> INFLIGHT -> PUBLISHED | RETRY | DEAD`

`RETRY -> INFLIGHT -> ...`

`PUBLISHED` and `DEAD` are terminal for that destination/event delivery identity.

## External effect

`PREPARED -> INFLIGHT -> SUCCEEDED | FAILED | UNKNOWN`

`UNKNOWN -> RECONCILING -> SUCCEEDED | FAILED | UNKNOWN`

`FAILED -> PREPARED` is allowed only for a classified retry of the same immutable effect identity and request digest.

## Important semantic separations

- Execution success is not qualification.
- Qualification is not promotion.
- A Git branch moving does not retroactively make an immutable subject stale.
- A promotion conflict does not rewrite the qualified subject; it creates a new lineage transaction.
- A worker losing its lease does not gain authority back merely by waking up; fencing rejects stale writes.
