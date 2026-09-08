package org.systemmaster.core;

import static org.systemmaster.core.CrossDomainContracts.*;
import java.util.Objects;

/** Correlates incident/review references while preserving 021U/021Z authority and never asserting causation. */
public final class ChangeIncidentCorrelator {
    public enum ProgressDisposition { CONTINUE, MONITOR, HALT_FOR_CONTAINMENT, HALT_FOR_FREEZE, HALT_FOR_QUARANTINE }

    public ProgressDisposition incidentPrecedence(IncidentStanding standing, boolean emergencyAuthority) {
        Objects.requireNonNull(standing);
        return switch (standing.command()) {
            case NONE -> ProgressDisposition.CONTINUE;
            case MONITOR -> ProgressDisposition.MONITOR;
            case CONTAIN -> emergencyAuthority ? ProgressDisposition.MONITOR : ProgressDisposition.HALT_FOR_CONTAINMENT;
            case FREEZE -> emergencyAuthority ? ProgressDisposition.MONITOR : ProgressDisposition.HALT_FOR_FREEZE;
            case QUARANTINE -> ProgressDisposition.HALT_FOR_QUARANTINE;
        };
    }

    public ChangeIncidentLink correlate(ChangeSubject change, IncidentStanding incident) {
        Objects.requireNonNull(change); Objects.requireNonNull(incident);
        String linkDigest=CrossDomainContracts.sha256(incident.incidentId()+"|"+change.digest()+"|"+change.executionTimelineDigest()+"|"+incident.evidenceDigest()+"|CORRELATION_ONLY");
        return new ChangeIncidentLink(incident.incidentId(),change.digest(),change.executionTimelineDigest(),incident.evidenceDigest(),true,linkDigest);
    }

    public PostChangeReviewRef requestPostChangeReview(ChangeSubject change, boolean failed, boolean emergency, String incidentRef, String correctiveActionRef) {
        Objects.requireNonNull(change);
        if (!failed && !emergency) throw new IllegalStateException("REVIEW_TRIGGER_NOT_MATERIAL");
        String trigger = failed && emergency ? "FAILED_EMERGENCY" : failed ? "FAILED" : "EMERGENCY";
        String id = "PCR-"+CrossDomainContracts.sha256(change.digest()+"|"+trigger).substring(0,16);
        return new PostChangeReviewRef(id,change.digest(),trigger,incidentRef,correctiveActionRef,"021U/021Z",true);
    }
}
