package org.systemmaster.tools.vision;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Exact engine/version calibration authority. Unknown versions remain uncalibrated rather than inheriting stale confidence. */
public final class ConfidenceCalibrationRegistry {
    public record Result(boolean calibrated, double probability, String corpusDigest) {
        public Result {
            if (calibrated && (!Double.isFinite(probability) || probability < 0.0 || probability > 1.0)) {
                throw new IllegalArgumentException("calibrated probability must be in [0,1]");
            }
            if (!calibrated && probability != -1.0) {
                throw new IllegalArgumentException("uncalibrated probability must be -1");
            }
            corpusDigest = corpusDigest == null ? "" : corpusDigest;
        }
    }

    private final Map<String, ConfidenceCalibrationProfile> profiles = new LinkedHashMap<>();

    public void register(ConfidenceCalibrationProfile profile) {
        Objects.requireNonNull(profile, "profile");
        profiles.put(key(profile.engineId(), profile.engineVersion()), profile);
    }

    public Optional<ConfidenceCalibrationProfile> profile(String engineId, String engineVersion) {
        return Optional.ofNullable(profiles.get(key(engineId, engineVersion)));
    }

    public Result apply(String engineId, String engineVersion, double rawConfidence) {
        if (!Double.isFinite(rawConfidence) || rawConfidence < 0.0 || rawConfidence > 1.0) {
            return new Result(false, -1.0, "");
        }
        ConfidenceCalibrationProfile profile = profiles.get(key(engineId, engineVersion));
        if (profile == null) return new Result(false, -1.0, "");
        return new Result(true, profile.calibrate(rawConfidence), profile.corpusDigest());
    }

    public int size() {
        return profiles.size();
    }

    private static String key(String engineId, String engineVersion) {
        Objects.requireNonNull(engineId, "engineId");
        Objects.requireNonNull(engineVersion, "engineVersion");
        return engineId + "\u0000" + engineVersion;
    }
}
