package org.systemmaster.continuity;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Durable outbox for evidence; publisher outages never erase evidence. */
public final class ContinuityEvidencePublisher {
    public interface Sink { boolean publish(EvidenceEnvelope envelope); }
    public record EvidenceEnvelope(String evidenceId,String subjectRef,String subjectDigest,String evidenceClass,String source,
                                   Instant observedAt,String payloadDigest,String payloadRef) {}
    public record PublishResult(int attempted,int published,int remaining) {}
    private final Path outbox;
    private final Sink sink;
    public ContinuityEvidencePublisher(Path root,Sink sink){this.outbox=Objects.requireNonNull(root).resolve("continuity-evidence-outbox.log");this.sink=Objects.requireNonNull(sink);}

    public EvidenceEnvelope record(String subjectRef,String subjectDigest,String evidenceClass,String source,String payloadDigest,String payloadRef){
        subjectRef=req(subjectRef,"subjectRef");subjectDigest=req(subjectDigest,"subjectDigest");evidenceClass=req(evidenceClass,"evidenceClass");source=req(source,"source");payloadDigest=req(payloadDigest,"payloadDigest");payloadRef=req(payloadRef,"payloadRef");
        Instant at=Instant.now(); String id=CheckpointStore.sha256(subjectRef+"|"+subjectDigest+"|"+evidenceClass+"|"+source+"|"+payloadDigest+"|"+at).substring(0,32);
        EvidenceEnvelope e=new EvidenceEnvelope(id,subjectRef,subjectDigest,evidenceClass,source,at,payloadDigest,payloadRef); append(encode(e)); return e;
    }
    public List<EvidenceEnvelope> getRecoveryEvidence(String subjectRef){String s=req(subjectRef,"subjectRef");return read().stream().filter(e->e.subjectRef().equals(s)).toList();}
    public PublishResult backfill(){List<EvidenceEnvelope> all=read();List<EvidenceEnvelope> keep=new ArrayList<>();int published=0;for(var e:all){if(sink.publish(e))published++;else keep.add(e);}rewrite(keep);return new PublishResult(all.size(),published,keep.size());}

    private void append(String line){try{Files.createDirectories(outbox.getParent());Files.writeString(outbox,line+"\n",StandardCharsets.UTF_8,StandardOpenOption.CREATE,StandardOpenOption.APPEND);}catch(IOException e){throw new IllegalStateException("evidence outbox unavailable",e);}}
    private List<EvidenceEnvelope> read(){if(!Files.exists(outbox))return List.of();try{return Files.readAllLines(outbox,StandardCharsets.UTF_8).stream().filter(x->!x.isBlank()).map(ContinuityEvidencePublisher::decode).toList();}catch(IOException e){throw new IllegalStateException("evidence outbox unavailable",e);}}
    private void rewrite(List<EvidenceEnvelope> items){try{Files.createDirectories(outbox.getParent());StringBuilder b=new StringBuilder();for(var e:items)b.append(encode(e)).append('\n');Files.writeString(outbox,b.toString(),StandardCharsets.UTF_8,StandardOpenOption.CREATE,StandardOpenOption.TRUNCATE_EXISTING);}catch(IOException e){throw new IllegalStateException("evidence outbox unavailable",e);}}
    private static String encode(EvidenceEnvelope e){return String.join("\t",esc(e.evidenceId()),esc(e.subjectRef()),esc(e.subjectDigest()),esc(e.evidenceClass()),esc(e.source()),e.observedAt().toString(),esc(e.payloadDigest()),esc(e.payloadRef()));}
    private static EvidenceEnvelope decode(String s){String[] p=s.split("\t",-1);if(p.length!=8)throw new IllegalStateException("corrupt evidence outbox");return new EvidenceEnvelope(un(p[0]),un(p[1]),un(p[2]),un(p[3]),un(p[4]),Instant.parse(p[5]),un(p[6]),un(p[7]));}
    private static String esc(String s){return s.replace("%","%25").replace("\t","%09").replace("\n","%0A");} private static String un(String s){return s.replace("%0A","\n").replace("%09","\t").replace("%25","%");}
    private static String req(String v,String f){return RecoveryAuthorizationGate.req(v,f);}
}
