package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.Base64;

public final class CompatibilityResolver {
    private final Path journal; private final CompatibilityAuthority authority;
    private static final Base64.Encoder E=Base64.getUrlEncoder().withoutPadding(); private static final Base64.Decoder D=Base64.getUrlDecoder();
    public CompatibilityResolver(Path dir,CompatibilityAuthority authority){try{Files.createDirectories(dir);journal=dir.resolve("gwp010-migration.journal");if(!Files.exists(journal))Files.createFile(journal);}catch(IOException e){throw new IllegalStateException(e);}this.authority=Objects.requireNonNull(authority);snapshot();}

    public CompatibilityAssessment assessRecoveryCompatibility(CheckpointManifest cp,TargetIdentity target,Instant now){
        Objects.requireNonNull(cp);Objects.requireNonNull(target);Objects.requireNonNull(now);
        String sourceId=sha(String.join("|",cp.manifestDigest(),cp.schemaVersion(),cp.runtimeContractVersion(),String.join(",",cp.compatibilityRequirements())));
        String targetId=target.identityDigest(); List<String> reasons=new ArrayList<>(); CompatibilityAssessment.Standing standing; String oldRuntime=null,migration=null;
        if(target.unknownCritical()){standing=CompatibilityAssessment.Standing.MANUAL;reasons.add("UNKNOWN_CRITICAL_COMPATIBILITY");}
        else if(cp.schemaVersion().equals(target.schemaVersion())&&cp.runtimeContractVersion().equals(target.runtimeContractVersion())&&target.satisfies(cp.compatibilityRequirements())){standing=CompatibilityAssessment.Standing.COMPATIBLE;reasons.add("EXACT_OR_DECLARED_COMPATIBLE");}
        else {CompatibilityDecision d=authority.resolve(cp,target);if(d==null||d.standing()==null){standing=CompatibilityAssessment.Standing.MANUAL;reasons.add("NO_EXPLICIT_COMPATIBILITY_DECISION");}else{standing=d.standing();oldRuntime=d.approvedRuntimeRef();migration=d.migrationContractVersion();reasons.addAll(d.reasons());}}
        String dg=sha(cp.checkpointId()+"|"+sourceId+"|"+targetId+"|"+standing+"|"+String.join(",",reasons)+"|"+n(oldRuntime)+"|"+n(migration));
        return new CompatibilityAssessment(cp.checkpointId(),sourceId,targetId,standing,reasons,oldRuntime,migration,now,dg);
    }

    public boolean currentEnvironmentAllowedForNewDecision(CompatibilityAssessment a,boolean historicalReplayComplete){
        Objects.requireNonNull(a); if(!historicalReplayComplete)return false;
        return a.standing()==CompatibilityAssessment.Standing.COMPATIBLE||a.standing()==CompatibilityAssessment.Standing.MIGRATION_REQUIRED;
    }

    public MigrationCheckpoint migrateCheckpoint(CheckpointManifest source,String migrationContractVersion,String targetVersion,long cursor,String chunkDigest,boolean complete,boolean writerAuthorized,Instant now){
        Objects.requireNonNull(source);String contract=req(migrationContractVersion),target=req(targetVersion),chunk=req(chunkDigest);if(cursor<1)throw new IllegalArgumentException("cursor");Objects.requireNonNull(now);
        if(!writerAuthorized)throw new UnauthorizedMigrationException("target writer not authorized");if(!authority.migrationApproved(source,contract,target))throw new IncompatibleMigrationException("migration path not approved");
        String id="migration-"+sha(source.checkpointId()+"|"+contract).substring(0,24);
        return transact(s->{MigrationCheckpoint old=s.byId.get(id);if(old!=null&&old.state()==MigrationCheckpoint.State.COMPLETED)return new Decision<>(old,null);
            if(old!=null&&cursor<old.cursor())throw new MigrationConflictException("cursor regression");
            if(old!=null&&cursor==old.cursor()){
                if(!Objects.equals(old.lastChunkDigest(),chunk))throw new MigrationConflictException("same cursor different content");
                return new Decision<>(old,null);
            }
            String prev=old==null?source.payloadDigest():old.accumulatedDigest();String accum=sha(prev+"|"+cursor+"|"+chunk);
            long version=old==null?1:old.version()+1;MigrationCheckpoint.State state=complete?MigrationCheckpoint.State.COMPLETED:MigrationCheckpoint.State.IN_PROGRESS;
            String targetId=complete?"checkpoint-migrated-"+sha(source.checkpointId()+"|"+contract+"|"+target+"|"+accum).substring(0,24):null;
            MigrationCheckpoint next=new MigrationCheckpoint(id,source.checkpointId(),contract,target,cursor,accum,chunk,state,targetId,complete?accum:null,now,version);
            return new Decision<>(next,frame(next));});
    }

    public MigrationCheckpoint getMigration(String migrationId){return snapshot().byId.get(req(migrationId));}
    Path journalPath(){return journal;}

    private Snapshot snapshot(){return locked((c,s)->s);}private <T>T transact(Tx<T>tx){return locked((c,s)->{Decision<T>d=tx.apply(s);if(d.line()!=null)append(c,d.line());return d.value();});}
    private <T>T locked(Locked<T> f){try(FileChannel ch=FileChannel.open(journal,StandardOpenOption.READ,StandardOpenOption.WRITE);FileLock ignored=ch.lock()){return f.apply(ch,replay(ch));}catch(IOException e){throw new IllegalStateException(e);}}
    private Snapshot replay(FileChannel ch)throws IOException{Map<String,MigrationCheckpoint>m=new HashMap<>();long z=ch.size();if(z>Integer.MAX_VALUE)throw new IntegrityException("large");ByteBuffer b=ByteBuffer.allocate((int)z);ch.position(0);while(b.hasRemaining()&&ch.read(b)>=0){}b.flip();for(String line:StandardCharsets.UTF_8.decode(b).toString().split("\\R",-1)){if(line.isBlank())continue;int p=line.lastIndexOf('\t');if(p<1)throw new IntegrityException("truncated");String body=line.substring(0,p);if(!sha(body).equals(line.substring(p+1)))throw new IntegrityException("checksum");MigrationCheckpoint q=decode(body.split("\\|",-1));MigrationCheckpoint old=m.get(q.migrationId());if(old==null||q.version()>=old.version())m.put(q.migrationId(),q);}return new Snapshot(Map.copyOf(m));}
    private static void append(FileChannel ch,String body)throws IOException{ByteBuffer b=StandardCharsets.UTF_8.encode(body+'\t'+sha(body)+'\n');ch.position(ch.size());while(b.hasRemaining())ch.write(b);ch.force(true);}
    private static String frame(MigrationCheckpoint m){return String.join("|","M",enc(m.migrationId()),enc(m.sourceCheckpointId()),enc(m.migrationContractVersion()),enc(m.targetVersion()),Long.toString(m.cursor()),enc(m.accumulatedDigest()),encN(m.lastChunkDigest()),m.state().name(),encN(m.targetCheckpointId()),encN(m.targetPayloadDigest()),m.updatedAt().toString(),Long.toString(m.version()));}
    private static MigrationCheckpoint decode(String[]v){if(v.length!=13||!v[0].equals("M"))throw new IntegrityException("frame");return new MigrationCheckpoint(dec(v[1]),dec(v[2]),dec(v[3]),dec(v[4]),Long.parseLong(v[5]),dec(v[6]),decN(v[7]),MigrationCheckpoint.State.valueOf(v[8]),decN(v[9]),decN(v[10]),Instant.parse(v[11]),Long.parseLong(v[12]));}
    static String sha(String s){try{byte[]x=MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte q:x)b.append(String.format("%02x",q));return b.toString();}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static String req(String v){if(v==null||v.trim().isEmpty())throw new IllegalArgumentException("required");return v.trim();}private static String n(String v){return v==null?"":v;}private static String enc(String s){return E.encodeToString(s.getBytes(StandardCharsets.UTF_8));}private static String dec(String s){return new String(D.decode(s),StandardCharsets.UTF_8);}private static String encN(String s){return s==null?"":enc(s);}private static String decN(String s){return s.isEmpty()?null:dec(s);}

    public record TargetIdentity(String identityDigest,String runtimeContractVersion,String schemaVersion,List<String>capabilities,boolean unknownCritical){public TargetIdentity{identityDigest=req(identityDigest);runtimeContractVersion=req(runtimeContractVersion);schemaVersion=req(schemaVersion);capabilities=List.copyOf(capabilities==null?List.of():capabilities);}boolean satisfies(List<String> reqs){return capabilities.containsAll(reqs);}}
    public record CompatibilityDecision(CompatibilityAssessment.Standing standing,List<String>reasons,String approvedRuntimeRef,String migrationContractVersion){public CompatibilityDecision{reasons=List.copyOf(reasons==null?List.of():reasons);}}
    public interface CompatibilityAuthority{CompatibilityDecision resolve(CheckpointManifest source,TargetIdentity target);boolean migrationApproved(CheckpointManifest source,String migrationContractVersion,String targetVersion);}
    private record Snapshot(Map<String,MigrationCheckpoint>byId){}private record Decision<T>(T value,String line){}private interface Tx<T>{Decision<T>apply(Snapshot s);}private interface Locked<T>{T apply(FileChannel ch,Snapshot s)throws IOException;}
    public static final class IntegrityException extends RuntimeException{IntegrityException(String m){super(m);}}public static final class UnauthorizedMigrationException extends RuntimeException{UnauthorizedMigrationException(String m){super(m);}}public static final class IncompatibleMigrationException extends RuntimeException{IncompatibleMigrationException(String m){super(m);}}public static final class MigrationConflictException extends RuntimeException{MigrationConflictException(String m){super(m);}}
}
