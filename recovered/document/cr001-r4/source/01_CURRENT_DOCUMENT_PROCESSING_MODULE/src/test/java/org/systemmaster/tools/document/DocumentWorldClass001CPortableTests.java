package org.systemmaster.tools.document;

import org.systemmaster.core.ArtifactIntakePolicy;
import org.systemmaster.core.FilePlatform008Repository;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.accessibility.AccessibilityComplianceEngine;
import org.systemmaster.tools.document.accessibility.AccessibilityComplianceProfile;
import org.systemmaster.tools.document.accessibility.AccessibilityValidatorPort;
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
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

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
import java.util.EnumSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class DocumentWorldClass001CPortableTests {
    private static final Instant FIXED = Instant.parse("2026-08-31T19:45:00Z");
    private static final Clock CLOCK = Clock.fixed(FIXED, ZoneOffset.UTC);
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testPptxSemanticAccessibilityPassAndNegativeCases();
        testDocxFinalAccessibilityRepairThroughSpineAndResume();
        testDocxTableLinkContrastAndAltRemediation();
        testAmbiguousRemediationFailsClosed();
        testPdfUaRequiresNamedValidatorAndPdfAIsSeparate();
        System.out.println("DOCUMENT_WORLD_CLASS_001C_PORTABLE_PASS assertions=" + assertions);
    }

    private static void testPptxSemanticAccessibilityPassAndNegativeCases() throws Exception {
        PptxFullLaneEngine engine = new PptxFullLaneEngine();
        byte[] source = engine.createPresentation(
                "Accessible deck",
                List.of(
                        new PptxFullLaneEngine.SlideSpec("Alpha", List.of("Readable body"), ""),
                        new PptxFullLaneEngine.SlideSpec("Beta", List.of("Second body"), "")));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.PPTX, source);
        AccessibilityComplianceEngine.Report report = new AccessibilityComplianceEngine().evaluate(
                DocumentFormat.PPTX,
                source,
                graph,
                auditOperation(graph, Map.of("accessibilityProfile", "OFFICE_ACCESSIBLE"), false));
        check(report.pass(), "portable PPTX with unique titles, deterministic reading order, 18pt body text, and no unresolved media passes");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SLIDE)
                        .allMatch(e -> !e.accessibility().title().isBlank()),
                "CDG-2 projects slide titles into accessibility semantics");
        check(rule(report, "PPTX_SLIDE_TITLE").stream().allMatch(r -> r.status() == AccessibilityComplianceEngine.RuleStatus.PASS),
                "PPTX unique title rule passes");
        check(rule(report, "PPTX_TEXT_SIZE").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.PASS,
                "PPTX explicit 18pt text-size floor passes portable rule");

        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        String slide2 = new String(parts.get("ppt/slides/slide2.xml"), StandardCharsets.UTF_8)
                .replace("Beta", "Alpha")
                .replace("sz=\"1800\"", "sz=\"900\"");
        parts.put("ppt/slides/slide2.xml", slide2.getBytes(StandardCharsets.UTF_8));
        byte[] bad = OoxmlPackageSupport.write(parts);
        CanonicalDocumentGraphV2 badGraph = documents.projectCanonicalGraphV2(DocumentFormat.PPTX, bad);
        AccessibilityComplianceEngine.Report badReport = new AccessibilityComplianceEngine().evaluate(
                DocumentFormat.PPTX,
                bad,
                badGraph,
                auditOperation(badGraph, Map.of("accessibilityProfile", "OFFICE_ACCESSIBLE"), false));
        check(!badReport.pass(), "duplicate title and sub-12pt text fail PPTX accessibility");
        check(rule(badReport, "PPTX_SLIDE_TITLE").stream().anyMatch(r -> r.status() == AccessibilityComplianceEngine.RuleStatus.FAIL),
                "duplicate slide title is independently reported");
        check(rule(badReport, "PPTX_TEXT_SIZE").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.FAIL,
                "sub-12pt text is an explicit failure");
    }

    private static void testDocxFinalAccessibilityRepairThroughSpineAndResume() throws Exception {
        Path root = Files.createTempDirectory("001c-docx-final-");
        try {
            byte[] source = accessibleDocx("", "en-US", "Alpha body");
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            String rootId = rootElement(graph).id();
            DocumentOperationContract operation = accessibilityRepair(
                    graph,
                    rootId,
                    Map.of("documentTitle", "Accessible Final Document", "accessibilityProfile", "OFFICE_ACCESSIBLE"),
                    Set.of("docProps/core.xml"),
                    true);
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.FINAL, "001c-source", "001c-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(
                    job.jobId(), job.mode(), operation, Set.of(rootId), capabilities(), List.of("explicit deterministic title remediation"));
            CountingRenderWorker renderer = new CountingRenderWorker();
            DocumentSpineResult result = spine(root, renderer, null).executeExisting(job, new ByteArrayInputStream(source), plan);
            check(result.publication() != null, "accessible FINAL DOCX publishes through the governed spine");
            check(result.finalization() != null && result.finalization().missing().isEmpty(), "FINAL proof policy has no missing gates");
            check(result.proofReceipts().stream().anyMatch(r -> r.gate() == DocumentProofReceipt.Gate.ACCESSIBILITY && r.status() == DocumentProofReceipt.Status.PASS),
                    "accessibility proof receipt is first-class FINAL evidence");
            check(renderer.calls == 1, "FINAL candidate receives independent render proof");
            AccessibilityComplianceEngine.Report resultReport = new AccessibilityComplianceEngine().evaluate(
                    DocumentFormat.DOCX, result.resultBytes(), result.resultGraph(), operation);
            check(resultReport.pass(), "remediated DOCX independently re-evaluates as accessible");
            check(resultReport.evidence().stream().anyMatch(e -> e.contains("profile=OFFICE_ACCESSIBLE")), "accessibility profile is explicit in evidence");
            check(count(result.stageReceipts(), DocumentSpineStage.ACCESSIBILITY, DocumentSpineStageReceipt.Status.PASS) == 1,
                    "accessibility stage produces one durable PASS checkpoint");

            CountingRenderWorker resumedRenderer = new CountingRenderWorker();
            DocumentSpineResult resumed = spine(root, resumedRenderer, null).executeExisting(job, null, plan);
            check(resumedRenderer.calls == 0, "completed FINAL proof resumes without replaying render");
            check(count(resumed.stageReceipts(), DocumentSpineStage.ACCESSIBILITY, DocumentSpineStageReceipt.Status.PASS) == 1,
                    "completed accessibility proof resumes without duplicate receipt");
            check(versionStore(root).all().size() == 1, "accessible FINAL version commit is idempotent");
        } finally {
            deleteTree(root);
        }
    }

    private static void testDocxTableLinkContrastAndAltRemediation() throws Exception {
        Path root = Files.createTempDirectory("001c-docx-semantic-");
        try {
            byte[] source = docxWithSemanticFeatures(
                    "Accessible semantic rules",
                    "en-US",
                    "Learn about accessibility",
                    true,
                    "Meaningful diagram",
                    false,
                    "000000");
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            AccessibilityComplianceEngine.Report report = new AccessibilityComplianceEngine().evaluate(
                    DocumentFormat.DOCX, source, graph, auditOperation(graph, Map.of("accessibilityProfile", "OFFICE_ACCESSIBLE"), false));
            check(report.pass(), "DOCX semantic title/language/header/link/alt/contrast rules pass together");
            check(rule(report, "DOCX_TABLE_HEADER").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.PASS,
                    "DOCX explicit table-header semantics are projected and validated");
            check(rule(report, "DOCX_LINK_PURPOSE").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.PASS,
                    "DOCX meaningful link purpose passes");
            check(rule(report, "DOCX_CONTRAST").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.PASS,
                    "DOCX explicit black-on-white contrast passes");
            check(graph.elements().stream().anyMatch(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE
                            && e.accessibility().alternativeText().equals("Meaningful diagram")),
                    "CDG-2 projects native Word drawing alt text");

            byte[] missingAlt = docxWithSemanticFeatures(
                    "Alt repair candidate",
                    "en-US",
                    "",
                    true,
                    "",
                    false,
                    "000000");
            CanonicalDocumentGraphV2 missingGraph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, missingAlt);
            CanonicalDocumentGraphV2.Element image = missingGraph.elements().stream()
                    .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE)
                    .findFirst().orElseThrow();
            DocumentOperationContract operation = accessibilityRepair(
                    missingGraph,
                    image.id(),
                    Map.of("altText", "Safety <and> meaning & context", "accessibilityProfile", "OFFICE_ACCESSIBLE"),
                    Set.of("word/document.xml"),
                    true);
            AccessibilityComplianceEngine.Report before = new AccessibilityComplianceEngine().evaluate(DocumentFormat.DOCX, missingAlt, missingGraph, operation);
            check(!before.pass(), "meaningful visual without alt text fails before repair");
            check(before.remediationPlan().actions().stream().anyMatch(a -> a.ruleCode().equals("DOCX_VISUAL_ALT")
                            && a.disposition() == org.systemmaster.tools.document.accessibility.AccessibilityRemediationPlan.Disposition.AUTO_SAFE_WITH_EXPLICIT_VALUE),
                    "explicit alt text is classified as deterministic safe remediation");

            DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.FINAL, "alt-source", "alt-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(image.id()), capabilities(), List.of("explicit alt repair"));
            DocumentSpineResult result = spine(root, new CountingRenderWorker(), null).executeExisting(job, new ByteArrayInputStream(missingAlt), plan);
            CanonicalDocumentGraphV2.Element repairedImage = result.resultGraph().elements().stream()
                    .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE)
                    .findFirst().orElseThrow();
            check(repairedImage.accessibility().alternativeText().equals("Safety <and> meaning & context"),
                    "DOM-based alt remediation preserves special characters as data, not markup");
            check(result.preservation().pass() && result.preservation().changedParts() == 1,
                    "alt remediation changes only the declared native part");
            check(result.publication() != null, "repaired DOCX can reach FINAL after independent proof");

            byte[] bad = docxWithSemanticFeatures(
                    "Negative semantic rules",
                    "en-US",
                    "click here",
                    false,
                    "",
                    false,
                    "777777");
            CanonicalDocumentGraphV2 badGraph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, bad);
            AccessibilityComplianceEngine.Report badReport = new AccessibilityComplianceEngine().evaluate(
                    DocumentFormat.DOCX, bad, badGraph, auditOperation(badGraph, Map.of("accessibilityProfile", "OFFICE_ACCESSIBLE"), false));
            check(!badReport.pass(), "missing table header, generic link, missing alt, and low contrast fail closed");
            check(rule(badReport, "DOCX_TABLE_HEADER").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.FAIL,
                    "missing DOCX header semantics fail");
            check(rule(badReport, "DOCX_LINK_PURPOSE").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.FAIL,
                    "generic DOCX link text fails");
            check(rule(badReport, "DOCX_VISUAL_ALT").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.FAIL,
                    "missing meaningful visual alt fails");
            check(rule(badReport, "DOCX_CONTRAST").getFirst().status() == AccessibilityComplianceEngine.RuleStatus.FAIL,
                    "low DOCX contrast fails");
        } finally {
            deleteTree(root);
        }
    }

    private static void testAmbiguousRemediationFailsClosed() throws Exception {
        Path root = Files.createTempDirectory("001c-ambiguous-");
        try {
            byte[] source = accessibleDocx("", "en-US", "Alpha body");
            DocumentProcessingService documents = new DocumentProcessingService();
            CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, source);
            String rootId = rootElement(graph).id();
            DocumentOperationContract operation = accessibilityRepair(
                    graph,
                    rootId,
                    Map.of("accessibilityProfile", "OFFICE_ACCESSIBLE"),
                    Set.of("docProps/core.xml"),
                    true);
            AccessibilityComplianceEngine.Report before = new AccessibilityComplianceEngine().evaluate(DocumentFormat.DOCX, source, graph, operation);
            check(!before.pass(), "missing title fails before remediation");
            check(before.remediationPlan().actions().stream().anyMatch(a -> a.ruleCode().equals("DOCX_TITLE")
                            && a.disposition() == org.systemmaster.tools.document.accessibility.AccessibilityRemediationPlan.Disposition.REVIEW_REQUIRED),
                    "missing semantic value requires review instead of invented content");
            DocumentSpineJob job = job(DocumentSpineMode.MASTER, DocumentFormat.DOCX, DocumentSpinePublicationClass.FINAL, "ambiguous-source", "ambiguous-result");
            DocumentSpineExecutionPlan plan = new DocumentSpineExecutionPlan(job.jobId(), job.mode(), operation, Set.of(rootId), capabilities(), List.of());
            expectFailure(
                    () -> spine(root, new CountingRenderWorker(), null).executeExisting(job, new ByteArrayInputStream(source), plan),
                    IllegalArgumentException.class,
                    "ambiguous accessibility remediation cannot be auto-invented");
            check(count(checkpointStore(root).receipts(job.jobId()), DocumentSpineStage.MASTER, DocumentSpineStageReceipt.Status.FAIL) == 1,
                    "ambiguous remediation is durably recorded as mutation-stage failure");
        } finally {
            deleteTree(root);
        }
    }

    private static void testPdfUaRequiresNamedValidatorAndPdfAIsSeparate() throws Exception {
        byte[] pdf = new PdfStructuralEngine().createTextPdf(List.of("Accessible content candidate"));
        DocumentProcessingService documents = new DocumentProcessingService();
        CanonicalDocumentGraphV2 graph = documents.projectCanonicalGraphV2(DocumentFormat.PDF, pdf);
        DocumentOperationContract pdfUa = auditOperation(graph, Map.of("accessibilityProfile", "PDF_UA_2"), true);
        AccessibilityComplianceEngine.Report withoutValidator = new AccessibilityComplianceEngine().evaluate(DocumentFormat.PDF, pdf, graph, pdfUa);
        check(!withoutValidator.pass(), "PDF/UA-2 cannot pass without required semantic structure and qualified validator");
        check(withoutValidator.rules().stream().anyMatch(r -> r.status() == AccessibilityComplianceEngine.RuleStatus.VALIDATOR_REQUIRED),
                "missing qualified PDF/UA validator is explicit");

        AccessibilityValidatorPort fakePass = new AccessibilityValidatorPort() {
            @Override public String identity() { return "QualifiedPdfUaTestOracle/1"; }
            @Override public Receipt validate(Request request) {
                return new Receipt(Status.PASS, "QualifiedPdfUaTestOracle", "1", "PDF/UA-2", List.of("TEST_VALIDATOR_RECEIPT"), Map.of());
            }
        };
        AccessibilityComplianceEngine.Report withValidator = new AccessibilityComplianceEngine(fakePass).evaluate(DocumentFormat.PDF, pdf, graph, pdfUa);
        check(!withValidator.pass(), "validator PASS cannot erase missing tagged-structure/title/language failures");
        check(withValidator.validatorReceipt() != null && withValidator.validatorReceipt().status() == AccessibilityValidatorPort.Status.PASS,
                "named validator receipt is retained separately from semantic failures");

        DocumentOperationContract pdfA = auditOperation(graph, Map.of("accessibilityProfile", "PDF/A-2b"), true);
        expectFailure(
                () -> new AccessibilityComplianceEngine().evaluate(DocumentFormat.PDF, pdf, graph, pdfA),
                IllegalArgumentException.class,
                "PDF/A archival profile must never be treated as an accessibility profile");
        check(AccessibilityComplianceProfile.PDF_UA_2.qualifiedValidatorRequired(), "PDF/UA-2 profile encodes validator requirement");

        byte[] docx = accessibleDocx("Profile boundary", "en-US", "Body");
        CanonicalDocumentGraphV2 docxGraph = documents.projectCanonicalGraphV2(DocumentFormat.DOCX, docx);
        DocumentOperationContract invalidPdfUaForDocx = auditOperation(docxGraph, Map.of("accessibilityProfile", "PDF_UA_2"), true);
        expectFailure(
                () -> new AccessibilityComplianceEngine().evaluate(DocumentFormat.DOCX, docx, docxGraph, invalidPdfUaForDocx),
                IllegalArgumentException.class,
                "PDF/UA-2 profile must fail closed when requested for a non-PDF artifact");
    }

    private static byte[] accessibleDocx(String title, String language, String text) throws Exception {
        String w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        LinkedHashMap<String, byte[]> parts = new LinkedHashMap<>();
        parts.put("[Content_Types].xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/></Types>"));
        parts.put("_rels/.rels", bytes("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties\" Target=\"docProps/core.xml\"/></Relationships>"));
        parts.put("docProps/core.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>" + xml(title) + "</dc:title></cp:coreProperties>"));
        parts.put("word/document.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"" + w + "\"><w:body><w:p><w:r><w:t>" + xml(text) + "</w:t></w:r></w:p><w:sectPr/></w:body></w:document>"));
        parts.put("word/styles.xml", bytes("<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:styles xmlns:w=\"" + w + "\"><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val=\"" + xml(language) + "\"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style></w:styles>"));
        parts.put("word/_rels/document.xml.rels", bytes("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>"));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] docxWithSemanticFeatures(
            String title,
            String language,
            String linkText,
            boolean tableHeader,
            String imageAlt,
            boolean decorative,
            String textColor) throws Exception {
        Map<String, byte[]> base = new LinkedHashMap<>(OoxmlPackageSupport.read(accessibleDocx(title, language, "Body text")));
        String w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        String r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        String wp = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
        String a = "http://schemas.openxmlformats.org/drawingml/2006/main";
        String pic = "http://schemas.openxmlformats.org/drawingml/2006/picture";
        String adec = "http://schemas.microsoft.com/office/drawing/2017/decorative";
        String linkParagraph = linkText.isBlank() ? "" : "<w:p><w:hyperlink r:id=\"rIdLink\"><w:r><w:t>" + xml(linkText) + "</w:t></w:r></w:hyperlink></w:p>";
        String doc = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"" + w + "\" xmlns:r=\"" + r
                + "\" xmlns:wp=\"" + wp + "\" xmlns:a=\"" + a + "\" xmlns:pic=\"" + pic + "\" xmlns:adec=\"" + adec + "\"><w:body>"
                + "<w:p><w:r><w:rPr><w:color w:val=\"" + xml(textColor) + "\"/></w:rPr><w:t>Body text</w:t></w:r></w:p>"
                + linkParagraph
                + "<w:tbl><w:tr>" + (tableHeader ? "<w:trPr><w:tblHeader/></w:trPr>" : "")
                + "<w:tc><w:p><w:r><w:t>Column</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
                + "<w:p><w:r><w:drawing><wp:inline><wp:extent cx=\"914400\" cy=\"914400\"/><wp:docPr id=\"1\" name=\"Diagram\""
                + (imageAlt.isBlank() ? "" : " descr=\"" + xml(imageAlt) + "\"") + ">"
                + (decorative ? "<a:extLst><a:ext uri=\"{001C}\"><adec:decorative val=\"1\"/></a:ext></a:extLst>" : "")
                + "</wp:docPr><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed=\"rIdImg\"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"
                + "<w:sectPr/></w:body></w:document>";
        base.put("word/document.xml", bytes(doc));
        base.put("word/media/image1.png", new byte[]{1, 2, 3, 4});
        String hyperlinkRel = linkText.isBlank() ? "" : "<Relationship Id=\"rIdLink\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink\" Target=\"https://example.test/accessibility\" TargetMode=\"External\"/>";
        base.put("word/_rels/document.xml.rels", bytes("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>" + hyperlinkRel + "<Relationship Id=\"rIdImg\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/image1.png\"/></Relationships>"));
        String ct = new String(base.get("[Content_Types].xml"), StandardCharsets.UTF_8).replace("</Types>", "<Default Extension=\"png\" ContentType=\"image/png\"/></Types>");
        base.put("[Content_Types].xml", bytes(ct));
        return OoxmlPackageSupport.write(base);
    }

    private static DocumentOperationContract accessibilityRepair(
            CanonicalDocumentGraphV2 graph,
            String targetId,
            Map<String, String> parameters,
            Set<String> changedParts,
            boolean finalCandidate) {
        return new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "001c-a11y-repair-" + targetId.substring(Math.max(0, targetId.length() - 8)),
                graph.sourceSha256(),
                graph.semanticDigest(),
                DocumentOperationContract.Type.ACCESSIBILITY_REPAIR,
                List.of(DocumentSelector.node(targetId)),
                "Apply only explicit deterministic accessibility remediation",
                parameters,
                DocumentOperationContract.Risk.REVERSIBLE_EDIT,
                graph.sourceSha256(),
                changedParts,
                DocumentOperationContract.VisualImpact.NONE,
                false,
                List.of(),
                finalCandidate,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    private static DocumentOperationContract auditOperation(
            CanonicalDocumentGraphV2 graph,
            Map<String, String> parameters,
            boolean finalCandidate) {
        return new DocumentOperationContract(
                DocumentOperationContract.SCHEMA_V1,
                "001c-a11y-audit",
                graph.sourceSha256(),
                graph.semanticDigest(),
                DocumentOperationContract.Type.METADATA_UPDATE,
                List.of(DocumentSelector.node(rootElement(graph).id())),
                "Evaluate accessibility and compliance without changing artifact bytes",
                parameters,
                DocumentOperationContract.Risk.READ_ONLY,
                null,
                Set.of(),
                DocumentOperationContract.VisualImpact.NONE,
                false,
                List.of(),
                finalCandidate,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    private static CanonicalDocumentGraphV2.Element rootElement(CanonicalDocumentGraphV2 graph) {
        return graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.ROOT).findFirst().orElseThrow();
    }

    private static List<AccessibilityComplianceEngine.RuleResult> rule(AccessibilityComplianceEngine.Report report, String code) {
        return report.rules().stream().filter(r -> r.code().equals(code)).toList();
    }

    private static UniversalDocumentSpine spine(Path root, RenderProofWorker worker, AccessibilityValidatorPort validator) throws Exception {
        FilePlatform008Repository repository = new FilePlatform008Repository(root.resolve("platform008-meta"));
        GovernedArtifactGateway gateway = new GovernedArtifactGateway(
                root.resolve("platform008-bytes"),
                ArtifactIntakePolicy.conservative(32L * 1024 * 1024),
                repository,
                CLOCK);
        DocumentSpineProofService proofs = new DocumentSpineProofService(new DocumentProcessingService(), worker, CLOCK, validator);
        return new UniversalDocumentSpine(gateway, checkpointStore(root), versionStore(root), proofs, CLOCK);
    }

    private static FileDocumentSpineCheckpointStore checkpointStore(Path root) throws Exception {
        return new FileDocumentSpineCheckpointStore(root.resolve("spine-checkpoints"));
    }

    private static FileDocumentSpineVersionStore versionStore(Path root) throws Exception {
        return new FileDocumentSpineVersionStore(root.resolve("spine-versions"));
    }

    private static DocumentSpineJob job(
            DocumentSpineMode mode,
            DocumentFormat format,
            DocumentSpinePublicationClass publicationClass,
            String sourceId,
            String resultId) {
        return new DocumentSpineJob(
                UuidV7.create().toString(),
                UuidV7.create().toString(),
                sourceId,
                resultId,
                sourceId + extension(format),
                format.mediaType(),
                mode,
                format,
                publicationClass,
                capabilities(),
                "001c-portable-test",
                "001c-portable-test",
                FIXED);
    }

    private static Set<String> capabilities() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (int i = 1; i <= 21; i++) ids.add("UDM-SPINE-" + String.format(java.util.Locale.ROOT, "%04d", i));
        for (int i = 1; i <= 30; i++) ids.add("UDM-ACCESSIBILIT-" + String.format(java.util.Locale.ROOT, "%04d", i));
        ids.add("UDM-FOUNDATION-0040");
        ids.add("UDM-FOUNDATION-0081");
        ids.add("UDM-QUALIFICATIO-0007");
        return Set.copyOf(ids);
    }

    private static long count(List<DocumentSpineStageReceipt> receipts, DocumentSpineStage stage, DocumentSpineStageReceipt.Status status) {
        return receipts.stream().filter(r -> r.stage() == stage && r.status() == status).count();
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void expectFailure(Throwing action, Class<? extends Throwable> expected, String message) throws Exception {
        assertions++;
        try {
            action.run();
            throw new AssertionError(message);
        } catch (Throwable throwable) {
            if (!expected.isInstance(throwable)) {
                if (throwable instanceof Exception exception) throw exception;
                throw throwable;
            }
        }
    }

    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String xml(String value) { return (value == null ? "" : value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
    private static String extension(DocumentFormat format) { return switch (format) { case DOCX -> ".docx"; case PPTX -> ".pptx"; case PDF -> ".pdf"; default -> ".bin"; }; }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            for (Path path : walk.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    @FunctionalInterface private interface Throwing { void run() throws Exception; }

    private static final class CountingRenderWorker implements RenderProofWorker {
        private int calls;
        @Override public Result prove(Request request) {
            calls++;
            byte[] rendered = ("%PDF-1.4\n% 001C independent render\n" + request.format()).getBytes(StandardCharsets.ISO_8859_1);
            String rasterSha = sha(("raster:" + request.format()).getBytes(StandardCharsets.UTF_8));
            RenderProofReceipt receipt = new RenderProofReceipt(
                    RenderProofReceipt.SCHEMA_V1,
                    request.format(),
                    sha(request.artifact()),
                    sha(rendered),
                    "Synthetic001CRenderer",
                    "1",
                    "Synthetic001CRasterOracle",
                    "1",
                    FIXED,
                    new RenderProofReceipt.IsolationEvidence(true, true, true, RenderProofReceipt.NetworkIsolation.ENFORCED_BY_EXTERNAL_SANDBOX, 10_000, 8 * 1024 * 1024, "C.UTF-8", "UTC"),
                    List.of(new RenderProofReceipt.PageEvidence(1, 612, 792, 0, 816, 1056, rasterSha, 0.10, 0.01, 10, 0)),
                    List.of(),
                    Map.of("packet", "DOCUMENT-WORLD-CLASS-001C"));
            return new Result(rendered, receipt, List.of("PORTABLE_TEST_DOUBLE"));
        }
    }

    private static String sha(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
