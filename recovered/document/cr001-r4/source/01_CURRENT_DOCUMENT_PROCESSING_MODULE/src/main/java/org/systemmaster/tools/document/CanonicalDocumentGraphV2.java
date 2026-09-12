package org.systemmaster.tools.document;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * CDG-2 is the loss-aware canonical/native graph for document and presentation mastering.
 * Native bytes remain authoritative for features not yet represented semantically.
 */
public record CanonicalDocumentGraphV2(
        String schemaVersion,
        DocumentFormat sourceFormat,
        String sourceSha256,
        Kind kind,
        List<Element> elements,
        List<Asset> assets,
        List<Reference> references,
        List<UnknownNativeFeature> unknownNativeFeatures,
        List<CanonicalDocumentGraph.NativePart> nativeParts,
        Map<String, String> provenance) {

    public static final String SCHEMA_V2 = "CDG-2";

    public enum Kind {
        FLOW_DOCUMENT,
        PRESENTATION,
        FIXED_LAYOUT,
        TEXT_DOCUMENT
    }

    public enum ElementType {
        ROOT,
        METADATA,
        SECTION,
        PARAGRAPH,
        RUN,
        LIST,
        LIST_ITEM,
        TABLE,
        TABLE_ROW,
        TABLE_CELL,
        FIGURE,
        IMAGE,
        CHART,
        DIAGRAM,
        EQUATION,
        HYPERLINK,
        FIELD,
        CITATION,
        FOOTNOTE,
        ENDNOTE,
        COMMENT,
        REVISION,
        SLIDE,
        SHAPE,
        TEXT_FRAME,
        SLIDE_LAYOUT,
        SLIDE_MASTER,
        NOTES_MASTER,
        SPEAKER_NOTE,
        PLACEHOLDER,
        TRANSITION,
        ANIMATION,
        MEDIA,
        EMBEDDED_OBJECT,
        STYLE,
        THEME,
        TEXT_BLOCK,
        PAGE,
        HEADER,
        FOOTER,
        BREAK
    }

    public enum AssetType {
        IMAGE,
        AUDIO,
        VIDEO,
        FONT,
        CHART_DATA,
        EMBEDDED_FILE,
        OLE,
        OTHER
    }

    public enum ReferenceType {
        INTERNAL_RELATIONSHIP,
        EXTERNAL_RELATIONSHIP,
        HYPERLINK,
        ASSET,
        STYLE,
        MASTER_LAYOUT,
        CHART_DATA,
        EVIDENCE
    }

    public enum UnknownDisposition {
        PRESERVE_UNMODELED,
        BLOCK_IF_TARGETED,
        ESCALATE_FOR_SEMANTIC_ADAPTER
    }

    public record NativeAnchor(
            String nativePart,
            String locator,
            String nativeObjectId,
            String relationshipId) {
        public NativeAnchor {
            nativePart = Objects.requireNonNullElse(nativePart, "<artifact>");
            locator = Objects.requireNonNullElse(locator, "");
            nativeObjectId = Objects.requireNonNullElse(nativeObjectId, "");
            relationshipId = Objects.requireNonNullElse(relationshipId, "");
        }
    }

    public record SemanticState(
            String role,
            String language,
            Map<String, String> properties) {
        public SemanticState {
            role = Objects.requireNonNullElse(role, "");
            language = Objects.requireNonNullElse(language, "");
            properties = immutableMap(properties);
        }

        public static SemanticState empty() {
            return new SemanticState("", "", Map.of());
        }
    }

    public record StyleState(
            String declaredStyleId,
            List<String> inheritanceChain,
            Map<String, String> declaredProperties,
            Map<String, String> resolvedProperties) {
        public StyleState {
            declaredStyleId = Objects.requireNonNullElse(declaredStyleId, "");
            inheritanceChain = immutableList(inheritanceChain);
            declaredProperties = immutableMap(declaredProperties);
            resolvedProperties = immutableMap(resolvedProperties);
        }

        public static StyleState empty() {
            return new StyleState("", List.of(), Map.of(), Map.of());
        }
    }

    public record GeometryState(
            String coordinateSpace,
            String x,
            String y,
            String width,
            String height,
            String rotation,
            int zOrder,
            Map<String, String> properties) {
        public GeometryState {
            coordinateSpace = Objects.requireNonNullElse(coordinateSpace, "");
            x = Objects.requireNonNullElse(x, "");
            y = Objects.requireNonNullElse(y, "");
            width = Objects.requireNonNullElse(width, "");
            height = Objects.requireNonNullElse(height, "");
            rotation = Objects.requireNonNullElse(rotation, "");
            if (zOrder < -1) {
                throw new IllegalArgumentException("zOrder must be -1 or greater");
            }
            properties = immutableMap(properties);
        }

        public static GeometryState empty() {
            return new GeometryState("", "", "", "", "", "", -1, Map.of());
        }
    }

    public record DataState(
            String dataType,
            Map<String, String> properties,
            List<String> values) {
        public DataState {
            dataType = Objects.requireNonNullElse(dataType, "");
            properties = immutableMap(properties);
            values = immutableList(values);
        }

        public static DataState empty() {
            return new DataState("", Map.of(), List.of());
        }
    }

    public record BehaviorState(
            List<String> behaviorTypes,
            Map<String, String> properties) {
        public BehaviorState {
            behaviorTypes = immutableList(behaviorTypes);
            properties = immutableMap(properties);
        }

        public static BehaviorState empty() {
            return new BehaviorState(List.of(), Map.of());
        }
    }

    public record AccessibilityState(
            String role,
            String title,
            String alternativeText,
            String readingOrderKey,
            Map<String, String> properties) {
        public AccessibilityState {
            role = Objects.requireNonNullElse(role, "");
            title = Objects.requireNonNullElse(title, "");
            alternativeText = Objects.requireNonNullElse(alternativeText, "");
            readingOrderKey = Objects.requireNonNullElse(readingOrderKey, "");
            properties = immutableMap(properties);
        }

        public static AccessibilityState empty() {
            return new AccessibilityState("", "", "", "", Map.of());
        }
    }

    public record ReviewState(
            List<String> commentIds,
            List<String> revisionIds,
            Map<String, String> properties) {
        public ReviewState {
            commentIds = immutableList(commentIds);
            revisionIds = immutableList(revisionIds);
            properties = immutableMap(properties);
        }

        public static ReviewState empty() {
            return new ReviewState(List.of(), List.of(), Map.of());
        }
    }

    public record EvidenceLink(
            String evidenceType,
            String authorityId,
            String evidenceId,
            String sha256) {
        public EvidenceLink {
            evidenceType = requireNonBlank(evidenceType, "evidenceType");
            authorityId = Objects.requireNonNullElse(authorityId, "");
            evidenceId = requireNonBlank(evidenceId, "evidenceId");
            if (sha256 != null && !sha256.isBlank()) {
                requireSha256(sha256, "evidence");
            }
            sha256 = Objects.requireNonNullElse(sha256, "");
        }
    }

    public record Element(
            String id,
            ElementType type,
            String parentId,
            int ordinal,
            String text,
            SemanticState semantic,
            StyleState style,
            GeometryState geometry,
            DataState data,
            BehaviorState behavior,
            AccessibilityState accessibility,
            ReviewState review,
            NativeAnchor nativeAnchor,
            List<String> assetIds,
            List<EvidenceLink> evidence,
            Map<String, String> extensions) {
        public Element {
            id = requireNonBlank(id, "element id");
            Objects.requireNonNull(type, "type");
            if (ordinal < 0) {
                throw new IllegalArgumentException("negative element ordinal");
            }
            text = Objects.requireNonNullElse(text, "");
            semantic = Objects.requireNonNullElseGet(semantic, SemanticState::empty);
            style = Objects.requireNonNullElseGet(style, StyleState::empty);
            geometry = Objects.requireNonNullElseGet(geometry, GeometryState::empty);
            data = Objects.requireNonNullElseGet(data, DataState::empty);
            behavior = Objects.requireNonNullElseGet(behavior, BehaviorState::empty);
            accessibility = Objects.requireNonNullElseGet(accessibility, AccessibilityState::empty);
            review = Objects.requireNonNullElseGet(review, ReviewState::empty);
            nativeAnchor = Objects.requireNonNullElseGet(nativeAnchor, () -> new NativeAnchor("<artifact>", "", "", ""));
            assetIds = immutableList(assetIds);
            evidence = immutableList(evidence);
            extensions = immutableMap(extensions);
        }
    }

    public record Asset(
            String id,
            AssetType type,
            String nativePart,
            String mediaType,
            String sha256,
            long byteLength,
            Map<String, String> properties) {
        public Asset {
            id = requireNonBlank(id, "asset id");
            Objects.requireNonNull(type, "type");
            nativePart = requireNonBlank(nativePart, "asset nativePart");
            mediaType = Objects.requireNonNullElse(mediaType, "application/octet-stream");
            requireSha256(sha256, "asset");
            if (byteLength < 0) {
                throw new IllegalArgumentException("negative asset byte length");
            }
            properties = immutableMap(properties);
        }
    }

    public record Reference(
            String id,
            ReferenceType type,
            String sourceElementId,
            String target,
            String relationshipId,
            boolean external,
            Map<String, String> properties) {
        public Reference {
            id = requireNonBlank(id, "reference id");
            Objects.requireNonNull(type, "type");
            sourceElementId = Objects.requireNonNullElse(sourceElementId, "");
            target = requireNonBlank(target, "reference target");
            relationshipId = Objects.requireNonNullElse(relationshipId, "");
            properties = immutableMap(properties);
        }
    }

    public record UnknownNativeFeature(
            String id,
            String nativePart,
            String featureKind,
            String nativeSha256,
            UnknownDisposition disposition,
            String reason) {
        public UnknownNativeFeature {
            id = requireNonBlank(id, "unknown feature id");
            nativePart = requireNonBlank(nativePart, "unknown nativePart");
            featureKind = requireNonBlank(featureKind, "unknown featureKind");
            requireSha256(nativeSha256, "unknown feature");
            Objects.requireNonNull(disposition, "disposition");
            reason = requireNonBlank(reason, "unknown feature reason");
        }
    }

    public CanonicalDocumentGraphV2 {
        if (!SCHEMA_V2.equals(schemaVersion)) {
            throw new IllegalArgumentException("unsupported CDG schema: " + schemaVersion);
        }
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        requireSha256(sourceSha256, "source");
        Objects.requireNonNull(kind, "kind");
        elements = immutableList(elements);
        assets = immutableList(assets);
        references = immutableList(references);
        unknownNativeFeatures = immutableList(unknownNativeFeatures);
        nativeParts = immutableList(nativeParts);
        provenance = immutableMap(provenance);
        validate(elements, assets, references, unknownNativeFeatures, nativeParts);
    }

    public Map<String, Element> elementsById() {
        LinkedHashMap<String, Element> out = new LinkedHashMap<>();
        for (Element element : elements) {
            out.put(element.id(), element);
        }
        return Map.copyOf(out);
    }

    public Element requireElement(String id) {
        Element element = elementsById().get(id);
        if (element == null) {
            throw new IllegalArgumentException("CDG-2 element not found: " + id);
        }
        return element;
    }

    public List<Element> childrenOf(String parentId) {
        ArrayList<Element> out = new ArrayList<>();
        for (Element element : elements) {
            if (Objects.equals(parentId, element.parentId())) {
                out.add(element);
            }
        }
        out.sort(Comparator.comparingInt(Element::ordinal).thenComparing(Element::id));
        return List.copyOf(out);
    }

    /** Deterministic semantic serialization; source byte digest and ZIP ordering are intentionally excluded. */
    public String canonicalSemanticText() {
        StringBuilder out = new StringBuilder();
        out.append(schemaVersion).append('|').append(sourceFormat).append('|').append(kind).append('\n');
        elements.stream().sorted(Comparator.comparing(Element::id)).forEach(element -> appendElement(out, element));
        assets.stream().sorted(Comparator.comparing(Asset::id)).forEach(asset -> appendAsset(out, asset));
        references.stream().sorted(Comparator.comparing(Reference::id)).forEach(reference -> appendReference(out, reference));
        unknownNativeFeatures.stream().sorted(Comparator.comparing(UnknownNativeFeature::id)).forEach(feature -> appendUnknown(out, feature));
        appendMap(out, "PROVENANCE", provenance);
        return out.toString();
    }

    public String semanticDigest() {
        return CanonicalDocumentGraph.sha256(canonicalSemanticText().getBytes(StandardCharsets.UTF_8));
    }

    public String nativeInventoryDigest() {
        StringBuilder out = new StringBuilder();
        nativeParts.stream().sorted(Comparator.comparing(CanonicalDocumentGraph.NativePart::partName)).forEach(part -> {
            out.append(escape(part.partName())).append('|').append(part.sha256()).append('|').append(part.preserveByDefault()).append('\n');
        });
        return CanonicalDocumentGraph.sha256(out.toString().getBytes(StandardCharsets.UTF_8));
    }

    static String stableElementId(DocumentFormat format, ElementType type, NativeAnchor anchor) {
        String material = format.name() + "|" + type.name() + "|" + anchor.nativePart() + "|" + anchor.locator() + "|" + anchor.nativeObjectId();
        String digest = CanonicalDocumentGraph.sha256(material.getBytes(StandardCharsets.UTF_8));
        return "e-" + digest.substring(0, 24);
    }

    static String stableObjectId(String prefix, String material) {
        String digest = CanonicalDocumentGraph.sha256((prefix + "|" + material).getBytes(StandardCharsets.UTF_8));
        return prefix + "-" + digest.substring(0, 24);
    }

    private static void validate(
            List<Element> elements,
            List<Asset> assets,
            List<Reference> references,
            List<UnknownNativeFeature> unknownNativeFeatures,
            List<CanonicalDocumentGraph.NativePart> nativeParts) {
        if (elements.isEmpty()) {
            throw new IllegalArgumentException("CDG-2 requires elements");
        }
        Set<String> elementIds = uniqueElementIds(elements);
        validateElementTree(elements, elementIds);
        Set<String> assetIds = uniqueAssetIds(assets);
        validateElementAssetReferences(elements, assetIds);
        validateReferences(references, elementIds);
        validateUnknownFeatures(unknownNativeFeatures);
        validateNativeParts(nativeParts);
    }

    private static Set<String> uniqueElementIds(List<Element> elements) {
        HashSet<String> ids = new HashSet<>();
        for (Element element : elements) {
            if (!ids.add(element.id())) {
                throw new IllegalArgumentException("duplicate CDG-2 element id: " + element.id());
            }
        }
        return Set.copyOf(ids);
    }

    private static void validateElementTree(List<Element> elements, Set<String> ids) {
        int roots = 0;
        for (Element element : elements) {
            if (element.type() == ElementType.ROOT) {
                roots++;
                if (element.parentId() != null) {
                    throw new IllegalArgumentException("CDG-2 root cannot have parent");
                }
            } else if (element.parentId() == null || element.parentId().isBlank()) {
                throw new IllegalArgumentException("CDG-2 non-root element requires parent: " + element.id());
            }
            if (element.parentId() != null && !ids.contains(element.parentId())) {
                throw new IllegalArgumentException("CDG-2 parent missing for " + element.id());
            }
        }
        if (roots != 1) {
            throw new IllegalArgumentException("CDG-2 requires exactly one root");
        }
    }

    private static Set<String> uniqueAssetIds(List<Asset> assets) {
        HashSet<String> ids = new HashSet<>();
        for (Asset asset : assets) {
            if (!ids.add(asset.id())) {
                throw new IllegalArgumentException("duplicate CDG-2 asset id: " + asset.id());
            }
        }
        return Set.copyOf(ids);
    }

    private static void validateElementAssetReferences(List<Element> elements, Set<String> assetIds) {
        for (Element element : elements) {
            for (String assetId : element.assetIds()) {
                if (!assetIds.contains(assetId)) {
                    throw new IllegalArgumentException("CDG-2 asset reference missing: " + assetId);
                }
            }
        }
    }

    private static void validateReferences(List<Reference> references, Set<String> elementIds) {
        HashSet<String> ids = new HashSet<>();
        for (Reference reference : references) {
            if (!ids.add(reference.id())) {
                throw new IllegalArgumentException("duplicate CDG-2 reference id: " + reference.id());
            }
            if (!reference.sourceElementId().isBlank() && !elementIds.contains(reference.sourceElementId())) {
                throw new IllegalArgumentException("CDG-2 reference source missing: " + reference.sourceElementId());
            }
        }
    }

    private static void validateUnknownFeatures(List<UnknownNativeFeature> features) {
        HashSet<String> ids = new HashSet<>();
        for (UnknownNativeFeature feature : features) {
            if (!ids.add(feature.id())) {
                throw new IllegalArgumentException("duplicate CDG-2 unknown feature id: " + feature.id());
            }
        }
    }

    private static void validateNativeParts(List<CanonicalDocumentGraph.NativePart> parts) {
        HashSet<String> names = new HashSet<>();
        for (CanonicalDocumentGraph.NativePart part : parts) {
            if (!names.add(part.partName())) {
                throw new IllegalArgumentException("duplicate CDG-2 native part: " + part.partName());
            }
        }
    }

    private static void appendElement(StringBuilder out, Element element) {
        out.append("ELEMENT|").append(escape(element.id())).append('|').append(element.type()).append('|')
                .append(escape(Objects.requireNonNullElse(element.parentId(), ""))).append('|').append(element.ordinal()).append('|')
                .append(escape(element.text())).append('|').append(escape(element.nativeAnchor().nativePart())).append('|')
                .append(escape(element.nativeAnchor().locator())).append('|').append(escape(element.nativeAnchor().nativeObjectId())).append('|')
                .append(escape(element.nativeAnchor().relationshipId())).append('\n');
        appendMap(out, "SEM:" + element.id(), withBase(element.semantic().properties(), "role", element.semantic().role(), "language", element.semantic().language()));
        appendStyle(out, element);
        appendGeometry(out, element);
        appendMap(out, "DATA:" + element.id(), withBase(element.data().properties(), "dataType", element.data().dataType(), "values", String.join("\u001f", element.data().values())));
        appendMap(out, "BEHAVIOR:" + element.id(), withBase(element.behavior().properties(), "types", String.join("\u001f", element.behavior().behaviorTypes())));
        appendMap(out, "A11Y:" + element.id(), withBase(element.accessibility().properties(), "role", element.accessibility().role(), "title", element.accessibility().title(), "alt", element.accessibility().alternativeText(), "readingOrder", element.accessibility().readingOrderKey()));
        appendMap(out, "REVIEW:" + element.id(), withBase(element.review().properties(), "comments", String.join("\u001f", element.review().commentIds()), "revisions", String.join("\u001f", element.review().revisionIds())));
        appendMap(out, "EXT:" + element.id(), element.extensions());
        for (String assetId : element.assetIds().stream().sorted().toList()) {
            out.append("ELEMENT_ASSET|").append(escape(element.id())).append('|').append(escape(assetId)).append('\n');
        }
        element.evidence().stream().sorted(Comparator.comparing(EvidenceLink::evidenceId)).forEach(evidence -> {
            out.append("EVIDENCE|").append(escape(element.id())).append('|').append(escape(evidence.evidenceType())).append('|')
                    .append(escape(evidence.authorityId())).append('|').append(escape(evidence.evidenceId())).append('|')
                    .append(escape(evidence.sha256())).append('\n');
        });
    }

    private static void appendStyle(StringBuilder out, Element element) {
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        values.put("declaredStyleId", element.style().declaredStyleId());
        values.put("inheritanceChain", String.join("\u001f", element.style().inheritanceChain()));
        element.style().declaredProperties().forEach((key, value) -> values.put("declared." + key, value));
        element.style().resolvedProperties().forEach((key, value) -> values.put("resolved." + key, value));
        appendMap(out, "STYLE:" + element.id(), values);
    }

    private static void appendGeometry(StringBuilder out, Element element) {
        LinkedHashMap<String, String> values = new LinkedHashMap<>();
        values.put("space", element.geometry().coordinateSpace());
        values.put("x", element.geometry().x());
        values.put("y", element.geometry().y());
        values.put("width", element.geometry().width());
        values.put("height", element.geometry().height());
        values.put("rotation", element.geometry().rotation());
        values.put("zOrder", Integer.toString(element.geometry().zOrder()));
        values.putAll(element.geometry().properties());
        appendMap(out, "GEOMETRY:" + element.id(), values);
    }

    private static void appendAsset(StringBuilder out, Asset asset) {
        out.append("ASSET|").append(escape(asset.id())).append('|').append(asset.type()).append('|')
                .append(escape(asset.nativePart())).append('|').append(escape(asset.mediaType())).append('|')
                .append(asset.sha256()).append('|').append(asset.byteLength()).append('\n');
        appendMap(out, "ASSET_META:" + asset.id(), asset.properties());
    }

    private static void appendReference(StringBuilder out, Reference reference) {
        out.append("REFERENCE|").append(escape(reference.id())).append('|').append(reference.type()).append('|')
                .append(escape(reference.sourceElementId())).append('|').append(escape(reference.target())).append('|')
                .append(escape(reference.relationshipId())).append('|').append(reference.external()).append('\n');
        appendMap(out, "REFERENCE_META:" + reference.id(), reference.properties());
    }

    private static void appendUnknown(StringBuilder out, UnknownNativeFeature feature) {
        out.append("UNKNOWN|").append(escape(feature.id())).append('|').append(escape(feature.nativePart())).append('|')
                .append(escape(feature.featureKind())).append('|').append(feature.nativeSha256()).append('|')
                .append(feature.disposition()).append('|').append(escape(feature.reason())).append('\n');
    }

    private static void appendMap(StringBuilder out, String prefix, Map<String, String> values) {
        values.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            out.append(prefix).append('|').append(escape(entry.getKey())).append('=').append(escape(entry.getValue())).append('\n');
        });
    }

    private static Map<String, String> withBase(Map<String, String> source, String... keyValues) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            out.put(keyValues[i], Objects.requireNonNullElse(keyValues[i + 1], ""));
        }
        out.putAll(source);
        return Map.copyOf(out);
    }

    private static String escape(String value) {
        return Objects.requireNonNullElse(value, "")
                .replace("\\", "\\\\")
                .replace("|", "\\|")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private static String requireNonBlank(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " required");
        }
        return value;
    }

    private static void requireSha256(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException(name + " sha256 required");
        }
    }

    private static <T> List<T> immutableList(List<T> values) {
        return List.copyOf(Objects.requireNonNullElse(values, List.of()));
    }

    private static Map<String, String> immutableMap(Map<String, String> values) {
        return Map.copyOf(Objects.requireNonNullElse(values, Map.of()));
    }
}
