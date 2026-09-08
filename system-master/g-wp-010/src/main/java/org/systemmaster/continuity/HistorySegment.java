package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record HistorySegment(String segmentId,String workUnitId,long throughEventSeq,String snapshotRef,String snapshotDigest,
        List<String> retainedEvidenceRefs,String parentSegmentDigest,String segmentDigest,Instant createdAt) {
    public HistorySegment {
        segmentId=req(segmentId);workUnitId=req(workUnitId);if(throughEventSeq<1)throw new IllegalArgumentException("throughEventSeq");snapshotRef=req(snapshotRef);snapshotDigest=req(snapshotDigest);
        retainedEvidenceRefs=List.copyOf(retainedEvidenceRefs==null?List.of():retainedEvidenceRefs);parentSegmentDigest=norm(parentSegmentDigest);segmentDigest=req(segmentDigest);createdAt=Objects.requireNonNull(createdAt);
    }
    private static String req(String v){String x=norm(v);if(x==null)throw new IllegalArgumentException("required");return x;}private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
