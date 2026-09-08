package org.systemmaster.core;

import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

public final class ConflictDetector {
    public record TargetConflict(String existingChangeId, String requestedChangeId, Set<String> overlappingTargets,
            ConflictDisposition disposition) {
        public TargetConflict { overlappingTargets = Set.copyOf(overlappingTargets); }
    }

    public Optional<TargetConflict> check(String requestedChangeId, Set<String> requestedTargets,
            Map<String, Set<String>> activeTargets, ConflictDisposition policy) {
        for (var e : activeTargets.entrySet()) {
            if (e.getKey().equals(requestedChangeId)) continue;
            Set<String> overlap = new HashSet<>(requestedTargets); overlap.retainAll(e.getValue());
            if (!overlap.isEmpty()) {
                ConflictDisposition d = policy == ConflictDisposition.COMPATIBLE_COMPOSITE
                        ? ConflictDisposition.COMPATIBLE_COMPOSITE : policy;
                if (d == ConflictDisposition.NO_CONFLICT) d = ConflictDisposition.REJECT;
                return Optional.of(new TargetConflict(e.getKey(), requestedChangeId, overlap, d));
            }
        }
        return Optional.empty();
    }
}
