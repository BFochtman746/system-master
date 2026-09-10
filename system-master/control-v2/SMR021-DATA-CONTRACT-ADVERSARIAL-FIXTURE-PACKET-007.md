# SMR021 DATA Contract Adversarial Fixture Packet 007

Date: 2026-09-10
Owner: `SYSTEM_MASTER/CORE`
Standing: **CONSUMER CONTRACT + ADVERSARIAL FIXTURES COMPLETE / DATA IMPLEMENTATION NOT AUTHORIZED / NOT EXECUTED**

This packet converts Packet-004’s abstract gaps into a reviewable consumer schema and deterministic fixture set. It does not declare the schema accepted by DATA and does not implement persistence.

The consumer contract makes the missing work-version binding explicit and requires a resolvable immutable admission record, descriptor and implementation digests, requirement/route/caller/action/effect bindings, granted-authority digest, evidence reference, record digest, and false higher-authority flags.

The fixture set contains:

- one exact round-trip positive case;
- independent omission tests for every required binding;
- stale/reused work-version denial;
- missing and ambiguous admission-reference denial;
- exact replay and conflicting idempotency tests;
- deterministic two-writer concurrency scheduling;
- crash-before-commit, crash-after-commit-before-ack, corruption and rollback behavior;
- legacy migration non-promotion and deterministic migration;
- explicit A-01/native/production flag rejection and effect-execution prohibition;
- metamorphic digest, canonicalization, zero-side-effect and authority properties.

Acceptance requires a DATA-owner-valid interface/migration and exact capsule verification before execution. Any implementation/test/schema byte change receives a new exact source/test SHA. No `e22...` or `fe325...` PASS transfers.

Next safe action: retry exact capsule acquisition; if bytes become available, verify 424,986 bytes and SHA-256 `377afa2c9ff2c7c69e5cd5bc45c66dd95ceb2315c1787afc35df6d907165fca1` before extraction and prepare a GitHub-native immutable import. Otherwise preserve the transient custody blocker and wait for a DATA-owner-valid contract without idling on unrelated unsafe work.
