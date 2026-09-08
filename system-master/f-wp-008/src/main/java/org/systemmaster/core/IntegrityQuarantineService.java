package org.systemmaster.core;

import java.time.Instant;
import java.util.*;
import static org.systemmaster.core.VerificationEvidenceContracts.*;

public final class IntegrityQuarantineService {
    public record QuarantineRecord(String changeId,String findingId,String reason,Instant quarantinedAt,String releaseEvidenceId,IntegrityStanding standing) {}
    private final Map<String,QuarantineRecord> records=new HashMap<>();

    public QuarantineRecord quarantine(IntegrityFinding finding,Instant now){
        Objects.requireNonNull(finding);Objects.requireNonNull(now);
        QuarantineRecord q=new QuarantineRecord(finding.changeId(),finding.findingId(),finding.reason(),now,"",IntegrityStanding.QUARANTINED);
        records.put(finding.changeId(),q);return q;
    }
    public boolean isQuarantined(String changeId){return records.containsKey(changeId)&&records.get(changeId).standing()==IntegrityStanding.QUARANTINED;}
    public void requireClear(String changeId){if(isQuarantined(changeId))throw new SecurityException("CHANGE_QUARANTINED");}
    public QuarantineRecord reconcile(String changeId,String findingId,EvidenceRef evidence,Instant now){
        QuarantineRecord q=records.get(changeId);if(q==null||q.standing()!=IntegrityStanding.QUARANTINED)throw new IllegalStateException("NO_ACTIVE_QUARANTINE");
        if(!q.findingId().equals(findingId))throw new IllegalArgumentException("FINDING_MISMATCH");
        if(!evidence.currentAt(now)||evidence.standing()!=EvidenceStanding.CURRENT)throw new IllegalStateException("RECONCILIATION_EVIDENCE_NOT_CURRENT");
        QuarantineRecord clear=new QuarantineRecord(changeId,findingId,q.reason(),q.quarantinedAt(),evidence.evidenceId(),IntegrityStanding.CLEAR);
        records.put(changeId,clear);return clear;
    }
}
