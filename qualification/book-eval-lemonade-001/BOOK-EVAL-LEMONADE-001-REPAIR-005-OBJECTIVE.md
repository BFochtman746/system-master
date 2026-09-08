# BOOK-EVAL-LEMONADE-001-REPAIR-005 — Literary Reference Corpus + Hierarchical Specialist Evaluator / Contrastive Judge Training Design

## Objective

Replace the flat prompt-only judge architecture with a reusable literary-intelligence layer and hierarchical specialist evaluator that can serve both Book qualification and future prose optimization.

REPAIR-004 v2 established a 65.0% DEVELOPMENT baseline, up 23.75 percentage points from original E4, while preserving 100% clean control, 100% staleness, 100% oracle validation, 100% evidence precision, and zero prohibited-finding hard-gate violations. The remaining failures are concentrated in semantically adjacent literary labels, making hierarchy, references and contrastive training the dependency-valid next move.

## Architecture

1. **Reference construction** — extract authoritative facts, timeline, character state, governing brief, source support, protected language and candidate deltas before diagnosis.
2. **Hierarchical router** — route broad task mode to a small specialist family; router never outputs the final ontology leaf.
3. **Specialist classifier** — classify only within the selected specialist label set, with an explicit `REVIEW_REQUIRED` abstention path.
4. **Independent dimension graders** — severity, evidence adequacy, preservation, clean-control and confidence are graded independently from primary diagnosis.
5. **Selective escalation** — ordinary cases use the cheapest qualified specialist; uncertain/high-impact cases escalate to larger reasoning models or human review.
6. **Literary Reference Engine** — shared craft-principle and contrastive corpus supports both judge training and prose optimization without optimizing toward copying a named author.

## Corpus policy

Full-text training/reference material is limited to verified public-domain, licensed, or user-authorized sources. Other works may contribute permitted metadata, abstract craft analysis and technique descriptors without becoming an unauthorized persistent full-text corpus.

The system learns transferable literary decisions: narrative distance, rhythm, pacing, dialogue subtext, exposition, tension, information release, setup/payoff, POV fidelity, sensory specificity, rhetorical structure, preservation and related dimensions. Author identity is not a target style label.

## Contrastive judge-training records

Each training unit should isolate one boundary and include:

- task mode and specialist;
- provider-visible input or a development-derived/synthetic non-holdout case;
- correct leaf token;
- tempting near-neighbor negative token(s);
- decisive evidence/reference state;
- boundary explanation in abstract terms;
- counterfactual describing what change would make the negative token correct;
- source/provenance and rights status;
- contamination status proving no hidden-holdout gold was used.

High-priority boundaries from REPAIR-004 v2:

- legitimate tradeoff vs A/B better;
- A/B better vs objectively superior;
- knowledge-state contradiction vs POV knowledge leak;
- timeline contradiction vs timeline-continuity contradiction;
- object-state vs location-continuity contradiction;
- fact contradiction vs factual-claim error vs source-support conflict;
- causal-motivation bridge vs argument mechanism vs unresolved goal conflict vs missing payoff;
- meaning-preservation damage vs intent-preservation damage vs safe edit.

## Prose optimization use

The same reference layer becomes a future Book-writing capability:

`draft -> analyze -> retrieve relevant craft principles/abstract exemplars -> generate targeted revisions -> verify voice/canon/intent/protected language -> independently compare -> accept only measurable improvement`.

The optimizer is project-relative. It does not impose one universal definition of great prose and it does not replace the author's declared voice merely because reference works differ stylistically.

## Qualification gates

### Gate A — taxonomy integrity

- Every provider ontology leaf assigned to exactly one specialist within its task mode.
- No extra or hidden labels.
- No specialist receives scoring-private family/split/oracle/gold metadata.
- Machine validation passes.

### Gate B — contrastive corpus integrity

- Development/synthetic only for adaptive training.
- Hidden-holdout gold forbidden.
- Every record has a decisive boundary and at least one hard negative.
- Rights/provenance recorded.
- Position swaps included for pairwise training.

### Gate C — specialist DEVELOPMENT qualification

Before a new visible-regression run, require:

- router accuracy >= 95% against DEVELOPMENT specialist routing labels;
- leaf accuracy >= 85% within routed specialists on DEVELOPMENT;
- clean-control >= 95%;
- prohibited-finding hard-gate violations = 0;
- evidence precision >= 95%;
- abstention/review path calibrated so uncertain cases are not forced into a low-confidence wrong leaf.

### Gate D — fresh validation

Only after Gate C passes, construct a new untouched validation set not adaptively used in training. Require >=85% exact leaf accuracy with no material hard-gate regressions before spending on a new sealed qualification holdout.

### Gate E — final 90% qualification

A 90%+ claim must be demonstrated on a newly sealed unseen holdout, and only for dimensions whose human-expert agreement supports that threshold. Objective and subjective literary dimensions may use different qualification metrics if human calibration proves they have different attainable agreement ceilings.

## Standing

**ACTIVE — ARCHITECTURE/CONTRACT IMPLEMENTATION.**

Do not start another full 160-case E4/E5 blind campaign. Do not tune against the retired old hidden holdout or the already-consumed visible-regression answers. First qualify hierarchy integrity and build the DEVELOPMENT/synthetic contrastive training foundation.