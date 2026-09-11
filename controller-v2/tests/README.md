# Foundation test contract

The Foundation-002 suite is a gate, not a smoke test. It must prove at minimum:

- idempotent command replay collapses to one logical transaction
- same command ID with altered semantics is rejected
- illegal state transitions are rejected
- CLAIMED/RUNNING/VERIFYING cannot exist without a live lease
- candidate subject binding is write-once
- execution success, qualification, and promotion remain separate
- only one active mutation lease exists per protected resource
- fencing tokens increase monotonically and reject zombie-worker results
- controller state mutation, event creation, and outbox intent are atomic
- rollback cannot leave half-applied state
- subject/event/evidence facts are append-only/immutable
- published outbox deliveries cannot silently reopen
- committed state survives process restart
- duplicate concurrent submissions converge on one transaction
- database integrity and foreign-key checks remain clean

The authoritative qualification suite will later add process-crash, power-loss/restart, filesystem fault, GitHub timeout, duplicate webhook, stale projection, policy-change, and hostile-worker scenarios.
