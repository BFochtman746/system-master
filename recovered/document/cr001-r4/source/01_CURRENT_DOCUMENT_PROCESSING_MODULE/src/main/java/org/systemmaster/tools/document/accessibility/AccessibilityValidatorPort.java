package org.systemmaster.tools.document.accessibility;

import org.systemmaster.tools.document.DocumentFormat;

import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Port for a named qualified accessibility/profile validator. No conformance claim exists without its receipt. */
public interface AccessibilityValidatorPort {
    enum Status { PASS, FAIL, UNAVAILABLE }

    record Request(
            AccessibilityComplianceProfile profile,
            DocumentFormat format,
            byte[] artifactBytes) {
        public Request {
            Objects.requireNonNull(profile, "profile");
            Objects.requireNonNull(format, "format");
            artifactBytes = Objects.requireNonNull(artifactBytes, "artifactBytes").clone();
        }

        @Override
        public byte[] artifactBytes() {
            return artifactBytes.clone();
        }
    }

    record Receipt(
            Status status,
            String validatorId,
            String validatorVersion,
            String profileClaim,
            List<String> evidence,
            Map<String, String> measurements) {
        public Receipt {
            Objects.requireNonNull(status, "status");
            if (validatorId == null || validatorId.isBlank()) {
                throw new IllegalArgumentException("validatorId required");
            }
            validatorVersion = Objects.requireNonNullElse(validatorVersion, "unknown");
            profileClaim = Objects.requireNonNullElse(profileClaim, "");
            evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
            measurements = Map.copyOf(Objects.requireNonNullElse(measurements, Map.of()));
        }
    }

    String identity();

    Receipt validate(Request request) throws Exception;
}
