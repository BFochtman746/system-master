package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class RecoveryIntegrityValidator {
    public record RecoveryIntegrityAssessment(String recoveryId, IntegrityFinding.FindingType findingType,
                                              IntegrityFinding.Severity severity, List<String> evidenceRefs,
                                              String reason, Instant evaluatedAt) {
        public RecoveryIntegrityAssessment { evidenceRefs = List.copyOf(evidenceRefs == null ? List.of() : evidenceRefs); }
        public boolean valid() { return findingType == IntegrityFinding.FindingType.VALID; }
    }

    private final CheckpointStore store;
    private final Path recoveryQuarantineRoot;
    private final CheckpointAuthorities.CompatibilityAuthority compatibility;
    private final String validatorVersion;
    public RecoveryIntegrityValidator(Path root,CheckpointAuthorities.CompatibilityAuthority compatibility,String validatorVersion){
        Path resolvedRoot=Objects.requireNonNull(root); this.store=new CheckpointStore(resolvedRoot); this.recoveryQuarantineRoot=resolvedRoot.resolve("recovery-integrity-quarantine");
        this.compatibility=Objects.requireNonNull(compatibility);this.validatorVersion=CheckpointPayloadRef.req(validatorVersion,"validatorVersion");
    }
    public IntegrityFinding validateCheckpoint(String checkpointId){
        CheckpointManifest m=store.byId(CheckpointPayloadRef.req(checkpointId,"checkpointId")).orElseThrow(()->new IllegalArgumentException("checkpoint missing"));
        String observed=store.observedPayloadDigest(m.payloadDigest()); IntegrityFinding.FindingType type; IntegrityFinding.Severity severity;
        if(observed==null){type=IntegrityFinding.FindingType.UNKNOWN;severity=IntegrityFinding.Severity.WARNING;}
        else if(!observed.equals(m.payloadDigest())){type=IntegrityFinding.FindingType.CORRUPT;severity=IntegrityFinding.Severity.CRITICAL;}
        else {var c=compatibility.assess(m);if(c==CheckpointAuthorities.CompatibilityStanding.INCOMPATIBLE){type=IntegrityFinding.FindingType.INCOMPATIBLE;severity=IntegrityFinding.Severity.CRITICAL;}
              else if(c==CheckpointAuthorities.CompatibilityStanding.UNKNOWN){type=IntegrityFinding.FindingType.UNKNOWN;severity=IntegrityFinding.Severity.WARNING;}
              else{type=IntegrityFinding.FindingType.VALID;severity=IntegrityFinding.Severity.INFO;}}
        String findingId="finding-"+CheckpointStore.sha256(checkpointId+"|"+validatorVersion+"|"+type+"|"+(observed==null?"":observed)).substring(0,24);
        IntegrityFinding f=new IntegrityFinding(findingId,checkpointId,type,m.payloadDigest(),observed,severity,
                type==IntegrityFinding.FindingType.VALID?IntegrityFinding.FindingState.CLOSED:IntegrityFinding.FindingState.OPEN,
                List.of("checkpoint:"+checkpointId),validatorVersion,Instant.now());
        if(type==IntegrityFinding.FindingType.CORRUPT)store.quarantine(checkpointId,f);
        return f;
    }

    public RecoveryIntegrityAssessment validateRecoveryIntegrity(String recoveryId, String expectedDigest, String observedDigest,
                                                                  List<IntegrityFinding> criticalFindings, List<String> evidenceRefs) {
        recoveryId = CheckpointPayloadRef.req(recoveryId, "recoveryId");
        expectedDigest = CheckpointPayloadRef.req(expectedDigest, "expectedDigest");
        observedDigest = CheckpointPayloadRef.req(observedDigest, "observedDigest");
        List<IntegrityFinding> findings = List.copyOf(criticalFindings == null ? List.of() : criticalFindings);
        boolean digestOk = expectedDigest.equals(observedDigest);
        boolean findingsOk = findings.stream().allMatch(f -> f.findingType() == IntegrityFinding.FindingType.VALID && f.state() == IntegrityFinding.FindingState.CLOSED);
        if (digestOk && findingsOk) return new RecoveryIntegrityAssessment(recoveryId, IntegrityFinding.FindingType.VALID, IntegrityFinding.Severity.INFO, evidenceRefs, "ALL_CRITICAL_INTEGRITY_CHECKS_PASS", Instant.now());
        String reason = digestOk ? "CRITICAL_INTEGRITY_FINDING_OPEN" : "RECOVERY_STATE_DIGEST_MISMATCH";
        quarantineRecovery(recoveryId, reason, evidenceRefs);
        return new RecoveryIntegrityAssessment(recoveryId, IntegrityFinding.FindingType.CORRUPT, IntegrityFinding.Severity.CRITICAL, evidenceRefs, reason, Instant.now());
    }

    public void quarantineRecovery(String recoveryId, String reason, List<String> evidenceRefs) {
        recoveryId = CheckpointPayloadRef.req(recoveryId, "recoveryId"); reason = CheckpointPayloadRef.req(reason, "reason");
        try {
            Files.createDirectories(recoveryQuarantineRoot);
            String body = "recovery_id=" + recoveryId + "\nreason=" + reason + "\nvalidator=" + validatorVersion + "\nevidence=" + String.join(",", evidenceRefs == null ? List.of() : evidenceRefs) + "\n";
            Files.writeString(recoveryQuarantineRoot.resolve(CheckpointStore.sha256(recoveryId) + ".q"), body, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) { throw new IllegalStateException("cannot persist recovery quarantine", e); }
    }
    public boolean recoveryQuarantined(String recoveryId) { return Files.exists(recoveryQuarantineRoot.resolve(CheckpointStore.sha256(CheckpointPayloadRef.req(recoveryId,"recoveryId")) + ".q")); }
    public boolean quarantined(String checkpointId){return store.quarantined(checkpointId);}
    CheckpointStore store(){return store;}
}
