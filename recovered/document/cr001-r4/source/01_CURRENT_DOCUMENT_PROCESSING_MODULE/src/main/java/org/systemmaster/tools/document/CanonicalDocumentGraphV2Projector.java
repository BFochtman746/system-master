package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.docx.DocxStructuredMetadataMasteryEngine;
import org.systemmaster.tools.docx.DocxReviewProtectionMasteryEngine;
import org.systemmaster.tools.docx.DocxMarkupCompatibilityMasteryEngine;
import org.systemmaster.tools.docx.DocxConformanceProfileMasteryEngine;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** First deep CDG-2 projector slice for DOCX/PPTX/PDF/text with open-world preservation. */
public final class CanonicalDocumentGraphV2Projector {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String P = "http://schemas.openxmlformats.org/presentationml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
    private static final String C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private static final String PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
    private static final String WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
    private static final String WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
    private static final String M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    private static final String CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
    private static final String DC = "http://purl.org/dc/elements/1.1/";

    private final PdfStructuralEngine pdf = new PdfStructuralEngine();
    private final TextDocumentEngine text = new TextDocumentEngine();

    public CanonicalDocumentGraphV2 project(DocumentFormat format, byte[] bytes) throws IOException {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(bytes, "bytes");
        if (!format.portableFoundation()) {
            throw new UnsupportedOperationException("CDG-2 projection engine pending for " + format);
        }
        return switch (format) {
            case DOCX, DOCM -> projectDocx(format, bytes);
            case PPTX, PPTM -> projectPptx(format, bytes);
            case PDF -> projectPdf(format, bytes);
            case MARKDOWN, PLAIN_TEXT, HTML, RTF -> projectText(format, bytes);
            default -> throw new UnsupportedOperationException("CDG-2 projection engine pending for " + format);
        };
    }

    private CanonicalDocumentGraphV2 projectDocx(DocumentFormat format, byte[] bytes) throws IOException {
        Map<String, byte[]> sourceParts = OoxmlPackageSupport.read(bytes);
        requirePart(sourceParts, "word/document.xml", "WordprocessingML document part missing");
        DocxConformanceProfileMasteryEngine conformance = new DocxConformanceProfileMasteryEngine();
        DocxConformanceProfileMasteryEngine.Snapshot conformanceSnapshot = conformance.inspect(bytes);
        byte[] semanticBytes = bytes;
        Map<String, byte[]> parts = sourceParts;
        if (conformanceSnapshot.profile() == DocxConformanceProfileMasteryEngine.Profile.STRICT && conformanceSnapshot.profileCoherent()) {
            semanticBytes = conformance.convert(bytes, DocxConformanceProfileMasteryEngine.Profile.TRANSITIONAL).bytes();
            parts = OoxmlPackageSupport.read(semanticBytes);
        }
        String sourceSha = CanonicalDocumentGraph.sha256(bytes);
        ProjectionBuilder b = new ProjectionBuilder(format, sourceSha, CanonicalDocumentGraphV2.Kind.FLOW_DOCUMENT, sourceParts);
        RelationshipIndex relationships = RelationshipIndex.read(parts);
        b.references.addAll(relationships.toReferences(b.rootId, format));
        b.representedParts.addAll(relationships.relationshipParts());
        b.representedParts.add("[Content_Types].xml");
        b.representedParts.add("word/document.xml");
        addPackageMetadata(parts, b);
        addAssets(parts, b);

        Map<String, StyleDef> styles = parseWordStyles(parts, b);
        projectWordNumbering(parts, b);
        addWordThemes(parts, b);
        projectWordSettings(parts, b);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element body = first(document.getElementsByTagNameNS(W, "body"));
        if (body == null) {
            throw new IOException("DOCX body missing");
        }
        projectWordPageBackground(document, b);
        int ordinal = 0;
        int paragraphIndex = 0;
        int tableIndex = 0;
        int sectionIndex = 0;
        for (Element child : childElements(body)) {
            String local = child.getLocalName();
            if ("p".equals(local)) {
                paragraphIndex++;
                projectWordParagraph(child, b, b.rootId, ordinal++, "body/p:" + paragraphIndex, styles, relationships, "word/document.xml");
            } else if ("tbl".equals(local)) {
                tableIndex++;
                projectWordTable(child, b, b.rootId, ordinal++, "body/tbl:" + tableIndex, styles, relationships, "word/document.xml");
            } else if ("sectPr".equals(local)) {
                sectionIndex++;
                projectWordSection(child, b, b.rootId, ordinal++, "body/sectPr:" + sectionIndex, "word/document.xml");
            }
        }
        projectWordReviewProtection(semanticBytes, parts, b);
        projectWordNotes(parts, b, "word/footnotes.xml", CanonicalDocumentGraphV2.ElementType.FOOTNOTE);
        projectWordNotes(parts, b, "word/endnotes.xml", CanonicalDocumentGraphV2.ElementType.ENDNOTE);
        projectWordHeadersAndFooters(parts, b, styles, relationships);
        projectWordCharts(parts, b, relationships);
        projectWordSmartArt(parts, b, document, relationships);
        projectWordStructuredMetadata(semanticBytes, parts, b);
        projectWordMarkupCompatibility(semanticBytes, b);
        projectWordConformanceProfile(bytes, b);
        addUnknownFeatures(parts, b, "DOCX_UNMODELED_NATIVE_PART");
        return b.build(Map.of(
                "projector", "CanonicalDocumentGraphV2Projector",
                "projectionSlice", "DOCX_DEEP_001",
                "source.authority", "native-bytes"));
    }



    private static void projectWordConformanceProfile(byte[] bytes, ProjectionBuilder b) throws IOException {
        DocxConformanceProfileMasteryEngine.Snapshot snapshot = new DocxConformanceProfileMasteryEngine().inspect(bytes);
        LinkedHashMap<String, String> properties = new LinkedHashMap<>();
        properties.put("profile", snapshot.profile().name());
        properties.put("mainDocumentNamespace", snapshot.mainDocumentNamespace());
        properties.put("declaredConformance", snapshot.declaredConformance());
        properties.put("officeDocumentRelationshipType", snapshot.rootOfficeDocumentRelationshipType());
        properties.put("packageStructureValid", Boolean.toString(snapshot.packageStructureValid()));
        properties.put("profileCoherent", Boolean.toString(snapshot.profileCoherent()));
        properties.put("fullSchemaConformanceClaimed", Boolean.toString(snapshot.fullSchemaConformanceClaimed()));
        properties.put("violationCount", Integer.toString(snapshot.violations().size()));
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", "/w:document", "", "");
        b.elements.add(element(
                b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, 97_900, "", anchor,
                new CanonicalDocumentGraphV2.SemanticState("docx-conformance-profile", "", Map.copyOf(properties)),
                CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                new CanonicalDocumentGraphV2.BehaviorState(List.of("profile-detect", "profile-validate", "safe-derived-conversion"), Map.of()),
                CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(), Map.of("authority", "DOCUMENT-DOCX-MASTERY-T14")));
    }

    private static void projectWordMarkupCompatibility(byte[] bytes, ProjectionBuilder b) throws IOException {
        DocxMarkupCompatibilityMasteryEngine engine = new DocxMarkupCompatibilityMasteryEngine();
        DocxMarkupCompatibilityMasteryEngine.PackageSnapshot snapshot = engine.inspect(bytes);
        int ordinal = 98_000;
        for (DocxMarkupCompatibilityMasteryEngine.CompatibilityRuleSnapshot rule : snapshot.compatibilityRules()) {
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.put("ignorablePrefixes", String.join(" ", rule.ignorablePrefixes()));
            properties.put("ignorableNamespaces", String.join(" ", rule.ignorableNamespaceUris()));
            properties.put("mustUnderstandPrefixes", String.join(" ", rule.mustUnderstandPrefixes()));
            properties.put("mustUnderstandNamespaces", String.join(" ", rule.mustUnderstandNamespaceUris()));
            properties.put("processContent", rule.processContent().stream().map(DocxMarkupCompatibilityMasteryEngine.QNameRef::lexical).sorted().toList().toString());
            properties.put("preserveElements", rule.preserveElements().stream().map(DocxMarkupCompatibilityMasteryEngine.QNameRef::lexical).sorted().toList().toString());
            properties.put("preserveAttributes", rule.preserveAttributes().stream().map(DocxMarkupCompatibilityMasteryEngine.QNameRef::lexical).sorted().toList().toString());
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(rule.partName(), rule.locator(), "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.METADATA,
                    b.rootId,
                    ordinal++,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("markup-compatibility-rules", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of("authority", "DOCUMENT-DOCX-MASTERY-T13")));
        }
        for (DocxMarkupCompatibilityMasteryEngine.AlternateContentSnapshot alternate : snapshot.alternateContent()) {
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.put("choiceCount", Integer.toString(alternate.choices().size()));
            properties.put("fallbackPresent", Boolean.toString(alternate.fallbackPresent()));
            for (DocxMarkupCompatibilityMasteryEngine.ChoiceSnapshot choice : alternate.choices()) {
                properties.put("choice." + choice.index() + ".requiresPrefixes", String.join(" ", choice.requiresPrefixes()));
                properties.put("choice." + choice.index() + ".requiredNamespaces", String.join(" ", choice.requiredNamespaceUris()));
                properties.put("choice." + choice.index() + ".structuralSha256", choice.nativeStructuralSha256());
            }
            if (alternate.fallbackPresent()) properties.put("fallback.structuralSha256", alternate.fallbackStructuralSha256());
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(alternate.partName(), alternate.locator(), "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.METADATA,
                    b.rootId,
                    ordinal++,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("alternate-content", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("first-supported-choice", "fallback", "source-preservation"), Map.of()),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of("authority", "DOCUMENT-DOCX-MASTERY-T13")));
        }
        for (DocxMarkupCompatibilityMasteryEngine.VersionedFeatureSnapshot feature : snapshot.versionedFeatures()) {
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.put("featureKind", feature.kind().name());
            properties.put("prefix", feature.prefix());
            properties.put("namespaceUri", feature.namespaceUri());
            properties.put("localName", feature.localName());
            properties.put("namespaceFamily", feature.namespaceFamily());
            properties.put("sourcePartSha256", feature.sourcePartSha256());
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(feature.partName(), feature.locator(), "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.METADATA,
                    b.rootId,
                    ordinal++,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("versioned-word-extension-feature", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("preserve-native-source", "namespace-uri-identity"), Map.of()),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of("authority", "DOCUMENT-DOCX-MASTERY-T13")));
        }
    }

    private static void projectWordReviewProtection(byte[] bytes, Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        DocxReviewProtectionMasteryEngine engine = new DocxReviewProtectionMasteryEngine();
        int ordinal = 90_000;
        for (String part : List.of("word/comments.xml", "word/commentsExtended.xml", "word/commentsIds.xml", "word/commentsExtensible.xml", "word/people.xml", "word/settings.xml")) {
            if (parts.containsKey(part)) b.representedParts.add(part);
        }
        for (DocxReviewProtectionMasteryEngine.MailMergeFieldSnapshot field : engine.readMailMergeFields(bytes)) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", field.locator(), field.spec().fieldName(), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.FIELD, b.rootId, ordinal++, field.spec().displayText(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("mail-merge-field", "", Map.of("fieldName", field.spec().fieldName(), "switches", field.spec().switches())),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("mail-merge", Map.of("instruction", field.instruction()), List.of(field.spec().fieldName())),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("field-update", "mail-merge"), Map.of("instruction", field.instruction())),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxReviewProtectionMasteryEngine.RevisionSnapshot revision : engine.readRevisions(bytes)) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", revision.locator(), revision.spec().id(), "");
            LinkedHashMap<String, String> properties = new LinkedHashMap<>(revision.nativeProperties());
            properties.put("kind", revision.spec().kind().name());
            properties.put("author", revision.spec().author());
            properties.put("date", revision.spec().at().toString());
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.REVISION, b.rootId, ordinal++, revision.spec().text(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("tracked-revision", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("word-revision", Map.copyOf(properties), revision.spec().text().isEmpty() ? List.of() : List.of(revision.spec().text())),
                    CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    new CanonicalDocumentGraphV2.ReviewState(List.of(), List.of(revision.spec().id()), Map.copyOf(properties)), List.of(), Map.of()));
        }
        for (DocxReviewProtectionMasteryEngine.CommentSnapshot comment : engine.readComments(bytes)) {
            String nativePart = "word/comments.xml";
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, comment.locator(), Integer.toString(comment.id()), "");
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.put("author", comment.spec().author());
            properties.put("date", comment.spec().at().toString());
            properties.put("modern", Boolean.toString(comment.modern()));
            properties.put("resolved", Boolean.toString(comment.resolved()));
            properties.put("paraId", comment.paraId());
            properties.put("durableId", comment.durableId());
            if (comment.parentId() != null) properties.put("parentId", Integer.toString(comment.parentId()));
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.COMMENT, b.rootId, ordinal++, comment.spec().text(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState(comment.modern() ? "modern-comment" : "classic-comment", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), CanonicalDocumentGraphV2.DataState.empty(),
                    new CanonicalDocumentGraphV2.BehaviorState(comment.modern() ? List.of("threaded-comment") : List.of("comment"), Map.of("resolved", Boolean.toString(comment.resolved()))),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    new CanonicalDocumentGraphV2.ReviewState(List.of(Integer.toString(comment.id())), List.of(), Map.copyOf(properties)), List.of(), Map.of()));
            int mentionOrdinal = 0;
            for (DocxReviewProtectionMasteryEngine.MentionSpec mention : comment.mentions()) {
                CanonicalDocumentGraphV2.NativeAnchor mentionAnchor = new CanonicalDocumentGraphV2.NativeAnchor("word/people.xml", comment.locator() + "/mention:" + (++mentionOrdinal), mention.userId(), "");
                b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, "@" + mention.displayName(), mentionAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("comment-mention", "", Map.of("displayName", mention.displayName(), "providerId", mention.providerId(), "userId", mention.userId(), "commentId", Integer.toString(comment.id()))),
                        CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), CanonicalDocumentGraphV2.DataState.empty(), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
            }
        }
        DocxReviewProtectionMasteryEngine.ProtectionSpec protection = engine.readDocumentProtection(bytes);
        if (protection.edit() != DocxReviewProtectionMasteryEngine.ProtectionEdit.NONE || protection.enforcement() || protection.formattingLocked()) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/settings.xml", "document-protection", "", "");
            Map<String, String> p = Map.of("edit", protection.edit().name(), "enforcement", Boolean.toString(protection.enforcement()), "formattingLocked", Boolean.toString(protection.formattingLocked()), "cryptAlgorithmSid", Integer.toString(protection.cryptAlgorithmSid()), "cryptSpinCount", Integer.toString(protection.cryptSpinCount()));
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, "", anchor,
                    new CanonicalDocumentGraphV2.SemanticState("document-protection", "", p), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), new CanonicalDocumentGraphV2.DataState("document-protection", p, List.of()), new CanonicalDocumentGraphV2.BehaviorState(List.of("restricted-editing"), p), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxReviewProtectionMasteryEngine.RestrictedRangeSnapshot range : engine.readRestrictedRanges(bytes)) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", range.locator(), range.spec().id(), "");
            Map<String, String> p = Map.of("id", range.spec().id(), "editorGroup", range.spec().editorGroup(), "paragraphLocator", range.spec().paragraphLocator());
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, "", anchor,
                    new CanonicalDocumentGraphV2.SemanticState("restricted-editing", "", p), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), new CanonicalDocumentGraphV2.DataState("permission-range", p, List.of()), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
    }

    private static void projectWordStructuredMetadata(byte[] bytes, Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        DocxStructuredMetadataMasteryEngine engine = new DocxStructuredMetadataMasteryEngine();
        int ordinal = 80_000;
        for (DocxStructuredMetadataMasteryEngine.CitationSnapshot citation : engine.readCitations(bytes)) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", citation.locator(), citation.spec().tag(), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.CITATION, b.rootId, ordinal++, citation.spec().displayText(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("citation", "", Map.of("tag", citation.spec().tag(), "localeId", Integer.toString(citation.spec().localeId()))),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("word-citation", Map.of("instruction", citation.instruction()), List.of(citation.spec().tag())),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("field-update"), Map.of("instruction", citation.instruction())),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.BibliographySnapshot bibliography : engine.readBibliographies(bytes)) {
            ArrayList<String> values = new ArrayList<>();
            for (DocxStructuredMetadataMasteryEngine.BibliographySource source : bibliography.sources()) {
                values.add(source.tag() + "\t" + source.sourceType() + "\t" + source.title() + "\t" + source.author() + "\t" + source.year());
            }
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", bibliography.locator(), "", "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.FIELD, b.rootId, ordinal++, "Bibliography", anchor,
                    new CanonicalDocumentGraphV2.SemanticState("bibliography", "", Map.of("instruction", bibliography.instruction(), "sourceCount", Integer.toString(values.size()))),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("bibliography-sources", Map.of(), values),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("field-update"), Map.of("instruction", bibliography.instruction())),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.GeneratedTableSnapshot generated : engine.readGeneratedTables(bytes)) {
            String role = switch (generated.spec().kind()) {
                case TABLE_OF_CONTENTS -> "table-of-contents";
                case INDEX -> "index";
                case TABLE_OF_FIGURES -> "table-of-figures";
            };
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", generated.locator(), "", "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.FIELD, b.rootId, ordinal++, generated.spec().title(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState(role, "", Map.of("kind", generated.spec().kind().name(), "instruction", generated.spec().instruction())),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("generated-table", Map.of("kind", generated.spec().kind().name()), List.of()),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("field-update"), Map.of("instruction", generated.spec().instruction())),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.ContentControlSnapshot control : engine.readContentControls(bytes)) {
            String role = control.repeating() ? "repeating-content-control" : "content-control";
            LinkedHashMap<String, String> props = new LinkedHashMap<>();
            props.put("alias", control.spec().alias()); props.put("tag", control.spec().tag()); props.put("id", Integer.toString(control.spec().id())); props.put("lock", control.spec().lock());
            props.put("storeItemId", control.spec().storeItemId()); props.put("xpath", control.spec().xpath()); props.put("prefixMappings", control.spec().prefixMappings()); props.put("repeatingItem", Boolean.toString(control.repeatingItem()));
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", control.locator(), Integer.toString(control.spec().id()), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT, b.rootId, ordinal++, control.spec().text(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState(role, "", Map.copyOf(props)), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("structured-document-tag", Map.copyOf(props), List.of(control.spec().text())),
                    CanonicalDocumentGraphV2.BehaviorState.empty(), new CanonicalDocumentGraphV2.AccessibilityState("group", control.spec().alias(), "", control.locator(), Map.of("tag", control.spec().tag())),
                    CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.CustomXmlMappingSnapshot mapping : engine.readCustomXmlMappings(bytes)) {
            b.representedParts.add(mapping.itemPart()); b.representedParts.add(mapping.propsPart());
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(mapping.itemPart(), mapping.locator(), mapping.spec().storeItemId(), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, mapping.spec().xml(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("custom-xml-mapping", "", Map.of("storeItemId", mapping.spec().storeItemId(), "xpath", mapping.spec().xpath(), "prefixMappings", mapping.spec().prefixMappings())),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("custom-xml", Map.of("itemPart", mapping.itemPart(), "propsPart", mapping.propsPart()), List.of(mapping.spec().xml())),
                    CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.LegacyFormFieldSnapshot form : engine.readLegacyFormFields(bytes)) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", form.locator(), form.spec().name(), "");
            LinkedHashMap<String, String> props = new LinkedHashMap<>(); props.put("type", form.spec().type().name()); props.put("name", form.spec().name()); props.put("enabled", Boolean.toString(form.spec().enabled())); props.put("calculateOnExit", Boolean.toString(form.spec().calculateOnExit())); props.put("checked", Boolean.toString(form.spec().checked()));
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.FIELD, b.rootId, ordinal++, form.spec().defaultText(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("legacy-form-field", "", Map.copyOf(props)), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("legacy-form-field", Map.copyOf(props), form.spec().dropdownItems()), CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.PropertyValue property : engine.readDocumentProperties(bytes)) {
            String part = property.name().startsWith("core.") ? "docProps/core.xml" : "docProps/app.xml"; b.representedParts.add(part);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "document-property:" + property.name(), property.name(), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, property.value(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("document-property", "", Map.of("name", property.name(), "value", property.value())), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), CanonicalDocumentGraphV2.DataState.empty(), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.CustomPropertyValue property : engine.readCustomProperties(bytes)) {
            b.representedParts.add("docProps/custom.xml"); CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("docProps/custom.xml", "custom-property:" + property.name(), Integer.toString(property.pid()), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, property.value(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("custom-property", "", Map.of("name", property.name(), "type", property.type(), "pid", Integer.toString(property.pid()))), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), new CanonicalDocumentGraphV2.DataState("custom-property", Map.of("type", property.type()), List.of(property.value())), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        for (DocxStructuredMetadataMasteryEngine.DocumentVariable variable : engine.readDocumentVariables(bytes)) {
            b.representedParts.add("word/settings.xml"); CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/settings.xml", "document-variable:" + variable.name(), variable.name(), "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.METADATA, b.rootId, ordinal++, variable.value(), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("document-variable", "", Map.of("name", variable.name(), "value", variable.value())), CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(), CanonicalDocumentGraphV2.DataState.empty(), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
    }

    private CanonicalDocumentGraphV2 projectPptx(DocumentFormat format, byte[] bytes) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        requirePart(parts, "ppt/presentation.xml", "PresentationML presentation part missing");
        String sourceSha = CanonicalDocumentGraph.sha256(bytes);
        ProjectionBuilder b = new ProjectionBuilder(format, sourceSha, CanonicalDocumentGraphV2.Kind.PRESENTATION, parts);
        RelationshipIndex relationships = RelationshipIndex.read(parts);
        b.references.addAll(relationships.toReferences(b.rootId, format));
        b.representedParts.addAll(relationships.relationshipParts());
        b.representedParts.add("[Content_Types].xml");
        b.representedParts.add("ppt/presentation.xml");
        addPackageMetadata(parts, b);
        addAssets(parts, b);
        addPptThemesLayoutsMasters(parts, b);

        List<String> slideParts = orderedSlideParts(parts, relationships);
        int slideOrdinal = 0;
        for (String slidePart : slideParts) {
            projectSlide(parts, b, relationships, slidePart, slideOrdinal++);
        }
        projectNotesMasters(parts, b);
        addUnknownFeatures(parts, b, "PPTX_UNMODELED_NATIVE_PART");
        return b.build(Map.of(
                "projector", "CanonicalDocumentGraphV2Projector",
                "projectionSlice", "PPTX_DEEP_001",
                "source.authority", "native-bytes"));
    }

    private CanonicalDocumentGraphV2 projectPdf(DocumentFormat format, byte[] bytes) {
        String sourceSha = CanonicalDocumentGraph.sha256(bytes);
        ArrayList<CanonicalDocumentGraphV2.Element> elements = new ArrayList<>();
        ArrayList<CanonicalDocumentGraphV2.UnknownNativeFeature> unknown = new ArrayList<>();
        CanonicalDocumentGraphV2.NativeAnchor rootAnchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "root", "", "");
        String rootId = CanonicalDocumentGraphV2.stableElementId(format, CanonicalDocumentGraphV2.ElementType.ROOT, rootAnchor);
        elements.add(element(format, CanonicalDocumentGraphV2.ElementType.ROOT, null, 0, "", rootAnchor,
                new CanonicalDocumentGraphV2.SemanticState("document", "", Map.of("format", "PDF")),
                CanonicalDocumentGraphV2.StyleState.empty(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of()));
        PdfStructuralEngine.Inspection inspection = pdf.inspect(bytes);
        for (int page = 1; page <= inspection.pages(); page++) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "page:" + page, Integer.toString(page), "");
            elements.add(element(format, CanonicalDocumentGraphV2.ElementType.PAGE, rootId, page - 1, "", anchor,
                    new CanonicalDocumentGraphV2.SemanticState("page", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    new CanonicalDocumentGraphV2.GeometryState("PDF_USER_SPACE", "", "", "", "", "", page - 1, Map.of()),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("page", "", "", Integer.toString(page), Map.of()),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        for (int i = 0; i < inspection.literalText().size(); i++) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "literal-text:" + (i + 1), "", "");
            elements.add(element(format, CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK, rootId, i, inspection.literalText().get(i), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("portable-literal-text", "", Map.of("confidence", "fallback")),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        int unknownIndex = 0;
        for (String feature : inspection.features()) {
            unknownIndex++;
            unknown.add(new CanonicalDocumentGraphV2.UnknownNativeFeature(
                    CanonicalDocumentGraphV2.stableObjectId("unknown", "PDF|" + feature),
                    "<artifact>",
                    "PDF_FEATURE_" + feature.toUpperCase(Locale.ROOT),
                    sourceSha,
                    CanonicalDocumentGraphV2.UnknownDisposition.ESCALATE_FOR_SEMANTIC_ADAPTER,
                    "Portable PDF byte authority detects this feature but CDG-2 object-level semantic projection is not yet implemented."));
        }
        for (String active : inspection.activeContent()) {
            unknownIndex++;
            unknown.add(new CanonicalDocumentGraphV2.UnknownNativeFeature(
                    CanonicalDocumentGraphV2.stableObjectId("unknown", "PDF|ACTIVE|" + active + "|" + unknownIndex),
                    "<artifact>",
                    "PDF_ACTIVE_CONTENT_" + active.toUpperCase(Locale.ROOT),
                    sourceSha,
                    CanonicalDocumentGraphV2.UnknownDisposition.BLOCK_IF_TARGETED,
                    "Active PDF content is inventoried but never executed by the portable foundation."));
        }
        return new CanonicalDocumentGraphV2(
                CanonicalDocumentGraphV2.SCHEMA_V2,
                format,
                sourceSha,
                CanonicalDocumentGraphV2.Kind.FIXED_LAYOUT,
                elements,
                List.of(),
                List.of(),
                unknown,
                List.of(new CanonicalDocumentGraph.NativePart("<artifact>", sourceSha, true)),
                Map.of(
                        "projector", "CanonicalDocumentGraphV2Projector",
                        "projectionSlice", "PDF_STRUCTURAL_001",
                        "pdf.version", inspection.version(),
                        "pdf.indirectObjects", Integer.toString(inspection.indirectObjects())));
    }

    private CanonicalDocumentGraphV2 projectText(DocumentFormat format, byte[] bytes) throws IOException {
        String sourceSha = CanonicalDocumentGraph.sha256(bytes);
        ArrayList<CanonicalDocumentGraphV2.Element> elements = new ArrayList<>();
        CanonicalDocumentGraphV2.NativeAnchor rootAnchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "root", "", "");
        String rootId = CanonicalDocumentGraphV2.stableElementId(format, CanonicalDocumentGraphV2.ElementType.ROOT, rootAnchor);
        elements.add(element(format, CanonicalDocumentGraphV2.ElementType.ROOT, null, 0, "", rootAnchor,
                new CanonicalDocumentGraphV2.SemanticState("document", "", Map.of("format", format.name())),
                CanonicalDocumentGraphV2.StyleState.empty(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of()));
        List<String> blocks = semanticBlocks(text.toPlainText(format, bytes));
        for (int i = 0; i < blocks.size(); i++) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "text-block:" + (i + 1), "", "");
            elements.add(element(format, CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK, rootId, i, blocks.get(i), anchor,
                    new CanonicalDocumentGraphV2.SemanticState("text-block", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("text", "", "", Integer.toString(i), Map.of()),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        return new CanonicalDocumentGraphV2(
                CanonicalDocumentGraphV2.SCHEMA_V2,
                format,
                sourceSha,
                CanonicalDocumentGraphV2.Kind.TEXT_DOCUMENT,
                elements,
                List.of(),
                List.of(),
                List.of(),
                List.of(new CanonicalDocumentGraph.NativePart("<artifact>", sourceSha, true)),
                Map.of("projector", "CanonicalDocumentGraphV2Projector", "projectionSlice", "TEXT_001"));
    }

    private static void projectWordNumbering(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        byte[] bytes = parts.get("word/numbering.xml");
        if (bytes == null) return;
        b.representedParts.add("word/numbering.xml");
        Document document = OoxmlPackageSupport.parseXml(bytes);
        LinkedHashMap<String, Element> abstractById = new LinkedHashMap<>();
        for (Element abstractNum : directChildren(document.getDocumentElement(), W, "abstractNum")) {
            String id = attributeValue(abstractNum, W, "abstractNumId");
            if (!id.isBlank()) abstractById.put(id, abstractNum);
        }
        for (Element num : directChildren(document.getDocumentElement(), W, "num")) {
            String numId = attributeValue(num, W, "numId");
            String abstractId = attributeValue(firstDirect(num, W, "abstractNumId"), W, "val");
            Element abstractNum = abstractById.get(abstractId);
            if (numId.isBlank() || abstractNum == null) continue;
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.put("numId", numId);
            properties.put("abstractNumId", abstractId);
            int levelCount = 0;
            boolean bullet = false;
            for (Element level : directChildren(abstractNum, W, "lvl")) {
                String ilvl = attributeValue(level, W, "ilvl");
                String prefix = "level." + (ilvl.isBlank() ? Integer.toString(levelCount) : ilvl) + ".";
                String format = attributeValue(firstDirect(level, W, "numFmt"), W, "val");
                String levelText = attributeValue(firstDirect(level, W, "lvlText"), W, "val");
                String start = attributeValue(firstDirect(level, W, "start"), W, "val");
                String suffix = attributeValue(firstDirect(level, W, "suff"), W, "val");
                Element ind = firstDirect(firstDirect(level, W, "pPr"), W, "ind");
                properties.put(prefix + "format", format);
                properties.put(prefix + "text", levelText);
                if (!start.isBlank()) properties.put(prefix + "start", start);
                if (!suffix.isBlank()) properties.put(prefix + "suffix", suffix);
                if (ind != null) {
                    String left = attributeValue(ind, W, "left");
                    String hanging = attributeValue(ind, W, "hanging");
                    if (!left.isBlank()) properties.put(prefix + "leftTwips", left);
                    if (!hanging.isBlank()) properties.put(prefix + "hangingTwips", hanging);
                }
                bullet |= "bullet".equals(format);
                levelCount++;
            }
            properties.put("levelCount", Integer.toString(levelCount));
            String kind = levelCount > 1 ? "multilevel" : (bullet ? "bullet" : "numbered");
            properties.put("kind", kind);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/numbering.xml", "num:" + numId, numId, "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.LIST,
                    b.rootId,
                    60_000 + safeOrdinal(numId),
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("list-definition", "", properties),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("word-numbering", properties, List.of()),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("list", "", "", "num:" + numId, Map.of("kind", kind)),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static Map<String, String> wordParagraphSemantics(Element paragraph) {
        Element pPr = firstDirect(paragraph, W, "pPr");
        if (pPr == null) return Map.of();
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        Element tabs = firstDirect(pPr, W, "tabs");
        if (tabs != null) {
            int i = 0;
            for (Element tab : directChildren(tabs, W, "tab")) {
                i++;
                String prefix = "tabs." + i + ".";
                out.put(prefix + "positionTwips", attributeValue(tab, W, "pos"));
                out.put(prefix + "alignment", attributeValue(tab, W, "val"));
                String leader = attributeValue(tab, W, "leader");
                if (!leader.isBlank()) out.put(prefix + "leader", leader);
            }
            out.put("tabs.count", Integer.toString(i));
        }
        Element ind = firstDirect(pPr, W, "ind");
        addAttr(out, "indent.leftTwips", ind, "left");
        addAttr(out, "indent.rightTwips", ind, "right");
        addAttr(out, "indent.firstLineTwips", ind, "firstLine");
        addAttr(out, "indent.hangingTwips", ind, "hanging");
        Element spacing = firstDirect(pPr, W, "spacing");
        addAttr(out, "lineSpacing.lineTwips", spacing, "line");
        addAttr(out, "lineSpacing.rule", spacing, "lineRule");
        addAttr(out, "paragraphSpacing.beforeTwips", spacing, "before");
        addAttr(out, "paragraphSpacing.afterTwips", spacing, "after");
        addAttr(out, "paragraphSpacing.beforeAuto", spacing, "beforeAutospacing");
        addAttr(out, "paragraphSpacing.afterAuto", spacing, "afterAutospacing");
        addOnOff(out, "paragraphSpacing.contextual", firstDirect(pPr, W, "contextualSpacing"));
        addOnOff(out, "pagination.widowControl", firstDirect(pPr, W, "widowControl"));
        addOnOff(out, "pagination.keepNext", firstDirect(pPr, W, "keepNext"));
        addOnOff(out, "pagination.keepLines", firstDirect(pPr, W, "keepLines"));
        Element borders = firstDirect(pPr, W, "pBdr");
        for (String edge : List.of("top", "right", "bottom", "left", "between", "bar")) {
            Element border = firstDirect(borders, W, edge);
            addAttr(out, "border." + edge + ".style", border, "val");
            addAttr(out, "border." + edge + ".sizeEighthPoints", border, "sz");
            addAttr(out, "border." + edge + ".spacePoints", border, "space");
            addAttr(out, "border." + edge + ".color", border, "color");
        }
        Element shading = firstDirect(pPr, W, "shd");
        addAttr(out, "shading.pattern", shading, "val");
        addAttr(out, "shading.fill", shading, "fill");
        addAttr(out, "shading.color", shading, "color");
        Element numPr = firstDirect(pPr, W, "numPr");
        addVal(out, "list.numId", firstDirect(numPr, W, "numId"));
        addVal(out, "list.level", firstDirect(numPr, W, "ilvl"));
        return Map.copyOf(out);
    }

    private static void addAttr(Map<String, String> out, String key, Element element, String attr) {
        String value = attributeValue(element, W, attr);
        if (!value.isBlank()) out.put(key, value);
    }

    private static void addVal(Map<String, String> out, String key, Element element) {
        addAttr(out, key, element, "val");
    }

    private static void addOnOff(Map<String, String> out, String key, Element element) {
        if (element == null) return;
        String value = attributeValue(element, W, "val");
        out.put(key, value.isBlank() ? "true" : Boolean.toString(truthyOnOff(value)));
    }

    private static int safeOrdinal(String value) {
        try { return Math.max(0, Math.min(900_000, Integer.parseInt(value))); }
        catch (NumberFormatException exception) { return Math.floorMod(value.hashCode(), 900_000); }
    }

    private static void projectWordParagraph(
            Element paragraph,
            ProjectionBuilder b,
            String parentId,
            int ordinal,
            String locator,
            Map<String, StyleDef> styles,
            RelationshipIndex relationships,
            String nativePart) {
        String styleId = attributeValue(firstDirect(firstDirect(paragraph, W, "pPr"), W, "pStyle"), W, "val");
        StyleResolution style = resolveStyle(styleId, styles, directProperties(firstDirect(paragraph, W, "pPr")));
        String text = textContent(paragraph, W, "t");
        List<String> comments = attributeValues(paragraph, W, "commentRangeStart", W, "id");
        List<String> revisions = revisionIds(paragraph);
        String language = firstLanguage(paragraph);
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator, "", "");
        Map<String, String> paragraphSemantics = wordParagraphSemantics(paragraph);
        String paragraphRole = styleId.toLowerCase(Locale.ROOT).startsWith("heading")
                ? "heading"
                : "Caption".equalsIgnoreCase(styleId) ? "caption" : "paragraph";
        CanonicalDocumentGraphV2.Element para = element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.PARAGRAPH,
                parentId,
                ordinal,
                text,
                anchor,
                new CanonicalDocumentGraphV2.SemanticState(paragraphRole, language, paragraphSemantics),
                style.toState(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                new CanonicalDocumentGraphV2.AccessibilityState(paragraphRole, "", "", locator, Map.of()),
                new CanonicalDocumentGraphV2.ReviewState(comments, revisions, Map.of()),
                List.of(),
                Map.of());
        b.elements.add(para);
        projectWordBookmarks(paragraph, b, para.id(), locator, nativePart);
        if (paragraphSemantics.containsKey("list.numId")) {
            Map<String, String> listProps = new LinkedHashMap<>();
            listProps.put("numId", paragraphSemantics.get("list.numId"));
            listProps.put("level", paragraphSemantics.getOrDefault("list.level", "0"));
            CanonicalDocumentGraphV2.NativeAnchor listItemAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/pPr:1/numPr:1", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.LIST_ITEM,
                    para.id(),
                    60_000,
                    text,
                    listItemAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("list-item", language, listProps),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("list-item", listProps, List.of()),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("listitem", "", "", locator, listProps),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        int runOrdinal = 0;
        int hyperlinkOrdinal = 0;
        int fieldOrdinal = 0;
        for (Element child : childElements(paragraph)) {
            if (W.equals(child.getNamespaceURI()) && "r".equals(child.getLocalName())) {
                projectWordRun(child, b, para.id(), runOrdinal++, locator + "/r:" + runOrdinal, styles, nativePart);
            } else if (W.equals(child.getNamespaceURI()) && "hyperlink".equals(child.getLocalName())) {
                hyperlinkOrdinal++;
                String relId = child.getAttributeNS(R, "id");
                String anchorTarget = child.getAttributeNS(W, "anchor");
                String target = !anchorTarget.isBlank() ? "#" + anchorTarget : relationships.target(nativePart, relId);
                CanonicalDocumentGraphV2.NativeAnchor linkAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/hyperlink:" + hyperlinkOrdinal, "", relId);
                CanonicalDocumentGraphV2.Element linkElement = element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.HYPERLINK,
                        para.id(),
                        runOrdinal + hyperlinkOrdinal,
                        textContent(child, W, "t"),
                        linkAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("hyperlink", "", Map.of()),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        new CanonicalDocumentGraphV2.BehaviorState(List.of("HYPERLINK"), target.isBlank() ? Map.of() : Map.of("target", target)),
                        new CanonicalDocumentGraphV2.AccessibilityState("hyperlink", "", "", linkAnchor.locator(), target.isBlank() ? Map.of() : Map.of("target", target)),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of());
                b.elements.add(linkElement);
                int nested = 0;
                for (Element run : directChildren(child, W, "r")) {
                    nested++;
                    projectWordRun(run, b, linkElement.id(), runOrdinal++, locator + "/hyperlink:" + hyperlinkOrdinal + "/r:" + nested, styles, nativePart);
                }
            } else if (W.equals(child.getNamespaceURI()) && "fldSimple".equals(child.getLocalName())) {
                fieldOrdinal++;
                String instruction = child.getAttributeNS(W, "instr").strip();
                String fieldRole = instruction.toUpperCase(Locale.ROOT).startsWith("REF ") ? "cross-reference" : "simple-field";
                CanonicalDocumentGraphV2.NativeAnchor fieldAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/simple-field:" + fieldOrdinal, "", "");
                CanonicalDocumentGraphV2.Element fieldElement = element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.FIELD,
                        para.id(),
                        runOrdinal + hyperlinkOrdinal + fieldOrdinal,
                        instruction,
                        fieldAnchor,
                        new CanonicalDocumentGraphV2.SemanticState(fieldRole, "", instruction.toUpperCase(Locale.ROOT).startsWith("REF ") ? Map.of("bookmark", refBookmarkName(instruction)) : Map.of()),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        new CanonicalDocumentGraphV2.DataState("field-code", Map.of("fieldKind", fieldRole), instruction.isBlank() ? List.of() : List.of(instruction)),
                        new CanonicalDocumentGraphV2.BehaviorState(List.of("FIELD"), instruction.isBlank() ? Map.of() : Map.of("instruction", instruction)),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of());
                b.elements.add(fieldElement);
                int nested = 0;
                for (Element run : directChildren(child, W, "r")) {
                    nested++;
                    projectWordRun(run, b, fieldElement.id(), runOrdinal++, locator + "/simple-field:" + fieldOrdinal + "/r:" + nested, styles, nativePart);
                }
            } else if (W.equals(child.getNamespaceURI()) && isRevisionElement(child.getLocalName())) {
                String revisionId = child.getAttributeNS(W, "id");
                String revisionLocator = locator + "/revision:" + child.getLocalName() + ":" + (revisionId.isBlank() ? Integer.toString(runOrdinal + 1) : revisionId);
                CanonicalDocumentGraphV2.NativeAnchor revisionAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, revisionLocator, revisionId, "");
                CanonicalDocumentGraphV2.Element revisionElement = element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.REVISION,
                        para.id(),
                        40_000 + runOrdinal,
                        textContent(child, W, "t"),
                        revisionAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("revision", "", Map.of("revisionType", child.getLocalName())),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        CanonicalDocumentGraphV2.BehaviorState.empty(),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        new CanonicalDocumentGraphV2.ReviewState(List.of(), List.of(child.getLocalName() + ":" + revisionId), Map.of("author", child.getAttributeNS(W, "author"), "date", child.getAttributeNS(W, "date"))),
                        List.of(),
                        Map.of());
                b.elements.add(revisionElement);
                int nested = 0;
                for (Element run : directChildren(child, W, "r")) {
                    nested++;
                    projectWordRun(run, b, revisionElement.id(), runOrdinal++, revisionLocator + "/r:" + nested, styles, nativePart);
                }
            }
        }
        NodeList instr = paragraph.getElementsByTagNameNS(W, "instrText");
        for (int i = 0; i < instr.getLength(); i++) {
            fieldOrdinal++;
            String fieldText = Objects.requireNonNullElse(instr.item(i).getTextContent(), "").strip();
            if (!fieldText.isBlank()) {
                CanonicalDocumentGraphV2.NativeAnchor fieldAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/field:" + fieldOrdinal, "", "");
                b.elements.add(element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.FIELD,
                        para.id(),
                        runOrdinal + hyperlinkOrdinal + fieldOrdinal,
                        fieldText,
                        fieldAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("field", "", Map.of()),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        new CanonicalDocumentGraphV2.DataState("field-code", Map.of(), List.of(fieldText)),
                        new CanonicalDocumentGraphV2.BehaviorState(List.of("FIELD"), Map.of("instruction", fieldText)),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of()));
            }
        }
        projectWordComplexFields(paragraph, b, para.id(), locator, nativePart);
        Element paragraphSection = firstDirect(firstDirect(paragraph, W, "pPr"), W, "sectPr");
        if (paragraphSection != null) {
            projectWordSection(paragraphSection, b, para.id(), 50_000, locator + "/pPr:1/sectPr:1", nativePart);
        }
        projectWordDrawings(paragraph, b, para.id(), locator, relationships, nativePart);
        projectWordEquations(paragraph, b, para.id(), locator, nativePart);
    }

    private static void projectWordRun(
            Element run,
            ProjectionBuilder b,
            String parentId,
            int ordinal,
            String locator,
            Map<String, StyleDef> styles,
            String nativePart) {
        String styleId = attributeValue(firstDirect(firstDirect(run, W, "rPr"), W, "rStyle"), W, "val");
        StyleResolution style = resolveStyle(styleId, styles, directProperties(firstDirect(run, W, "rPr")));
        String text = textContent(run, W, "t");
        if (text.isBlank() && run.getElementsByTagNameNS(W, "tab").getLength() > 0) {
            text = "\t";
        }
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator, "", "");
        CanonicalDocumentGraphV2.Element runElement = element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.RUN,
                parentId,
                ordinal,
                text,
                anchor,
                new CanonicalDocumentGraphV2.SemanticState("run", firstLanguage(run), Map.of()),
                style.toState(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                new CanonicalDocumentGraphV2.ReviewState(List.of(), revisionIds(run), Map.of()),
                List.of(),
                Map.of());
        b.elements.add(runElement);
        int breakIndex = 0;
        for (Element child : childElements(run)) {
            if (W.equals(child.getNamespaceURI()) && "br".equals(child.getLocalName())) {
                breakIndex++;
                String breakType = attributeValue(child, W, "type");
                if (breakType.isBlank()) breakType = "textWrapping";
                CanonicalDocumentGraphV2.NativeAnchor breakAnchor = new CanonicalDocumentGraphV2.NativeAnchor(
                        nativePart, locator + "/br:" + breakIndex, "", "");
                b.elements.add(element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.BREAK,
                        runElement.id(),
                        breakIndex - 1,
                        "",
                        breakAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("break", "", Map.of("type", breakType)),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        new CanonicalDocumentGraphV2.BehaviorState(List.of("BREAK"), Map.of("type", breakType)),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of()));
            }
        }
    }

    private static void projectWordTable(
            Element table,
            ProjectionBuilder b,
            String parentId,
            int ordinal,
            String locator,
            Map<String, StyleDef> styles,
            RelationshipIndex relationships,
            String nativePart) {
        Element tblPr = firstDirect(table, W, "tblPr");
        LinkedHashMap<String, String> tableProperties = new LinkedHashMap<>();
        Element tableWidth = firstDirect(tblPr, W, "tblW");
        copyAttribute(tableWidth, W, "w", tableProperties, "width.value");
        copyAttribute(tableWidth, W, "type", tableProperties, "width.type");
        Element tableMargins = firstDirect(tblPr, W, "tblCellMar");
        for (String side : List.of("top", "right", "bottom", "left")) {
            Element edge = firstDirect(tableMargins, W, side);
            copyAttribute(edge, W, "w", tableProperties, "cellMargin." + side + "Twips");
        }
        Element tableBorders = firstDirect(tblPr, W, "tblBorders");
        for (String side : List.of("top", "right", "bottom", "left", "insideH", "insideV")) {
            Element edge = firstDirect(tableBorders, W, side);
            copyAttribute(edge, W, "val", tableProperties, "border." + side + ".style");
            copyAttribute(edge, W, "sz", tableProperties, "border." + side + ".sizeEighthPoints");
            copyAttribute(edge, W, "space", tableProperties, "border." + side + ".spacePoints");
            copyAttribute(edge, W, "color", tableProperties, "border." + side + ".colorHex");
        }
        Element tableShading = firstDirect(tblPr, W, "shd");
        copyAttribute(tableShading, W, "val", tableProperties, "shading.pattern");
        copyAttribute(tableShading, W, "fill", tableProperties, "shading.fillHex");
        copyAttribute(tableShading, W, "color", tableProperties, "shading.colorHex");

        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator, "", "");
        CanonicalDocumentGraphV2.Element tableElement = element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.TABLE,
                parentId,
                ordinal,
                "",
                anchor,
                new CanonicalDocumentGraphV2.SemanticState("table", "", Map.copyOf(tableProperties)),
                resolveStyle(attributeValue(firstDirect(tblPr, W, "tblStyle"), W, "val"), styles, directProperties(tblPr)).toState(),
                new CanonicalDocumentGraphV2.GeometryState("DOCX_TWIPS", "", "", tableProperties.getOrDefault("width.value", ""), "", "", ordinal, Map.copyOf(tableProperties)),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                new CanonicalDocumentGraphV2.AccessibilityState("table", "", "", locator, Map.of()),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of());
        b.elements.add(tableElement);
        int rowIndex = 0;
        for (Element row : directChildren(table, W, "tr")) {
            rowIndex++;
            Element trPr = firstDirect(row, W, "trPr");
            Element tableHeader = firstDirect(trPr, W, "tblHeader");
            boolean headerRow = tableHeader != null && truthyOnOff(attributeValue(tableHeader, W, "val"));
            LinkedHashMap<String, String> rowProperties = new LinkedHashMap<>();
            Element height = firstDirect(trPr, W, "trHeight");
            copyAttribute(height, W, "val", rowProperties, "heightTwips");
            copyAttribute(height, W, "hRule", rowProperties, "heightRule");
            rowProperties.put("repeatHeader", Boolean.toString(headerRow));
            String rowLocator = locator + "/tr:" + rowIndex;
            CanonicalDocumentGraphV2.NativeAnchor rowAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, rowLocator, "", "");
            CanonicalDocumentGraphV2.Element rowElement = element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.TABLE_ROW,
                    tableElement.id(),
                    rowIndex - 1,
                    "",
                    rowAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("table-row", "", Map.copyOf(rowProperties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("row", "", "", rowLocator, Map.of("headerRow", Boolean.toString(headerRow))),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of());
            b.elements.add(rowElement);
            int cellIndex = 0;
            for (Element cell : directChildren(row, W, "tc")) {
                cellIndex++;
                String cellLocator = rowLocator + "/tc:" + cellIndex;
                Element tcPr = firstDirect(cell, W, "tcPr");
                LinkedHashMap<String, String> cellProperties = new LinkedHashMap<>();
                Element span = firstDirect(tcPr, W, "gridSpan");
                String spanValue = attributeValue(span, W, "val");
                cellProperties.put("gridSpan", spanValue.isBlank() ? "1" : spanValue);
                Element vMerge = firstDirect(tcPr, W, "vMerge");
                if (vMerge != null) {
                    String value = attributeValue(vMerge, W, "val");
                    cellProperties.put("verticalMerge", value.isBlank() ? "continue" : value);
                }
                copyAttribute(firstDirect(tcPr, W, "vAlign"), W, "val", cellProperties, "verticalAlignment");
                Element tcMargins = firstDirect(tcPr, W, "tcMar");
                for (String side : List.of("top", "right", "bottom", "left")) {
                    Element edge = firstDirect(tcMargins, W, side);
                    copyAttribute(edge, W, "w", cellProperties, "margin." + side + "Twips");
                }
                int nestedCount = directChildren(cell, W, "tbl").size();
                cellProperties.put("nestedTableCount", Integer.toString(nestedCount));
                CanonicalDocumentGraphV2.NativeAnchor cellAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, cellLocator, "", "");
                CanonicalDocumentGraphV2.Element cellElement = element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.TABLE_CELL,
                        rowElement.id(),
                        cellIndex - 1,
                        textContent(cell, W, "t"),
                        cellAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("table-cell", "", Map.copyOf(cellProperties)),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        CanonicalDocumentGraphV2.BehaviorState.empty(),
                        new CanonicalDocumentGraphV2.AccessibilityState(headerRow ? "column-header" : "cell", "", "", cellLocator, Map.of("headerCell", Boolean.toString(headerRow))),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of());
                b.elements.add(cellElement);
                int childOrdinal = 0;
                int paragraphIndex = 0;
                int nestedTableIndex = 0;
                for (Element child : directElementChildren(cell)) {
                    if (W.equals(child.getNamespaceURI()) && "p".equals(child.getLocalName())) {
                        paragraphIndex++;
                        projectWordParagraph(child, b, cellElement.id(), childOrdinal++, cellLocator + "/p:" + paragraphIndex, styles, relationships, nativePart);
                    } else if (W.equals(child.getNamespaceURI()) && "tbl".equals(child.getLocalName())) {
                        nestedTableIndex++;
                        projectWordTable(child, b, cellElement.id(), childOrdinal++, cellLocator + "/tbl:" + nestedTableIndex, styles, relationships, nativePart);
                    }
                }
            }
        }
    }

    private static void projectWordSection(Element section, ProjectionBuilder b, String parentId, int ordinal, String locator, String nativePart) {
        Map<String, String> geometry = new LinkedHashMap<>();
        Map<String, String> semantics = new LinkedHashMap<>();
        Element pageSize = firstDirect(section, W, "pgSz");
        Element margins = firstDirect(section, W, "pgMar");
        copyAttribute(pageSize, W, "w", geometry, "pageWidthTwips");
        copyAttribute(pageSize, W, "h", geometry, "pageHeightTwips");
        copyAttribute(pageSize, W, "orient", geometry, "orientation");
        if (margins != null) {
            for (String key : List.of("top", "right", "bottom", "left", "header", "footer", "gutter")) {
                copyAttribute(margins, W, key, geometry, "margin." + key + "Twips");
            }
        }
        Element borders = firstDirect(section, W, "pgBorders");
        if (borders != null) {
            copyAttribute(borders, W, "offsetFrom", semantics, "pageBorder.offsetFrom");
            copyAttribute(borders, W, "display", semantics, "pageBorder.display");
            copyAttribute(borders, W, "zOrder", semantics, "pageBorder.zOrder");
            for (String side : List.of("top", "right", "bottom", "left")) {
                Element edge = firstDirect(borders, W, side);
                if (edge == null) continue;
                copyAttribute(edge, W, "val", semantics, "pageBorder." + side + ".style");
                copyAttribute(edge, W, "sz", semantics, "pageBorder." + side + ".sizeEighthPoints");
                copyAttribute(edge, W, "space", semantics, "pageBorder." + side + ".spacePoints");
                copyAttribute(edge, W, "color", semantics, "pageBorder." + side + ".colorHex");
            }
        }
        Element cols = firstDirect(section, W, "cols");
        if (cols != null) {
            copyAttribute(cols, W, "num", semantics, "columns.count");
            copyAttribute(cols, W, "space", semantics, "columns.spacingTwips");
            copyAttribute(cols, W, "sep", semantics, "columns.separator");
            copyAttribute(cols, W, "equalWidth", semantics, "columns.equalWidth");
            int colIndex = 0;
            for (Element col : directChildren(cols, W, "col")) {
                colIndex++;
                copyAttribute(col, W, "w", semantics, "columns." + colIndex + ".widthTwips");
                copyAttribute(col, W, "space", semantics, "columns." + colIndex + ".spaceTwips");
            }
        }
        Element line = firstDirect(section, W, "lnNumType");
        if (line != null) {
            copyAttribute(line, W, "countBy", semantics, "lineNumbering.countBy");
            copyAttribute(line, W, "start", semantics, "lineNumbering.start");
            copyAttribute(line, W, "distance", semantics, "lineNumbering.distanceTwips");
            copyAttribute(line, W, "restart", semantics, "lineNumbering.restart");
        }
        Element pageNumbering = firstDirect(section, W, "pgNumType");
        if (pageNumbering != null) {
            copyAttribute(pageNumbering, W, "start", semantics, "pageNumbering.start");
            copyAttribute(pageNumbering, W, "fmt", semantics, "pageNumbering.format");
            copyAttribute(pageNumbering, W, "chapStyle", semantics, "pageNumbering.chapterStyle");
            copyAttribute(pageNumbering, W, "chapSep", semantics, "pageNumbering.chapterSeparator");
        }
        Element sectionType = firstDirect(section, W, "type");
        if (sectionType != null) copyAttribute(sectionType, W, "val", semantics, "sectionBreak.type");
        if (firstDirect(section, W, "titlePg") != null) semantics.put("headerFooter.firstPageEnabled", "true");
        int headerIndex = 0;
        for (Element ref : directChildren(section, W, "headerReference")) {
            headerIndex++;
            semantics.put("headerRef." + headerIndex + ".variant", attributeValue(ref, W, "type"));
            semantics.put("headerRef." + headerIndex + ".relationshipId", ref.getAttributeNS(R, "id"));
        }
        int footerIndex = 0;
        for (Element ref : directChildren(section, W, "footerReference")) {
            footerIndex++;
            semantics.put("footerRef." + footerIndex + ".variant", attributeValue(ref, W, "type"));
            semantics.put("footerRef." + footerIndex + ".relationshipId", ref.getAttributeNS(R, "id"));
        }
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator, "", "");
        b.elements.add(element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.SECTION,
                parentId,
                ordinal,
                "",
                anchor,
                new CanonicalDocumentGraphV2.SemanticState("section", "", semantics),
                CanonicalDocumentGraphV2.StyleState.empty(),
                new CanonicalDocumentGraphV2.GeometryState("DOCX_TWIPS", "", "", geometry.getOrDefault("pageWidthTwips", ""), geometry.getOrDefault("pageHeightTwips", ""), "", ordinal, geometry),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of()));
    }

    private static void projectWordPageBackground(Document document, ProjectionBuilder b) {
        Element background = firstDirect(document.getDocumentElement(), W, "background");
        if (background == null) return;
        LinkedHashMap<String, String> properties = new LinkedHashMap<>();
        for (String key : List.of("color", "themeColor", "themeTint", "themeShade")) {
            copyAttribute(background, W, key, properties, key);
        }
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", "background:1", "", "");
        b.elements.add(element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.PAGE,
                b.rootId,
                49_000,
                "",
                anchor,
                new CanonicalDocumentGraphV2.SemanticState("page-background", "", properties),
                new CanonicalDocumentGraphV2.StyleState("", List.of(), properties, properties),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of()));
    }

    private static void projectWordDrawings(
            Element paragraph,
            ProjectionBuilder b,
            String parentId,
            String locator,
            RelationshipIndex relationships,
            String nativePart) {
        NodeList blips = paragraph.getElementsByTagNameNS(A, "blip");
        for (int i = 0; i < blips.getLength(); i++) {
            Element blip = (Element) blips.item(i);
            String relId = blip.getAttributeNS(R, "embed");
            String target = relationships.target(nativePart, relId);
            String assetId = b.assetIdByPart.getOrDefault(target, "");
            Element docPr = drawingPropertyFor(blip);
            if (docPr == null) {
                docPr = nearestDocumentProperty(paragraph, i);
            }
            String nativeId = docPr == null ? "" : docPr.getAttribute("id");
            String title = docPr == null ? "" : docPr.getAttribute("title");
            String alt = docPr == null ? "" : docPr.getAttribute("descr");
            boolean decorative = isDecorative(docPr);
            Element container = drawingContainerFor(blip);
            Element extent = container == null ? null : first(container.getElementsByTagNameNS(WP, "extent"));
            Map<String, String> g = new LinkedHashMap<>();
            if (extent != null) {
                g.put("cx", extent.getAttribute("cx"));
                g.put("cy", extent.getAttribute("cy"));
            }
            String placement = container == null ? "unknown" : container.getLocalName();
            g.put("placement", placement);
            if (container != null && "anchor".equals(placement)) {
                Element posH = first(container.getElementsByTagNameNS(WP, "positionH"));
                Element posV = first(container.getElementsByTagNameNS(WP, "positionV"));
                if (posH != null) {
                    g.put("horizontalRelativeFrom", posH.getAttribute("relativeFrom"));
                    Element offset = first(posH.getElementsByTagNameNS(WP, "posOffset"));
                    if (offset != null) g.put("xEmu", Objects.requireNonNullElse(offset.getTextContent(), ""));
                }
                if (posV != null) {
                    g.put("verticalRelativeFrom", posV.getAttribute("relativeFrom"));
                    Element offset = first(posV.getElementsByTagNameNS(WP, "posOffset"));
                    if (offset != null) g.put("yEmu", Objects.requireNonNullElse(offset.getTextContent(), ""));
                }
                for (String wrapLocal : List.of("wrapSquare", "wrapTight", "wrapThrough", "wrapTopAndBottom", "wrapNone")) {
                    if (first(container.getElementsByTagNameNS(WP, wrapLocal)) != null) { String value = wrapLocal.substring("wrap".length()); g.put("wrap", Character.toLowerCase(value.charAt(0)) + value.substring(1)); break; }
                }
            }
            Element srcRect = first(blip.getParentNode() instanceof Element parent ? parent.getElementsByTagNameNS(A, "srcRect") : null);
            Map<String, String> imageSemantic = new LinkedHashMap<>();
            imageSemantic.put("placement", placement);
            imageSemantic.put("mediaKind", target.toLowerCase(Locale.ROOT).endsWith(".svg") ? ((docPr != null && docPr.getAttribute("name").startsWith("Icon:")) ? "icon" : "svg") : "raster");
            if (srcRect != null) {
                imageSemantic.put("crop.left", srcRect.getAttribute("l"));
                imageSemantic.put("crop.top", srcRect.getAttribute("t"));
                imageSemantic.put("crop.right", srcRect.getAttribute("r"));
                imageSemantic.put("crop.bottom", srcRect.getAttribute("b"));
            }
            if (g.containsKey("wrap")) imageSemantic.put("wrap", g.get("wrap"));
            if (g.containsKey("horizontalRelativeFrom")) imageSemantic.put("horizontalRelativeFrom", g.get("horizontalRelativeFrom"));
            if (g.containsKey("verticalRelativeFrom")) imageSemantic.put("verticalRelativeFrom", g.get("verticalRelativeFrom"));
            if (g.containsKey("xEmu")) imageSemantic.put("xEmu", g.get("xEmu"));
            if (g.containsKey("yEmu")) imageSemantic.put("yEmu", g.get("yEmu"));
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/drawing-image:" + (i + 1), nativeId, relId);
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.IMAGE,
                    parentId,
                    10_000 + i,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("image", "", Map.copyOf(imageSemantic)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    new CanonicalDocumentGraphV2.GeometryState("OOXML_EMU", "", "", g.getOrDefault("cx", ""), g.getOrDefault("cy", ""), "", i, g),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("image", title, alt, locator + "/drawing-image:" + (i + 1), Map.of("decorative", Boolean.toString(decorative))),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    assetId.isBlank() ? List.of() : List.of(assetId),
                    target.isBlank() ? Map.of() : Map.of("targetPart", target)));
        }
        NodeList shapes = paragraph.getElementsByTagNameNS(WPS, "wsp");
        int shapeOrdinal = 0;
        for (int i = 0; i < shapes.getLength(); i++) {
            Element shape = (Element) shapes.item(i);
            if (hasAncestor(shape, WPG, "wgp")) continue;
            shapeOrdinal++;
            Element cNv = first(shape.getElementsByTagNameNS(WPS, "cNvSpPr"));
            boolean textBox = cNv != null && ("1".equals(cNv.getAttribute("txBox")) || "true".equalsIgnoreCase(cNv.getAttribute("txBox")));
            Element geom = first(shape.getElementsByTagNameNS(A, "prstGeom"));
            Element warp = first(shape.getElementsByTagNameNS(A, "prstTxWarp"));
            Element fill = first(shape.getElementsByTagNameNS(A, "solidFill"));
            String fillHex = fill == null ? "" : attributeValue(first(fill.getElementsByTagNameNS(A, "srgbClr")), "", "val");
            Element line = first(shape.getElementsByTagNameNS(A, "ln"));
            String lineHex = line == null ? "" : attributeValue(first(line.getElementsByTagNameNS(A, "srgbClr")), "", "val");
            Element ext = first(shape.getElementsByTagNameNS(A, "ext"));
            Map<String, String> shapeProps = new LinkedHashMap<>();
            shapeProps.put("preset", geom == null ? "" : geom.getAttribute("prst"));
            shapeProps.put("fillHex", fillHex); shapeProps.put("lineHex", lineHex);
            shapeProps.put("textBox", Boolean.toString(textBox));
            shapeProps.put("wordArtPreset", warp == null ? "" : warp.getAttribute("prst"));
            CanonicalDocumentGraphV2.NativeAnchor shapeAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/drawing-shape:" + shapeOrdinal, "", "");
            CanonicalDocumentGraphV2.ElementType shapeType = textBox ? CanonicalDocumentGraphV2.ElementType.TEXT_FRAME : CanonicalDocumentGraphV2.ElementType.SHAPE;
            b.elements.add(element(b.format, shapeType, parentId, 15_000 + shapeOrdinal, textContent(shape, W, "t"), shapeAnchor,
                    new CanonicalDocumentGraphV2.SemanticState(warp == null ? (textBox ? "text-box" : "shape") : "wordart", "", Map.copyOf(shapeProps)),
                    new CanonicalDocumentGraphV2.StyleState("", List.of(), Map.copyOf(shapeProps), Map.copyOf(shapeProps)),
                    new CanonicalDocumentGraphV2.GeometryState("OOXML_EMU", "0", "0", ext == null ? "" : ext.getAttribute("cx"), ext == null ? "" : ext.getAttribute("cy"), "", shapeOrdinal, Map.of()),
                    CanonicalDocumentGraphV2.DataState.empty(), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        NodeList groups = paragraph.getElementsByTagNameNS(WPG, "wgp");
        for (int i = 0; i < groups.getLength(); i++) {
            Element group = (Element) groups.item(i); Element ext = first(group.getElementsByTagNameNS(A, "ext"));
            CanonicalDocumentGraphV2.NativeAnchor groupAnchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/drawing-group:" + (i + 1), "", "");
            b.elements.add(element(b.format, CanonicalDocumentGraphV2.ElementType.DIAGRAM, parentId, 18_000 + i, "", groupAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("drawing-group", "", Map.of("childCount", Integer.toString(group.getElementsByTagNameNS(WPS, "wsp").getLength()))),
                    CanonicalDocumentGraphV2.StyleState.empty(), new CanonicalDocumentGraphV2.GeometryState("OOXML_EMU", "0", "0", ext == null ? "" : ext.getAttribute("cx"), ext == null ? "" : ext.getAttribute("cy"), "", i, Map.of()),
                    CanonicalDocumentGraphV2.DataState.empty(), CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
        NodeList charts = paragraph.getElementsByTagNameNS(C, "chart");
        for (int i = 0; i < charts.getLength(); i++) {
            Element chart = (Element) charts.item(i);
            String relId = chart.getAttributeNS(R, "id");
            String target = relationships.target(nativePart, relId);
            Element docPr = drawingPropertyFor(chart);
            String nativeId = docPr == null ? "" : docPr.getAttribute("id");
            String title = docPr == null ? "" : docPr.getAttribute("title");
            String alt = docPr == null ? "" : docPr.getAttribute("descr");
            boolean decorative = isDecorative(docPr);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/chart:" + (i + 1), nativeId, relId);
            Map<String, String> chartProperties = new LinkedHashMap<>();
            chartProperties.put("chartPart", target);
            List<String> chartRows = new ArrayList<>();
            if (!target.isBlank() && b.parts.containsKey(target)) {
                try {
                    Document chartDocument = OoxmlPackageSupport.parseXml(b.parts.get(target));
                    String chartType = first(chartDocument.getElementsByTagNameNS(C, "lineChart")) != null ? "line" : first(chartDocument.getElementsByTagNameNS(C, "pieChart")) != null ? "pie" : "bar";
                    chartProperties.put("type", chartType);
                    Element chartTitle = first(chartDocument.getElementsByTagNameNS(C, "title"));
                    if (chartTitle != null) chartProperties.put("title", textContent(chartTitle, A, "t"));
                    Element catAx = first(chartDocument.getElementsByTagNameNS(C, "catAx"));
                    Element valAx = first(chartDocument.getElementsByTagNameNS(C, "valAx"));
                    if (catAx != null) chartProperties.put("categoryAxisTitle", directChildTitle(catAx));
                    if (valAx != null) chartProperties.put("valueAxisTitle", directChildTitle(valAx));
                    Element legend = first(chartDocument.getElementsByTagNameNS(C, "legend"));
                    chartProperties.put("showLegend", Boolean.toString(legend != null));
                    if (legend != null) { Element legendPos = first(legend.getElementsByTagNameNS(C, "legendPos")); if (legendPos != null) chartProperties.put("legendPosition", legendPos.getAttribute("val")); }
                    chartProperties.put("showDataLabels", Boolean.toString(chartDocument.getElementsByTagNameNS(C, "dLbls").getLength() > 0));
                    Element externalData = first(chartDocument.getElementsByTagNameNS(C, "externalData"));
                    if (externalData != null) {
                        String workbookRid = externalData.getAttributeNS(R, "id");
                        String workbookPart = relationships.target(target, workbookRid);
                        if (!workbookPart.isBlank() && b.parts.containsKey(workbookPart)) {
                            chartProperties.put("workbookPart", workbookPart);
                            chartProperties.put("workbookSha256", OoxmlPackageSupport.sha256(b.parts.get(workbookPart)));
                            chartRows.addAll(projectWorkbookRows(b.parts.get(workbookPart)));
                            b.representedParts.add(workbookPart);
                        }
                    }
                    Element plot = first(chartDocument.getElementsByTagNameNS(C, chartType + "Chart"));
                    if (plot != null) {
                        NodeList seriesNodes = plot.getElementsByTagNameNS(C, "ser");
                        chartProperties.put("seriesCount", Integer.toString(seriesNodes.getLength()));
                        for (int si = 0; si < seriesNodes.getLength(); si++) {
                            Element series = (Element) seriesNodes.item(si);
                            String seriesName = textContent(first(series.getElementsByTagNameNS(C, "tx")), C, "v");
                            Element cat = first(series.getElementsByTagNameNS(C, "cat"));
                            Element val = first(series.getElementsByTagNameNS(C, "val"));
                            NodeList catPoints = cat == null ? null : cat.getElementsByTagNameNS(C, "pt");
                            NodeList valPoints = val == null ? null : val.getElementsByTagNameNS(C, "pt");
                            int pointCount = Math.min(catPoints == null ? 0 : catPoints.getLength(), valPoints == null ? 0 : valPoints.getLength());
                            for (int pi = 0; pi < pointCount; pi++) {
                                chartRows.add(seriesName + "\t" + textContent((Element) catPoints.item(pi), C, "v") + "\t" + textContent((Element) valPoints.item(pi), C, "v"));
                            }
                        }
                    }
                    b.representedParts.add(target);
                } catch (IOException ignored) {
                    chartProperties.put("parseStatus", "INVALID_OR_UNSUPPORTED_CHART_PART");
                }
            }
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.CHART,
                    parentId,
                    20_000 + i,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("chart", "", Map.copyOf(chartProperties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("chart-series-data", Map.copyOf(chartProperties), List.copyOf(chartRows)),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("chart", title, alt, locator + "/chart:" + (i + 1), Map.of("decorative", Boolean.toString(decorative))),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectWordEquations(Element paragraph, ProjectionBuilder b, String parentId, String locator, String nativePart) {
        NodeList equations = paragraph.getElementsByTagNameNS(M, "oMath");
        for (int i = 0; i < equations.getLength(); i++) {
            Element equation = (Element) equations.item(i);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/equation:" + (i + 1), "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.EQUATION,
                    parentId,
                    30_000 + i,
                    Objects.requireNonNullElse(equation.getTextContent(), ""),
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("equation", "", Map.of("native", "OMML")),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("OMML", Map.of(), List.of()),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectWordBookmarks(Element paragraph, ProjectionBuilder b, String parentId, String locator, String nativePart) {
        NodeList starts = paragraph.getElementsByTagNameNS(W, "bookmarkStart");
        for (int i = 0; i < starts.getLength(); i++) {
            Element start = (Element) starts.item(i);
            String id = start.getAttributeNS(W, "id");
            String name = start.getAttributeNS(W, "name");
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/bookmark:" + (i + 1), id, "");
            b.elements.add(element(
                    b.format, CanonicalDocumentGraphV2.ElementType.METADATA, parentId, 35_000 + i, name, anchor,
                    new CanonicalDocumentGraphV2.SemanticState("bookmark", "", Map.of("id", id, "name", name)),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("bookmark", Map.of("id", id, "name", name), List.of()),
                    CanonicalDocumentGraphV2.BehaviorState.empty(), CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
        }
    }

    private static void projectWordComplexFields(Element paragraph, ProjectionBuilder b, String parentId, String locator, String nativePart) {
        List<Element> runs = directChildren(paragraph, W, "r");
        int ordinal = 0;
        for (int i = 0; i < runs.size(); i++) {
            if (!fieldCharType(runs.get(i), "begin")) continue;
            ordinal++;
            StringBuilder instruction = new StringBuilder();
            StringBuilder result = new StringBuilder();
            boolean separated = false;
            int end = -1;
            for (int j = i + 1; j < runs.size(); j++) {
                Element run = runs.get(j);
                if (fieldCharType(run, "separate")) { separated = true; continue; }
                if (fieldCharType(run, "end")) { end = j; break; }
                if (separated) result.append(textContent(run, W, "t")); else instruction.append(textContent(run, W, "instrText"));
            }
            if (end < 0) continue;
            String code = instruction.toString().strip();
            String role = code.toUpperCase(Locale.ROOT).startsWith("REF ") ? "cross-reference" : "complex-field";
            Map<String, String> props = code.toUpperCase(Locale.ROOT).startsWith("REF ") ? Map.of("bookmark", refBookmarkName(code)) : Map.of();
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(nativePart, locator + "/complex-field:" + ordinal, "", "");
            b.elements.add(element(
                    b.format, CanonicalDocumentGraphV2.ElementType.FIELD, parentId, 36_000 + ordinal,
                    result.toString(), anchor, new CanonicalDocumentGraphV2.SemanticState(role, "", props),
                    CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("field-code", Map.of("fieldKind", role), code.isBlank() ? List.of() : List.of(code, result.toString())),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("FIELD"), code.isBlank() ? Map.of() : Map.of("instruction", code)),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(), CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
            i = end;
        }
    }

    private static boolean fieldCharType(Element run, String type) {
        Element field = first(run.getElementsByTagNameNS(W, "fldChar"));
        return field != null && type.equals(field.getAttributeNS(W, "fldCharType"));
    }

    private static String refBookmarkName(String instruction) {
        String[] fields = instruction.strip().split("\\s+");
        return fields.length >= 2 ? fields[1] : "";
    }

    private static String directChildTitle(Element parent) {
        if (parent == null) return "";
        for (Element child : childElements(parent)) if (C.equals(child.getNamespaceURI()) && "title".equals(child.getLocalName())) return textContent(child, A, "t");
        return "";
    }

    private static List<String> projectWorkbookRows(byte[] workbookBytes) {
        try {
            Map<String, byte[]> workbook = OoxmlPackageSupport.read(workbookBytes);
            byte[] sheetBytes = workbook.get("xl/worksheets/sheet1.xml");
            if (sheetBytes == null) return List.of();
            Document sheet = OoxmlPackageSupport.parseXml(sheetBytes);
            String spreadsheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
            ArrayList<String> rowsOut = new ArrayList<>();
            NodeList rows = sheet.getElementsByTagNameNS(spreadsheetNs, "row");
            for (int i = 1; i < rows.getLength(); i++) {
                Element row = (Element) rows.item(i);
                NodeList cells = row.getElementsByTagNameNS(spreadsheetNs, "c");
                if (cells.getLength() < 2) continue;
                String category = textContent((Element) cells.item(0), spreadsheetNs, "t");
                String value = textContent((Element) cells.item(1), spreadsheetNs, "v");
                if (!category.isBlank() || !value.isBlank()) rowsOut.add("workbook\t" + category + "\t" + value);
            }
            return List.copyOf(rowsOut);
        } catch (IOException exception) {
            return List.of("workbook\tPARSE_ERROR\t" + exception.getClass().getSimpleName());
        }
    }

    private static void projectWordSmartArt(Map<String, byte[]> parts, ProjectionBuilder b, Document document, RelationshipIndex relationships) throws IOException {
        Element body = first(document.getElementsByTagNameNS(W, "body"));
        if (body == null) return;
        int paragraphIndex = 0;
        for (Element paragraph : directChildren(body, W, "p")) {
            paragraphIndex++;
            NodeList relIds = paragraph.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/diagram", "relIds");
            for (int i = 0; i < relIds.getLength(); i++) {
                Element rel = (Element) relIds.item(i);
                String dataPart = relationships.target("word/document.xml", rel.getAttributeNS(R, "dm"));
                String layoutPart = relationships.target("word/document.xml", rel.getAttributeNS(R, "lo"));
                String stylePart = relationships.target("word/document.xml", rel.getAttributeNS(R, "qs"));
                String colorsPart = relationships.target("word/document.xml", rel.getAttributeNS(R, "cs"));
                ArrayList<String> rows = new ArrayList<>();
                String title = "";
                if (!dataPart.isBlank() && parts.containsKey(dataPart)) {
                    Document data = OoxmlPackageSupport.parseXml(parts.get(dataPart));
                    title = data.getDocumentElement().getAttribute("title");
                    NodeList points = data.getElementsByTagNameNS("http://schemas.openxmlformats.org/drawingml/2006/diagram", "pt");
                    for (int pi = 0; pi < points.getLength(); pi++) {
                        Element point = (Element) points.item(pi);
                        rows.add(point.getAttribute("modelId") + "\t" + textContent(point, A, "t"));
                    }
                    b.representedParts.add(dataPart);
                }
                for (String part : List.of(layoutPart, stylePart, colorsPart)) if (!part.isBlank() && parts.containsKey(part)) b.representedParts.add(part);
                String locator = "body/p:" + paragraphIndex + "/smartart:" + (i + 1);
                CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor("word/document.xml", locator, "", rel.getAttributeNS(R, "dm"));
                Map<String, String> props = new LinkedHashMap<>();
                props.put("title", title); props.put("dataPart", dataPart); props.put("layoutPart", layoutPart); props.put("stylePart", stylePart); props.put("colorsPart", colorsPart); props.put("nodeCount", Integer.toString(rows.size()));
                b.elements.add(element(
                        b.format, CanonicalDocumentGraphV2.ElementType.DIAGRAM, b.rootId, 65_000 + paragraphIndex * 100 + i,
                        title, anchor, new CanonicalDocumentGraphV2.SemanticState("smartart", "", Map.copyOf(props)),
                        CanonicalDocumentGraphV2.StyleState.empty(), CanonicalDocumentGraphV2.GeometryState.empty(),
                        new CanonicalDocumentGraphV2.DataState("smartart-data", Map.copyOf(props), List.copyOf(rows)),
                        CanonicalDocumentGraphV2.BehaviorState.empty(), new CanonicalDocumentGraphV2.AccessibilityState("diagram", title, "", locator, Map.of()),
                        CanonicalDocumentGraphV2.ReviewState.empty(), List.of(), Map.of()));
            }
        }
    }

    private static void projectWordComments(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        String part = "word/comments.xml";
        if (!parts.containsKey(part)) {
            return;
        }
        b.representedParts.add(part);
        Document document = OoxmlPackageSupport.parseXml(parts.get(part));
        NodeList comments = document.getElementsByTagNameNS(W, "comment");
        for (int i = 0; i < comments.getLength(); i++) {
            Element comment = (Element) comments.item(i);
            String id = comment.getAttributeNS(W, "id");
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "comment:" + id, id, "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.COMMENT,
                    b.rootId,
                    i,
                    textContent(comment, W, "t"),
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("comment", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    new CanonicalDocumentGraphV2.ReviewState(List.of(id), List.of(), Map.of("author", comment.getAttributeNS(W, "author"), "date", comment.getAttributeNS(W, "date"))),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectWordNotes(Map<String, byte[]> parts, ProjectionBuilder b, String part, CanonicalDocumentGraphV2.ElementType type) throws IOException {
        if (!parts.containsKey(part)) {
            return;
        }
        b.representedParts.add(part);
        Document document = OoxmlPackageSupport.parseXml(parts.get(part));
        String local = type == CanonicalDocumentGraphV2.ElementType.FOOTNOTE ? "footnote" : "endnote";
        NodeList notes = document.getElementsByTagNameNS(W, local);
        for (int i = 0; i < notes.getLength(); i++) {
            Element note = (Element) notes.item(i);
            String id = note.getAttributeNS(W, "id");
            try { if (Integer.parseInt(id) <= 0) continue; } catch (NumberFormatException ex) { continue; }
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, local + ":" + id, id, "");
            b.elements.add(element(
                    b.format,
                    type,
                    b.rootId,
                    i,
                    textContent(note, W, "t"),
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState(local, "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectWordHeadersAndFooters(
            Map<String, byte[]> parts,
            ProjectionBuilder b,
            Map<String, StyleDef> styles,
            RelationshipIndex relationships) throws IOException {
        Map<String, List<String>> variants = wordHeaderFooterVariants(parts, relationships);
        List<String> names = parts.keySet().stream()
                .filter(name -> name.matches("word/(header|footer)[0-9]+\\.xml"))
                .sorted()
                .toList();
        int rootOrdinal = 50_000;
        for (String part : names) {
            b.representedParts.add(part);
            Document document = OoxmlPackageSupport.parseXml(parts.get(part));
            String kind = part.contains("/header") ? "header" : "footer";
            CanonicalDocumentGraphV2.ElementType type = kind.equals("header")
                    ? CanonicalDocumentGraphV2.ElementType.HEADER
                    : CanonicalDocumentGraphV2.ElementType.FOOTER;
            String variantText = String.join(";", variants.getOrDefault(part, List.of()));
            CanonicalDocumentGraphV2.NativeAnchor wrapperAnchor = new CanonicalDocumentGraphV2.NativeAnchor(part, kind + ":1", "", "");
            CanonicalDocumentGraphV2.Element wrapper = element(
                    b.format,
                    type,
                    b.rootId,
                    rootOrdinal++,
                    textContent(document.getDocumentElement(), W, "t"),
                    wrapperAnchor,
                    new CanonicalDocumentGraphV2.SemanticState(kind, "", variantText.isBlank() ? Map.of() : Map.of("variants", variantText)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState(kind, "", "", wrapperAnchor.locator(), Map.of()),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of());
            b.elements.add(wrapper);
            int paragraphIndex = 0;
            for (Element paragraph : directChildren(document.getDocumentElement(), W, "p")) {
                paragraphIndex++;
                projectWordParagraph(paragraph, b, wrapper.id(), paragraphIndex - 1, kind + ":1/p:" + paragraphIndex, styles, relationships, part);
            }
        }
    }

    private static Map<String, List<String>> wordHeaderFooterVariants(Map<String, byte[]> parts, RelationshipIndex relationships) throws IOException {
        byte[] documentBytes = parts.get("word/document.xml");
        if (documentBytes == null) return Map.of();
        Document document = OoxmlPackageSupport.parseXml(documentBytes);
        LinkedHashMap<String, List<String>> out = new LinkedHashMap<>();
        NodeList sections = document.getElementsByTagNameNS(W, "sectPr");
        for (int i = 0; i < sections.getLength(); i++) {
            Element section = (Element) sections.item(i);
            for (String kind : List.of("header", "footer")) {
                for (Element ref : directChildren(section, W, kind + "Reference")) {
                    String relId = ref.getAttributeNS(R, "id");
                    String target = relationships.target("word/document.xml", relId);
                    if (target.isBlank()) continue;
                    String variant = attributeValue(ref, W, "type");
                    if (variant.isBlank()) variant = "default";
                    ArrayList<String> values = new ArrayList<>(out.getOrDefault(target, List.of()));
                    String marker = kind + ":" + variant;
                    if (!values.contains(marker)) values.add(marker);
                    out.put(target, List.copyOf(values));
                }
            }
        }
        return Map.copyOf(out);
    }

    private static void projectWordSettings(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        String part = "word/settings.xml";
        byte[] bytes = parts.get(part);
        if (bytes == null) return;
        b.representedParts.add(part);
        Document document = OoxmlPackageSupport.parseXml(bytes);
        int ordinal = 55_000;
        Map<String, Integer> occurrences = new LinkedHashMap<>();
        for (Element setting : childElements(document.getDocumentElement())) {
            String local = Objects.requireNonNullElse(setting.getLocalName(), setting.getNodeName());
            int occurrence = occurrences.merge(local, 1, Integer::sum);
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            for (int i = 0; i < setting.getAttributes().getLength(); i++) {
                Node attribute = setting.getAttributes().item(i);
                String name = attribute.getLocalName() == null ? attribute.getNodeName() : attribute.getLocalName();
                properties.put(name, attribute.getNodeValue());
            }
            if (properties.isEmpty()) properties.put("present", "true");
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(
                    part, "setting:" + local + ":" + occurrence, "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.METADATA,
                    b.rootId,
                    ordinal++,
                    Objects.requireNonNullElse(setting.getTextContent(), "").strip(),
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("word-setting", "", Map.copyOf(properties)),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of("settingName", local)));
        }
    }

    private static void projectWordCharts(Map<String, byte[]> parts, ProjectionBuilder b, RelationshipIndex relationships) throws IOException {
        List<String> charts = parts.keySet().stream().filter(name -> name.matches("word/charts/chart[0-9]+\\.xml")).sorted().toList();
        int ordinal = 60_000;
        for (String part : charts) {
            b.representedParts.add(part);
            Document document = OoxmlPackageSupport.parseXml(parts.get(part));
            List<String> values = textValues(document, C, "v");
            List<String> formulas = textValues(document, C, "f");
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "chart", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.CHART,
                    b.rootId,
                    ordinal++,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("chart", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    new CanonicalDocumentGraphV2.DataState("chart-data", Map.of("formulaCount", Integer.toString(formulas.size())), values),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    formulas.isEmpty() ? Map.of() : Map.of("formulas", String.join(" | ", formulas))));
            b.references.addAll(relationships.toReferences(b.rootId, b.format).stream().filter(r -> r.properties().getOrDefault("sourcePart", "").equals(part)).toList());
        }
    }

    private static Map<String, StyleDef> parseWordStyles(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        String part = "word/styles.xml";
        if (!parts.containsKey(part)) {
            return Map.of();
        }
        b.representedParts.add(part);
        Document document = OoxmlPackageSupport.parseXml(parts.get(part));
        LinkedHashMap<String, StyleDef> out = new LinkedHashMap<>();
        NodeList styles = document.getElementsByTagNameNS(W, "style");
        for (int i = 0; i < styles.getLength(); i++) {
            Element style = (Element) styles.item(i);
            String id = style.getAttributeNS(W, "styleId");
            if (id.isBlank()) {
                continue;
            }
            String basedOn = attributeValue(firstDirect(style, W, "basedOn"), W, "val");
            LinkedHashMap<String, String> properties = new LinkedHashMap<>();
            properties.putAll(directProperties(firstDirect(style, W, "pPr")));
            properties.putAll(directProperties(firstDirect(style, W, "rPr")));
            out.put(id, new StyleDef(id, basedOn, Map.copyOf(properties)));
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "style:" + id, id, "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.STYLE,
                    b.rootId,
                    i,
                    id,
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("style", "", Map.of("styleType", style.getAttributeNS(W, "type"))),
                    new CanonicalDocumentGraphV2.StyleState(id, basedOn.isBlank() ? List.of(id) : List.of(id, basedOn), properties, properties),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        return Map.copyOf(out);
    }

    private static void addWordThemes(Map<String, byte[]> parts, ProjectionBuilder b) {
        List<String> themes = parts.keySet().stream().filter(name -> name.startsWith("word/theme/") && name.endsWith(".xml")).sorted().toList();
        for (int i = 0; i < themes.size(); i++) {
            String part = themes.get(i);
            b.representedParts.add(part);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "theme", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.THEME,
                    b.rootId,
                    70_000 + i,
                    part,
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("theme", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void addPptThemesLayoutsMasters(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        int ordinal = 0;
        List<String> names = parts.keySet().stream().sorted().toList();
        for (String part : names) {
            CanonicalDocumentGraphV2.ElementType type = null;
            if (part.matches("ppt/slideMasters/slideMaster[0-9]+\\.xml")) {
                type = CanonicalDocumentGraphV2.ElementType.SLIDE_MASTER;
            } else if (part.matches("ppt/slideLayouts/slideLayout[0-9]+\\.xml")) {
                type = CanonicalDocumentGraphV2.ElementType.SLIDE_LAYOUT;
            } else if (part.matches("ppt/theme/theme[0-9]+\\.xml")) {
                type = CanonicalDocumentGraphV2.ElementType.THEME;
            }
            if (type == null) {
                continue;
            }
            b.representedParts.add(part);
            Document document = OoxmlPackageSupport.parseXml(parts.get(part));
            String name = firstText(document, A, "t");
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "root", "", "");
            b.elements.add(element(
                    b.format,
                    type,
                    b.rootId,
                    80_000 + ordinal++,
                    name,
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState(type.name().toLowerCase(Locale.ROOT), "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectSlide(
            Map<String, byte[]> parts,
            ProjectionBuilder b,
            RelationshipIndex relationships,
            String slidePart,
            int slideOrdinal) throws IOException {
        b.representedParts.add(slidePart);
        Document document = OoxmlPackageSupport.parseXml(parts.get(slidePart));
        String slideTitle = pptSlideTitle(document);
        CanonicalDocumentGraphV2.NativeAnchor slideAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, "slide", Integer.toString(slideOrdinal + 1), "");
        CanonicalDocumentGraphV2.Element slide = element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.SLIDE,
                b.rootId,
                slideOrdinal,
                "",
                slideAnchor,
                new CanonicalDocumentGraphV2.SemanticState("slide", "", Map.of("slideNumber", Integer.toString(slideOrdinal + 1), "title", slideTitle)),
                CanonicalDocumentGraphV2.StyleState.empty(),
                new CanonicalDocumentGraphV2.GeometryState("PPTX_SLIDE_EMU", "", "", "", "", "", slideOrdinal, Map.of()),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                new CanonicalDocumentGraphV2.AccessibilityState("slide", slideTitle, "", Integer.toString(slideOrdinal), Map.of("titlePresent", Boolean.toString(!slideTitle.isBlank()))),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of());
        b.elements.add(slide);
        Element spTree = first(document.getElementsByTagNameNS(P, "spTree"));
        if (spTree != null) {
            int shapeOrdinal = 0;
            for (Element child : childElements(spTree)) {
                if (!P.equals(child.getNamespaceURI())) {
                    continue;
                }
                if (Set.of("sp", "pic", "graphicFrame", "cxnSp", "grpSp").contains(child.getLocalName())) {
                    projectSlideObject(child, b, relationships, slide, slidePart, shapeOrdinal++);
                }
            }
        }
        Element transition = first(document.getElementsByTagNameNS(P, "transition"));
        if (transition != null) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, "transition", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.TRANSITION,
                    slide.id(),
                    90_000,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("transition", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("TRANSITION"), directProperties(transition)),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        Element timing = first(document.getElementsByTagNameNS(P, "timing"));
        if (timing != null) {
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, "timing", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.ANIMATION,
                    slide.id(),
                    90_001,
                    "",
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("animation-timeline", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    new CanonicalDocumentGraphV2.BehaviorState(List.of("ANIMATION_TIMELINE"), Map.of("nativeChildCount", Integer.toString(childElements(timing).size()))),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
        String notesPart = relationships.targetByTypeSuffix(slidePart, "/notesSlide");
        if (notesPart.isBlank()) {
            String fallbackNotes = "ppt/notesSlides/notesSlide" + (slideOrdinal + 1) + ".xml";
            if (parts.containsKey(fallbackNotes)) {
                notesPart = fallbackNotes;
            }
        }
        if (!notesPart.isBlank() && parts.containsKey(notesPart)) {
            b.representedParts.add(notesPart);
            Document notes = OoxmlPackageSupport.parseXml(parts.get(notesPart));
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(notesPart, "speaker-note", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.SPEAKER_NOTE,
                    slide.id(),
                    95_000,
                    String.join("\n", textValues(notes, A, "t")),
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("speaker-note", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static void projectSlideObject(
            Element object,
            ProjectionBuilder b,
            RelationshipIndex relationships,
            CanonicalDocumentGraphV2.Element slide,
            String slidePart,
            int ordinal) {
        Element cNvPr = firstDescendantByLocalName(object, "cNvPr");
        String nativeId = cNvPr == null ? "" : cNvPr.getAttribute("id");
        String name = cNvPr == null ? "" : cNvPr.getAttribute("name");
        String title = cNvPr == null ? "" : cNvPr.getAttribute("title");
        String alt = cNvPr == null ? "" : cNvPr.getAttribute("descr");
        boolean decorative = isDecorative(cNvPr);
        Map<String, String> placeholder = placeholderProperties(object);
        String placeholderType = placeholder.getOrDefault("placeholder.type", "");
        CanonicalDocumentGraphV2.ElementType type = switch (object.getLocalName()) {
            case "pic" -> CanonicalDocumentGraphV2.ElementType.IMAGE;
            case "graphicFrame" -> graphicFrameType(object);
            default -> CanonicalDocumentGraphV2.ElementType.SHAPE;
        };
        String locator = "shape:" + (ordinal + 1);
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, locator, nativeId, "");
        GeometryExtract geometry = pptGeometry(object, ordinal);
        List<String> assetIds = objectAssetIds(object, b, relationships, slidePart);
        CanonicalDocumentGraphV2.DataState data = pptDataState(object, relationships, slidePart);
        CanonicalDocumentGraphV2.BehaviorState behavior = pptBehaviorState(object, relationships, slidePart);
        CanonicalDocumentGraphV2.Element shape = element(
                b.format,
                type,
                slide.id(),
                ordinal,
                name,
                anchor,
                new CanonicalDocumentGraphV2.SemanticState(type.name().toLowerCase(Locale.ROOT), "", placeholder),
                new CanonicalDocumentGraphV2.StyleState("", List.of(), directProperties(firstDescendantByLocalName(object, "spPr")), directProperties(firstDescendantByLocalName(object, "spPr"))),
                geometry.toState(),
                data,
                behavior,
                new CanonicalDocumentGraphV2.AccessibilityState(
                        Set.of("title", "ctrTitle").contains(placeholderType) ? "slide-title" : (type == CanonicalDocumentGraphV2.ElementType.IMAGE ? "image" : "shape"),
                        title,
                        alt,
                        Integer.toString(ordinal),
                        Map.of("name", name, "placeholderType", placeholderType, "decorative", Boolean.toString(decorative))),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                assetIds,
                Map.of("nativeElement", object.getLocalName()));
        b.elements.add(shape);
        projectSlideText(object, b, relationships, shape, slidePart);
        if (type == CanonicalDocumentGraphV2.ElementType.TABLE) {
            projectPptTable(object, b, shape, slidePart);
        }
    }

    private static void projectSlideText(
            Element object,
            ProjectionBuilder b,
            RelationshipIndex relationships,
            CanonicalDocumentGraphV2.Element shape,
            String slidePart) {
        Element txBody = firstDescendantByLocalName(object, "txBody");
        if (txBody == null) {
            return;
        }
        CanonicalDocumentGraphV2.NativeAnchor frameAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, shape.nativeAnchor().locator() + "/text-frame", shape.nativeAnchor().nativeObjectId(), "");
        CanonicalDocumentGraphV2.Element frame = element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.TEXT_FRAME,
                shape.id(),
                0,
                textContent(txBody, A, "t"),
                frameAnchor,
                new CanonicalDocumentGraphV2.SemanticState("text-frame", "", Map.of()),
                CanonicalDocumentGraphV2.StyleState.empty(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                new CanonicalDocumentGraphV2.AccessibilityState("text", "", "", shape.accessibility().readingOrderKey(), Map.of()),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of());
        b.elements.add(frame);
        List<Element> paragraphs = directChildren(txBody, A, "p");
        for (int pIndex = 0; pIndex < paragraphs.size(); pIndex++) {
            Element paragraph = paragraphs.get(pIndex);
            String pLocator = frameAnchor.locator() + "/p:" + (pIndex + 1);
            CanonicalDocumentGraphV2.NativeAnchor pAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, pLocator, "", "");
            CanonicalDocumentGraphV2.Element pElement = element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.PARAGRAPH,
                    frame.id(),
                    pIndex,
                    textContent(paragraph, A, "t"),
                    pAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("paragraph", "", Map.of()),
                    new CanonicalDocumentGraphV2.StyleState("", List.of(), directProperties(firstDirect(paragraph, A, "pPr")), directProperties(firstDirect(paragraph, A, "pPr"))),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("paragraph", "", "", pLocator, Map.of()),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of());
            b.elements.add(pElement);
            List<Element> runs = directChildren(paragraph, A, "r");
            for (int rIndex = 0; rIndex < runs.size(); rIndex++) {
                Element run = runs.get(rIndex);
                String rLocator = pLocator + "/r:" + (rIndex + 1);
                CanonicalDocumentGraphV2.NativeAnchor rAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, rLocator, "", "");
                Element rPr = firstDirect(run, A, "rPr");
                String runText = textContent(run, A, "t");
                b.elements.add(element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.RUN,
                        pElement.id(),
                        rIndex,
                        runText,
                        rAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("run", attributeValue(rPr, "", "lang"), Map.of()),
                        new CanonicalDocumentGraphV2.StyleState("", List.of(), directProperties(rPr), directProperties(rPr)),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        CanonicalDocumentGraphV2.BehaviorState.empty(),
                        CanonicalDocumentGraphV2.AccessibilityState.empty(),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of()));
                NodeList hyperlinks = run.getElementsByTagNameNS(A, "hlinkClick");
                for (int hIndex = 0; hIndex < hyperlinks.getLength(); hIndex++) {
                    Element hyperlink = (Element) hyperlinks.item(hIndex);
                    String relId = hyperlink.getAttributeNS(R, "id");
                    String target = relationships.target(slidePart, relId);
                    String hLocator = rLocator + "/hyperlink:" + (hIndex + 1);
                    CanonicalDocumentGraphV2.NativeAnchor hAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, hLocator, "", relId);
                    b.elements.add(element(
                            b.format,
                            CanonicalDocumentGraphV2.ElementType.HYPERLINK,
                            pElement.id(),
                            50_000 + (rIndex * 100) + hIndex,
                            runText,
                            hAnchor,
                            new CanonicalDocumentGraphV2.SemanticState("hyperlink", "", Map.of()),
                            CanonicalDocumentGraphV2.StyleState.empty(),
                            CanonicalDocumentGraphV2.GeometryState.empty(),
                            CanonicalDocumentGraphV2.DataState.empty(),
                            new CanonicalDocumentGraphV2.BehaviorState(List.of("HYPERLINK"), target.isBlank() ? Map.of() : Map.of("target", target)),
                            new CanonicalDocumentGraphV2.AccessibilityState("hyperlink", "", "", hLocator, target.isBlank() ? Map.of() : Map.of("target", target)),
                            CanonicalDocumentGraphV2.ReviewState.empty(),
                            List.of(),
                            Map.of()));
                }
            }
        }
    }

    private static void projectPptTable(Element object, ProjectionBuilder b, CanonicalDocumentGraphV2.Element tableElement, String slidePart) {
        Element table = first(object.getElementsByTagNameNS(A, "tbl"));
        if (table == null) {
            return;
        }
        Element tableProperties = firstDirect(table, A, "tblPr");
        boolean hasFirstRowHeader = tableProperties != null && tableProperties.hasAttribute("firstRow") && truthyOnOff(attributeValue(tableProperties, "", "firstRow"));
        List<Element> rows = directChildren(table, A, "tr");
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            Element row = rows.get(rowIndex);
            boolean headerRow = hasFirstRowHeader && rowIndex == 0;
            String rowLocator = tableElement.nativeAnchor().locator() + "/row:" + (rowIndex + 1);
            CanonicalDocumentGraphV2.NativeAnchor rowAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, rowLocator, "", "");
            CanonicalDocumentGraphV2.Element rowElement = element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.TABLE_ROW,
                    tableElement.id(),
                    rowIndex,
                    "",
                    rowAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("table-row", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    new CanonicalDocumentGraphV2.AccessibilityState("row", "", "", rowLocator, Map.of("headerRow", Boolean.toString(headerRow))),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of());
            b.elements.add(rowElement);
            List<Element> cells = directChildren(row, A, "tc");
            for (int cellIndex = 0; cellIndex < cells.size(); cellIndex++) {
                Element cell = cells.get(cellIndex);
                String cellLocator = rowLocator + "/cell:" + (cellIndex + 1);
                CanonicalDocumentGraphV2.NativeAnchor cellAnchor = new CanonicalDocumentGraphV2.NativeAnchor(slidePart, cellLocator, "", "");
                b.elements.add(element(
                        b.format,
                        CanonicalDocumentGraphV2.ElementType.TABLE_CELL,
                        rowElement.id(),
                        cellIndex,
                        textContent(cell, A, "t"),
                        cellAnchor,
                        new CanonicalDocumentGraphV2.SemanticState("table-cell", "", Map.of()),
                        CanonicalDocumentGraphV2.StyleState.empty(),
                        CanonicalDocumentGraphV2.GeometryState.empty(),
                        CanonicalDocumentGraphV2.DataState.empty(),
                        CanonicalDocumentGraphV2.BehaviorState.empty(),
                        new CanonicalDocumentGraphV2.AccessibilityState(headerRow ? "column-header" : "cell", "", "", cellLocator, Map.of("headerCell", Boolean.toString(headerRow))),
                        CanonicalDocumentGraphV2.ReviewState.empty(),
                        List.of(),
                        Map.of()));
            }
        }
    }

    private static void projectNotesMasters(Map<String, byte[]> parts, ProjectionBuilder b) {
        List<String> names = parts.keySet().stream().filter(name -> name.matches("ppt/notesMasters/notesMaster[0-9]+\\.xml")).sorted().toList();
        for (int i = 0; i < names.size(); i++) {
            String part = names.get(i);
            b.representedParts.add(part);
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "root", "", "");
            b.elements.add(element(
                    b.format,
                    CanonicalDocumentGraphV2.ElementType.NOTES_MASTER,
                    b.rootId,
                    96_000 + i,
                    part,
                    anchor,
                    new CanonicalDocumentGraphV2.SemanticState("notes-master", "", Map.of()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }
    }

    private static CanonicalDocumentGraphV2.ElementType graphicFrameType(Element object) {
        if (object.getElementsByTagNameNS(A, "tbl").getLength() > 0) {
            return CanonicalDocumentGraphV2.ElementType.TABLE;
        }
        if (object.getElementsByTagNameNS(C, "chart").getLength() > 0) {
            return CanonicalDocumentGraphV2.ElementType.CHART;
        }
        return CanonicalDocumentGraphV2.ElementType.DIAGRAM;
    }

    private static GeometryExtract pptGeometry(Element object, int zOrder) {
        Element xfrm = firstDescendantByLocalName(object, "xfrm");
        if (xfrm == null) {
            return new GeometryExtract("", "", "", "", "", zOrder, Map.of());
        }
        Element off = firstDirect(xfrm, A, "off");
        Element ext = firstDirect(xfrm, A, "ext");
        String x = off == null ? "" : off.getAttribute("x");
        String y = off == null ? "" : off.getAttribute("y");
        String width = ext == null ? "" : ext.getAttribute("cx");
        String height = ext == null ? "" : ext.getAttribute("cy");
        String rotation = xfrm.getAttribute("rot");
        LinkedHashMap<String, String> props = new LinkedHashMap<>();
        if (!xfrm.getAttribute("flipH").isBlank()) {
            props.put("flipH", xfrm.getAttribute("flipH"));
        }
        if (!xfrm.getAttribute("flipV").isBlank()) {
            props.put("flipV", xfrm.getAttribute("flipV"));
        }
        return new GeometryExtract(x, y, width, height, rotation, zOrder, Map.copyOf(props));
    }

    private static List<String> objectAssetIds(Element object, ProjectionBuilder b, RelationshipIndex relationships, String slidePart) {
        ArrayList<String> assetIds = new ArrayList<>();
        NodeList blips = object.getElementsByTagNameNS(A, "blip");
        for (int i = 0; i < blips.getLength(); i++) {
            Element blip = (Element) blips.item(i);
            String relId = blip.getAttributeNS(R, "embed");
            String target = relationships.target(slidePart, relId);
            String assetId = b.assetIdByPart.getOrDefault(target, "");
            if (!assetId.isBlank()) {
                assetIds.add(assetId);
            }
        }
        return List.copyOf(assetIds);
    }

    private static CanonicalDocumentGraphV2.DataState pptDataState(Element object, RelationshipIndex relationships, String slidePart) {
        Element chart = first(object.getElementsByTagNameNS(C, "chart"));
        if (chart != null) {
            String relId = chart.getAttributeNS(R, "id");
            String target = relationships.target(slidePart, relId);
            return new CanonicalDocumentGraphV2.DataState("chart-reference", target.isBlank() ? Map.of() : Map.of("chartPart", target), List.of());
        }
        if (object.getElementsByTagNameNS(A, "tbl").getLength() > 0) {
            return new CanonicalDocumentGraphV2.DataState("table", Map.of(), textValues(object, A, "t"));
        }
        return CanonicalDocumentGraphV2.DataState.empty();
    }

    private static CanonicalDocumentGraphV2.BehaviorState pptBehaviorState(Element object, RelationshipIndex relationships, String slidePart) {
        ArrayList<String> types = new ArrayList<>();
        LinkedHashMap<String, String> props = new LinkedHashMap<>();
        NodeList links = object.getElementsByTagNameNS(A, "hlinkClick");
        for (int i = 0; i < links.getLength(); i++) {
            Element link = (Element) links.item(i);
            String relId = link.getAttributeNS(R, "id");
            String target = relationships.target(slidePart, relId);
            types.add("CLICK_ACTION");
            if (!target.isBlank()) {
                props.put("clickTarget." + i, target);
            }
            String action = link.getAttribute("action");
            if (!action.isBlank()) {
                props.put("action." + i, action);
            }
        }
        return new CanonicalDocumentGraphV2.BehaviorState(types, props);
    }

    private static Map<String, String> placeholderProperties(Element object) {
        Element ph = firstDescendantByLocalName(object, "ph");
        if (ph == null) {
            return Map.of();
        }
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (String key : List.of("type", "idx", "sz", "orient")) {
            if (!ph.getAttribute(key).isBlank()) {
                out.put("placeholder." + key, ph.getAttribute(key));
            }
        }
        return Map.copyOf(out);
    }

    private static List<String> orderedSlideParts(Map<String, byte[]> parts, RelationshipIndex relationships) throws IOException {
        Document presentation = OoxmlPackageSupport.parseXml(parts.get("ppt/presentation.xml"));
        NodeList slideIds = presentation.getElementsByTagNameNS(P, "sldId");
        ArrayList<String> ordered = new ArrayList<>();
        for (int i = 0; i < slideIds.getLength(); i++) {
            Element slideId = (Element) slideIds.item(i);
            String relId = slideId.getAttributeNS(R, "id");
            String target = relationships.target("ppt/presentation.xml", relId);
            if (!target.isBlank() && parts.containsKey(target)) {
                ordered.add(target);
            }
        }
        if (!ordered.isEmpty()) {
            return List.copyOf(ordered);
        }
        return parts.keySet().stream().filter(name -> name.matches("ppt/slides/slide[0-9]+\\.xml")).sorted().toList();
    }

    private static void addPackageMetadata(Map<String, byte[]> parts, ProjectionBuilder b) throws IOException {
        String part = "docProps/core.xml";
        if (!parts.containsKey(part)) {
            return;
        }
        b.representedParts.add(part);
        Document document = OoxmlPackageSupport.parseXml(parts.get(part));
        LinkedHashMap<String, String> meta = new LinkedHashMap<>();
        addIfPresent(meta, "title", firstText(document, DC, "title"));
        addIfPresent(meta, "creator", firstText(document, DC, "creator"));
        addIfPresent(meta, "description", firstText(document, DC, "description"));
        addIfPresent(meta, "subject", firstText(document, DC, "subject"));
        addIfPresent(meta, "keywords", firstText(document, CP, "keywords"));
        CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(part, "core-properties", "", "");
        b.elements.add(element(
                b.format,
                CanonicalDocumentGraphV2.ElementType.METADATA,
                b.rootId,
                99_000,
                "",
                anchor,
                new CanonicalDocumentGraphV2.SemanticState("metadata", "", meta),
                CanonicalDocumentGraphV2.StyleState.empty(),
                CanonicalDocumentGraphV2.GeometryState.empty(),
                CanonicalDocumentGraphV2.DataState.empty(),
                CanonicalDocumentGraphV2.BehaviorState.empty(),
                CanonicalDocumentGraphV2.AccessibilityState.empty(),
                CanonicalDocumentGraphV2.ReviewState.empty(),
                List.of(),
                Map.of()));
    }

    private static void addAssets(Map<String, byte[]> parts, ProjectionBuilder b) {
        List<String> names = parts.keySet().stream().filter(CanonicalDocumentGraphV2Projector::isAssetPart).sorted().toList();
        for (String part : names) {
            byte[] content = parts.get(part);
            CanonicalDocumentGraphV2.AssetType type = assetType(part);
            String id = CanonicalDocumentGraphV2.stableObjectId("asset", part + "|" + OoxmlPackageSupport.sha256(content));
            b.assets.add(new CanonicalDocumentGraphV2.Asset(
                    id,
                    type,
                    part,
                    mediaType(part),
                    OoxmlPackageSupport.sha256(content),
                    content.length,
                    Map.of("preserveByDefault", "true")));
            b.assetIdByPart.put(part, id);
            b.representedParts.add(part);
        }
    }

    private static boolean isAssetPart(String part) {
        String lower = part.toLowerCase(Locale.ROOT);
        return lower.startsWith("word/media/")
                || lower.startsWith("ppt/media/")
                || lower.contains("/embeddings/")
                || lower.contains("/fonts/")
                || lower.endsWith("vbaproject.bin")
                || lower.contains("/activex/");
    }

    private static CanonicalDocumentGraphV2.AssetType assetType(String part) {
        String lower = part.toLowerCase(Locale.ROOT);
        if (lower.contains("/embeddings/")) {
            return CanonicalDocumentGraphV2.AssetType.EMBEDDED_FILE;
        }
        if (lower.contains("/fonts/")) {
            return CanonicalDocumentGraphV2.AssetType.FONT;
        }
        if (lower.contains("/activex/") || lower.endsWith("vbaproject.bin")) {
            return CanonicalDocumentGraphV2.AssetType.OLE;
        }
        if (lower.matches(".*\\.(png|jpe?g|gif|bmp|tiff?|svg|emf|wmf)$")) {
            return CanonicalDocumentGraphV2.AssetType.IMAGE;
        }
        if (lower.matches(".*\\.(mp3|wav|m4a|aac|wma)$")) {
            return CanonicalDocumentGraphV2.AssetType.AUDIO;
        }
        if (lower.matches(".*\\.(mp4|mov|wmv|avi|m4v)$")) {
            return CanonicalDocumentGraphV2.AssetType.VIDEO;
        }
        return CanonicalDocumentGraphV2.AssetType.OTHER;
    }

    private static String mediaType(String part) {
        String lower = part.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".xml")) return "application/xml";
        return "application/octet-stream";
    }

    private static void addUnknownFeatures(Map<String, byte[]> parts, ProjectionBuilder b, String featureKind) {
        for (String part : parts.keySet().stream().sorted().toList()) {
            if (b.representedParts.contains(part)) {
                continue;
            }
            if (part.equals("[Content_Types].xml")) {
                continue;
            }
            byte[] content = parts.get(part);
            String sha = OoxmlPackageSupport.sha256(content);
            b.unknown.add(new CanonicalDocumentGraphV2.UnknownNativeFeature(
                    CanonicalDocumentGraphV2.stableObjectId("unknown", b.format.name() + "|" + part + "|" + sha),
                    part,
                    featureKind,
                    sha,
                    CanonicalDocumentGraphV2.UnknownDisposition.PRESERVE_UNMODELED,
                    "Native part is preserved byte-for-byte by default but is not yet semantically projected by this CDG-2 slice."));
        }
    }

    private static StyleResolution resolveStyle(String styleId, Map<String, StyleDef> styles, Map<String, String> direct) {
        if (styleId == null || styleId.isBlank()) {
            return new StyleResolution("", List.of(), direct, direct);
        }
        ArrayList<String> chain = new ArrayList<>();
        ArrayDeque<StyleDef> stack = new ArrayDeque<>();
        HashSet<String> seen = new HashSet<>();
        String current = styleId;
        while (current != null && !current.isBlank() && seen.add(current)) {
            StyleDef style = styles.get(current);
            if (style == null) {
                chain.add(current);
                break;
            }
            chain.add(current);
            stack.push(style);
            current = style.basedOn();
        }
        LinkedHashMap<String, String> resolved = new LinkedHashMap<>();
        while (!stack.isEmpty()) {
            resolved.putAll(stack.pop().properties());
        }
        resolved.putAll(direct);
        return new StyleResolution(styleId, List.copyOf(chain), direct, Map.copyOf(resolved));
    }

    private static Map<String, String> directProperties(Element properties) {
        if (properties == null) {
            return Map.of();
        }
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (Element child : childElements(properties)) {
            String key = child.getLocalName();
            String value = child.getAttributeNS(W, "val");
            if (value.isBlank()) {
                value = child.getAttribute("val");
            }
            if (value.isBlank()) {
                value = child.getTextContent() == null ? "true" : child.getTextContent().strip();
            }
            if (value.isBlank()) {
                value = "true";
            }
            out.put(key, value);
            for (int i = 0; i < child.getAttributes().getLength(); i++) {
                Node attribute = child.getAttributes().item(i);
                String attrName = attribute.getLocalName() == null ? attribute.getNodeName() : attribute.getLocalName();
                out.put(key + "." + attrName, attribute.getNodeValue());
            }
        }
        return Map.copyOf(out);
    }


    private static boolean isRevisionElement(String localName) {
        return Set.of("ins", "del", "moveFrom", "moveTo").contains(localName);
    }

    private static List<String> revisionIds(Element element) {
        ArrayList<String> out = new ArrayList<>();
        for (String local : List.of("ins", "del", "moveFrom", "moveTo", "rPrChange", "pPrChange")) {
            NodeList revisions = element.getElementsByTagNameNS(W, local);
            for (int i = 0; i < revisions.getLength(); i++) {
                Element revision = (Element) revisions.item(i);
                String id = revision.getAttributeNS(W, "id");
                out.add(local + ":" + (id.isBlank() ? Integer.toString(i + 1) : id));
            }
        }
        return List.copyOf(out);
    }

    private static String firstLanguage(Element element) {
        Element lang = first(element.getElementsByTagNameNS(W, "lang"));
        return attributeValue(lang, W, "val");
    }

    private static boolean hasAncestor(Node node, String namespace, String localName) {
        for (Node current = node.getParentNode(); current != null; current = current.getParentNode()) {
            if (current instanceof Element element && namespace.equals(element.getNamespaceURI()) && localName.equals(element.getLocalName())) return true;
        }
        return false;
    }

    private static Element drawingPropertyFor(Element embeddedObject) {
        Node current = embeddedObject;
        while (current != null) {
            if (current instanceof Element element
                    && ("inline".equals(element.getLocalName()) || "anchor".equals(element.getLocalName()))
                    && WP.equals(element.getNamespaceURI())) {
                return first(element.getElementsByTagNameNS(WP, "docPr"));
            }
            current = current.getParentNode();
        }
        return null;
    }

    private static Element drawingContainerFor(Element embeddedObject) {
        Node current = embeddedObject;
        while (current != null) {
            if (current instanceof Element element
                    && ("inline".equals(element.getLocalName()) || "anchor".equals(element.getLocalName()))
                    && WP.equals(element.getNamespaceURI())) {
                return element;
            }
            current = current.getParentNode();
        }
        return null;
    }

    private static Element nearestDocumentProperty(Element paragraph, int index) {
        NodeList properties = paragraph.getElementsByTagNameNS(WP, "docPr");
        if (index >= 0 && index < properties.getLength()) {
            return (Element) properties.item(index);
        }
        return first(properties);
    }

    private static String pptSlideTitle(Document document) {
        NodeList shapes = document.getElementsByTagNameNS(P, "sp");
        String namedFallback = "";
        for (int i = 0; i < shapes.getLength(); i++) {
            Element shape = (Element) shapes.item(i);
            String text = textContent(shape, A, "t").strip();
            if (text.isBlank()) {
                continue;
            }
            Map<String, String> placeholder = placeholderProperties(shape);
            String type = placeholder.getOrDefault("placeholder.type", "");
            if (Set.of("title", "ctrTitle").contains(type)) {
                return text;
            }
            Element cNvPr = firstDescendantByLocalName(shape, "cNvPr");
            String name = cNvPr == null ? "" : cNvPr.getAttribute("name");
            if (namedFallback.isBlank() && name.toLowerCase(Locale.ROOT).contains("title")) {
                namedFallback = text;
            }
        }
        return namedFallback;
    }

    private static boolean isDecorative(Element propertyElement) {
        Element decorative = firstDescendantByLocalName(propertyElement, "decorative");
        if (decorative == null) {
            return false;
        }
        String value = attributeValue(decorative, "", "val").strip().toLowerCase(Locale.ROOT);
        return value.isBlank() || !(value.equals("0") || value.equals("false") || value.equals("off"));
    }

    private static boolean truthyOnOff(String value) {
        String normalized = Objects.requireNonNullElse(value, "").strip().toLowerCase(Locale.ROOT);
        return normalized.isBlank() || normalized.equals("1") || normalized.equals("true") || normalized.equals("on");
    }

    private static void copyAttribute(Element element, String namespace, String local, Map<String, String> target, String key) {
        String value = attributeValue(element, namespace, local);
        if (!value.isBlank()) {
            target.put(key, value);
        }
    }

    private static String attributeValue(Element element, String namespace, String local) {
        if (element == null) {
            return "";
        }
        if (namespace == null || namespace.isBlank()) {
            return Objects.requireNonNullElse(element.getAttribute(local), "");
        }
        return Objects.requireNonNullElse(element.getAttributeNS(namespace, local), "");
    }

    private static List<String> attributeValues(Element element, String namespace, String local, String attributeNamespace, String attributeLocal) {
        ArrayList<String> out = new ArrayList<>();
        NodeList nodes = element.getElementsByTagNameNS(namespace, local);
        for (int i = 0; i < nodes.getLength(); i++) {
            String value = ((Element) nodes.item(i)).getAttributeNS(attributeNamespace, attributeLocal);
            if (!value.isBlank()) {
                out.add(value);
            }
        }
        return List.copyOf(out);
    }

    private static String textContent(Element element, String namespace, String local) {
        if (element == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        NodeList nodes = element.getElementsByTagNameNS(namespace, local);
        for (int i = 0; i < nodes.getLength(); i++) {
            String text = nodes.item(i).getTextContent();
            if (text != null) {
                out.append(text);
            }
        }
        return out.toString();
    }

    private static List<String> textValues(Document document, String namespace, String local) {
        return textValues(document.getDocumentElement(), namespace, local);
    }

    private static List<String> textValues(Element element, String namespace, String local) {
        ArrayList<String> out = new ArrayList<>();
        NodeList nodes = element.getElementsByTagNameNS(namespace, local);
        for (int i = 0; i < nodes.getLength(); i++) {
            String value = Objects.requireNonNullElse(nodes.item(i).getTextContent(), "").strip();
            if (!value.isBlank()) {
                out.add(value);
            }
        }
        return List.copyOf(out);
    }

    private static String firstText(Document document, String namespace, String local) {
        Element element = first(document.getElementsByTagNameNS(namespace, local));
        return element == null ? "" : Objects.requireNonNullElse(element.getTextContent(), "").strip();
    }

    private static Element first(NodeList nodes) {
        if (nodes == null || nodes.getLength() == 0) {
            return null;
        }
        return (Element) nodes.item(0);
    }

    private static Element firstDirect(Element parent, String namespace, String local) {
        if (parent == null) {
            return null;
        }
        for (Element child : childElements(parent)) {
            if (Objects.equals(namespace, child.getNamespaceURI()) && local.equals(child.getLocalName())) {
                return child;
            }
        }
        return null;
    }

    private static List<Element> directElementChildren(Element parent) {
        ArrayList<Element> out = new ArrayList<>();
        if (parent == null) return out;
        Node child = parent.getFirstChild();
        while (child != null) {
            if (child instanceof Element element) out.add(element);
            child = child.getNextSibling();
        }
        return List.copyOf(out);
    }

    private static List<Element> directChildren(Element parent, String namespace, String local) {
        ArrayList<Element> out = new ArrayList<>();
        if (parent == null) {
            return List.of();
        }
        for (Element child : childElements(parent)) {
            if (Objects.equals(namespace, child.getNamespaceURI()) && local.equals(child.getLocalName())) {
                out.add(child);
            }
        }
        return List.copyOf(out);
    }

    private static List<Element> childElements(Element parent) {
        ArrayList<Element> out = new ArrayList<>();
        NodeList children = parent.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child instanceof Element element) {
                out.add(element);
            }
        }
        return List.copyOf(out);
    }

    private static Element firstDescendantByLocalName(Element parent, String localName) {
        if (parent == null) {
            return null;
        }
        Deque<Element> queue = new ArrayDeque<>();
        queue.add(parent);
        while (!queue.isEmpty()) {
            Element current = queue.removeFirst();
            if (localName.equals(current.getLocalName())) {
                return current;
            }
            queue.addAll(childElements(current));
        }
        return null;
    }

    private static List<String> semanticBlocks(String source) {
        if (source == null || source.isBlank()) {
            return List.of("");
        }
        String normalized = source.replace("\r\n", "\n").replace('\r', '\n');
        ArrayList<String> out = new ArrayList<>();
        for (String block : normalized.split("\\n\\s*\\n", -1)) {
            if (!block.isBlank()) {
                out.add(block.strip());
            }
        }
        if (out.isEmpty()) {
            out.add(normalized.strip());
        }
        return List.copyOf(out);
    }

    private static CanonicalDocumentGraphV2.Element element(
            DocumentFormat format,
            CanonicalDocumentGraphV2.ElementType type,
            String parentId,
            int ordinal,
            String text,
            CanonicalDocumentGraphV2.NativeAnchor anchor,
            CanonicalDocumentGraphV2.SemanticState semantic,
            CanonicalDocumentGraphV2.StyleState style,
            CanonicalDocumentGraphV2.GeometryState geometry,
            CanonicalDocumentGraphV2.DataState data,
            CanonicalDocumentGraphV2.BehaviorState behavior,
            CanonicalDocumentGraphV2.AccessibilityState accessibility,
            CanonicalDocumentGraphV2.ReviewState review,
            List<String> assetIds,
            Map<String, String> extensions) {
        return new CanonicalDocumentGraphV2.Element(
                CanonicalDocumentGraphV2.stableElementId(format, type, anchor),
                type,
                parentId,
                ordinal,
                text,
                semantic,
                style,
                geometry,
                data,
                behavior,
                accessibility,
                review,
                anchor,
                assetIds,
                List.of(),
                extensions);
    }

    private static void requirePart(Map<String, byte[]> parts, String part, String message) throws IOException {
        if (!parts.containsKey(part)) {
            throw new IOException(message);
        }
    }

    private static void addIfPresent(Map<String, String> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }

    private record StyleDef(String id, String basedOn, Map<String, String> properties) {
    }

    private record StyleResolution(
            String styleId,
            List<String> chain,
            Map<String, String> declared,
            Map<String, String> resolved) {
        CanonicalDocumentGraphV2.StyleState toState() {
            return new CanonicalDocumentGraphV2.StyleState(styleId, chain, declared, resolved);
        }
    }

    private record GeometryExtract(
            String x,
            String y,
            String width,
            String height,
            String rotation,
            int zOrder,
            Map<String, String> properties) {
        CanonicalDocumentGraphV2.GeometryState toState() {
            return new CanonicalDocumentGraphV2.GeometryState("PPTX_EMU", x, y, width, height, rotation, zOrder, properties);
        }
    }

    private static final class ProjectionBuilder {
        final DocumentFormat format;
        final String sourceSha;
        final CanonicalDocumentGraphV2.Kind kind;
        final String rootId;
        final List<CanonicalDocumentGraphV2.Element> elements = new ArrayList<>();
        final List<CanonicalDocumentGraphV2.Asset> assets = new ArrayList<>();
        final List<CanonicalDocumentGraphV2.Reference> references = new ArrayList<>();
        final List<CanonicalDocumentGraphV2.UnknownNativeFeature> unknown = new ArrayList<>();
        final List<CanonicalDocumentGraph.NativePart> nativeParts = new ArrayList<>();
        final Set<String> representedParts = new HashSet<>();
        final Map<String, String> assetIdByPart = new HashMap<>();
        final Map<String, byte[]> parts;

        ProjectionBuilder(DocumentFormat format, String sourceSha, CanonicalDocumentGraphV2.Kind kind, Map<String, byte[]> parts) {
            this.format = format;
            this.sourceSha = sourceSha;
            this.kind = kind;
            this.parts = Map.copyOf(parts);
            for (Map.Entry<String, byte[]> entry : parts.entrySet().stream().sorted(Map.Entry.comparingByKey()).toList()) {
                nativeParts.add(new CanonicalDocumentGraph.NativePart(entry.getKey(), OoxmlPackageSupport.sha256(entry.getValue()), true));
            }
            CanonicalDocumentGraphV2.NativeAnchor rootAnchor = new CanonicalDocumentGraphV2.NativeAnchor("<artifact>", "root", "", "");
            this.rootId = CanonicalDocumentGraphV2.stableElementId(format, CanonicalDocumentGraphV2.ElementType.ROOT, rootAnchor);
            elements.add(element(
                    format,
                    CanonicalDocumentGraphV2.ElementType.ROOT,
                    null,
                    0,
                    "",
                    rootAnchor,
                    new CanonicalDocumentGraphV2.SemanticState("document", "", Map.of("format", format.name())),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    List.of(),
                    Map.of()));
        }

        CanonicalDocumentGraphV2 build(Map<String, String> provenance) {
            return new CanonicalDocumentGraphV2(
                    CanonicalDocumentGraphV2.SCHEMA_V2,
                    format,
                    sourceSha,
                    kind,
                    elements,
                    assets,
                    deduplicateReferences(references),
                    unknown,
                    nativeParts,
                    provenance);
        }

        private static List<CanonicalDocumentGraphV2.Reference> deduplicateReferences(List<CanonicalDocumentGraphV2.Reference> input) {
            LinkedHashMap<String, CanonicalDocumentGraphV2.Reference> byId = new LinkedHashMap<>();
            for (CanonicalDocumentGraphV2.Reference reference : input) {
                byId.putIfAbsent(reference.id(), reference);
            }
            return List.copyOf(byId.values());
        }
    }

    private record Relationship(String sourcePart, String relationshipPart, String id, String type, String target, boolean external) {
    }

    private static final class RelationshipIndex {
        private final Map<String, Map<String, Relationship>> bySource;
        private final Set<String> relationshipParts;

        private RelationshipIndex(Map<String, Map<String, Relationship>> bySource, Set<String> relationshipParts) {
            this.bySource = bySource;
            this.relationshipParts = relationshipParts;
        }

        static RelationshipIndex read(Map<String, byte[]> parts) throws IOException {
            LinkedHashMap<String, Map<String, Relationship>> bySource = new LinkedHashMap<>();
            HashSet<String> relationshipParts = new HashSet<>();
            for (String part : parts.keySet().stream().filter(name -> name.endsWith(".rels")).sorted().toList()) {
                relationshipParts.add(part);
                Document document = OoxmlPackageSupport.parseXml(parts.get(part));
                String sourcePart = relationshipSourcePart(part);
                LinkedHashMap<String, Relationship> rels = new LinkedHashMap<>();
                NodeList nodes = document.getElementsByTagNameNS(REL, "Relationship");
                for (int i = 0; i < nodes.getLength(); i++) {
                    Element rel = (Element) nodes.item(i);
                    String id = rel.getAttribute("Id");
                    String type = rel.getAttribute("Type");
                    String rawTarget = rel.getAttribute("Target");
                    boolean external = "External".equalsIgnoreCase(rel.getAttribute("TargetMode"));
                    String target = external ? rawTarget : resolveTarget(sourcePart, rawTarget);
                    rels.put(id, new Relationship(sourcePart, part, id, type, target, external));
                }
                bySource.put(sourcePart, Map.copyOf(rels));
            }
            return new RelationshipIndex(Map.copyOf(bySource), Set.copyOf(relationshipParts));
        }

        String target(String sourcePart, String relationshipId) {
            if (relationshipId == null || relationshipId.isBlank()) {
                return "";
            }
            Relationship relationship = bySource.getOrDefault(sourcePart, Map.of()).get(relationshipId);
            return relationship == null ? "" : relationship.target();
        }

        String targetByTypeSuffix(String sourcePart, String suffix) {
            for (Relationship relationship : bySource.getOrDefault(sourcePart, Map.of()).values()) {
                if (relationship.type().endsWith(suffix)) {
                    return relationship.target();
                }
            }
            return "";
        }

        Set<String> relationshipParts() {
            return relationshipParts;
        }

        List<CanonicalDocumentGraphV2.Reference> toReferences(String rootId, DocumentFormat format) {
            ArrayList<CanonicalDocumentGraphV2.Reference> out = new ArrayList<>();
            for (Map<String, Relationship> relationships : bySource.values()) {
                for (Relationship relationship : relationships.values()) {
                    CanonicalDocumentGraphV2.ReferenceType type = relationship.external()
                            ? CanonicalDocumentGraphV2.ReferenceType.EXTERNAL_RELATIONSHIP
                            : CanonicalDocumentGraphV2.ReferenceType.INTERNAL_RELATIONSHIP;
                    if (relationship.type().endsWith("/hyperlink")) {
                        type = CanonicalDocumentGraphV2.ReferenceType.HYPERLINK;
                    } else if (relationship.type().endsWith("/image") || relationship.type().endsWith("/audio") || relationship.type().endsWith("/video")) {
                        type = CanonicalDocumentGraphV2.ReferenceType.ASSET;
                    } else if (relationship.type().endsWith("/slideLayout") || relationship.type().endsWith("/slideMaster")) {
                        type = CanonicalDocumentGraphV2.ReferenceType.MASTER_LAYOUT;
                    }
                    String material = format.name() + "|" + relationship.sourcePart() + "|" + relationship.id() + "|" + relationship.target();
                    out.add(new CanonicalDocumentGraphV2.Reference(
                            CanonicalDocumentGraphV2.stableObjectId("ref", material),
                            type,
                            rootId,
                            relationship.target(),
                            relationship.id(),
                            relationship.external(),
                            Map.of("sourcePart", relationship.sourcePart(), "relationshipType", relationship.type(), "relationshipPart", relationship.relationshipPart())));
                }
            }
            return List.copyOf(out);
        }

        private static String relationshipSourcePart(String relationshipPart) {
            if ("_rels/.rels".equals(relationshipPart)) {
                return "<package>";
            }
            int rels = relationshipPart.lastIndexOf("/_rels/");
            if (rels < 0 || !relationshipPart.endsWith(".rels")) {
                return relationshipPart;
            }
            String prefix = relationshipPart.substring(0, rels + 1);
            String file = relationshipPart.substring(rels + "/_rels/".length(), relationshipPart.length() - ".rels".length());
            return prefix + file;
        }

        private static String resolveTarget(String sourcePart, String target) throws IOException {
            if (target == null || target.isBlank()) {
                return "";
            }
            if (target.startsWith("/")) {
                return OoxmlPackageSupport.safeName(target.substring(1));
            }
            String base = "<package>".equals(sourcePart) || !sourcePart.contains("/") ? "" : sourcePart.substring(0, sourcePart.lastIndexOf('/') + 1);
            Deque<String> segments = new ArrayDeque<>();
            for (String segment : (base + target).split("/")) {
                if (segment.isBlank() || ".".equals(segment)) {
                    continue;
                }
                if ("..".equals(segment)) {
                    if (segments.isEmpty()) {
                        throw new IOException("relationship target escapes package root");
                    }
                    segments.removeLast();
                } else {
                    segments.addLast(segment);
                }
            }
            return OoxmlPackageSupport.safeName(String.join("/", segments));
        }
    }
}
