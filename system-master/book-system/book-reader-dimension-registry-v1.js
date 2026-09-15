'use strict';

const DIMENSION_SCHEMA_VERSION = 'BOOK_READER_DIMENSION_REGISTRY_V1';
const LENS_SCHEMA_VERSION = 'BOOK_READER_PERSPECTIVE_LENS_V1';
const MEASUREMENT_POSTURE = 'INTENT_RELATIVE_MULTIMODAL_EVIDENCE';
const ANTI_GAMING_RULE = 'Never optimize the dimension without its intent envelope; preserve uncertainty and reader plurality.';

const GROUP_COUNTS = Object.freeze({
  COMPREHENSION: 8,
  ATTENTION_ENGAGEMENT: 6,
  AFFECT: 8,
  CURIOSITY_TENSION: 8,
  IMAGERY_ABSORPTION: 6,
  TRUST_EPISTEMIC: 6,
  EFFORT_CONFUSION_FATIGUE: 8,
  RESONANCE_MEMORY_MOMENTUM: 8,
  CALIBRATION_PLURALISM: 6
});

const RAW_DIMENSIONS = [
['PCE013-DIM-001','COMPREHENSION','LOCAL_MEANING','Local meaning uptake','Is the unit-level proposition/event likely understood as intended?'],
['PCE013-DIM-002','COMPREHENSION','CAUSAL_INTEGRATION','Causal integration','Can the reader connect cause, consequence, enabling conditions and explanation?'],
['PCE013-DIM-003','COMPREHENSION','TEMPORAL_ORIENTATION','Temporal orientation','Does the reader know when events/claims occur and how time shifts relate?'],
['PCE013-DIM-004','COMPREHENSION','SPATIAL_ORIENTATION','Spatial orientation','Can the reader maintain relevant location/scene relations where they matter?'],
['PCE013-DIM-005','COMPREHENSION','ENTITY_TRACKING','Entity/character tracking','Can the reader track who/what is active, referred to, changed or newly introduced?'],
['PCE013-DIM-006','COMPREHENSION','GOAL_INTENTION','Goal/intention tracking','Can the reader infer active goals, plans, motives or argumentative purposes at the intended certainty?'],
['PCE013-DIM-007','COMPREHENSION','INFERENCE_BURDEN','Inference burden','Are required inferences proportionate to intent/profile rather than accidental gaps?'],
['PCE013-DIM-008','COMPREHENSION','AMBIGUITY_BOUNDARY','Ambiguity boundary','Is uncertainty intentional/productive or likely to become unintended misunderstanding?'],
['PCE013-DIM-009','ATTENTION_ENGAGEMENT','FOCUS','Attentional focus','Is attention likely to remain on the relevant narrative/argumental material?'],
['PCE013-DIM-010','ATTENTION_ENGAGEMENT','ENGAGEMENT_CONTINUITY','Engagement continuity','Does engagement sustain or intentionally ebb/return across units?'],
['PCE013-DIM-011','ATTENTION_ENGAGEMENT','DISTRACTION_RISK','Distraction risk','Where is attentional disengagement plausible and why?'],
['PCE013-DIM-012','ATTENTION_ENGAGEMENT','REENGAGEMENT','Re-engagement','After a lull/transition, does the work supply a plausible re-entry hook or orientation point?'],
['PCE013-DIM-013','ATTENTION_ENGAGEMENT','INVOLVEMENT','Narrative/idea involvement','Does the reader form meaningful involvement with events, ideas or characters as intended?'],
['PCE013-DIM-014','ATTENTION_ENGAGEMENT','DROPOUT_RISK','Continuation/dropout risk','Is there a localized risk of abandoning the reading task, distinct from deliberate pause?'],
['PCE013-DIM-015','AFFECT','VALENCE','Affective valence','What positive/negative/mixed affect is plausibly activated, with uncertainty?'],
['PCE013-DIM-016','AFFECT','AROUSAL','Affective arousal','How activated/calm is the predicted emotional state relative to intent?'],
['PCE013-DIM-017','AFFECT','EMOTION_SPECIFICITY','Emotion specificity','Which emotions are plausible rather than collapsing to sentiment?'],
['PCE013-DIM-018','AFFECT','EMPATHIC_CONNECTION','Empathic/character connection','Is perspective-taking/sympathy/identification plausible where intended?'],
['PCE013-DIM-019','AFFECT','AFFECT_INTENT_FIT','Affect-intent fit','Does the predicted affect match the intended emotional function or deliberately diverge?'],
['PCE013-DIM-020','AFFECT','AFFECT_TRANSITION','Affective transition','Do emotional changes have legible triggers and appropriate contour?'],
['PCE013-DIM-021','AFFECT','INTENSITY_CALIBRATION','Intensity calibration','Is emotional intensity proportionate to stakes, tone, genre and author intent?'],
['PCE013-DIM-022','AFFECT','EMOTIONAL_RESIDUE','Emotional residue','What affect is likely to persist across the next boundary or after closure?'],
['PCE013-DIM-023','CURIOSITY_TENSION','OPEN_QUESTIONS','Open-question load','What questions are active, and is their number/importance manageable?'],
['PCE013-DIM-024','CURIOSITY_TENSION','INFORMATION_GAP','Information-gap curiosity','Does withheld/partial information create useful desire-to-know?'],
['PCE013-DIM-025','CURIOSITY_TENSION','EXPECTATION_GENERATION','Expectation generation','What outcomes/explanations does the reader predict from available evidence?'],
['PCE013-DIM-026','CURIOSITY_TENSION','EXPECTATION_CALIBRATION','Expectation calibration','Are expectations appropriately strong/weak or misleading relative to intended payoff?'],
['PCE013-DIM-027','CURIOSITY_TENSION','SUSPENSE_TENSION','Suspense/tension','How do uncertainty, stakes, delay and anticipation combine relative to intent?'],
['PCE013-DIM-028','CURIOSITY_TENSION','STAKES_LEGIBILITY','Stakes legibility','Does the reader understand what can be gained/lost and for whom/what?'],
['PCE013-DIM-029','CURIOSITY_TENSION','SURPRISE_PREPARATION','Surprise preparation','Can a surprise feel surprising without feeling ungrounded when its function requires fairness?'],
['PCE013-DIM-030','CURIOSITY_TENSION','PAYOFF_ANTICIPATION','Payoff anticipation','Do setups create appropriately timed expectation for later resolution?'],
['PCE013-DIM-031','IMAGERY_ABSORPTION','MENTAL_IMAGERY','Mental imagery','Can the reader construct relevant people/places/actions/concepts vividly enough for the intended effect?'],
['PCE013-DIM-032','IMAGERY_ABSORPTION','SCENE_MODEL_COHERENCE','Scene/storyworld coherence','Does the imagined world remain coherent across updates?'],
['PCE013-DIM-033','IMAGERY_ABSORPTION','TRANSPORTATION','Transportation','Is immersion into the narrative/idea world plausible without treating transportation as mandatory quality?'],
['PCE013-DIM-034','IMAGERY_ABSORPTION','EMOTIONAL_ENGAGEMENT','Emotional engagement','Does the reader feel for/with characters or ideas where intended?'],
['PCE013-DIM-035','IMAGERY_ABSORPTION','VIEWPOINT_PRESENCE','Viewpoint presence','Does perspective/narrative distance support the intended sense of presence?'],
['PCE013-DIM-036','IMAGERY_ABSORPTION','IMAGERY_CONTINUITY','Imagery continuity','Do images and scene models update without accidental disorientation?'],
['PCE013-DIM-037','TRUST_EPISTEMIC','NARRATOR_SOURCE_CREDIBILITY','Narrator/source credibility','How credible does the relevant narrator/source appear under current evidence?'],
['PCE013-DIM-038','TRUST_EPISTEMIC','CLAIM_PLAUSIBILITY','Claim plausibility','How plausible do claims/events appear given reader knowledge and manuscript evidence?'],
['PCE013-DIM-039','TRUST_EPISTEMIC','EVIDENCE_PERCEPTION','Perceived evidence sufficiency','Does the reader perceive adequate support for the stated certainty/purpose?'],
['PCE013-DIM-040','TRUST_EPISTEMIC','CERTAINTY_ALIGNMENT','Certainty alignment','Does rhetoric communicate a certainty level consistent with evidence and author stance?'],
['PCE013-DIM-041','TRUST_EPISTEMIC','CONTRADICTION_RESPONSE','Contradiction response','Are apparent contradictions productively unresolved, reconciled, or trust-damaging?'],
['PCE013-DIM-042','TRUST_EPISTEMIC','TRUST_RECOVERY','Trust recovery','After uncertainty/error/unreliability, is the intended trust relationship re-established or reframed?'],
['PCE013-DIM-043','EFFORT_CONFUSION_FATIGUE','PROCESSING_EFFORT','Overall processing effort','How demanding is integration relative to reader profile and intended difficulty?'],
['PCE013-DIM-044','EFFORT_CONFUSION_FATIGUE','LEXICAL_BURDEN','Lexical burden','Does vocabulary create productive precision or unnecessary access cost?'],
['PCE013-DIM-045','EFFORT_CONFUSION_FATIGUE','SYNTACTIC_BURDEN','Syntactic burden','Does syntax support intended nuance or create unintended parsing difficulty?'],
['PCE013-DIM-046','EFFORT_CONFUSION_FATIGUE','REFERENTIAL_BURDEN','Referential burden','How difficult is pronoun/entity/reference resolution?'],
['PCE013-DIM-047','EFFORT_CONFUSION_FATIGUE','CONCEPTUAL_DENSITY','Conceptual density','Can the reader integrate concept/claim density at the intended pace?'],
['PCE013-DIM-048','EFFORT_CONFUSION_FATIGUE','PRODUCTIVE_CONFUSION','Productive confusion','Does uncertainty invite hypothesis/inquiry rather than merely block comprehension?'],
['PCE013-DIM-049','EFFORT_CONFUSION_FATIGUE','UNPRODUCTIVE_CONFUSION','Unproductive confusion','Where is misunderstanding likely without intended payoff?'],
['PCE013-DIM-050','EFFORT_CONFUSION_FATIGUE','FATIGUE_ACCUMULATION','Fatigue accumulation','Does effort accumulate beyond the intended reading burden or recover after demanding sections?'],
['PCE013-DIM-051','RESONANCE_MEMORY_MOMENTUM','SALIENCE','Salience','Which events/ideas/images/lines are likely to stand out and why?'],
['PCE013-DIM-052','RESONANCE_MEMORY_MOMENTUM','MEMORABILITY','Memorability','Which content is likely retained across later units, with uncertainty?'],
['PCE013-DIM-053','RESONANCE_MEMORY_MOMENTUM','THEMATIC_RESONANCE','Thematic resonance','Do patterns/themes gain reader-side significance without the simulator becoming theme authority?'],
['PCE013-DIM-054','RESONANCE_MEMORY_MOMENTUM','PERSONAL_RESONANCE','Personal resonance','Where might a bounded profile connect personally, without claiming universal or identity-determined response?'],
['PCE013-DIM-055','RESONANCE_MEMORY_MOMENTUM','MOTIF_RETENTION','Motif/callback retention','Are motifs/setups likely remembered when later callbacks/payoffs arrive?'],
['PCE013-DIM-056','RESONANCE_MEMORY_MOMENTUM','MOMENTUM','Reading momentum','Does the reader feel forward pull, deliberate pause, or drag relative to pacing intent?'],
['PCE013-DIM-057','RESONANCE_MEMORY_MOMENTUM','CONTINUATION_DESIRE','Continuation desire','Is desire to continue plausible for this profile/purpose, without equating it to literary value?'],
['PCE013-DIM-058','RESONANCE_MEMORY_MOMENTUM','CLOSURE_RESIDUE','Closure/aftereffect','At a local/final closure, what questions, emotions, ideas or images remain as intended?'],
['PCE013-DIM-059','CALIBRATION_PLURALISM','PROFILE_SENSITIVITY','Profile sensitivity','Do predicted responses change plausibly when task-relevant reader assumptions change?'],
['PCE013-DIM-060','CALIBRATION_PLURALISM','RUN_STABILITY','Run stability','Are repeated simulations stable enough on calibrated dimensions, and is stochastic variance reported?'],
['PCE013-DIM-061','CALIBRATION_PLURALISM','PROFILE_DISAGREEMENT','Profile disagreement','Where do reader profiles diverge materially and what assumptions drive it?'],
['PCE013-DIM-062','CALIBRATION_PLURALISM','MODEL_DISAGREEMENT','Model/evaluator disagreement','Where do different simulators/evaluators disagree?'],
['PCE013-DIM-063','CALIBRATION_PLURALISM','HUMAN_ALIGNMENT','Human calibration alignment','How well do calibrated dimensions align with held-out human observations?'],
['PCE013-DIM-064','CALIBRATION_PLURALISM','LONG_FORM_STATE_RETENTION','Long-form state retention','Does sequential simulation retain/revise appropriate knowledge, questions, memory and affect across long spans?']
];

const DIMENSIONS = Object.freeze(RAW_DIMENSIONS.map((row, index) => Object.freeze({
  index,
  dimension_id: row[0],
  group: row[1],
  key: row[2],
  name: row[3],
  evaluation_question: row[4],
  measurement_posture: MEASUREMENT_POSTURE,
  anti_gaming_rule: ANTI_GAMING_RULE
})));

const LENSES = Object.freeze([
  'REVEAL_INFORMATION',
  'SITUATION_ORIENTATION',
  'PERSPECTIVE_FOCALIZATION',
  'PURPOSE_NARRATIVE_FUNCTION',
  'EXPECTATION_CURIOSITY_TENSION',
  'ATTENTION_ENGAGEMENT',
  'AFFECT_ABSORPTION',
  'TRUST_EPISTEMIC_ALIGNMENT',
  'EFFORT_CONFUSION_FATIGUE',
  'PACING_MOMENTUM',
  'RESONANCE_MEMORY',
  'CALIBRATION_DISAGREEMENT'
]);

function validateRegistryV1() {
  if (DIMENSIONS.length !== 64) throw new Error('BLOCKED_DIMENSION_REGISTRY_CARDINALITY');
  if (LENSES.length !== 12) throw new Error('BLOCKED_LENS_REGISTRY_CARDINALITY');
  const ids = new Set();
  const keys = new Set();
  const counts = {};
  DIMENSIONS.forEach((d, i) => {
    const expected = `PCE013-DIM-${String(i + 1).padStart(3, '0')}`;
    if (d.dimension_id !== expected) throw new Error(`BLOCKED_DIMENSION_ID_SEQUENCE:${d.dimension_id}`);
    if (ids.has(d.dimension_id)) throw new Error(`BLOCKED_DIMENSION_DUPLICATE:${d.dimension_id}`);
    if (keys.has(d.key)) throw new Error(`BLOCKED_DIMENSION_KEY_DUPLICATE:${d.key}`);
    ids.add(d.dimension_id); keys.add(d.key);
    counts[d.group] = (counts[d.group] || 0) + 1;
    if (d.measurement_posture !== MEASUREMENT_POSTURE || d.anti_gaming_rule !== ANTI_GAMING_RULE) {
      throw new Error(`BLOCKED_DIMENSION_CONTRACT_DRIFT:${d.dimension_id}`);
    }
  });
  for (const [group, expected] of Object.entries(GROUP_COUNTS)) {
    if (counts[group] !== expected) throw new Error(`BLOCKED_DIMENSION_GROUP_COUNT:${group}`);
  }
  if (Object.keys(counts).length !== Object.keys(GROUP_COUNTS).length) throw new Error('BLOCKED_DIMENSION_GROUP_SET');
  if (new Set(LENSES).size !== LENSES.length) throw new Error('BLOCKED_LENS_DUPLICATE');
  return true;
}

function getDimensionV1(dimensionId) {
  const found = DIMENSIONS.find(d => d.dimension_id === dimensionId);
  if (!found) throw new Error(`BLOCKED_DIMENSION_UNKNOWN:${dimensionId}`);
  return found;
}

function assertLensV1(lensId) {
  if (!LENSES.includes(lensId)) throw new Error(`BLOCKED_LENS_UNKNOWN:${lensId}`);
  return lensId;
}

validateRegistryV1();

module.exports = {
  DIMENSION_SCHEMA_VERSION,
  LENS_SCHEMA_VERSION,
  MEASUREMENT_POSTURE,
  ANTI_GAMING_RULE,
  GROUP_COUNTS,
  DIMENSIONS,
  LENSES,
  validateRegistryV1,
  getDimensionV1,
  assertLensV1
};