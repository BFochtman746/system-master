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
import java.util.Base64;

public final class DurableSignalRecoveryAdapter {
    private final Path journal;
    private final SignalAuthority signalAuthority;
    private final AttemptAuthority attemptAuthority;
    private static final Base64.Encoder E=Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder D=Base64.getUrlDecoder();

    public DurableSignalRecoveryAdapter(Path dir, SignalAuthority signalAuthority, AttemptAuthority attemptAuthority){
        try{Files.createDirectories(dir);journal=dir.resolve("gwp009-signals.journal");if(!Files.exists(journal))Files.createFile(journal);}catch(IOException e){throw new IllegalStateException(e);}
        this.signalAuthority=Objects.requireNonNull(signalAuthority); this.attemptAuthority=Objects.requireNonNull(attemptAuthority); snapshot();
    }

    public RecoveryResult recoverDurableSignal(String signalId,String workUnitId,String attemptId,long fenceEpoch,Instant now){
        String sid=req(signalId),w=req(workUnitId),aid=req(attemptId); if(fenceEpoch<1)throw new IllegalArgumentException("fenceEpoch"); Objects.requireNonNull(now);
        if(!attemptAuthority.isCurrent(w,aid,fenceEpoch,now)) return new RecoveryResult(Result.STALE,null);
        AuthoritativeSignal auth=signalAuthority.get(sid);
        if(auth==null||!auth.workUnitId().equals(w)) throw new UnknownSignalException("unknown signal");
        DurableSignalRef prior=snapshot().byId.get(sid);
        if(prior!=null&&prior.deliveryState()==DurableSignalRef.DeliveryState.CONSUMED){
            return new RecoveryResult(Result.ALREADY_CONSUMED,prior);
        }
        ConsumptionReceipt receipt=signalAuthority.consumeOnce(sid,w,aid,fenceEpoch,now);
        if(receipt.status()==ConsumptionStatus.STALE) return new RecoveryResult(Result.STALE,prior);
        if(!receipt.signalId().equals(sid)||!receipt.workUnitId().equals(w))throw new SemanticConflictException("receipt binding mismatch");
        DurableSignalRef next=new DurableSignalRef(sid,w,auth.kind(),auth.payloadDigest(),auth.sourceSequence(),DurableSignalRef.DeliveryState.CONSUMED,aid,fenceEpoch,receipt.receiptDigest(),auth.recordedAt(),receipt.consumedAt(),prior==null?1:prior.version()+1);
        DurableSignalRef stored=transact(s->{DurableSignalRef old=s.byId.get(sid);if(old!=null&&old.deliveryState()==DurableSignalRef.DeliveryState.CONSUMED){if(!old.consumptionReceiptDigest().equals(receipt.receiptDigest()))throw new SemanticConflictException("consumption receipt conflict");return new Decision<>(old,null);}return new Decision<>(next,frame(next));});
        return new RecoveryResult(receipt.status()==ConsumptionStatus.CONSUMED?Result.CONSUMED:Result.ALREADY_CONSUMED,stored);
    }

    public List<DurableSignalRef> getPendingDurableSignals(String workUnitId){
        String w=req(workUnitId); Map<String,DurableSignalRef> local=snapshot().byId; List<DurableSignalRef> out=new ArrayList<>();
        for(AuthoritativeSignal a:signalAuthority.pending(w)){
            DurableSignalRef l=local.get(a.signalId()); if(l!=null&&l.deliveryState()==DurableSignalRef.DeliveryState.CONSUMED)continue;
            out.add(new DurableSignalRef(a.signalId(),a.workUnitId(),a.kind(),a.payloadDigest(),a.sourceSequence(),DurableSignalRef.DeliveryState.PENDING,null,null,null,a.recordedAt(),null,l==null?1:l.version()));
        }
        out.sort(Comparator.comparingLong(DurableSignalRef::sourceSequence).thenComparing(DurableSignalRef::signalId)); return List.copyOf(out);
    }

    public DurableSignalRef getBinding(String signalId){return snapshot().byId.get(req(signalId));}
    Path journalPath(){return journal;}

    private Snapshot snapshot(){return locked((ch,s)->s);} private <T>T transact(Tx<T> tx){return locked((ch,s)->{Decision<T>d=tx.apply(s);if(d.line()!=null)append(ch,d.line());return d.value();});}
    private <T>T locked(Locked<T> f){try(FileChannel ch=FileChannel.open(journal,StandardOpenOption.READ,StandardOpenOption.WRITE);FileLock ignored=ch.lock()){return f.apply(ch,replay(ch));}catch(IOException e){throw new IllegalStateException(e);}}
    private Snapshot replay(FileChannel ch)throws IOException{Map<String,DurableSignalRef> map=new HashMap<>();long z=ch.size();if(z>Integer.MAX_VALUE)throw new IntegrityException("large journal");ByteBuffer b=ByteBuffer.allocate((int)z);ch.position(0);while(b.hasRemaining()&&ch.read(b)>=0){}b.flip();String text=StandardCharsets.UTF_8.decode(b).toString();for(String line:text.split("\\R",-1)){if(line.isBlank())continue;int p=line.lastIndexOf('\t');if(p<1)throw new IntegrityException("truncated journal");String body=line.substring(0,p);if(!sha(body).equals(line.substring(p+1)))throw new IntegrityException("checksum mismatch");DurableSignalRef r=decode(body.split("\\|",-1));DurableSignalRef old=map.get(r.signalId());if(old==null||r.version()>=old.version())map.put(r.signalId(),r);}return new Snapshot(Map.copyOf(map));}
    private static void append(FileChannel ch,String body)throws IOException{ByteBuffer b=StandardCharsets.UTF_8.encode(body+'\t'+sha(body)+'\n');ch.position(ch.size());while(b.hasRemaining())ch.write(b);ch.force(true);}
    private static String frame(DurableSignalRef r){return String.join("|","S",enc(r.signalId()),enc(r.workUnitId()),r.kind().name(),enc(r.payloadDigest()),Long.toString(r.sourceSequence()),r.deliveryState().name(),encN(r.boundAttemptId()),r.boundFenceEpoch()==null?"":r.boundFenceEpoch().toString(),encN(r.consumptionReceiptDigest()),r.recordedAt().toString(),r.consumedAt()==null?"":r.consumedAt().toString(),Long.toString(r.version()));}
    private static DurableSignalRef decode(String[]v){if(v.length!=13||!v[0].equals("S"))throw new IntegrityException("frame width");return new DurableSignalRef(dec(v[1]),dec(v[2]),DurableSignalRef.Kind.valueOf(v[3]),dec(v[4]),Long.parseLong(v[5]),DurableSignalRef.DeliveryState.valueOf(v[6]),decN(v[7]),v[8].isEmpty()?null:Long.parseLong(v[8]),decN(v[9]),Instant.parse(v[10]),v[11].isEmpty()?null:Instant.parse(v[11]),Long.parseLong(v[12]));}
    private static String sha(String s){try{byte[]x=MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder();for(byte q:x)b.append(String.format("%02x",q));return b.toString();}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
    private static String req(String v){if(v==null||v.trim().isEmpty())throw new IllegalArgumentException("required");return v.trim();} private static String enc(String s){return E.encodeToString(s.getBytes(StandardCharsets.UTF_8));}private static String dec(String s){return new String(D.decode(s),StandardCharsets.UTF_8);}private static String encN(String s){return s==null?"":enc(s);}private static String decN(String s){return s.isEmpty()?null:dec(s);}

    public record AuthoritativeSignal(String signalId,String workUnitId,DurableSignalRef.Kind kind,String payloadDigest,long sourceSequence,Instant recordedAt){public AuthoritativeSignal{signalId=req(signalId);workUnitId=req(workUnitId);kind=Objects.requireNonNull(kind);payloadDigest=req(payloadDigest);if(sourceSequence<0)throw new IllegalArgumentException("sourceSequence");recordedAt=Objects.requireNonNull(recordedAt);}}
    public record ConsumptionReceipt(String signalId,String workUnitId,ConsumptionStatus status,String receiptDigest,Instant consumedAt){public ConsumptionReceipt{signalId=req(signalId);workUnitId=req(workUnitId);status=Objects.requireNonNull(status);receiptDigest=req(receiptDigest);consumedAt=Objects.requireNonNull(consumedAt);}}
    public enum ConsumptionStatus{CONSUMED,ALREADY_CONSUMED,STALE}
    public enum Result{CONSUMED,ALREADY_CONSUMED,STALE}
    public record RecoveryResult(Result result,DurableSignalRef binding){}
    public interface SignalAuthority{AuthoritativeSignal get(String signalId);List<AuthoritativeSignal> pending(String workUnitId);ConsumptionReceipt consumeOnce(String signalId,String workUnitId,String attemptId,long fenceEpoch,Instant now);}
    @FunctionalInterface public interface AttemptAuthority{boolean isCurrent(String workUnitId,String attemptId,long fenceEpoch,Instant now);}
    private record Snapshot(Map<String,DurableSignalRef>byId){} private record Decision<T>(T value,String line){} private interface Tx<T>{Decision<T>apply(Snapshot s);} private interface Locked<T>{T apply(FileChannel ch,Snapshot s)throws IOException;}
    public static final class IntegrityException extends RuntimeException{IntegrityException(String m){super(m);}} public static final class UnknownSignalException extends RuntimeException{UnknownSignalException(String m){super(m);}} public static final class SemanticConflictException extends RuntimeException{SemanticConflictException(String m){super(m);}}
}
