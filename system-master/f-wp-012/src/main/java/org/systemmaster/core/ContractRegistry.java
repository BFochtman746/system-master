package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class ContractRegistry {
    public enum Standing { COMPATIBLE, MIGRATION_REQUIRED, UNSUPPORTED }
    public record ContractVersion(String contract, int major, int minor, String schemaDigest, String migrationId) {
        public ContractVersion {
            req(contract,"contract"); if (major<1||minor<0) throw new IllegalArgumentException("version"); digest(schemaDigest,"schemaDigest");
            if (migrationId != null && migrationId.isBlank()) throw new IllegalArgumentException("migrationId");
        }
        public String id(){ return contract+"@"+major+"."+minor; }
    }
    public record Compatibility(Standing standing, String currentVersion, String requestedVersion, String migrationId) {}
    private final Map<String,NavigableMap<Integer,NavigableMap<Integer,ContractVersion>>> versions = new HashMap<>();

    public synchronized void register(ContractVersion v){
        var majors=versions.computeIfAbsent(v.contract(),k->new TreeMap<>()); var minors=majors.computeIfAbsent(v.major(),k->new TreeMap<>());
        ContractVersion old=minors.putIfAbsent(v.minor(),v); if(old!=null&&!old.equals(v)) throw new IllegalStateException("version_identity_conflict");
        if(old!=null) return;
        if(v.major()>1 && v.migrationId()==null) throw new IllegalArgumentException("breaking_major_requires_migration");
    }
    public synchronized ContractVersion current(String contract){
        var majors=versions.get(contract); if(majors==null||majors.isEmpty()) throw new NoSuchElementException("unknown_contract");
        return majors.lastEntry().getValue().lastEntry().getValue();
    }
    public synchronized Compatibility compatibility(String contract,int requestedMajor,int requestedMinor){
        if(requestedMajor<1||requestedMinor<0) throw new IllegalArgumentException("requested_version");
        var majors=versions.get(contract); if(majors==null||majors.isEmpty()) return new Compatibility(Standing.UNSUPPORTED,null,contract+"@"+requestedMajor+"."+requestedMinor,null);
        ContractVersion cur=current(contract); var requested=majors.get(requestedMajor); String reqId=contract+"@"+requestedMajor+"."+requestedMinor;
        if(requested==null||!requested.containsKey(requestedMinor)) return new Compatibility(Standing.UNSUPPORTED,cur.id(),reqId,null);
        if(requestedMajor==cur.major()) return new Compatibility(Standing.COMPATIBLE,cur.id(),reqId,null);
        return new Compatibility(Standing.MIGRATION_REQUIRED,cur.id(),reqId,cur.migrationId());
    }
    public synchronized String registryDigest(){
        List<String> rows=new ArrayList<>(); versions.values().forEach(ms->ms.values().forEach(ns->ns.values().forEach(v->rows.add(v.id()+"|"+v.schemaDigest()+"|"+String.valueOf(v.migrationId())))));
        Collections.sort(rows); return sha256(String.join("\n",rows));
    }
    static void req(String v,String n){if(v==null||v.isBlank())throw new IllegalArgumentException(n);} static void digest(String v,String n){req(v,n);if(!v.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(n+"_sha256");}
    static String sha256(String v){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
