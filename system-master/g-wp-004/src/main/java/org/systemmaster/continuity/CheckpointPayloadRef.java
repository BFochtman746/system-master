package org.systemmaster.continuity;

import java.time.Instant;

public record CheckpointPayloadRef(String contentDigest,String artifactRef,long byteLength,String encryptionRef,
                                   String classification,String storageCustodianRef,Instant createdAt) {
    public CheckpointPayloadRef {
        contentDigest=req(contentDigest,"contentDigest"); artifactRef=req(artifactRef,"artifactRef");
        if(byteLength<0) throw new IllegalArgumentException("byteLength");
        encryptionRef=norm(encryptionRef); classification=req(classification,"classification");
        storageCustodianRef=req(storageCustodianRef,"storageCustodianRef");
        createdAt=java.util.Objects.requireNonNull(createdAt,"createdAt");
    }
    static String req(String v,String n){String x=norm(v);if(x==null)throw new IllegalArgumentException(n+" required");return x;}
    static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
