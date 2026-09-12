package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.spine.DocumentSpineExecutionPlan;
import org.systemmaster.tools.document.spine.DocumentSpineJob;
import org.systemmaster.tools.document.spine.DocumentSpineMode;
import org.systemmaster.tools.document.spine.DocumentSpineProofService;
import org.systemmaster.tools.document.spine.DocumentSpinePublicationClass;
import org.systemmaster.tools.document.spine.DocumentSpineResult;
import org.systemmaster.tools.document.spine.FileDocumentSpineCheckpointStore;
import org.systemmaster.tools.document.spine.FileDocumentSpineVersionStore;
import org.systemmaster.tools.document.spine.UniversalDocumentSpine;
import org.systemmaster.tools.docx.DocxAdvancedSemanticMasteryEngine;
import org.systemmaster.tools.docx.DocxDrawingChartMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T06 portable semantic + preservation + governed-spine qualification. */
public final class DocumentDocxMasteryT06PortableTests {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private static final String DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
    private static final String X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String CT = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final Instant FIXED = Instant.parse("2026-09-01T00:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T06 = t06Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testChartWorkbookAndDecorations();
        testSmartArtAndEquations();
        testReferencesFieldsCaptionsAndNotes();
        testCanonicalProjection();
        testGovernedSpine();
        testEmbeddedWorkbookSecurityClassification();
        testNegativeCases();
        check(T06.size() == 60, "T06 owns exactly 60 capabilities");
        System.out.println("DOCUMENT_DOCX_MASTERY_T06_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T06.size());
    }

    private static void testChartWorkbookAndDecorations() throws Exception {
        byte[] source = preserved(baseDocument());
        DocxDrawingChartMasteryEngine charts = new DocxDrawingChartMasteryEngine();
        source = charts.insertChart(source, "body/p:1", chart("bar", "Revenue", List.of(10.0, 20.0, 30.0)));
        source = charts.insertChart(source, "body/p:2", chart("line", "Volume", List.of(2.0, 4.0, 6.0)));
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        source = engine.upsertChartWorkbook(source, "body/p:1/chart:1", workbook("Revenue Data", List.of(10.0, 20.0, 30.0)));
        source = engine.upsertChartWorkbook(source, "body/p:2/chart:1", workbook("Volume Data", List.of(2.0, 4.0, 6.0)));
        List<DocxAdvancedSemanticMasteryEngine.ChartWorkbookSnapshot> workbooks = engine.readChartWorkbooks(source);
        check(workbooks.size() == 2, "chart workbook READ enumerates embedded workbooks");
        check(workbooks.get(0).workbook().categories().equals(List.of("A", "B", "C")), "chart workbook EXTRACT yields structured categories");
        check(workbooks.get(0).workbook().values().equals(List.of(10.0, 20.0, 30.0)), "chart workbook EXTRACT yields structured numeric data");
        check(OoxmlPackageSupport.read(source).containsKey(workbooks.get(0).workbookPart()), "chart workbook CREATE produces native embedded XLSX part");
        source = replaceFirstWorkbookWithRelationshipFixture(source);
        workbooks = engine.readChartWorkbooks(source);
        check("SparseData".equals(workbooks.get(0).workbook().sheetName()), "chart workbook READ resolves renamed worksheet through workbook relationships");
        check(workbooks.get(0).workbook().categories().equals(List.of("Alpha", "Beta")), "chart workbook READ resolves sharedStrings categories");
        check(workbooks.get(0).workbook().values().equals(List.of(42.0, 84.0)), "chart workbook READ honors sparse cell references rather than dense cell order");
        source = forceSecondWorkbookAlias(source);
        workbooks = engine.readChartWorkbooks(source);
        check(workbooks.get(0).workbookPart().equals(workbooks.get(1).workbookPart()), "fixture proves two charts share one embedded workbook");
        String shared = workbooks.get(0).workbookPart();
        byte[] sharedBefore = OoxmlPackageSupport.read(source).get(shared).clone();
        source = engine.upsertChartWorkbook(source, "body/p:2/chart:1", workbook("Detached", List.of(9.0, 8.0, 7.0)));
        workbooks = engine.readChartWorkbooks(source);
        check(!workbooks.get(0).workbookPart().equals(workbooks.get(1).workbookPart()), "chart workbook MASTER detaches shared workbook copy-on-write");
        check(java.util.Arrays.equals(sharedBefore, OoxmlPackageSupport.read(source).get(workbooks.get(0).workbookPart())), "untargeted shared workbook remains byte-identical");
        check(workbooks.get(1).workbook().values().equals(List.of(9.0, 8.0, 7.0)), "targeted workbook edit round-trips");

        DocxAdvancedSemanticMasteryEngine.ChartDecorations decorations = new DocxAdvancedSemanticMasteryEngine.ChartDecorations("Quarterly Revenue", "Quarter", "USD", "b", true, true);
        source = engine.formatChartDecorations(source, "body/p:1/chart:1", decorations);
        DocxAdvancedSemanticMasteryEngine.ChartDecorations read = engine.readChartDecorations(source, "body/p:1/chart:1");
        check("Quarterly Revenue".equals(read.title()), "chart title READ/CREATE/MASTER round-trips");
        check("Quarter".equals(read.categoryAxisTitle()) && "USD".equals(read.valueAxisTitle()), "chart axis labels round-trip");
        check(read.showLegend() && "b".equals(read.legendPosition()), "chart legend semantics round-trip");
        check(read.showDataLabels(), "chart data-label semantics round-trip");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t06.xml"), "chart operations preserve unrelated OPC part");
    }

    private static void testSmartArtAndEquations() throws Exception {
        byte[] source = preserved(baseDocument());
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        DocxAdvancedSemanticMasteryEngine.SmartArtSpec original = smartArt("Process", "Start", "Review", "Finish");
        source = engine.insertSmartArt(source, "body/p:3", original);
        source = cloneFirstDescendant(source, "body/p:3", "body/p:4", DGM, "relIds");
        List<DocxAdvancedSemanticMasteryEngine.SmartArtSnapshot> diagrams = engine.readSmartArt(source);
        check(diagrams.size() == 2, "SmartArt READ enumerates diagram owners");
        check(diagrams.get(0).spec().nodes().size() == 3, "SmartArt EXTRACT returns structured nodes");
        check(diagrams.get(0).dataPart().equals(diagrams.get(1).dataPart()), "fixture proves SmartArt aliases one data part");
        source = engine.editSmartArt(source, diagrams.get(0).locator(), smartArt("Revised", "One", "Two", "Three"));
        diagrams = engine.readSmartArt(source);
        check(!diagrams.get(0).dataPart().equals(diagrams.get(1).dataPart()), "SmartArt MASTER copy-on-write detaches shared data part");
        check("Revised".equals(diagrams.get(0).spec().title()), "targeted SmartArt edit round-trips");
        check("Process".equals(diagrams.get(1).spec().title()), "untargeted SmartArt alias retains original semantic data");
        check(OoxmlPackageSupport.read(source).containsKey(diagrams.get(0).layoutPart()), "SmartArt native layout part preserved");
        check(OoxmlPackageSupport.read(source).containsKey(diagrams.get(0).stylePart()), "SmartArt native style part preserved");
        check(OoxmlPackageSupport.read(source).containsKey(diagrams.get(0).colorsPart()), "SmartArt native colors part preserved");

        source = engine.insertEquation(source, "body/p:5", new DocxAdvancedSemanticMasteryEngine.EquationSpec("x^2+y^2=z^2"));
        List<DocxAdvancedSemanticMasteryEngine.EquationSnapshot> equations = engine.readEquations(source);
        check(equations.size() == 1 && "x^2+y^2=z^2".equals(equations.get(0).linearText()), "OMML equation CREATE/READ/EXTRACT round-trips");
        source = engine.editEquation(source, equations.get(0).locator(), new DocxAdvancedSemanticMasteryEngine.EquationSpec("E=mc^2"));
        check("E=mc^2".equals(engine.readEquations(source).get(0).linearText()), "OMML equation MASTER round-trips");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t06.xml"), "SmartArt/equation operations preserve unrelated OPC part");
    }

    private static void testReferencesFieldsCaptionsAndNotes() throws Exception {
        byte[] source = preserved(baseDocument());
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        source = engine.insertHyperlink(source, "body/p:6", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("OpenAI", "https://example.com/a", "Primary"));
        source = cloneFirstDescendant(source, "body/p:6", "body/p:7", W, "hyperlink");
        List<DocxAdvancedSemanticMasteryEngine.HyperlinkSnapshot> links = engine.readHyperlinks(source);
        check(links.size() == 2 && links.get(0).relationshipId().equals(links.get(1).relationshipId()), "fixture proves hyperlinks share one relationship");
        source = engine.editHyperlink(source, links.get(0).locator(), new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Reference", "https://example.com/b", "Revised"));
        links = engine.readHyperlinks(source);
        check(!links.get(0).relationshipId().equals(links.get(1).relationshipId()), "hyperlink MASTER detaches shared relationship");
        check("https://example.com/b".equals(links.get(0).target()) && "https://example.com/a".equals(links.get(1).target()), "hyperlink owner isolation preserves untargeted target");

        source = engine.insertBookmark(source, "body/p:8", "TargetBookmark");
        List<DocxAdvancedSemanticMasteryEngine.BookmarkSnapshot> bookmarks = engine.readBookmarks(source);
        check(bookmarks.size() == 1 && "TargetBookmark".equals(bookmarks.get(0).name()), "bookmark CREATE/READ/EXTRACT round-trips");
        source = engine.editBookmark(source, bookmarks.get(0).locator(), "TargetBookmark2");
        check("TargetBookmark2".equals(engine.readBookmarks(source).get(0).name()), "bookmark MASTER round-trips");
        source = engine.insertHyperlink(source, "body/p:15", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Jump", "#TargetBookmark2", "Internal"));
        links = engine.readHyperlinks(source);
        check(links.stream().anyMatch(h -> "#TargetBookmark2".equals(h.target()) && h.relationshipId().isBlank()), "internal hyperlink uses native bookmark anchor without external relationship");

        source = engine.insertCrossReference(source, "body/p:9", new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec("TargetBookmark2", "See target", true));
        List<DocxAdvancedSemanticMasteryEngine.CrossReferenceSnapshot> refs = engine.readCrossReferences(source);
        check(refs.size() == 1 && refs.get(0).hyperlink(), "cross-reference CREATE/READ detects REF hyperlink field");
        source = engine.editCrossReference(source, refs.get(0).locator(), new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec("TargetBookmark2", "Updated reference", false));
        refs = engine.readCrossReferences(source);
        check("Updated reference".equals(refs.get(0).displayText()) && !refs.get(0).hyperlink(), "cross-reference MASTER round-trips");

        source = engine.insertSimpleField(source, "body/p:10", new DocxAdvancedSemanticMasteryEngine.FieldSpec("DATE \\@ yyyy-MM-dd", "2026-08-31"));
        DocxAdvancedSemanticMasteryEngine.FieldSnapshot simple = engine.readSimpleFields(source).stream().filter(f -> f.locator().startsWith("body/p:10/")).findFirst().orElseThrow();
        check(simple.instruction().startsWith("DATE") && !simple.complex(), "simple field CREATE/READ/EXTRACT round-trips");
        source = engine.editSimpleField(source, simple.locator(), new DocxAdvancedSemanticMasteryEngine.FieldSpec("TIME \\@ HH:mm", "19:10"));
        check(engine.readSimpleFields(source).stream().anyMatch(f -> f.instruction().startsWith("TIME") && "19:10".equals(f.result())), "simple field MASTER round-trips");

        source = engine.insertComplexField(source, "body/p:11", new DocxAdvancedSemanticMasteryEngine.FieldSpec("AUTHOR", "System Master"));
        DocxAdvancedSemanticMasteryEngine.FieldSnapshot complex = engine.readComplexFields(source).get(0);
        check(complex.complex() && "AUTHOR".equals(complex.instruction()), "complex field CREATE/READ/EXTRACT pairs begin/separate/end runs");
        source = engine.editComplexField(source, complex.locator(), new DocxAdvancedSemanticMasteryEngine.FieldSpec("TITLE", "T06 Mastery"));
        complex = engine.readComplexFields(source).get(0);
        check("TITLE".equals(complex.instruction()) && "T06 Mastery".equals(complex.result()), "complex field MASTER round-trips");

        source = engine.insertFootnote(source, "body/p:12", "Footnote T06");
        source = engine.insertEndnote(source, "body/p:13", "Endnote T06");
        check(engine.readFootnotes(source).size() == 1 && "Footnote T06".equals(engine.readFootnotes(source).get(0).text()), "footnote CREATE/READ/EXTRACT round-trips");
        check(engine.readEndnotes(source).size() == 1 && "Endnote T06".equals(engine.readEndnotes(source).get(0).text()), "endnote CREATE/READ/EXTRACT round-trips");
        source = engine.editFootnote(source, engine.readFootnotes(source).get(0).locator(), "Footnote revised");
        source = engine.editEndnote(source, engine.readEndnotes(source).get(0).locator(), "Endnote revised");
        check("Footnote revised".equals(engine.readFootnotes(source).get(0).text()), "footnote MASTER edits targeted note");
        check("Endnote revised".equals(engine.readEndnotes(source).get(0).text()), "endnote MASTER edits targeted note");
        check("Footnote revised".equals(engine.readFootnotes(source).get(0).text()), "endnote edit preserves unrelated footnote");
        String footXml = new String(OoxmlPackageSupport.read(source).get("word/footnotes.xml"), StandardCharsets.UTF_8);
        String endXml = new String(OoxmlPackageSupport.read(source).get("word/endnotes.xml"), StandardCharsets.UTF_8);
        check(footXml.contains("footnoteRef"), "footnote body retains native w:footnoteRef marker after edit");
        check(endXml.contains("endnoteRef"), "endnote body retains native w:endnoteRef marker after edit");

        source = engine.insertCaption(source, "body/p:14", new DocxAdvancedSemanticMasteryEngine.CaptionSpec("Figure", "Architecture", "Figure"));
        List<DocxAdvancedSemanticMasteryEngine.CaptionSnapshot> captions = engine.readCaptions(source);
        check(captions.size() == 1 && "Figure".equals(captions.get(0).sequenceIdentifier()), "caption CREATE uses native Caption + SEQ field semantics");
        source = engine.editCaption(source, captions.get(0).locator(), new DocxAdvancedSemanticMasteryEngine.CaptionSpec("Table", "Revised caption", "Table"));
        captions = engine.readCaptions(source);
        check(captions.get(0).text().contains("Revised caption") && "Table".equals(captions.get(0).sequenceIdentifier()), "caption MASTER round-trips");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t06.xml"), "reference/notes operations preserve unrelated OPC part");
    }

    private static void testCanonicalProjection() throws Exception {
        byte[] source = fullSemanticFixture();
        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element chart = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CHART && e.nativeAnchor().nativePart().equals("word/document.xml")).findFirst().orElseThrow();
        check(chart.semantic().properties().containsKey("workbookPart"), "CDG-2 extracts embedded chart workbook identity");
        check(chart.data().values().stream().anyMatch(v -> v.startsWith("workbook\tA\t")), "CDG-2 extracts embedded workbook rows");
        check("Quarter".equals(chart.semantic().properties().get("categoryAxisTitle")), "CDG-2 extracts chart category-axis title");
        check("USD".equals(chart.semantic().properties().get("valueAxisTitle")), "CDG-2 extracts chart value-axis title");
        check(graph.assets().stream().anyMatch(a -> a.type() == CanonicalDocumentGraphV2.AssetType.EMBEDDED_FILE && a.nativePart().endsWith(".xlsx")), "CDG-2 asset graph owns embedded workbook");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.DIAGRAM && "smartart".equals(e.semantic().role()) && e.data().values().size() == 3), "CDG-2 extracts structured SmartArt nodes");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.HYPERLINK && "#TargetBookmark".equals(e.behavior().properties().get("target"))), "CDG-2 preserves internal bookmark hyperlink target");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FOOTNOTE || e.type() == CanonicalDocumentGraphV2.ElementType.ENDNOTE).count() == 2, "CDG-2 excludes reserved separator notes and projects only authored notes");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.EQUATION && "OMML".equals(e.data().dataType())), "CDG-2 extracts OMML equation semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.HYPERLINK && e.behavior().properties().getOrDefault("target", "").contains("example.com")), "CDG-2 extracts hyperlink target");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "bookmark".equals(e.semantic().role())), "CDG-2 extracts bookmark semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "cross-reference".equals(e.semantic().role())), "CDG-2 extracts cross-reference semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "complex-field".equals(e.semantic().role())), "CDG-2 extracts complex-field structure");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH && "caption".equals(e.semantic().role())), "CDG-2 identifies native caption paragraph");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FOOTNOTE && e.text().contains("Footnote")), "CDG-2 extracts footnote text");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ENDNOTE && e.text().contains("Endnote")), "CDG-2 extracts endnote text");
    }

    private static void testGovernedSpine() throws Exception {
        byte[] source = preserved(baseDocument());
        DocxDrawingChartMasteryEngine charts = new DocxDrawingChartMasteryEngine();
        DocxAdvancedSemanticMasteryEngine advanced = new DocxAdvancedSemanticMasteryEngine();
        source = charts.insertChart(source, "body/p:1", chart("bar", "Governed Revenue", List.of(1.0, 2.0, 3.0)));
        source = advanced.upsertChartWorkbook(source, "body/p:1/chart:1", workbook("Governed", List.of(1.0, 2.0, 3.0)));
        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element chart = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CHART && e.nativeAnchor().nativePart().equals("word/document.xml")).findFirst().orElseThrow();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "UPSERT_CHART_WORKBOOK"); params.put("chartWorkbook.sheetName", "Governed"); params.put("chartWorkbook.categories", "A;B;C"); params.put("chartWorkbook.values", "11;22;33");
        DocumentOperationContract op = new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "t06-spine-workbook", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.FORMAT,
                List.of(DocumentSelector.node(chart.id())), "T06 governed workbook mutation", params, DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(),
                Set.of("word/document.xml", "word/_rels/document.xml.rels", "word/charts/*", "word/embeddings/*", "[Content_Types].xml"), DocumentOperationContract.VisualImpact.LAYOUT_CHANGE, false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        Path root = Files.createTempDirectory("document-docx-mastery-t06-spine-");
        try {
            UniversalDocumentSpine spine = spine(root, new SyntheticRenderer());
            DocumentSpineJob job = job("t06-source", "t06-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(chart.id()), allCapabilities(), List.of());
            DocumentSpineResult result = spine.executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "T06 governed spine publishes verified draft");
            check(result.preservation() != null && result.preservation().pass(), "T06 governed spine preservation passes");
            check(result.finalization() != null && result.finalization().missing().isEmpty(), "T06 governed spine proof gates complete");
            check(new DocxAdvancedSemanticMasteryEngine().readChartWorkbooks(result.resultBytes()).stream().anyMatch(w -> w.workbook().values().equals(List.of(11.0, 22.0, 33.0))), "governed spine executes typed T06 chart-workbook action");
            check(OoxmlPackageSupport.read(result.resultBytes()).containsKey("customXml/t06.xml"), "governed spine preserves unrelated custom XML");
        } finally { deleteTree(root); }
    }

    private static void testEmbeddedWorkbookSecurityClassification() throws Exception {
        byte[] safe = preserved(baseDocument());
        DocxDrawingChartMasteryEngine charts = new DocxDrawingChartMasteryEngine();
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        safe = charts.insertChart(safe, "body/p:1", chart("bar", "Security", List.of(1.0, 2.0, 3.0)));
        safe = engine.upsertChartWorkbook(safe, "body/p:1/chart:1", workbook("StaticData", List.of(1.0, 2.0, 3.0)));
        DocumentProcessingService.Inspection safeInspection = new DocumentProcessingService().inspect(DocumentFormat.DOCX, safe);
        check(safeInspection.diagnostics().stream().noneMatch(v -> v.contains("ACTIVE_CONTENT:EMBEDDED_OBJECTS")), "static chart-owned XLSX is classified inert");

        Map<String, byte[]> arbitraryParts = new LinkedHashMap<>(OoxmlPackageSupport.read(baseDocument()));
        arbitraryParts.put("word/embeddings/oleObject1.bin", "opaque".getBytes(StandardCharsets.UTF_8));
        DocumentProcessingService.Inspection arbitrary = new DocumentProcessingService().inspect(DocumentFormat.DOCX, OoxmlPackageSupport.write(arbitraryParts));
        check(arbitrary.diagnostics().contains("ACTIVE_CONTENT:EMBEDDED_OBJECTS"), "arbitrary embedded object remains active content");

        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(safe));
        DocxAdvancedSemanticMasteryEngine.ChartWorkbookSnapshot snapshot = engine.readChartWorkbooks(safe).get(0);
        Map<String, byte[]> xlsx = new LinkedHashMap<>(OoxmlPackageSupport.read(parts.get(snapshot.workbookPart())));
        xlsx.put("xl/worksheets/sheetFormula.xml", ("<x:worksheet xmlns:x=\"" + X + "\"><x:sheetData><x:row r=\"1\"><x:c r=\"A1\"><x:f t=\"array\">SUM(1,2)</x:f><x:v>3</x:v></x:c></x:row></x:sheetData></x:worksheet>").getBytes(StandardCharsets.UTF_8));
        parts.put(snapshot.workbookPart(), OoxmlPackageSupport.write(xlsx));
        DocumentProcessingService.Inspection formula = new DocumentProcessingService().inspect(DocumentFormat.DOCX, OoxmlPackageSupport.write(parts));
        check(formula.diagnostics().contains("ACTIVE_CONTENT:EMBEDDED_OBJECTS"), "formula-bearing embedded workbook remains active content");
    }

    private static void testNegativeCases() throws Exception {
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        byte[] source = baseDocument();
        expect(IllegalArgumentException.class, () -> engine.insertEquation(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.EquationSpec("")), "blank equation rejected");
        expect(IllegalArgumentException.class, () -> engine.insertHyperlink(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("", "https://example.com", "")), "blank hyperlink text rejected");
        expect(IllegalArgumentException.class, () -> engine.insertSmartArt(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.SmartArtSpec("", List.of())), "empty SmartArt rejected");
        expect(IllegalArgumentException.class, () -> engine.insertBookmark(source, "body/p:1", ""), "blank bookmark rejected");
        expect(IllegalArgumentException.class, () -> engine.insertBookmark(source, "body/p:1", "bad bookmark"), "invalid bookmark syntax rejected");
        expect(IllegalArgumentException.class, () -> engine.insertHyperlink(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Unsafe", "javascript:alert(1)", "")), "unsafe hyperlink scheme rejected");
        expect(IllegalArgumentException.class, () -> engine.insertHyperlink(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Missing", "#MissingBookmark", "")), "internal hyperlink to missing bookmark rejected");
        expect(IllegalArgumentException.class, () -> engine.insertCrossReference(source, "body/p:1", new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec("MissingBookmark", "Missing", true)), "cross-reference to missing bookmark rejected");
        expect(IllegalArgumentException.class, () -> new DocxAdvancedSemanticMasteryEngine.FieldSpec("DDEAUTO WINWORD command", ""), "effectful DDEAUTO field rejected");
        expect(IllegalArgumentException.class, () -> new DocxAdvancedSemanticMasteryEngine.FieldSpec("INCLUDETEXT https://example.com/a", ""), "effectful INCLUDETEXT field rejected");
        expect(java.io.IOException.class, () -> engine.editFootnote(source, "footnote:999", "x"), "missing footnote fails closed");
        expect(IllegalArgumentException.class, () -> new DocxAdvancedSemanticMasteryEngine.WorkbookSpec("Data", List.of("A"), List.of()), "misaligned workbook data rejected");
    }

    private static byte[] fullSemanticFixture() throws Exception {
        byte[] source = preserved(baseDocument());
        DocxDrawingChartMasteryEngine charts = new DocxDrawingChartMasteryEngine();
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        source = charts.insertChart(source, "body/p:1", chart("bar", "Revenue", List.of(10.0, 20.0, 30.0)));
        source = engine.upsertChartWorkbook(source, "body/p:1/chart:1", workbook("Revenue", List.of(10.0, 20.0, 30.0)));
        source = engine.formatChartDecorations(source, "body/p:1/chart:1", new DocxAdvancedSemanticMasteryEngine.ChartDecorations("Revenue", "Quarter", "USD", "r", true, true));
        source = engine.insertSmartArt(source, "body/p:3", smartArt("Process", "Start", "Review", "Finish"));
        source = engine.insertEquation(source, "body/p:5", new DocxAdvancedSemanticMasteryEngine.EquationSpec("E=mc^2"));
        source = engine.insertHyperlink(source, "body/p:6", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Reference", "https://example.com", "Link"));
        source = engine.insertBookmark(source, "body/p:8", "TargetBookmark");
        source = engine.insertHyperlink(source, "body/p:15", new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec("Jump", "#TargetBookmark", "Internal"));
        source = engine.insertCrossReference(source, "body/p:9", new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec("TargetBookmark", "See target", true));
        source = engine.insertSimpleField(source, "body/p:10", new DocxAdvancedSemanticMasteryEngine.FieldSpec("DATE \\@ yyyy-MM-dd", "2026-08-31"));
        source = engine.insertComplexField(source, "body/p:11", new DocxAdvancedSemanticMasteryEngine.FieldSpec("AUTHOR", "System Master"));
        source = engine.insertFootnote(source, "body/p:12", "Footnote semantic");
        source = engine.insertEndnote(source, "body/p:13", "Endnote semantic");
        source = engine.insertCaption(source, "body/p:14", new DocxAdvancedSemanticMasteryEngine.CaptionSpec("Figure", "Architecture", "Figure"));
        return source;
    }

    private static byte[] baseDocument() throws Exception {
        ArrayList<String> paragraphs = new ArrayList<>();
        for (int i = 1; i <= 20; i++) paragraphs.add("T06 host " + i);
        return new DocxFullLaneEngine().createDocument(paragraphs);
    }

    private static DocxDrawingChartMasteryEngine.ChartSpec chart(String type, String title, List<Double> values) {
        return new DocxDrawingChartMasteryEngine.ChartSpec(type, title, 5000000, 3000000, List.of(new DocxDrawingChartMasteryEngine.ChartSeries("Series 1", List.of("A", "B", "C"), values)));
    }

    private static DocxAdvancedSemanticMasteryEngine.WorkbookSpec workbook(String sheet, List<Double> values) { return new DocxAdvancedSemanticMasteryEngine.WorkbookSpec(sheet, List.of("A", "B", "C"), values); }
    private static DocxAdvancedSemanticMasteryEngine.SmartArtSpec smartArt(String title, String... values) { ArrayList<DocxAdvancedSemanticMasteryEngine.SmartArtNode> nodes = new ArrayList<>(); for (int i = 0; i < values.length; i++) nodes.add(new DocxAdvancedSemanticMasteryEngine.SmartArtNode("n" + (i + 1), values[i])); return new DocxAdvancedSemanticMasteryEngine.SmartArtSpec(title, nodes); }

    private static byte[] preserved(byte[] source) throws Exception { Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); parts.put("customXml/t06.xml", "<t06 preserve=\"true\"/>".getBytes(StandardCharsets.UTF_8)); return OoxmlPackageSupport.write(parts); }

    private static byte[] replaceFirstWorkbookWithRelationshipFixture(byte[] source) throws Exception {
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        String workbookPart = engine.readChartWorkbooks(source).get(0).workbookPart();
        LinkedHashMap<String, byte[]> xlsx = new LinkedHashMap<>();
        xlsx.put("[Content_Types].xml", ("<?xml version=\"1.0\"?><Types xmlns=\"" + CT + "\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/data99.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/sharedStrings.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml\"/></Types>").getBytes(StandardCharsets.UTF_8));
        xlsx.put("_rels/.rels", ("<Relationships xmlns=\"" + REL + "\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>").getBytes(StandardCharsets.UTF_8));
        xlsx.put("xl/workbook.xml", ("<workbook xmlns=\"" + X + "\" xmlns:r=\"" + R + "\"><sheets><sheet name=\"SparseData\" sheetId=\"1\" r:id=\"rId9\"/></sheets></workbook>").getBytes(StandardCharsets.UTF_8));
        xlsx.put("xl/_rels/workbook.xml.rels", ("<Relationships xmlns=\"" + REL + "\"><Relationship Id=\"rId9\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/data99.xml\"/></Relationships>").getBytes(StandardCharsets.UTF_8));
        xlsx.put("xl/sharedStrings.xml", ("<sst xmlns=\"" + X + "\"><si><t>Category</t></si><si><t>Value</t></si><si><t>Alpha</t></si><si><t>Beta</t></si></sst>").getBytes(StandardCharsets.UTF_8));
        xlsx.put("xl/worksheets/data99.xml", ("<worksheet xmlns=\"" + X + "\"><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"C1\" t=\"s\"><v>1</v></c></row><row r=\"2\"><c r=\"A2\" t=\"s\"><v>2</v></c><c r=\"C2\"><v>42</v></c></row><row r=\"3\"><c r=\"A3\" t=\"s\"><v>3</v></c><c r=\"C3\"><v>84</v></c></row></sheetData></worksheet>").getBytes(StandardCharsets.UTF_8));
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put(workbookPart, OoxmlPackageSupport.write(xlsx));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] forceSecondWorkbookAlias(byte[] source) throws Exception {
        DocxAdvancedSemanticMasteryEngine engine = new DocxAdvancedSemanticMasteryEngine();
        List<DocxAdvancedSemanticMasteryEngine.ChartWorkbookSnapshot> snapshots = engine.readChartWorkbooks(source);
        if (snapshots.size() < 2) throw new IllegalStateException("two chart workbooks required");
        String target = snapshots.get(0).workbookPart(); String chartPart = snapshots.get(1).chartPart(); String relsPart = chartRelsPart(chartPart);
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); Document rels = OoxmlPackageSupport.parseXml(parts.get(relsPart));
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < list.getLength(); i++) { Element rel = (Element) list.item(i); if (snapshots.get(1).relationshipId().equals(rel.getAttribute("Id"))) { rel.setAttribute("Target", "../embeddings/" + target.substring(target.lastIndexOf('/') + 1)); break; } }
        parts.put(relsPart, OoxmlPackageSupport.serialize(rels)); return OoxmlPackageSupport.write(parts);
    }

    private static String chartRelsPart(String chartPart) { int slash = chartPart.lastIndexOf('/'); return chartPart.substring(0, slash + 1) + "_rels/" + chartPart.substring(slash + 1) + ".rels"; }

    private static byte[] cloneFirstDescendant(byte[] source, String fromParagraph, String toParagraph, String ns, String local) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml")); Element from = paragraph(doc, fromParagraph); Element to = paragraph(doc, toParagraph);
        Element target = (Element) from.getElementsByTagNameNS(ns, local).item(0); if (target == null) throw new IllegalStateException("clone target missing");
        Node top = target; while (top.getParentNode() != from && top.getParentNode() != null) top = top.getParentNode(); to.appendChild(doc.importNode(top, true)); parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc)); return OoxmlPackageSupport.write(parts);
    }

    private static Element paragraph(Document doc, String locator) { int index = Integer.parseInt(locator.substring("body/p:".length())); Element body = (Element) doc.getElementsByTagNameNS(W, "body").item(0); int current = 0; for (Node n = body.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && W.equals(e.getNamespaceURI()) && "p".equals(e.getLocalName()) && ++current == index) return e; throw new IllegalArgumentException("paragraph out of range"); }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static Set<String> t06Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 316; i <= 375; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static Set<String> allCapabilities() { LinkedHashSet<String> ids = new LinkedHashSet<>(T06); for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i)); for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); ids.add("UDM-FOUNDATION-0064"); for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(ids); }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception { FilePlatform008Repository repo = new FilePlatform008Repository(root.resolve("meta")); GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("bytes"), ArtifactIntakePolicy.conservative(64L * 1024 * 1024), repo, CLOCK); return new UniversalDocumentSpine(gateway, new FileDocumentSpineCheckpointStore(root.resolve("cp")), new FileDocumentSpineVersionStore(root.resolve("versions")), new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK), CLOCK,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(CLOCK)); }
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T06-PORTABLE", "qualification", FIXED); }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expect(Class<? extends Throwable> expected, Throwing action, String message) throws Exception { assertions++; try { action.run(); } catch (Throwable t) { if (expected.isInstance(t)) return; throw new AssertionError(message + " wrong exception=" + t, t); } throw new AssertionError(message + " did not fail"); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path p : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private static String sha(byte[] bytes) { return OoxmlPackageSupport.sha256(bytes); }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t06 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t06", "SyntheticRasterOracle", "docx-mastery-t06", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t06".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }

    @FunctionalInterface private interface Throwing { void run() throws Exception; }
}
