package org.systemmaster.foundation.root;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class RegistryModels {
    private RegistryModels() {}

    public enum Lifecycle {
        ACTIVE,
        RETIRED_TERMINAL
    }

    public enum SubjectType {
        PRODUCT_ROOT,
        SYSTEM,
        AUTHORITY,
        INTEGRATION_EDGE
    }

    public enum Operation {
        BOOTSTRAP,
        ADMIT_SYSTEM,
        RETIRE_SYSTEM,
        UPDATE_SYSTEM_VERSION,
        ADMIT_AUTHORITY,
        REASSIGN_AUTHORITY,
        UPDATE_AUTHORITY_VERSION,
        RETIRE_AUTHORITY,
        REGISTER_INTEGRATION_EDGE,
        UPDATE_INTEGRATION_EDGE,
        RETIRE_INTEGRATION_EDGE,
        UPDATE_PRODUCT_ROOT_VERSION
    }

    public record ProductRoot(
            String productId,
            String canonicalName,
            String versionPointer) {
        public ProductRoot {
            productId = identifier(productId, "productId");
            canonicalName = required(canonicalName, "canonicalName");
            versionPointer = required(versionPointer, "versionPointer");
        }
    }

    public record SystemRecord(
            String systemId,
            String canonicalName,
            String classification,
            String parentId,
            String ownerPath,
            String versionPointer,
            String controlRef,
            Lifecycle lifecycle,
            long admittedRevision,
            Long retiredRevision) {
        public SystemRecord {
            systemId = identifier(systemId, "systemId");
            canonicalName = required(canonicalName, "canonicalName");
            classification = required(classification, "classification");
            parentId = identifier(parentId, "parentId");
            ownerPath = required(ownerPath, "ownerPath");
            versionPointer = required(versionPointer, "versionPointer");
            controlRef = required(controlRef, "controlRef");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
            if (admittedRevision < 1) throw new IllegalArgumentException("admittedRevision must be positive");
            if (lifecycle == Lifecycle.ACTIVE && retiredRevision != null) {
                throw new IllegalArgumentException("active system cannot have retiredRevision");
            }
            if (lifecycle == Lifecycle.RETIRED_TERMINAL && (retiredRevision == null || retiredRevision < admittedRevision)) {
                throw new IllegalArgumentException("retired system requires valid retiredRevision");
            }
        }

        public SystemRecord withVersion(String pointer) {
            return new SystemRecord(systemId, canonicalName, classification, parentId, ownerPath,
                    required(pointer, "versionPointer"), controlRef, lifecycle, admittedRevision, retiredRevision);
        }

        public SystemRecord retired(long revision) {
            return new SystemRecord(systemId, canonicalName, classification, parentId, ownerPath,
                    versionPointer, controlRef, Lifecycle.RETIRED_TERMINAL, admittedRevision, revision);
        }
    }

    public record AuthorityRecord(
            String authorityId,
            String canonicalName,
            String ownerSystemId,
            String versionPointer,
            Lifecycle lifecycle,
            long admittedRevision,
            Long retiredRevision) {
        public AuthorityRecord {
            authorityId = identifier(authorityId, "authorityId");
            canonicalName = required(canonicalName, "canonicalName");
            ownerSystemId = identifier(ownerSystemId, "ownerSystemId");
            versionPointer = required(versionPointer, "versionPointer");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
            if (admittedRevision < 1) throw new IllegalArgumentException("admittedRevision must be positive");
            if (lifecycle == Lifecycle.ACTIVE && retiredRevision != null) {
                throw new IllegalArgumentException("active authority cannot have retiredRevision");
            }
            if (lifecycle == Lifecycle.RETIRED_TERMINAL && (retiredRevision == null || retiredRevision < admittedRevision)) {
                throw new IllegalArgumentException("retired authority requires valid retiredRevision");
            }
        }

        public AuthorityRecord reassign(String newOwner) {
            return new AuthorityRecord(authorityId, canonicalName, required(newOwner, "ownerSystemId"),
                    versionPointer, lifecycle, admittedRevision, retiredRevision);
        }

        public AuthorityRecord withVersion(String pointer) {
            return new AuthorityRecord(authorityId, canonicalName, ownerSystemId, required(pointer, "versionPointer"),
                    lifecycle, admittedRevision, retiredRevision);
        }

        public AuthorityRecord retired(long revision) {
            return new AuthorityRecord(authorityId, canonicalName, ownerSystemId, versionPointer,
                    Lifecycle.RETIRED_TERMINAL, admittedRevision, revision);
        }
    }

    public record IntegrationEdge(
            String edgeId,
            String producerSystemId,
            String consumerSystemId,
            String interfaceRef,
            Lifecycle lifecycle,
            long admittedRevision,
            Long retiredRevision) {
        public IntegrationEdge {
            edgeId = identifier(edgeId, "edgeId");
            producerSystemId = identifier(producerSystemId, "producerSystemId");
            consumerSystemId = identifier(consumerSystemId, "consumerSystemId");
            interfaceRef = required(interfaceRef, "interfaceRef");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
            if (producerSystemId.equals(consumerSystemId)) {
                throw new IllegalArgumentException("integration edge cannot be self-referential");
            }
            if (admittedRevision < 1) throw new IllegalArgumentException("admittedRevision must be positive");
            if (lifecycle == Lifecycle.ACTIVE && retiredRevision != null) {
                throw new IllegalArgumentException("active integration edge cannot have retiredRevision");
            }
            if (lifecycle == Lifecycle.RETIRED_TERMINAL && (retiredRevision == null || retiredRevision < admittedRevision)) {
                throw new IllegalArgumentException("retired integration edge requires valid retiredRevision");
            }
        }

        public IntegrationEdge withInterfaceRef(String ref) {
            return new IntegrationEdge(edgeId, producerSystemId, consumerSystemId, required(ref, "interfaceRef"),
                    lifecycle, admittedRevision, retiredRevision);
        }

        public IntegrationEdge retired(long revision) {
            return new IntegrationEdge(edgeId, producerSystemId, consumerSystemId, interfaceRef,
                    Lifecycle.RETIRED_TERMINAL, admittedRevision, revision);
        }
    }

    public record ChangeEvent(
            long revision,
            String commandId,
            String commandFingerprint,
            Operation operation,
            SubjectType subjectType,
            String subjectId,
            String decisionRef,
            String actorRef,
            String reason,
            Instant occurredAt) {
        public ChangeEvent {
            if (revision < 1) throw new IllegalArgumentException("revision must be positive");
            commandId = required(commandId, "commandId");
            commandFingerprint = required(commandFingerprint, "commandFingerprint");
            operation = Objects.requireNonNull(operation, "operation");
            subjectType = Objects.requireNonNull(subjectType, "subjectType");
            subjectId = required(subjectId, "subjectId");
            decisionRef = required(decisionRef, "decisionRef");
            actorRef = required(actorRef, "actorRef");
            reason = required(reason, "reason");
            occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }

    public record MutationMetadata(
            String commandId,
            String decisionRef,
            String actorRef,
            String reason,
            Instant occurredAt) {
        public MutationMetadata {
            commandId = required(commandId, "commandId");
            decisionRef = required(decisionRef, "decisionRef");
            actorRef = required(actorRef, "actorRef");
            reason = required(reason, "reason");
            occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }

    public record BootstrapSystem(
            String systemId,
            String canonicalName,
            String classification,
            String parentId,
            String versionPointer,
            String controlRef,
            Lifecycle lifecycle) {
        public BootstrapSystem {
            systemId = identifier(systemId, "systemId");
            canonicalName = required(canonicalName, "canonicalName");
            classification = required(classification, "classification");
            parentId = identifier(parentId, "parentId");
            versionPointer = required(versionPointer, "versionPointer");
            controlRef = required(controlRef, "controlRef");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
        }
    }

    public record BootstrapAuthority(
            String authorityId,
            String canonicalName,
            String ownerSystemId,
            String versionPointer,
            Lifecycle lifecycle) {
        public BootstrapAuthority {
            authorityId = identifier(authorityId, "authorityId");
            canonicalName = required(canonicalName, "canonicalName");
            ownerSystemId = identifier(ownerSystemId, "ownerSystemId");
            versionPointer = required(versionPointer, "versionPointer");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
        }
    }

    public record BootstrapEdge(
            String edgeId,
            String producerSystemId,
            String consumerSystemId,
            String interfaceRef,
            Lifecycle lifecycle) {
        public BootstrapEdge {
            edgeId = identifier(edgeId, "edgeId");
            producerSystemId = identifier(producerSystemId, "producerSystemId");
            consumerSystemId = identifier(consumerSystemId, "consumerSystemId");
            interfaceRef = required(interfaceRef, "interfaceRef");
            lifecycle = Objects.requireNonNull(lifecycle, "lifecycle");
        }
    }

    public record BootstrapDefinition(
            ProductRoot productRoot,
            List<BootstrapSystem> systems,
            List<BootstrapAuthority> authorities,
            List<BootstrapEdge> integrationEdges) {
        public BootstrapDefinition {
            productRoot = Objects.requireNonNull(productRoot, "productRoot");
            systems = List.copyOf(Objects.requireNonNull(systems, "systems"));
            authorities = List.copyOf(Objects.requireNonNull(authorities, "authorities"));
            integrationEdges = List.copyOf(Objects.requireNonNull(integrationEdges, "integrationEdges"));
        }
    }

    static String required(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty()) throw new IllegalArgumentException(field + " must not be blank");
        if (normalized.length() > 32_768) throw new IllegalArgumentException(field + " exceeds maximum length");
        return normalized;
    }

    static String identifier(String value, String field) {
        String normalized = required(value, field);
        if (normalized.length() > 128 || !normalized.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")) {
            throw new IllegalArgumentException(field + " is not a valid canonical identifier");
        }
        return normalized;
    }
}
