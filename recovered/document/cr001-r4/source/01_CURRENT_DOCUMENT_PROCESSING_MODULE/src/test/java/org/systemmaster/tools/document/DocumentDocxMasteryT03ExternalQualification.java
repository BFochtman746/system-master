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
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxParagraphMechanicsEngine;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** LibreOffice + Poppler qualification for DOCUMENT-DOCX-MASTERY-T03. */
public final class DocumentDocxMasteryT03ExternalQualification {
    private static final Set<String> T03_CAPABILITIES = t03Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("usage: <soffice> <pdfinfo> <pdftotext> <pdftoppm> <pdfimages>");
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        LocalLibreOfficePopplerRenderWorker worker = LocalLibreOfficePopplerRenderWorker.standard(soffice, pdfinfo, pdftotext, Path.of(args[3]), Path.of(args[4]));
        Path root = Files.createTempDirectory("document-docx-mastery-t03-external-");
        try {
            qualify(root, worker, soffice, pdfinfo, pdftotext);
            System.out.println("DOCUMENT_DOCX_MASTERY_T03_EXTERNAL_PASS assertions=" + assertions + " capabilities=" + T03_CAPABILITIES.size());
        } finally { deleteTree(root); }
    }

    private static void qualify(Path root, RenderProofWorker worker, Path soffice, Path pdfinfo, Path pdftotext) throws Exception {
        DocxParagraphMechanicsEngine engine = new DocxParagraphMechanicsEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("T03 Bullet Alpha", "T03 Bullet Beta", "T03 Number One", "T03 Nested One"));
        source = engine.upsertNumberingDefinition(source, new DocxParagraphMechanicsEngine.NumberingDefinition(30, 30, List.of(
                new DocxParagraphMechanicsEngine.NumberingLevel(0, 1, "bullet", "•", "tab", "left", 720, 360))));
        source = engine.upsertNumberingDefinition(source, new DocxParagraphMechanicsEngine.NumberingDefinition(31, 31, List.of(
                new DocxParagraphMechanicsEngine.NumberingLevel(0, 1, "decimal", "%1.", "tab", "left", 720, 360),
                new DocxParagraphMechanicsEngine.NumberingLevel(1, 1, "lowerLetter", "%2)", "tab", "left", 1440, 360))));
        source = engine.assignNumbering(source, "body/p:1", new DocxParagraphMechanicsEngine.NumberingReference(30, 0));
        source = engine.assignNumbering(source, "body/p:2", new DocxParagraphMechanicsEngine.NumberingReference(30, 0));
        source = engine.assignNumbering(source, "body/p:3", new DocxParagraphMechanicsEngine.NumberingReference(31, 0));
        source = engine.assignNumbering(source, "body/p:4", new DocxParagraphMechanicsEngine.NumberingReference(31, 1));
        source = engine.formatParagraphSpacing(source, "body/p:1", new DocxParagraphMechanicsEngine.ParagraphSpacing(120, 240, false, false, false));
        source = engine.formatIndentation(source, "body/p:1", new DocxParagraphMechanicsEngine.Indentation(720, 0, null, 360));
        source = engine.formatPaginationControls(source, "body/p:3", new DocxParagraphMechanicsEngine.PaginationControls(true, true, true));
        source = engine.formatBorderShading(source, "body/p:3", new DocxParagraphMechanicsEngine.BorderShading(
                new DocxParagraphMechanicsEngine.ParagraphBorders(null, null, new DocxParagraphMechanicsEngine.BorderEdge("single", 8, 2, "4472C4"), null, null, null),
                new DocxParagraphMechanicsEngine.Shading("clear", "EAF2F8", "AUTO")));

        CanonicalDocumentGraphV2 graph = project(source);
        String p1 = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH && e.text().contains("T03 Bullet Alpha")).findFirst().orElseThrow().id();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "FORMAT_TABS");
        params.put("tabs.count", "1");
        params.put("tabs.1.positionTwips", "2160");
        params.put("tabs.1.alignment", "right");
        params.put("tabs.1.leader", "dot");
        DocumentOperationContract op = new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "t03-external-tabs", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.FORMAT,
                List.of(DocumentSelector.node(p1)), "T03 external list/layout proof", params, DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(), Set.of("word/document.xml"),
                DocumentOperationContract.VisualImpact.LAYOUT_CHANGE, false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        DocumentSpineJob job = job("t03-external-source", "t03-external-result");
        DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(p1), allCapabilities(), List.of());
        DocumentSpineResult result = spine(root, worker).executeExisting(job, new ByteArrayInputStream(source), plan);
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "external T03 publishes verified draft");
        check(result.preservation() != null && result.preservation().pass(), "external T03 native preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), "external T03 proof set complete");
        check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.RENDERED && r.status() == DocumentProofReceipt.Status.PASS), "LibreOffice/Poppler render proof passes");
        check(engine.readTabs(result.resultBytes(), "body/p:1").size() == 1, "external candidate retains governed tab mutation");
        check("bullet".equals(engine.readNumbering(result.resultBytes(), "body/p:1").kind()), "external candidate retains bullet numbering");
        check("multilevel".equals(engine.readNumbering(result.resultBytes(), "body/p:4").kind()), "external candidate retains multilevel numbering");
        check(Boolean.TRUE.equals(engine.readPaginationControls(result.resultBytes(), "body/p:3").keepNext()), "external candidate retains keep-with-next");
        CanonicalDocumentGraphV2 projected = project(result.resultBytes());
        check(projected.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.LIST).count() == 2, "external candidate reprojects two list definitions");
        check(projected.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.LIST_ITEM).count() == 4, "external candidate reprojects four list items");

        RenderedPdf rendered = renderToPdf(root.resolve("manual-oracle"), result.resultBytes(), soffice, pdfinfo, pdftotext);
        check(rendered.pages() >= 1, "LibreOffice renders T03 candidate to PDF");
        check(rendered.text().contains("T03 Bullet Alpha") && rendered.text().contains("T03 Nested One"), "Poppler extracts all list body text");
        check(rendered.text().contains("1.") || rendered.text().matches("(?s).*\\b1[.)].*"), "LibreOffice/Poppler expose numbered-list marker");
        check(rendered.text().contains("a)") || rendered.text().contains("a."), "LibreOffice/Poppler expose nested alphabetic marker");
    }

    private static RenderedPdf renderToPdf(Path root, byte[] docx, Path soffice, Path pdfinfo, Path pdftotext) throws Exception {
        Files.createDirectories(root); Path input=root.resolve("t03.docx"); Path out=root.resolve("out"); Files.createDirectories(out); Files.write(input,docx);
        Process convert=new ProcessBuilder(soffice.toString(),"--headless","--convert-to","pdf","--outdir",out.toString(),input.toString()).redirectErrorStream(true).start();
        byte[] output=convert.getInputStream().readAllBytes(); if(!convert.waitFor(120, TimeUnit.SECONDS)){convert.destroyForcibly();throw new IOException("LibreOffice conversion timeout");}
        if(convert.exitValue()!=0) throw new IOException("LibreOffice conversion failed: "+new String(output,StandardCharsets.UTF_8));
        Path pdf=out.resolve("t03.pdf"); if(!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not create PDF");
        String info=runTool(pdfinfo,pdf.toString()); int pages=parsePages(info); Path txt=root.resolve("t03.txt"); runTool(pdftotext,"-layout",pdf.toString(),txt.toString());
        return new RenderedPdf(pages,Files.readString(txt,StandardCharsets.UTF_8));
    }
    private static String runTool(Path command,String...args)throws Exception{ArrayList<String> line=new ArrayList<>();line.add(command.toString());line.addAll(List.of(args));Process p=new ProcessBuilder(line).redirectErrorStream(true).start();byte[] o=p.getInputStream().readAllBytes();if(!p.waitFor(60,TimeUnit.SECONDS)){p.destroyForcibly();throw new IOException("tool timeout: "+command);}if(p.exitValue()!=0)throw new IOException("tool failed: "+command+" output="+new String(o,StandardCharsets.UTF_8));return new String(o,StandardCharsets.UTF_8);}
    private static int parsePages(String info){for(String line:info.split("\\R"))if(line.startsWith("Pages:"))return Integer.parseInt(line.substring("Pages:".length()).strip());throw new IllegalArgumentException("pdfinfo Pages missing");}
    private static UniversalDocumentSpine spine(Path root,RenderProofWorker worker)throws Exception{Clock clock=Clock.systemUTC();FilePlatform008Repository repo=new FilePlatform008Repository(root.resolve("platform008-meta"));GovernedArtifactGateway gateway=new GovernedArtifactGateway(root.resolve("platform008-bytes"),ArtifactIntakePolicy.conservative(32L*1024*1024),repo,clock);return new UniversalDocumentSpine(gateway,new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")),new FileDocumentSpineVersionStore(root.resolve("spine-versions")),new DocumentSpineProofService(new DocumentProcessingService(),worker,clock),clock,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(clock));}
    private static DocumentSpineJob job(String sourceId,String resultId){return new DocumentSpineJob(UuidV7.create().toString(),UuidV7.create().toString(),sourceId,resultId,sourceId+".docx",DocumentFormat.DOCX.mediaType(),DocumentSpineMode.MASTER,DocumentFormat.DOCX,DocumentSpinePublicationClass.VERIFIED_DRAFT,allCapabilities(),"DOCUMENT-DOCX-MASTERY-T03-EXTERNAL","qualification",java.time.Instant.now());}
    private static Set<String> allCapabilities(){LinkedHashSet<String> ids=new LinkedHashSet<>(T03_CAPABILITIES);for(int i=1;i<=21;i++)ids.add("UDM-SPINE-"+String.format(java.util.Locale.ROOT,"%04d",i));for(int i=34;i<=54;i++)ids.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));ids.add("UDM-FOUNDATION-0064");for(int i=76;i<=85;i++)ids.add("UDM-FOUNDATION-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(ids);}
    private static Set<String> t03Capabilities(){LinkedHashSet<String> out=new LinkedHashSet<>();for(int i=136;i<=195;i++)out.add("UDM-DOCX-"+String.format(java.util.Locale.ROOT,"%04d",i));return Set.copyOf(out);}
    private static CanonicalDocumentGraphV2 project(byte[] bytes)throws Exception{return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX,bytes);}
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
    private static void deleteTree(Path root)throws Exception{if(!Files.exists(root))return;try(var walk=Files.walk(root)){for(Path p:walk.sorted(java.util.Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}}
    private record RenderedPdf(int pages,String text){}
}
