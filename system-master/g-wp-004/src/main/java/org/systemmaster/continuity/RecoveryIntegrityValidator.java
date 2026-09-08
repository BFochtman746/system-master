package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class RecoveryIntegrityValidator {
    private final CheckpointStore store;
    private final CheckpointAuthorities.CompatibilityAuthority compatibility;
    private final String validatorVersion;
    public RecoveryIntegrityValidator(Path root,CheckpointAuthorities.CompatibilityAuthority compatibility,String validatorVersion){
        this.store=new CheckpointStore(root);this.compatibility=Objects.requireNonNull(compatibility);this.validatorVersion=CheckpointPayloadRef.req(validatorVersion,"validatorVersion");
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
    public boolean quarantined(String checkpointId){return store.quarantined(checkpointId);}
    CheckpointStore store(){return store;}
}
