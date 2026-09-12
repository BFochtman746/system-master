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
import org.systemmaster.tools.docx.DocxPageArchitectureEngine;

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

/** DOCUMENT-DOCX-MASTERY-T02 portable semantic + governed-spine qualification. */
public final class DocumentDocxMasteryT02PortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T22:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T02_CAPABILITIES = t02Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testTypedReadExtractCreateMasterAndPreservation();
        testGovernedSpinePageArchitecture();
        testHeaderFooterVariantsThroughSpine();
        testHeaderFooterSharedPartIsolation();
        testBreakFamiliesThroughSpine();
        testNegativeAndDurableFailure();
        System.out.println("DOCUMENT_DOCX_MASTERY_T02_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T02_CAPABILITIES.size());
    }

    private static void testTypedReadExtractCreateMasterAndPreservation() throws Exception {
        DocxPageArchitectureEngine engine = new DocxPageArchitectureEngine();
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Alpha", "Beta", "Gamma")));
        byte[] customBefore = OoxmlPackageSupport.read(source).get("customXml/t02.xml");
        String section = "body/sectPr:1";

        DocxPageArchitectureEngine.BorderEdge edge = new DocxPageArchitectureEngine.BorderEdge("double", 16, 8, "336699");
        source = engine.formatPageBorders(source, section, new DocxPageArchitectureEngine.PageBorders("page", "allPages", "front", edge, edge, edge, edge));
        DocxPageArchitectureEngine.PageBorders borders = engine.readPageBorders(source, section);
        check("page".equals(borders.offsetFrom()) && "front".equals(borders.zOrder()), "typed page-border READ returns container semantics");
        check(borders.top() != null && "double".equals(borders.top().style()), "typed page-border READ returns edge style");
        check(Integer.valueOf(16).equals(borders.left().sizeEighthPoints()) && "336699".equals(borders.left().colorHex()), "typed page-border EXTRACT returns size/color");
        source = engine.formatPageBorders(source, section, new DocxPageArchitectureEngine.PageBorders("", "", "", new DocxPageArchitectureEngine.BorderEdge("single", null, null, ""), null, null, null));
        DocxPageArchitectureEngine.PageBorders sparseBorders = engine.readPageBorders(source, section);
        check("single".equals(sparseBorders.top().style()) && Integer.valueOf(16).equals(sparseBorders.top().sizeEighthPoints()), "sparse page-border MASTER preserves unspecified edge properties");
        check("336699".equals(sparseBorders.top().colorHex()) && "double".equals(sparseBorders.left().style()), "sparse page-border MASTER preserves unrelated edges");

        source = engine.formatPageBackground(source, new DocxPageArchitectureEngine.PageBackground("F2F2F2", "", "", ""));
        check("F2F2F2".equals(engine.readPageBackground(source).colorHex()), "typed page-background READ/EXTRACT returns color");

        source = engine.formatColumns(source, section, new DocxPageArchitectureEngine.ColumnLayout(
                2, 720, true, false, List.of(new DocxPageArchitectureEngine.ColumnSpec(4200, 720), new DocxPageArchitectureEngine.ColumnSpec(4200, 0))));
        DocxPageArchitectureEngine.ColumnLayout columns = engine.readColumns(source, section);
        check(Integer.valueOf(2).equals(columns.count()) && Boolean.TRUE.equals(columns.separator()), "typed multi-column READ returns count/separator");
        check(columns.columns().size() == 2 && Integer.valueOf(4200).equals(columns.columns().get(0).widthTwips()), "typed multi-column EXTRACT returns explicit column geometry");
        source = engine.formatColumns(source, section, new DocxPageArchitectureEngine.ColumnLayout(3, 360, false, true, List.of()));
        DocxPageArchitectureEngine.ColumnLayout equalColumns = engine.readColumns(source, section);
        check(Integer.valueOf(3).equals(equalColumns.count()) && Boolean.TRUE.equals(equalColumns.equalWidth()), "multi-column MASTER switches to equal-width semantics");
        check(equalColumns.columns().isEmpty(), "equal-width MASTER removes stale explicit column definitions");
        source = engine.formatColumns(source, section, new DocxPageArchitectureEngine.ColumnLayout(2, 720, true, false, List.of(new DocxPageArchitectureEngine.ColumnSpec(4200, 720), new DocxPageArchitectureEngine.ColumnSpec(4200, 0))));

        source = engine.formatLineNumbering(source, section, new DocxPageArchitectureEngine.LineNumbering(5, 1, 360, "newPage"));
        DocxPageArchitectureEngine.LineNumbering line = engine.readLineNumbering(source, section);
        check(Integer.valueOf(5).equals(line.countBy()) && "newPage".equals(line.restart()), "typed line-numbering READ/EXTRACT returns semantics");

        source = engine.formatPageNumbering(source, section, new DocxPageArchitectureEngine.PageNumbering(3, "upperRoman", null, ""));
        source = engine.formatPageNumbering(source, section, new DocxPageArchitectureEngine.PageNumbering(5, "", null, ""));
        DocxPageArchitectureEngine.PageNumbering numbering = engine.readPageNumbering(source, section);
        check(Integer.valueOf(5).equals(numbering.start()), "page-number MASTER updates start");
        check("upperRoman".equals(numbering.format()), "sparse page-number MASTER preserves omitted format");

        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "default", "Default Header"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "default", "Default Footer"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "first", "First Header"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "first", "First Footer"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "even", "Even Header"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("footer", "even", "Even Footer"));
        source = engine.upsertHeaderFooter(source, section, new DocxPageArchitectureEngine.HeaderFooterSpec("header", "default", "Default Header Edited"));
        List<DocxPageArchitectureEngine.HeaderFooterSnapshot> headerFooters = engine.readHeaderFooters(source);
        check(headerFooters.size() == 6, "typed header/footer READ returns all six default/first/even variants");
        check(snapshot(headerFooters, "header", "default").text().contains("Edited"), "header MASTER edits existing native part without replacing relationship");
        check(snapshot(headerFooters, "header", "first").titlePage(), "first-page header/footer enables titlePg semantics");
        check(snapshot(headerFooters, "footer", "even").evenAndOddHeaders(), "odd/even header/footer enables settings authority");

        source = engine.insertBreak(source, "body/p:1", new DocxPageArchitectureEngine.BreakSpec("page"));
        source = engine.insertBreak(source, "body/p:2", new DocxPageArchitectureEngine.BreakSpec("column"));
        check("page".equals(engine.readBreak(source, "body/p:1/r:2/br:1").type()), "typed page-break READ returns page break");
        check("column".equals(engine.readBreak(source, "body/p:2/r:2/br:1").type()), "typed column-break READ returns column break");
        source = engine.formatBreak(source, "body/p:1/r:2/br:1", new DocxPageArchitectureEngine.BreakSpec("column"));
        source = engine.formatBreak(source, "body/p:1/r:2/br:1", new DocxPageArchitectureEngine.BreakSpec("page"));
        check("page".equals(engine.readBreak(source, "body/p:1/r:2/br:1").type()), "page-break MASTER round-trips after edit");

        source = engine.insertSectionBreak(source, "body/p:2", new DocxPageArchitectureEngine.SectionBreakSpec("oddPage"));
        check("oddPage".equals(engine.readSectionBreak(source, "body/p:2/pPr:1/sectPr:1").type()), "typed section-break CREATE/READ returns oddPage");
        source = engine.formatSectionBreak(source, "body/p:2/pPr:1/sectPr:1", new DocxPageArchitectureEngine.SectionBreakSpec("continuous"));
        check("continuous".equals(engine.readSectionBreak(source, "body/p:2/pPr:1/sectPr:1").type()), "section-break MASTER updates type");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element finalSection = graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "body/sectPr:1".equals(e.nativeAnchor().locator()))
                .findFirst().orElseThrow();
        check("single".equals(finalSection.semantic().properties().get("pageBorder.top.style")), "CDG-2 EXTRACT carries page-border semantics");
        check("2".equals(finalSection.semantic().properties().get("columns.count")), "CDG-2 EXTRACT carries column semantics");
        check("5".equals(finalSection.semantic().properties().get("lineNumbering.countBy")), "CDG-2 EXTRACT carries line-number semantics");
        check("upperRoman".equals(finalSection.semantic().properties().get("pageNumbering.format")), "CDG-2 EXTRACT carries page-number semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PAGE && "page-background".equals(e.semantic().role()) && "F2F2F2".equals(e.semantic().properties().get("color"))), "CDG-2 EXTRACT carries page background");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.HEADER && e.text().contains("Default Header Edited") && e.semantic().properties().getOrDefault("variants", "").contains("header:default")), "CDG-2 EXTRACT carries header wrapper + variant");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FOOTER && e.text().contains("Even Footer") && "footer".equals(e.accessibility().role())), "CDG-2 EXTRACT carries footer accessibility role");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.BREAK).anyMatch(e -> "page".equals(e.semantic().properties().get("type"))), "CDG-2 EXTRACT carries page break");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.BREAK).anyMatch(e -> "column".equals(e.semantic().properties().get("type"))), "CDG-2 EXTRACT carries column break");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION).anyMatch(e -> "continuous".equals(e.semantic().properties().get("sectionBreak.type"))), "CDG-2 EXTRACT carries section-break type");

        check(java.util.Arrays.equals(customBefore, OoxmlPackageSupport.read(source).get("customXml/t02.xml")), "T02 native mutations preserve unrelated custom XML bytes");
        byte[] macro = addMacroPart(source);
        byte[] macroBefore = OoxmlPackageSupport.read(macro).get("word/vbaProject.bin");
        byte[] macroAfter = engine.formatColumns(macro, section, new DocxPageArchitectureEngine.ColumnLayout(3, 360, false, true, List.of()));
        check(java.util.Arrays.equals(macroBefore, OoxmlPackageSupport.read(macroAfter).get("word/vbaProject.bin")), "T02 engine preserves active-content payload bytes without executing them");
    }

    private static void testGovernedSpinePageArchitecture() throws Exception {
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Spine Alpha", "Spine Beta", "Spine Gamma")));
        CanonicalDocumentGraphV2 graph = project(source);
        String section = finalSection(graph).id();
        String root = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id();

        Map<String, String> border = new LinkedHashMap<>();
        border.put("docx.action", "FORMAT_PAGE_BORDERS");
        border.put("pageBorder.offsetFrom", "text");
        border.put("pageBorder.display", "allPages");
        border.put("pageBorder.top.style", "single");
        border.put("pageBorder.top.sizeEighthPoints", "12");
        border.put("pageBorder.top.colorHex", "224466");
        DocumentSpineResult bordered = execute(source, section, DocumentOperationContract.Type.FORMAT, border, Set.of("word/document.xml"), "page-borders");
        assertProved(bordered, "page-borders");
        check("single".equals(new DocxPageArchitectureEngine().readPageBorders(bordered.resultBytes(), "body/sectPr:1").top().style()), "spine page-border CREATE/MASTER reaches native engine");

        CanonicalDocumentGraphV2 borderedGraph = project(bordered.resultBytes());
        Map<String, String> background = Map.of("docx.action", "FORMAT_PAGE_BACKGROUND", "background.colorHex", "FFF2CC");
        DocumentSpineResult backgrounded = execute(bordered.resultBytes(), rootId(borderedGraph), DocumentOperationContract.Type.FORMAT, background, Set.of("word/document.xml"), "page-background");
        assertProved(backgrounded, "page-background");
        check("FFF2CC".equals(new DocxPageArchitectureEngine().readPageBackground(backgrounded.resultBytes()).colorHex()), "spine page-background CREATE/MASTER reaches native engine");

        CanonicalDocumentGraphV2 backgroundGraph = project(backgrounded.resultBytes());
        Map<String, String> columns = Map.of(
                "docx.action", "FORMAT_COLUMNS",
                "columns.count", "2",
                "columns.spacingTwips", "720",
                "columns.separator", "true",
                "columns.equalWidth", "true");
        DocumentSpineResult columned = execute(backgrounded.resultBytes(), finalSection(backgroundGraph).id(), DocumentOperationContract.Type.FORMAT, columns, Set.of("word/document.xml"), "columns");
        assertProved(columned, "columns");
        check(Integer.valueOf(2).equals(new DocxPageArchitectureEngine().readColumns(columned.resultBytes(), "body/sectPr:1").count()), "spine multi-column CREATE/MASTER reaches native engine");

        CanonicalDocumentGraphV2 columnGraph = project(columned.resultBytes());
        Map<String, String> line = Map.of(
                "docx.action", "FORMAT_LINE_NUMBERING",
                "lineNumbering.countBy", "1",
                "lineNumbering.start", "1",
                "lineNumbering.distanceTwips", "240",
                "lineNumbering.restart", "continuous");
        DocumentSpineResult lined = execute(columned.resultBytes(), finalSection(columnGraph).id(), DocumentOperationContract.Type.FORMAT, line, Set.of("word/document.xml"), "line-numbering");
        assertProved(lined, "line-numbering");
        check("continuous".equals(new DocxPageArchitectureEngine().readLineNumbering(lined.resultBytes(), "body/sectPr:1").restart()), "spine line-number CREATE/MASTER reaches native engine");

        CanonicalDocumentGraphV2 lineGraph = project(lined.resultBytes());
        Map<String, String> pageNumbers = Map.of(
                "docx.action", "FORMAT_PAGE_NUMBERING",
                "pageNumbering.start", "7",
                "pageNumbering.format", "decimal");
        DocumentSpineResult numbered = execute(lined.resultBytes(), finalSection(lineGraph).id(), DocumentOperationContract.Type.FORMAT, pageNumbers, Set.of("word/document.xml"), "page-numbering");
        assertProved(numbered, "page-numbering");
        check(Integer.valueOf(7).equals(new DocxPageArchitectureEngine().readPageNumbering(numbered.resultBytes(), "body/sectPr:1").start()), "spine page-number CREATE/MASTER reaches native engine");
    }

    private static void testHeaderFooterVariantsThroughSpine() throws Exception {
        byte[] current = new DocxFullLaneEngine().createDocument(List.of("Header Footer Body", "Second", "Third"));
        for (String[] item : List.of(
                new String[] {"header", "default", "Default Header T02"},
                new String[] {"footer", "default", "Default Footer T02"},
                new String[] {"header", "first", "First Header T02"},
                new String[] {"footer", "first", "First Footer T02"},
                new String[] {"header", "even", "Even Header T02"},
                new String[] {"footer", "even", "Even Footer T02"})) {
            CanonicalDocumentGraphV2 graph = project(current);
            Map<String, String> params = Map.of(
                    "docx.action", "UPSERT_HEADER_FOOTER",
                    "headerFooter.kind", item[0],
                    "headerFooter.variant", item[1],
                    "headerFooter.text", item[2]);
            Set<String> expected = item[1].equals("even")
                    ? Set.of("word/document.xml", "word/_rels/document.xml.rels", "[Content_Types].xml", "word/settings.xml", "word/" + item[0] + "*")
                    : Set.of("word/document.xml", "word/_rels/document.xml.rels", "[Content_Types].xml", "word/" + item[0] + "*");
            DocumentSpineResult result = execute(current, finalSection(graph).id(), DocumentOperationContract.Type.INSERT_CONTENT, params, expected, item[0] + "-" + item[1]);
            assertProved(result, item[0] + "-" + item[1]);
            current = result.resultBytes();
        }
        List<DocxPageArchitectureEngine.HeaderFooterSnapshot> snapshots = new DocxPageArchitectureEngine().readHeaderFooters(current);
        check(snapshots.size() == 6, "governed spine creates all header/footer variants");
        check(snapshot(snapshots, "header", "first").titlePage(), "governed first-page header sets title-page semantics");
        check(snapshot(snapshots, "header", "even").evenAndOddHeaders(), "governed even header sets even/odd settings semantics");
        CanonicalDocumentGraphV2 graph = project(current);
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.HEADER).count() == 3, "CDG-2 exposes three header native parts");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FOOTER).count() == 3, "CDG-2 exposes three footer native parts");
    }

    private static void testHeaderFooterSharedPartIsolation() throws Exception {
        DocxPageArchitectureEngine engine = new DocxPageArchitectureEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Section One", "Section Two", "Section Three"));
        source = engine.upsertHeaderFooter(source, "body/sectPr:1", new DocxPageArchitectureEngine.HeaderFooterSpec("header", "default", "Shared Header"));
        source = addSyntheticHeaderRelationship(source, "word/header1.xml");
        source = engine.insertSectionBreak(source, "body/p:1", new DocxPageArchitectureEngine.SectionBreakSpec("nextPage"));
        List<DocxPageArchitectureEngine.HeaderFooterSnapshot> shared = engine.readHeaderFooters(source);
        check(shared.stream().filter(v -> v.kind().equals("header") && v.variant().equals("default")).count() == 2, "multi-section READ exposes both effective default headers");
        check(shared.stream().filter(v -> v.kind().equals("header") && v.variant().equals("default")).map(DocxPageArchitectureEngine.HeaderFooterSnapshot::partName).distinct().count() == 1, "section-break clone initially shares the native header part");

        source = engine.upsertHeaderFooter(source, "body/sectPr:1", new DocxPageArchitectureEngine.HeaderFooterSpec("header", "default", "Second Section Header"));
        List<DocxPageArchitectureEngine.HeaderFooterSnapshot> isolated = engine.readHeaderFooters(source);
        DocxPageArchitectureEngine.HeaderFooterSnapshot first = snapshotAt(isolated, "body/p:1/pPr:1/sectPr:1", "header", "default");
        DocxPageArchitectureEngine.HeaderFooterSnapshot second = snapshotAt(isolated, "body/sectPr:1", "header", "default");
        check(first.text().contains("Shared Header"), "copy-on-write header MASTER preserves earlier section content");
        check(second.text().contains("Second Section Header"), "copy-on-write header MASTER changes only targeted section");
        check(!first.partName().equals(second.partName()), "shared header part is detached before section-local mutation");
        Map<String, byte[]> parts = OoxmlPackageSupport.read(source);
        String secondRels = headerFooterRelationshipPart(second.partName());
        check(parts.containsKey(secondRels), "copy-on-write clones header relationship part for rich-content preservation");
        check(java.util.Arrays.equals(parts.get("word/_rels/header1.xml.rels"), parts.get(secondRels)), "cloned header relationship bytes are preserved exactly");
    }

    private static void testBreakFamiliesThroughSpine() throws Exception {
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Break Alpha", "Break Beta", "Break Gamma"));
        CanonicalDocumentGraphV2 graph = project(source);
        String alpha = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Break Alpha").id();
        DocumentSpineResult page = execute(source, alpha, DocumentOperationContract.Type.INSERT_CONTENT,
                Map.of("docx.action", "INSERT_BREAK", "break.type", "page"), Set.of("word/document.xml"), "page-break-create");
        assertProved(page, "page-break-create");
        CanonicalDocumentGraphV2 pageGraph = project(page.resultBytes());
        CanonicalDocumentGraphV2.Element pageBreak = pageGraph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.BREAK && "page".equals(e.semantic().properties().get("type"))).findFirst().orElseThrow();
        check("page".equals(new DocxPageArchitectureEngine().readBreak(page.resultBytes(), pageBreak.nativeAnchor().locator()).type()), "page-break spine CREATE supports typed READ");
        DocumentSpineResult pageEdited = execute(page.resultBytes(), pageBreak.id(), DocumentOperationContract.Type.FORMAT,
                Map.of("docx.action", "FORMAT_BREAK", "break.type", "column"), Set.of("word/document.xml"), "page-break-edit");
        assertProved(pageEdited, "page-break-edit");
        CanonicalDocumentGraphV2 pageEditedGraph = project(pageEdited.resultBytes());
        CanonicalDocumentGraphV2.Element columnBreak = pageEditedGraph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.BREAK && "column".equals(e.semantic().properties().get("type"))).findFirst().orElseThrow();
        DocumentSpineResult columnEdited = execute(pageEdited.resultBytes(), columnBreak.id(), DocumentOperationContract.Type.FORMAT,
                Map.of("docx.action", "FORMAT_BREAK", "break.type", "page"), Set.of("word/document.xml"), "column-break-edit");
        assertProved(columnEdited, "column-break-edit");

        CanonicalDocumentGraphV2 beforeSection = project(columnEdited.resultBytes());
        String beta = element(beforeSection, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Break Beta").id();
        DocumentSpineResult section = execute(columnEdited.resultBytes(), beta, DocumentOperationContract.Type.INSERT_CONTENT,
                Map.of("docx.action", "INSERT_SECTION_BREAK", "sectionBreak.type", "evenPage"), Set.of("word/document.xml"), "section-break-create");
        assertProved(section, "section-break-create");
        CanonicalDocumentGraphV2 sectionGraph = project(section.resultBytes());
        CanonicalDocumentGraphV2.Element sectionBreak = sectionGraph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "evenPage".equals(e.semantic().properties().get("sectionBreak.type")))
                .findFirst().orElseThrow();
        check("evenPage".equals(new DocxPageArchitectureEngine().readSectionBreak(section.resultBytes(), sectionBreak.nativeAnchor().locator()).type()), "section-break spine CREATE supports typed READ");
        DocumentSpineResult sectionEdited = execute(section.resultBytes(), sectionBreak.id(), DocumentOperationContract.Type.FORMAT,
                Map.of("docx.action", "FORMAT_SECTION_BREAK", "sectionBreak.type", "continuous"), Set.of("word/document.xml"), "section-break-edit");
        assertProved(sectionEdited, "section-break-edit");
        check(project(sectionEdited.resultBytes()).elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "continuous".equals(e.semantic().properties().get("sectionBreak.type"))), "section-break MASTER round-trips through CDG-2");
    }

    private static void testNegativeAndDurableFailure() throws Exception {
        DocxPageArchitectureEngine engine = new DocxPageArchitectureEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Negative T02"));
        expectIllegal(() -> new DocxPageArchitectureEngine.BorderEdge("single", 12, 4, "XYZ123"), "invalid border color fails closed");
        expectIllegal(() -> new DocxPageArchitectureEngine.ColumnLayout(0, null, null, null, List.of()), "invalid column count fails closed");
        expectIllegal(() -> new DocxPageArchitectureEngine.HeaderFooterSpec("header", "verso", "x"), "invalid header/footer variant fails closed");
        expectIllegal(() -> engine.readPageBorders(source, "body/../sectPr:1"), "unsafe T02 locator traversal fails closed");
        byte[] explicitColumns = engine.formatColumns(source, "body/sectPr:1", new DocxPageArchitectureEngine.ColumnLayout(2, 720, false, false, List.of(new DocxPageArchitectureEngine.ColumnSpec(4200, 720), new DocxPageArchitectureEngine.ColumnSpec(4200, 0))));
        expectIllegal(() -> engine.formatColumns(explicitColumns, "body/sectPr:1", new DocxPageArchitectureEngine.ColumnLayout(3, null, null, null, List.of())), "unequal column count cannot drift away from explicit definitions");
        byte[] withSectionBreak = engine.insertSectionBreak(source, "body/p:1", new DocxPageArchitectureEngine.SectionBreakSpec("nextPage"));
        expectIllegal(() -> engine.insertSectionBreak(withSectionBreak, "body/p:1", new DocxPageArchitectureEngine.SectionBreakSpec("continuous")), "duplicate section-break insertion on same paragraph fails closed");

        Path root = Files.createTempDirectory("docx-t02-wrong-target-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            String run = element(graph, CanonicalDocumentGraphV2.ElementType.RUN, "Negative T02").id();
            DocumentOperationContract operation = operation(graph, run, DocumentOperationContract.Type.FORMAT,
                    Map.of("docx.action", "FORMAT_COLUMNS", "columns.count", "2"), Set.of("word/document.xml"), "wrong-target");
            DocumentSpineJob job = job("wrong-target-source", "wrong-target-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(run), allCapabilities(), List.of());
            expectAny(() -> spine(root).executeExisting(job, new ByteArrayInputStream(source), plan), "T02 wrong semantic target fails closed");
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(receipts.stream().anyMatch(r -> r.stage() == DocumentSpineStage.MASTER && r.status() == DocumentSpineStageReceipt.Status.FAIL), "T02 wrong-target failure is durably checkpointed");
        } finally {
            deleteTree(root);
        }
    }

    private static DocumentSpineResult execute(
            byte[] source,
            String targetId,
            DocumentOperationContract.Type type,
            Map<String, String> parameters,
            Set<String> expectedParts,
            String label) throws Exception {
        Path root = Files.createTempDirectory("docx-t02-" + label + "-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            DocumentOperationContract operation = operation(graph, targetId, type, parameters, expectedParts, label);
            DocumentSpineJob job = job(label + "-source", label + "-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(targetId), allCapabilities(), List.of());
            return spine(root).executeExisting(job, new ByteArrayInputStream(source), plan);
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
                "docx-mastery-t02-" + label,
                graph.sourceSha256(),
                graph.semanticDigest(),
                type,
                List.of(DocumentSelector.node(targetId)),
                "DOCUMENT-DOCX-MASTERY-T02 semantic native operation " + label,
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

    private static void assertProved(DocumentSpineResult result, String label) {
        check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, label + " publishes as verified draft");
        check(result.preservation() != null && result.preservation().pass(), label + " native preservation passes");
        check(result.finalization() != null && result.finalization().missing().isEmpty(), label + " proof set is complete");
        check(result.version() != null, label + " receives immutable version");
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

    private static DocumentSpineJob job(String sourceId, String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + ".docx",
                DocumentFormat.DOCX.mediaType(),
                DocumentSpineMode.MASTER,
                DocumentFormat.DOCX,
                DocumentSpinePublicationClass.VERIFIED_DRAFT,
                allCapabilities(),
                "DOCUMENT-DOCX-MASTERY-T02",
                "qualification",
                FIXED);
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception {
        return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes);
    }

    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type, String text) {
        return graph.elements().stream().filter(e -> e.type() == type && e.text().contains(text)).findFirst()
                .orElseThrow(() -> new AssertionError("element not found: " + type + " text=" + text));
    }

    private static CanonicalDocumentGraphV2.Element finalSection(CanonicalDocumentGraphV2 graph) {
        return graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SECTION && "body/sectPr:1".equals(e.nativeAnchor().locator()))
                .findFirst().orElseThrow(() -> new AssertionError("final section missing"));
    }

    private static String rootId(CanonicalDocumentGraphV2 graph) {
        return graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow().id();
    }

    private static DocxPageArchitectureEngine.HeaderFooterSnapshot snapshot(List<DocxPageArchitectureEngine.HeaderFooterSnapshot> values, String kind, String variant) {
        return values.stream().filter(value -> kind.equals(value.kind()) && variant.equals(value.variant())).findFirst()
                .orElseThrow(() -> new AssertionError("header/footer snapshot missing: " + kind + "/" + variant));
    }

    private static DocxPageArchitectureEngine.HeaderFooterSnapshot snapshotAt(
            List<DocxPageArchitectureEngine.HeaderFooterSnapshot> values,
            String sectionLocator,
            String kind,
            String variant) {
        return values.stream()
                .filter(value -> sectionLocator.equals(value.sectionLocator()) && kind.equals(value.kind()) && variant.equals(value.variant()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("header/footer snapshot missing: " + sectionLocator + " " + kind + "/" + variant));
    }

    private static byte[] addSyntheticHeaderRelationship(byte[] source, String headerPart) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        String rels = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdSynthetic\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"https://example.invalid/t02\" TargetMode=\"External\"/></Relationships>";
        parts.put(headerFooterRelationshipPart(headerPart), rels.getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static String headerFooterRelationshipPart(String partName) {
        int slash = partName.lastIndexOf('/');
        String directory = partName.substring(0, slash + 1);
        String file = partName.substring(slash + 1);
        return directory + "_rels/" + file + ".rels";
    }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>(T02_CAPABILITIES);
        for (int i = 1; i <= 21; i++) out.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        out.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static Set<String> t02Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (int i = 76; i <= 135; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static byte[] addPreservedParts(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/t02.xml", "<t02 xmlns=\"urn:t02\">preserve</t02>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] addMacroPart(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("word/vbaProject.bin", new byte[] { 0x11, 0x22, 0x33, 0x00, (byte) 0xee });
        return OoxmlPackageSupport.write(parts);
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
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override
        public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t02 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(
                    RenderProofReceipt.SCHEMA_V1,
                    request.format(),
                    sha(request.artifact()),
                    sha(rendered),
                    "SyntheticIndependentRenderer",
                    "docx-mastery-t02",
                    "SyntheticRasterOracle",
                    "docx-mastery-t02",
                    FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t02".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)),
                    List.of(),
                    Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
}
