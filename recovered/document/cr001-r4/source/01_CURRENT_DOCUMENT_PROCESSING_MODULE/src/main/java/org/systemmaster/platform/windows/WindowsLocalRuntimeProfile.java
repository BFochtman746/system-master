package org.systemmaster.platform.windows;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Runtime facts obtained from a Windows capability probe. No inference is hidden in this record. */
public record WindowsLocalRuntimeProfile(
        int windowsBuild,
        String architecture,
        long physicalMemoryBytes,
        boolean directX12Capable,
        boolean npuPresent,
        boolean copilotPlusClass,
        Set<String> availableEngineIds,
        Set<String> cachedModelIds,
        Map<String, String> facts) {

    public WindowsLocalRuntimeProfile {
        if (windowsBuild < 0) {
            throw new IllegalArgumentException("windowsBuild must be non-negative");
        }
        architecture = Objects.requireNonNull(architecture, "architecture").trim();
        if (architecture.isEmpty()) {
            throw new IllegalArgumentException("architecture must not be blank");
        }
        if (physicalMemoryBytes < 0) {
            throw new IllegalArgumentException("physicalMemoryBytes must be non-negative");
        }
        availableEngineIds = Set.copyOf(Objects.requireNonNull(availableEngineIds, "availableEngineIds"));
        cachedModelIds = Set.copyOf(Objects.requireNonNull(cachedModelIds, "cachedModelIds"));
        facts = Map.copyOf(Objects.requireNonNull(facts, "facts"));
    }

    public boolean hasEngine(String engineId) {
        return availableEngineIds.contains(Objects.requireNonNull(engineId, "engineId"));
    }

    public boolean hasCachedModel(String modelId) {
        return cachedModelIds.contains(Objects.requireNonNull(modelId, "modelId"));
    }
}
