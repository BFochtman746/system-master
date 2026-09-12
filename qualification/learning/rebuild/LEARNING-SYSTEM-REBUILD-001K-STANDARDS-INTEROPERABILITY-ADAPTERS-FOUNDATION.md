# LEARNING-SYSTEM-REBUILD-001K — Standards + Interoperability Adapters

Status: **FOUNDATION DESIGN FROZEN / NO RUNTIME BUILD OR INTEROPERABILITY PASS CLAIMS YET**  
Date: 2026-09-12  
System: `SYSTEM_MASTER/LEARNING`  
Learning owner: `SYSTEM_MASTER/LEARNING::MOD-LEARNING-001`  
Curriculum definition owner: `SYSTEM_MASTER/LEARNING::MOD-CURRICULUM-001`  
Shared identity / privacy / rights / transport / artifact / credential dependencies remain external to Learning  
Parent: `LEARNING-SYSTEM-REBUILD-001J`

## What this capability does

This capability defines how System Master Learning may exchange education data with external systems and standards without allowing an exchange format to become a new source of canonical truth.

The core rule is:

> **External standards can translate System Master information, but they cannot become the authority for mastery, learner identity, assessment validity, competency equivalence, certification, or eligibility.**

The intended outcome is safe, traceable interoperability with explicit semantic boundaries.

001K covers four primary adapter families:

1. **CASE** for competency / academic-standard / framework exchange;
2. **QTI** for assessment item / test / result exchange;
3. **Caliper** for learning-activity event exchange;
4. **CLR** for achievement / qualification-record exchange.

It also freezes the common rules needed by all adapters:

- external identifier namespaces;
- exact standard/profile/version binding;
- import/export provenance;
- mapping standing;
- lossless versus lossy translation;
- unknown/unmapped preservation;
- idempotent import;
- correction/supersession lineage;
- rights/privacy/authorization gates;
- explicit claim narrowing;
- conformance versus semantic-authority separation.

## Research direction

Current 1EdTech standards establish interoperable representations and exchange mechanisms for competencies, assessments, learning activity, and learner achievements.

The foundation uses these current public reference points:

- 1EdTech CASE 1.1 for exchanging competency frameworks, definitions, associations, rubrics, criteria, and related structures;
- 1EdTech QTI for packaging and exchanging assessment items, tests, and results;
- 1EdTech Caliper Analytics 1.2 for consistently representing and exchanging learning-activity events;
- 1EdTech CLR 2.0 for portable, verifiable learning and achievement records.

The existence of a standard representation or successful conformance test does not, by itself, establish System Master semantic authority, psychometric validity, mastery validity, competency equivalence, certification, or eligibility.

Research informs adapter boundaries. It does not create a new runtime authority.

## Fundamental separation: exchange syntax is not System Master truth

001K freezes four distinct layers.

### 1. External representation

The external system or standard defines how its data is represented, identified, versioned, packaged, or transported.

### 2. Adapter translation

The adapter converts between that external representation and a bounded System Master interchange representation.

### 3. Owner-valid admission

The existing System Master semantic owner decides whether translated material may enter canonical Learning or Curriculum state and in what standing.

### 4. Downstream interpretation

Existing Learning/Curriculum owners decide what admitted information means for learner state, assessment, evidence, mastery, adaptation, maintenance, or qualification evidence.

A successful translation at layers 1–2 cannot skip layers 3–4.

## Ownership boundaries preserved

### Curriculum remains authoritative for instructional definitions

Curriculum remains the canonical owner of:

- skill and criterion definitions;
- prerequisite relationships;
- curriculum/course/lesson/practice definitions;
- assessment definitions and rubrics;
- instructional policy;
- remediation instructional-plan truth;
- source/freshness/program-validation truth.

An external framework, QTI package, or competency catalog may be imported as proposed/source material, but it cannot silently overwrite Curriculum truth.

### Learning remains authoritative for learner-specific truth

Learning remains the canonical owner of:

- learner-specific goals and learning state;
- lesson/practice/assessment attempt history;
- admitted evidence interpretation;
- mastery, retention, and transfer judgments;
- learner-specific remediation need;
- maintenance intent;
- adaptive decision history;
- learner-specific qualification-evidence-package semantics.

External events, scores, achievements, or records cannot directly write these states unless an existing owner-valid contract explicitly admits them.

### Person identity remains outside Learning

An external learner identifier, SIS identifier, email, CLR subject identifier, Caliper actor identifier, or other standard identifier must never become canonical System Master person identity merely because it arrived in an interoperable payload.

Identity linkage requires the existing identity authority and authorization path.

### Shared Assurance retains validity/model-governance authority

Adapter conformance does not establish:

- assessment validity;
- scorer/model calibration;
- fairness;
- drift standing;
- psychometric validity;
- educational effectiveness.

Those remain governed by the existing assessment/effectiveness and shared Assurance boundaries frozen in 001I and 001J.

### Credential / certification / eligibility authority remains external

Learning may export owner-valid evidence semantics through a standards adapter, but Learning does not thereby own:

- credential signing;
- issuer authority;
- certificate/license decisions;
- hiring decisions;
- job eligibility;
- professional eligibility;
- third-party verification decisions.

Generic credential serialization/signing and external decision authority remain outside Learning.

## Common adapter envelope

Every interoperability operation must preserve enough context to explain exactly what was exchanged.

Minimum common envelope:

- adapter family;
- standard/specification name;
- exact standard version;
- profile/conformance profile when material;
- source system / issuing organization identity as asserted by the transport/authentication layer;
- external namespace;
- external identifier;
- external object version or revision when available;
- direction: import or export;
- operation identity / idempotency key;
- retrieval/receipt/export time;
- source payload reference/hash through shared artifact/evidence infrastructure where required;
- transformation/mapping version;
- mapping standing;
- lossiness standing;
- rights/license standing where required;
- privacy/authorization standing where required;
- validation/conformance standing;
- warnings/unknown fields;
- admission/result standing;
- correction/supersession references.

The adapter envelope is provenance and translation context. It is not a second canonical owner of the translated domain object.

## External identifier and namespace rules

External identifiers must be namespaced.

At minimum, identity must distinguish:

- standard family;
- source/issuer/system namespace;
- external object identifier;
- version/revision when the external standard exposes one.

The same lexical identifier from two unrelated sources is not assumed to identify the same object.

An external ID may be preserved as a cross-reference without replacing a System Master internal ID.

Identifier collision must fail deterministically or remain explicitly ambiguous; it must not be silently merged.

## Version rules

The adapter must preserve the exact standard version used to interpret a payload.

A later standards revision cannot silently reinterpret historical payloads.

If a source omits version information that is required to interpret the object safely, the adapter must:

- derive it only from an owner-valid transport/profile guarantee; or
- mark the interpretation uncertain/unsupported; or
- fail closed when ambiguity could change meaning.

A migration between standard versions is an explicit transformation with its own transformation version and provenance.

## Mapping standing

Mappings must carry explicit standing. Minimum conceptual standings are:

- `EXACT` — semantics are demonstrably equivalent for the bounded fields represented;
- `BOUNDED` — useful mapping exists but only within explicit constraints;
- `LOSSY` — translation omits or weakens source semantics;
- `PROPOSED_ALIGNMENT` — possible relationship requiring authoritative review;
- `UNMAPPED` — no safe mapping exists;
- `CONFLICTED` — multiple incompatible interpretations exist;
- `UNSUPPORTED` — source/profile/version is not supported.

Naming may be reconciled later to existing objects, but the distinction must survive.

No `PROPOSED_ALIGNMENT`, `LOSSY`, `UNMAPPED`, or `CONFLICTED` state may masquerade as exact equivalence.

## Round-trip rule

Round-trip fidelity may be claimed only for the subset of fields whose semantics survive the round trip.

The adapter must not claim full losslessness merely because the payload can be serialized back into valid syntax.

Unknown source extensions should be preserved where safe and authorized if doing so is required for non-destructive round-trip exchange, but preserved opaque extensions do not become canonical Learning semantics.

## CASE adapter boundary

CASE is used as a competency/framework exchange adapter.

### CASE import may represent

- competency frameworks/documents;
- competency definitions;
- competency associations;
- rubrics;
- rubric criteria and levels;
- source identifiers and relationships.

### CASE import does not automatically establish

- canonical System Master skill identity;
- prerequisite truth;
- competency equivalence;
- mastery equivalence;
- learner mastery;
- curriculum approval;
- current/fresh source standing.

Curriculum must explicitly admit imported framework material into canonical instructional definitions.

### Competency-alignment rule

A CASE association or external framework mapping may produce a non-authoritative alignment proposal.

It cannot resolve the existing deferred cross-domain competency-equivalence authority (`LRN-069 / LRN-EXT-002`).

If two sources claim that different competencies are equivalent, the adapter preserves the claim and provenance but does not turn it into System Master equivalence truth.

Cross-domain competency equivalence therefore remains fail-closed until an explicit owner-valid authority exists.

## QTI adapter boundary

QTI is used as an assessment exchange adapter.

### QTI import/export may represent

- assessment items;
- tests/sections;
- response declarations and interactions;
- scoring/rubric-related metadata supported by the profile;
- results where the applicable exchange profile supports them;
- accessibility/presentation metadata supported by the source/profile.

### Curriculum admission

Imported QTI assessment content is source/proposed material until Curriculum admits it as an exact versioned AssessmentDefinition or subordinate definition.

A syntactically valid QTI package does not prove:

- construct validity;
- scoring validity;
- fairness;
- appropriate difficulty;
- alignment to a System Master criterion;
- suitability for mastery evidence.

### Learner-result admission

A QTI result or externally transported assessment result does not directly become a canonical Learning score, AssessmentAttempt, or mastery judgment.

It must enter through an owner-valid assessment ingress path.

The unresolved S04 external/asynchronous score-commit ingress remains unresolved and fail-closed. 001K must not invent a callback writer merely to make QTI exchange convenient.

### Assessment version safety

Assessment imports/exports must preserve, where available and material:

- external item/test identifier;
- source version/revision;
- imported content hash/reference;
- rubric/scoring rule version;
- transformation/mapping version;
- Curriculum admission version if admitted.

A later edit cannot silently reinterpret a historical attempt.

## Caliper adapter boundary

Caliper is used as a learning-activity event exchange adapter.

### Caliper may exchange event observations such as

- assessment activity;
- reading/media activity;
- tool/session activity;
- feedback/grading activity;
- assignable/resource interactions;
- other events supported by exact Caliper metric profiles.

### Event is not learning truth

A Caliper event is an event/observation envelope. It is not, by itself:

- mastery;
- retention;
- transfer;
- evidence admission;
- learner understanding;
- engagement truth;
- motivation;
- confusion;
- competence;
- instructional effectiveness.

Learning may admit an event as an observation only through an owner-valid observation/evidence path.

### No psychological inference from telemetry

Raw Caliper or provider telemetry must not be converted by default into canonical emotion, motivation, mental-state, or competence claims.

Learner-declared states remain distinct from telemetry-derived hypotheses.

### Actor identity

A Caliper actor identifier remains an external identifier until linked through the proper System Master identity authority.

## CLR adapter boundary

CLR is used as an achievement/learning-record exchange adapter.

### CLR export

Learning may contribute versioned qualification-evidence-package semantics to an authorized export, including bounded evidence or achievement references that the authorized issuing/credential layer is allowed to serialize.

The adapter must not overstate a Learning claim during export.

If Learning knows only that evidence supports a bounded skill claim, the exported representation must not silently upgrade it to certification, licensure, universal competency equivalence, or job eligibility.

### CLR import

An imported CLR or achievement assertion may be preserved as externally issued evidence with issuer/provenance/verification standing.

It does not automatically establish:

- canonical System Master identity;
- System Master mastery;
- current retention;
- transfer;
- competency equivalence;
- assessment validity;
- certification by System Master;
- hiring/licensing/job eligibility.

The correct System Master owner decides whether and how the imported achievement contributes to evidence.

### Verification versus meaning

Cryptographic/credential verification may establish that a credential is intact and attributable to an issuer under the applicable verification scheme.

That verification does not by itself establish that System Master accepts the issuer, accepts the competency mapping, agrees with the assessment validity, or grants the same semantic conclusion.

## Import lifecycle

A safe import follows this conceptual lifecycle:

1. receive/authenticate through the appropriate shared transport/security layer;
2. identify standard family/profile/version;
3. preserve original source/provenance reference;
4. validate syntax/schema/profile as applicable;
5. check authorization, rights, and privacy requirements;
6. translate into bounded interchange form;
7. classify mapping/lossiness/unknowns;
8. resolve external IDs without silent collision;
9. present owner-valid admission request to Curriculum/Learning/Identity/etc.;
10. record accepted/rejected/deferred/partial standing;
11. preserve correction/supersession lineage.

A schema-valid import is not automatically an admitted canonical object.

## Export lifecycle

A safe export follows this conceptual lifecycle:

1. identify owner-valid source state;
2. verify authorization/consent/right-to-share;
3. select exact target standard/profile/version;
4. map only semantics supported by both sides;
5. mark omissions/lossiness where material;
6. avoid broadening claims;
7. serialize/package/sign through the proper shared/external owner;
8. preserve export provenance and transformation version;
9. record delivery/result standing where appropriate.

The adapter cannot invent missing claims to make an external schema look complete.

## Idempotency and replay

Repeated import of the same external semantic object/version with the same payload must not create duplicate canonical meaning.

Same external operation identity plus a materially different payload must fail deterministically or enter explicit conflict/supersession handling.

Replay after restart must reconstruct the same mapping/admission standing from durable provenance.

Transport retry is not a new learning event merely because it was received twice.

## Corrections and supersession

External sources may correct or replace earlier objects.

The adapter must preserve lineage between:

- original import;
- corrected/revised source object;
- transformation versions;
- owner-valid admission consequences;
- any downstream reprojection triggered by a valid correction.

Historical source material must not be destructively overwritten when it was used to support prior owner-valid decisions.

A source deletion or revocation does not authorize silent erasure of System Master historical evidence; the appropriate owner must decide the consequence while preserving audit/provenance requirements.

## Unknown, extension, and unsupported data

Unknown does not mean false, zero, or irrelevant.

When a source field or extension is not understood:

- preserve it opaquely only when safe/authorized/useful for provenance or round trip;
- do not guess its semantic meaning;
- do not map it into a nearby System Master field just to avoid data loss;
- surface the unsupported/unknown standing;
- fail closed when the unknown field is material to an authoritative decision.

## Rights, privacy, and authorization

Interoperability does not bypass System Master rights/privacy/security boundaries.

Before import/export, the applicable owners may require:

- user authorization/consent;
- purpose limitation;
- minimum-necessary disclosure;
- data retention rules;
- license/right-to-use confirmation;
- issuer/source trust policy;
- recipient authorization;
- credential/PII handling restrictions.

A public standard is not permission to share private data.

## Conformance is not semantic acceptance

System Master must distinguish at least:

- payload/schema conformance;
- adapter implementation conformance;
- successful transport;
- successful translation;
- owner-valid admission;
- assessment/measurement validity;
- mastery/evidence validity;
- credential verification;
- educational effectiveness.

A PASS in one category cannot be reported as a PASS in another.

Examples:

- CASE-conformant competency data is not automatically equivalent to a System Master skill;
- QTI-conformant assessment content is not automatically a valid mastery measure;
- Caliper-conformant events are not automatically evidence of learning;
- CLR verification is not automatically System Master certification or eligibility.

## Fail-closed cases

The adapter must fail closed or remain explicitly unresolved when:

- standard/profile/version cannot be determined and the ambiguity affects meaning;
- namespace collision cannot be resolved;
- required provenance is missing;
- required authorization/rights/privacy standing is missing;
- mapping would materially broaden the source claim;
- the only available mapping is conflicted but a canonical decision is requested;
- a QTI/external score seeks to bypass the unresolved assessment-ingress owner;
- competency equivalence is requested without an owner-valid equivalence authority;
- an external learner identifier is presented as canonical identity without identity linkage;
- a credential/achievement is presented as System Master certification or eligibility without the responsible external authority.

## Learner-facing explanation

Where imported/exported data affects the learner experience, System Master should be able to explain:

- what external source was used;
- what standard/profile/version was involved when useful;
- whether the mapping was exact, bounded, lossy, proposed, or unresolved;
- what System Master accepted versus merely preserved;
- what remains unknown;
- whether an external achievement affected Learning evidence and why;
- why an external claim did not automatically become mastery/certification/equivalence.

The explanation must not imply authority the adapter does not possess.

## Constitution reconciliation rule

001K freezes semantics and boundaries only.

It does **not** create or renumber active requirement IDs, interface IDs, or semantic-object IDs yet.

During the next constitution-delta pass:

1. reuse existing transport, evidence/provenance, external-reference, artifact, identity, Learning, Curriculum, and qualification structures wherever they preserve these semantics losslessly;
2. keep CASE/QTI/Caliper/CLR as adapters rather than canonical owners;
3. add the minimum subordinate interoperability descriptor/envelope/mapping standing only if the active 116 requirements / 112 interfaces / 28 semantic objects cannot represent these rules losslessly;
4. preserve historical 110/110/26 lineage;
5. preserve `LRN-069 / LRN-EXT-002` competency equivalence as unresolved/fail-closed;
6. preserve S04 external/asynchronous score ingress as unresolved/fail-closed;
7. do not create a second identity, mastery, assessment, credential, certification, eligibility, rights, privacy, transport, or artifact authority;
8. do not add a generic integration platform inside Learning.

## Pre-build acceptance denominator

A separate **96-case 001K pre-build acceptance contract** is frozen with this operation.

Those cases are future executable obligations, not PASS claims. Runtime execution remains deferred until the rebuild foundation is constitutionally reconciled and the exact implementation slices are materialized.

## Frozen outcome

001K freezes these product capabilities:

1. adapter-not-authority constitutional rule;
2. exact standard/profile/version binding;
3. namespace-safe external identifiers;
4. import/export provenance;
5. explicit mapping/lossiness standing;
6. unknown/unmapped/conflicted preservation;
7. bounded round-trip fidelity claims;
8. CASE framework/competency exchange boundary;
9. non-authoritative competency-alignment proposals;
10. fail-closed unresolved competency equivalence;
11. QTI assessment-content exchange boundary;
12. owner-valid Curriculum admission for imported assessments;
13. fail-closed external assessment-result ingress;
14. Caliper learning-event exchange boundary;
15. event-not-mastery/evidence separation;
16. no telemetry-to-psychological-truth shortcut;
17. CLR achievement/record exchange boundary;
18. credential verification versus System Master meaning separation;
19. no imported credential-to-mastery/certification/eligibility shortcut;
20. no external identifier-to-person-identity shortcut;
21. rights/privacy/authorization gating;
22. idempotent import/replay;
23. correction/revision/supersession lineage;
24. no silent claim broadening on export;
25. conformance/transport/translation/admission/validity/effectiveness separation;
26. deterministic fail-closed handling of ambiguity;
27. learner-facing interoperability explanation;
28. smallest-possible constitutional delta requirement.

No runtime adapter, conformance certification, interoperability PASS, competency-equivalence claim, assessment-validity claim, certification claim, eligibility claim, or educational-effectiveness claim is admitted by this freeze.

## Exact next operation

`LEARNING-SYSTEM-REBUILD-001L — CONSTITUTIONAL RECONCILIATION / MINIMUM DELTA -> RECONCILE 001D-001K INTO ACTIVE 116 REQUIREMENTS / 112 INTERFACES / 28 SEMANTIC OBJECTS -> REUSE EXISTING IDS + OBJECTS FIRST -> ADD ONLY LOSSLESSLY REQUIRED SURFACES -> PRESERVE HISTORICAL 110/110/26 LINEAGE -> PRESERVE DEFERRED AUTHORITY GAPS FAIL-CLOSED -> PRODUCE EXACT IMPLEMENTATION-READY DELTA -> FREEZE BEFORE RUNTIME BUILD`

Reason: 001K is the final foundation capability in the frozen 001C sequence. The rebuild must now reconcile 001D through 001K into the existing Learning constitution before any runtime implementation or executable qualification resumes.