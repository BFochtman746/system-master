package org.systemmaster.tools.vision;

/** Measured source signals used only for routing. Scores are normalized to [0,1]. */
public record DocumentVisionSourceProfile(
        double nativeTextCoverage,
        double rasterCoverage,
        int estimatedDpi,
        double skewDegrees,
        double contrastScore,
        double noiseScore,
        double bleedThroughScore,
        double perspectiveDistortionScore,
        boolean suspectExistingOcr,
        boolean multiColumn,
        boolean hasTables,
        boolean hasFormulas,
        boolean hasCharts,
        boolean hasHandwriting,
        boolean hasStampsOrSeals) {

    public enum Difficulty {
        NATIVE_DIGITAL,
        CLEAN_SCAN,
        DEGRADED_SCAN,
        COMPLEX_LAYOUT,
        HANDWRITING_OR_NONSTANDARD_MARKS,
        MIXED
    }

    public DocumentVisionSourceProfile {
        range(nativeTextCoverage, "nativeTextCoverage");
        range(rasterCoverage, "rasterCoverage");
        if (estimatedDpi < 0) throw new IllegalArgumentException("estimatedDpi must be non-negative");
        if (!Double.isFinite(skewDegrees)) throw new IllegalArgumentException("skewDegrees must be finite");
        range(contrastScore, "contrastScore");
        range(noiseScore, "noiseScore");
        range(bleedThroughScore, "bleedThroughScore");
        range(perspectiveDistortionScore, "perspectiveDistortionScore");
    }

    public Difficulty difficulty() {
        boolean layoutComplex = multiColumn || hasTables || hasFormulas || hasCharts;
        boolean degraded = estimatedDpi > 0 && estimatedDpi < 220
                || Math.abs(skewDegrees) >= 1.25
                || contrastScore < 0.45
                || noiseScore >= 0.30
                || bleedThroughScore >= 0.20
                || perspectiveDistortionScore >= 0.15;
        boolean nativeDominant = nativeTextCoverage >= 0.85 && rasterCoverage <= 0.25 && !suspectExistingOcr;

        if (nativeDominant && !layoutComplex && !hasHandwriting && !hasStampsOrSeals) return Difficulty.NATIVE_DIGITAL;
        if (hasHandwriting || hasStampsOrSeals) return Difficulty.HANDWRITING_OR_NONSTANDARD_MARKS;
        if (layoutComplex && degraded) return Difficulty.MIXED;
        if (layoutComplex) return Difficulty.COMPLEX_LAYOUT;
        if (degraded) return Difficulty.DEGRADED_SCAN;
        return Difficulty.CLEAN_SCAN;
    }

    private static void range(double value, String name) {
        if (!Double.isFinite(value) || value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException(name + " must be in [0,1]");
        }
    }
}
