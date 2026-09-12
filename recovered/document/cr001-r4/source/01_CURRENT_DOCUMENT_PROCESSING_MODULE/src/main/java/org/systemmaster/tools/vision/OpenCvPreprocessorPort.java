package org.systemmaster.tools.vision;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Replaceable local image-restoration port. Results are derivatives; the original raster remains authoritative. */
public interface OpenCvPreprocessorPort {
    enum Profile {
        CLEAN_SCAN,
        DEGRADED_SCAN,
        FAX_RESTORE,
        COMPLEX_LAYOUT
    }

    record Identity(String engineId, String version, boolean healthy, boolean networkRequired) {
        public Identity {
            engineId = requireText(engineId, "engineId");
            version = requireText(version, "version");
        }
    }

    record Variant(
            String variantId,
            byte[] pngBytes,
            String sha256,
            int width,
            int height,
            List<String> operations,
            Map<String, Double> metrics) {
        public Variant {
            variantId = requireText(variantId, "variantId");
            pngBytes = Objects.requireNonNull(pngBytes, "pngBytes").clone();
            sha256 = requireText(sha256, "sha256");
            if (width <= 0 || height <= 0) throw new IllegalArgumentException("variant dimensions must be positive");
            operations = List.copyOf(Objects.requireNonNull(operations, "operations"));
            metrics = Map.copyOf(Objects.requireNonNull(metrics, "metrics"));
        }

        @Override
        public byte[] pngBytes() {
            return pngBytes.clone();
        }
    }

    record Result(
            String sourceSha256,
            Profile profile,
            List<Variant> variants,
            Map<String, Double> metrics,
            List<String> diagnostics) {
        public Result {
            sourceSha256 = requireText(sourceSha256, "sourceSha256");
            profile = Objects.requireNonNull(profile, "profile");
            variants = List.copyOf(Objects.requireNonNull(variants, "variants"));
            if (variants.isEmpty()) throw new IllegalArgumentException("variants must not be empty");
            metrics = Map.copyOf(Objects.requireNonNull(metrics, "metrics"));
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
        }

        public Variant requireVariant(String variantId) {
            return variants.stream().filter(v -> v.variantId().equals(variantId)).findFirst()
                    .orElseThrow(() -> new IllegalStateException("preprocess variant missing: " + variantId));
        }
    }

    Identity identity();

    Result preprocess(byte[] sourceImage, Profile profile) throws Exception;

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
