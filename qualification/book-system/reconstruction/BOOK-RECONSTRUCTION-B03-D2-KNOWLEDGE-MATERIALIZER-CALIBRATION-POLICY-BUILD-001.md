# BOOK-RECONSTRUCTION-B03-D2 — KNOWLEDGE MATERIALIZER + CALIBRATION-POLICY BUILD 001

Date: 2026-09-12
Owner: SYSTEM_MASTER/BOOK
Predecessor: `BOOK-RECONSTRUCTION-B03-D1 — STORY-BIBLE KNOWLEDGE SCHEMA + VALIDATOR BUILD 001`
Controlling design lock: `BOOK-RECONSTRUCTION-B03-C — CANONICAL BOOK KNOWLEDGE MODEL DESIGN LOCK 001`
D1 closure head: `f1b7ec3e2614d5d729ce5b205df72c78eb0f3a63`
D2 implementation commit: `5992ed392425dc8388366fce52c7f0c22cf3fa4b`
Exact qualified D2 subject: `6b905097c3538c2024ebba5ee3ee57881aa355c9`
Exact qualified D2 tree: `627badf6999302cefacb33739a4e7702dae66b5f`
Standing: `BUILD_COMPLETE__M01_M20_20_OF_20_PASS__CUMULATIVE_K01_M20_52_OF_52_PASS__HOSTED_NODE_22_24_PASS__B03_D3_SELECTED__NO_CANONICAL_EFFECT`
Canonical effect: NONE

## Operation objective

Implement only the B03-C D2 tranche:

- migrate/adapt the historical Narrative State materialization mechanics into current Book ownership without importing historical authority;
- implement exact versioned `BookKnowledgeCalibrationPolicyV1` validation/application;
- materialize exact evidence-bound Story Bible knowledge candidates;
- preserve proposal/projection standing, ambiguity, contest, sparse-state behavior, provenance, stable IDs, and explicit lineage;
- emit immutable materialization receipts;
- prove the locked `M01-M20` denominator;
- preserve D1 `K01-K32` on the same exact subject;
- perform no D3 invalidation implementation and no D4 canonical Story Bible admission.

Historical qualification transferred: **0**.

## Installed runtime

D2 installs:

- `system-master/book-system/book-knowledge-materializer-v1.js`
- `system-master/book-system/book-knowledge-materializer-v1.test.js`
- `.github/workflows/book-b03-d2-knowledge-materializer-qualification.yml`

Exact D2 source blob:

`37b34b4c5d137d11630d410c24fe8a5c93af289a`

Exact D2 test blob:

`080b4686ec2f3c683df34846cda9014ae39aab2d`

The permanent qualification workflow binds those exact blobs before running the denominator.

## Implemented contracts

### `BookKnowledgeCalibrationPolicyV1`

D2 implements the locked versioned calibration-policy contract:

- schema identity `BOOK_KNOWLEDGE_CALIBRATION_POLICY_V1`;
- exact policy ID/version/digest binding;
- exact provider subject scopes;
- one semantic-class rule per admitted class;
- `DETERMINISTIC_ONLY`, `CALIBRATED_MODEL`, and `AUTHOR_REQUIRED` admission modes;
- nullable confidence floors only where allowed by policy;
- minimum distinct evidence-family requirements;
- explicit allowed support/output states;
- exact calibration-evidence refs;
- explicit abstention behavior when calibration evidence is insufficient;
- policy standing `ADMITTED | BLOCKED_UNCALIBRATED | SUPERSEDED`.

Policy/currentness/rights/authority laws dominate confidence. Model confidence never substitutes for required author authority.

### Candidate materialization

D2 implements `MaterializeStoryBibleKnowledgeCandidateV1` mechanics with exact binding to:

- BookProject identity;
- current accepted source refs/digests;
- current normalized projection refs/digests;
- current manuscript refs/digests;
- B02 recovery proposal refs/digests;
- provider projection refs/digests and exact provider subject;
- exact calibration policy ref/digest;
- current B03 materializer/validator subject identities;
- prior Story Bible knowledge and prior stable-ID bindings when present.

Output standing is exactly:

`MATERIALIZED_NOT_CANONICAL`

D2 does not call B00 content admission and cannot move the active Story Bible pointer.

### Stable identity and lineage

D2 preserves an existing stable semantic ID when the prior binding proves the referent is unchanged.

If a previously used stable ID is presented for a changed referent, D2 creates a new stable ID and explicit `SUPERSEDES` lineage rather than reusing the old identity.

Contradictory referent ownership of one stable ID fails closed.

### Ambiguity / contest / sparse-state laws

D2 preserves:

- `ALTERNATIVE`;
- `UNRESOLVED`;
- `CONTESTED`;
- explicit rejection instead of invented certainty;
- sparse output when evidence is insufficient;
- no universal requirement that every semantic class be populated.

`AUTHOR_REQUIRED` cannot be satisfied by numeric confidence. Contested evidence cannot silently become one asserted winner.

### Duplicate evidence law

Duplicate candidate evidence may merge exact provenance/evidence/dependency refs.

It does not add votes and does not increase confidence by repetition. Confidence is not treated as additive authority.

### Materialization receipt

D2 implements `BookKnowledgeMaterializationReceiptV1` with exact binding to:

- operation ID/digest;
- materializer and validator subject refs;
- prior Story Bible ref;
- exact input identity refs;
- calibration policy ref/digest;
- per-class input/admitted/alternative/unresolved/contested/rejected counts;
- exact rejection reasons/evidence;
- stable-ID lineage changes;
- output knowledge candidate ID/digest;
- validation standing;
- `raw_manuscript_text_persisted=false`;
- `canonical_write_performed=false`.

Receipt mechanics do not claim extraction accuracy, inference accuracy, author agreement, literary quality, production standing, or publication standing.

## Locked M01-M20 closure

All frozen materialization/calibration cases are implemented without denominator shrinkage:

- M01 exact admitted source/projection/manuscript evidence only;
- M02 B02 `PROPOSED_NOT_CANONICAL` remains noncanonical input;
- M03 provider output remains evidence/projection and cannot self-promote canon;
- M04 exact admitted calibration-policy ref/digest required;
- M05 provider subject/policy mismatch blocks;
- M06 `AUTHOR_REQUIRED` cannot be satisfied by confidence;
- M07 uncalibrated `CALIBRATED_MODEL` abstains/blocks under exact policy;
- M08 confidence cannot override currentness/rights/private-authority failure;
- M09 contested evidence cannot silently become definitive assertion;
- M10 duplicate evidence does not inflate confidence/votes;
- M11 stable-ID/referent conflict fails closed;
- M12 sparse materialization is valid;
- M13 unchanged referent preserves prior stable ID;
- M14 changed referent creates new ID plus lineage;
- M15 materialized output must pass D1 knowledge validation;
- M16 rejected candidates retain exact reason/evidence receipt;
- M17 receipt binds exact input/policy/subjects/output;
- M18 identical semantic inputs deterministically replay identical operation/result;
- M19 changed policy/provider/source/projection/manuscript/materializer subject changes operation identity;
- M20 no raw manuscript text persistence and no canonical write.

Result: **M01-M20 = 20 / 20 PASS**.

Denominator shrinkage: **0**.

## Permanent qualification evidence

Permanent workflow:

`Book B03 D2 Knowledge Materializer Qualification`

Run:

`34710434966`

Exact subject:

`6b905097c3538c2024ebba5ee3ee57881aa355c9`

Both matrix jobs bound the exact D2 source/test blobs before executing qualification.

- Node 22 job `103598107592`: PASS.
- Node 24 job `103598107522`: PASS.
- D1 `K01-K32`: PASS on both jobs.
- D2 `M01-M20`: PASS on both jobs.

Cumulative current-subject deterministic standing through D2:

**K01-K32 + M01-M20 = 52 / 52 PASS**.

The earlier bootstrap run `34710383640` also passed D1+D2 and installed the exact source/test blobs. It is transport/build evidence, not the final qualification authority. The permanent read-only workflow run above is controlling for D2 qualification.

## Final-tree verification

Comparison from D1 closure head `f1b7ec3e2614d5d729ce5b205df72c78eb0f3a63` to exact qualified D2 subject `6b905097c3538c2024ebba5ee3ee57881aa355c9` changes exactly three final-tree files:

1. add `system-master/book-system/book-knowledge-materializer-v1.js`;
2. add `system-master/book-system/book-knowledge-materializer-v1.test.js`;
3. add `.github/workflows/book-b03-d2-knowledge-materializer-qualification.yml`.

Temporary D2 transfer/bootstrap payloads and the bootstrap workflow do not remain in the final qualified D2 tree.

No pre-existing B00/B01/B02 runtime file or frozen contract is changed by the final D2 tree.

## Authority/invariant closure

D2 preserves all controlling boundaries:

- canonical B03 semantics still live only in immutable B00-governed `STORY_BIBLE` versions;
- D2 output is materialized candidate state only;
- B00 remains terminal canonical admission/version/currentness authority;
- B01's frozen 11-capability provider registry is unchanged;
- B02 source/projection identities remain exact and B02 recovered candidates remain proposal evidence;
- provider/model projections cannot self-promote canonical state;
- no raw/private manuscript text is persisted in D2 coordination state;
- author decisions are never synthesized;
- ambiguity and contest remain explicit;
- historical `CANONICAL_NARRATIVE_STATE` and `PROSE.*` authority remain retired;
- B04 reader/focalization/narrative-function ownership is not pulled into B03;
- B09 whole-book coherence authority is not pulled into B03;
- no lifecycle, export-freeze, or publication authority is added;
- historical PASS transfer remains zero.

## Full B03 denominator standing after D2

B03-C froze 108 deterministic cases:

- K01-K32 — D1: **32 / 32 PASS**;
- M01-M20 — D2: **20 / 20 PASS**;
- I01-I16 — D3: not yet implemented/claimed;
- A01-A16 — D4: not yet implemented/claimed;
- X01-X24 — D4/adversarial: not yet implemented/claimed.

Current proven deterministic total: **52 / 108**.

This is not B03 completion and is not 108/108 qualification.

## External evidence standing

D2 does not convert missing external evidence into deterministic PASS.

Still separate for later B03-E calibration/qualification where applicable:

- MODEL/BEHAVIORAL extraction accuracy;
- MODEL/BEHAVIORAL semantic/arc/setup-payoff inference accuracy;
- REAL-BOOK/LONG-FORM behavior;
- HUMAN/AUTHOR adjudication and usefulness;
- PRIVATE/NATIVE/EXTERNAL provider evidence;
- A-01/production evidence where the final qualification operation requires it;
- publication standing.

None of those evidence classes is synthesized by D2.

## Closure accounting

D2 M cases implemented: **20 / 20**

D1 regression on exact D2 subject: **32 / 32 PASS**

Current cumulative B03 deterministic cases: **52 / 52 PASS for implemented D1-D2 scope**

Full frozen B03 denominator complete: **52 / 108**

Denominator shrinkage: **0**

Historical PASS transferred: **0**

Earlier frozen domains reopened: **0**

D2 unaccounted requirements: **0**

Canonical writes performed by D2: **0**

B01 registry changes: **0**

D3 invalidation cases claimed: **0 / 16**

D4 admission/adversarial cases claimed: **0 / 40**

## Exactly one dependency-valid successor

`BOOK-RECONSTRUCTION-B03-D3 — TRANSITIVE INVALIDATION + SUCCESSOR RECONCILIATION BUILD`

B03-D3 is the sole admitted successor.

It may implement only the locked deterministic dependency graph/currentness/invalidation-impact mechanics, successor candidate reconciliation, stable-ID preservation for unaffected/same referents, impact receipts, and `I01-I16`.

B03-D3 may not directly mutate the active Story Bible pointer, perform D4 B00 canonical admission, widen the frozen B01 provider registry, synthesize author authority, transfer historical PASS, or claim the D4/E/F denominator before the required evidence exists.
