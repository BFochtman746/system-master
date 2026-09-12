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
import org.systemmaster.tools.docx.DocxParagraphMechanicsEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

import java.io.ByteArrayInputStream;
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

/** DOCUMENT-DOCX-MASTERY-T03 portable semantic + governed-spine qualification. */
public final class DocumentDocxMasteryT03PortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T23:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T03_CAPABILITIES = t03Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testParagraphMechanicsReadCreateEditRoundTrip();
        testListBulletNumberingAndMultilevelCanonicalSemantics();
        testGovernedSpineParagraphMechanics();
        testGovernedSpineNumbering();
        testNegativeAndDurableFailure();
        System.out.println("DOCUMENT_DOCX_MASTERY_T03_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T03_CAPABILITIES.size());
    }

    private static void testParagraphMechanicsReadCreateEditRoundTrip() throws Exception {
        DocxParagraphMechanicsEngine engine = new DocxParagraphMechanicsEngine();
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Mechanics Alpha", "Mechanics Beta", "Mechanics Gamma")));
        byte[] preserve = OoxmlPackageSupport.read(source).get("customXml/t03.xml");
        String p = "body/p:1";

        source = engine.formatTabs(source, p, List.of(
                new DocxParagraphMechanicsEngine.TabStop(720, "left", "dot"),
                new DocxParagraphMechanicsEngine.TabStop(2880, "decimal", "none")));
        List<DocxParagraphMechanicsEngine.TabStop> tabs = engine.readTabs(source, p);
        check(tabs.size() == 2, "tabs READ returns both stops");
        check(Integer.valueOf(720).equals(tabs.get(0).positionTwips()) && "dot".equals(tabs.get(0).leader()), "tabs EXTRACT preserves position/leader");
        source = engine.formatTabs(source, p, List.of(new DocxParagraphMechanicsEngine.TabStop(1440, "center", "hyphen")));
        tabs = engine.readTabs(source, p);
        check(tabs.size() == 1 && Integer.valueOf(1440).equals(tabs.get(0).positionTwips()), "tabs MASTER replaces only tab family deterministically");

        source = engine.formatIndentation(source, p, new DocxParagraphMechanicsEngine.Indentation(720, 360, 240, null));
        DocxParagraphMechanicsEngine.Indentation ind = engine.readIndentation(source, p);
        check(Integer.valueOf(720).equals(ind.leftTwips()) && Integer.valueOf(240).equals(ind.firstLineTwips()), "indents READ/EXTRACT returns native values");
        source = engine.formatIndentation(source, p, new DocxParagraphMechanicsEngine.Indentation(1080, null, null, 360));
        ind = engine.readIndentation(source, p);
        check(Integer.valueOf(1080).equals(ind.leftTwips()) && Integer.valueOf(360).equals(ind.hangingTwips()), "indents MASTER updates sparse values");
        check(Integer.valueOf(360).equals(ind.rightTwips()) && ind.firstLineTwips() == null, "indents MASTER preserves unrelated right indent and clears conflicting first-line indent");

        source = engine.formatLineSpacing(source, p, new DocxParagraphMechanicsEngine.LineSpacing(360, "exact"));
        DocxParagraphMechanicsEngine.LineSpacing line = engine.readLineSpacing(source, p);
        check(Integer.valueOf(360).equals(line.lineTwips()) && "exact".equals(line.rule()), "line spacing READ/EXTRACT round-trips");
        source = engine.formatParagraphSpacing(source, p, new DocxParagraphMechanicsEngine.ParagraphSpacing(120, 240, false, true, true));
        DocxParagraphMechanicsEngine.ParagraphSpacing spacing = engine.readParagraphSpacing(source, p);
        check(Integer.valueOf(120).equals(spacing.beforeTwips()) && Integer.valueOf(240).equals(spacing.afterTwips()), "paragraph spacing READ/EXTRACT returns before/after");
        check(Boolean.FALSE.equals(spacing.beforeAuto()) && Boolean.TRUE.equals(spacing.afterAuto()) && Boolean.TRUE.equals(spacing.contextual()), "paragraph spacing auto/contextual semantics round-trip");

        source = engine.formatPaginationControls(source, p, new DocxParagraphMechanicsEngine.PaginationControls(false, true, true));
        DocxParagraphMechanicsEngine.PaginationControls pagination = engine.readPaginationControls(source, p);
        check(Boolean.FALSE.equals(pagination.widowControl()), "widow/orphan control READ/EXTRACT preserves explicit false");
        check(Boolean.TRUE.equals(pagination.keepNext()), "keep-with-next READ/EXTRACT round-trips");
        check(Boolean.TRUE.equals(pagination.keepLines()), "keep-lines-together READ/EXTRACT round-trips");

        DocxParagraphMechanicsEngine.BorderEdge top = new DocxParagraphMechanicsEngine.BorderEdge("double", 16, 4, "336699");
        DocxParagraphMechanicsEngine.BorderEdge bottom = new DocxParagraphMechanicsEngine.BorderEdge("single", 8, 2, "993333");
        source = engine.formatBorderShading(source, p, new DocxParagraphMechanicsEngine.BorderShading(
                new DocxParagraphMechanicsEngine.ParagraphBorders(top, null, bottom, null, null, null),
                new DocxParagraphMechanicsEngine.Shading("clear", "FFF2CC", "AUTO")));
        DocxParagraphMechanicsEngine.BorderShading decorated = engine.readBorderShading(source, p);
        check(decorated.borders().top() != null && "double".equals(decorated.borders().top().style()), "paragraph border READ returns style");
        check(decorated.borders().bottom() != null && Integer.valueOf(8).equals(decorated.borders().bottom().sizeEighthPoints()), "paragraph border EXTRACT returns size");
        check(decorated.shading() != null && "FFF2CC".equals(decorated.shading().fillHex()), "paragraph shading READ/EXTRACT returns fill");
        source = engine.formatBorderShading(source, p, new DocxParagraphMechanicsEngine.BorderShading(
                new DocxParagraphMechanicsEngine.ParagraphBorders(new DocxParagraphMechanicsEngine.BorderEdge("single", null, null, ""), null, null, null, null, null), null));
        decorated = engine.readBorderShading(source, p);
        check("single".equals(decorated.borders().top().style()) && Integer.valueOf(16).equals(decorated.borders().top().sizeEighthPoints()), "sparse border MASTER preserves unspecified size");
        check("993333".equals(decorated.borders().bottom().colorHex()) && "FFF2CC".equals(decorated.shading().fillHex()), "sparse border MASTER preserves unrelated border/shading");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element para = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Mechanics Alpha");
        check("1".equals(para.semantic().properties().get("tabs.count")), "CDG-2 extracts tabs count");
        check("1080".equals(para.semantic().properties().get("indent.leftTwips")), "CDG-2 extracts indent semantics");
        check("360".equals(para.semantic().properties().get("lineSpacing.lineTwips")), "CDG-2 extracts line spacing semantics");
        check("120".equals(para.semantic().properties().get("paragraphSpacing.beforeTwips")), "CDG-2 extracts paragraph spacing semantics");
        check("true".equals(para.semantic().properties().get("pagination.keepNext")), "CDG-2 extracts pagination controls");
        check("single".equals(para.semantic().properties().get("border.top.style")), "CDG-2 extracts paragraph border semantics");
        check("FFF2CC".equals(para.semantic().properties().get("shading.fill")), "CDG-2 extracts paragraph shading semantics");
        check(java.util.Arrays.equals(preserve, OoxmlPackageSupport.read(source).get("customXml/t03.xml")), "paragraph mechanics preserve unrelated OPC part exactly");
    }

    private static void testListBulletNumberingAndMultilevelCanonicalSemantics() throws Exception {
        DocxParagraphMechanicsEngine engine = new DocxParagraphMechanicsEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Bullet One", "Number One", "Level Zero", "Level One"));
        source = engine.upsertNumberingDefinition(source, definition(10, 10, List.of(level(0, "bullet", "•", 720, 360))));
        source = engine.upsertNumberingDefinition(source, definition(11, 11, List.of(level(0, "decimal", "%1.", 720, 360))));
        source = engine.upsertNumberingDefinition(source, definition(12, 12, List.of(
                level(0, "decimal", "%1.", 720, 360),
                level(1, "lowerLetter", "%2)", 1440, 360))));
        check(engine.readNumberingDefinitions(source).size() == 3, "numbering READ returns three independent definitions");
        source = engine.assignNumbering(source, "body/p:1", new DocxParagraphMechanicsEngine.NumberingReference(10, 0));
        source = engine.assignNumbering(source, "body/p:2", new DocxParagraphMechanicsEngine.NumberingReference(11, 0));
        source = engine.assignNumbering(source, "body/p:3", new DocxParagraphMechanicsEngine.NumberingReference(12, 0));
        source = engine.assignNumbering(source, "body/p:4", new DocxParagraphMechanicsEngine.NumberingReference(12, 1));

        DocxParagraphMechanicsEngine.NumberingSnapshot bullet = engine.readNumbering(source, "body/p:1");
        check(bullet != null && "bullet".equals(bullet.kind()), "bullet READ resolves bullet semantic kind");
        check("bullet".equals(bullet.resolvedLevel().format()) && "•".equals(bullet.resolvedLevel().text()), "bullet EXTRACT resolves native level format/text");
        DocxParagraphMechanicsEngine.NumberingSnapshot numbered = engine.readNumbering(source, "body/p:2");
        check(numbered != null && "numbered".equals(numbered.kind()), "numbering READ resolves numbered semantic kind");
        check("decimal".equals(numbered.resolvedLevel().format()), "numbering EXTRACT resolves decimal format");
        DocxParagraphMechanicsEngine.NumberingSnapshot nested = engine.readNumbering(source, "body/p:4");
        check(nested != null && "multilevel".equals(nested.kind()) && nested.reference().level() == 1, "multilevel numbering READ resolves hierarchy level");
        check("lowerLetter".equals(nested.resolvedLevel().format()), "multilevel numbering EXTRACT resolves level-specific format");

        CanonicalDocumentGraphV2 graph = project(source);
        List<CanonicalDocumentGraphV2.Element> lists = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.LIST).toList();
        List<CanonicalDocumentGraphV2.Element> items = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.LIST_ITEM).toList();
        check(lists.size() == 3, "CDG-2 creates native LIST definitions for bullet/numbered/multilevel lists");
        check(items.size() == 4, "CDG-2 creates LIST_ITEM semantics for assigned paragraphs");
        check(lists.stream().anyMatch(e -> "bullet".equals(e.semantic().properties().get("kind")) && "bullet".equals(e.data().properties().get("level.0.format"))), "CDG-2 bullet definition is structured");
        check(lists.stream().anyMatch(e -> "multilevel".equals(e.semantic().properties().get("kind")) && "lowerLetter".equals(e.data().properties().get("level.1.format"))), "CDG-2 multilevel definition retains level hierarchy");
        CanonicalDocumentGraphV2.Element levelOnePara = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Level One");
        check("12".equals(levelOnePara.semantic().properties().get("list.numId")) && "1".equals(levelOnePara.semantic().properties().get("list.level")), "paragraph canonical semantics bind numId/level");
        check(items.stream().allMatch(i -> "listitem".equals(i.accessibility().role())), "list items carry accessibility listitem role");

        byte[] edited = engine.upsertNumberingDefinition(source, definition(12, 12, List.of(
                level(0, "upperRoman", "%1.", 720, 360),
                level(1, "lowerLetter", "%2)", 1440, 360))));
        check("upperRoman".equals(engine.readNumbering(edited, "body/p:3").resolvedLevel().format()), "numbering MASTER edits target definition");
        check("bullet".equals(engine.readNumbering(edited, "body/p:1").resolvedLevel().format()), "numbering MASTER preserves unrelated definition");
        edited = engine.clearNumbering(edited, "body/p:2");
        check(engine.readNumbering(edited, "body/p:2") == null, "list MASTER can remove paragraph numbering without deleting definitions");
        check(engine.readNumberingDefinitions(edited).size() == 3, "clear numbering preserves reusable definitions");

        byte[] shared = addSharedNumberingInstance(source, 13, 10);
        byte[] detached = engine.upsertNumberingDefinition(shared, definition(10, 10, List.of(level(0, "bullet", "◦", 720, 360))));
        DocxParagraphMechanicsEngine.NumberingDefinition targetDef = engine.readNumberingDefinitions(detached).stream().filter(d -> d.numId() == 10).findFirst().orElseThrow();
        DocxParagraphMechanicsEngine.NumberingDefinition aliasDef = engine.readNumberingDefinitions(detached).stream().filter(d -> d.numId() == 13).findFirst().orElseThrow();
        check(!Integer.valueOf(targetDef.abstractNumId()).equals(aliasDef.abstractNumId()), "numbering MASTER copy-on-write detaches a shared abstractNum for target numId");
        check("◦".equals(targetDef.levels().get(0).text()), "detached target numbering receives requested edit");
        check("•".equals(aliasDef.levels().get(0).text()), "shared alias numbering preserves original definition");
    }

    private static void testGovernedSpineParagraphMechanics() throws Exception {
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Spine Mechanics", "Second")));
        CanonicalDocumentGraphV2 graph = project(source);
        String paragraph = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Spine Mechanics").id();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "FORMAT_TABS");
        params.put("tabs.count", "2");
        params.put("tabs.1.positionTwips", "720");
        params.put("tabs.1.alignment", "left");
        params.put("tabs.1.leader", "dot");
        params.put("tabs.2.positionTwips", "2880");
        params.put("tabs.2.alignment", "right");
        DocumentSpineResult result = execute(source, paragraph, DocumentOperationContract.Type.FORMAT, params, Set.of("word/document.xml"), "tabs");
        assertProved(result, "tabs");
        check(new DocxParagraphMechanicsEngine().readTabs(result.resultBytes(), "body/p:1").size() == 2, "governed spine applies typed tabs operation");
        check(OoxmlPackageSupport.read(result.resultBytes()).containsKey("customXml/t03.xml"), "governed spine preserves unrelated custom part");

        graph = project(result.resultBytes());
        paragraph = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Spine Mechanics").id();
        result = execute(result.resultBytes(), paragraph, DocumentOperationContract.Type.FORMAT, Map.of(
                "docx.action", "FORMAT_PAGINATION_CONTROLS",
                "pagination.widowControl", "false",
                "pagination.keepNext", "true",
                "pagination.keepLines", "true"), Set.of("word/document.xml"), "pagination");
        assertProved(result, "pagination");
        DocxParagraphMechanicsEngine.PaginationControls controls = new DocxParagraphMechanicsEngine().readPaginationControls(result.resultBytes(), "body/p:1");
        check(Boolean.TRUE.equals(controls.keepNext()) && Boolean.TRUE.equals(controls.keepLines()), "governed spine applies paragraph pagination semantics");
    }

    private static void testGovernedSpineNumbering() throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Spine Bullet", "Spine Nested"));
        CanonicalDocumentGraphV2 graph = project(source);
        String root = rootId(graph);
        Map<String, String> def = new LinkedHashMap<>();
        def.put("docx.action", "UPSERT_NUMBERING_DEFINITION");
        def.put("numbering.abstractNumId", "20");
        def.put("numbering.numId", "20");
        def.put("numbering.levelCount", "2");
        def.put("numbering.level.0.format", "bullet");
        def.put("numbering.level.0.text", "•");
        def.put("numbering.level.0.leftTwips", "720");
        def.put("numbering.level.0.hangingTwips", "360");
        def.put("numbering.level.1.format", "lowerLetter");
        def.put("numbering.level.1.text", "%2)");
        def.put("numbering.level.1.leftTwips", "1440");
        def.put("numbering.level.1.hangingTwips", "360");
        DocumentSpineResult defined = execute(source, root, DocumentOperationContract.Type.FORMAT, def, Set.of("word/numbering.xml", "word/_rels/document.xml.rels", "[Content_Types].xml"), "numbering-definition");
        assertProved(defined, "numbering-definition");
        check(new DocxParagraphMechanicsEngine().readNumberingDefinitions(defined.resultBytes()).size() == 1, "governed spine creates numbering definition");

        graph = project(defined.resultBytes());
        String p1 = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Spine Bullet").id();
        DocumentSpineResult assigned = execute(defined.resultBytes(), p1, DocumentOperationContract.Type.FORMAT, Map.of(
                "docx.action", "ASSIGN_NUMBERING", "numbering.numId", "20", "numbering.level", "0"), Set.of("word/document.xml"), "numbering-assign");
        assertProved(assigned, "numbering-assign");
        check("bullet".equals(new DocxParagraphMechanicsEngine().readNumbering(assigned.resultBytes(), "body/p:1").kind()), "governed spine assigns bullet numbering");
        CanonicalDocumentGraphV2 assignedGraph = project(assigned.resultBytes());
        check(assignedGraph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.LIST_ITEM && e.text().contains("Spine Bullet")), "governed spine result reprojects as canonical list item");
    }

    private static void testNegativeAndDurableFailure() throws Exception {
        DocxParagraphMechanicsEngine engine = new DocxParagraphMechanicsEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Negative T03"));
        expectIllegal(() -> new DocxParagraphMechanicsEngine.TabStop(720, "bogus", "none"), "invalid tab alignment fails closed");
        expectIllegal(() -> new DocxParagraphMechanicsEngine.Indentation(0, 0, 120, 120), "conflicting first-line/hanging indent fails closed");
        expectIllegal(() -> engine.assignNumbering(source, "body/p:1", new DocxParagraphMechanicsEngine.NumberingReference(999, 0)), "undefined numId assignment fails closed");
        expectIllegal(() -> engine.readTabs(source, "body/../p:1"), "unsafe locator traversal fails closed");

        Path root = Files.createTempDirectory("docx-t03-failure-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            String paragraph = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Negative T03").id();
            DocumentOperationContract operation = operation(graph, paragraph, DocumentOperationContract.Type.FORMAT,
                    Map.of("docx.action", "ASSIGN_NUMBERING", "numbering.numId", "999", "numbering.level", "0"), Set.of("word/document.xml"), "undefined-numbering");
            DocumentSpineJob job = job("negative-source", "negative-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(paragraph), allCapabilities(), List.of());
            expectAny(() -> spine(root).executeExisting(job, new ByteArrayInputStream(source), plan), "undefined numbering through spine fails closed");
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(receipts.stream().anyMatch(r -> r.stage() == DocumentSpineStage.MASTER && r.status() == DocumentSpineStageReceipt.Status.FAIL), "T03 failed mutation is durably checkpointed");
        } finally {
            deleteTree(root);
        }
    }

    private static DocxParagraphMechanicsEngine.NumberingDefinition definition(int abstractId, int numId, List<DocxParagraphMechanicsEngine.NumberingLevel> levels) {
        return new DocxParagraphMechanicsEngine.NumberingDefinition(abstractId, numId, levels);
    }

    private static DocxParagraphMechanicsEngine.NumberingLevel level(int level, String format, String text, int left, int hanging) {
        return new DocxParagraphMechanicsEngine.NumberingLevel(level, 1, format, text, "tab", "left", left, hanging);
    }

    private static DocumentSpineResult execute(byte[] source, String targetId, DocumentOperationContract.Type type, Map<String, String> parameters, Set<String> expectedParts, String label) throws Exception {
        Path root = Files.createTempDirectory("docx-t03-" + label + "-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            DocumentOperationContract operation = operation(graph, targetId, type, parameters, expectedParts, label);
            DocumentSpineJob job = job(label + "-source", label + "-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(targetId), allCapabilities(), List.of());
            return spine(root).executeExisting(job, new ByteArrayInputStream(source), plan);
        } finally { deleteTree(root); }
    }

    private static DocumentOperationContract operation(CanonicalDocumentGraphV2 graph, String targetId, DocumentOperationContract.Type type, Map<String, String> parameters, Set<String> expectedParts, String label) {
        return new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "docx-mastery-t03-" + label, graph.sourceSha256(), graph.semanticDigest(), type,
                List.of(DocumentSelector.node(targetId)), "DOCUMENT-DOCX-MASTERY-T03 semantic native operation " + label, parameters,
                DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(), expectedParts, DocumentOperationContract.VisualImpact.LAYOUT_CHANGE,
                false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    private static void assertProved(DocumentSpineResult result, String label) {
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, label + " publishes verified draft");
        check(result.preservation() != null && result.preservation().pass(), label + " native preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), label + " proof set complete");
        check(result.version() != null, label + " receives immutable version");
    }

    private static UniversalDocumentSpine spine(Path root) throws Exception {
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("platform008-bytes"), ArtifactIntakePolicy.conservative(32L * 1024 * 1024), repository, CLOCK);
        DocumentSpineCheckpointStore checkpoints = checkpointStore(root);
        DocumentSpineVersionStore versions = new FileDocumentSpineVersionStore(root.resolve("spine-versions"));
        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), new SyntheticRenderer(), CLOCK);
        return new UniversalDocumentSpine(gateway, checkpoints, versions, proofs, CLOCK);
    }

    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception { return new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints")); }

    private static DocumentSpineJob job(String sourceId, String resultId) {
        return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(),
                DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T03", "qualification", FIXED);
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type, String text) {
        return graph.elements().stream().filter(e -> e.type() == type && e.text().contains(text)).findFirst().orElseThrow(() -> new AssertionError("element not found " + type + " " + text));
    }
    private static String rootId(CanonicalDocumentGraphV2 graph) { return graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id(); }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>(T03_CAPABILITIES);
        for (int i = 1; i <= 21; i++) out.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        out.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }
    private static Set<String> t03Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (int i = 136; i <= 195; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }
    private static byte[] addSharedNumberingInstance(byte[] source, int numId, int abstractNumId) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        Document numbering = OoxmlPackageSupport.parseXml(parts.get("word/numbering.xml"));
        Element num = numbering.createElementNS(DocxParagraphMechanicsEngine.WORD_NS, "w:num");
        num.setAttributeNS(DocxParagraphMechanicsEngine.WORD_NS, "w:numId", Integer.toString(numId));
        Element abstractRef = numbering.createElementNS(DocxParagraphMechanicsEngine.WORD_NS, "w:abstractNumId");
        abstractRef.setAttributeNS(DocxParagraphMechanicsEngine.WORD_NS, "w:val", Integer.toString(abstractNumId));
        num.appendChild(abstractRef);
        numbering.getDocumentElement().appendChild(num);
        parts.put("word/numbering.xml", OoxmlPackageSupport.serialize(numbering));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addPreservedParts(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/t03.xml", "<t03 xmlns=\"urn:t03\">preserve</t03>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }
    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) { for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); }
    }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expectIllegal(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException expected) { } }
    private static void expectAny(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException | IllegalStateException | UnsupportedOperationException expected) { } }
    private static String sha(byte[] value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); } }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t03 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t03", "SyntheticRasterOracle", "docx-mastery-t03", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t03".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
}
