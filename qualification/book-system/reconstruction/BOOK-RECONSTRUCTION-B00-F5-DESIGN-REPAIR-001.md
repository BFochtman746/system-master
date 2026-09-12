# BOOK-RECONSTRUCTION-B00-F5 — DESIGN REPAIR 001

Status: **DESIGN REPAIR LOCKED / F5 BUILD ADMITTED / B00 NOT CLOSED / NO PASS TRANSFER**

Owner: **SYSTEM_MASTER/BOOK**

Parent design lock: `BOOK-RECONSTRUCTION-B00-E1-FORMAL-DESIGN-LOCK-001.md`

Observed predecessor implementation lineage: `book-system/reconstruction-b00-parent-v2@73b36708f867e168f4fcd8473ff7303790e70b62`

## 1. Defect discovered before F5 mutation

The E1 parent schema makes `governed_objects` part of canonical Book truth and the current pointer effects may target only already-admitted governed-object versions. The frozen v1 effect vocabulary, however, contains no typed effect capable of admitting a newly versioned Governing Brief, Canon Manifest, Story Bible, Book Plan, or Canonical Manuscript summary into `governed_objects`.

The recovered version/content-admission runtime does create new governed object versions. Therefore a literal F5 implementation against the existing effect vocabulary would force one of three invalid outcomes: specialist state silently becoming canonical truth, a generic patch/merge effect, or inability to activate any newly created governed-object version.

This is a specification/implementation seam defect, not permission to broaden ownership.

## 2. Narrow repair

Add exactly one Book-owned typed parent effect family:

`COMMIT_CONTENT_ADMISSION`

It is not a generic patch. Its payload is closed and contains only:

- `governed_object_versions`: zero or more canonical **summary records** for the five already-owned governed object classes;
- `active_pointer_updates`: zero or more typed pointer updates for those same five classes;
- `specialist_delta_digest`: exact SHA-256 binding to the prepared version/admission specialist delta.

Each governed-object summary is limited to canonical identity/integrity metadata already admitted by the E1 parent schema. Rich Book Plan, Story Bible, manuscript/source, chapter, scene, or prose payload remains specialist/artifact truth and is not copied into canonical parent history.

Admitted object classes are exactly:

- `GOVERNING_BRIEF` -> `governing_briefs` / `governing_brief_ref`;
- `CANON_MANIFEST` -> `canon_manifests` / `canon_manifest_ref`;
- `STORY_BIBLE` -> `story_bibles` / `story_bible_ref`;
- `BOOK_PLAN` -> `book_plans` / `book_plan_ref`;
- `MANUSCRIPT_MANIFEST` -> `manuscripts` / `canonical_manuscript_ref`.

No provider-defined object class, JSON pointer, arbitrary field mutation, lifecycle mutation, export/publication mutation, author-decision synthesis, or cross-owner semantic payload is admitted.

## 3. Specialist binding requirements

`COMMIT_CONTENT_ADMISSION` is valid only when all of the following are true:

1. `expected_specialist_ledger_identity` is present and exact;
2. at least one immutable specialist receipt ref is present;
3. the effect payload `specialist_delta_digest` equals the prepared delta digest;
4. the store re-reads the current specialist identity inside the same transaction as the parent CAS;
5. the prepared post-specialist state identity is derived from bytes, not trusted from caller metadata;
6. specialist persistence and parent successor commit share one local durability outcome;
7. response uncertainty is reconciled by immutable parent + specialist receipts before any retry.

Prepared specialist output remains `PREPARED_FOR_PARENT`; it is not canonical completion.

## 4. Historical substrate rebind

F5 shall reuse the existing `version-and-rollback-core.js` and `content-object-admission-core.js` validation/versioning semantics behind a rebind adapter. Their proposed v1 parent successor becomes **specialist candidate state only**. The adapter extracts only the canonical summary delta and typed active-pointer delta needed by `COMMIT_CONTENT_ADMISSION`.

The historical modules retain provenance value but may no longer directly establish reconstructed canonical parent truth.

## 5. Qualification repair

Q051-Q058 remain the frozen F5 denominator and are interpreted as follows:

- Q051 prepared specialist is not canonical completion;
- Q052 stale specialist identity is denied inside the parent transaction;
- Q053 specialist + canonical parent commit atomically;
- Q054 specialist persistence failure rolls back parent;
- Q055 parent validation/CAS failure rolls back specialist;
- Q056 response-loss reconciliation returns the same parent and specialist receipts;
- Q057 historical version/admission snapshot/proposed-parent bytes never become reconstructed canonical parent truth by themselves;
- Q058 content admission produces `COMMIT_CONTENT_ADMISSION`, not a direct canonical write.

F5 must also rerun Q001-Q050 and Q067-Q084 on the same exact subject before F6 can be admitted.

## 6. Boundaries

This repair does not authorize publication, legal/rights judgment, private-source promotion, author choice, native application evidence, A-01 standing, or production installation. Historical PASS evidence is not transferred to reconstructed bytes.
