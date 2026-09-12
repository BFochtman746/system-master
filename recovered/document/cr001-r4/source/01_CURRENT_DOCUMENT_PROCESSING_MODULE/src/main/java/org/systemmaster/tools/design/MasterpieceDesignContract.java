package org.systemmaster.tools.design;

import java.util.Map;
import java.util.Objects;

/** Format-neutral quality contract for document pages and presentation slides. */
public record MasterpieceDesignContract(
        String artifactKind,
        String audience,
        String communicationGoal,
        String brandProfileId,
        Map<Dimension, Double> minimumScores,
        double minimumOverallScore,
        boolean requireAccessibilityPass,
        boolean requireRenderProof,
        boolean requireHumanOverrideForUnresolvedCriticalFinding) {

    public enum Dimension {
        NARRATIVE_CLARITY,
        INFORMATION_HIERARCHY,
        TYPOGRAPHY,
        ALIGNMENT_AND_GRID,
        WHITESPACE,
        COLOR_AND_CONTRAST,
        IMAGE_AND_CROP_QUALITY,
        CHART_AND_DIAGRAM_CLARITY,
        DENSITY_AND_LEGIBILITY,
        BRAND_CONSISTENCY,
        CROSS_PAGE_OR_SLIDE_RHYTHM,
        ACCESSIBILITY,
        EVIDENCE_AND_PROVENANCE
    }

    public MasterpieceDesignContract {
        artifactKind = requireText(artifactKind, "artifactKind");
        audience = requireText(audience, "audience");
        communicationGoal = requireText(communicationGoal, "communicationGoal");
        brandProfileId = brandProfileId == null ? "UNSPECIFIED" : requireText(brandProfileId, "brandProfileId");
        minimumScores = Map.copyOf(Objects.requireNonNull(minimumScores, "minimumScores"));
        if (!minimumScores.keySet().containsAll(java.util.Set.of(Dimension.values()))) {
            throw new IllegalArgumentException("minimumScores must define every design dimension");
        }
        for (Map.Entry<Dimension, Double> entry : minimumScores.entrySet()) {
            score(entry.getValue(), "minimum score " + entry.getKey());
        }
        score(minimumOverallScore, "minimumOverallScore");
    }

    public static MasterpieceDesignContract strictPresentation(
            String audience,
            String communicationGoal,
            String brandProfileId) {
        java.util.EnumMap<Dimension, Double> scores = new java.util.EnumMap<>(Dimension.class);
        for (Dimension dimension : Dimension.values()) scores.put(dimension, 0.82);
        scores.put(Dimension.ACCESSIBILITY, 0.90);
        scores.put(Dimension.DENSITY_AND_LEGIBILITY, 0.88);
        scores.put(Dimension.EVIDENCE_AND_PROVENANCE, 0.90);
        return new MasterpieceDesignContract(
                "PRESENTATION",
                audience,
                communicationGoal,
                brandProfileId,
                scores,
                0.86,
                true,
                true,
                true);
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }

    private static void score(double value, String name) {
        if (!Double.isFinite(value) || value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException(name + " must be in [0,1]");
        }
    }
}
