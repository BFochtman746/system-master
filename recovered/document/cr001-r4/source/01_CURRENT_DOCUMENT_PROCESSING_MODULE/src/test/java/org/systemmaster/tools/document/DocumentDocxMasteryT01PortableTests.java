package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.spine.DocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.DocumentSpineStage;
import org.systemmaster.tools.document.spine.DocumentSpineStageReceipt;
import org.systemmaster.tools.document.spine.DocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxNativeMasteryEngine;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY/T01 portable semantic + governed-spine qualification. */
public final class DocumentDocxMasteryT01PortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T21:00:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T01_CAPABILITIES = t01Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testTypedReadExtractAndMalformedInput();
        testRunAndParagraphCreateMasterThroughSpine();
        testStyleCreationInheritanceAndPreservationThroughSpine();
        testSectionAndPageGeometryCreateMasterThroughSpine();
        testWrongTargetFailsClosedAndPersistsFailure();
        System.out.println("DOCUMENT_DOCX_MASTERY_T01_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T01_CAPABILITIES.size());
    }

    private static void testTypedReadExtractAndMalformedInput() throws Exception {
        DocxNativeMasteryEngine mastery = new DocxNativeMasteryEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Alpha", "Beta"));
        source = mastery.formatRun(source, "body/p:1/r:1", new DocxNativeMasteryEngine.RunFormat("", true, true, "single", "AA0000", "Aptos", 24, "en-US"));
        source = mastery.formatParagraph(source, "body/p:1", new DocxNativeMasteryEngine.ParagraphFormat("", "center", 720, 360, 240, null, 120, 180, 280, true, true, true));
        source = mastery.formatSection(source, "body/sectPr:1", new DocxNativeMasteryEngine.SectionFormat(12240, 15840, "portrait", 1440, 1440, 1440, 1440, 720, 720, 0));

        DocxNativeMasteryEngine.RunSnapshot run = mastery.readRun(source, "body/p:1/r:1");
        check(run.text().equals("Alpha"), "typed run READ returns text");
        check(Boolean.TRUE.equals(run.format().bold()) && Boolean.TRUE.equals(run.format().italic()), "typed run READ returns emphasis");
        check(run.format().colorHex().equals("AA0000") && run.format().fontAscii().equals("Aptos"), "typed character formatting extracted");
        check(Integer.valueOf(24).equals(run.format().sizeHalfPoints()) && run.format().language().equals("en-US"), "typed run size/language extracted");

        DocxNativeMasteryEngine.ParagraphSnapshot paragraph = mastery.readParagraph(source, "body/p:1");
        check(paragraph.text().equals("Alpha"), "typed paragraph READ returns text");
        check(paragraph.format().alignment().equals("center"), "paragraph alignment extracted");
        check(Integer.valueOf(720).equals(paragraph.format().leftTwips()) && Integer.valueOf(240).equals(paragraph.format().firstLineTwips()), "paragraph indents extracted");
        check(Integer.valueOf(120).equals(paragraph.format().spacingBeforeTwips()) && Integer.valueOf(280).equals(paragraph.format().lineTwips()), "paragraph spacing extracted");
        check(Boolean.TRUE.equals(paragraph.format().keepNext()) && Boolean.TRUE.equals(paragraph.format().keepLines()), "paragraph pagination controls extracted");

        DocxNativeMasteryEngine.SectionSnapshot section = mastery.readSection(source, "body/sectPr:1");
        check(Integer.valueOf(12240).equals(section.format().widthTwips()) && Integer.valueOf(15840).equals(section.format().heightTwips()), "page size extracted");
        check(section.format().orientation().equals("portrait"), "page orientation extracted");
        check(Integer.valueOf(1440).equals(section.format().marginLeftTwips()) && Integer.valueOf(720).equals(section.format().marginHeaderTwips()), "page margins extracted");

        CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        CanonicalDocumentGraphV2.Element runElement = element(graph, CanonicalDocumentGraphV2.ElementType.RUN, "Alpha");
        check("1".equals(runElement.style().declaredProperties().get("b.val")), "CDG-2 extracts direct bold formatting");
        check("Aptos".equals(runElement.style().declaredProperties().get("rFonts.ascii")), "CDG-2 extracts font family");
        CanonicalDocumentGraphV2.Element paragraphElement = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Alpha");
        check("center".equals(paragraphElement.style().declaredProperties().get("jc")), "CDG-2 extracts paragraph formatting");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "12240".equals(e.geometry().width())), "CDG-2 extracts section page geometry");

        byte[] macroSource = addMacroPart(source);
        byte[] macroBefore = OoxmlPackageSupport.read(macroSource).get("word/vbaProject.bin");
        byte[] macroFormatted = mastery.formatRun(macroSource, "body/p:1/r:1", new DocxNativeMasteryEngine.RunFormat("", true, null, "", "", "", null, ""));
        check(java.util.Arrays.equals(macroBefore, OoxmlPackageSupport.read(macroFormatted).get("word/vbaProject.bin")), "typed DOCX mutation preserves macro payload bytes without execution");

        byte[] hostile = hostileDocument(source);
        byte[] finalizedSource = source;
        expectIo(() -> mastery.readRun(hostile, "body/p:1/r:1"), "DTD/XXE malformed DOCX fails closed in mastery reader");
        expectIllegal(() -> mastery.readRun(finalizedSource, "body/../p:1/r:1"), "unsafe locator traversal rejected");
    }

    private static void testRunAndParagraphCreateMasterThroughSpine() throws Exception {
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Alpha", "Beta")));
        byte[] customBefore = OoxmlPackageSupport.read(source).get("customXml/mastery.xml");

        CanonicalDocumentGraphV2 graph = project(source);
        String alphaParagraph = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Alpha").id();
        Map<String, String> insertRun = Map.of(
                "docx.action", "INSERT_RUN",
                "text", " Gamma",
                "run.bold", "true",
                "run.colorHex", "336699",
                "run.sizeHalfPoints", "26");
        DocumentSpineResult inserted = executeMaster(source, alphaParagraph, DocumentOperationContract.Type.INSERT_CONTENT, insertRun, Set.of("word/document.xml"), "insert-run");
        check(inserted.preservation().pass(), "run CREATE preserves unrelated native parts");
        check(inserted.publication() != null, "run CREATE publishes proved draft through spine");
        Map<String, byte[]> insertedParts = OoxmlPackageSupport.read(inserted.resultBytes());
        check(java.util.Arrays.equals(customBefore, insertedParts.get("customXml/mastery.xml")), "custom XML preserved byte-for-byte during run CREATE");
        CanonicalDocumentGraphV2 insertedGraph = project(inserted.resultBytes());
        CanonicalDocumentGraphV2.Element gamma = element(insertedGraph, CanonicalDocumentGraphV2.ElementType.RUN, "Gamma");
        check("1".equals(gamma.style().declaredProperties().get("b.val")), "run CREATE carries bold formatting into CDG-2");
        check("336699".equals(gamma.style().declaredProperties().get("color.val")), "run CREATE carries color formatting into CDG-2");

        Map<String, String> formatRun = Map.of(
                "docx.action", "FORMAT_RUN",
                "run.italic", "true",
                "run.underline", "double",
                "run.fontAscii", "Arial",
                "run.language", "en-US");
        DocumentSpineResult formatted = executeMaster(inserted.resultBytes(), gamma.id(), DocumentOperationContract.Type.FORMAT, formatRun, Set.of("word/document.xml"), "format-run");
        CanonicalDocumentGraphV2 formattedGraph = project(formatted.resultBytes());
        CanonicalDocumentGraphV2.Element formattedGamma = element(formattedGraph, CanonicalDocumentGraphV2.ElementType.RUN, "Gamma");
        check("1".equals(formattedGamma.style().declaredProperties().get("i.val")), "run MASTER applies italic");
        check("double".equals(formattedGamma.style().declaredProperties().get("u.val")), "run MASTER applies underline");
        check("Arial".equals(formattedGamma.style().declaredProperties().get("rFonts.ascii")), "run MASTER applies font family");
        check("en-US".equals(formattedGamma.style().declaredProperties().get("lang.val")), "run MASTER applies language");

        CanonicalDocumentGraphV2 graph2 = project(formatted.resultBytes());
        String betaParagraph = element(graph2, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Beta").id();
        Map<String, String> insertParagraph = new LinkedHashMap<>();
        insertParagraph.put("docx.action", "INSERT_PARAGRAPH");
        insertParagraph.put("text", "Inserted paragraph");
        insertParagraph.put("paragraph.alignment", "right");
        insertParagraph.put("paragraph.leftTwips", "540");
        insertParagraph.put("paragraph.spacingBeforeTwips", "100");
        insertParagraph.put("paragraph.keepNext", "true");
        insertParagraph.put("run.bold", "true");
        DocumentSpineResult paragraphInserted = executeMaster(formatted.resultBytes(), betaParagraph, DocumentOperationContract.Type.INSERT_CONTENT, Map.copyOf(insertParagraph), Set.of("word/document.xml"), "insert-paragraph");
        CanonicalDocumentGraphV2 paragraphGraph = project(paragraphInserted.resultBytes());
        CanonicalDocumentGraphV2.Element insertedParagraphElement = element(paragraphGraph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Inserted paragraph");
        check("right".equals(insertedParagraphElement.style().declaredProperties().get("jc")), "paragraph CREATE carries alignment");
        check("540".equals(insertedParagraphElement.style().declaredProperties().get("ind.left")), "paragraph CREATE carries indentation");
        check("1".equals(insertedParagraphElement.style().declaredProperties().get("keepNext.val")), "paragraph CREATE carries pagination control");

        Map<String, String> formatParagraph = Map.of(
                "docx.action", "FORMAT_PARAGRAPH",
                "paragraph.alignment", "both",
                "paragraph.spacingAfterTwips", "240",
                "paragraph.lineTwips", "300",
                "paragraph.keepLines", "true",
                "paragraph.widowControl", "true");
        DocumentSpineResult paragraphFormatted = executeMaster(paragraphInserted.resultBytes(), insertedParagraphElement.id(), DocumentOperationContract.Type.FORMAT, formatParagraph, Set.of("word/document.xml"), "format-paragraph");
        CanonicalDocumentGraphV2.Element masteredParagraph = element(project(paragraphFormatted.resultBytes()), CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Inserted paragraph");
        check("both".equals(masteredParagraph.style().declaredProperties().get("jc")), "paragraph MASTER applies justification");
        check("240".equals(masteredParagraph.style().declaredProperties().get("spacing.after")), "paragraph MASTER applies spacing");
        check("1".equals(masteredParagraph.style().declaredProperties().get("keepLines.val")), "paragraph MASTER applies keep-lines");
    }

    private static void testStyleCreationInheritanceAndPreservationThroughSpine() throws Exception {
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Styled Alpha", "Styled Beta")));
        CanonicalDocumentGraphV2 graph = project(source);
        String rootId = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id();

        Map<String, String> base = Map.of(
                "docx.action", "UPSERT_STYLE",
                "style.id", "MasteryBase",
                "style.type", "paragraph",
                "style.name", "Mastery Base",
                "style.run.fontAscii", "Aptos",
                "style.run.sizeHalfPoints", "22",
                "style.paragraph.spacingAfterTwips", "120");
        DocumentSpineResult baseResult = executeMaster(source, rootId, DocumentOperationContract.Type.FORMAT, base,
                Set.of("word/styles.xml", "[Content_Types].xml", "word/_rels/document.xml.rels"), "create-base-style");
        check(new DocxNativeMasteryEngine().readStyles(baseResult.resultBytes()).containsKey("MasteryBase"), "paragraph style CREATE produces styles.xml semantic object");

        CanonicalDocumentGraphV2 baseGraph = project(baseResult.resultBytes());
        String baseRoot = baseGraph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id();
        Map<String, String> derived = Map.of(
                "docx.action", "UPSERT_STYLE",
                "style.id", "MasteryHeading",
                "style.type", "paragraph",
                "style.name", "Mastery Heading",
                "style.basedOn", "MasteryBase",
                "style.run.bold", "true",
                "style.run.colorHex", "1F4E79",
                "style.paragraph.keepNext", "true");
        DocumentSpineResult derivedResult = executeMaster(baseResult.resultBytes(), baseRoot, DocumentOperationContract.Type.FORMAT, derived,
                Set.of("word/styles.xml"), "create-derived-style");
        DocxNativeMasteryEngine.StyleSnapshot style = new DocxNativeMasteryEngine().readStyles(derivedResult.resultBytes()).get("MasteryHeading");
        check(style != null && style.basedOn().equals("MasteryBase"), "style inheritance CREATE records basedOn");
        check(Boolean.TRUE.equals(style.run().bold()), "derived style run formatting extracted");

        CanonicalDocumentGraphV2 derivedGraph = project(derivedResult.resultBytes());
        String styledAlpha = element(derivedGraph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Styled Alpha").id();
        DocumentSpineResult applied = executeMaster(
                derivedResult.resultBytes(),
                styledAlpha,
                DocumentOperationContract.Type.FORMAT,
                Map.of("docx.action", "FORMAT_PARAGRAPH", "paragraph.styleId", "MasteryHeading"),
                Set.of("word/document.xml"),
                "apply-derived-style");
        CanonicalDocumentGraphV2.Element paragraph = element(project(applied.resultBytes()), CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Styled Alpha");
        check(paragraph.style().declaredStyleId().equals("MasteryHeading"), "paragraph MASTER applies created style");
        check(paragraph.style().inheritanceChain().equals(List.of("MasteryHeading", "MasteryBase")), "CDG-2 resolves transitive style inheritance order");
        check("22".equals(paragraph.style().resolvedProperties().get("sz.val")), "style inheritance resolves base size");
        check("1".equals(paragraph.style().resolvedProperties().get("b.val")), "style inheritance resolves derived bold");
        check("1".equals(paragraph.style().resolvedProperties().get("keepNext.val")), "style inheritance resolves paragraph keep-next");

        Map<String, byte[]> before = OoxmlPackageSupport.read(source);
        Map<String, byte[]> after = OoxmlPackageSupport.read(applied.resultBytes());
        check(java.util.Arrays.equals(before.get("customXml/mastery.xml"), after.get("customXml/mastery.xml")), "style operations preserve unknown custom XML");
    }

    private static void testSectionAndPageGeometryCreateMasterThroughSpine() throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Section Alpha", "Section Beta"));
        CanonicalDocumentGraphV2 graph = project(source);
        String alpha = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Section Alpha").id();
        Map<String, String> createSection = Map.ofEntries(
                Map.entry("docx.action", "INSERT_SECTION"),
                Map.entry("section.widthTwips", "15840"),
                Map.entry("section.heightTwips", "12240"),
                Map.entry("section.orientation", "landscape"),
                Map.entry("section.marginTopTwips", "900"),
                Map.entry("section.marginRightTwips", "1000"),
                Map.entry("section.marginBottomTwips", "900"),
                Map.entry("section.marginLeftTwips", "1000"),
                Map.entry("section.marginHeaderTwips", "500"),
                Map.entry("section.marginFooterTwips", "500"),
                Map.entry("section.gutterTwips", "100"));
        DocumentSpineResult inserted = executeMaster(source, alpha, DocumentOperationContract.Type.INSERT_CONTENT, createSection, Set.of("word/document.xml"), "insert-section");
        CanonicalDocumentGraphV2 insertedGraph = project(inserted.resultBytes());
        List<CanonicalDocumentGraphV2.Element> sections = insertedGraph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION).toList();
        check(sections.size() == 2, "section CREATE projects both boundary and final section");
        CanonicalDocumentGraphV2.Element created = sections.stream().filter(e -> "landscape".equals(e.geometry().properties().get("orientation"))).findFirst().orElseThrow();
        check("15840".equals(created.geometry().width()) && "12240".equals(created.geometry().height()), "section CREATE carries page size");
        check("1000".equals(created.geometry().properties().get("margin.leftTwips")), "section CREATE carries margins");

        Map<String, String> formatSection = Map.of(
                "docx.action", "FORMAT_SECTION",
                "section.marginLeftTwips", "1440",
                "section.marginRightTwips", "1440",
                "section.marginTopTwips", "1080",
                "section.marginBottomTwips", "1080");
        DocumentSpineResult mastered = executeMaster(inserted.resultBytes(), created.id(), DocumentOperationContract.Type.FORMAT, formatSection, Set.of("word/document.xml"), "format-section");
        CanonicalDocumentGraphV2.Element masteredSection = project(mastered.resultBytes()).requireElement(created.id());
        check("1440".equals(masteredSection.geometry().properties().get("margin.leftTwips")), "section MASTER updates left margin");
        check("1080".equals(masteredSection.geometry().properties().get("margin.topTwips")), "section MASTER updates top margin");
        check("landscape".equals(masteredSection.geometry().properties().get("orientation")), "section MASTER preserves unrelated orientation");
    }

    private static void testWrongTargetFailsClosedAndPersistsFailure() throws Exception {
        Path root = Files.createTempDirectory("docx-mastery-wrong-target-");
        try {
            byte[] source = new DocxFullLaneEngine().createDocument(List.of("Wrong target"));
            CanonicalDocumentGraphV2 graph = project(source);
            String run = element(graph, CanonicalDocumentGraphV2.ElementType.RUN, "Wrong target").id();
            DocumentOperationContract operation = operation(
                    graph,
                    run,
                    DocumentOperationContract.Type.FORMAT,
                    Map.of("docx.action", "FORMAT_PARAGRAPH", "paragraph.alignment", "center"),
                    Set.of("word/document.xml"),
                    "wrong-target");
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, "wrong-target-source", "wrong-target-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(run), allCapabilities(), List.of());
            expectAny(() -> spine(root).executeExisting(job, new ByteArrayInputStream(source), plan), "wrong semantic target fails closed");
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(receipts.stream().anyMatch(r -> r.stage() == DocumentSpineStage.MASTER && r.status() == DocumentSpineStageReceipt.Status.FAIL), "wrong-target failure is durably checkpointed");
        } finally {
            deleteTree(root);
        }
    }

    private static DocumentSpineResult executeMaster(
            byte[] source,
            String targetId,
            DocumentOperationContract.Type type,
            Map<String, String> parameters,
            Set<String> expectedParts,
            String label) throws Exception {
        Path root = Files.createTempDirectory("docx-mastery-" + label + "-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            DocumentOperationContract operation = operation(graph, targetId, type, parameters, expectedParts, label);
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, label + "-source", label + "-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(targetId), allCapabilities(), List.of());
            DocumentSpineResult result = spine(root).executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.preservation() != null && result.preservation().pass(), label + " preservation gate passes");
            check(result.finalization() != null && result.finalization().missing().isEmpty(), label + " required proof gates pass");
            check(result.version() != null, label + " receives version receipt");
            return result;
        } finally {
            deleteTree(root);
        }
    }

    private static DocumentOperationContract operation(
            CanonicalDocumentGraphV2 graph,
            String targetId,
            DocumentOperationContract.Type type,
            Map<String, String> parameters,
            Set<String> expectedParts,
            String label) {
        return new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "docx-mastery-t01-" + label,
                graph.sourceSha256(),
                graph.semanticDigest(),
                type,
                List.of(DocumentSelector.node(targetId)),
                "DOCUMENT-DOCX-MASTERY/T01 semantic native operation " + label,
                parameters,
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                graph.sourceSha256(),
                expectedParts,
                DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,
                false,
                List.of(),
                false,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    private static UniversalDocumentSpine spine(Path root) throws Exception {
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"),
                ArtifactIntakePolicy.conservative(32L * 1024 * 1024),
                repository,
                CLOCK);
        DocumentSpineCheckpointStore checkpoints = checkpointStore(root);
        DocumentSpineVersionStore versions = new FileDocumentSpineVersionStore(root.resolve("spine-versions"));
        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), new SyntheticRenderer(), CLOCK);
        return new UniversalDocumentSpine(gateway, checkpoints, versions, proofs, CLOCK);
    }

    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception {
        return new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints"));
    }

    private static DocumentSpineJob job(DocumentSpineMode mode, String sourceId, String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + ".docx",
                DocumentFormat.DOCX.mediaType(),
                mode,
                DocumentFormat.DOCX,
                DocumentSpinePublicationClass.VERIFIED_DRAFT,
                allCapabilities(),
                "docx-mastery-t01",
                "docx-mastery-t01",
                FIXED);
    }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>(T01_CAPABILITIES);
        for (int i = 1; i <= 21; i++) out.add("UDM-SPINE-" + String.format(LocaleHolder.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) out.add("UDM-FOUNDATION-" + String.format(LocaleHolder.ROOT, "%04d", i));
        out.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) out.add("UDM-FOUNDATION-" + String.format(LocaleHolder.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static Set<String> t01Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        addRange(out, 6, 25);
        addRange(out, 36, 40);
        addRange(out, 56, 75);
        return Set.copyOf(out);
    }

    private static void addRange(Set<String> out, int from, int to) {
        for (int i = from; i <= to; i++) out.add("UDM-DOCX-" + String.format(LocaleHolder.ROOT, "%04d", i));
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception {
        return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes);
    }

    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type, String text) {
        return graph.elements().stream()
                .filter(e -> e.type() == type && e.text().contains(text))
                .findFirst()
                .orElseThrow(() -> new AssertionError("element not found: " + type + " text=" + text));
    }

    private static byte[] addPreservedParts(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/mastery.xml", "<mastery xmlns=\"urn:mastery\">preserve</mastery>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addMacroPart(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("word/vbaProject.bin", new byte[] { 0x01, 0x23, 0x45, 0x67, 0x00, (byte) 0xff });
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] hostileDocument(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        String hostile = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY y SYSTEM \"file:///etc/passwd\">]><w:document xmlns:w=\"" + DocxNativeMasteryEngine.WORD_NS + "\"><w:body><w:p><w:r><w:t>&y;</w:t></w:r></w:p><w:sectPr/></w:body></w:document>";
        parts.put("word/document.xml", hostile.getBytes(StandardCharsets.UTF_8));
        return rawZip(parts);
    }

    private static byte[] rawZip(Map<String, byte[]> entries) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        try (java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(out)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                java.util.zip.ZipEntry zipEntry = new java.util.zip.ZipEntry(entry.getKey());
                zipEntry.setTime(0L);
                zip.putNextEntry(zipEntry);
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIo(Throwing action, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IOException expected) {
            // Expected.
        }
    }

    private static void expectIllegal(Throwing action, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException expected) {
            // Expected.
        }
    }

    private static void expectAny(Throwing action, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (IllegalArgumentException | IllegalStateException | UnsupportedOperationException expected) {
            // Expected.
        }
    }

    private static String sha(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }

    @FunctionalInterface
    private interface Throwing { void run() throws Exception; }

    private static final class LocaleHolder { private static final java.util.Locale ROOT = java.util.Locale.ROOT; }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override
        public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(
                    RenderProofReceipt.SCHEMA_V1,
                    request.format(),
                    sha(request.artifact()),
                    sha(rendered),
                    "SyntheticIndependentRenderer",
                    "docx-mastery-t01",
                    "SyntheticRasterOracle",
                    "docx-mastery-t01",
                    FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)),
                    List.of(),
                    Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
}
