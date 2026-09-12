# CONTROLLER-FOUNDATION-003D — DESIGN-LOCK ERRATUM 001

Status: **BINDING REPAIR BEFORE 003E QUALIFICATION**

Two reconstruction issues were discovered while implementing the locked design. They are repaired here before qualification rather than hidden in code.

## E-01 — dispatch-attempt lease identity is evidence, not a live foreign key

The original 003D table sketch declared `external_effect_attempts.lease_id REFERENCES leases(lease_id)`. Current durable-journal recovery deliberately reconstructs resource generation authority but does not reconstruct historical live lease rows. A completed dispatch attempt must remain reconstructible after the lease itself is gone.

Binding repair:

- `external_effect_attempts.lease_id` remains mandatory immutable evidence of the authorizing lease id;
- it **must not** carry a foreign key to the ephemeral/live `leases` table;
- `resource_id` and `generation` remain captured in the immutable attempt record and dispatch event;
- authorization still validates the live lease and current resource generation transactionally at dispatch time;
- rebuild never invents a lease merely to satisfy historical attempt evidence.

This preserves lossless effect history without converting historical leases into live mutation authority.

## E-02 — unresolved reconciliation requires an explicit semantic event

003D allowed `RECONCILING -> UNKNOWN` but its event list omitted the event needed to rebuild that transition.

Binding repair:

- add `external-effect.unknown` to the authoritative event set;
- payload requires `effect_id`, state `UNKNOWN`, bounded observation evidence, and optional classified error code;
- reducer accepts it only from `RECONCILING` and returns the effect to `UNKNOWN`;
- it grants no redispatch authority.

No other 003D ownership, single-dispatch, fencing, evidence, adapter, or retry decision changes.
