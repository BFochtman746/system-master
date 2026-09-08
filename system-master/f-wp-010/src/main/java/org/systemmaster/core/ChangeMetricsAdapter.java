package org.systemmaster.core;

import static org.systemmaster.core.CrossDomainContracts.*;
import java.time.Instant;
import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/** Versioned metric adapter. Metrics remain observations; correlation never self-promotes to causation. */
public final class ChangeMetricsAdapter {
    private final String semanticsVersion;
    public ChangeMetricsAdapter(String semanticsVersion){ CrossDomainContracts.required(semanticsVersion,"semanticsVersion"); this.semanticsVersion=semanticsVersion; }

    public MetricObservation observed(MetricKind kind,long valueMillis,ChangeSubject subject,String telemetryEvidenceDigest,Instant at){
        Objects.requireNonNull(subject); return new MetricObservation(kind,MetricStanding.OBSERVED,valueMillis,subject.digest(),telemetryEvidenceDigest,semanticsVersion,at);
    }
    public MetricObservation gap(MetricKind kind,ChangeSubject subject,Instant at){
        Objects.requireNonNull(subject); return new MetricObservation(kind,MetricStanding.GAP,0,subject.digest(),null,semanticsVersion,at);
    }
    public Map<MetricKind,MetricObservation> requireDistinctFamilies(Map<MetricKind,MetricObservation> input){
        Objects.requireNonNull(input); EnumMap<MetricKind,MetricObservation> out=new EnumMap<>(MetricKind.class);
        for(MetricKind k:MetricKind.values()) out.put(k,input.getOrDefault(k,null));
        return Map.copyOf(out);
    }
    public boolean mayAssertCausation(MetricObservation associatedFailure){ Objects.requireNonNull(associatedFailure); return false; }
}
