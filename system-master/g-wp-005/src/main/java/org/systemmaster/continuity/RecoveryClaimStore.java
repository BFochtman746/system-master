package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

final class RecoveryClaimStore {
    private static final Map<Path, ReentrantLock> JVM_LOCKS=new ConcurrentHashMap<>();
    private final Path root,journal,lockFile;
    private final ReentrantLock jvmLock;

    RecoveryClaimStore(Path root){
        try{
            this.root=root.toAbsolutePath().normalize(); Files.createDirectories(this.root);
            journal=this.root.resolve("recovery-claims.log"); lockFile=this.root.resolve("recovery-claims.lock");
            if(!Files.exists(journal))Files.createFile(journal); if(!Files.exists(lockFile))Files.createFile(lockFile);
            jvmLock=JVM_LOCKS.computeIfAbsent(this.root,p->new ReentrantLock());
        }catch(IOException e){throw new StoreException(e);}
    }

    <T> T transact(DecisionFunction<T> fn){
        jvmLock.lock();
        try(FileChannel lockChannel=FileChannel.open(lockFile,StandardOpenOption.WRITE); FileLock ignored=lockChannel.lock()){
            Snapshot s=load(); Decision<T> d=fn.apply(s);
            if(d.frame()!=null)append(d.frame());
            return d.result();
        }catch(IOException e){throw new StoreException(e);}finally{jvmLock.unlock();}
    }

    Snapshot snapshot(){
        jvmLock.lock();
        try(FileChannel lockChannel=FileChannel.open(lockFile,StandardOpenOption.WRITE); FileLock ignored=lockChannel.lock()){
            return load();
        }catch(IOException e){throw new StoreException(e);}finally{jvmLock.unlock();}
    }

    private Snapshot load(){
        try{
            Map<String,RecoveryClaim> byId=new LinkedHashMap<>(); Map<String,String> currentByRecovery=new HashMap<>();
            Map<String,Receipt> receipts=new HashMap<>(); Map<String,Long> maxClaimEpoch=new HashMap<>(),maxFenceEpoch=new HashMap<>();
            for(String line:Files.readAllLines(journal,StandardCharsets.UTF_8)){
                if(line.isBlank())continue; int cut=line.lastIndexOf('|'); if(cut<1)throw new StoreException("corrupt claim journal");
                String payload=line.substring(0,cut),checksum=line.substring(cut+1); if(!sha256(payload).equals(checksum))throw new StoreException("claim journal checksum mismatch");
                String[] p=payload.split("\\|",-1); if(p.length<2)throw new StoreException("corrupt claim frame");
                switch(p[0]){
                    case "C" -> {
                        if(p.length!=14)throw new StoreException("bad claim frame");
                        RecoveryClaim c=new RecoveryClaim(p[1],p[2],p[3],Long.parseLong(p[4]),p[5],Instant.parse(p[6]),Long.parseLong(p[7]),Instant.parse(p[8]),Instant.parse(p[9]),blankInstant(p[10]),Long.parseLong(p[11]));
                        byId.put(c.recoveryClaimId(),c); currentByRecovery.put(c.recoveryId(),c.recoveryClaimId());
                        maxClaimEpoch.merge(c.recoveryId(),c.claimEpoch(),Math::max); maxFenceEpoch.merge(c.workUnitId(),c.fenceEpoch(),Math::max);
                        receipts.put(p[12],new Receipt(p[13],c.recoveryClaimId(),"CLAIM"));
                    }
                    case "N" -> {
                        if(p.length!=8)throw new StoreException("bad renewal frame");
                        RecoveryClaim old=must(byId,p[1]); RecoveryClaim c=new RecoveryClaim(old.recoveryClaimId(),old.recoveryId(),old.workUnitId(),old.claimEpoch(),old.claimantExecutorRef(),Instant.parse(p[2]),old.fenceEpoch(),old.claimedAt(),Instant.parse(p[3]),old.releasedAt(),Long.parseLong(p[4]));
                        byId.put(c.recoveryClaimId(),c); receipts.put(p[5],new Receipt(p[6],c.recoveryClaimId(),"RENEW:"+p[7]));
                    }
                    case "R" -> {
                        if(p.length!=8)throw new StoreException("bad release frame");
                        RecoveryClaim old=must(byId,p[1]); RecoveryClaim c=new RecoveryClaim(old.recoveryClaimId(),old.recoveryId(),old.workUnitId(),old.claimEpoch(),old.claimantExecutorRef(),old.leaseUntil(),old.fenceEpoch(),old.claimedAt(),old.renewedAt(),Instant.parse(p[2]),Long.parseLong(p[3]));
                        byId.put(c.recoveryClaimId(),c); if(Objects.equals(currentByRecovery.get(c.recoveryId()),c.recoveryClaimId()))currentByRecovery.remove(c.recoveryId()); receipts.put(p[4],new Receipt(p[5],c.recoveryClaimId(),"RELEASE:"+p[6]+":"+p[7]));
                    }
                    default -> throw new StoreException("unknown claim frame");
                }
            }
            return new Snapshot(Map.copyOf(byId),Map.copyOf(currentByRecovery),Map.copyOf(receipts),Map.copyOf(maxClaimEpoch),Map.copyOf(maxFenceEpoch));
        }catch(IOException|RuntimeException e){if(e instanceof StoreException se)throw se;throw new StoreException(e);}
    }
    private static RecoveryClaim must(Map<String,RecoveryClaim> m,String id){RecoveryClaim c=m.get(id);if(c==null)throw new StoreException("journal references missing claim");return c;}
    private void append(String payload){
        byte[] b=(payload+"|"+sha256(payload)+"\n").getBytes(StandardCharsets.UTF_8);
        try(FileChannel ch=FileChannel.open(journal,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){ch.write(ByteBuffer.wrap(b));ch.force(true);}catch(IOException e){throw new StoreException(e);}
    }
    static String claimFrame(RecoveryClaim c,String requestId,String requestDigest){return String.join("|","C",c.recoveryClaimId(),c.recoveryId(),c.workUnitId(),Long.toString(c.claimEpoch()),c.claimantExecutorRef(),c.leaseUntil().toString(),Long.toString(c.fenceEpoch()),c.claimedAt().toString(),c.renewedAt().toString(),instant(c.releasedAt()),Long.toString(c.version()),requestId,requestDigest);}
    static String renewFrame(RecoveryClaim c,String requestId,String requestDigest,long renewalSeq){return String.join("|","N",c.recoveryClaimId(),c.leaseUntil().toString(),c.renewedAt().toString(),Long.toString(c.version()),requestId,requestDigest,Long.toString(renewalSeq));}
    static String releaseFrame(RecoveryClaim c,String requestId,String requestDigest,long releaseSeq,String reason){return String.join("|","R",c.recoveryClaimId(),c.releasedAt().toString(),Long.toString(c.version()),requestId,requestDigest,Long.toString(releaseSeq),enc(reason));}
    static String sha256(String s){try{byte[] d=MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte x:d)b.append(String.format("%02x",x));return b.toString();}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    static String enc(String s){return Base64.getUrlEncoder().withoutPadding().encodeToString((s==null?"":s).getBytes(StandardCharsets.UTF_8));}
    private static String instant(Instant i){return i==null?"":i.toString();} private static Instant blankInstant(String s){return s.isEmpty()?null:Instant.parse(s);}

    record Snapshot(Map<String,RecoveryClaim> byId,Map<String,String> currentByRecovery,Map<String,Receipt> receipts,Map<String,Long> maxClaimEpoch,Map<String,Long> maxFenceEpoch){}
    record Receipt(String digest,String claimId,String kind){}
    record Decision<T>(T result,String frame){static <T> Decision<T> read(T r){return new Decision<>(r,null);} static <T> Decision<T> append(T r,String f){return new Decision<>(r,f);}}
    @FunctionalInterface interface DecisionFunction<T>{Decision<T> apply(Snapshot s);}
    static final class StoreException extends RuntimeException{StoreException(String m){super(m);}StoreException(Throwable e){super(e);}}
}
