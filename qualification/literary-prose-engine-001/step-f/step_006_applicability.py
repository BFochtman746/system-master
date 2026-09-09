from unified_granular_diagnostics import PRIMARY

ALL_OWNERS = sorted(set(PRIMARY.values()))


def plan_applicability(features, context):
    """Return sparse specialist/dimension applicability from non-textual passage features.

    This does not judge literary quality. It only decides which authorities and which
    dimensions have enough local reason/context to inspect a passage. Absence from the
    plan means NOT_APPLICABLE, not PASS.
    """
    owners = {}

    def add(owner, dims, reason):
        valid = [d for d in dims if PRIMARY.get(d) == owner]
        if valid:
            owners[owner] = {"dimensions": sorted(set(valid)), "reason": reason}

    def selected(key, default):
        dims = features.get(key)
        return default if dims is None else dims

    if features.get("character_state_material"):
        dims = selected("character_dimensions", ["ACTIVE_GOAL","MOTIVE_VALUE_PRESSURE","BELIEF_STATE","KNOWLEDGE_STATE",
                "INTENTION_COMMITMENT","DECISION_ALTERNATIVES","ACTION_INTENTIONALITY",
                "CONSEQUENCE_RECOGNITION","AGENCY_COERCION","INTERNAL_CONFLICT",
                "RELATIONSHIP_STATE","BEHAVIOR_FIT","ARC_PROGRESSION","INTENTIONAL_CONTRADICTION",
                "CHARACTER_PERCEPTION","VALUE_ACTION_CONSISTENCY"])
        add("CHARACTER_STATE_ARC_v2", dims, "selected character state/choice/arc dimensions are materially present")

    if features.get("dialogue_material"):
        dims = selected("dialogue_dimensions", ["DIALOGUE_FUNCTION","SPEAKER_OBJECTIVE","SPEECH_ACT","IMPLICATURE","SUBTEXT",
                "INFORMATION_ASYMMETRY","POWER_STATUS","FACE_POLITENESS","PERSUASION_MANIPULATION",
                "EVASION","TURN_TAKING","INTERRUPTION","SILENCE_AS_ACTION","DISCLOSURE_TIMING",
                "CHARACTER_DICTION_SYNTAX","DIALOGUE_RHYTHM","EXPOSITION_LEAKAGE","ACTION_CONSEQUENCE",
                "RELATIONSHIP_MODULATION","VOICE_CONVERGENCE"])
        add("DIALOGUE_PRAGMATICS_CHARACTER_v2", dims, "selected dialogue/pragmatic dimensions are materially present")

    if features.get("originality_question"):
        dims = selected("originality_dimensions", ["CONCEPT_DISTINCTIVENESS","SCENE_SOLUTION_DISTINCTIVENESS","EVENT_TURN_PREDICTABILITY",
                "CHARACTER_CHOICE_PREDICTABILITY","IMAGE_METAPHOR_FRESHNESS","ASSOCIATION_DISTANCE_COHERENCE",
                "LINGUISTIC_DISTINCTIVENESS","FORMAL_DISTINCTIVENESS","TROPE_TRANSFORMATION","GROUNDED_SURPRISE",
                "CREATIVE_RISK_FIT","SELF_FORMULA_REUSE","MODEL_DEFAULT_CONVERGENCE",
                "NOVELTY_EFFECTIVENESS_BALANCE","AUTHOR_PROJECT_ATTRIBUTABLE_DISTINCTIVENESS"])
        add("ORIGINALITY_DISTINCTIVENESS_v1", dims, "selected distinctiveness/predictability dimensions are material")

    if features.get("theme_motif_material"):
        dims = selected("theme_dimensions", ["THEME_HYPOTHESIS","THEMATIC_EVIDENCE","ACTION_EMBODIMENT","SUBTEXT_INFERENCE_CHAIN",
                "EXPLICIT_IMPLICIT_BALANCE","THEMATIC_ACCUMULATION","MOTIF_THEME_CONTRIBUTION",
                "SYMBOLIC_RECURRENCE_TRANSFORMATION","IRONY","COUNTERTHEME","PRODUCTIVE_CONTRADICTION",
                "CHARACTER_THEME_EMBODIMENT","THEMATIC_OVERSTATEMENT","THEMATIC_UNDERDEVELOPMENT",
                "SCENE_THEME_FUNCTION","ENDING_THEME_RESONANCE","INTERPRETIVE_PLURALITY","DOMAIN_TRUTH_SEPARATION"])
        add("THEME_SUBTEXT_MOTIF_v1", dims, "selected theme/subtext/motif dimensions are materially present")

    if features.get("pacing_material"):
        dims = selected("pacing_dimensions", ["STORY_DISCOURSE_TIME","TEMPORAL_ORDER","SCENE_DURATION","SUMMARY_DURATION","PAUSE_DURATION",
                "ELLIPSIS_DURATION","EVENT_FREQUENCY","DWELL_ALLOCATION","EVENT_DENSITY","INFORMATION_DENSITY",
                "EMOTIONAL_DENSITY","ACCELERATION_DECELERATION","RECOVERY_SPACING","REFLECTION_ACTION_ALTERNATION",
                "SECTION_PROPORTIONALITY","INFORMATION_LATENCY","SETUP_PAYOFF_DISTANCE","THREAD_CLOSURE_LOAD",
                "SUSPENSE_CURIOSITY_SURPRISE_RELATION","FATIGUE_RECOVERY_EVIDENCE","MOMENTUM_EVIDENCE",
                "INTENTIONAL_SLOWNESS","COMPRESSION_LOSS_RISK","EXPANSION_PADDING_RISK","LOCAL_GLOBAL_PACING_REGRESSION"])
        add("PACING_NARRATIVE_TIME_v2", dims, "selected narrative-time/pacing dimensions are materially in question")

    prose_dims = features.get("prose_dimensions")
    if prose_dims is None:
        prose_dims = []
        if features.get("rhythm_material"):
            prose_dims += ["CADENCE_INTENT","LENGTH_CONTOUR","CLAUSE_MOTION","PAUSE_CONTROL","EMPHASIS_PLACEMENT",
                           "PARAGRAPH_MOTION","SEQUENCE_VARIATION","FRAGMENT_CONTROL","REPETITION_RHYTHM",
                           "DIALOGUE_NARRATION_HANDOFF","TRANSITION_CADENCE","SOUND_ECHO","READ_ALOUD_FIT","CADENCE_DISTINCTIVENESS"]
        if features.get("imagery_material"):
            prose_dims += ["FUNCTION","PRECISION","SENSORY_FIT","VIEWPOINT_FIT","METAPHOR_COHERENCE",
                           "FIGURATIVE_NECESSITY","IMAGE_FAMILY","FRESHNESS","CLICHE_CONTEXT","LOAD","UNDERIMAGING","OVERWRITING"]
        if features.get("specificity_material"):
            prose_dims += ["SELECTIVE_DETAIL","CONCRETE_ANCHOR","EXACT_NOUN_VERB","ABSTRACTION_LADDER","ORIENTATION",
                           "RELEVANCE","FALSE_PRECISION","EPISTEMIC_MATCH","JARGON_PRECISION","EXEMPLIFICATION",
                           "CHARACTER_SPECIFICITY","MEMORABLE_SELECTIVITY"]
        if features.get("language_craft_material"):
            prose_dims += ["DICTION_FIT","LEXICAL_PRECISION","REGISTER_CONTROL","SYNTAX_CONTROL","INFORMATION_ORDER",
                           "END_WEIGHT","PARALLELISM","RHETORICAL_REPETITION","MODIFIER_CONTROL","NOMINALIZATION_CONTROL",
                           "ACTIVE_PASSIVE_CONTROL","CONNECTIVE_CONTROL","AMBIGUITY_CONTROL","IDIOM_DIALECT","COMPRESSION",
                           "EXPANSION","NATURALNESS","DISTINCTIVENESS"]
    add("PACKET_012_PROSE_CRAFT", prose_dims, "selected prose-craft dimensions are materially implicated")

    if features.get("reader_simulation_requested") and context.get("reader_profile") and context.get("reveal_frontier"):
        reader_dims = features.get("reader_dimensions") or []
        add("PACKET_013_READER_EXPERIENCE", reader_dims, "bounded reader simulation requested with reveal frontier")

    active_dims = sum(len(v["dimensions"]) for v in owners.values())
    return {
        "owners": owners,
        "active_owner_count": len(owners),
        "active_dimension_count": active_dims,
        "total_dimension_count": len(PRIMARY),
        "dimension_activation_rate": round(active_dims / len(PRIMARY), 4),
        "inactive_owner_count": len(ALL_OWNERS) - len(owners),
    }
