package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class Gwp003Store {
    private final Path file;
    private final Map<String,InterruptionObservation> observationsByDedupe=new HashMap<>();
    private final Map<String,RecoveryClassification> classificationsByRecovery=new HashMap<>();
    private final Map<String,List<RecoveryPlan>> plansByRecovery=new HashMap<>();

    Gwp003Store(Path directory){
        try{Files.createDirectories(directory);}catch(IOException e){throw new StoreException("create directory",e);}
        this.file=directory.resolve("gwp003-recovery-planning.journal");
        replay();
    }
    synchronized InterruptionObservation observation(String dedupe){return observationsByDedupe.get(dedupe);}
    synchronized RecoveryClassification classification(String recoveryId){return classificationsByRecovery.get(recoveryId);}
    synchronized RecoveryPlan latestPlan(String recoveryId){List<RecoveryPlan> p=plansByRecovery.get(recoveryId);return p==null||p.isEmpty()?null:p.get(p.size()-1);}
    synchronized List<RecoveryPlan> plans(String recoveryId){return List.copyOf(plansByRecovery.getOrDefault(recoveryId,List.of()));}

    synchronized void putObservation(InterruptionObservation o){
        InterruptionObservation prior=observationsByDedupe.get(o.dedupeKey());
        if(prior!=null){if(!prior.observationDigest().equals(o.observationDigest()))throw new StoreConflict("dedupe_key reused with different observation");return;}
        append("O",encodeObservation(o)); observationsByDedupe.put(o.dedupeKey(),o);
    }
    synchronized void putClassification(RecoveryClassification c){
        RecoveryClassification prior=classificationsByRecovery.get(c.recoveryId());
        if(prior!=null&&prior.evidenceSetDigest().equals(c.evidenceSetDigest()))return;
        append("C",encodeClassification(c)); classificationsByRecovery.put(c.recoveryId(),c);
    }
    synchronized void putPlan(RecoveryPlan p){
        List<RecoveryPlan> list=plansByRecovery.computeIfAbsent(p.recoveryId(),k->new ArrayList<>());
        if(!list.isEmpty()){
            RecoveryPlan last=list.get(list.size()-1);
            if(last.inputStateDigest().equals(p.inputStateDigest()))return;
            if(p.version()!=last.version()+1)throw new StoreConflict("plan version not monotonic");
        } else if(p.version()!=1) throw new StoreConflict("first plan version must be 1");
        append("P",encodePlan(p)); list.add(p);
    }

    private void append(String type,String payload){
        String frame=type+"|"+b64(payload)+"|"+sha256(type+"|"+b64(payload))+"\n";
        byte[] bytes=frame.getBytes(StandardCharsets.UTF_8);
        try(FileChannel ch=FileChannel.open(file,StandardOpenOption.CREATE,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){
            ByteBuffer b=ByteBuffer.wrap(bytes);while(b.hasRemaining())ch.write(b);ch.force(true);
        }catch(IOException e){throw new StoreException("append",e);}
    }
    private void replay(){
        if(!Files.exists(file))return;
        final List<String> lines;
        try{lines=Files.readAllLines(file,StandardCharsets.UTF_8);}catch(IOException e){throw new StoreException("read",e);}
        for(int i=0;i<lines.size();i++){
            String line=lines.get(i); if(line.isEmpty())continue;
            String[] p=line.split("\\|",-1); if(p.length!=3)throw new CorruptStore("malformed frame at line "+(i+1));
            if(!sha256(p[0]+"|"+p[1]).equals(p[2]))throw new CorruptStore("checksum mismatch at line "+(i+1));
            String payload=unb64(p[1]);
            switch(p[0]){
                case "O" -> {InterruptionObservation o=decodeObservation(payload);InterruptionObservation prior=observationsByDedupe.putIfAbsent(o.dedupeKey(),o);if(prior!=null&&!prior.observationDigest().equals(o.observationDigest()))throw new CorruptStore("observation collision");}
                case "C" -> classificationsByRecovery.put(decodeClassification(payload).recoveryId(),decodeClassification(payload));
                case "P" -> {RecoveryPlan plan=decodePlan(payload);List<RecoveryPlan> list=plansByRecovery.computeIfAbsent(plan.recoveryId(),k->new ArrayList<>());if(plan.version()!=list.size()+1L)throw new CorruptStore("plan version gap");list.add(plan);}
                default -> throw new CorruptStore("unknown frame type");
            }
        }
    }

    static String sha256(String v){try{byte[] d=MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();for(byte b:d)s.append(String.format("%02x",b));return s.toString();}catch(Exception e){throw new IllegalStateException(e);}}
    static String b64(String v){return Base64.getUrlEncoder().withoutPadding().encodeToString(v.getBytes(StandardCharsets.UTF_8));}
    static String unb64(String v){return new String(Base64.getUrlDecoder().decode(v),StandardCharsets.UTF_8);}
    private static String join(List<String> v){return String.join("\u001f",v);}
    private static List<String> splitList(String v){return v.isEmpty()?List.of():List.of(v.split("\u001f",-1));}
    private static String n(String v){return v==null?"":v;}

    private static String encodeObservation(InterruptionObservation o){return String.join("\t",List.of(o.interruptionId(),o.workUnitId(),o.attemptId(),o.source(),o.observedAt().toString(),n(o.lastHeartbeatAt()==null?null:o.lastHeartbeatAt().toString()),o.leaseState(),n(o.processInstanceRef()),n(o.providerState()),join(o.evidenceRefs()),o.dedupeKey(),o.observationDigest()));}
    private static InterruptionObservation decodeObservation(String v){String[] p=v.split("\t",-1);if(p.length!=12)throw new CorruptStore("observation fields");return new InterruptionObservation(p[0],p[1],p[2],p[3],Instant.parse(p[4]),p[5].isEmpty()?null:Instant.parse(p[5]),p[6],empty(p[7]),empty(p[8]),splitList(p[9]),p[10],p[11]);}
    private static String encodeClassification(RecoveryClassification c){return String.join("\t",List.of(c.classificationId(),c.recoveryId(),c.workUnitId(),c.recoveryClass().name(),join(c.reasonCodes()),n(c.checkpointCandidateRef()),c.externalEffectState(),c.compatibilityState(),c.authorityState(),Double.toString(c.confidence()),join(c.evidenceRefs()),c.evidenceSetDigest(),c.createdAt().toString()));}
    private static RecoveryClassification decodeClassification(String v){String[] p=v.split("\t",-1);if(p.length!=13)throw new CorruptStore("classification fields");return new RecoveryClassification(p[0],p[1],p[2],RecoveryClassification.RecoveryClass.valueOf(p[3]),splitList(p[4]),empty(p[5]),p[6],p[7],p[8],Double.parseDouble(p[9]),splitList(p[10]),p[11],Instant.parse(p[12]));}
    private static String encodePlan(RecoveryPlan p){return String.join("\t",List.of(p.recoveryPlanId(),Long.toString(p.version()),p.recoveryId(),p.classificationId(),p.disposition().name(),n(p.checkpointRef()),join(p.reconcileEffectRefs()),p.requiredRuntimeCompatibility(),p.requiredAuthority(),p.resourceClass(),join(p.steps()),join(p.verificationCriteria()),join(p.blockers()),p.inputStateDigest(),p.planDigest(),p.createdAt().toString()));}
    private static RecoveryPlan decodePlan(String v){String[] p=v.split("\t",-1);if(p.length!=16)throw new CorruptStore("plan fields");return new RecoveryPlan(p[0],Long.parseLong(p[1]),p[2],p[3],RecoveryClassification.RecoveryClass.valueOf(p[4]),empty(p[5]),splitList(p[6]),p[7],p[8],p[9],splitList(p[10]),splitList(p[11]),splitList(p[12]),p[13],p[14],Instant.parse(p[15]));}
    private static String empty(String v){return v.isEmpty()?null:v;}
    Path file(){return file;}
    static final class StoreConflict extends RuntimeException{StoreConflict(String m){super(m);}}
    static final class CorruptStore extends RuntimeException{CorruptStore(String m){super(m);}}
    static final class StoreException extends RuntimeException{StoreException(String m,Throwable t){super(m,t);}}
}
