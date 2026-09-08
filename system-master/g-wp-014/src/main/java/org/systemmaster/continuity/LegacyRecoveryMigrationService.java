package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Crosswalk/import/export boundary. It never becomes an alternate recovery truth store. */
public final class LegacyRecoveryMigrationService {
    public enum MappingStanding { MAPPED, AMBIGUOUS, MISSING }
    public interface CrosswalkAuthority { Mapping resolve(String legacySystem,String legacyRecoveryId); }
    public record Mapping(MappingStanding standing,String canonicalWorkUnitId,String rationale) {}
    public record LegacyBinding(String legacySystem,String legacyRecoveryId,String immutableHistoryDigest,String sourceRef) {
        public LegacyBinding{legacySystem=req(legacySystem,"legacySystem");legacyRecoveryId=req(legacyRecoveryId,"legacyRecoveryId");immutableHistoryDigest=req(immutableHistoryDigest,"immutableHistoryDigest");sourceRef=req(sourceRef,"sourceRef");}
    }
    public record ImportResult(String legacyRecoveryId,MappingStanding standing,String canonicalWorkUnitId,String sourceDigest,String disposition,String provenanceRef) { public boolean imported(){return standing==MappingStanding.MAPPED;} }
    public record ExportEntry(String eventRef,String eventDigest,String evidenceClass,String provenanceRef) {}
    public record RecoveryExport(String canonicalWorkUnitId,String exportDigest,List<ExportEntry> entries,String minimizationPolicy,Instant createdAt) { public RecoveryExport{entries=List.copyOf(entries);} }
    private final CrosswalkAuthority crosswalk;
    public LegacyRecoveryMigrationService(CrosswalkAuthority crosswalk){this.crosswalk=Objects.requireNonNull(crosswalk);}
    public ImportResult importLegacyRecoveryState(LegacyBinding legacy){Mapping m=Objects.requireNonNull(crosswalk.resolve(legacy.legacySystem(),legacy.legacyRecoveryId()));if(m.standing()!=MappingStanding.MAPPED||m.canonicalWorkUnitId()==null||m.canonicalWorkUnitId().isBlank())return new ImportResult(legacy.legacyRecoveryId(),m.standing(),null,legacy.immutableHistoryDigest(),"QUARANTINE_MANUAL_BINDING",legacy.sourceRef());return new ImportResult(legacy.legacyRecoveryId(),MappingStanding.MAPPED,m.canonicalWorkUnitId(),legacy.immutableHistoryDigest(),"CROSSWALK_ONLY_NO_DUPLICATE_TRUTH",legacy.sourceRef());}
    public RecoveryExport exportRecoveryHistory(String canonicalWorkUnitId,List<ExportEntry> entries,String minimizationPolicy){canonicalWorkUnitId=req(canonicalWorkUnitId,"canonicalWorkUnitId");minimizationPolicy=req(minimizationPolicy,"minimizationPolicy");List<ExportEntry> safe=List.copyOf(entries==null?List.of():entries);for(var e:safe){req(e.eventRef(),"eventRef");req(e.eventDigest(),"eventDigest");req(e.evidenceClass(),"evidenceClass");req(e.provenanceRef(),"provenanceRef");if(e.provenanceRef().toLowerCase().contains("secret="))throw new IllegalStateException("export contains sensitive material");}String canonical=safe.stream().map(e->e.eventRef()+"|"+e.eventDigest()+"|"+e.evidenceClass()+"|"+e.provenanceRef()).reduce("",(a,b)->a+"\n"+b);String digest=CheckpointStore.sha256(canonicalWorkUnitId+"|"+minimizationPolicy+canonical);return new RecoveryExport(canonicalWorkUnitId,digest,safe,minimizationPolicy,Instant.now());}
    private static String req(String v,String f){return RecoveryAuthorizationGate.req(v,f);}
}
