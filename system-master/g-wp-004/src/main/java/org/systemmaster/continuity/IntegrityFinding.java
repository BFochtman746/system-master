package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;

public record IntegrityFinding(String integrityFindingId,String subjectRef,FindingType findingType,String expectedDigest,
        String observedDigest,Severity severity,FindingState state,List<String> evidenceRefs,String validatorVersion,Instant createdAt) {
    public IntegrityFinding {
        integrityFindingId=CheckpointPayloadRef.req(integrityFindingId,"integrityFindingId"); subjectRef=CheckpointPayloadRef.req(subjectRef,"subjectRef");
        findingType=java.util.Objects.requireNonNull(findingType,"findingType"); expectedDigest=CheckpointPayloadRef.req(expectedDigest,"expectedDigest");
        observedDigest=CheckpointPayloadRef.norm(observedDigest); severity=java.util.Objects.requireNonNull(severity,"severity");
        state=java.util.Objects.requireNonNull(state,"state"); evidenceRefs=List.copyOf(evidenceRefs==null?List.of():evidenceRefs);
        validatorVersion=CheckpointPayloadRef.req(validatorVersion,"validatorVersion"); createdAt=java.util.Objects.requireNonNull(createdAt,"createdAt");
    }
    public enum FindingType { VALID, CORRUPT, INCOMPATIBLE, UNKNOWN }
    public enum Severity { INFO, WARNING, CRITICAL }
    public enum FindingState { OPEN, CLOSED }
}
