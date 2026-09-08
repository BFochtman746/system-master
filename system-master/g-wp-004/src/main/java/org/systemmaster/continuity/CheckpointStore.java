package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

final class CheckpointStore {
    private static final Map<Path, ReentrantLock> LOCKS = new ConcurrentHashMap<>();
    private final Path root, payloadDir, journal, quarantine;
    private final ReentrantLock lock;

    CheckpointStore(Path root) {
        try {
            this.root=root.toAbsolutePath().normalize();
            this.payloadDir=this.root.resolve("payloads"); this.journal=this.root.resolve("checkpoint-journal.log");
            this.quarantine=this.root.resolve("checkpoint-quarantine.log");
            Files.createDirectories(payloadDir); if(!Files.exists(journal))Files.createFile(journal); if(!Files.exists(quarantine))Files.createFile(quarantine);
            this.lock=LOCKS.computeIfAbsent(this.root,p->new ReentrantLock());
        } catch(IOException e){throw new StoreException(e);}
    }

    CheckpointPayloadRef putPayload(byte[] bytes,String encryptionRef,String classification,String custodian) {
        Objects.requireNonNull(bytes,"bytes"); String digest=sha256(bytes); Path target=payloadDir.resolve(digest+".bin");
        lock.lock(); try {
            if(!Files.exists(target)) {
                Path tmp=payloadDir.resolve(digest+"."+UUID.randomUUID()+".tmp");
                try(FileChannel ch=FileChannel.open(tmp,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE)){
                    ch.write(ByteBuffer.wrap(bytes)); ch.force(true);
                }
                try { Files.move(tmp,target,StandardCopyOption.ATOMIC_MOVE); }
                catch(AtomicMoveNotSupportedException e){ Files.move(tmp,target); }
                forceDir(payloadDir);
            } else if(!sha256(Files.readAllBytes(target)).equals(digest)) throw new StoreException("existing payload digest mismatch");
            return new CheckpointPayloadRef(digest,target.toString(),bytes.length,encryptionRef,classification,custodian,Instant.now());
        } catch(IOException e){throw new StoreException(e);} finally {lock.unlock();}
    }

    boolean payloadDurableAndValid(CheckpointPayloadRef ref) {
        lock.lock(); try {
            Path p=payloadDir.resolve(ref.contentDigest()+".bin");
            if(!Files.exists(p))return false; byte[] b=Files.readAllBytes(p);
            return b.length==ref.byteLength() && sha256(b).equals(ref.contentDigest());
        } catch(IOException e){throw new StoreException(e);} finally{lock.unlock();}
    }

    String observedPayloadDigest(String digest) {
        lock.lock(); try {Path p=payloadDir.resolve(digest+".bin");return Files.exists(p)?sha256(Files.readAllBytes(p)):null;}
        catch(IOException e){throw new StoreException(e);} finally{lock.unlock();}
    }

    void corruptPayloadForTest(String digest,byte[] bytes){lock.lock();try{Files.write(payloadDir.resolve(digest+".bin"),bytes,StandardOpenOption.TRUNCATE_EXISTING);}
        catch(IOException e){throw new StoreException(e);}finally{lock.unlock();}}

    CommitResult commit(CheckpointManifest manifest) {
        lock.lock(); try {
            Snapshot s=load();
            CheckpointManifest same=s.byWorkSeq.get(key(manifest.workUnitId(),manifest.checkpointSeq()));
            if(same!=null){if(same.manifestDigest().equals(manifest.manifestDigest()))return new CommitResult(same,true);
                throw new CheckpointConflictException("checkpoint sequence already committed with different manifest");}
            CheckpointManifest latest=s.latest.get(manifest.workUnitId());
            if(latest!=null && manifest.checkpointSeq()<=latest.checkpointSeq()) throw new CheckpointConflictException("checkpoint sequence not monotonic");
            appendDurable(journal,encode(manifest));
            return new CommitResult(manifest,false);
        } finally {lock.unlock();}
    }

    Optional<CheckpointManifest> byId(String checkpointId){lock.lock();try{return Optional.ofNullable(load().byId.get(checkpointId));}finally{lock.unlock();}}
    Optional<CheckpointManifest> byWorkSeq(String work,long seq){lock.lock();try{return Optional.ofNullable(load().byWorkSeq.get(key(work,seq)));}finally{lock.unlock();}}
    List<CheckpointManifest> lineage(String work){lock.lock();try{return load().byWork.stream().filter(m->m.workUnitId().equals(work)).sorted(Comparator.comparingLong(CheckpointManifest::checkpointSeq)).toList();}finally{lock.unlock();}}
    Optional<CheckpointManifest> latest(String work){lock.lock();try{return Optional.ofNullable(load().latest.get(work));}finally{lock.unlock();}}

    Optional<CheckpointManifest> currentResumePointer(String work){
        lock.lock();try{Snapshot s=load();CheckpointManifest latest=s.latest.get(work);if(latest==null)return Optional.empty();
            return s.quarantined.contains(latest.checkpointId())?Optional.empty():Optional.of(latest);
        }finally{lock.unlock();}
    }

    void quarantine(String checkpointId, IntegrityFinding finding){
        lock.lock();try{Snapshot s=load();if(s.quarantined.contains(checkpointId))return;appendDurable(quarantine,checkpointId+"|"+finding.integrityFindingId());}finally{lock.unlock();}
    }
    boolean quarantined(String checkpointId){lock.lock();try{return load().quarantined.contains(checkpointId);}finally{lock.unlock();}}

    CleanupResult cleanupOrphans(Duration safetyWindow, Instant now, CheckpointAuthorities.RetentionAuthority retention) {
        Objects.requireNonNull(safetyWindow);Objects.requireNonNull(now);Objects.requireNonNull(retention);
        lock.lock();try{
            Snapshot s=load();Set<String> referenced=s.byId.values().stream().map(CheckpointManifest::payloadDigest).collect(java.util.stream.Collectors.toSet());
            int deleted=0,held=0,young=0; List<String> removed=new ArrayList<>();
            try(DirectoryStream<Path> ds=Files.newDirectoryStream(payloadDir,"*.bin")){
                for(Path p:ds){String name=p.getFileName().toString();String digest=name.substring(0,name.length()-4);if(referenced.contains(digest))continue;
                    Instant m=Files.getLastModifiedTime(p).toInstant();if(Duration.between(m,now).compareTo(safetyWindow)<0){young++;continue;}
                    var d=retention.disposition(digest,null);if(d!=CheckpointAuthorities.RetentionDisposition.DELETE_ELIGIBLE){held++;continue;}
                    Files.deleteIfExists(p);deleted++;removed.add(digest);
                }
            } catch(IOException e){throw new StoreException(e);}
            return new CleanupResult(deleted,held,young,List.copyOf(removed));
        }finally{lock.unlock();}
    }

    int payloadCount(){try(DirectoryStream<Path> ds=Files.newDirectoryStream(payloadDir,"*.bin")){int n=0;for(Path ignored:ds)n++;return n;}catch(IOException e){throw new StoreException(e);}}
    boolean payloadExists(String digest){return Files.exists(payloadDir.resolve(digest+".bin"));}
    void agePayloadForTest(String digest,Instant when){try{Files.setLastModifiedTime(payloadDir.resolve(digest+".bin"),FileTime.from(when));}catch(IOException e){throw new StoreException(e);}}
    Path journalPath(){return journal;}

    private Snapshot load(){
        try{
            Map<String,CheckpointManifest> byId=new LinkedHashMap<>(), byWorkSeq=new HashMap<>(), latest=new HashMap<>(); List<CheckpointManifest> all=new ArrayList<>();
            for(String line:Files.readAllLines(journal,StandardCharsets.UTF_8)){if(line.isBlank())continue;CheckpointManifest m=decode(line);byId.put(m.checkpointId(),m);byWorkSeq.put(key(m.workUnitId(),m.checkpointSeq()),m);all.add(m);CheckpointManifest cur=latest.get(m.workUnitId());if(cur==null||m.checkpointSeq()>cur.checkpointSeq())latest.put(m.workUnitId(),m);}
            Set<String> q=new HashSet<>();for(String line:Files.readAllLines(quarantine,StandardCharsets.UTF_8)){if(!line.isBlank())q.add(line.split("\\|",2)[0]);}
            return new Snapshot(byId,byWorkSeq,all,latest,q);
        }catch(IOException e){throw new StoreException(e);}
    }
    private static String key(String w,long s){return w+"#"+s;}
    private static void appendDurable(Path file,String payload){
        byte[] body=(payload+"\n").getBytes(StandardCharsets.UTF_8);try(FileChannel ch=FileChannel.open(file,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){ch.write(ByteBuffer.wrap(body));ch.force(true);}catch(IOException e){throw new StoreException(e);}
    }
    private static String encode(CheckpointManifest m){
        String raw=String.join("\u001f",List.of(m.checkpointId(),m.workUnitId(),Long.toString(m.checkpointSeq()),m.checkpointKind(),m.semanticBoundaryId(),m.payloadRef(),m.payloadDigest(),m.schemaVersion(),m.runtimeContractVersion(),Long.toString(m.decisionHistoryWatermark()),Long.toString(m.externalEffectWatermark()),m.sourceAttemptId(),Long.toString(m.sourceFenceEpoch()),m.createdAt().toString(),String.join("\u001e",m.compatibilityRequirements()),m.parentCheckpointRef()==null?"":m.parentCheckpointRef(),m.manifestDigest()));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }
    private static CheckpointManifest decode(String line){try{String raw=new String(Base64.getUrlDecoder().decode(line),StandardCharsets.UTF_8);String[] p=raw.split("\u001f",-1);if(p.length!=17)throw new IllegalStateException("checkpoint journal frame corrupt");return new CheckpointManifest(p[0],p[1],Long.parseLong(p[2]),p[3],p[4],p[5],p[6],p[7],p[8],Long.parseLong(p[9]),Long.parseLong(p[10]),p[11],Long.parseLong(p[12]),Instant.parse(p[13]),p[14].isEmpty()?List.of():List.of(p[14].split("\u001e",-1)),p[15].isEmpty()?null:p[15],p[16]);}catch(RuntimeException e){throw new StoreException("checkpoint journal corrupt",e);}}
    static String sha256(byte[] bytes){try{byte[] d=MessageDigest.getInstance("SHA-256").digest(bytes);StringBuilder s=new StringBuilder();for(byte b:d)s.append(String.format("%02x",b));return s.toString();}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static String sha256(String s){return sha256(s.getBytes(StandardCharsets.UTF_8));}
    private static void forceDir(Path dir){try(FileChannel ch=FileChannel.open(dir,StandardOpenOption.READ)){ch.force(true);}catch(Exception ignored){}}

    record Snapshot(Map<String,CheckpointManifest> byId,Map<String,CheckpointManifest> byWorkSeq,List<CheckpointManifest> byWork,Map<String,CheckpointManifest> latest,Set<String> quarantined){}
    record CommitResult(CheckpointManifest manifest,boolean idempotentExisting){}
    record CleanupResult(int deleted,int held,int tooYoung,List<String> deletedDigests){}
    static final class CheckpointConflictException extends RuntimeException{CheckpointConflictException(String m){super(m);}}
    static final class StoreException extends RuntimeException{StoreException(String m){super(m);}StoreException(Throwable e){super(e);}StoreException(String m,Throwable e){super(m,e);}}
}
