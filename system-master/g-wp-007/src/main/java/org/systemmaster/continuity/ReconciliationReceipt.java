package org.systemmaster.continuity;
import java.time.Instant;
import java.util.Objects;
public record ReconciliationReceipt(String effectId,String observationDigest,ExternalEffectRecoveryItem.State resultingState,long itemVersion,String externalReceiptRef,String evidenceDigest,Instant recordedAt){
 public ReconciliationReceipt{ effectId=req(effectId);observationDigest=req(observationDigest);resultingState=Objects.requireNonNull(resultingState);if(itemVersion<1)throw new IllegalArgumentException("itemVersion");externalReceiptRef=norm(externalReceiptRef);evidenceDigest=req(evidenceDigest);recordedAt=Objects.requireNonNull(recordedAt); }
 private static String req(String v){String x=norm(v);if(x==null)throw new IllegalArgumentException("required");return x;} private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
