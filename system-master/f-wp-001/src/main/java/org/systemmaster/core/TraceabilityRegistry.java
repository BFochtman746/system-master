package org.systemmaster.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

/**
 * F-WP-001 implementation of F-RQ-059.
 *
 * The registry is authoritative only for trace metadata. It does not claim that a
 * referenced implementation work package is implemented or qualified.
 */
public final class TraceabilityRegistry {
    public enum Axis {
        DESIGN_DECISION,
        CANONICAL_OWNER,
        IMPLEMENTING_COMPONENT,
        DATA_STATE,
        COMMAND_QUERY_API,
        INVARIANT_VALIDATOR,
        FAILURE_RECOVERY_RULE,
        FUTURE_TEST_FAMILY,
        IMPLEMENTATION_WORK_PACKAGE
    }

    public record ValidationResult(
            boolean complete,
            List<String> missingRequirementIds,
            List<String> unexpectedRequirementIds,
            List<String> integrityIssues) {
        public ValidationResult {
            missingRequirementIds = List.copyOf(missingRequirementIds);
            unexpectedRequirementIds = List.copyOf(unexpectedRequirementIds);
            integrityIssues = List.copyOf(integrityIssues);
        }
    }

    private final Map<String, TraceLink> byRequirement = new LinkedHashMap<>();
    private final EnumMap<Axis, Map<String, LinkedHashSet<String>>> reverse = new EnumMap<>(Axis.class);

    public TraceabilityRegistry() {
        for (Axis axis : Axis.values()) {
            reverse.put(axis, new LinkedHashMap<>());
        }
    }

    public synchronized void register(TraceLink link) {
        Objects.requireNonNull(link, "link");
        TraceLink prior = byRequirement.get(link.requirementId());
        if (prior != null) {
            if (!prior.equals(link)) {
                throw new IllegalStateException("TRACE_IDENTITY_COLLISION:" + link.requirementId());
            }
            return;
        }
        byRequirement.put(link.requirementId(), link);
        index(Axis.DESIGN_DECISION, link.designDecision(), link.requirementId());
        index(Axis.CANONICAL_OWNER, link.canonicalOwner(), link.requirementId());
        index(Axis.IMPLEMENTING_COMPONENT, link.implementingComponent(), link.requirementId());
        index(Axis.DATA_STATE, link.dataState(), link.requirementId());
        index(Axis.COMMAND_QUERY_API, link.commandQueryApi(), link.requirementId());
        index(Axis.INVARIANT_VALIDATOR, link.invariantValidator(), link.requirementId());
        index(Axis.FAILURE_RECOVERY_RULE, link.failureRecoveryRule(), link.requirementId());
        index(Axis.FUTURE_TEST_FAMILY, link.futureTestFamily(), link.requirementId());
        index(Axis.IMPLEMENTATION_WORK_PACKAGE, link.implementationWorkPackage(), link.requirementId());
    }

    public synchronized Optional<TraceLink> requirement(String requirementId) {
        return Optional.ofNullable(byRequirement.get(requirementId));
    }

    public synchronized Set<String> requirementsFor(Axis axis, String value) {
        Objects.requireNonNull(axis, "axis");
        Objects.requireNonNull(value, "value");
        Set<String> ids = reverse.get(axis).get(value.trim());
        return ids == null ? Set.of() : Collections.unmodifiableSet(new LinkedHashSet<>(ids));
    }

    public synchronized int size() {
        return byRequirement.size();
    }

    public synchronized List<TraceLink> all() {
        return List.copyOf(byRequirement.values());
    }

    public synchronized ValidationResult validateBidirectional(Set<String> requiredRequirementIds) {
        Objects.requireNonNull(requiredRequirementIds, "requiredRequirementIds");
        TreeSet<String> required = new TreeSet<>(requiredRequirementIds);
        TreeSet<String> actual = new TreeSet<>(byRequirement.keySet());
        TreeSet<String> missing = new TreeSet<>(required);
        missing.removeAll(actual);
        TreeSet<String> unexpected = new TreeSet<>(actual);
        unexpected.removeAll(required);

        List<String> issues = new ArrayList<>();
        for (TraceLink link : byRequirement.values()) {
            checkBacklink(issues, Axis.DESIGN_DECISION, link.designDecision(), link.requirementId());
            checkBacklink(issues, Axis.CANONICAL_OWNER, link.canonicalOwner(), link.requirementId());
            checkBacklink(issues, Axis.IMPLEMENTING_COMPONENT, link.implementingComponent(), link.requirementId());
            checkBacklink(issues, Axis.DATA_STATE, link.dataState(), link.requirementId());
            checkBacklink(issues, Axis.COMMAND_QUERY_API, link.commandQueryApi(), link.requirementId());
            checkBacklink(issues, Axis.INVARIANT_VALIDATOR, link.invariantValidator(), link.requirementId());
            checkBacklink(issues, Axis.FAILURE_RECOVERY_RULE, link.failureRecoveryRule(), link.requirementId());
            checkBacklink(issues, Axis.FUTURE_TEST_FAMILY, link.futureTestFamily(), link.requirementId());
            checkBacklink(issues, Axis.IMPLEMENTATION_WORK_PACKAGE, link.implementationWorkPackage(), link.requirementId());
        }
        boolean complete = missing.isEmpty() && unexpected.isEmpty() && issues.isEmpty();
        return new ValidationResult(complete, new ArrayList<>(missing), new ArrayList<>(unexpected), issues);
    }

    private void index(Axis axis, String value, String requirementId) {
        reverse.get(axis).computeIfAbsent(value, ignored -> new LinkedHashSet<>()).add(requirementId);
    }

    private void checkBacklink(List<String> issues, Axis axis, String value, String requirementId) {
        Set<String> ids = reverse.get(axis).get(value);
        if (ids == null || !ids.contains(requirementId)) {
            issues.add("MISSING_BACKLINK:" + axis + ":" + requirementId);
        }
    }
}
