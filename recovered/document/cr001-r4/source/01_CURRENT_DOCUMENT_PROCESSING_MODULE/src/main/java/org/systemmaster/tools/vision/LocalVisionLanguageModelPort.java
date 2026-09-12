package org.systemmaster.tools.vision;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Replaceable local-only VLM adapter. It may adjudicate observations but cannot silently become canonical truth. */
public interface LocalVisionLanguageModelPort {
    record Identity(
            String modelId,
            String runtimeId,
            String version,
            Set<String> capabilities,
            boolean healthy,
            boolean modelCached,
            boolean networkRequiredAtInference) {
        public Identity {
            modelId = requireText(modelId, "modelId");
            runtimeId = requireText(runtimeId, "runtimeId");
            version = requireText(version, "version");
            capabilities = Set.copyOf(Objects.requireNonNull(capabilities, "capabilities"));
        }
    }

    record Candidate(String text, String sourceEngineId, double confidence, Map<String, String> evidence) {
        public Candidate {
            text = Objects.requireNonNull(text, "text");
            sourceEngineId = requireText(sourceEngineId, "sourceEngineId");
            if (!Double.isFinite(confidence) || confidence < -1.0 || confidence > 1.0) {
                throw new IllegalArgumentException("confidence must be in [-1,1]");
            }
            evidence = Map.copyOf(Objects.requireNonNull(evidence, "evidence"));
        }
    }

    record Decision(
            String selectedText,
            double confidence,
            boolean abstained,
            List<String> supportingEngineIds,
            List<String> diagnostics) {
        public Decision {
            selectedText = Objects.requireNonNull(selectedText, "selectedText");
            if (!Double.isFinite(confidence) || confidence < 0.0 || confidence > 1.0) {
                throw new IllegalArgumentException("confidence must be in [0,1]");
            }
            supportingEngineIds = List.copyOf(Objects.requireNonNull(supportingEngineIds, "supportingEngineIds"));
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
        }
    }

    Identity identity();

    Decision adjudicate(byte[] pageImage, List<Candidate> candidates, Map<String, String> context) throws Exception;

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
