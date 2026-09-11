package org.systemmaster.tools.vision;

import java.util.List;
import java.util.Objects;

/** Deterministic local perception plan. It does not claim that an engine actually executed. */
public record DocumentVisionPlan(
        DocumentVisionSourceProfile.Difficulty difficulty,
        List<Stage> stages,
        boolean requireIndependentOcrAgreement,
        boolean requireVisionLanguageAdjudication,
        boolean preserveOriginalRaster,
        String rationale) {

    public record Stage(String action, List<String> preferredEngineIds, boolean mandatory) {
        public Stage {
            action = requireText(action, "action");
            preferredEngineIds = List.copyOf(Objects.requireNonNull(preferredEngineIds, "preferredEngineIds"));
            if (preferredEngineIds.isEmpty()) throw new IllegalArgumentException("preferredEngineIds must not be empty");
        }
    }

    public DocumentVisionPlan {
        difficulty = Objects.requireNonNull(difficulty, "difficulty");
        stages = List.copyOf(Objects.requireNonNull(stages, "stages"));
        if (stages.isEmpty()) throw new IllegalArgumentException("stages must not be empty");
        rationale = requireText(rationale, "rationale");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
