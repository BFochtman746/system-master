package org.systemmaster.tools.document;

import java.io.IOException;
import java.util.Set;

/**
 * Stricter CDG-2 reverse-adapter contract for operation-bound execution.
 * Unlike a precomputed target-graph adapter, this receives the immutable DOC-OP contract directly,
 * allowing the governed coordinator to perform mutation before independently re-projecting the result.
 */
public interface CanonicalDocumentGraphV2OperationAdapter extends CanonicalDocumentGraphV2NativeAdapter {
    record OperationMutationRequest(
            byte[] sourceBytes,
            CanonicalDocumentGraphV2 sourceGraph,
            DocumentOperationContract operation,
            Set<String> targetedElementIds,
            Set<String> expectedChangedNativeParts) {
        public OperationMutationRequest {
            sourceBytes = sourceBytes.clone();
            targetedElementIds = Set.copyOf(targetedElementIds);
            expectedChangedNativeParts = Set.copyOf(expectedChangedNativeParts);
        }

        @Override
        public byte[] sourceBytes() {
            return sourceBytes.clone();
        }
    }

    MutationResult applyOperation(OperationMutationRequest request) throws IOException;

    @Override
    default MutationResult apply(MutationRequest request) throws IOException {
        throw new UnsupportedOperationException("operation-bound adapter requires applyOperation");
    }
}
