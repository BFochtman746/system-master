package org.systemmaster.core;

import java.util.*;

public final class LegacyCrosswalkService {
    public enum Standing { MAPPED, QUARANTINED_AMBIGUOUS, UNMAPPED }
    public record LegacyBinding(String legacyAuthority,String legacyId,String canonicalChangeId,Standing standing,List<String> candidates,String semanticOwner) {
        public LegacyBinding { req(legacyAuthority,"legacyAuthority");req(legacyId,"legacyId");standing=Objects.requireNonNull(standing);candidates=List.copyOf(Objects.requireNonNull(candidates));if(!"021F".equals(semanticOwner))throw new IllegalArgumentException("semantic_owner_must_remain_021F");if(standing==Standing.MAPPED)req(canonicalChangeId,"canonicalChangeId");if(standing==Standing.QUARANTINED_AMBIGUOUS&&candidates.size()<2)throw new IllegalArgumentException("ambiguous_candidates"); }
    }
    private final Map<String,LegacyBinding> bindings=new HashMap<>();
    public synchronized LegacyBinding bind(String authority,String legacyId,List<String> candidates){
        req(authority,"authority");req(legacyId,"legacyId");List<String> c=List.copyOf(new LinkedHashSet<>(Objects.requireNonNull(candidates)));
        LegacyBinding b=c.size()==1?new LegacyBinding(authority,legacyId,c.get(0),Standing.MAPPED,c,"021F"):
                c.size()>1?new LegacyBinding(authority,legacyId,null,Standing.QUARANTINED_AMBIGUOUS,c,"021F"):
                        new LegacyBinding(authority,legacyId,null,Standing.UNMAPPED,c,"021F");
        String key=authority+"|"+legacyId; LegacyBinding prior=bindings.putIfAbsent(key,b); if(prior!=null&&!prior.equals(b))throw new IllegalStateException("crosswalk_conflict"); return prior==null?b:prior;
    }
    public synchronized LegacyBinding get(String authority,String id){return bindings.get(authority+"|"+id);} public synchronized boolean mayImport(LegacyBinding b){return b!=null&&b.standing()==Standing.MAPPED&&"021F".equals(b.semanticOwner());}
    static void req(String v,String n){if(v==null||v.isBlank())throw new IllegalArgumentException(n);}
}
