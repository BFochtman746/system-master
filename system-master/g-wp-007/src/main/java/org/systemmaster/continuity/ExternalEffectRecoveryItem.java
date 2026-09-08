package org.systemmaster.continuity;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public record ExternalEffectRecoveryItem(
        String effectId,
        String workUnitId,
        String operationDigest,
        String idempotencyKey,
        String providerRef,
        State state,
        String externalReceiptRef,
        Instant lastQueryAt,
        ReconciliationPolicy reconciliationPolicy,
        List<String> evidenceRefs,
        long version) {
    public ExternalEffectRecoveryItem {
        effectId=req(effectId,"effectId"); workUnitId=req(workUnitId,"workUnitId");
        operationDigest=req(operationDigest,"operationDigest"); idempotencyKey=norm(idempotencyKey);
        providerRef=req(providerRef,"providerRef"); state=Objects.requireNonNull(state,"state");
        externalReceiptRef=norm(externalReceiptRef); reconciliationPolicy=Objects.requireNonNull(reconciliationPolicy,"reconciliationPolicy");
        evidenceRefs=List.copyOf(evidenceRefs==null?List.of():evidenceRefs); if(version<1)throw new IllegalArgumentException("version");
        if(idempotencyKey==null && reconciliationPolicy!=ReconciliationPolicy.QUERYABLE)
            throw new IllegalArgumentException("idempotency key or queryable reconciliation required");
        if(state==State.CONFIRMED_APPLIED && externalReceiptRef==null)
            throw new IllegalArgumentException("confirmed applied requires receipt");
    }
    public boolean blocksReplay(){return state==State.PENDING||state==State.UNKNOWN||state==State.DIVERGED;}
    public enum State { PENDING, UNKNOWN, DIVERGED, CONFIRMED_APPLIED, CONFIRMED_NOT_APPLIED }
    public enum ReconciliationPolicy { IDEMPOTENT_KEY, QUERYABLE, RECEIPT_REQUIRED }
    private static String req(String v,String n){String x=norm(v);if(x==null)throw new IllegalArgumentException(n+" required");return x;}
    private static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
