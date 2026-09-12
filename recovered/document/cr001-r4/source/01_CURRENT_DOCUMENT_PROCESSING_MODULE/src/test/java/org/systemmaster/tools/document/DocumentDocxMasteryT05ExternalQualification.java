package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxDrawingChartMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxTableImageMasteryEngine;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY-T05. */
public final class DocumentDocxMasteryT05ExternalQualification {
    private static final Set<String> T05 = t05Capabilities();
    private static final byte[] PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=");
    private static final byte[] SVG = ("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"#4472C4\"/></svg>").getBytes(StandardCharsets.UTF_8);
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice=Path.of(args[0]);Path pdfinfo=Path.of(args[1]);Path pdftotext=Path.of(args[2]);Path pdftoppm=Path.of(args[3]);Path pdfimages=Path.of(args[4]);
        LocalLibreOfficePopplerRenderWorker worker=LocalLibreOfficePopplerRenderWorker.standard(soffice,pdfinfo,pdftotext,pdftoppm,pdfimages);
        Path root=Files.createTempDirectory("document-docx-mastery-t05-external-");
        try{qualify(root,worker,soffice,pdfinfo,pdftotext,pdfimages);System.out.println("DOCUMENT_DOCX_MASTERY_T05_EXTERNAL_PASS assertions="+assertions+" capabilities="+T05.size());}finally{deleteTree(root);}
    }

    private static void qualify(Path root,RenderProofWorker worker,Path soffice,Path pdfinfo,Path pdftotext,Path pdfimages)throws Exception{
        byte[] source=new DocxFullLaneEngine().createDocument(List.of("T05 IMAGE","T05 SVG","T05 SHAPE","T05 TEXTBOX","T05 WORDART","T05 GROUP","T05 CHART"));
        DocxTableImageMasteryEngine t04=new DocxTableImageMasteryEngine();
        source=t04.insertFloatingImage(source,"body/p:1",new DocxTableImageMasteryEngine.ImageSpec(PNG,"png",914400,914400,"T05 raster","","T05 raster alt"),new DocxTableImageMasteryEngine.FloatingPlacement(10000,20000,"column","paragraph","square"));
        DocxDrawingChartMasteryEngine engine=new DocxDrawingChartMasteryEngine();
        source=engine.styleImage(source,"body/p:1/drawing-image:1",new DocxDrawingChartMasteryEngine.ImageStyle(new DocxDrawingChartMasteryEngine.Crop(1000,1000,1000,1000),"tight",30000L,40000L,"column","paragraph","","T05 raster revised",false));
        source=engine.insertSvg(source,"body/p:2",new DocxDrawingChartMasteryEngine.SvgSpec(SVG,1000000,700000,"T05 SVG","","T05 SVG alt",false));
        source=engine.insertShape(source,"body/p:3",shape("roundRect","T05 SHAPE TEXT","D9EAF7","4472C4",""));
        source=engine.insertTextBox(source,"body/p:4",shape("rect","T05 TEXT BOX","FFFFFF","808080",""));
        source=engine.insertWordArt(source,"body/p:5",shape("rect","T05 WORD ART","F4B183","C65911","textArchUp"));
        source=engine.insertGroup(source,"body/p:6",new DocxDrawingChartMasteryEngine.GroupSpec(List.of(shape("rect","G1","DDEBF7","5B9BD5",""),shape("ellipse","G2","E2F0D9","70AD47","")),2500000,1200000));
        source=engine.insertChart(source,"body/p:7",new DocxDrawingChartMasteryEngine.ChartSpec("bar","T05 Revenue",5000000,3000000,List.of(new DocxDrawingChartMasteryEngine.ChartSeries("Series A",List.of("Alpha","Beta","Gamma"),List.of(10.0,20.0,30.0)))));

        CanonicalDocumentGraphV2 graph=project(source);
        String chartId=graph.elements().stream().filter(e->e.type()==CanonicalDocumentGraphV2.ElementType.CHART).findFirst().orElseThrow().id();
        Map<String,String> params=new LinkedHashMap<>();params.put("docx.action","EDIT_CHART");params.put("chart.type","line");params.put("chart.title","T05 Revenue Trend");params.put("chart.widthEmu","5000000");params.put("chart.heightEmu","3000000");params.put("chart.seriesCount","1");params.put("chart.series.1.name","Series A");params.put("chart.series.1.categories","Alpha;Beta;Gamma");params.put("chart.series.1.values","12;24;36");
        DocumentOperationContract op=new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1,"t05-external-chart",graph.sourceSha256(),graph.semanticDigest(),DocumentOperationContract.Type.FORMAT,List.of(DocumentSelector.node(chartId)),"T05 external chart proof",params,DocumentOperationContract.Risk.REVERSIBLE_EDIT,graph.sourceSha256(),Set.of("word/document.xml","word/charts/*"),DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,false,List.of(),false,EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job=job("t05-external-source","t05-external-result");DocumentSpineExecutionPlan plan=new DocumentSpineExecutionPlan(job.jobId(),job.mode(),op,Set.of(chartId),allCapabilities(),List.of());DocumentSpineResult result=spine(root,worker).executeExisting(job,new ByteArrayInputStream(source),plan);
        check(result.publication()!=null&&result.publication().publicationClass()==DocumentSpinePublicationClass.VERIFIED_DRAFT,"external T05 publishes verified draft");
        check(result.preservation()!=null&&result.preservation().pass(),"external T05 preservation passes");
        check(result.finalization()!=null&&result.finalization().missing().isEmpty(),"external T05 proof complete");
        check(result.proofReceipts().stream().anyMatch(r->r.gate()==DocumentProofReceipt.Gate.RENDERED&&r.status()==DocumentProofReceipt.Status.PASS),"LibreOffice/Poppler render proof passes");
        check(engine.readImageStyles(result.resultBytes()).stream().anyMatch(i->"tight".equals(i.wrap())&&"T05 raster revised".equals(i.altText())),"external candidate retains image styling");
        check(engine.readImageStyles(result.resultBytes()).stream().anyMatch(i->"svg".equals(i.mediaKind())),"external candidate retains SVG native media");
        check(engine.readShapes(result.resultBytes()).size()>=3,"external candidate retains shape/textbox/WordArt objects");
        check(engine.readGroups(result.resultBytes()).size()==1&&engine.readGroups(result.resultBytes()).get(0).childCount()==2,"external candidate retains drawing group");
        check(engine.readCharts(result.resultBytes()).size()==1&&"line".equals(engine.readCharts(result.resultBytes()).get(0).type()),"external candidate retains governed chart edit");
        check(engine.readCharts(result.resultBytes()).get(0).series().get(0).values().get(2).equals(36.0),"external candidate retains chart series/data");
        CanonicalDocumentGraphV2 projected=project(result.resultBytes());
        check(projected.elements().stream().anyMatch(e->e.type()==CanonicalDocumentGraphV2.ElementType.CHART&&"line".equals(e.semantic().properties().get("type"))),"external candidate reprojects chart semantics");
        check(projected.elements().stream().anyMatch(e->e.type()==CanonicalDocumentGraphV2.ElementType.TEXT_FRAME),"external candidate reprojects text-box semantics");
        RenderedPdf rendered=renderToPdf(root.resolve("manual"),result.resultBytes(),soffice,pdfinfo,pdftotext,pdfimages);
        check(rendered.pages()>=1,"LibreOffice renders T05 candidate to PDF");
        check(rendered.text().contains("T05 IMAGE")&&rendered.text().contains("T05 CHART"),"Poppler observes document host text after drawing/chart operations");
        check(rendered.text().contains("T05 SHAPE TEXT")||rendered.text().contains("T05 TEXT BOX")||rendered.text().contains("T05 WORD ART"),"LibreOffice exposes at least one drawing text payload to PDF text layer");
        check(rendered.imageCount()>=1,"Poppler observes rendered graphical content");
    }

    private static DocxDrawingChartMasteryEngine.ShapeSpec shape(String preset,String text,String fill,String line,String warp){return new DocxDrawingChartMasteryEngine.ShapeSpec(preset,1800000,900000,fill,line,text,warp);}
    private static RenderedPdf renderToPdf(Path root,byte[] docx,Path soffice,Path pdfinfo,Path pdftotext,Path pdfimages)throws Exception{Files.createDirectories(root);Path input=root.resolve("t05.docx");Path out=root.resolve("out");Files.createDirectories(out);Files.write(input,docx);Process convert=new ProcessBuilder(soffice.toString(),"--headless","--convert-to","pdf","--outdir",out.toString(),input.toString()).redirectErrorStream(true).start();byte[] output=convert.getInputStream().readAllBytes();if(!convert.waitFor(120,TimeUnit.SECONDS)){convert.destroyForcibly();throw new IOException("LibreOffice conversion timeout");}if(convert.exitValue()!=0)throw new IOException("LibreOffice conversion failed: "+new String(output,StandardCharsets.UTF_8));Path pdf=out.resolve("t05.pdf");if(!Files.isRegularFile(pdf))throw new IOException("LibreOffice did not create PDF");int pages=parsePages(runTool(pdfinfo,pdf.toString()));Path txt=root.resolve("t05.txt");runTool(pdftotext,"-layout",pdf.toString(),txt.toString());String imageList=runTool(pdfimages,"-list",pdf.toString());int images=0;for(String line:imageList.split("\\R"))if(line.matches("\\s*\\d+\\s+\\d+\\s+image\\s+.*"))images++;return new RenderedPdf(pages,Files.readString(txt,StandardCharsets.UTF_8),images);}
    private static String runTool(Path command,String...args)throws Exception{ArrayList<String>line=new ArrayList<>();line.add(command.toString());line.addAll(List.of(args));Process p=new ProcessBuilder(line).redirectErrorStream(true).start();byte[]o=p.getInputStream().readAllBytes();if(!p.waitFor(60,TimeUnit.SECONDS)){p.destroyForcibly();throw new IOException("tool timeout: "+command);}if(p.exitValue()!=0)throw new IOException("tool failed: "+command+" output="+new String(o,StandardCharsets.UTF_8));return new String(o,StandardCharsets.UTF_8);}
    private static int parsePages(String info){for(String line:info.split("\\R"))if(line.startsWith("Pages:"))return Integer.parseInt(line.substring("Pages:".length()).strip());throw new IllegalArgumentException("pdfinfo Pages missing");}
    private static UniversalDocumentSpine spine(Path root,RenderProofWorker worker)throws Exception{Clock clock=Clock.systemUTC();FilePlatform008Repository repo=new FilePlatform008Repository(root.resolve("meta"));GovernedArtifactGateway gateway=new GovernedArtifactGateway(root.resolve("bytes"),ArtifactIntakePolicy.conservative(64L*1024*1024),repo,clock);return new UniversalDocumentSpine(gateway,new FileDocumentSpineCheckpointStore(root.resolve("cp")),new FileDocumentSpineVersionStore(root.resolve("versions")),new DocumentSpineProofService(new DocumentProcessingService(),worker,clock),clock,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(clock));}
    private static DocumentSpineJob job(String sourceId,String resultId){return new DocumentSpineJob(UuidV7.create().toString(),UuidV7.create().toString(),sourceId,resultId,sourceId+".docx",DocumentFormat.DOCX.mediaType(),DocumentSpineMode.MASTER,DocumentFormat.DOCX,DocumentSpinePublicationClass.VERIFIED_DRAFT,allCapabilities(),"DOCUMENT-DOCX-MASTERY-T05-EXTERNAL","qualification",java.time.Instant.now());}
    private static Set<String> allCapabilities(){LinkedHashSet<String>ids=new LinkedHashSet<>(T05);for(int i=1;i<=21;i++)ids.add("UDM-SPINE-"+String.format(java.util.Locale.ROOT,"%04d",i));for(int i=34;i<=54;i++)ids.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));ids.add("UDM-FOUNDATION-0064");for(int i=76;i<=85;i++)ids.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(ids);}
    private static Set<String> t05Capabilities(){LinkedHashSet<String>out=new LinkedHashSet<>();for(int i=256;i<=315;i++)out.add("UDM-DOCX-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(out);}
    private static CanonicalDocumentGraphV2 project(byte[] bytes)throws Exception{return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX,bytes);}
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
    private static void deleteTree(Path root)throws Exception{if(!Files.exists(root))return;try(var walk=Files.walk(root)){for(Path p:walk.sorted(java.util.Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}}
    private record RenderedPdf(int pages,String text,int imageCount){}
}
