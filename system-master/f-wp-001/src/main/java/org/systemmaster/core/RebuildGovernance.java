package org.systemmaster.core;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** F-WP-001 implementation of F-RQ-060 status-axis independence. */
public final class RebuildGovernance {
    public enum Axis {
        ARCHITECTURE,
        PRODUCT_IMPLEMENTATION,
        EXECUTABLE_QUALIFICATION,
        EMPIRICAL_PRODUCTION
    }

    public enum Standing {
        NOT_CLAIMED,
        NOT_STARTED,
        IN_PROGRESS,
        CLOSED,
        PASSED,
        PROVEN,
        FAILED,
        BLOCKED
    }

    public enum EvidenceClass {
        ARCHITECTURE,
        IMPLEMENTATION,
        EXECUTABLE_QUALIFICATION,
        EMPIRICAL_PRODUCTION
    }

    public record EvidenceRef(String evidenceId, EvidenceClass evidenceClass) {
        public EvidenceRef {
            evidenceId = require(evidenceId, "evidenceId");
            Objects.requireNonNull(evidenceClass, "evidenceClass");
        }
    }

    public record ClosureRequest(
            String packetId,
            Standing architecture,
            Standing productImplementation,
            Standing executableQualification,
            Standing empiricalProduction,
            List<EvidenceRef> evidenceRefs) {
        public ClosureRequest {
            packetId = require(packetId, "packetId");
            Objects.requireNonNull(architecture, "architecture");
            Objects.requireNonNull(productImplementation, "productImplementation");
            Objects.requireNonNull(executableQualification, "executableQualification");
            Objects.requireNonNull(empiricalProduction, "empiricalProduction");
            evidenceRefs = List.copyOf(Objects.requireNonNull(evidenceRefs, "evidenceRefs"));
        }
    }

    public record ClosureRecord(
            String packetId,
            Map<Axis, Standing> standings,
            List<EvidenceRef> evidenceRefs) {
        public ClosureRecord {
            standings = Map.copyOf(standings);
            evidenceRefs = List.copyOf(evidenceRefs);
        }
    }

    public ClosureRecord closeArchitecturePacket(ClosureRequest request) {
        Objects.requireNonNull(request, "request");
        if (request.architecture() != Standing.CLOSED) {
            throw new IllegalStateException("ARCHITECTURE_NOT_CLOSED");
        }
        requireEvidenceForClaim(request.architecture(), EvidenceClass.ARCHITECTURE, request.evidenceRefs(), "ARCHITECTURE_EVIDENCE_REQUIRED");
        requireIndependentAxisEvidence(request.productImplementation(), EvidenceClass.IMPLEMENTATION, request.evidenceRefs(), "FALSE_IMPLEMENTATION_CLAIM");
        requireIndependentAxisEvidence(request.executableQualification(), EvidenceClass.EXECUTABLE_QUALIFICATION, request.evidenceRefs(), "FALSE_EXECUTABLE_QUALIFICATION_CLAIM");
        requireIndependentAxisEvidence(request.empiricalProduction(), EvidenceClass.EMPIRICAL_PRODUCTION, request.evidenceRefs(), "FALSE_EMPIRICAL_PRODUCTION_CLAIM");

        EnumMap<Axis, Standing> standings = new EnumMap<>(Axis.class);
        standings.put(Axis.ARCHITECTURE, request.architecture());
        standings.put(Axis.PRODUCT_IMPLEMENTATION, request.productImplementation());
        standings.put(Axis.EXECUTABLE_QUALIFICATION, request.executableQualification());
        standings.put(Axis.EMPIRICAL_PRODUCTION, request.empiricalProduction());
        return new ClosureRecord(request.packetId(), standings, request.evidenceRefs());
    }

    private static void requireIndependentAxisEvidence(
            Standing standing,
            EvidenceClass evidenceClass,
            List<EvidenceRef> evidence,
            String errorCode) {
        if (standing == Standing.NOT_CLAIMED || standing == Standing.NOT_STARTED || standing == Standing.BLOCKED || standing == Standing.FAILED) {
            return;
        }
        requireEvidenceForClaim(standing, evidenceClass, evidence, errorCode);
    }

    private static void requireEvidenceForClaim(
            Standing standing,
            EvidenceClass evidenceClass,
            List<EvidenceRef> evidence,
            String errorCode) {
        boolean present = evidence.stream().anyMatch(ref -> ref.evidenceClass() == evidenceClass);
        if (!present) {
            throw new IllegalStateException(errorCode + ":" + standing);
        }
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
