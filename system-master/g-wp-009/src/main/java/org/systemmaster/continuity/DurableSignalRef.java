package org.systemmaster.continuity;

import java.time.Instant;
import java.util.Objects;

public record DurableSignalRef(
        String signalId,
        String workUnitId,
        Kind kind,
        String payloadDigest,
        long sourceSequence,
        DeliveryState deliveryState,
        String boundAttemptId,
        Long boundFenceEpoch,
        String consumptionReceiptDigest,
        Instant recordedAt,
        Instant consumedAt,
        long version) {
    public DurableSignalRef {
        signalId=req(signalId,"signalId"); workUnitId=req(workUnitId,"workUnitId"); kind=Objects.requireNonNull(kind,"kind");
        payloadDigest=req(payloadDigest,"payloadDigest"); if(sourceSequence<0)throw new IllegalArgumentException("sourceSequence");
        deliveryState=Objects.requireNonNull(deliveryState,"deliveryState"); boundAttemptId=norm(boundAttemptId); consumptionReceiptDigest=norm(consumptionReceiptDigest);
        if(boundFenceEpoch!=null && boundFenceEpoch<1)throw new IllegalArgumentException("boundFenceEpoch");
        recordedAt=Objects.requireNonNull(recordedAt,"recordedAt");
        if(deliveryState==DeliveryState.CONSUMED && (boundAttemptId==null||boundFenceEpoch==null||consumptionReceiptDigest==null||consumedAt==null)) throw new IllegalArgumentException("consumed binding incomplete");
        if(version<1)throw new IllegalArgumentException("version");
    }
    public enum Kind { CANCEL, PAUSE, TIMER, SIGNAL, WAIT }
    public enum DeliveryState { PENDING, CONSUMED }
    private static String req(String v,String n){String x=norm(v);if(x==null)throw new IllegalArgumentException(n+" required");return x;}
    private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
