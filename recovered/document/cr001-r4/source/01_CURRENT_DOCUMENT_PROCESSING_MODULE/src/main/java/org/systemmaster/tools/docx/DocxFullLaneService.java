package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlMutationPlan;

import org.systemmaster.core.ArtifactIntakeReceipt;
import org.systemmaster.core.ArtifactIntakeRequest;
import org.systemmaster.core.ArtifactMediaDetector;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Governed full-lane DOCX facade for create, semantic edit, advanced OOXML, verify and diagnosis. */
final class DocxFullLaneService {
    private static final String PRODUCER="MOD-DOCX-001"; private static final String PROVENANCE="toolvault://MOD-DOCX-001/MODULE-DOCX-RU-001D/full-lane";
    public record Version(String artifactId,String digest,String logicalRef,long sizeBytes,String mediaType){}
    public record OperationReceipt(String operation,Version source,Version result,DocxFullLaneEngine.Verification verification,List<DocxFullLaneEngine.Diagnostic> accessibility){}
    private final GovernedArtifactGateway artifacts; private final Clock clock; private final DocxFullLaneEngine engine=new DocxFullLaneEngine(); private final ArtifactMediaDetector detector=new ArtifactMediaDetector();
    public DocxFullLaneService(GovernedArtifactGateway artifacts,Clock clock){this.artifacts=Objects.requireNonNull(artifacts);this.clock=Objects.requireNonNull(clock);}
    public OperationReceipt create(String artifactId,List<String>paragraphs)throws Exception{return admit("CREATE",null,artifactId,engine.createDocument(paragraphs));}
    public OperationReceipt appendParagraph(Version source,String outputId,String text,String style)throws Exception{return transform("APPEND_PARAGRAPH",source,outputId,b->engine.appendParagraph(b,text,style));}
    public OperationReceipt addTable(Version source,String outputId,List<List<String>>rows)throws Exception{return transform("TABLE_CREATE",source,outputId,b->engine.addTable(b,rows));}
    public OperationReceipt addBookmark(Version source,String outputId,int paragraph,String name)throws Exception{return transform("BOOKMARK_CREATE",source,outputId,b->engine.addBookmark(b,paragraph,name));}
    public OperationReceipt addField(Version source,String outputId,String instruction,String display)throws Exception{return transform("FIELD_CREATE",source,outputId,b->engine.addSimpleField(b,instruction,display));}
    public OperationReceipt replaceAdvancedPart(Version source,String outputId,String part,byte[]replacement,String expectedDigest)throws Exception{return transform("ADVANCED_PART_PATCH",source,outputId,b->engine.replaceAdvancedPart(b,part,replacement,expectedDigest));}
    public OperationReceipt applyAdvancedPlan(Version source,String outputId,OoxmlMutationPlan plan)throws Exception{return transform("ADVANCED_MUTATION_PLAN",source,outputId,b->engine.applyAdvancedPlan(b,plan));}
    public DocxFullLaneEngine.Inventory inventory(Version source)throws IOException{return engine.inventory(read(source));}
    public DocxFullLaneEngine.Verification verify(Version source)throws IOException{return engine.verify(read(source));}
    public List<DocxFullLaneEngine.Diagnostic> accessibility(Version source)throws IOException{return engine.accessibility(read(source));}
    private OperationReceipt transform(String op,Version source,String outputId,Transform f)throws Exception{return admit(op,source,outputId,f.apply(read(source)));}
    private OperationReceipt admit(String op,Version source,String id,byte[]bytes)throws Exception{String media=detector.detect(bytes);if(!ArtifactMediaDetector.DOCX.equals(media)&&!ArtifactMediaDetector.DOCM.equals(media))throw new IOException("result is not governed DOCX/DOCM");ArtifactIntakeRequest req=new ArtifactIntakeRequest(UuidV7.create().toString(),id,PRODUCER,media,null,null,source==null?List.of():List.of(source.logicalRef()),List.of(PROVENANCE,"operation:"+op),Instant.now(clock));ArtifactIntakeReceipt r=artifacts.ingest(req,new ByteArrayInputStream(bytes));if(!"VERIFIED".equals(r.disposition()))throw new IOException("document admission rejected: "+r.reason());Version v=new Version(r.artifactId(),r.digest(),r.logicalRef(),r.sizeBytes(),r.detectedMediaType());return new OperationReceipt(op,source,v,engine.verify(bytes),engine.accessibility(bytes));}
    private byte[]read(Version v)throws IOException{Objects.requireNonNull(v);if(v.digest()==null||!v.digest().matches("[0-9a-f]{64}"))throw new IllegalArgumentException("digest");return artifacts.readVerified(v.digest(),artifacts.maxBytes());}
    @FunctionalInterface private interface Transform{byte[]apply(byte[]bytes)throws Exception;}
}
