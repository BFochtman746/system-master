package org.systemmaster.core;

import java.util.Objects;

/**
 * One authoritative requirement-to-implementation trace binding for 021F.
 * Every axis required by F-RQ-059 is explicit and non-blank.
 */
public record TraceLink(
        String requirementId,
        String requirementText,
        String designDecision,
        String canonicalOwner,
        String implementingComponent,
        String dataState,
        String commandQueryApi,
        String invariantValidator,
        String failureRecoveryRule,
        String futureTestFamily,
        String implementationWorkPackage) {

    public TraceLink {
        requirementId = require(requirementId, "requirementId");
        if (!requirementId.matches("F-RQ-\\d{3}")) {
            throw new IllegalArgumentException("requirementId must match F-RQ-NNN");
        }
        requirementText = require(requirementText, "requirementText");
        designDecision = require(designDecision, "designDecision");
        canonicalOwner = require(canonicalOwner, "canonicalOwner");
        implementingComponent = require(implementingComponent, "implementingComponent");
        dataState = require(dataState, "dataState");
        commandQueryApi = require(commandQueryApi, "commandQueryApi");
        invariantValidator = require(invariantValidator, "invariantValidator");
        failureRecoveryRule = require(failureRecoveryRule, "failureRecoveryRule");
        futureTestFamily = require(futureTestFamily, "futureTestFamily");
        implementationWorkPackage = require(implementationWorkPackage, "implementationWorkPackage");
    }

    private static String require(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(field + " must not be blank");
        }
        return normalized;
    }
}
