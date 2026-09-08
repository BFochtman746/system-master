package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.Base64;

public final class HistoryCompactor {
    private final Path journal; private final SnapshotAuthority snapshots; private static final Base64.Encoder E=Base64.getUrlEncoder().withoutPadding();private static final Base64.Decoder D=Base64.getUrlDecoder();
    public HistoryCompactor(Path dir,SnapshotAuthority snapshots){try{Files.createDirectories(dir);journal=dir.resolve("gwp010-history.journal");if(!Files.exists(journal))Files.createFile(journal);}catch(IOException e){throw new IllegalStateException(e);}this.snapshots=Objects.requireNonNull(snapshots);snapshot();}
    public HistorySegment rollHistorySegment(String workUnitId,long throughEventSeq,String snapshotRef,String snapshotDigest,List<String>unresolvedRefs,List<String>retainedEvidenceRefs,String parentSegmentDigest,Instant now){
        String w=req(workUnitId),sr=req(snapshotRef),sd=req(snapshotDigest);if(throughEventSeq<1)throw new IllegalArgumentException("throughEventSeq");Objects.requireNonNull(now);
        List<String> unresolved=List.copyOf(unresolvedRefs==null?List.of():unresolvedRefs), retained=List.copyOf(retainedEvidenceRefs==null?List.of():retainedEvidenceRefs);
        if(!snapshots.isDurableAndVerified(w,throughEventSeq,sr,sd))throw new UnsafeCompactionException("snapshot not durable/digest verified");if(!retained.containsAll(unresolved))throw new UnsafeCompactionException("unresolved evidence would be removed");
        String id="history-"+CompatibilityResolver.sha(w+"|"+throughEventSeq+"|"+sd).substring(0,24);String dg=CompatibilityResolver.sha(id+"|"+w+"|"+throughEventSeq+"|"+sr+"|"+sd+"|"+String.join(",",retained)+"|"+(parentSegmentDigest==null?"":parentSegmentDigest));
        HistorySegment proposed=new HistorySegment(id,w,throughEventSeq,sr,sd,retained,parentSegmentDigest,dg,now);
        return transact(s->{HistorySegment old=s.byId.get(id);if(old!=null){if(!old.segmentDigest().equals(dg))throw new UnsafeCompactionException("segment semantic conflict");return new Decision<>(old,null);}for(HistorySegment h:s.byId.values())if(h.workUnitId().equals(w)&&h.throughEventSeq()==throughEventSeq&&!h.snapshotDigest().equals(sd))throw new UnsafeCompactionException("same boundary different snapshot");return new Decision<>(proposed,frame(proposed));});
    }
    public List<HistorySegment> lineage(String workUnitId){String w=req(workUnitId);List<HistorySegment>out=new ArrayList<>();for(HistorySegment h:snapshot().byId.values())if(h.workUnitId().equals(w))out.add(h);out.sort(Comparator.comparingLong(HistorySegment::throughEventSeq));return List.copyOf(out);}
    Path journalPath(){return journal;}
    private Snapshot snapshot(){return locked((c,s)->s);}private <T>T transact(Tx<T>tx){return locked((c,s)->{Decision<T>d=tx.apply(s);if(d.line()!=null)append(c,d.line());return d.value();});}private <T>T locked(Locked<T> f){try(FileChannel ch=FileChannel.open(journal,StandardOpenOption.READ,StandardOpenOption.WRITE);FileLock ignored=ch.lock()){return f.apply(ch,replay(ch));}catch(IOException e){throw new IllegalStateException(e);}}
    private Snapshot replay(FileChannel ch)throws IOException{Map<String,HistorySegment>m=new HashMap<>();long z=ch.size();if(z>Integer.MAX_VALUE)throw new IntegrityException("large");ByteBuffer b=ByteBuffer.allocate((int)z);ch.position(0);while(b.hasRemaining()&&ch.read(b)>=0){}b.flip();for(String line:StandardCharsets.UTF_8.decode(b).toString().split("\\R",-1)){if(line.isBlank())continue;int p=line.lastIndexOf('\t');if(p<1)throw new IntegrityException("truncated");String body=line.substring(0,p);if(!CompatibilityResolver.sha(body).equals(line.substring(p+1)))throw new IntegrityException("checksum");HistorySegment h=decode(body.split("\\|",-1));m.put(h.segmentId(),h);}return new Snapshot(Map.copyOf(m));}
    private static void append(FileChannel ch,String body)throws IOException{ByteBuffer b=StandardCharsets.UTF_8.encode(body+'\t'+CompatibilityResolver.sha(body)+'\n');ch.position(ch.size());while(b.hasRemaining())ch.write(b);ch.force(true);}
    private static String frame(HistorySegment h){return String.join("|","H",enc(h.segmentId()),enc(h.workUnitId()),Long.toString(h.throughEventSeq()),enc(h.snapshotRef()),enc(h.snapshotDigest()),enc(String.join("\u001f",h.retainedEvidenceRefs())),encN(h.parentSegmentDigest()),enc(h.segmentDigest()),h.createdAt().toString());}
    private static HistorySegment decode(String[]v){if(v.length!=10||!v[0].equals("H"))throw new IntegrityException("frame");return new HistorySegment(dec(v[1]),dec(v[2]),Long.parseLong(v[3]),dec(v[4]),dec(v[5]),split(dec(v[6])),decN(v[7]),dec(v[8]),Instant.parse(v[9]));}
    private static List<String> split(String s){return s.isEmpty()?List.of():List.of(s.split("\\u001f",-1));}private static String req(String v){if(v==null||v.trim().isEmpty())throw new IllegalArgumentException("required");return v.trim();}private static String enc(String s){return E.encodeToString(s.getBytes(StandardCharsets.UTF_8));}private static String dec(String s){return new String(D.decode(s),StandardCharsets.UTF_8);}private static String encN(String s){return s==null?"":enc(s);}private static String decN(String s){return s.isEmpty()?null:dec(s);}
    @FunctionalInterface public interface SnapshotAuthority{boolean isDurableAndVerified(String workUnitId,long throughEventSeq,String snapshotRef,String snapshotDigest);}private record Snapshot(Map<String,HistorySegment>byId){}private record Decision<T>(T value,String line){}private interface Tx<T>{Decision<T>apply(Snapshot s);}private interface Locked<T>{T apply(FileChannel ch,Snapshot s)throws IOException;}public static final class UnsafeCompactionException extends RuntimeException{UnsafeCompactionException(String m){super(m);}}public static final class IntegrityException extends RuntimeException{IntegrityException(String m){super(m);}}
}
