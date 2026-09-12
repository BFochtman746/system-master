package org.systemmaster.platform.windows;

import java.util.Objects;

/** Enforces the product rule: document content inference and processing is local-only. */
public final class LocalOnlyExecutionPolicy {
    public enum Phase {
        DOCUMENT_RUNTIME,
        MODEL_OR_ENGINE_ACQUISITION
    }

    public record Decision(boolean allowed, String reason) {
        public Decision {
            reason = Objects.requireNonNull(reason, "reason").trim();
        }
    }

    public Decision evaluate(
            WindowsLocalEngineDescriptor descriptor,
            WindowsLocalRuntimeProfile profile,
            Phase phase,
            String requiredModelId) {
        Objects.requireNonNull(descriptor, "descriptor");
        Objects.requireNonNull(profile, "profile");
        Objects.requireNonNull(phase, "phase");

        if (phase == Phase.DOCUMENT_RUNTIME) {
            if (!descriptor.inferenceIsLocal()) {
                return new Decision(false, "engine is not declared local");
            }
            if (descriptor.networkRequiredAtInference()) {
                return new Decision(false, "network-dependent inference is prohibited");
            }
            if (!profile.hasEngine(descriptor.engineId())) {
                return new Decision(false, "engine is not available on this machine");
            }
            if (profile.windowsBuild() < descriptor.minimumWindowsBuild()) {
                return new Decision(false, "Windows build is below engine minimum");
            }
            if (descriptor.modelCacheRequired() && requiredModelId != null && !requiredModelId.isBlank()
                    && !profile.hasCachedModel(requiredModelId)) {
                return new Decision(false, "required model is not cached locally");
            }
            return new Decision(true, "local runtime path accepted");
        }

        return new Decision(true, "setup-time acquisition may use network, but document content must never be supplied");
    }
}
