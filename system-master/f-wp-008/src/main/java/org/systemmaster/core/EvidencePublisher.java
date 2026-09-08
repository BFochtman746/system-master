package org.systemmaster.core;

import java.util.*;
import static org.systemmaster.core.VerificationEvidenceContracts.*;

public final class EvidencePublisher {
    private final Map<String,EvidenceRef> evidence = new LinkedHashMap<>();
    private final Map<String,ChangeStepReceipt> receipts = new LinkedHashMap<>();

    public EvidenceRef register(EvidenceSubmission s){
        Objects.requireNonNull(s,"submission");
        if(s.rawPayload()!=null&&!s.rawPayload().isBlank()) throw new SecurityException("RAW_EVIDENCE_PAYLOAD_PROHIBITED");
        if(s.contentRef().contains("\n")||s.contentRef().contains("\r")) throw new SecurityException("INVALID_EVIDENCE_REFERENCE");
        EvidenceRef ref=new EvidenceRef(s.evidenceId(),s.evidenceClass(),s.sourceAuthority(),s.subjectDigest(),s.observedAt(),s.expiresAt(),s.standing(),s.coverageDigest(),s.contentRef(),s.dataClass(),null);
        EvidenceRef prior=evidence.putIfAbsent(ref.evidenceId(),ref);
        if(prior!=null&&!prior.equals(ref)) throw new IllegalStateException("EVIDENCE_ID_CONFLICT");
        return prior==null?ref:prior;
    }

    public ChangeStepReceipt recordStepReceipt(ChangeStepReceipt receipt){
        Objects.requireNonNull(receipt,"receipt");
        for(String id:receipt.evidenceIds()) if(!evidence.containsKey(id)) throw new IllegalStateException("STEP_EVIDENCE_REF_MISSING:"+id);
        ChangeStepReceipt prior=receipts.putIfAbsent(receipt.identity(),receipt);
        if(prior!=null&&!prior.receiptDigest().equals(receipt.receiptDigest())) throw new IllegalStateException("STEP_RECEIPT_CONFLICT");
        return prior==null?receipt:prior;
    }
    public Optional<ChangeStepReceipt> receipt(String changeId,long revision,long epoch,String stepId){return Optional.ofNullable(receipts.get(changeId+"|"+revision+"|"+epoch+"|"+stepId));}
    public Optional<EvidenceRef> evidence(String id){return Optional.ofNullable(evidence.get(id));}
}
