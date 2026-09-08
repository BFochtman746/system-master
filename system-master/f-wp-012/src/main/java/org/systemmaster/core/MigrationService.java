package org.systemmaster.core;

import java.util.*;

public final class MigrationService {
    public record LegacyRecord(String legacyAuthority,String legacyId,String contentDigest,String payloadRef) {
        public LegacyRecord { LegacyCrosswalkService.req(legacyAuthority,"legacyAuthority");LegacyCrosswalkService.req(legacyId,"legacyId");ContractRegistry.digest(contentDigest,"contentDigest");LegacyCrosswalkService.req(payloadRef,"payloadRef"); }
    }
    public record ImportedRecord(String canonicalChangeId,String sourceAuthority,String sourceId,String contentDigest,String payloadRef) {}
    public record MigrationCheckpoint(int nextIndex,Map<String,String> migratedDigestByLegacyKey,String inputSetDigest) {
        public MigrationCheckpoint { if(nextIndex<0)throw new IllegalArgumentException("nextIndex");migratedDigestByLegacyKey=Map.copyOf(Objects.requireNonNull(migratedDigestByLegacyKey));ContractRegistry.digest(inputSetDigest,"inputSetDigest"); }
    }
    public record ReconciliationReport(int imported,int replayed,int quarantined,int remaining,List<String> issues,String reportDigest) { public ReconciliationReport { issues=List.copyOf(issues);ContractRegistry.digest(reportDigest,"reportDigest"); } }
    public record Result(MigrationCheckpoint checkpoint,List<ImportedRecord> imported,ReconciliationReport report,boolean complete) { public Result { imported=List.copyOf(imported); } }
    private final LegacyCrosswalkService crosswalk; private final Map<String,ImportedRecord> store=new LinkedHashMap<>();
    public MigrationService(LegacyCrosswalkService crosswalk){this.crosswalk=Objects.requireNonNull(crosswalk);}

    public synchronized Result migrate(List<LegacyRecord> input,MigrationCheckpoint checkpoint,int maxRecords){
        input=List.copyOf(Objects.requireNonNull(input)); if(maxRecords<1)throw new IllegalArgumentException("maxRecords"); String setDigest=inputSetDigest(input);
        int start=0; Map<String,String> done=new LinkedHashMap<>(); if(checkpoint!=null){if(!setDigest.equals(checkpoint.inputSetDigest()))throw new IllegalStateException("input_set_digest_mismatch");start=checkpoint.nextIndex();done.putAll(checkpoint.migratedDigestByLegacyKey());if(start>input.size())throw new IllegalArgumentException("checkpoint_range");}
        List<ImportedRecord> newly=new ArrayList<>(); List<String> issues=new ArrayList<>(); int replayed=0,quarantined=0,processed=0,i=start;
        for(;i<input.size()&&processed<maxRecords;i++,processed++){
            LegacyRecord r=input.get(i);String key=r.legacyAuthority()+"|"+r.legacyId();String old=done.get(key);
            if(old!=null){if(!old.equals(r.contentDigest()))throw new IllegalStateException("same_legacy_identity_different_digest");replayed++;continue;}
            var b=crosswalk.get(r.legacyAuthority(),r.legacyId()); if(!crosswalk.mayImport(b)){quarantined++;issues.add(key+":"+(b==null?"NO_CROSSWALK":b.standing()));continue;}
            ImportedRecord prior=store.get(key); if(prior!=null){if(!prior.contentDigest().equals(r.contentDigest()))throw new IllegalStateException("existing_import_digest_conflict");done.put(key,r.contentDigest());replayed++;continue;}
            ImportedRecord x=new ImportedRecord(b.canonicalChangeId(),r.legacyAuthority(),r.legacyId(),r.contentDigest(),r.payloadRef());store.put(key,x);done.put(key,r.contentDigest());newly.add(x);
        }
        MigrationCheckpoint cp=new MigrationCheckpoint(i,done,setDigest); boolean complete=i==input.size();int remaining=input.size()-i;String body=newly.size()+"|"+replayed+"|"+quarantined+"|"+remaining+"|"+String.join(",",issues)+"|"+cp.nextIndex()+"|"+cp.inputSetDigest();
        ReconciliationReport report=new ReconciliationReport(newly.size(),replayed,quarantined,remaining,issues,ContractRegistry.sha256(body)); return new Result(cp,newly,report,complete);
    }
    public synchronized int importedCount(){return store.size();}
    static String inputSetDigest(List<LegacyRecord> in){List<String> rows=new ArrayList<>();for(var r:in)rows.add(r.legacyAuthority()+"|"+r.legacyId()+"|"+r.contentDigest()+"|"+r.payloadRef());return ContractRegistry.sha256(String.join("\n",rows));}
}
