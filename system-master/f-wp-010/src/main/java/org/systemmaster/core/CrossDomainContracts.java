package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** Immutable F-WP-010 cross-domain adapter contracts. Specialist truth remains specialist-owned. */
public final class CrossDomainContracts {
    private CrossDomainContracts() {}

    public enum Standing { ELIGIBLE, RESTRICTED, PROHIBITED, UNKNOWN }
    public enum Admission { ADMITTED, DEFERRED, REJECTED, UNKNOWN }
    public enum IncidentCommand { NONE, MONITOR, CONTAIN, FREEZE, QUARANTINE }
    public enum MetricKind { LEAD_TIME, EXECUTION_DURATION, CHANGE_ASSOCIATED_FAILURE, RECOVERY_TIME, REWORK }
    public enum MetricStanding { OBSERVED, GAP }

    public record ChangeSubject(String changeId, long revision, String targetDigest, String executionTimelineDigest) {
        public ChangeSubject { required(changeId,"changeId"); if(revision<0) throw new IllegalArgumentException("revision"); checkDigest(targetDigest,"targetDigest"); checkDigest(executionTimelineDigest,"executionTimelineDigest"); }
        public String digest(){ return sha256(changeId+"|"+revision+"|"+targetDigest+"|"+executionTimelineDigest); }
    }

    public record DeploymentBinding(String bindingId, String changeDigest, String authorizationDigest, String deploymentSubjectDigest, String owner, long revision) {
        public DeploymentBinding { required(bindingId,"bindingId"); checkDigest(changeDigest,"changeDigest"); checkDigest(authorizationDigest,"authorizationDigest"); checkDigest(deploymentSubjectDigest,"deploymentSubjectDigest"); required(owner,"owner"); if(revision<0) throw new IllegalArgumentException("revision"); }
        public String digest(){ return sha256(bindingId+"|"+changeDigest+"|"+authorizationDigest+"|"+deploymentSubjectDigest+"|"+owner+"|"+revision); }
    }

    public record IncidentStanding(String incidentId, IncidentCommand command, String authorityOwner, String evidenceDigest, Instant observedAt) {
        public IncidentStanding { required(incidentId,"incidentId"); Objects.requireNonNull(command); required(authorityOwner,"authorityOwner"); checkDigest(evidenceDigest,"evidenceDigest"); Objects.requireNonNull(observedAt); }
        public String digest(){ return sha256(incidentId+"|"+command+"|"+authorityOwner+"|"+evidenceDigest+"|"+observedAt); }
    }

    public record ChangeIncidentLink(String incidentId, String changeDigest, String timelineDigest, String incidentEvidenceDigest, boolean correlationOnly, String linkDigest) {
        public ChangeIncidentLink { required(incidentId,"incidentId"); checkDigest(changeDigest,"changeDigest"); checkDigest(timelineDigest,"timelineDigest"); checkDigest(incidentEvidenceDigest,"incidentEvidenceDigest"); checkDigest(linkDigest,"linkDigest"); if(!correlationOnly) throw new IllegalArgumentException("causation_not_permitted"); }
    }

    public record ProviderImpact(String providerId, Standing standing, String eligibilityDigest, String exitPlanDigest, String concentrationDigest, Instant observedAt) {
        public ProviderImpact { required(providerId,"providerId"); Objects.requireNonNull(standing); checkDigest(eligibilityDigest,"eligibilityDigest"); checkDigest(exitPlanDigest,"exitPlanDigest"); checkDigest(concentrationDigest,"concentrationDigest"); Objects.requireNonNull(observedAt); }
        public String digest(){ return sha256(providerId+"|"+standing+"|"+eligibilityDigest+"|"+exitPlanDigest+"|"+concentrationDigest+"|"+observedAt); }
    }

    public record ResourceAdmission(String admissionId, Admission standing, String workloadDigest, String capacityDigest, Instant expiresAt) {
        public ResourceAdmission { required(admissionId,"admissionId"); Objects.requireNonNull(standing); checkDigest(workloadDigest,"workloadDigest"); checkDigest(capacityDigest,"capacityDigest"); Objects.requireNonNull(expiresAt); }
        public String digest(){ return sha256(admissionId+"|"+standing+"|"+workloadDigest+"|"+capacityDigest+"|"+expiresAt); }
    }

    public record MetricObservation(MetricKind kind, MetricStanding standing, long valueMillis, String subjectDigest, String telemetryEvidenceDigest, String semanticsVersion, Instant observedAt) {
        public MetricObservation { Objects.requireNonNull(kind); Objects.requireNonNull(standing); if(valueMillis<0) throw new IllegalArgumentException("valueMillis"); checkDigest(subjectDigest,"subjectDigest"); if(standing==MetricStanding.OBSERVED) checkDigest(telemetryEvidenceDigest,"telemetryEvidenceDigest"); else if(telemetryEvidenceDigest!=null && !telemetryEvidenceDigest.isBlank()) checkDigest(telemetryEvidenceDigest,"telemetryEvidenceDigest"); required(semanticsVersion,"semanticsVersion"); Objects.requireNonNull(observedAt); }
        public String digest(){ return sha256(kind+"|"+standing+"|"+valueMillis+"|"+subjectDigest+"|"+String.valueOf(telemetryEvidenceDigest)+"|"+semanticsVersion+"|"+observedAt); }
    }

    public record PostChangeReviewRef(String reviewId, String changeDigest, String triggerClass, String incidentRef, String correctiveActionRef, String authorityOwner, boolean openObligation) {
        public PostChangeReviewRef { required(reviewId,"reviewId"); checkDigest(changeDigest,"changeDigest"); required(triggerClass,"triggerClass"); required(authorityOwner,"authorityOwner"); if(!openObligation) throw new IllegalArgumentException("review_obligation_must_start_open"); }
        public String digest(){ return sha256(reviewId+"|"+changeDigest+"|"+triggerClass+"|"+String.valueOf(incidentRef)+"|"+String.valueOf(correctiveActionRef)+"|"+authorityOwner+"|"+openObligation); }
    }

    static void required(String v,String n){ if(v==null||v.isBlank()) throw new IllegalArgumentException(n); }
    static void checkDigest(String v,String n){ required(v,n); if(!v.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(n+"_sha256"); }
    static String sha256(String v){ try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8))); } catch(Exception e){ throw new IllegalStateException(e); } }
}
