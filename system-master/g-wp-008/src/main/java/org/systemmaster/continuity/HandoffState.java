package org.systemmaster.continuity;
import java.util.List;
public record HandoffState(HandoffRecord current,List<String> unresolvedObligations,HandoffRecord.AdoptionState adoptionState,Freshness freshness){
 public HandoffState{unresolvedObligations=List.copyOf(unresolvedObligations==null?List.of():unresolvedObligations);if(adoptionState==null)adoptionState=HandoffRecord.AdoptionState.BLOCKED;if(freshness==null)freshness=Freshness.UNKNOWN;}
 public enum Freshness{CURRENT,STALE,UNAVAILABLE,UNKNOWN}
}
