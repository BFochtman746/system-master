package org.systemmaster.continuity;
import java.time.Instant; import java.util.*;
public record RecordedDecision(String workUnitId,long decisionSeq,String decisionType,String inputDigest,String result,Instant logicalTime,String providerOrToolRef,List<String> evidenceRefs,String resultDigest){
 public RecordedDecision{workUnitId=req(workUnitId,"workUnitId");if(decisionSeq<1)throw new IllegalArgumentException("decisionSeq");decisionType=req(decisionType,"decisionType");inputDigest=req(inputDigest,"inputDigest");result=req(result,"result");logicalTime=Objects.requireNonNull(logicalTime);providerOrToolRef=norm(providerOrToolRef);evidenceRefs=List.copyOf(evidenceRefs==null?List.of():evidenceRefs);resultDigest=req(resultDigest,"resultDigest");}
 static String req(String v,String n){String x=norm(v);if(x==null)throw new IllegalArgumentException(n);return x;} static String norm(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
