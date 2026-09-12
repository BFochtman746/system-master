package org.systemmaster.tools.document;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * Explicit reverse-projection contract. Implementations must declare exactly which canonical
 * elements and native parts they intend to change and must preserve every unrelated native part.
 */
public interface CanonicalDocumentGraphV2NativeAdapter {
    record MutationRequest(
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            CanonicalDocumentGraphV2 targetGraph,
            Set<String> targetedElementIds,
            Set<String> expectedChangedNativeParts) {
        public MutationRequest {
            sourceBytes = sourceBytes.clone();
            targetedElementIds = Set.copyOf(targetedElementIds);
            expectedChangedNativeParts = Set.copyOf(expectedChangedNativeParts);
        }
    }

    record MutationResult(
            byte[] resultBytes,
            String sourceSha256,
            String resultSha256,
            List<String> changedNativeParts,
            List<String> diagnostics) {
        public MutationResult {
            resultBytes = resultBytes.clone();
            changedNativeParts = List.copyOf(changedNativeParts);
            diagnostics = List.copyOf(diagnostics);
        }
    }

    DocumentFormat format();

    MutationResult apply(MutationRequest request) throws IOException;
}
