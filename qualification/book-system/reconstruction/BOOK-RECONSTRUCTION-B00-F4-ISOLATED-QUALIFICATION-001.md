# BOOK-RECONSTRUCTION-B00-F4 — ISOLATED QUALIFICATION 001

Status: **F4 PASS / F5 ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

Qualified implementation lineage: `book-system/reconstruction-b00-parent-v2`

Exact qualified subject: `73b36708f867e168f4fcd8473ff7303790e70b62`

Hosted workflow run: **34678851602**.

Observed live Book owner immediately before this evidence write: `book-system/control-v1@b248c787321e32bc01ad0ef6b5112888cc2f341a`.

## 1. Qualified surface

The exact subject contains the F1 canonical parent pure core, F2 transactional SQLite store adapter, F3 rights/custody evidence-currentness runtime, and the F4 Book-owned governing style-profile runtime:

- `system-master/book-system/governing-style-profile-core.js`;
- `.github/scripts/book-system-governing-style-profile-001-qualify.js`.

The style runtime owns versioned Book-specific governing metadata and currentness/invalidation logic. It does not own copy-edit execution and does not expose canonical parent mutation authority. Provider projections are immutable and explicitly set `canonical_effect_allowed=false` and `parent_mutation_allowed=false`.

## 2. Exact qualification result

Run `34678851602` completed successfully on exact subject `73b36708f867e168f4fcd8473ff7303790e70b62`.

Both hosted matrix jobs passed:

- Node 22 — Q001-Q050 baseline + Q067-Q084 current reconstruction slice — **PASS**;
- Node 24 — Q001-Q050 baseline + Q067-Q084 current reconstruction slice — **PASS**.

For F4 specifically, Q077-Q084 prove on this exact subject:

- a valid versioned governing style profile can be constructed and currentness verified;
- stale predecessor/currentness is denied;
- a foreign-Book profile is denied;
- missing/invalid governing brief/canon references fail closed;
- an INVALIDATED profile cannot become provider-current;
- the style runtime exposes no canonical-parent write API;
- provider projections are immutable and carry no canonical-effect authority;
- changed governing inputs invalidate currentness and require re-adjudication.

## 3. Evidence artifacts

Node 22:

- artifact id `10293835660`;
- name `book-reconstruction-b00-f4-node-22-73b36708f867e168f4fcd8473ff7303790e70b62`;
- digest `sha256:6ed340211624d464d56a29cebe5dac6fc56dd466c18d8c80657953e3f627b648`.

Node 24:

- artifact id `10293765754`;
- name `book-reconstruction-b00-f4-node-24-73b36708f867e168f4fcd8473ff7303790e70b62`;
- digest `sha256:30d02b8f556df6ff187a069ea060edacf332d0ba6b0281d90d1da533a86ea710`.

## 4. Evidence boundary

This is hosted deterministic exact-subject evidence only. It is not real copy-edit provider evidence, author approval, private-source authority, legal/rights clearance, native Office/document fidelity, publication authorization, A-01 qualification or production installation.

The repository's separate A-01 control-plane enforcement workflow is not counted as A-01 qualification of this Book subject.

## 5. Current reconstruction denominator standing

Fresh exact-subject reconstruction evidence now covers:

- Q001-Q050 — canonical parent pure core + durable parent store;
- Q067-Q076 — rights/custody evidence/currentness;
- Q077-Q084 — governing style profile.

Still open under the frozen 96-case denominator:

- Q051-Q066 — specialist prepare/commit/reconcile and owner-boundary rebind;
- Q085-Q090 — cross-surface privacy/native/publication fences;
- Q091-Q096 — v1->v2 migration and cumulative seam behavior.

No B00 freeze/closure is allowed until the exact integrated reconstructed subject passes the full required denominator plus frozen predecessor regression/cumulative calibration.

## 6. Exact next operation

**`BOOK-RECONSTRUCTION-B00-F5 — VERSION + CONTENT-ADMISSION SPECIALIST REBIND TO CANONICAL PARENT V2 + Q051-Q058 EXACT-SUBJECT QUALIFICATION`**

F5 shall reuse the existing version/rollback and content-admission substrates. It shall not rewrite their valid specialist semantics. It must convert parent mutation into deterministic `PREPARED_FOR_PARENT` typed effects, preserve version/admission ledgers as specialist truth, and prove at minimum:

- Q051 prepared specialist is not canonical completion;
- Q052 stale specialist identity is denied before transaction;
- Q053 same-transaction specialist + parent atomic success;
- Q054 specialist persistence failure rolls back parent;
- Q055 parent validation/CAS failure rolls back specialist;
- Q056 response-loss recovery reconciles parent and specialist receipts;
- Q057 version snapshot never becomes current parent truth;
- Q058 content admission prepares a typed parent effect rather than writing canonical state directly.

F5 must rerun the current Q001-Q050 + Q067-Q084 baseline on its exact subject before F6 is admitted.
