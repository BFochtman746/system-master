package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxConformanceProfileMasteryEngine;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxMarkupCompatibilityMasteryEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T14 portable Strict/Transitional profile qualification. */
public final class DocumentDocxMasteryT14PortableTests {
    private static final Set<String> T14 = capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testTransitionalDetection();
        testStrictConversionAndDetection();
        testStrictToTransitionalRoundTrip();
        testFalseDeclarationsFailClosed();
        testMixedNamespaceFailsClosed();
        testRelationshipProfileMismatchFailsClosed();
        testRequiredPackageStructureAndContentType();
        testCustomXmlOwnershipFence();
        testLegacyStrictConversionBlocker();
        testRelationshipFamilyConversion();
        testPreservationAndDeterminism();
        testStrictCanonicalProjection();
        testT13CompatibilitySurvivesProfileConversion();
        testUnsafeXmlFailsClosed();
        testNoFullSchemaOverclaim();
        check(T14.size() == 40, "T14 advanced conformance register has exactly 40 controls");
        System.out.println("DOCUMENT_DOCX_MASTERY_T14_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T14.size());
    }

    private static void testTransitionalDetection() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] source = base();
        var snapshot = engine.inspect(source);
        check(snapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL, "base DOCX detected as Transitional");
        check(snapshot.packageStructureValid(), "base DOCX required package structure valid");
        check(snapshot.profileCoherent(), "base DOCX profile is coherent");
        check(DocxConformanceProfileMasteryEngine.W_TRANSITIONAL.equals(snapshot.mainDocumentNamespace()), "main namespace is Transitional WML");
        check(snapshot.rootOfficeDocumentRelationshipType().contains("schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"), "root relationship is Transitional officeDocument");
        check(snapshot.declaredConformance().isBlank() || "transitional".equalsIgnoreCase(snapshot.declaredConformance()), "omitted conformance defaults to Transitional semantics");
    }

    private static void testStrictConversionAndDetection() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] source = base();
        var plan = engine.planConversion(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        check(plan.disposition() == DocxConformanceProfileMasteryEngine.ConversionDisposition.CONVERTIBLE, "simple Transitional DOCX has safe Strict conversion plan");
        check(plan.blockers().isEmpty(), "safe Strict plan has no blockers");
        check(!plan.namespaceMappings().isEmpty() && !plan.relationshipMappings().isEmpty(), "Strict plan records namespace and relationship mappings");
        var converted = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        var strict = converted.resultSnapshot();
        check(strict.profile() == DocxConformanceProfileMasteryEngine.Profile.STRICT, "converted package detected as Strict");
        check(strict.profileCoherent(), "converted Strict package passes profile coherence gate");
        check(DocxConformanceProfileMasteryEngine.W_STRICT.equals(strict.mainDocumentNamespace()), "Strict output uses purl WordprocessingML namespace");
        check("strict".equalsIgnoreCase(strict.declaredConformance()), "Strict output explicitly declares strict conformance");
        check(strict.rootOfficeDocumentRelationshipType().contains("purl.oclc.org/ooxml/officeDocument/relationships/officeDocument"), "Strict output uses Strict officeDocument relationship family");
        check(!converted.sourceSha256().equals(converted.resultSha256()), "profile conversion produces a new derived identity");
        check(converted.changedXmlParts() > 0 && converted.changedRelationshipTypes() > 0, "profile conversion records actual XML and relationship changes");
    }

    private static void testStrictToTransitionalRoundTrip() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] source = base();
        byte[] strict = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT).bytes();
        var back = engine.convert(strict, DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL);
        check(back.resultSnapshot().profile() == DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL, "Strict converts back to Transitional profile");
        check(back.resultSnapshot().profileCoherent(), "round-tripped Transitional profile is coherent");
        check("transitional".equalsIgnoreCase(back.resultSnapshot().declaredConformance()), "round-trip explicitly declares transitional");
        check(new DocxPackageEngine().inspect(back.bytes()).paragraphs().equals(new DocxPackageEngine().inspect(source).paragraphs()), "profile round-trip preserves paragraph semantics");
    }

    private static void testFalseDeclarationsFailClosed() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] falseStrict = mutateMain(base(), doc -> {
            Element root = doc.getDocumentElement();
            root.setAttributeNS(DocxConformanceProfileMasteryEngine.W_TRANSITIONAL, "w:conformance", "strict");
        });
        var s1 = engine.inspect(falseStrict);
        check(s1.profile() == DocxConformanceProfileMasteryEngine.Profile.INVALID_MIXED, "strict declaration on Transitional namespace is invalid");
        check(s1.violations().stream().anyMatch(v -> "FALSE_STRICT_DECLARATION".equals(v.code())), "false Strict declaration emits exact violation");

        byte[] strict = engine.convert(base(), DocxConformanceProfileMasteryEngine.Profile.STRICT).bytes();
        byte[] falseTrans = mutateMain(strict, doc -> {
            Element root = doc.getDocumentElement();
            root.setAttributeNS(DocxConformanceProfileMasteryEngine.W_STRICT, "w:conformance", "transitional");
        });
        var s2 = engine.inspect(falseTrans);
        check(s2.profile() == DocxConformanceProfileMasteryEngine.Profile.INVALID_MIXED, "transitional declaration on Strict namespace is invalid");
        check(s2.violations().stream().anyMatch(v -> "FALSE_TRANSITIONAL_DECLARATION".equals(v.code())), "false Transitional declaration emits exact violation");
    }

    private static void testMixedNamespaceFailsClosed() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] mixed = mutateMain(base(), doc -> {
            Element body = (Element) doc.getElementsByTagNameNS(DocxConformanceProfileMasteryEngine.W_TRANSITIONAL, "body").item(0);
            Element strictP = doc.createElementNS(DocxConformanceProfileMasteryEngine.W_STRICT, "s:p");
            body.appendChild(strictP);
        });
        var snapshot = engine.inspect(mixed);
        check(snapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.INVALID_MIXED, "mixed Strict/Transitional namespace family is rejected");
        check(snapshot.violations().stream().anyMatch(v -> "MIXED_STRICT_TRANSITIONAL_NAMESPACES".equals(v.code())), "mixed family violation is explicit");
        check(engine.planConversion(mixed, DocxConformanceProfileMasteryEngine.Profile.STRICT).disposition() == DocxConformanceProfileMasteryEngine.ConversionDisposition.BLOCKED, "mixed source cannot be converted");
    }

    private static void testRelationshipProfileMismatchFailsClosed() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] mismatched = mutatePart(base(), "_rels/.rels", doc -> {
            NodeList rels = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/relationships", "Relationship");
            for (int i = 0; i < rels.getLength(); i++) {
                Element rel = (Element) rels.item(i);
                if (rel.getAttribute("Type").endsWith("/officeDocument")) rel.setAttribute("Type", DocxConformanceProfileMasteryEngine.OFFICE_DOCUMENT_REL_STRICT);
            }
        });
        var snapshot = engine.inspect(mismatched);
        check(snapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.INVALID_MIXED, "main namespace/root relationship profile mismatch is rejected");
        check(snapshot.violations().stream().anyMatch(v -> "MAIN_REL_PROFILE_MISMATCH".equals(v.code())), "relationship mismatch violation is explicit");
    }

    private static void testRequiredPackageStructureAndContentType() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        Map<String, byte[]> missing = new LinkedHashMap<>(OoxmlPackageSupport.read(base()));
        missing.remove("word/document.xml");
        var m = engine.inspect(OoxmlPackageSupport.write(missing));
        check(!m.packageStructureValid(), "missing main document fails required package structure");
        check(m.violations().stream().anyMatch(v -> "REQUIRED_PART_MISSING".equals(v.code())), "missing required part is explicit");

        byte[] wrongType = mutatePart(base(), "[Content_Types].xml", doc -> {
            NodeList overrides = doc.getElementsByTagNameNS("http://schemas.openxmlformats.org/package/2006/content-types", "Override");
            for (int i = 0; i < overrides.getLength(); i++) {
                Element e = (Element) overrides.item(i);
                if ("/word/document.xml".equals(e.getAttribute("PartName"))) e.setAttribute("ContentType", "application/xml");
            }
        });
        var w = engine.inspect(wrongType);
        check(!w.profileCoherent(), "invalid main content type fails profile coherence");
        check(w.violations().stream().anyMatch(v -> "MAIN_CONTENT_TYPE_INVALID".equals(v.code())), "invalid content type is explicit");
    }

    private static void testCustomXmlOwnershipFence() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(base()));
        byte[] custom = "<data xmlns=\"urn:t14:t12-owned\"><v>KEEP</v></data>".getBytes(StandardCharsets.UTF_8);
        parts.put("customXml/item99.xml", custom);
        byte[] source = OoxmlPackageSupport.write(parts);
        var plan = engine.planConversion(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        check(plan.disposition() == DocxConformanceProfileMasteryEngine.ConversionDisposition.BLOCKED, "T12-owned custom XML blocks autonomous Strict profile conversion");
        check(plan.blockers().stream().anyMatch(v -> "T12_CUSTOM_XML_OWNER_COORDINATION_REQUIRED".equals(v.code())), "custom XML ownership blocker is explicit");
        check(Arrays.equals(custom, OoxmlPackageSupport.read(source).get("customXml/item99.xml")), "T14 inspection does not rewrite T12 custom XML bytes");
    }

    private static void testLegacyStrictConversionBlocker() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] legacy = mutateMain(base(), doc -> doc.getDocumentElement().setAttribute("xmlns:v", "urn:schemas-microsoft-com:vml"));
        var plan = engine.planConversion(legacy, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        check(plan.disposition() == DocxConformanceProfileMasteryEngine.ConversionDisposition.BLOCKED, "legacy VML namespace blocks silent Strict conversion");
        check(plan.blockers().stream().anyMatch(v -> "TRANSITIONAL_LEGACY_NAMESPACE".equals(v.code())), "legacy namespace blocker is explicit");
    }

    private static void testRelationshipFamilyConversion() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] source = base();
        byte[] strict = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT).bytes();
        Map<String, byte[]> strictParts = OoxmlPackageSupport.read(strict);
        long strictRelUris = strictParts.entrySet().stream().filter(e -> e.getKey().endsWith(".rels"))
                .map(e -> new String(e.getValue(), StandardCharsets.UTF_8)).filter(s -> s.contains(DocxConformanceProfileMasteryEngine.OFFICE_REL_STRICT_PREFIX)).count();
        check(strictRelUris > 0, "Strict conversion rewrites officeDocument relationship type families");
        byte[] back = engine.convert(strict, DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL).bytes();
        String rootRels = new String(OoxmlPackageSupport.read(back).get("_rels/.rels"), StandardCharsets.UTF_8);
        check(rootRels.contains(DocxConformanceProfileMasteryEngine.OFFICE_DOCUMENT_REL_TRANSITIONAL), "Strict-to-Transitional conversion restores root relationship family");
    }

    private static void testPreservationAndDeterminism() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(base()));
        byte[] opaque = new byte[]{1, 4, 9, 16, 25, 36};
        parts.put("word/media/t14-opaque.bin", opaque);
        byte[] source = OoxmlPackageSupport.write(parts);
        byte[] copy = source.clone();
        var a = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        var b = engine.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT);
        check(Arrays.equals(source, copy), "conversion leaves caller source bytes immutable");
        check(Arrays.equals(a.bytes(), b.bytes()), "same source/target profile conversion is deterministic");
        check(Arrays.equals(opaque, OoxmlPackageSupport.read(a.bytes()).get("word/media/t14-opaque.bin")), "opaque unrelated binary part remains byte-identical");
        check(a.unrelatedPartsByteIdentical(), "conversion receipt confirms unrelated parts byte-identical");
        check(a.sourceSha256().equals(OoxmlPackageSupport.sha256(source)) && a.resultSha256().equals(OoxmlPackageSupport.sha256(a.bytes())), "conversion receipt binds exact source/result digests");
    }

    private static void testStrictCanonicalProjection() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        byte[] strict = engine.convert(base(), DocxConformanceProfileMasteryEngine.Profile.STRICT).bytes();
        CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, strict);
        check(graph.elements().stream().anyMatch(e -> "docx-conformance-profile".equals(e.semantic().role()) && "STRICT".equals(e.semantic().properties().get("profile"))), "CDG-2 exposes Strict conformance profile metadata");
        check(graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH).count() >= 3, "Strict document semantic content is projected through non-destructive normalization");
        check(graph.sourceSha256().equals(OoxmlPackageSupport.sha256(strict)), "Strict CDG projection remains bound to original Strict source digest");
    }

    private static void testT13CompatibilitySurvivesProfileConversion() throws Exception {
        DocxMarkupCompatibilityMasteryEngine t13 = new DocxMarkupCompatibilityMasteryEngine();
        DocxConformanceProfileMasteryEngine t14 = new DocxConformanceProfileMasteryEngine();
        byte[] source = t13.createAlternateContentText(base(), 1, "w14", DocxMarkupCompatibilityMasteryEngine.W14, "STRICT-CHOICE", "STRICT-FALLBACK").bytes();
        byte[] strict = t14.convert(source, DocxConformanceProfileMasteryEngine.Profile.STRICT).bytes();
        var strictSnapshot = t14.inspect(strict);
        check(strictSnapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.STRICT && strictSnapshot.profileCoherent(), "T13 MCE package converts to coherent Strict profile");
        byte[] normalized = t14.convert(strict, DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL).bytes();
        var mce = t13.inspect(normalized);
        check(mce.alternateContent().size() == 1, "T13 AlternateContent survives Strict/Transitional profile round-trip");
        check(t13.resolve(normalized, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()).get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.FALLBACK, "T13 fallback semantics survive profile conversion");
    }

    private static void testUnsafeXmlFailsClosed() throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(base()));
        String dangerous = "<?xml version=\"1.0\"?><!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><w:document xmlns:w=\"" + DocxConformanceProfileMasteryEngine.W_TRANSITIONAL + "\"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>";
        parts.put("word/document.xml", dangerous.getBytes(StandardCharsets.UTF_8));
        expectFailure(() -> new DocxConformanceProfileMasteryEngine().inspect(OoxmlPackageSupport.write(parts)), "unsafe XML remains fail-closed under T14");
    }

    private static void testNoFullSchemaOverclaim() throws Exception {
        DocxConformanceProfileMasteryEngine engine = new DocxConformanceProfileMasteryEngine();
        var snapshot = engine.inspect(base());
        check(!snapshot.fullSchemaConformanceClaimed(), "T14 profile validation does not overclaim full XSD conformance");
        var plan = engine.planConversion(base(), DocxConformanceProfileMasteryEngine.Profile.STRICT);
        check(!plan.fullSchemaConformanceClaimed(), "T14 conversion plan does not overclaim full XSD conformance");
    }

    private static byte[] base() throws Exception {
        return new DocxFullLaneEngine().createDocument(List.of("T14 profile host 1", "T14 profile host 2", "T14 profile host 3"));
    }

    private static byte[] mutateMain(byte[] source, XmlMutation mutation) throws Exception {
        return mutatePart(source, "word/document.xml", mutation);
    }

    private static byte[] mutatePart(byte[] source, String partName, XmlMutation mutation) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        Document doc = OoxmlPackageSupport.parseXml(parts.get(partName));
        mutation.apply(doc);
        parts.put(partName, OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    private static Set<String> capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (int i = 635; i <= 674; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static void expectFailure(ThrowingAction action, String message) throws Exception {
        assertions++;
        try { action.run(); } catch (IOException | IllegalArgumentException | IllegalStateException expected) { return; }
        throw new AssertionError(message);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface private interface XmlMutation { void apply(Document document) throws Exception; }
    @FunctionalInterface private interface ThrowingAction { void run() throws Exception; }
}
