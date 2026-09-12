# BOOK-RECONSTRUCTION-B03-D3 — TRANSITIVE INVALIDATION + SUCCESSOR RECONCILIATION BUILD 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Predecessor: `BOOK-RECONSTRUCTION-B03-D2 — KNOWLEDGE MATERIALIZER + CALIBRATION-POLICY BUILD 001`
Controlling design lock: `BOOK-RECONSTRUCTION-B03-C — CANONICAL BOOK KNOWLEDGE MODEL DESIGN LOCK 001`
D2 closure head: `82cd95062f615ad716a3606f2f0c2f4450982aa5`
D3 runtime commit: `88e412405ee96d839d5b7c545aee0ce91c8c4472`
D3 test commit: `fa1fb1619a08ab296202fa3be3ed1e2453e39e9b`
Exact qualified D3 subject: `b7aa89fbefce20b2d0f759b6f8fdf139352b9691`
Exact qualified D3 tree: `4bf81ecb293faa8ab246313c1d0455b1475ca4d0`
Standing: `BUILD_COMPLETE__I01_I16_16_OF_16_PASS__CUMULATIVE_K01_I16_68_OF_68_PASS__HOSTED_NODE_22_24_PASS__A01_CONTROL_PLANE_PASS__B03_D4_SELECTED__NO_CANONICAL_EFFECT`
Canonical effect: NONE

## Operation objective

Implement only the B03-C D3 tranche:

- exact source/projection/manuscript/anchor/semantic/authority invalidation triggers;
- deterministic reverse dependency indexing over declared `depends_on_refs[]`;
- exact direct/transitive/unaffected partitioning;
- cycle-safe invalidation traversal;
- stale asserted-state prevention;
- preservation of unrelated records and stable IDs;
- explicit preservation of prior `ALTERNATIVE`, `UNRESOLVED`, and `CONTESTED` standing when invalidated;
- immutable invalidation-impact evidence;
- successor reconciliation candidate generation;
- locked `I01-I16` qualification;
- no D4 governed Story Bible admission or active-pointer mutation.

Historical qualification transferred: **0**.

## Installed runtime

D3 installs exactly:

- `system-master/book-system/book-knowledge-invalidation-v1.js`
- `system-master/book-system/book-knowledge-invalidation-v1.test.js`
- `.github/workflows/book-b03-d3-knowledge-invalidation-qualification.yml`

Exact D3 runtime blob:

`f22dabe0909eeddacd9a9e9ee55dbc0bd163750a`

Exact D3 test blob:

`1c81bd6f705129d1e3ef7d5a9ecf434effa4b4c6`

## Implemented invalidation contract

D3 implements deterministic `BOOK.KNOWLEDGE.COMPUTE_STORY_BIBLE_INVALIDATION` mechanics without adding a B01 provider capability.

Accepted trigger kinds are bounded to:

- `SOURCE_ACCEPTANCE`;
- `PROJECTION`;
- `MANUSCRIPT`;
- `ANCHOR`;
- `SEMANTIC_IDENTITY`;
- `AUTHORITY_INVALIDATION`.

Every trigger binds the exact prior identity/digest from the base knowledge subject. Missing/mismatched prior identity fails closed instead of guessing currentness.

Source/projection/manuscript changes resolve only through anchors that explicitly bind those identities. Anchor changes directly affect records that explicitly cite the anchor. Semantic propagation then proceeds only through declared `depends_on_refs[]` edges.

Typed narrative references that are not also declared dependency edges do not silently create invalidation authority. This preserves the B03-C rule that motif/theme and other downstream invalidation is dependency/provenance driven rather than inferred from narrative association alone.

## Cycle-safe dependency closure

D3 builds a deterministic reverse dependency graph and performs bounded propagation from direct invalidation roots.

- directly affected refs are recorded separately;
- downstream refs reached through declared dependencies are transitive;
- already visited refs are not re-enqueued;
- strongly connected affected components are reported in `cycle_refs[]`;
- traversal terminates deterministically for cyclic graphs.

## Successor reconciliation

D3 never mutates the base/historical Story Bible knowledge payload.

It clones the base knowledge into a proposed successor reconciliation candidate, preserves all stable semantic IDs, leaves unrelated records unchanged, and marks affected semantic records `INVALIDATED`.

When an affected record previously carried `ALTERNATIVE`, `UNRESOLVED`, or `CONTESTED`, D3 records the prior status in invalidation metadata rather than silently resolving the ambiguity.

Source/projection/manuscript/anchor stale triggers yield a successor knowledge standing of `BLOCKED_STALE`; semantic/authority-only invalidation yields a noncanonical materialized successor state. In all cases `canonical_write_performed=false`.

The successor is re-digested and re-validated with the current D1 Story Bible validator under prior-knowledge stable-ID reconciliation before D3 returns it.

## Invalidation impact receipt

D3 emits a deterministic `BOOK_KNOWLEDGE_INVALIDATION_IMPACT_V1` record binding:

- invalidation operation ID/digest;
- base Story Bible ref/digest;
- base knowledge candidate ID/digest;
- exact changed identity refs;
- directly affected refs;
- transitively affected refs;
- unaffected refs;
- cycle refs;
- exact reason codes;
- proposed successor candidate ref/digest;
- `canonical_write_performed=false`;
- `historical_story_bible_mutated=false`.

The direct, transitive, and unaffected sets are disjoint and together partition the semantic-record universe for the tested base subject.

## Locked I01-I16 closure

All frozen invalidation/currentness cases are implemented without denominator shrinkage:

- I01 changed anchor/span directly marks dependent records invalidation-eligible;
- I02 changed source acceptance identity/digest triggers exact invalidation;
- I03 changed projection identity/digest triggers exact invalidation;
- I04 changed manuscript/current-content identity triggers exact invalidation;
- I05 invalidation propagates through declared dependency edges transitively;
- I06 traversal is deterministic and cycle-safe;
- I07 unrelated records remain unchanged/current;
- I08 stale dependent asserted records cannot remain asserted/current;
- I09 relationship dependents invalidate from declared underlying dependencies;
- I10 arc dependents invalidate from declared subject/beat dependencies;
- I11 promise/setup-payoff/open-question dependents invalidate from changed declared dependencies;
- I12 motif/theme invalidation occurs only through declared provenance/dependency edges;
- I13 historical Story Bible knowledge remains immutable;
- I14 unaffected/same-referent stable IDs are preserved in the successor;
- I15 unresolved/alternative/contested standing remains explicit and is not silently resolved;
- I16 impact receipt exactly partitions direct/transitive/unaffected refs and binds the proposed successor candidate.

Result: **I01-I16 = 16 / 16 PASS**.

Denominator shrinkage: **0**.

## Permanent qualification evidence

Permanent workflow:

`Book B03 D3 Knowledge Invalidation Qualification`

Run:

`34711088857`

Exact subject:

`b7aa89fbefce20b2d0f759b6f8fdf139352b9691`

- Node 22 job `103599903008`: PASS.
- Node 24 job `103599903215`: PASS.
- D1 `K01-K32`: PASS on both jobs.
- D2 `M01-M20`: PASS on both jobs.
- D3 `I01-I16`: PASS on both jobs.

Cumulative implemented B03 deterministic standing through D3:

**K01-K32 + M01-M20 + I01-I16 = 68 / 68 PASS**.

A-01 Control Plane Enforcement run `34711088615` also passed on the exact same subject `b7aa89fbefce20b2d0f759b6f8fdf139352b9691`.

## Final-tree verification

Comparison from D2 closure head `82cd95062f615ad716a3606f2f0c2f4450982aa5` to exact qualified D3 subject `b7aa89fbefce20b2d0f759b6f8fdf139352b9691` is ahead by exactly three commits and changes exactly three final-tree files:

1. add `system-master/book-system/book-knowledge-invalidation-v1.js`;
2. add `system-master/book-system/book-knowledge-invalidation-v1.test.js`;
3. add `.github/workflows/book-b03-d3-knowledge-invalidation-qualification.yml`.

No pre-existing B00/B01/B02 runtime or frozen contract is modified. D1 and D2 runtime files are unchanged.

## Authority/invariant closure

D3 preserves:

- canonical Story Bible authority exclusively under B00;
- no active Story Bible pointer movement;
- no Story Bible object-version registration;
- no second canonical knowledge store;
- no B01 provider-registry widening;
- no author-decision synthesis;
- no lifecycle/export/publication authority;
- no raw manuscript text persistence;
- no historical Story Bible in-place mutation;
- no historical qualification transfer;
- no model/real-book/human accuracy claim from synthetic deterministic fixtures.

## Full B03 denominator standing after D3

B03-C froze 108 deterministic cases:

- K01-K32 — D1: **32 / 32 PASS**;
- M01-M20 — D2: **20 / 20 PASS**;
- I01-I16 — D3: **16 / 16 PASS**;
- A01-A16 — D4: not yet implemented/claimed;
- X01-X24 — D4/adversarial: not yet implemented/claimed.

Current proven deterministic total: **68 / 108**.

This is not B03 completion and is not 108/108 qualification.

## Closure accounting

D3 I cases implemented: **16 / 16**

D1 regression on exact D3 subject: **32 / 32 PASS**

D2 regression on exact D3 subject: **20 / 20 PASS**

Current cumulative implemented B03 scope: **68 / 68 PASS**

Full frozen B03 denominator complete: **68 / 108**

Denominator shrinkage: **0**

Historical PASS transferred: **0**

Earlier frozen domains reopened: **0**

D3 unaccounted requirements: **0**

Canonical writes performed by D3: **0**

B01 registry changes: **0**

D4 admission/adversarial cases claimed: **0 / 40**

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B03-D4 — GOVERNED STORY-BIBLE ADMISSION + RUNTIME/QUERY BUILD`

B03-D4 is the sole admitted successor.

It may implement only the locked Book-owned commands/queries, admission preparation, exact composition into the existing B00 atomic `REGISTER_CONTENT_OBJECT_VERSION(STORY_BIBLE)` + `SET_ACTIVE_CONTENT_OBJECT_VERSION(STORY_BIBLE)` transaction, runtime/query reachability, and the frozen `A01-A16` + `X01-X24` cases.

D4 may not widen the frozen B01 provider registry, create a second canonical Story Bible/knowledge authority, synthesize author decisions, transfer historical PASS, change lifecycle/export/publication authority, or claim B03-E/F closure before cumulative qualification/calibration is performed.