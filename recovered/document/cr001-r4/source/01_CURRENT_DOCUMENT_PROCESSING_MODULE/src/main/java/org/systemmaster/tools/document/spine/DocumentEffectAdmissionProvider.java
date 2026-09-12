package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.CanonicalDocumentGraphV2;

/** External policy boundary. Implementations return immutable decisions; Documents only verifies and consumes them. */
@FunctionalInterface
public interface DocumentEffectAdmissionProvider {
    DocumentEffectAdmissionDecision decide(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            CanonicalDocumentGraphV2 sourceGraph) throws Exception;

    default String identity() {
        return getClass().getName();
    }
}
