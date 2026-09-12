package org.systemmaster.tools.review;

import org.systemmaster.tools.document.DocumentFormat;

import java.util.List;
import java.util.Objects;

/** Evidence describing how a format-neutral review event was represented in a native or sidecar format. */
public record NativeReviewMappingReceipt(
        DocumentFormat format,
        String mappingMode,
        String sourceSha256,
        String resultSha256,
        List<String> changedParts,
        List<String> diagnostics) {
    public NativeReviewMappingReceipt {
        Objects.requireNonNull(format, "format");
        if (mappingMode == null || mappingMode.isBlank()) throw new IllegalArgumentException("mapping mode required");
        requireSha(sourceSha256, "source"); requireSha(resultSha256, "result");
        changedParts = List.copyOf(Objects.requireNonNullElse(changedParts, List.of()));
        diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
    }
    private static void requireSha(String value, String name) { if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required"); }
}
