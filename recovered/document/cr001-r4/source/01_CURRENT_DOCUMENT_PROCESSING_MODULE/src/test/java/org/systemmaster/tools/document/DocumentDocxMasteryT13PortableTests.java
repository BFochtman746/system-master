package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxMarkupCompatibilityMasteryEngine;
import org.systemmaster.tools.docx.DocxReviewProtectionMasteryEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** DOCUMENT-DOCX-MASTERY-T13 portable MCE, namespace-evolution and preservation/degradation qualification. */
public final class DocumentDocxMasteryT13PortableTests {
    private static final String CUSTOM = "urn:system-master:t13:custom";
    private static final String CUSTOM2 = "urn:system-master:t13:custom2";
    private static final Set<String> T13 = t13Capabilities();
    private static int assertions;

    public static void main(String[] args) throws Exception {
        testNamespaceRegistryAndInventory();
        testAlternateContentResolution();
        testFallbackAndAbsentSemantics();
        testMustUnderstandAndIgnorable();
        testProcessContentAndIgnorableAttributes();
        testPreservationHintsAndExplicitDegradation();
        testMalformedCompatibilityMarkupFailsClosed();
        testScopedCreateAndEditPreservation();
        testNamespaceEvolutionAndPrefixIndependence();
        testRealT08VersionedCommentNamespaces();
        testCanonicalProjection();
        testDeterminismAndSourceImmutability();
        testUnsafeXmlRejected();
        check(T13.size() == 40, "T13 advanced compatibility register has exactly 40 controls");
        System.out.println("DOCUMENT_DOCX_MASTERY_T13_PORTABLE_PASS assertions=" + assertions + " capabilities=" + T13.size());
    }

    private static void testNamespaceRegistryAndInventory() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        Map<String, String> registry = engine.versionedNamespaceRegistry();
        check(registry.size() >= 12, "versioned Word namespace registry covers frozen extension families");
        for (String uri : List.of(
                DocxMarkupCompatibilityMasteryEngine.W14,
                DocxMarkupCompatibilityMasteryEngine.W15,
                DocxMarkupCompatibilityMasteryEngine.W16CID,
                DocxMarkupCompatibilityMasteryEngine.W16CEX,
                DocxMarkupCompatibilityMasteryEngine.W16CUR,
                DocxMarkupCompatibilityMasteryEngine.W16DU,
                DocxMarkupCompatibilityMasteryEngine.WPS,
                DocxMarkupCompatibilityMasteryEngine.WPG,
                DocxMarkupCompatibilityMasteryEngine.WPC,
                DocxMarkupCompatibilityMasteryEngine.WP14,
                DocxMarkupCompatibilityMasteryEngine.WP15,
                DocxMarkupCompatibilityMasteryEngine.WOE)) {
            check(registry.containsKey(uri), "registry contains namespace " + uri);
        }

        byte[] source = versionedFeatureFixture();
        DocxMarkupCompatibilityMasteryEngine.PackageSnapshot snapshot = engine.inspect(source);
        check(snapshot.sourceSha256().equals(OoxmlPackageSupport.sha256(source)), "inventory binds exact package SHA-256");
        check(snapshot.versionedFeatures().stream().map(DocxMarkupCompatibilityMasteryEngine.VersionedFeatureSnapshot::namespaceUri)
                .collect(java.util.stream.Collectors.toSet()).containsAll(List.of(
                        DocxMarkupCompatibilityMasteryEngine.W14,
                        DocxMarkupCompatibilityMasteryEngine.W15,
                        DocxMarkupCompatibilityMasteryEngine.W16CID,
                        DocxMarkupCompatibilityMasteryEngine.W16CEX,
                        DocxMarkupCompatibilityMasteryEngine.W16CUR,
                        DocxMarkupCompatibilityMasteryEngine.W16DU)), "inventory distinguishes six versioned Word extension namespace URIs");
        check(snapshot.versionedFeatures().stream().anyMatch(f -> f.kind() == DocxMarkupCompatibilityMasteryEngine.FeatureKind.ATTRIBUTE
                && DocxMarkupCompatibilityMasteryEngine.W14.equals(f.namespaceUri()) && "paraId".equals(f.localName())), "versioned attributes are inventoried, not only elements");
        check(snapshot.compatibilityRules().stream().anyMatch(r -> r.ignorableNamespaceUris().contains(DocxMarkupCompatibilityMasteryEngine.W14)), "mc:Ignorable is extracted to namespace URIs");
    }

    private static void testAlternateContentResolution() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] source = multipleChoiceFixture(true);
        DocxMarkupCompatibilityMasteryEngine.PackageSnapshot snapshot = engine.inspect(source);
        check(snapshot.alternateContent().size() == 1, "AlternateContent READ inventories one block");
        DocxMarkupCompatibilityMasteryEngine.AlternateContentSnapshot ac = snapshot.alternateContent().get(0);
        check(ac.choices().size() == 2 && ac.fallbackPresent(), "AlternateContent EXTRACT preserves ordered Choices and Fallback");
        check(ac.choices().get(0).requiredNamespaceUris().equals(List.of(DocxMarkupCompatibilityMasteryEngine.W15)), "Choice Requires resolves prefix to W15 URI");
        check(ac.choices().get(1).requiredNamespaceUris().equals(List.of(DocxMarkupCompatibilityMasteryEngine.W14)), "second Choice Requires resolves prefix to W14 URI");

        var base = engine.resolve(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        check(base.size() == 1 && base.get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.FALLBACK, "base profile selects fallback");
        var w14 = engine.resolve(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        check(w14.get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.CHOICE && w14.get(0).choiceIndex() == 2, "first supported Choice is selected in markup order");
        var w15 = engine.resolve(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14_W15", DocxMarkupCompatibilityMasteryEngine.W14, DocxMarkupCompatibilityMasteryEngine.W15));
        check(w15.get(0).choiceIndex() == 1, "earlier Choice wins when all of its required namespaces are understood");

        var baseView = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        String baseXml = documentXml(baseView.bytes());
        check(baseXml.contains("FALLBACK-TEXT") && !baseXml.contains("W14-TEXT") && !baseXml.contains("W15-TEXT"), "fallback materialization replaces AlternateContent content");
        check(!baseXml.contains("AlternateContent"), "derived compatible view removes processed mc:AlternateContent wrapper");
        check(baseView.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.SELECT_FALLBACK), "fallback selection is explicit in degradation ledger");

        var w14View = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        String w14Xml = documentXml(w14View.bytes());
        check(w14Xml.contains("W14-TEXT") && !w14Xml.contains("W15-TEXT") && !w14Xml.contains("FALLBACK-TEXT"), "W14 compatible view selects second Choice content");
    }

    private static void testFallbackAndAbsentSemantics() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] noFallback = multipleChoiceFixture(false);
        var resolution = engine.resolve(noFallback, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        check(resolution.get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.NONE, "unsupported Choices with no Fallback resolve to NONE");
        var view = engine.materializeCompatibleView(noFallback, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        String xml = documentXml(view.bytes());
        check(!xml.contains("W14-TEXT") && !xml.contains("W15-TEXT") && !xml.contains("AlternateContent"), "no-supported-Choice/no-Fallback is processed as if AlternateContent were absent");
        check(view.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.REMOVE_ALTERNATE_CONTENT_WITHOUT_REPLACEMENT), "absent replacement is disclosed in degradation ledger");
    }

    private static void testMustUnderstandAndIgnorable() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] must = mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "u", CUSTOM);
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:MustUnderstand", "u");
        });
        expectFailure(() -> engine.materializeCompatibleView(must, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()), "unsupported MustUnderstand namespace fails closed");
        var supported = engine.materializeCompatibleView(must, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("CUSTOM", CUSTOM));
        check(supported.degradationLedger().isEmpty(), "understood MustUnderstand namespace does not degrade content");

        byte[] both = mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "u", CUSTOM);
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "u");
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:MustUnderstand", "u");
        });
        expectFailure(() -> engine.materializeCompatibleView(both, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()), "MustUnderstand wins over Ignorable for unsupported namespace");

        byte[] nonIgnorable = addCustomWrapper(baseDocument(), false, false, false);
        expectFailure(() -> engine.materializeCompatibleView(nonIgnorable, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()), "unsupported non-ignorable extension markup fails closed");
    }

    private static void testProcessContentAndIgnorableAttributes() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] source = addCustomWrapper(baseDocument(), true, true, true);
        var view = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        String xml = documentXml(view.bytes());
        check(xml.contains("PROCESS-ME"), "mc:ProcessContent keeps understood child content of ignored wrapper");
        check(!xml.contains("u:wrap") && !xml.contains("urn:system-master:t13:custom\" hint"), "ignored wrapper and ignored namespaced attribute are removed from derived view");
        check(view.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.UNWRAP_PROCESS_CONTENT), "ProcessContent unwrapping is ledgered");
        check(view.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.REMOVE_IGNORABLE_ATTRIBUTE), "ignorable attribute degradation is ledgered");

        byte[] drop = addCustomWrapper(baseDocument(), true, false, false);
        var dropView = engine.materializeCompatibleView(drop, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        check(!documentXml(dropView.bytes()).contains("DROP-ME"), "ignorable unsupported element without ProcessContent is removed");
        check(dropView.degradationLedger().stream().anyMatch(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.REMOVE_IGNORABLE_ELEMENT), "ignored element removal is explicit");
    }

    private static void testPreservationHintsAndExplicitDegradation() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] source = mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "u", CUSTOM);
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "u");
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:PreserveElements", "u:drop");
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:PreserveAttributes", "u:hint");
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            Element drop = document.createElementNS(CUSTOM, "u:drop");
            drop.setTextContent("PRESERVE-HINT-ELEMENT");
            p.appendChild(drop);
            p.setAttributeNS(CUSTOM, "u:hint", "PRESERVE-HINT-ATTRIBUTE");
        });
        String sourceSha = OoxmlPackageSupport.sha256(source);
        var snapshot = engine.inspect(source);
        check(snapshot.compatibilityRules().stream().anyMatch(r -> r.preserveElements().stream().anyMatch(q -> "u:drop".equals(q.lexical()))), "PreserveElements hint is structurally extracted");
        check(snapshot.compatibilityRules().stream().anyMatch(r -> r.preserveAttributes().stream().anyMatch(q -> "u:hint".equals(q.lexical()))), "PreserveAttributes hint is structurally extracted");
        var view = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        check(OoxmlPackageSupport.sha256(source).equals(sourceSha), "preservation/degradation processing never mutates source bytes");
        check(view.degradationLedger().stream().filter(e -> e.action() == DocxMarkupCompatibilityMasteryEngine.DegradationAction.PRESERVATION_HINT_RECORDED_NOT_REQUIRED_BY_OOXML).count() == 2,
                "OOXML preservation hints are retained as source-preservation evidence but do not masquerade as target support");
        check(!documentXml(view.bytes()).contains("PRESERVE-HINT-ELEMENT") && !documentXml(view.bytes()).contains("PRESERVE-HINT-ATTRIBUTE"), "target-compatible view explicitly degrades unsupported ignorable hints while source remains intact");
    }

    private static void testMalformedCompatibilityMarkupFailsClosed() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        expectFailure(() -> engine.inspect(malformedNoChoice()), "AlternateContent without Choice is rejected");
        expectFailure(() -> engine.inspect(malformedFallbackBeforeChoice()), "Choice after Fallback is rejected");
        expectFailure(() -> engine.inspect(malformedTwoFallbacks()), "multiple Fallback elements are rejected");
        expectFailure(() -> engine.inspect(malformedNestedAlternate()), "directly nested AlternateContent is rejected");
        expectFailure(() -> engine.inspect(malformedUnboundRequires()), "unbound Choice Requires prefix is rejected");
        expectFailure(() -> engine.inspect(malformedUnprefixedAlternateAttribute()), "unprefixed AlternateContent attribute is rejected");
        expectFailure(() -> engine.inspect(malformedXmlSpaceOnFallback()), "xml:space on Fallback is rejected");
        expectFailure(() -> engine.resolve(malformedUnknownBranchAttribute(false), DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14)),
                "unknown non-ignorable Choice/Fallback attribute is rejected even when branch is unselected");
        var allowed = engine.resolve(malformedUnknownBranchAttribute(true), DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        check(!allowed.isEmpty(), "unknown branch attribute is permitted only when its namespace is explicitly ignorable");
        expectFailure(() -> engine.resolve(requiresUriInsteadOfPrefix(), DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007()), "Choice Requires is prefix-based and rejects a URI literal");
    }

    private static void testScopedCreateAndEditPreservation() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] source = preserved(baseDocument());
        String preserveSha = OoxmlPackageSupport.sha256(OoxmlPackageSupport.read(source).get("customXml/t13-preserve.xml"));
        var created = engine.createAlternateContentText(source, 1, "w14", DocxMarkupCompatibilityMasteryEngine.W14, "CHOICE-CREATE", "FALLBACK-CREATE");
        check(created.unrelatedPartsByteIdentical(), "AlternateContent CREATE preserves every unrelated package part byte-for-byte");
        check(OoxmlPackageSupport.sha256(OoxmlPackageSupport.read(created.bytes()).get("customXml/t13-preserve.xml")).equals(preserveSha), "unrelated custom XML part remains byte-identical after CREATE");
        check(engine.inspect(created.bytes()).alternateContent().size() == 1, "created AlternateContent round-trips through READ/EXTRACT");

        var edited = engine.editAlternateContentText(created.bytes(), 1, DocxMarkupCompatibilityMasteryEngine.BranchKind.CHOICE, 1, "CHOICE-EDITED");
        check(edited.unrelatedPartsByteIdentical(), "scoped AlternateContent MASTER edit preserves unrelated package parts byte-for-byte");
        check(edited.protectedBranchesStructurallyIdentical() && edited.protectedBranchFingerprints() == 1, "scoped Choice edit preserves unowned Fallback subtree structurally");
        var ac = engine.inspect(edited.bytes()).alternateContent().get(0);
        check(ac.fallbackPresent(), "Fallback remains after Choice edit");
        var fallbackView = engine.materializeCompatibleView(edited.bytes(), DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.base2007());
        check(documentXml(fallbackView.bytes()).contains("FALLBACK-CREATE"), "edited Choice does not alter Fallback semantics");
        var choiceView = engine.materializeCompatibleView(edited.bytes(), DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        check(documentXml(choiceView.bytes()).contains("CHOICE-EDITED"), "targeted Choice edit round-trips into compatible view");
    }

    private static void testNamespaceEvolutionAndPrefixIndependence() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] alias = mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "future14", DocxMarkupCompatibilityMasteryEngine.W14);
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "future14");
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            p.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.W14, "future14:paraId", "ABCDEF01");
            addAlternate(document, p, List.of(new ChoiceDef("future14", "ALIAS-W14")), "ALIAS-FALLBACK");
        });
        var snapshot = engine.inspect(alias);
        check(snapshot.versionedFeatures().stream().anyMatch(f -> "future14".equals(f.prefix()) && DocxMarkupCompatibilityMasteryEngine.W14.equals(f.namespaceUri())), "namespace inventory keeps lexical prefix while authority identity is URI");
        var decision = engine.resolve(alias, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("URI_SUPPORT", DocxMarkupCompatibilityMasteryEngine.W14));
        check(decision.get(0).branchKind() == DocxMarkupCompatibilityMasteryEngine.BranchKind.CHOICE, "Choice support is based on resolved namespace URI, not hard-coded prefix");

        byte[] twoPrefixes = mutate(alias, document -> {
            Element root = document.getDocumentElement();
            ns(root, "second14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            p.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.W14, "second14:textId", "10203040");
        });
        Set<String> w14Prefixes = engine.inspect(twoPrefixes).versionedFeatures().stream()
                .filter(f -> DocxMarkupCompatibilityMasteryEngine.W14.equals(f.namespaceUri())).map(DocxMarkupCompatibilityMasteryEngine.VersionedFeatureSnapshot::prefix)
                .collect(java.util.stream.Collectors.toSet());
        check(w14Prefixes.contains("future14") && w14Prefixes.contains("second14"), "multiple prefixes can evolve while sharing one namespace identity");
    }

    private static void testRealT08VersionedCommentNamespaces() throws Exception {
        DocxReviewProtectionMasteryEngine review = new DocxReviewProtectionMasteryEngine();
        byte[] source = baseDocument();
        source = review.addModernComment(source, "body/p:2",
                new DocxReviewProtectionMasteryEngine.CommentSpec("T13 Reviewer", "TR", Instant.parse("2026-09-01T16:00:00Z"), "T13 modern comment"),
                false, new DocxReviewProtectionMasteryEngine.MentionSpec("T13 Person", "PeoplePicker", "t13@example.test"));
        DocxMarkupCompatibilityMasteryEngine.PackageSnapshot snapshot = new DocxMarkupCompatibilityMasteryEngine().inspect(source);
        Set<String> families = snapshot.versionedFeatures().stream().map(DocxMarkupCompatibilityMasteryEngine.VersionedFeatureSnapshot::namespaceFamily)
                .collect(java.util.stream.Collectors.toSet());
        check(families.stream().anyMatch(v -> v.contains("W15") || v.contains("W16")), "T13 inventories real versioned namespaces emitted by inherited modern-comment support");
        check(new DocxReviewProtectionMasteryEngine().readComments(source).stream().anyMatch(DocxReviewProtectionMasteryEngine.CommentSnapshot::modern), "T13 inspection does not damage inherited T08 modern comment semantics");
    }

    private static void testCanonicalProjection() throws Exception {
        byte[] source = versionedFeatureFixture();
        source = new DocxMarkupCompatibilityMasteryEngine().createAlternateContentText(source, 2, "w14", DocxMarkupCompatibilityMasteryEngine.W14, "CDG-CHOICE", "CDG-FALLBACK").bytes();
        CanonicalDocumentGraphV2 graph = new DocumentProcessingService().projectCanonicalGraphV2(DocumentFormat.DOCX, source);
        check(graph.elements().stream().anyMatch(e -> "markup-compatibility-rules".equals(e.semantic().role())), "CDG-2 projects compatibility-rule semantics");
        check(graph.elements().stream().anyMatch(e -> "alternate-content".equals(e.semantic().role())), "CDG-2 projects AlternateContent as structured metadata");
        check(graph.elements().stream().anyMatch(e -> "versioned-word-extension-feature".equals(e.semantic().role())
                && DocxMarkupCompatibilityMasteryEngine.W14.equals(e.semantic().properties().get("namespaceUri"))), "CDG-2 exposes known versioned extension features as structured semantics inside already-represented XML parts");
        check(graph.elements().stream().filter(e -> "versioned-word-extension-feature".equals(e.semantic().role()))
                .anyMatch(e -> "word/document.xml".equals(e.nativeAnchor().nativePart())), "inner versioned features remain anchored to exact native part");
    }

    private static void testDeterminismAndSourceImmutability() throws Exception {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        byte[] source = multipleChoiceFixture(true);
        byte[] sourceCopy = source.clone();
        var a = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        var b = engine.materializeCompatibleView(source, DocxMarkupCompatibilityMasteryEngine.CompatibilityProfile.withExtensions("W14", DocxMarkupCompatibilityMasteryEngine.W14));
        check(Arrays.equals(source, sourceCopy), "materialization never mutates caller source buffer");
        check(a.sourceSha256().equals(OoxmlPackageSupport.sha256(source)), "materialization receipt binds source digest");
        check(a.resultSha256().equals(OoxmlPackageSupport.sha256(a.bytes())), "materialization receipt binds derived digest");
        check(Arrays.equals(a.bytes(), b.bytes()) && a.resultSha256().equals(b.resultSha256()), "same source/profile produces deterministic derived package bytes");
        check(!a.sourceSha256().equals(a.resultSha256()), "derived compatibility view has distinct identity when compatibility markup is materialized");
    }

    private static void testUnsafeXmlRejected() throws Exception {
        byte[] source = baseDocument();
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        String dangerous = "<?xml version=\"1.0\"?><!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><w:document xmlns:w=\"" + DocxMarkupCompatibilityMasteryEngine.W + "\"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>";
        parts.put("word/document.xml", dangerous.getBytes(StandardCharsets.UTF_8));
        byte[] packageBytes = OoxmlPackageSupport.write(parts);
        expectFailure(() -> new DocxMarkupCompatibilityMasteryEngine().inspect(packageBytes), "DOCTYPE/external-entity input remains blocked by shared OOXML secure parser");
    }

    private static byte[] baseDocument() throws Exception {
        return new DocxFullLaneEngine().createDocument(List.of("T13 host 1", "T13 host 2", "T13 host 3", "T13 host 4", "T13 host 5"));
    }

    private static byte[] preserved(byte[] source) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        parts.put("customXml/t13-preserve.xml", "<preserve xmlns=\"urn:t13:preserve\"><opaque>KEEP</opaque></preserve>".getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] multipleChoiceFixture(boolean fallback) throws Exception {
        return mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            ns(root, "w15", DocxMarkupCompatibilityMasteryEngine.W15);
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "w14 w15");
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            addAlternate(document, p, List.of(new ChoiceDef("w15", "W15-TEXT"), new ChoiceDef("w14", "W14-TEXT")), fallback ? "FALLBACK-TEXT" : null);
        });
    }

    private static byte[] versionedFeatureFixture() throws Exception {
        return mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            Map<String, String> pfx = Map.of(
                    "w14", DocxMarkupCompatibilityMasteryEngine.W14,
                    "w15", DocxMarkupCompatibilityMasteryEngine.W15,
                    "w16cid", DocxMarkupCompatibilityMasteryEngine.W16CID,
                    "w16cex", DocxMarkupCompatibilityMasteryEngine.W16CEX,
                    "w16cur", DocxMarkupCompatibilityMasteryEngine.W16CUR,
                    "w16du", DocxMarkupCompatibilityMasteryEngine.W16DU);
            for (Map.Entry<String, String> e : pfx.entrySet()) ns(root, e.getKey(), e.getValue());
            root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", String.join(" ", pfx.keySet()));
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            p.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.W14, "w14:paraId", "00112233");
            for (Map.Entry<String, String> e : pfx.entrySet()) {
                Element extension = document.createElementNS(e.getValue(), e.getKey() + ":feature");
                extension.setTextContent(e.getKey() + "-feature");
                p.appendChild(extension);
            }
        });
    }

    private static byte[] addCustomWrapper(byte[] base, boolean ignorable, boolean processContent, boolean attr) throws Exception {
        return mutate(base, document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            ns(root, "u", CUSTOM);
            if (ignorable) root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "u");
            if (processContent) root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:ProcessContent", "u:wrap");
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            if (attr) p.setAttributeNS(CUSTOM, "u:hint", "custom-hint");
            Element wrapper = document.createElementNS(CUSTOM, "u:wrap");
            Element r = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element t = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:t");
            t.setTextContent(processContent ? "PROCESS-ME" : "DROP-ME");
            r.appendChild(t); wrapper.appendChild(r); p.appendChild(wrapper);
        });
    }

    private static byte[] malformedNoChoice() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element fallback = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback");
            ac.appendChild(fallback); run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedFallbackBeforeChoice() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            ac.appendChild(document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback"));
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "w14"); ac.appendChild(choice);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedTwoFallbacks() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "w14"); ac.appendChild(choice);
            ac.appendChild(document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback"));
            ac.appendChild(document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback"));
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedNestedAlternate() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element outer = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "w14"); outer.appendChild(choice);
            outer.appendChild(document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent"));
            run.appendChild(outer); p.appendChild(run);
        });
    }

    private static byte[] malformedUnboundRequires() throws Exception {
        return mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement(); ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "notBound"); ac.appendChild(choice);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedUnprefixedAlternateAttribute() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent"); ac.setAttribute("bad", "1");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "w14"); ac.appendChild(choice);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedXmlSpaceOnFallback() throws Exception {
        return mutate(baseDocument(), document -> {
            Element p = prepareMcParagraph(document, "w14", DocxMarkupCompatibilityMasteryEngine.W14);
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", "w14"); ac.appendChild(choice);
            Element fallback = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback"); fallback.setAttributeNS(XMLConstants.XML_NS_URI, "xml:space", "preserve"); ac.appendChild(fallback);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] malformedUnknownBranchAttribute(boolean ignorable) throws Exception {
        return mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement();
            ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC); ns(root, "w14", DocxMarkupCompatibilityMasteryEngine.W14); ns(root, "u", CUSTOM);
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element firstChoice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); firstChoice.setAttribute("Requires", "w14"); ac.appendChild(firstChoice);
            Element secondChoice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); secondChoice.setAttribute("Requires", "w14"); secondChoice.setAttributeNS(CUSTOM, "u:branchHint", "1");
            if (ignorable) secondChoice.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", "u");
            ac.appendChild(secondChoice);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static byte[] requiresUriInsteadOfPrefix() throws Exception {
        return mutate(baseDocument(), document -> {
            Element root = document.getDocumentElement(); ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC);
            Element p = first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
            Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
            Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", DocxMarkupCompatibilityMasteryEngine.W14); ac.appendChild(choice);
            run.appendChild(ac); p.appendChild(run);
        });
    }

    private static Element prepareMcParagraph(Document document, String prefix, String uri) {
        Element root = document.getDocumentElement(); ns(root, "mc", DocxMarkupCompatibilityMasteryEngine.MC); ns(root, prefix, uri);
        root.setAttributeNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Ignorable", prefix);
        return first(document.getElementsByTagNameNS(DocxMarkupCompatibilityMasteryEngine.W, "p"));
    }

    private static void addAlternate(Document document, Element paragraph, List<ChoiceDef> choices, String fallbackText) {
        Element run = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:r");
        Element ac = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:AlternateContent");
        for (ChoiceDef def : choices) {
            Element choice = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Choice"); choice.setAttribute("Requires", def.prefix());
            Element text = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:t"); text.setTextContent(def.text()); choice.appendChild(text); ac.appendChild(choice);
        }
        if (fallbackText != null) {
            Element fallback = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.MC, "mc:Fallback");
            Element text = document.createElementNS(DocxMarkupCompatibilityMasteryEngine.W, "w:t"); text.setTextContent(fallbackText); fallback.appendChild(text); ac.appendChild(fallback);
        }
        run.appendChild(ac); paragraph.appendChild(run);
    }

    private static byte[] mutate(byte[] source, XmlMutation mutation) throws Exception {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        mutation.apply(document);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        return OoxmlPackageSupport.write(parts);
    }

    private static String documentXml(byte[] packageBytes) throws Exception {
        return new String(OoxmlPackageSupport.read(packageBytes).get("word/document.xml"), StandardCharsets.UTF_8);
    }

    private static void ns(Element root, String prefix, String uri) {
        root.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:" + prefix, uri);
    }

    private static Element first(NodeList list) {
        return list == null || list.getLength() == 0 ? null : (Element) list.item(0);
    }

    private static Set<String> t13Capabilities() {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (int i = 595; i <= 634; i++) out.add("UDM-DOCX-" + String.format(java.util.Locale.ROOT, "%04d", i));
        return Set.copyOf(out);
    }

    private static void expectFailure(ThrowingAction action, String message) throws Exception {
        assertions++;
        try { action.run(); }
        catch (IOException | IllegalArgumentException | IllegalStateException expected) { return; }
        throw new AssertionError(message);
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface private interface XmlMutation { void apply(Document document) throws Exception; }
    @FunctionalInterface private interface ThrowingAction { void run() throws Exception; }
    private record ChoiceDef(String prefix, String text) {}
}
