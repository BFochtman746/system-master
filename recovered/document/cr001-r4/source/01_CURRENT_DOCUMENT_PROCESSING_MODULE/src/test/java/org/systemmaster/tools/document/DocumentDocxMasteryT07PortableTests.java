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
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxStructuredMetadataMasteryEngine;

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

/** DOCUMENT-DOCX-MASTERY-T07 portable semantic + preservation + governed-spine qualification. */
public final class DocumentDocxMasteryT07PortableTests {
    private static final Instant FIXED = Instant.parse("2026-09-01T02:00:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static final Set<String> T07 = t07Capabilities();
    private static final String STORE_A = "{11111111-1111-1111-1111-111111111111}";
    private static final String STORE_B = "{22222222-2222-2222-2222-222222222222}";
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testCitationsAndBibliography();
        testGeneratedTables();
        testContentControlsAndCustomXml();
        testLegacyFormsAndMetadata();
        testCanonicalProjection();
        testGovernedSpine();
        testNegativeAndOwnershipCases();
        check(T07.size() == 60, "T07 owns exactly 60 capabilities");
        System.out.println("DOCUMENT_DOCX_MASTERY_T07_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T07.size());
    }

    private static void testCitationsAndBibliography() throws Exception {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = engine.upsertBibliographySource(source, new DocxStructuredMetadataMasteryEngine.BibliographySource("Smith2026", "Book", "Reliable Systems", "Alex Smith", "2026"));
        source = engine.upsertBibliographySource(source, new DocxStructuredMetadataMasteryEngine.BibliographySource("Jones2025", "JournalArticle", "Document Graphs", "Jordan Jones", "2025"));
        check(engine.readBibliographySources(source).size() == 2, "bibliography source CREATE/READ enumerates structured sources");
        check(engine.readBibliographySources(source).stream().anyMatch(s -> "Reliable Systems".equals(s.title())), "bibliography EXTRACT preserves title");

        source = engine.insertCitation(source, "body/p:1", new DocxStructuredMetadataMasteryEngine.CitationSpec("Smith2026", "(Smith, 2026)", 1033));
        List<DocxStructuredMetadataMasteryEngine.CitationSnapshot> citations = engine.readCitations(source);
        check(citations.size() == 1, "citation READ enumerates native CITATION field");
        check("Smith2026".equals(citations.get(0).spec().tag()), "citation EXTRACT preserves source tag");
        check(citations.get(0).instruction().startsWith("CITATION"), "citation native instruction is retained");
        source = engine.editCitation(source, citations.get(0).locator(), new DocxStructuredMetadataMasteryEngine.CitationSpec("Jones2025", "(Jones, 2025)", 1033));
        check("Jones2025".equals(engine.readCitations(source).get(0).spec().tag()), "citation MASTER round-trips targeted source tag");
        check("(Jones, 2025)".equals(engine.readCitations(source).get(0).spec().displayText()), "citation MASTER round-trips result text");

        source = engine.insertBibliography(source, "body/p:2");
        List<DocxStructuredMetadataMasteryEngine.BibliographySnapshot> bibliographies = engine.readBibliographies(source);
        check(bibliographies.size() == 1, "bibliography READ enumerates native BIBLIOGRAPHY field");
        check(bibliographies.get(0).sources().size() == 2, "bibliography EXTRACT links structured source data");
        source = engine.editBibliography(source, bibliographies.get(0).locator(), "BIBLIOGRAPHY \\l 1033");
        check(engine.readBibliographies(source).get(0).instruction().contains("\\l 1033"), "bibliography MASTER updates native field instruction");
        source = engine.upsertBibliographySource(source, new DocxStructuredMetadataMasteryEngine.BibliographySource("Jones2025", "JournalArticle", "Document Graphs Revised", "Jordan Jones", "2025"));
        check(engine.readBibliographySources(source).stream().filter(s -> "Jones2025".equals(s.tag())).count() == 1, "bibliography source upsert does not duplicate tag");
        check(engine.readBibliographySources(source).stream().anyMatch(s -> "Document Graphs Revised".equals(s.title())), "bibliography source MASTER updates targeted record");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t07-preserve.xml"), "citation/bibliography operations preserve unrelated OPC part");
    }

    private static void testGeneratedTables() throws Exception {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = engine.insertGeneratedTable(source, "body/p:3", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS, "Contents", ""));
        source = engine.insertGeneratedTable(source, "body/p:4", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.INDEX, "Index", ""));
        source = engine.insertGeneratedTable(source, "body/p:5", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_FIGURES, "Figures", ""));
        List<DocxStructuredMetadataMasteryEngine.GeneratedTableSnapshot> tables = engine.readGeneratedTables(source);
        check(tables.size() == 3, "TOC/index/table-of-figures READ enumerates all generated fields");
        check(tables.stream().anyMatch(t -> t.spec().kind() == DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS && t.spec().instruction().contains("\\o")), "TOC EXTRACT preserves outline switch");
        check(tables.stream().anyMatch(t -> t.spec().kind() == DocxStructuredMetadataMasteryEngine.GeneratedTableKind.INDEX && t.spec().instruction().startsWith("INDEX")), "index EXTRACT preserves INDEX instruction");
        check(tables.stream().anyMatch(t -> t.spec().kind() == DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_FIGURES && t.spec().instruction().contains("\\c \"Figure\"")), "table of figures EXTRACT preserves caption switch");
        DocxStructuredMetadataMasteryEngine.GeneratedTableSnapshot toc = tables.stream().filter(t -> t.spec().kind() == DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS).findFirst().orElseThrow();
        source = engine.editGeneratedTable(source, toc.locator(), new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS, "Revised Contents", "TOC \\o \"1-2\" \\h \\z"));
        check(engine.readGeneratedTables(source).stream().anyMatch(t -> "Revised Contents".equals(t.spec().title()) && t.spec().instruction().contains("1-2")), "TOC MASTER round-trips title and switches");
        String settings = new String(OoxmlPackageSupport.read(source).get("word/settings.xml"), StandardCharsets.UTF_8);
        check(settings.contains("updateFields"), "generated tables request native field refresh on open");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t07-preserve.xml"), "generated-table operations preserve unrelated OPC part");
    }

    private static void testContentControlsAndCustomXml() throws Exception {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        byte[] source = preserved(baseDocument());
        DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec mapping = new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_A, "/root/name", "", "<root><name>Alice</name></root>");
        source = engine.createCustomXmlMapping(source, mapping);
        check(engine.readCustomXmlMappings(source).size() == 1, "custom XML mapping CREATE/READ round-trips package datastore");
        check(engine.readCustomXmlMappings(source).get(0).spec().xml().contains("Alice"), "custom XML mapping EXTRACT retains XML payload");

        DocxStructuredMetadataMasteryEngine.ContentControlSpec control = new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Customer Name", "customer-name", 701, "Alice", "contentLocked", "", "", "");
        source = engine.insertContentControl(source, "body/p:6", control, false);
        source = engine.bindContentControl(source, "content-control:1", mapping);
        DocxStructuredMetadataMasteryEngine.ContentControlSnapshot read = engine.readContentControls(source).get(0);
        check(!read.repeating() && "Customer Name".equals(read.spec().alias()), "content-control READ/EXTRACT returns alias and ordinary type");
        check(STORE_A.equals(read.spec().storeItemId()), "content-control dataBinding resolves custom XML datastore ID");
        check("/root/name".equals(read.spec().xpath()), "content-control dataBinding preserves XPath");

        DocxStructuredMetadataMasteryEngine.ContentControlSpec revised = new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Customer", "customer-name", 701, "Alice Revised", "sdtLocked", STORE_A, "/root/name", "");
        source = engine.editContentControl(source, "content-control:1", revised, false);
        check("Alice Revised".equals(engine.readContentControls(source).get(0).spec().text()), "content-control MASTER updates targeted content");
        check("sdtLocked".equals(engine.readContentControls(source).get(0).spec().lock()), "content-control MASTER updates lock semantics");

        source = engine.insertContentControl(source, "body/p:7", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Repeater", "rows", 702, "Repeated row", "", "", "", ""), true);
        check(engine.readContentControls(source).stream().anyMatch(DocxStructuredMetadataMasteryEngine.ContentControlSnapshot::repeating), "repeating content control CREATE emits native w15 repeatingSection");
        check(engine.readContentControls(source).stream().anyMatch(c -> c.repeating() && "rows".equals(c.spec().tag())), "repeating content control EXTRACT retains tag");
        source = engine.editContentControl(source, "content-control:2", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Repeater Revised", "rows", 702, "Row Revised", "contentLocked", "", "", ""), true);
        check(engine.readContentControls(source).stream().anyMatch(c -> c.repeating() && "Row Revised".equals(c.spec().text())), "repeating content control MASTER round-trips");

        source = engine.editCustomXmlMapping(source, "custom-xml:1", new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_A, "/root/name", "", "<root><name>Bob</name></root>"));
        check(engine.readCustomXmlMappings(source).get(0).spec().xml().contains("Bob"), "custom XML mapping MASTER updates targeted datastore content");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t07-preserve.xml"), "content-control/custom-XML operations preserve unrelated OPC part");
    }

    private static void testLegacyFormsAndMetadata() throws Exception {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = engine.insertLegacyFormField(source, "body/p:8", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.TEXT, "Client", "Acme", false, List.of(), true, true));
        source = engine.insertLegacyFormField(source, "body/p:9", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.CHECKBOX, "Approved", "", true, List.of(), true, false));
        source = engine.insertLegacyFormField(source, "body/p:10", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.DROPDOWN, "Priority", "High", false, List.of("Low", "Medium", "High"), true, false));
        List<DocxStructuredMetadataMasteryEngine.LegacyFormFieldSnapshot> forms = engine.readLegacyFormFields(source);
        check(forms.size() == 3, "legacy form READ enumerates text/checkbox/dropdown fields");
        check(forms.stream().anyMatch(f -> f.spec().type() == DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.TEXT && "Acme".equals(f.spec().defaultText())), "legacy text form EXTRACT preserves default");
        check(forms.stream().anyMatch(f -> f.spec().type() == DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.CHECKBOX && f.spec().checked()), "legacy checkbox EXTRACT preserves checked state");
        check(forms.stream().anyMatch(f -> f.spec().type() == DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.DROPDOWN && f.spec().dropdownItems().size() == 3), "legacy dropdown EXTRACT preserves items");
        source = engine.editLegacyFormField(source, forms.get(0).locator(), new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.TEXT, "Client", "Globex", false, List.of(), true, false));
        check(engine.readLegacyFormFields(source).stream().anyMatch(f -> "Client".equals(f.spec().name()) && "Globex".equals(f.spec().defaultText())), "legacy form MASTER edits targeted field");

        source = engine.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("core.title", "T07 Native Mastery"));
        source = engine.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("core.creator", "System Master"));
        source = engine.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("app.Company", "OpenAI"));
        check(engine.readDocumentProperties(source).stream().anyMatch(p -> "core.title".equals(p.name()) && "T07 Native Mastery".equals(p.value())), "document properties CREATE/READ/EXTRACT core title");
        check(engine.readDocumentProperties(source).stream().anyMatch(p -> "app.Company".equals(p.name()) && "OpenAI".equals(p.value())), "extended document properties CREATE/READ/EXTRACT company");
        source = engine.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("core.title", "T07 Revised"));
        check(engine.readDocumentProperties(source).stream().filter(p -> "core.title".equals(p.name())).count() == 1, "document property MASTER upserts without duplicate");

        source = engine.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("ReviewState", "string", "Approved", 0));
        source = engine.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("Score", "integer", "42", 0));
        source = engine.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("Visible", "boolean", "true", 0));
        source = engine.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("ReviewedAt", "date", "2026-08-31T21:00:00Z", 0));
        check(engine.readCustomProperties(source).size() == 4, "custom properties READ enumerates typed values");
        check(engine.readCustomProperties(source).stream().anyMatch(p -> "Score".equals(p.name()) && "integer".equals(p.type()) && "42".equals(p.value())), "custom properties EXTRACT preserves native value type");
        source = engine.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("Score", "integer", "84", 0));
        check(engine.readCustomProperties(source).stream().filter(p -> "Score".equals(p.name())).count() == 1, "custom property MASTER upserts without duplicate");
        check(engine.readCustomProperties(source).stream().anyMatch(p -> "Score".equals(p.name()) && "84".equals(p.value())), "custom property MASTER updates typed value");

        source = engine.upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable("Workflow", "Draft"));
        source = engine.upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable("Owner", "Documents"));
        check(engine.readDocumentVariables(source).size() == 2, "document variables CREATE/READ enumerates settings docVars");
        check(engine.readDocumentVariables(source).stream().anyMatch(v -> "Workflow".equals(v.name()) && "Draft".equals(v.value())), "document variables EXTRACT preserves value");
        source = engine.upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable("Workflow", "Final"));
        check(engine.readDocumentVariables(source).stream().filter(v -> "Workflow".equals(v.name())).count() == 1, "document variable MASTER upserts without duplicate");
        check(engine.readDocumentVariables(source).stream().anyMatch(v -> "Workflow".equals(v.name()) && "Final".equals(v.value())), "document variable MASTER updates value");
        check(OoxmlPackageSupport.read(source).containsKey("customXml/t07-preserve.xml"), "forms/metadata operations preserve unrelated OPC part");
    }

    private static void testCanonicalProjection() throws Exception {
        byte[] source = fullFixture();
        CanonicalDocumentGraphV2 graph = project(source);
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.CITATION && "citation".equals(e.semantic().role()) && "Smith2026".equals(e.semantic().properties().get("tag"))), "CDG-2 projects structured citation");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "bibliography".equals(e.semantic().role()) && e.data().values().stream().anyMatch(v -> v.startsWith("Smith2026\t"))), "CDG-2 projects bibliography with structured source rows");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "table-of-contents".equals(e.semantic().role())), "CDG-2 projects TOC semantic field");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "index".equals(e.semantic().role())), "CDG-2 projects index semantic field");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "table-of-figures".equals(e.semantic().role())), "CDG-2 projects table-of-figures semantic field");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT && "content-control".equals(e.semantic().role()) && "/root/name".equals(e.semantic().properties().get("xpath"))), "CDG-2 projects bound content-control semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT && "repeating-content-control".equals(e.semantic().role())), "CDG-2 projects repeating content-control semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "custom-xml-mapping".equals(e.semantic().role()) && e.data().values().stream().anyMatch(v -> v.contains("Alice"))), "CDG-2 projects custom XML mapping payload");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.FIELD && "legacy-form-field".equals(e.semantic().role())), "CDG-2 projects legacy form semantics");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "document-property".equals(e.semantic().role()) && "core.title".equals(e.semantic().properties().get("name"))), "CDG-2 projects document properties");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "custom-property".equals(e.semantic().role()) && "ReviewState".equals(e.semantic().properties().get("name"))), "CDG-2 projects custom properties");
        check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA && "document-variable".equals(e.semantic().role()) && "Workflow".equals(e.semantic().properties().get("name"))), "CDG-2 projects document variables");
    }

    private static void testGovernedSpine() throws Exception {
        byte[] source = preserved(baseDocument());
        CanonicalDocumentGraphV2 graph = project(source);
        CanonicalDocumentGraphV2.Element paragraph = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH && "body/p:11".equals(e.nativeAnchor().locator())).findFirst().orElseThrow();
        Map<String, String> params = new LinkedHashMap<>();
        params.put("docx.action", "INSERT_CONTENT_CONTROL"); params.put("contentControl.alias", "Governed T07"); params.put("contentControl.tag", "governed-t07"); params.put("contentControl.id", "707"); params.put("contentControl.text", "Governed structured content");
        DocumentOperationContract op = new DocumentOperationContract(DocumentOperationContract.SCHEMA_V1, "t07-spine-control", graph.sourceSha256(), graph.semanticDigest(), DocumentOperationContract.Type.INSERT_CONTENT,
                List.of(DocumentSelector.node(paragraph.id())), "T07 governed content-control insertion", params, DocumentOperationContract.Risk.REVERSIBLE_EDIT, graph.sourceSha256(),
                Set.of("word/document.xml"), DocumentOperationContract.VisualImpact.LAYOUT_CHANGE, false, List.of(), false, EnumSet.noneOf(DocumentProofReceipt.Gate.class));
        Path root = Files.createTempDirectory("document-docx-mastery-t07-spine-");
        try {
            UniversalDocumentSpine spine = spine(root, new SyntheticRenderer());
            DocumentSpineJob job = job("t07-source", "t07-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), op, Set.of(paragraph.id()), allCapabilities(), List.of());
            DocumentSpineResult result = spine.executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.publication() != null && result.publication().publicationClass() == DocumentSpinePublicationClass.VERIFIED_DRAFT, "T07 governed spine publishes verified draft");
            check(result.preservation() != null && result.preservation().pass(), "T07 governed spine preservation passes");
            check(result.finalization() != null && result.finalization().missing().isEmpty(), "T07 governed spine proof gates complete");
            check(new DocxStructuredMetadataMasteryEngine().readContentControls(result.resultBytes()).stream().anyMatch(c -> "governed-t07".equals(c.spec().tag())), "governed spine executes typed T07 content-control action");
            check(OoxmlPackageSupport.read(result.resultBytes()).containsKey("customXml/t07-preserve.xml"), "governed spine preserves unrelated custom XML");
        } finally { deleteTree(root); }
    }

    private static void testNegativeAndOwnershipCases() throws Exception {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        byte[] source = baseDocument();
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.CitationSpec("bad tag", "", 1033), "citation tag rejects unsafe whitespace");
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.INDEX, "", "TOC \\o \"1-3\""), "generated-table kind/instruction mismatch rejected");
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.ContentControlSpec("A", "B", 1, "x", "", STORE_A, "", ""), "half-defined dataBinding rejected");
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec("not-a-guid", "/x", "", "<x/>"), "custom XML mapping requires GUID storeItemId");
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.DROPDOWN, "Empty", "", false, List.of(), true, false), "legacy dropdown requires items");
        expect(IllegalArgumentException.class, () -> new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("Count", "integer", "not-number", 0), "typed custom property rejects invalid integer");
        expect(IllegalArgumentException.class, () -> engine.editContentControl(source, "content-control:1", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("x", "x", 1, "x", "", "", "", ""), false), "missing content-control edit fails closed");
        expect(java.io.IOException.class, () -> engine.createCustomXmlMapping(source, new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_A, "/x", "", "<!DOCTYPE x [<!ENTITY y SYSTEM 'file:///etc/passwd'>]><x>&y;</x>")), "custom XML mapping parser blocks DOCTYPE/XXE payload");

        byte[] shared = engine.createCustomXmlMapping(source, new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_A, "/root/name", "", "<root><name>A</name></root>"));
        shared = engine.insertContentControl(shared, "body/p:1", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("A", "a", 1, "A", "", STORE_A, "/root/name", ""), false);
        shared = engine.insertContentControl(shared, "body/p:2", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("B", "b", 2, "B", "", STORE_A, "/root/name", ""), false);
        byte[] finalShared = shared;
        expect(IllegalArgumentException.class, () -> engine.editCustomXmlMapping(finalShared, "custom-xml:1", new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_B, "/root/name", "", "<root><name>B</name></root>")), "shared custom XML store identity change fails closed without owner-scoped rebinding");
        check(engine.readContentControls(shared).stream().filter(c -> STORE_A.equals(c.spec().storeItemId())).count() == 2, "failed shared-mapping mutation preserves both owner bindings");
    }

    private static byte[] fullFixture() throws Exception {
        DocxStructuredMetadataMasteryEngine e = new DocxStructuredMetadataMasteryEngine();
        byte[] source = preserved(baseDocument());
        source = e.upsertBibliographySource(source, new DocxStructuredMetadataMasteryEngine.BibliographySource("Smith2026", "Book", "Reliable Systems", "Alex Smith", "2026"));
        source = e.insertCitation(source, "body/p:1", new DocxStructuredMetadataMasteryEngine.CitationSpec("Smith2026", "(Smith, 2026)", 1033));
        source = e.insertBibliography(source, "body/p:2");
        source = e.insertGeneratedTable(source, "body/p:3", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_CONTENTS, "Contents", ""));
        source = e.insertGeneratedTable(source, "body/p:4", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.INDEX, "Index", ""));
        source = e.insertGeneratedTable(source, "body/p:5", new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(DocxStructuredMetadataMasteryEngine.GeneratedTableKind.TABLE_OF_FIGURES, "Figures", ""));
        DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec mapping = new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(STORE_A, "/root/name", "", "<root><name>Alice</name></root>");
        source = e.createCustomXmlMapping(source, mapping);
        source = e.insertContentControl(source, "body/p:6", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Customer", "customer", 701, "Alice", "", STORE_A, "/root/name", ""), false);
        source = e.insertContentControl(source, "body/p:7", new DocxStructuredMetadataMasteryEngine.ContentControlSpec("Rows", "rows", 702, "Row", "", "", "", ""), true);
        source = e.insertLegacyFormField(source, "body/p:8", new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.TEXT, "Client", "Acme", false, List.of(), true, false));
        source = e.upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue("core.title", "T07 Native Mastery"));
        source = e.upsertCustomProperty(source, new DocxStructuredMetadataMasteryEngine.CustomPropertyValue("ReviewState", "string", "Approved", 0));
        source = e.upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable("Workflow", "Draft"));
        return source;
    }

    private static byte[] baseDocument() throws Exception {
        ArrayList<String> paragraphs = new ArrayList<>();
        for (int i = 1; i <= 20; i++) paragraphs.add("T07 host " + i);
        return new DocxFullLaneEngine().createDocument(paragraphs);
    }

    private static byte[] preserved(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/t07-preserve.xml", "<t07 preserve=\"true\"/>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static CanonicalDocumentGraphV2 project(byte[] bytes) throws Exception { return new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, bytes); }
    private static Set<String> t07Capabilities() { LinkedHashSet<String> out = new LinkedHashSet<>(); for (int i = 376; i <= 435; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(out); }
    private static Set<String> allCapabilities() { LinkedHashSet<String> ids = new LinkedHashSet<>(T07); for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i)); for (int i = 34; i <= 54; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); ids.add("UDM-FOUNDATION-0064"); for (int i = 76; i <= 85; i++) ids.add("UDM-FOUNDATION-" + String.format(java.util.Locale.ROOT, "%04d", i)); return Set.copyOf(ids); }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker) throws Exception {
        FilePlatform008Repository repo = new FilePlatform008Repository(root.resolve("meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(root.resolve("bytes"), ArtifactIntakePolicy.conservative(64L * 1024 * 1024), repo, CLOCK);
        return new UniversalDocumentSpine(gateway, new FileDocumentSpineCheckpointStore(root.resolve("cp")), new FileDocumentSpineVersionStore(root.resolve("versions")), new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK), CLOCK,
                org.systemmaster.tools.document.PortableTestDocumentEffectAdmission.provider(CLOCK));
    }
    private static DocumentSpineJob job(String sourceId, String resultId) { return new DocumentSpineJob(UuidV7.create().toString(), UuidV7.create().toString(), sourceId, resultId, sourceId + ".docx", DocumentFormat.DOCX.mediaType(), DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.VERIFIED_DRAFT, allCapabilities(), "DOCUMENT-DOCX-MASTERY-T07-PORTABLE", "qualification", FIXED); }

    private static void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void expect(Class<? extends Throwable> expected, Throwing action, String message) throws Exception { assertions++; try { action.run(); } catch (Throwable t) { if (expected.isInstance(t)) return; throw new AssertionError(message + " wrong exception=" + t, t); } throw new AssertionError(message + " did not fail"); }
    private static void deleteTree(Path root) throws Exception { if (!Files.exists(root)) return; try (var walk = Files.walk(root)) { for (Path p : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(p); } }
    private static String sha(byte[] bytes) { return OoxmlPackageSupport.sha256(bytes); }

    private static final class SyntheticRenderer implements RenderProofWorker {
        @Override public Result prove(Request request) {
            byte[] rendered = ("%PDF-1.4\n% docx mastery t07 synthetic independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            RenderProofReceipt receipt = new RenderProofReceipt(RenderProofReceipt.SCHEMA_V1, request.format(), sha(request.artifact()), sha(rendered),
                    "SyntheticIndependentRenderer", "docx-mastery-t07", "SyntheticRasterOracle", "docx-mastery-t07", FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, sha("raster-t07".getBytes(StandardCharsets.UTF_8)), 0.10, 0.01, 10, 0)), List.of(), Map.of("synthetic", "true"));
            return new Result(rendered, receipt, List.of("TEST_DOUBLE_ONLY"));
        }
    }

    @FunctionalInterface private interface Throwing { void run() throws Exception; }
}
