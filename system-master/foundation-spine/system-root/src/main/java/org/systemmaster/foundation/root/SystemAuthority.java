package org.systemmaster.foundation.root;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** Domain types owned by the System Root & Authority Registry. */
public final class SystemAuthority {
    private SystemAuthority() {}

    public enum AuthorityKind {
        FOUNDATION_CONTROL,
        FOUNDATION_SHARED,
        FEDERATED_OVERLAY,
        SPECIALIST_BOUNDARY
    }

    public enum Lifecycle {
        DECLARED,
        ADMITTED,
        DRAINING,
        RETIRED
    }

    public enum EdgeKind {
        REQUIRED_DEPENDENCY,
        OPTIONAL_DEPENDENCY,
        FEDERATED_OVERLAY,
        SPECIALIST_BOUNDARY
    }

    public record VersionPointer(
            String implementationVersion,
            String artifactDigest,
            String sourceRevision,
            String contractSetDigest) {
        public VersionPointer {
            implementationVersion = text(implementationVersion, "implementationVersion");
            artifactDigest = sha256(artifactDigest, "artifactDigest");
            sourceRevision = text(sourceRevision, "sourceRevision");
            contractSetDigest = sha256(contractSetDigest, "contractSetDigest");
        }

        public String canonical() {
            return canonicalTuple("VERSION_POINTER", implementationVersion, artifactDigest, sourceRevision, contractSetDigest);
        }
    }

    /**
     * References to decisions owned by other authorities. The Root records the basis but does not
     * become the truth owner for authorization, qualification, or release standing.
     */
    public record AdmissionBasis(
            String authorizationRef,
            String qualificationRef,
            String releaseRef) {
        public AdmissionBasis {
            authorizationRef = text(authorizationRef, "authorizationRef");
            qualificationRef = text(qualificationRef, "qualificationRef");
            releaseRef = text(releaseRef, "releaseRef");
        }

        public String canonical() {
            return canonicalTuple("ADMISSION_BASIS", authorizationRef, qualificationRef, releaseRef);
        }
    }

    public record Descriptor(
            String systemId,
            String displayName,
            String canonicalQuestion,
            AuthorityKind kind,
            Set<String> ownedTruthKeys,
            Set<String> negativeOwnership) {
        public Descriptor {
            systemId = SystemAuthority.systemId(systemId);
            displayName = text(displayName, "displayName");
            canonicalQuestion = text(canonicalQuestion, "canonicalQuestion");
            Objects.requireNonNull(kind, "kind");
            ownedTruthKeys = canonicalTruthKeys(ownedTruthKeys);
            if (ownedTruthKeys.isEmpty()) {
                throw new IllegalArgumentException("ownedTruthKeys must not be empty");
            }
            negativeOwnership = canonicalTextSet(negativeOwnership, "negativeOwnership");
            if (negativeOwnership.isEmpty()) {
                throw new IllegalArgumentException("negativeOwnership must not be empty");
            }
        }

        public String canonical() {
            return canonicalTuple("DESCRIPTOR", systemId, displayName, canonicalQuestion, kind.name(),
                    canonicalSet(ownedTruthKeys), canonicalSet(negativeOwnership));
        }
    }

    public record Record(
            Descriptor descriptor,
            Lifecycle lifecycle,
            long generation,
            VersionPointer currentVersion,
            AdmissionBasis admissionBasis,
            Instant declaredAt,
            Instant updatedAt,
            String replacementSystemId) {
        public Record {
            Objects.requireNonNull(descriptor, "descriptor");
            Objects.requireNonNull(lifecycle, "lifecycle");
            if (generation < 1) throw new IllegalArgumentException("generation must be >= 1");
            Objects.requireNonNull(declaredAt, "declaredAt");
            Objects.requireNonNull(updatedAt, "updatedAt");
            if (updatedAt.isBefore(declaredAt)) throw new IllegalArgumentException("updatedAt before declaredAt");
            if (replacementSystemId != null) replacementSystemId = systemId(replacementSystemId);
            if ((lifecycle == Lifecycle.ADMITTED || lifecycle == Lifecycle.DRAINING)
                    && (currentVersion == null || admissionBasis == null)) {
                throw new IllegalArgumentException("admitted/draining authority requires version and admission basis");
            }
            if (lifecycle == Lifecycle.DECLARED && admissionBasis != null) {
                throw new IllegalArgumentException("declared authority cannot carry admission basis");
            }
            if (lifecycle != Lifecycle.RETIRED && replacementSystemId != null) {
                throw new IllegalArgumentException("replacementSystemId is valid only for retired authorities");
            }
        }
    }

    public record TopologyEdge(
            String fromSystemId,
            String toSystemId,
            EdgeKind kind,
            String purpose) implements Comparable<TopologyEdge> {
        public TopologyEdge {
            fromSystemId = systemId(fromSystemId);
            toSystemId = systemId(toSystemId);
            Objects.requireNonNull(kind, "kind");
            purpose = text(purpose, "purpose");
            if (fromSystemId.equals(toSystemId)) throw new IllegalArgumentException("self topology edge");
        }

        public String canonical() {
            return canonicalTuple("TOPOLOGY_EDGE", fromSystemId, toSystemId, kind.name(), purpose);
        }

        @Override
        public int compareTo(TopologyEdge other) {
            return Comparator.comparing(TopologyEdge::fromSystemId)
                    .thenComparing(TopologyEdge::toSystemId)
                    .thenComparing(edge -> edge.kind().name())
                    .thenComparing(TopologyEdge::purpose)
                    .compare(this, other);
        }
    }

    public record OperationReceipt(
            String operationId,
            String requestDigest,
            long resultingStoreRevision,
            long eventSequence,
            String resultRef) {
        public OperationReceipt {
            operationId = SystemAuthority.operationId(operationId);
            requestDigest = sha256(requestDigest, "requestDigest");
            if (resultingStoreRevision < 1) throw new IllegalArgumentException("resultingStoreRevision");
            if (eventSequence < 1) throw new IllegalArgumentException("eventSequence");
            resultRef = text(resultRef, "resultRef");
        }
    }

    public record Event(
            long sequence,
            String eventId,
            String operationId,
            String systemId,
            String eventType,
            String actorRef,
            String decisionRef,
            Instant occurredAt,
            String payloadDigest) {
        public Event {
            if (sequence < 1) throw new IllegalArgumentException("sequence");
            eventId = text(eventId, "eventId");
            operationId = SystemAuthority.operationId(operationId);
            if (systemId != null) systemId = SystemAuthority.systemId(systemId);
            eventType = text(eventType, "eventType");
            actorRef = text(actorRef, "actorRef");
            decisionRef = text(decisionRef, "decisionRef");
            Objects.requireNonNull(occurredAt, "occurredAt");
            payloadDigest = sha256(payloadDigest, "payloadDigest");
        }
    }

    static String systemId(String value) {
        String normalized = text(value, "systemId");
        if (!normalized.matches("[a-z][a-z0-9-]{1,63}")) {
            throw new IllegalArgumentException("invalid systemId: " + normalized);
        }
        return normalized;
    }

    static String operationId(String value) {
        String normalized = text(value, "operationId");
        if (normalized.length() > 160) throw new IllegalArgumentException("operationId too long");
        return normalized;
    }

    static String text(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty()) throw new IllegalArgumentException(field + " must not be blank");
        if (normalized.length() > 4096) throw new IllegalArgumentException(field + " too long");
        return normalized;
    }

    static String sha256(String value, String field) {
        String normalized = text(value, field).toLowerCase();
        if (!normalized.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(field + " must be sha256 hex");
        return normalized;
    }

    private static Set<String> canonicalTruthKeys(Set<String> raw) {
        Objects.requireNonNull(raw, "ownedTruthKeys");
        TreeSet<String> out = new TreeSet<>();
        for (String value : raw) {
            String key = text(value, "truthKey").toLowerCase();
            if (!key.matches("[a-z][a-z0-9.-]{2,127}")) {
                throw new IllegalArgumentException("invalid truthKey: " + key);
            }
            if (!out.add(key)) throw new IllegalArgumentException("duplicate truthKey: " + key);
        }
        return Set.copyOf(out);
    }

    private static Set<String> canonicalTextSet(Set<String> raw, String field) {
        Objects.requireNonNull(raw, field);
        TreeSet<String> out = new TreeSet<>();
        for (String value : raw) {
            String normalized = text(value, field);
            if (!out.add(normalized)) throw new IllegalArgumentException("duplicate " + field + ": " + normalized);
        }
        return Set.copyOf(out);
    }

    static String canonicalTuple(String kind, String... values) {
        StringBuilder out = new StringBuilder(field(kind));
        for (String value : values) out.append(field(Objects.requireNonNull(value, "canonical field")));
        return out.toString();
    }

    static String canonicalSet(Set<String> values) {
        Objects.requireNonNull(values, "values");
        StringBuilder out = new StringBuilder();
        new TreeSet<>(values).forEach(value -> out.append(field(value)));
        return out.toString();
    }

    static String canonicalList(List<String> values) {
        Objects.requireNonNull(values, "values");
        StringBuilder out = new StringBuilder();
        values.forEach(value -> out.append(field(value)));
        return out.toString();
    }

    private static String field(String value) {
        return value.length() + ":" + value;
    }

    static <T> List<T> immutableList(List<T> values) {
        return List.copyOf(new ArrayList<>(values));
    }

    static <T> Set<T> immutableOrderedSet(Set<T> values) {
        return Set.copyOf(new LinkedHashSet<>(values));
    }
}
