# LITERARY-PROSE-ENGINE-001 — CANONICAL MASTER PLAN v1

Status: CANONICAL / MASTER-001
Scope: Literary prose intelligence, diagnosis, revision, evaluation, voice evolution, and reference-corpus architecture.
Branch: `literary-prose-engine-001`

## 1. North-star objective

Build a literary intelligence system that can:

1. infer what a passage is trying to accomplish;
2. identify what is already effective and distinctive;
3. diagnose the highest-value limiting factor;
4. retrieve transferable craft intelligence and rights-admissible references;
5. generate bounded revision candidates at multiple ambition levels;
6. independently compare original and candidate without treating the writer's rationale as authority;
7. reject changes that damage canon, meaning, intent, character, POV, project identity, or protected language;
8. distinguish voice degradation from legitimate voice evolution;
9. learn from accepted and rejected decisions; and
10. improve the work without converging it toward generic prestige prose or a named external author.

The target is not preservation of the author's current habits. The target is the strongest defensible version of the work's own literary identity.

## 2. Governing principles

### 2.1 Frequency is not quality

A recurring trait is not automatically protected. Every learned voice trait must be adjudicable as one of:

- `PROTECT`: distinctive and demonstrably effective; disturbance requires strong evidence.
- `RANGE`: valid part of the voice whose frequency/intensity must vary with context.
- `CHALLENGE`: recurring habit that should be questioned whenever encountered.
- `SUPPRESS`: reliably detrimental tendency that should not be preserved merely because it recurs.

### 2.2 Voice is hierarchical

The engine shall model, at minimum:

`AUTHOR_FINGERPRINT -> PROJECT_VOICE -> BOOK_VOICE -> POV_CHARACTER_VOICE -> LOCAL_PASSAGE_STATE`

A higher level constrains but does not erase a more local level. External reference corpora are never above the project's own canon, intent, or approved voice evidence.

### 2.3 Voice degradation and voice evolution are different

A revision may move statistically away from an old manuscript baseline and still be correct if it produces a supported improvement while preserving the deeper identity and project constraints. The system must track:

- `VOICE_DEGRADATION`
- `VOICE_EVOLUTION`
- `VOICE_NEUTRAL_CHANGE`
- `VOICE_UNCERTAIN`

### 2.4 Original text wins by default

Uncertainty, tied evidence, or unresolved critical regression yields `RETAIN_ORIGINAL`.

### 2.5 No universal prose score

The engine must not optimize one scalar called "great prose". Decisions are conditioned, multi-objective, preservation-constrained, and preferably pairwise.

### 2.6 No named-author imitation objective

A named external author may exist in provenance or scholarship metadata but may not become a generation target, nearest-author target, similarity objective, or quality proxy.

## 3. Intelligence authorities

The engine uses five distinct evidence families with different authority roles.

### 3.1 User-owned manuscript evidence

Purpose:
- infer author/project/book/local fingerprints;
- identify repeated craft strengths and habits;
- compare maturity states when version authority is known;
- build development trajectories;
- provide authorized project examples.

Manuscripts are never averaged indiscriminately. Version authority and project boundaries matter.

### 3.2 User decision evidence

Accepted, rejected, and modified revisions become preference evidence. User decisions are the highest project-specific preference authority, subject to explicit safety, canon, and factual constraints.

### 3.3 Literary Craft Academy

Structured knowledge distilled from rights-admissible professional editing standards, creative-writing pedagogy, narratology, stylistics, rhetoric, linguistics, discourse analysis, revision research, cognitive reading research, genre craft, and related disciplines.

The Academy teaches mechanisms and effects, not author mimicry.

### 3.4 Rights-clean reference laboratory

Rights-verified public-domain, licensed, and user-authorized works may support passage-level analysis according to their rights class. Analysis-only sources may contribute only lawful, nonreconstructive derived intelligence.

### 3.5 Contrastive Craft Foundry

Controlled synthetic and authorized examples vary one or a small number of craft decisions while holding scene state constant. These produce:

- `CRAFT_PRINCIPLE`
- `CONTRASTIVE_PAIR`
- `TECHNIQUE_PROFILE`
- `REVISION_TRANSFORM`
- `HARD_NEGATIVE`
- `REFERENCE_STATE`

## 4. Manuscript development corpus

User-owned manuscripts may be admitted later under STEP-B as authorized sources, but MASTER-001 does not ingest or persist them into a corpus.

When admitted, each manuscript must retain:

- project identity;
- book identity;
- version identity;
- maturity/authority state;
- date/version provenance where known;
- canon status;
- relation to prior/later versions;
- protected-language state;
- user-approval state.

Development-trajectory analysis must distinguish:

1. stable author fingerprint;
2. project-specific style;
3. book-specific constraints;
4. local passage requirements;
5. maturity-linked changes;
6. merely repeated habits;
7. explicit user preference changes.

## 5. Voice trait adjudication

Every inferred trait must carry:

- trait id and description;
- hierarchy level(s);
- evidence passages or derived evidence ids;
- frequency estimate;
- demonstrated effect(s);
- failure modes;
- contextual conditions;
- maturity correlation where available;
- user preference evidence where available;
- confidence;
- disposition: `PROTECT | RANGE | CHALLENGE | SUPPRESS`;
- rationale;
- review horizon.

No trait may be promoted to `PROTECT` solely because it is frequent.

## 6. Literary Craft Academy

Each craft record should encode:

- mechanism;
- intended reader effect;
- conditions under which it tends to help;
- counterconditions;
- failure modes;
- interactions with other techniques;
- diagnostic signals;
- revision transforms;
- genre/form/audience applicability;
- POV/narrative-distance applicability;
- provenance and rights projection;
- counterexamples or hard negatives where permitted.

The Academy must explicitly resist universalized slogans. Rules such as "show, don't tell" are converted into conditional craft principles rather than absolute prescriptions.

## 7. Passage Intelligence Engine

Before revision, construct a `PASSAGE_STATE` containing at minimum:

### Purpose state
- scene/chapter function;
- intended movement or change;
- target reader effect;
- importance and edit budget.

### Reader state
- known information;
- expected information;
- uncertainty;
- tension/question state;
- orientation burden.

### Character state
- goals;
- knowledge boundaries;
- emotion;
- relationships and pressure;
- agency;
- continuity constraints.

### Narrative state
- POV;
- focalization;
- narrative distance;
- chronology/time handling;
- pacing target;
- information-release state.

### Voice state
- author fingerprint constraints;
- project voice;
- book voice;
- character/POV voice;
- local cadence/register;
- active trait dispositions.

### Preservation state
- canon facts;
- authorial intent;
- protected language;
- theological/historical constraints where applicable;
- factual constraints;
- required ambiguity or uncertainty.

### Craft state
- current strengths;
- current weaknesses;
- candidate opportunities;
- confidence and evidence.

Revision is prohibited when the required state cannot be established with sufficient confidence for the proposed edit scope.

## 8. Specialist diagnostic system

The engine shall support separable specialists for at least:

- sentence rhythm and syntax;
- paragraph movement;
- diction/register;
- POV/focalization/narrative distance;
- character goal/agency/continuity;
- dialogue/subtext/distinctiveness;
- scene tension and causality;
- pacing/compression/expansion;
- information release and reader orientation;
- description, sensory specificity, imagery, metaphor, motif;
- emotional progression;
- exposition and argument;
- theological/philosophical reasoning where relevant;
- historical register where relevant;
- opening/ending turns;
- canon and protected-language preservation;
- voice preservation/evolution;
- homogenization/overoptimization risk.

Specialists diagnose and supply evidence. They do not all rewrite.

## 9. Opportunity prioritization

The engine should prefer the highest-value change rather than maximize the number of edits.

Opportunity priority should be conditioned by:

- expected literary impact;
- diagnostic confidence;
- relevance to passage purpose;
- preservation risk;
- voice risk;
- collateral regression risk;
- edit budget.

The system must permit `NO_ACTION` when no change has sufficient expected value.

## 10. Revision laboratory

For an accepted opportunity, candidates may be generated at bounded ambition levels:

- `LEVEL_0_NO_CHANGE`
- `LEVEL_1_SURGICAL`
- `LEVEL_2_LOCAL_RESTRUCTURE`
- `LEVEL_3_SUBSTANTIAL_REWORK`
- `LEVEL_4_APPROACH_CHALLENGE`

Each candidate must declare its intended target dimension(s) and preservation obligations. Higher ambition requires stronger evaluator evidence and a larger preservation audit.

## 11. Independent literary evaluator

Writer and evaluator remain logically separated.

The evaluator receives original and candidate without treating writer rationale as authoritative. Pairwise evaluation should include position swapping where practical.

At minimum evaluate:

- target improvement;
- meaning preservation;
- canon preservation;
- authorial intent;
- protected language;
- POV/focalization/distance;
- character integrity;
- voice identity/evolution;
- rhythm and readability;
- clarity/orientation;
- tension/subtext/pacing as relevant;
- factual/historical/theological constraints where applicable;
- unwanted homogenization;
- non-target regressions.

Critical preservation failure is a hard reject. Low confidence yields `RETAIN_ORIGINAL` or human review.

## 12. Voice Evolution Engine

Project learning maintains four distinct stores:

- `STABLE_IDENTITY`: strong evidence of traits worth preserving.
- `CURRENT_PREFERENCE`: current project/book preferences.
- `DEVELOPMENT_FRONTIER`: traits or capabilities intentionally being pushed.
- `REJECTED_DIRECTION`: changes that appeared polished but harmed the work or conflicted with user preference.

Accepted and rejected revisions both become evidence. The system must not overwrite historical preference evidence; it should preserve chronology and rationale.

## 13. Homogenization and overoptimization defense

Monitor at minimum:

- lexical diversity collapse;
- sentence-length/cadence convergence;
- repeated rhetorical construction saturation;
- metaphor normalization;
- dialogue convergence across characters;
- loss of intentional fragments, dialect, or irregularity;
- register drift;
- project-to-project voice convergence;
- generic prestige-prose drift;
- repeated optimization of one dimension at the expense of others.

Mitigations include bounded edit budgets, clean controls, hard negatives, baseline comparisons, project holdouts, position-swapped evaluation, abstention, and periodic user adjudication.

## 14. Rights and provenance boundary

MASTER-001 inherits STEP-A without weakening it.

Allowed full-text persistence requires a qualifying rights class and evidence. `ANALYSIS_ONLY_NO_FULL_TEXT` content remains derived-only and nonreconstructive. Unknown rights never default to admission. No bulk acquisition is authorized by MASTER-001.

## 15. Canonical build sequence

### MASTER-001 — Canonical master architecture binding
Status after qualification: CLOSED.

### STEP-B — Admission Controller + Reference/Manuscript Ingestion and Derivation Qualification
Implement source-by-source admission, rights-evidence verification hooks, text custody, dedup/overlap controls, manuscript maturity/version metadata, and fixture qualification. No bulk acquisition.

### STEP-C — Voice Intelligence + Development Trajectory
Implement hierarchy, trait inference, `PROTECT/RANGE/CHALLENGE/SUPPRESS`, maturity correlations, and voice degradation/evolution classification.

### STEP-D — Literary Craft Academy + Source Registry
Implement systematic source survey, rights classification, craft-principle distillation, research quality scoring, and registry governance.

### STEP-E — Passage Intelligence Engine
Implement purpose/reader/character/narrative/voice/preservation/craft state construction.

### STEP-F — Specialist Diagnostic System
Implement evidence-producing diagnostic specialists and opportunity ranking.

### STEP-G — Contrastive Craft Foundry
Implement controlled contrast generation, hard negatives, revision transforms, and technique-effect records.

### STEP-H — Controlled Revision Engine
Implement bounded candidate generation with edit ambition levels and preservation constraints.

### STEP-I — Independent Literary Evaluator
Implement blind/pairwise evaluation, position swap, abstention, regression checks, and retain-original default.

### STEP-J — Voice Evolution + Preference Learning
Implement stable identity, current preference, development frontier, rejected direction, and chronological learning.

### STEP-K — Homogenization / Overoptimization Defense
Implement drift metrics, clean controls, project holdouts, edit budgets, and defensive gates.

### STEP-L — Closed-loop Qualification
Qualify analyze -> diagnose -> retrieve -> revise -> independently evaluate -> accept/reject -> learn, including adversarial and preservation cases.

### REAL-BOOK-QUALIFICATION
Only after STEP-L closure may representative user-owned chapters be used for authoritative end-to-end qualification under explicit corpus/admission state.

## 16. Dependency law

No later step may silently redefine an earlier invariant. If evidence requires an architectural change, it must be introduced as an explicit revision to the master contract, with compatibility impact and migration notes.

STEP-B through STEP-L are implementations of this master plan, not opportunities to reopen its basic purpose.

## 17. MASTER-001 closure criteria

MASTER-001 passes when repository artifacts prove:

1. north-star objective bound;
2. voice hierarchy bound;
3. trait dispositions bound;
4. degradation/evolution distinction bound;
5. manuscript maturity/development trajectory bound;
6. Craft Academy bound;
7. rights-clean reference lab bound;
8. Contrastive Craft Foundry bound;
9. Passage Intelligence state bound;
10. specialists and opportunity prioritization bound;
11. revision ambition levels bound;
12. independent evaluator and retain-original default bound;
13. preference learning stores bound;
14. homogenization defense bound;
15. STEP-B through STEP-L dependency roadmap bound;
16. STEP-A rights and anti-imitation invariants inherited without weakening;
17. no bulk corpus acquisition started by MASTER-001.
