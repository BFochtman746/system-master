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
import org.systemmaster.tools.docx.DocxTableImageMasteryEngine;
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
import java.util.Base64;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T04 portable semantic + governed-spine qualification. */
public final class DocumentDocxMasteryT04PortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T22:30:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T04_CAPABILITIES = t04Capabilities();
    private static final byte[] PNG_A = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9ZkAAAAASUVORK5CYII=");
    private static final byte[] PNG_B = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mNk+M/wHwAF/gL+R4e4WQAAAABJRU5ErkJggg==");
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testTablesReadCreateEditRoundTrip();
        testMergedSplitNestedAndCanonicalSemantics();
        testImagesInlineFloatingAndCopyOnWrite();
        testGovernedSpineTablesAndImages();
        testNegativeAndDurableFailure();
        check(T04_CAPABILITIES.size() == 60, "T04 owns exactly 60 atomic capabilities");
        System.out.println("DOCUMENT_DOCX_MASTERY_T04_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T04_CAPABILITIES.size());
    }

    private static void testTablesReadCreateEditRoundTrip() throws Exception {
        DocxTableImageMasteryEngine engine = new DocxTableImageMasteryEngine();
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Before Table", "After Table")));
        byte[] preserve = OoxmlPackageSupport.read(source).get("customXml/t04.xml");
        DocxTableImageMasteryEngine.BorderEdge border = new DocxTableImageMasteryEngine.BorderEdge("single", 8, 0, "4472C4");
        DocxTableImageMasteryEngine.TableFormat format = new DocxTableImageMasteryEngine.TableFormat(
                new DocxTableImageMasteryEngine.Width(7200, "dxa"),
                new DocxTableImageMasteryEngine.CellMargins(120, 120, 120, 120),
                new DocxTableImageMasteryEngine.TableBorders(border, border, border, border, border, border),
                new DocxTableImageMasteryEngine.Shading("clear", "FFF2CC", "AUTO"));
        DocxTableImageMasteryEngine.TableSpec spec = new DocxTableImageMasteryEngine.TableSpec(List.of(
                row(true, 420, "exact", cell("H1"), cell("H2"), cell("H3")),
                row(false, 360, "atLeast", cell("A1"), cell("A2"), cell("A3"))), format);
        source = engine.insertTable(source, "body/p:1", spec);
        List<DocxTableImageMasteryEngine.TableSnapshot> tables = engine.readTables(source);
        check(tables.size() == 1, "table READ finds inserted table");
        DocxTableImageMasteryEngine.TableSnapshot table = tables.get(0);
        check(Integer.valueOf(7200).equals(table.width().value()) && "dxa".equals(table.width().type()), "table width EXTRACT preserves value/type");
        check(table.rows().size() == 2 && table.rows().get(0).repeatHeader(), "repeating header row READ/EXTRACT round-trips");
        check(Integer.valueOf(420).equals(table.rows().get(0).height().valueTwips()) && "exact".equals(table.rows().get(0).height().rule()), "row height READ/EXTRACT round-trips");
        check(Integer.valueOf(120).equals(table.defaultCellMargins().leftTwips()), "default cell margins EXTRACT round-trips");
        check(table.borders() != null && "4472C4".equals(table.borders().top().colorHex()), "table borders EXTRACT round-trip");
        check("FFF2CC".equals(table.shading().fillHex()), "table shading EXTRACT round-trip");

        source = engine.formatRow(source, "body/tbl:1/tr:2", new DocxTableImageMasteryEngine.RowHeight(500, "exact"), true);
        source = engine.formatCell(source, "body/tbl:1/tr:2/tc:2", new DocxTableImageMasteryEngine.CellMargins(60, 80, 100, 120), "center");
        source = engine.formatTable(source, "body/tbl:1", new DocxTableImageMasteryEngine.TableFormat(
                new DocxTableImageMasteryEngine.Width(80, "pct"),
                new DocxTableImageMasteryEngine.CellMargins(90, 90, 90, 90),
                new DocxTableImageMasteryEngine.TableBorders(new DocxTableImageMasteryEngine.BorderEdge("double", 12, 2, "993333"), border, border, border, border, border),
                new DocxTableImageMasteryEngine.Shading("clear", "EAF2F8", "AUTO")));
        table = engine.readTables(source).get(0);
        check(Integer.valueOf(80).equals(table.width().value()) && "pct".equals(table.width().type()), "table width MASTER updates target semantics");
        check(Integer.valueOf(500).equals(table.rows().get(1).height().valueTwips()) && table.rows().get(1).repeatHeader(), "row height/header MASTER round-trip");
        DocxTableImageMasteryEngine.CellSnapshot cell = table.rows().get(1).cells().get(1);
        check("center".equals(cell.verticalAlignment()), "cell vertical alignment MASTER round-trip");
        check(Integer.valueOf(120).equals(cell.margins().leftTwips()) && Integer.valueOf(60).equals(cell.margins().topTwips()), "cell margins MASTER round-trip");
        check("double".equals(table.borders().top().style()) && "993333".equals(table.borders().top().colorHex()), "table border MASTER updates target edge");
        check("EAF2F8".equals(table.shading().fillHex()), "table shading MASTER updates fill");
        check(java.util.Arrays.equals(preserve, OoxmlPackageSupport.read(source).get("customXml/t04.xml")), "table operations preserve unrelated OPC part exactly");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element canonicalTable = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE).findFirst().orElseThrow();
        check("80".equals(canonicalTable.semantic().properties().get("width.value")), "CDG-2 extracts table width semantics");
        check("EAF2F8".equals(canonicalTable.semantic().properties().get("shading.fillHex")), "CDG-2 extracts table shading semantics");
        CanonicalDocumentGraphV2.Element canonicalRow = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_ROW && "500".equals(e.semantic().properties().get("heightTwips"))).findFirst().orElseThrow();
        check("true".equals(canonicalRow.semantic().properties().get("repeatHeader")), "CDG-2 extracts repeating-header semantics");
        CanonicalDocumentGraphV2.Element canonicalCell = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_CELL && e.text().contains("A2")).findFirst().orElseThrow();
        check("center".equals(canonicalCell.semantic().properties().get("verticalAlignment")), "CDG-2 extracts cell alignment semantics");
        check("120".equals(canonicalCell.semantic().properties().get("margin.leftTwips")), "CDG-2 extracts cell margins");
    }

    private static void testMergedSplitNestedAndCanonicalSemantics() throws Exception {
        DocxTableImageMasteryEngine engine = new DocxTableImageMasteryEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Merge Host"));
        DocxTableImageMasteryEngine.TableSpec spec = new DocxTableImageMasteryEngine.TableSpec(List.of(
                row(false, null, "", cell("R1C1"), cell("R1C2"), cell("R1C3")),
                row(false, null, "", cell("R2C1"), cell("R2C2"), cell("R2C3")),
                row(false, null, "", cell("R3C1"), cell("R3C2"), cell("R3C3"))), DocxTableImageMasteryEngine.TableFormat.empty());
        source = engine.insertTable(source, "body/p:1", spec);
        source = engine.mergeCellsHorizontal(source, "body/tbl:1/tr:1", 1, 2);
        DocxTableImageMasteryEngine.TableSnapshot table = engine.readTables(source).stream().filter(t -> "body/tbl:1".equals(t.locator())).findFirst().orElseThrow();
        check(table.rows().get(0).cells().size() == 2, "horizontal merge removes covered native cell");
        check(table.rows().get(0).cells().get(0).gridSpan() == 2, "merged table cell READ/EXTRACT exposes gridSpan");
        check(table.rows().get(0).cells().get(0).text().contains("R1C1") && table.rows().get(0).cells().get(0).text().contains("R1C2"), "horizontal merge preserves source cell text");
        source = engine.splitCell(source, "body/tbl:1/tr:1/tc:1", 2);
        table = engine.readTables(source).stream().filter(t -> "body/tbl:1".equals(t.locator())).findFirst().orElseThrow();
        check(table.rows().get(0).cells().size() == 3, "split cell CREATE restores cell structure");
        check(table.rows().get(0).cells().get(0).gridSpan() == 1, "split cell removes merged gridSpan");

        source = engine.mergeCellsVertical(source, "body/tbl:1", 1, 2, 2);
        table = engine.readTables(source).stream().filter(t -> "body/tbl:1".equals(t.locator())).findFirst().orElseThrow();
        check("restart".equals(table.rows().get(1).cells().get(0).verticalMerge()), "vertical merge start READ/EXTRACT");
        check("continue".equals(table.rows().get(2).cells().get(0).verticalMerge()), "vertical merge continuation READ/EXTRACT");

        source = engine.insertNestedTable(source, "body/tbl:1/tr:2/tc:2", new DocxTableImageMasteryEngine.TableSpec(
                List.of(row(false, null, "", cell("Nested A"), cell("Nested B"))), DocxTableImageMasteryEngine.TableFormat.empty()));
        List<DocxTableImageMasteryEngine.TableSnapshot> snapshots = engine.readTables(source);
        check(snapshots.size() == 2, "nested table READ discovers outer and nested tables");
        table = snapshots.stream().filter(t -> "body/tbl:1".equals(t.locator())).findFirst().orElseThrow();
        check(table.rows().get(1).cells().get(1).nestedTableCount() == 1, "nested table EXTRACT records owning cell nesting count");
        check(snapshots.stream().anyMatch(t -> t.locator().contains("/tc:2/tbl:1") && t.rows().get(0).cells().get(0).text().contains("Nested A")), "nested table structured content round-trips");

        CanonicalDocumentGraphV2 graph = project(source);
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE).count() == 2, "CDG-2 projects nested table as independent TABLE element");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_CELL && "restart".equals(e.semantic().properties().get("verticalMerge"))), "CDG-2 extracts vertical merge restart");
        CanonicalDocumentGraphV2.Element nested = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE && e.nativeAnchor().locator().contains("/tbl:1/tr:2/tc:2/tbl:1")).findFirst().orElseThrow();
        CanonicalDocumentGraphV2.Element owner = graph.requireElement(nested.parentId());
        check(owner.type() == CanonicalDocumentGraphV2.ElementType.TABLE_CELL, "nested CDG-2 table preserves cell ownership");
    }

    private static void testImagesInlineFloatingAndCopyOnWrite() throws Exception {
        DocxTableImageMasteryEngine engine = new DocxTableImageMasteryEngine();
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Inline Host", "Float Host", "Alias Host")));
        byte[] preserve = OoxmlPackageSupport.read(source).get("customXml/t04.xml");
        source = engine.insertInlineImage(source, "body/p:1", image(PNG_A, "Inline One", "Inline alt"));
        source = engine.insertFloatingImage(source, "body/p:2", image(PNG_A, "Float One", "Float alt"), new DocxTableImageMasteryEngine.FloatingPlacement(914400, 457200, "column", "paragraph", "square"));
        List<DocxTableImageMasteryEngine.ImageSnapshot> images = engine.readImages(source);
        check(images.size() == 2, "image READ finds inline and floating images");
        check("inline".equals(images.get(0).placement()), "inline image EXTRACT records placement");
        check("floating".equals(images.get(1).placement()), "floating image EXTRACT records placement");
        check(images.get(1).xEmu() == 914400 && images.get(1).yEmu() == 457200, "floating image EXTRACT records coordinates");
        check("Inline alt".equals(images.get(0).altText()) && "Float alt".equals(images.get(1).altText()), "image accessibility metadata round-trips");
        check(images.stream().allMatch(i -> !i.partName().isBlank() && !i.relationshipId().isBlank()), "image EXTRACT retains media part and relationship anchors");

        source = engine.formatImage(source, "body/p:2/drawing-image:1", new DocxTableImageMasteryEngine.ImageFormat(1828800L, 914400L, 228600L, 685800L, "Float title revised", "Float alt revised"));
        images = engine.readImages(source);
        DocxTableImageMasteryEngine.ImageSnapshot floating = images.stream().filter(i -> "floating".equals(i.placement())).findFirst().orElseThrow();
        check(floating.widthEmu() == 1828800 && floating.heightEmu() == 914400, "floating image MASTER updates dimensions");
        check(floating.xEmu() == 228600 && floating.yEmu() == 685800, "floating image MASTER updates coordinates");
        check("Float alt revised".equals(floating.altText()) && "Float title revised".equals(floating.title()), "image MASTER updates accessibility metadata");

        source = addSharedImageAlias(source, "body/p:1", "body/p:3");
        images = engine.readImages(source);
        DocxTableImageMasteryEngine.ImageSnapshot first = images.stream().filter(i -> i.locator().equals("body/p:1/drawing-image:1")).findFirst().orElseThrow();
        DocxTableImageMasteryEngine.ImageSnapshot alias = images.stream().filter(i -> i.locator().equals("body/p:3/drawing-image:1")).findFirst().orElseThrow();
        check(first.partName().equals(alias.partName()), "fixture proves two drawings alias one media part before replacement");
        byte[] originalShared = OoxmlPackageSupport.read(source).get(first.partName());
        source = engine.replaceImageBytes(source, first.locator(), PNG_B, "png");
        images = engine.readImages(source);
        first = images.stream().filter(i -> i.locator().equals("body/p:1/drawing-image:1")).findFirst().orElseThrow();
        alias = images.stream().filter(i -> i.locator().equals("body/p:3/drawing-image:1")).findFirst().orElseThrow();
        check(!first.partName().equals(alias.partName()), "image MASTER copy-on-write detaches target from shared media part");
        check(java.util.Arrays.equals(PNG_B, OoxmlPackageSupport.read(source).get(first.partName())), "detached target receives replacement bytes");
        check(java.util.Arrays.equals(originalShared, OoxmlPackageSupport.read(source).get(alias.partName())), "shared alias retains original media bytes");
        check(java.util.Arrays.equals(preserve, OoxmlPackageSupport.read(source).get("customXml/t04.xml")), "image operations preserve unrelated OPC part exactly");

        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element inline = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && e.nativeAnchor().locator().equals("body/p:1/drawing-image:1")).findFirst().orElseThrow();
        CanonicalDocumentGraphV2.Element floatElement = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE && e.nativeAnchor().locator().equals("body/p:2/drawing-image:1")).findFirst().orElseThrow();
        check("inline".equals(inline.semantic().properties().get("placement")), "CDG-2 extracts inline image placement");
        check("anchor".equals(floatElement.semantic().properties().get("placement")), "CDG-2 extracts floating image native placement");
        check("228600".equals(floatElement.geometry().properties().get("xEmu")) && "685800".equals(floatElement.geometry().properties().get("yEmu")), "CDG-2 extracts floating image coordinates");
        check(floatElement.assetIds().size() == 1, "CDG-2 binds image element to extracted media asset");
    }

    private static void testGovernedSpineTablesAndImages() throws Exception {
        byte[] source = addPreservedParts(new DocxFullLaneEngine().createDocument(List.of("Spine Table Host", "Spine Image Host")));
        CanonicalDocumentGraphV2 graph = project(source);
        String p1 = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Spine Table Host").id();
        Map<String, String> tableParams = new LinkedHashMap<>();
        tableParams.put("docx.action", "INSERT_TABLE");
        tableParams.put("table.rows", "2"); tableParams.put("table.columns", "2");
        tableParams.put("table.width.value", "6000"); tableParams.put("table.width.type", "dxa");
        tableParams.put("table.row.1.repeatHeader", "true");
        tableParams.put("table.cell.1.1.text", "Gov H1"); tableParams.put("table.cell.1.2.text", "Gov H2");
        tableParams.put("table.cell.2.1.text", "Gov A1"); tableParams.put("table.cell.2.2.text", "Gov A2");
        DocumentSpineResult tableResult = execute(source, p1, DocumentOperationContract.Type.INSERT_CONTENT, tableParams, Set.of("word/document.xml"), "table-insert");
        assertProved(tableResult, "table-insert");
        check(new DocxTableImageMasteryEngine().readTables(tableResult.resultBytes()).size() == 1, "governed spine creates native table");
        check(project(tableResult.resultBytes()).elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_CELL && e.text().contains("Gov A2")), "governed table reprojects through CDG-2");

        graph = project(tableResult.resultBytes());
        String p2 = element(graph, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, "Spine Image Host").id();
        Map<String, String> imageParams = new LinkedHashMap<>();
        imageParams.put("docx.action", "INSERT_INLINE_IMAGE");
        imageParams.put("image.base64", Base64.getEncoder().encodeToString(PNG_A)); imageParams.put("image.extension", "png");
        imageParams.put("image.widthEmu", "914400"); imageParams.put("image.heightEmu", "914400"); imageParams.put("image.name", "Governed Image"); imageParams.put("image.altText", "Governed image alt");
        DocumentSpineResult imageResult = execute(tableResult.resultBytes(), p2, DocumentOperationContract.Type.INSERT_CONTENT, imageParams, Set.of("word/document.xml", "word/_rels/document.xml.rels", "[Content_Types].xml", "word/media/*"), "image-insert");
        assertProved(imageResult, "image-insert");
        check(new DocxTableImageMasteryEngine().readImages(imageResult.resultBytes()).size() == 1, "governed spine creates native inline image");
        check(OoxmlPackageSupport.read(imageResult.resultBytes()).containsKey("customXml/t04.xml"), "governed image creation preserves unrelated custom part");

        graph = project(imageResult.resultBytes());
        String imageId = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE).findFirst().orElseThrow().id();
        DocumentSpineResult formatResult = execute(imageResult.resultBytes(), imageId, DocumentOperationContract.Type.FORMAT, Map.of(
                "docx.action", "FORMAT_IMAGE", "image.widthEmu", "1371600", "image.heightEmu", "685800", "image.altText", "Governed revised alt"), Set.of("word/document.xml"), "image-format");
        assertProved(formatResult, "image-format");
        DocxTableImageMasteryEngine.ImageSnapshot formatted = new DocxTableImageMasteryEngine().readImages(formatResult.resultBytes()).get(0);
        check(formatted.widthEmu() == 1371600 && "Governed revised alt".equals(formatted.altText()), "governed image MASTER applies typed semantic patch");
    }

    private static void testNegativeAndDurableFailure() throws Exception {
        DocxTableImageMasteryEngine engine = new DocxTableImageMasteryEngine();
        byte[] source = new DocxFullLaneEngine().createDocument(List.of("Negative T04"));
        expectIllegal(() -> new DocxTableImageMasteryEngine.Width(-1, "dxa"), "negative table width fails closed");
        expectIllegal(() -> new DocxTableImageMasteryEngine.CellSpec("x", 0, "", "", DocxTableImageMasteryEngine.CellMargins.empty()), "zero grid span fails closed");
        expectIllegal(() -> new DocxTableImageMasteryEngine.FloatingPlacement(0, 0, "column", "paragraph", "bogus"), "invalid floating wrap fails closed");
        expectIllegal(() -> engine.insertTable(source, "body/../p:1", oneCellTable("x")), "unsafe table locator traversal fails closed");
        byte[] withTable = engine.insertTable(source, "body/p:1", new DocxTableImageMasteryEngine.TableSpec(List.of(row(false, null, "", cell("A"), cell("B"))), DocxTableImageMasteryEngine.TableFormat.empty()));
        expectIllegal(() -> engine.splitCell(withTable, "body/tbl:1/tr:1/tc:1", 2), "splitting unmerged cell beyond grid span fails closed");
        expectIllegal(() -> engine.formatImage(source, "body/p:1/drawing-image:1", new DocxTableImageMasteryEngine.ImageFormat(100L, 100L, null, null, null, null)), "missing image target fails closed");

        Path root = Files.createTempDirectory("docx-t04-failure-");
        try {
            CanonicalDocumentGraphV2 graph = project(withTable);
            String cellId = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_CELL).findFirst().orElseThrow().id();
            DocumentOperationContract operation = operation(graph, cellId, DocumentOperationContract.Type.FORMAT,
                    Map.of("docx.action", "SPLIT_TABLE_CELL", "table.parts", "3"), Set.of("word/document.xml"), "invalid-split");
            DocumentSpineJob job = job("negative-source", "negative-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(cellId), allCapabilities(), List.of());
            expectAny(() -> spine(root).executeExisting(job, new ByteArrayInputStream(withTable), plan), "invalid table split through spine fails closed");
            List<DocumentSpineStageReceipt> receipts = checkpointStore(root).receipts(job.jobId());
            check(receipts.stream().anyMatch(r -> r.stage() == DocumentSpineStage.MASTER && r.status() == DocumentSpineStageReceipt.Status.FAIL), "T04 failed native mutation is durably checkpointed");
        } finally { deleteTree(root); }
    }

    private static DocxTableImageMasteryEngine.CellSpec cell(String text) { return DocxTableImageMasteryEngine.CellSpec.text(text); }
    private static DocxTableImageMasteryEngine.RowSpec row(boolean header, Integer height, String rule, DocxTableImageMasteryEngine.CellSpec... cells) { return new DocxTableImageMasteryEngine.RowSpec(List.of(cells), new DocxTableImageMasteryEngine.RowHeight(height, rule), header); }
    private static DocxTableImageMasteryEngine.TableSpec oneCellTable(String text) { return new DocxTableImageMasteryEngine.TableSpec(List.of(row(false, null, "", cell(text))), DocxTableImageMasteryEngine.TableFormat.empty()); }
    private static DocxTableImageMasteryEngine.ImageSpec image(byte[] bytes, String name, String alt) { return new DocxTableImageMasteryEngine.ImageSpec(bytes, "png", 914400, 914400, name, "", alt); }

    private static DocumentSpineResult execute(byte[] source, String targetId, DocumentOperationContract.Type type, Map<String, String> parameters, Set<String> expectedParts, String label) throws Exception {
        Path root = Files.createTempDirectory("docx-t04-" + label + "-");
        try {
            CanonicalDocumentGraphV2 graph = project(source);
            DocumentOperationContract operation = operation(graph, targetId, type, parameters, expectedParts, label);
            DocumentSpineJob job = job(label + "-source", label + "-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(targetId), allCapabilities(), List.of());
            return spine(root).executeExisting(job, new ByteArrayInputStream(source), plan);
        } finally { deleteTree(root); }
    }

    private static DocumentOperationContract operation(CanonicalDocumentGraphV2 graph, String targetId, DocumentOperationContract.Type type, Map<String, String> parameters, Set<String> expectedParts, String label) {
        return new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "docx-mastery-t04-" + label, graph.sourceSha256(), graph.semanticDigest(), type,
                List.of(DocumentSelector.node(targetId)), "DOCUMENT-DOCX-MASTERY-T04 semantic native operation " + label, parameters,
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
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T04", "qualification", FIXED); }
    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static CanonicalDocumentGraphV2.Element element(CanonicalDocumentGraphV2 graph, CanonicalDocumentGraphV2.ElementType type, String text) { return graph.elements().stream().filter(e -> e.type() == type && e.text().contains(text)).findFirst().orElseThrow(() -> new AssertionError("element not found " + type + " " + text)); }

    private static Set<String> allCapabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>(T04_CAPABILITIES);
        for (int i = 1; i <= 21; i++) out.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 34; i <= 54; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        out.add("UDM-FOUNDATION-0064");
        for (int i = 76; i <= 85; i++) out.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }
    private static Set<String> t04Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 196; i <= 255; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }

    private static byte[] addSharedImageAlias(byte[] source, String fromParagraphLocator, String toParagraphLocator) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element from = paragraph(document, fromParagraphLocator);
        Element to = paragraph(document, toParagraphLocator);
        Element run = null;
        for (Element child : directChildren(from)) if ("r".equals(child.getLocalName()) && child.getElementsByTagNameNS(DocxTableImageMasteryEngine.W, "drawing").getLength() > 0) { run = child; break; }
        if (run == null) throw new IllegalStateException("source image run missing");
        to.appendChild(run.cloneNode(true));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        return OoxmlPackageSupport.write(parts);
    }

    private static Element paragraph(Document document, String locator) {
        int index = Integer.parseInt(locator.substring("body/p:".length()));
        Element body = (Element) document.getElementsByTagNameNS(DocxTableImageMasteryEngine.W, "body").item(0);
        int current = 0;
        for (Element child : directChildren(body)) if ("p".equals(child.getLocalName()) && ++current == index) return child;
        throw new IllegalArgumentException("paragraph not found: " + locator);
    }
    private static List<Element> directChildren(Element parent) { java.util.ArrayList<Element> out = new java.util.ArrayList<>(); org.w3c.dom.Node node = parent.getFirstChild(); while (node != null) { if (node instanceof Element e) out.add(e); node = node.getNextSibling(); } return out; }

    private static byte[] addPreservedParts(byte[] source) throws Exception { Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source)); parts.put("customXml/t04.xml", "<t04 xmlns=\"urn:t04\">preserve</t04>".getBytes(StandardCharsets.UTF_8)); return OoxmlPackageSupport.write(parts); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path path : walk.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); } }
    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expectIllegal(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException expected) { } }
    private static void expectAny(Throwing action, String message) throws Exception { assertions++; try { action.run(); throw new AssertionError(message); } catch (IllegalArgumentException | IllegalStateException | UnsupportedOperationException expected) { } }
    private static String sha(byte[] value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); } }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t04 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t04", "SyntheticRasterOracle", "docx-mastery-t04", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t04".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }
}
