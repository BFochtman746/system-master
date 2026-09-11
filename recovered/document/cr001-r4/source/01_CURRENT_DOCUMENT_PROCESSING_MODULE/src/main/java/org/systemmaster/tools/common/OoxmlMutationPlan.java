package org.systemmaster.tools.common;

import java.util.List;
import java.util.Objects;

/**
 * Digest-bound OOXML specialist mutation plan.
 *
 * <p>This is the portable escape hatch for advanced package semantics that do not yet have a
 * dedicated high-level editor. Plans are optimistic-concurrency controlled by the complete source
 * package digest, operate only on safe OPC part names, validate XML/rels payloads, and are applied
 * atomically to a fresh immutable package.</p>
 */
public record OoxmlMutationPlan(String expectedPackageSha256, List<Mutation> mutations) {
    public enum Operation { ADD, REPLACE, DELETE }

    public record Mutation(Operation operation, String partName, byte[] content, String expectedPartSha256) {
        public Mutation {
            Objects.requireNonNull(operation, "operation");
            Objects.requireNonNull(partName, "partName");
            content = content == null ? null : content.clone();
        }

        @Override public byte[] content() { return content == null ? null : content.clone(); }
    }

    public OoxmlMutationPlan {
        if (expectedPackageSha256 == null || !expectedPackageSha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("expectedPackageSha256");
        }
        mutations = List.copyOf(Objects.requireNonNull(mutations, "mutations"));
        if (mutations.isEmpty()) throw new IllegalArgumentException("mutations empty");
    }
}
