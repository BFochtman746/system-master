package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public final class CheckpointCatalog {
    private final CheckpointStore store;
    private final CheckpointAuthorities.CompatibilityAuthority compatibility;
    private final CheckpointAuthorities.RetentionAuthority retention;
    public CheckpointCatalog(Path root,CheckpointAuthorities.CompatibilityAuthority compatibility,CheckpointAuthorities.RetentionAuthority retention){
        this.store=new CheckpointStore(root);this.compatibility=Objects.requireNonNull(compatibility);this.retention=Objects.requireNonNull(retention);
    }
    public Optional<CheckpointManifest> currentResumeCheckpoint(String workUnitId){return store.currentResumePointer(CheckpointPayloadRef.req(workUnitId,"workUnitId"));}
    public List<LineageEntry> getCheckpointLineage(String workUnitId){
        return store.lineage(CheckpointPayloadRef.req(workUnitId,"workUnitId")).stream().map(m->new LineageEntry(m,
                store.quarantined(m.checkpointId())?"QUARANTINED":"CURRENT_METADATA",
                compatibility.assess(m), retention.disposition(m.payloadDigest(),m.checkpointId()),
                store.observedPayloadDigest(m.payloadDigest())==null?"UNAVAILABLE":"AVAILABLE")).toList();
    }
    public CleanupResult cleanupOrphans(Duration safetyWindow,Instant now){var r=store.cleanupOrphans(safetyWindow,now,retention);return new CleanupResult(r.deleted(),r.held(),r.tooYoung(),r.deletedDigests());}
    public boolean payloadExists(String digest){return store.payloadExists(digest);}
    public int payloadCount(){return store.payloadCount();}
    CheckpointStore store(){return store;}
    public record LineageEntry(CheckpointManifest manifest,String integrityStanding,CheckpointAuthorities.CompatibilityStanding compatibility,CheckpointAuthorities.RetentionDisposition retention,String payloadAvailability){}
    public record CleanupResult(int deleted,int held,int tooYoung,List<String> deletedDigests){}
}
