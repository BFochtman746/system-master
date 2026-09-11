package org.systemmaster.tools.document.accessibility;

import java.util.List;
import java.util.Objects;

/** Deterministic remediation boundary: only explicit, semantically unambiguous repairs may auto-apply. */
public record AccessibilityRemediationPlan(List<Action> actions) {
    public enum Disposition { AUTO_SAFE_WITH_EXPLICIT_VALUE, REVIEW_REQUIRED, VALIDATOR_REQUIRED, NOT_APPLICABLE }

    public record Action(
            String ruleCode,
            String capabilityId,
            Disposition disposition,
            String targetElementId,
            String parameterName,
            String reason) {
        public Action {
            ruleCode = text(ruleCode, "ruleCode");
            capabilityId = text(capabilityId, "capabilityId");
            Objects.requireNonNull(disposition, "disposition");
            targetElementId = Objects.requireNonNullElse(targetElementId, "");
            parameterName = Objects.requireNonNullElse(parameterName, "");
            reason = text(reason, "reason");
        }
    }

    public AccessibilityRemediationPlan {
        actions = List.copyOf(Objects.requireNonNullElse(actions, List.of()));
    }

    private static String text(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " required");
        }
        return value;
    }
}
