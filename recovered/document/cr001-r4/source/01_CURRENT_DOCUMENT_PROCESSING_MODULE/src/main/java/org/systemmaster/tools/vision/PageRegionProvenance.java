package org.systemmaster.tools.vision;

import java.util.List;
import java.util.Objects;

/** Immutable evidence binding from an accepted/reviewed region back to its exact page crop and observations. */
public record PageRegionProvenance(
        String originalSourceSha256,
        String perceptionRasterSha256,
        int pageIndex,
        String regionId,
        int x,
        int y,
        int width,
        int height,
        String cropSha256,
        String preprocessingVariantId,
        List<String> preprocessingOperations,
        List<String> observingEngineIds,
        List<String> candidateTextSha256s,
        String acceptedTextSha256,
        DecisionAuthority decisionAuthority) {

    public enum DecisionAuthority {
        ENGINE_AGREEMENT,
        LOCAL_VLM_ADJUDICATION,
        HUMAN_REVIEW_REQUIRED,
        HUMAN_CORRECTION
    }

    public PageRegionProvenance {
        originalSourceSha256 = requireText(originalSourceSha256, "originalSourceSha256");
        perceptionRasterSha256 = requireText(perceptionRasterSha256, "perceptionRasterSha256");
        if (pageIndex < 0) throw new IllegalArgumentException("pageIndex must be non-negative");
        regionId = requireText(regionId, "regionId");
        if (x < 0 || y < 0 || width <= 0 || height <= 0) throw new IllegalArgumentException("invalid region bounds");
        cropSha256 = requireText(cropSha256, "cropSha256");
        preprocessingVariantId = requireText(preprocessingVariantId, "preprocessingVariantId");
        preprocessingOperations = List.copyOf(Objects.requireNonNull(preprocessingOperations, "preprocessingOperations"));
        observingEngineIds = List.copyOf(Objects.requireNonNull(observingEngineIds, "observingEngineIds"));
        if (observingEngineIds.isEmpty()) throw new IllegalArgumentException("observingEngineIds must not be empty");
        candidateTextSha256s = List.copyOf(Objects.requireNonNull(candidateTextSha256s, "candidateTextSha256s"));
        if (candidateTextSha256s.isEmpty()) throw new IllegalArgumentException("candidateTextSha256s must not be empty");
        acceptedTextSha256 = acceptedTextSha256 == null ? "" : acceptedTextSha256.trim();
        decisionAuthority = Objects.requireNonNull(decisionAuthority, "decisionAuthority");
        if (decisionAuthority != DecisionAuthority.HUMAN_REVIEW_REQUIRED && acceptedTextSha256.isEmpty()) {
            throw new IllegalArgumentException("accepted text digest is required for a resolved region");
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
