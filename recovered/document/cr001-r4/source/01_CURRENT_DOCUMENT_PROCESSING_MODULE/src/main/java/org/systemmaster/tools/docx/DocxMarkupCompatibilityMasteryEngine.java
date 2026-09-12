package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Attr;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.XMLConstants;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * DOCUMENT-DOCX-MASTERY-T13 native Markup Compatibility and namespace-evolution engine.
 *
 * <p>This engine deliberately separates three concerns:</p>
 * <ul>
 *   <li>inventory/preservation of the original package;</li>
 *   <li>profile-specific compatibility interpretation;</li>
 *   <li>explicit creation/editing of compatibility markup.</li>
 * </ul>
 *
 * <p>Profile-specific materialization always produces a derived artifact. It never overwrites the
 * source byte array and always returns a degradation ledger. Exact Microsoft Word behavior is not
 * inferred from this portable implementation.</p>
 */
public final class DocxMarkupCompatibilityMasteryEngine {
    public static final String MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
    public static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    public static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    public static final String A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    public static final String WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
    public static final String XMLNS = XMLConstants.XMLNS_ATTRIBUTE_NS_URI;

    public static final String W14 = "http://schemas.microsoft.com/office/word/2010/wordml";
    public static final String W15 = "http://schemas.microsoft.com/office/word/2012/wordml";
    public static final String W16CID = "http://schemas.microsoft.com/office/word/2016/wordml/cid";
    public static final String W16CEX = "http://schemas.microsoft.com/office/word/2018/wordml/cex";
    public static final String W16CUR = "http://schemas.microsoft.com/office/word/2018/wordml";
    public static final String W16DU = "http://schemas.microsoft.com/office/word/2023/wordml/word16du";
    public static final String WPS = "http://schemas.microsoft.com/office/word/2010/wordprocessingShape";
    public static final String WPG = "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup";
    public static final String WPC = "http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas";
    public static final String WP14 = "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing";
    public static final String WP15 = "http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing";
    public static final String WOE = "http://schemas.microsoft.com/office/word/2020/wordml/oembed";

    private static final Map<String, String> VERSIONED_NAMESPACE_FAMILIES = Map.ofEntries(
            Map.entry(W14, "WORD_W14_2010"),
            Map.entry(W15, "WORD_W15_2012"),
            Map.entry(W16CID, "WORD_W16CID_2016"),
            Map.entry(W16CEX, "WORD_W16CEX_2018"),
            Map.entry(W16CUR, "WORD_W16CUR_2018"),
            Map.entry(W16DU, "WORD_W16DU_2023"),
            Map.entry(WPS, "WORDPROCESSING_SHAPE_2010"),
            Map.entry(WPG, "WORDPROCESSING_GROUP_2010"),
            Map.entry(WPC, "WORDPROCESSING_CANVAS_2010"),
            Map.entry(WP14, "WORDPROCESSING_DRAWING_2010"),
            Map.entry(WP15, "WORDPROCESSING_DRAWING_2012"),
            Map.entry(WOE, "WORD_OEMBED_2020"));

    private static final Set<String> BASE_UNDERSTOOD_NAMESPACES = Set.of(
            W,
            R,
            A,
            WP,
            "http://schemas.openxmlformats.org/package/2006/relationships",
            "http://schemas.openxmlformats.org/package/2006/content-types",
            "http://schemas.openxmlformats.org/officeDocument/2006/math",
            "http://schemas.openxmlformats.org/drawingml/2006/picture",
            "http://schemas.openxmlformats.org/drawingml/2006/chart",
            "http://schemas.openxmlformats.org/drawingml/2006/diagram",
            "urn:schemas-microsoft-com:vml",
            "urn:schemas-microsoft-com:office:office",
            "http://www.w3.org/XML/1998/namespace");

    public enum BranchKind { CHOICE, FALLBACK, NONE }

    public enum DegradationAction {
        SELECT_CHOICE,
        SELECT_FALLBACK,
        REMOVE_ALTERNATE_CONTENT_WITHOUT_REPLACEMENT,
        REMOVE_IGNORABLE_ELEMENT,
        UNWRAP_PROCESS_CONTENT,
        REMOVE_IGNORABLE_ATTRIBUTE,
        PRESERVATION_HINT_RECORDED_NOT_REQUIRED_BY_OOXML,
        VERSIONED_FEATURE_PRESERVED_IN_SOURCE
    }

    public enum FeatureKind { ELEMENT, ATTRIBUTE }

    public record CompatibilityProfile(String id, Set<String> understoodNamespaces) {
        public CompatibilityProfile {
            if (id == null || id.isBlank()) throw new IllegalArgumentException("profile id required");
            LinkedHashSet<String> all = new LinkedHashSet<>(BASE_UNDERSTOOD_NAMESPACES);
            if (understoodNamespaces != null) {
                for (String uri : understoodNamespaces) {
                    if (uri == null || uri.isBlank()) throw new IllegalArgumentException("blank understood namespace");
                    all.add(uri);
                }
            }
            understoodNamespaces = Set.copyOf(all);
        }

        public boolean understands(String namespaceUri) {
            return namespaceUri != null && (MC.equals(namespaceUri) || understoodNamespaces.contains(namespaceUri));
        }

        public static CompatibilityProfile base2007() {
            return new CompatibilityProfile("OOXML_BASE_2007", Set.of());
        }

        public static CompatibilityProfile withExtensions(String id, String... namespaceUris) {
            return new CompatibilityProfile(id, Set.of(namespaceUris));
        }
    }

    public record QNameRef(String lexical, String prefix, String localName, String namespaceUri, boolean wildcard) {
        public QNameRef {
            lexical = requireNonBlank(lexical, "qualified-name lexical value");
            prefix = requireNonBlank(prefix, "qualified-name prefix");
            localName = requireNonBlank(localName, "qualified-name local name");
            namespaceUri = requireNonBlank(namespaceUri, "qualified-name namespace URI");
        }

        boolean matches(Element element) {
            return Objects.equals(namespaceUri, element.getNamespaceURI()) && (wildcard || localName.equals(element.getLocalName()));
        }

        boolean matches(Attr attribute) {
            return Objects.equals(namespaceUri, attribute.getNamespaceURI()) && (wildcard || localName.equals(attribute.getLocalName()));
        }
    }

    public record CompatibilityRuleSnapshot(
            String partName,
            String locator,
            List<String> ignorablePrefixes,
            List<String> ignorableNamespaceUris,
            List<String> mustUnderstandPrefixes,
            List<String> mustUnderstandNamespaceUris,
            List<QNameRef> processContent,
            List<QNameRef> preserveElements,
            List<QNameRef> preserveAttributes) {
        public CompatibilityRuleSnapshot {
            partName = requireNonBlank(partName, "partName");
            locator = requireNonBlank(locator, "locator");
            ignorablePrefixes = List.copyOf(ignorablePrefixes);
            ignorableNamespaceUris = List.copyOf(ignorableNamespaceUris);
            mustUnderstandPrefixes = List.copyOf(mustUnderstandPrefixes);
            mustUnderstandNamespaceUris = List.copyOf(mustUnderstandNamespaceUris);
            processContent = List.copyOf(processContent);
            preserveElements = List.copyOf(preserveElements);
            preserveAttributes = List.copyOf(preserveAttributes);
        }
    }

    public record ChoiceSnapshot(int index, List<String> requiresPrefixes, List<String> requiredNamespaceUris, String nativeStructuralSha256) {
        public ChoiceSnapshot {
            if (index < 1) throw new IllegalArgumentException("choice index must be >= 1");
            requiresPrefixes = List.copyOf(requiresPrefixes);
            requiredNamespaceUris = List.copyOf(requiredNamespaceUris);
            nativeStructuralSha256 = requireSha256(nativeStructuralSha256, "choice structural digest");
        }
    }

    public record AlternateContentSnapshot(
            String partName,
            String locator,
            List<ChoiceSnapshot> choices,
            boolean fallbackPresent,
            String fallbackStructuralSha256,
            String sourcePartSha256) {
        public AlternateContentSnapshot {
            partName = requireNonBlank(partName, "partName");
            locator = requireNonBlank(locator, "locator");
            choices = List.copyOf(choices);
            if (choices.isEmpty()) throw new IllegalArgumentException("AlternateContent must contain at least one Choice");
            fallbackStructuralSha256 = fallbackPresent ? requireSha256(fallbackStructuralSha256, "fallback digest") : "";
            sourcePartSha256 = requireSha256(sourcePartSha256, "source part digest");
        }
    }

    public record VersionedFeatureSnapshot(
            String partName,
            String locator,
            FeatureKind kind,
            String prefix,
            String namespaceUri,
            String localName,
            String namespaceFamily,
            String sourcePartSha256) {
        public VersionedFeatureSnapshot {
            partName = requireNonBlank(partName, "partName");
            locator = requireNonBlank(locator, "locator");
            Objects.requireNonNull(kind, "kind");
            prefix = Objects.requireNonNullElse(prefix, "");
            namespaceUri = requireNonBlank(namespaceUri, "namespaceUri");
            localName = requireNonBlank(localName, "localName");
            namespaceFamily = requireNonBlank(namespaceFamily, "namespaceFamily");
            sourcePartSha256 = requireSha256(sourcePartSha256, "source part digest");
        }
    }

    public record PackageSnapshot(
            String sourceSha256,
            List<CompatibilityRuleSnapshot> compatibilityRules,
            List<AlternateContentSnapshot> alternateContent,
            List<VersionedFeatureSnapshot> versionedFeatures,
            Set<String> namespaceUris) {
        public PackageSnapshot {
            sourceSha256 = requireSha256(sourceSha256, "source package digest");
            compatibilityRules = List.copyOf(compatibilityRules);
            alternateContent = List.copyOf(alternateContent);
            versionedFeatures = List.copyOf(versionedFeatures);
            namespaceUris = Set.copyOf(namespaceUris);
        }
    }

    public record ResolutionDecision(String partName, String locator, BranchKind branchKind, int choiceIndex, List<String> requiredNamespaceUris, String reason) {
        public ResolutionDecision {
            partName = requireNonBlank(partName, "partName");
            locator = requireNonBlank(locator, "locator");
            Objects.requireNonNull(branchKind, "branchKind");
            if (branchKind == BranchKind.CHOICE && choiceIndex < 1) throw new IllegalArgumentException("choice index required");
            if (branchKind == BranchKind.FALLBACK && choiceIndex != 0) throw new IllegalArgumentException("fallback choiceIndex must be zero");
            if (branchKind == BranchKind.NONE && choiceIndex != 0) throw new IllegalArgumentException("none choiceIndex must be zero");
            requiredNamespaceUris = List.copyOf(requiredNamespaceUris);
            reason = requireNonBlank(reason, "resolution reason");
        }
    }

    public record DegradationEvent(String partName, String locator, DegradationAction action, String namespaceUri, String localName, String reason) {
        public DegradationEvent {
            partName = requireNonBlank(partName, "partName");
            locator = requireNonBlank(locator, "locator");
            Objects.requireNonNull(action, "action");
            namespaceUri = Objects.requireNonNullElse(namespaceUri, "");
            localName = Objects.requireNonNullElse(localName, "");
            reason = requireNonBlank(reason, "degradation reason");
        }
    }

    public record MaterializedView(
            byte[] bytes,
            String sourceSha256,
            String resultSha256,
            CompatibilityProfile profile,
            List<ResolutionDecision> resolutions,
            List<DegradationEvent> degradationLedger) {
        public MaterializedView {
            bytes = Objects.requireNonNull(bytes, "bytes").clone();
            sourceSha256 = requireSha256(sourceSha256, "source digest");
            resultSha256 = requireSha256(resultSha256, "result digest");
            Objects.requireNonNull(profile, "profile");
            resolutions = List.copyOf(resolutions);
            degradationLedger = List.copyOf(degradationLedger);
        }

        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public record MutationProof(
            byte[] bytes,
            String sourceSha256,
            String resultSha256,
            String targetPart,
            int unchangedPackageParts,
            int protectedBranchFingerprints,
            boolean unrelatedPartsByteIdentical,
            boolean protectedBranchesStructurallyIdentical) {
        public MutationProof {
            bytes = Objects.requireNonNull(bytes, "bytes").clone();
            sourceSha256 = requireSha256(sourceSha256, "source digest");
            resultSha256 = requireSha256(resultSha256, "result digest");
            targetPart = requireNonBlank(targetPart, "targetPart");
            if (unchangedPackageParts < 0 || protectedBranchFingerprints < 0) throw new IllegalArgumentException("negative preservation counts");
        }

        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public Map<String, String> versionedNamespaceRegistry() {
        return VERSIONED_NAMESPACE_FAMILIES;
    }

    public PackageSnapshot inspect(byte[] packageBytes) throws IOException {
        Objects.requireNonNull(packageBytes, "packageBytes");
        Map<String, byte[]> parts = OoxmlPackageSupport.read(packageBytes);
        ArrayList<CompatibilityRuleSnapshot> rules = new ArrayList<>();
        ArrayList<AlternateContentSnapshot> alternate = new ArrayList<>();
        ArrayList<VersionedFeatureSnapshot> versioned = new ArrayList<>();
        LinkedHashSet<String> namespaces = new LinkedHashSet<>();

        for (String partName : markupXmlParts(parts)) {
            byte[] partBytes = parts.get(partName);
            Document document = OoxmlPackageSupport.parseXml(partBytes);
            String partSha = OoxmlPackageSupport.sha256(partBytes);
            scanElement(document.getDocumentElement(), partName, "/" + qualifiedName(document.getDocumentElement()) + "[1]", partSha,
                    rules, alternate, versioned, namespaces, false);
        }
        return new PackageSnapshot(OoxmlPackageSupport.sha256(packageBytes), rules, alternate, versioned, namespaces);
    }

    public List<ResolutionDecision> resolve(byte[] packageBytes, CompatibilityProfile profile) throws IOException {
        Objects.requireNonNull(profile, "profile");
        Map<String, byte[]> parts = OoxmlPackageSupport.read(packageBytes);
        ArrayList<ResolutionDecision> out = new ArrayList<>();
        for (String partName : markupXmlParts(parts)) {
            Document document = OoxmlPackageSupport.parseXml(parts.get(partName));
            resolveAlternateContent(document.getDocumentElement(), partName, "/" + qualifiedName(document.getDocumentElement()) + "[1]", profile, out, false);
        }
        return List.copyOf(out);
    }

    public MaterializedView materializeCompatibleView(byte[] packageBytes, CompatibilityProfile profile) throws IOException {
        Objects.requireNonNull(packageBytes, "packageBytes");
        Objects.requireNonNull(profile, "profile");
        String sourceSha = OoxmlPackageSupport.sha256(packageBytes);
        Map<String, byte[]> sourceParts = OoxmlPackageSupport.read(packageBytes);
        LinkedHashMap<String, byte[]> resultParts = new LinkedHashMap<>(sourceParts);
        ArrayList<ResolutionDecision> resolutions = new ArrayList<>();
        ArrayList<DegradationEvent> ledger = new ArrayList<>();

        for (String partName : markupXmlParts(sourceParts)) {
            Document document = OoxmlPackageSupport.parseXml(sourceParts.get(partName));
            RuleScope rootScope = RuleScope.empty();
            processElement(document.getDocumentElement(), partName, "/" + qualifiedName(document.getDocumentElement()) + "[1]",
                    profile, rootScope, resolutions, ledger, true);
            resultParts.put(partName, OoxmlPackageSupport.serialize(document));
        }
        byte[] result = OoxmlPackageSupport.write(resultParts);
        if (!sourceSha.equals(OoxmlPackageSupport.sha256(packageBytes))) {
            throw new IllegalStateException("source package mutated during compatibility materialization");
        }
        return new MaterializedView(result, sourceSha, OoxmlPackageSupport.sha256(result), profile, resolutions, ledger);
    }

    public MutationProof createAlternateContentText(
            byte[] packageBytes,
            int paragraphIndex,
            String requiredPrefix,
            String requiredNamespaceUri,
            String choiceText,
            String fallbackText) throws IOException {
        if (paragraphIndex < 1) throw new IllegalArgumentException("paragraphIndex must be >= 1");
        requiredPrefix = requireNcName(requiredPrefix, "requiredPrefix");
        requiredNamespaceUri = requireNonBlank(requiredNamespaceUri, "requiredNamespaceUri");
        choiceText = Objects.requireNonNullElse(choiceText, "");
        fallbackText = Objects.requireNonNullElse(fallbackText, "");
        Map<String, byte[]> before = OoxmlPackageSupport.read(packageBytes);
        byte[] documentBytes = requirePart(before, "word/document.xml");
        Document document = OoxmlPackageSupport.parseXml(documentBytes);
        Element root = document.getDocumentElement();
        ensureNamespace(root, "mc", MC);
        ensureNamespace(root, requiredPrefix, requiredNamespaceUri);
        addPrefixToken(root, MC, "Ignorable", requiredPrefix);
        Element body = first(document.getElementsByTagNameNS(W, "body"));
        if (body == null) throw new IOException("DOCX body missing");
        List<Element> paragraphs = directChildren(body, W, "p");
        if (paragraphIndex > paragraphs.size()) throw new IllegalArgumentException("paragraphIndex out of range: " + paragraphIndex);
        Element paragraph = paragraphs.get(paragraphIndex - 1);
        Element run = document.createElementNS(W, "w:r");
        Element ac = document.createElementNS(MC, "mc:AlternateContent");
        Element choice = document.createElementNS(MC, "mc:Choice");
        choice.setAttribute("Requires", requiredPrefix);
        Element choiceTextElement = document.createElementNS(W, "w:t");
        choiceTextElement.setTextContent(choiceText);
        choice.appendChild(choiceTextElement);
        Element fallback = document.createElementNS(MC, "mc:Fallback");
        Element fallbackTextElement = document.createElementNS(W, "w:t");
        fallbackTextElement.setTextContent(fallbackText);
        fallback.appendChild(fallbackTextElement);
        ac.appendChild(choice);
        ac.appendChild(fallback);
        run.appendChild(ac);
        paragraph.appendChild(run);
        validateAlternateContent(ac, "word/document.xml", "created AlternateContent");
        return replaceDocumentWithProof(packageBytes, before, document, Map.of());
    }

    public MutationProof editAlternateContentText(byte[] packageBytes, int alternateContentIndex, BranchKind branchKind, int branchIndex, String newText) throws IOException {
        if (alternateContentIndex < 1) throw new IllegalArgumentException("alternateContentIndex must be >= 1");
        if (branchIndex < 1) throw new IllegalArgumentException("branchIndex must be >= 1");
        Objects.requireNonNull(branchKind, "branchKind");
        newText = Objects.requireNonNullElse(newText, "");
        Map<String, byte[]> before = OoxmlPackageSupport.read(packageBytes);
        byte[] documentBytes = requirePart(before, "word/document.xml");
        Document document = OoxmlPackageSupport.parseXml(documentBytes);
        List<Element> acs = elements(document, MC, "AlternateContent");
        if (alternateContentIndex > acs.size()) throw new IllegalArgumentException("AlternateContent index out of range");
        Element ac = acs.get(alternateContentIndex - 1);
        validateAlternateContent(ac, "word/document.xml", "AlternateContent:" + alternateContentIndex);

        List<Element> branches = branchKind == BranchKind.CHOICE ? directChildren(ac, MC, "Choice") : directChildren(ac, MC, "Fallback");
        if (branchIndex > branches.size()) throw new IllegalArgumentException("branch index out of range");
        Element target = branches.get(branchIndex - 1);

        LinkedHashMap<String, String> protectedFingerprints = new LinkedHashMap<>();
        int choiceOrdinal = 0;
        int fallbackOrdinal = 0;
        for (Element branch : directElementChildren(ac)) {
            String key;
            if (MC.equals(branch.getNamespaceURI()) && "Choice".equals(branch.getLocalName())) key = "CHOICE:" + (++choiceOrdinal);
            else if (MC.equals(branch.getNamespaceURI()) && "Fallback".equals(branch.getLocalName())) key = "FALLBACK:" + (++fallbackOrdinal);
            else continue;
            if (branch != target) protectedFingerprints.put(key, structuralSha256(branch));
        }
        List<Element> texts = elements(target, W, "t");
        if (texts.size() != 1) throw new IllegalStateException("generic T13 branch text edit requires exactly one w:t in target branch");
        texts.get(0).setTextContent(newText);
        validateAlternateContent(ac, "word/document.xml", "AlternateContent:" + alternateContentIndex);
        MutationProof proof = replaceDocumentWithProof(packageBytes, before, document, protectedFingerprints);
        if (!proof.protectedBranchesStructurallyIdentical()) throw new IllegalStateException("unowned AlternateContent branch changed during scoped edit");
        return proof;
    }

    private MutationProof replaceDocumentWithProof(byte[] source, Map<String, byte[]> before, Document document, Map<String, String> protectedFingerprints) throws IOException {
        byte[] replacement = OoxmlPackageSupport.serialize(document);
        byte[] result = OoxmlPackageSupport.replacePart(source, "word/document.xml", replacement, OoxmlPackageSupport.sha256(before.get("word/document.xml")));
        Map<String, byte[]> after = OoxmlPackageSupport.read(result);
        int unchangedParts = 0;
        boolean byteIdentical = true;
        for (Map.Entry<String, byte[]> entry : before.entrySet()) {
            if ("word/document.xml".equals(entry.getKey())) continue;
            byte[] other = after.get(entry.getKey());
            if (other != null && java.util.Arrays.equals(entry.getValue(), other)) unchangedParts++;
            else byteIdentical = false;
        }
        boolean protectedIdentical = true;
        if (!protectedFingerprints.isEmpty()) {
            Document afterDocument = OoxmlPackageSupport.parseXml(after.get("word/document.xml"));
            List<Element> afterAcs = elements(afterDocument, MC, "AlternateContent");
            if (afterAcs.isEmpty()) protectedIdentical = false;
            else {
                Element ac = afterAcs.get(0);
                int choiceOrdinal = 0;
                int fallbackOrdinal = 0;
                int matched = 0;
                for (Element branch : directElementChildren(ac)) {
                    String key;
                    if (MC.equals(branch.getNamespaceURI()) && "Choice".equals(branch.getLocalName())) key = "CHOICE:" + (++choiceOrdinal);
                    else if (MC.equals(branch.getNamespaceURI()) && "Fallback".equals(branch.getLocalName())) key = "FALLBACK:" + (++fallbackOrdinal);
                    else continue;
                    if (protectedFingerprints.containsKey(key)) {
                        matched++;
                        if (!protectedFingerprints.get(key).equals(structuralSha256(branch))) protectedIdentical = false;
                    }
                }
                if (matched != protectedFingerprints.size()) protectedIdentical = false;
            }
        }
        return new MutationProof(result, OoxmlPackageSupport.sha256(source), OoxmlPackageSupport.sha256(result), "word/document.xml",
                unchangedParts, protectedFingerprints.size(), byteIdentical, protectedIdentical);
    }

    private void scanElement(
            Element element,
            String partName,
            String locator,
            String partSha,
            List<CompatibilityRuleSnapshot> rules,
            List<AlternateContentSnapshot> alternate,
            List<VersionedFeatureSnapshot> versioned,
            Set<String> namespaces,
            boolean parentAlternateContent) throws IOException {
        String namespace = element.getNamespaceURI();
        if (namespace != null && !namespace.isBlank()) namespaces.add(namespace);
        CompatibilityRuleSnapshot rule = ruleSnapshot(element, partName, locator);
        if (rule != null) rules.add(rule);
        if (MC.equals(namespace) && "AlternateContent".equals(element.getLocalName())) {
            if (parentAlternateContent) throw new IOException("nested mc:AlternateContent is not conformant: " + partName + " " + locator);
            alternate.add(snapshotAlternateContent(element, partName, locator, partSha));
        }
        if (namespace != null && VERSIONED_NAMESPACE_FAMILIES.containsKey(namespace)) {
            versioned.add(new VersionedFeatureSnapshot(partName, locator, FeatureKind.ELEMENT,
                    Objects.requireNonNullElse(element.getPrefix(), ""), namespace, element.getLocalName(), VERSIONED_NAMESPACE_FAMILIES.get(namespace), partSha));
        }
        NamedNodeMap attributes = element.getAttributes();
        for (int i = 0; i < attributes.getLength(); i++) {
            Node node = attributes.item(i);
            if (!(node instanceof Attr attr)) continue;
            String attrNs = attr.getNamespaceURI();
            if (attrNs != null && !attrNs.isBlank() && !XMLNS.equals(attrNs)) namespaces.add(attrNs);
            if (attrNs != null && VERSIONED_NAMESPACE_FAMILIES.containsKey(attrNs)) {
                versioned.add(new VersionedFeatureSnapshot(partName, locator + "/@" + qualifiedName(attr), FeatureKind.ATTRIBUTE,
                        Objects.requireNonNullElse(attr.getPrefix(), ""), attrNs, attr.getLocalName(), VERSIONED_NAMESPACE_FAMILIES.get(attrNs), partSha));
            }
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Element child : directElementChildren(element)) {
            String key = qualifiedName(child);
            int count = counts.merge(key, 1, Integer::sum);
            scanElement(child, partName, locator + "/" + key + "[" + count + "]", partSha, rules, alternate, versioned, namespaces,
                    MC.equals(namespace) && "AlternateContent".equals(element.getLocalName()));
        }
    }

    private void resolveAlternateContent(Element element, String partName, String locator, CompatibilityProfile profile,
                                         List<ResolutionDecision> out, boolean parentAlternateContent) throws IOException {
        boolean isAlternate = MC.equals(element.getNamespaceURI()) && "AlternateContent".equals(element.getLocalName());
        if (isAlternate) {
            if (parentAlternateContent) throw new IOException("nested mc:AlternateContent is not conformant: " + partName + " " + locator);
            validateAlternateContent(element, partName, locator);
            out.add(selectBranch(element, partName, locator, profile));
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Element child : directElementChildren(element)) {
            String key = qualifiedName(child);
            int count = counts.merge(key, 1, Integer::sum);
            resolveAlternateContent(child, partName, locator + "/" + key + "[" + count + "]", profile, out, isAlternate);
        }
    }

    private void processElement(
            Element element,
            String partName,
            String locator,
            CompatibilityProfile profile,
            RuleScope inherited,
            List<ResolutionDecision> resolutions,
            List<DegradationEvent> ledger,
            boolean isRoot) throws IOException {
        RuleScope local = inherited.derive(element);
        for (String uri : local.mustUnderstand) {
            if (!profile.understands(uri)) {
                throw new IOException("mc:MustUnderstand namespace is unsupported by profile " + profile.id() + ": " + uri + " at " + partName + " " + locator);
            }
        }

        if (MC.equals(element.getNamespaceURI()) && "AlternateContent".equals(element.getLocalName())) {
            processAlternateContent(element, partName, locator, profile, inherited, resolutions, ledger);
            return;
        }

        processAttributes(element, partName, locator, profile, local, ledger);
        List<Element> children = directElementChildren(element);
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (Element child : children) {
            String key = qualifiedName(child);
            int count = counts.merge(key, 1, Integer::sum);
            String childLocator = locator + "/" + key + "[" + count + "]";
            String namespace = child.getNamespaceURI();
            RuleScope childScope = local.derive(child);
            if (isCompatibilityNamespace(namespace) || profile.understands(namespace) || namespace == null || namespace.isBlank()) {
                processElement(child, partName, childLocator, profile, local, resolutions, ledger, false);
                continue;
            }
            if (childScope.mustUnderstand.contains(namespace)) {
                throw new IOException("unsupported MustUnderstand element namespace: " + namespace + " at " + childLocator);
            }
            if (!childScope.ignorable.contains(namespace)) {
                throw new IOException("non-understood non-ignorable namespace: " + namespace + " at " + childLocator);
            }
            if (matchesAny(childScope.processContent, child)) {
                ledger.add(new DegradationEvent(partName, childLocator, DegradationAction.UNWRAP_PROCESS_CONTENT, namespace, child.getLocalName(),
                        "Ignorable wrapper removed but its child content is processed under mc:ProcessContent."));
                List<Node> moving = childNodes(child);
                Node parent = child.getParentNode();
                for (Node movingNode : moving) {
                    if (movingNode instanceof Element movingElement) copyNamespaceDeclarations(child, movingElement);
                    parent.insertBefore(movingNode, child);
                    if (movingNode instanceof Element movingElement) {
                        processElement(movingElement, partName, childLocator + "/content/" + qualifiedName(movingElement), profile, childScope, resolutions, ledger, false);
                    }
                }
                parent.removeChild(child);
            } else {
                if (matchesAny(childScope.preserveElements, child)) {
                    ledger.add(new DegradationEvent(partName, childLocator, DegradationAction.PRESERVATION_HINT_RECORDED_NOT_REQUIRED_BY_OOXML,
                            namespace, child.getLocalName(), "mc:PreserveElements hint recorded; source is preserved, but target-compatible derived view removes unsupported ignorable markup."));
                }
                ledger.add(new DegradationEvent(partName, childLocator, DegradationAction.REMOVE_IGNORABLE_ELEMENT, namespace, child.getLocalName(),
                        "Unsupported namespace is declared ignorable for this scope."));
                child.getParentNode().removeChild(child);
            }
        }

        if (isRoot) {
            removeCompatibilityAttributesRecursively(element);
        }
    }

    private void processAlternateContent(
            Element ac,
            String partName,
            String locator,
            CompatibilityProfile profile,
            RuleScope inherited,
            List<ResolutionDecision> resolutions,
            List<DegradationEvent> ledger) throws IOException {
        validateAlternateContent(ac, partName, locator);
        RuleScope acScope = inherited.derive(ac);
        for (String uri : acScope.mustUnderstand) {
            if (!profile.understands(uri)) throw new IOException("unsupported MustUnderstand namespace on AlternateContent: " + uri);
        }
        ResolutionDecision decision = selectBranch(ac, partName, locator, profile);
        Element selected = null;
        if (decision.branchKind() == BranchKind.CHOICE) {
            List<Element> choices = directChildren(ac, MC, "Choice");
            selected = choices.get(decision.choiceIndex() - 1);
            ledger.add(new DegradationEvent(partName, locator, DegradationAction.SELECT_CHOICE, "", "AlternateContent", decision.reason()));
        } else if (decision.branchKind() == BranchKind.FALLBACK) {
            selected = directChildren(ac, MC, "Fallback").get(0);
            ledger.add(new DegradationEvent(partName, locator, DegradationAction.SELECT_FALLBACK, "", "AlternateContent", decision.reason()));
        }
        resolutions.add(decision);
        Node parent = ac.getParentNode();
        if (selected == null) {
            ledger.add(new DegradationEvent(partName, locator, DegradationAction.REMOVE_ALTERNATE_CONTENT_WITHOUT_REPLACEMENT, "", "AlternateContent",
                    "No Choice is supported and no Fallback exists; content is processed as if AlternateContent were absent."));
            parent.removeChild(ac);
            return;
        }
        RuleScope selectedScope = acScope.derive(selected);
        for (String uri : selectedScope.mustUnderstand) {
            if (!profile.understands(uri)) throw new IOException("unsupported MustUnderstand namespace on selected alternate branch: " + uri);
        }
        List<Node> moving = childNodes(selected);
        for (Node child : moving) {
            if (child instanceof Element childElement) {
                copyNamespaceDeclarations(ac, childElement);
                copyNamespaceDeclarations(selected, childElement);
            }
            parent.insertBefore(child, ac);
            if (child instanceof Element childElement) {
                processElement(childElement, partName, locator + "/selected/" + qualifiedName(childElement), profile, selectedScope, resolutions, ledger, false);
            }
        }
        parent.removeChild(ac);
    }

    private void processAttributes(Element element, String partName, String locator, CompatibilityProfile profile, RuleScope scope,
                                   List<DegradationEvent> ledger) throws IOException {
        ArrayList<Attr> attributes = new ArrayList<>();
        NamedNodeMap map = element.getAttributes();
        for (int i = 0; i < map.getLength(); i++) if (map.item(i) instanceof Attr attr) attributes.add(attr);
        for (Attr attr : attributes) {
            String ns = attr.getNamespaceURI();
            if (XMLNS.equals(ns) || MC.equals(ns) || XMLConstants.XML_NS_URI.equals(ns) || ns == null || ns.isBlank() || profile.understands(ns)) continue;
            if (scope.mustUnderstand.contains(ns)) throw new IOException("unsupported MustUnderstand attribute namespace: " + ns + " at " + locator);
            if (!scope.ignorable.contains(ns)) throw new IOException("non-understood non-ignorable attribute namespace: " + ns + " at " + locator);
            if (matchesAny(scope.preserveAttributes, attr)) {
                ledger.add(new DegradationEvent(partName, locator + "/@" + qualifiedName(attr), DegradationAction.PRESERVATION_HINT_RECORDED_NOT_REQUIRED_BY_OOXML,
                        ns, attr.getLocalName(), "mc:PreserveAttributes hint recorded; source is preserved while the derived target view removes the unsupported attribute."));
            }
            element.removeAttributeNode(attr);
            ledger.add(new DegradationEvent(partName, locator + "/@" + qualifiedName(attr), DegradationAction.REMOVE_IGNORABLE_ATTRIBUTE, ns, attr.getLocalName(),
                    "Unsupported attribute namespace is declared ignorable for this scope."));
        }
    }

    private CompatibilityRuleSnapshot ruleSnapshot(Element element, String partName, String locator) throws IOException {
        String ignorable = element.getAttributeNS(MC, "Ignorable");
        String must = element.getAttributeNS(MC, "MustUnderstand");
        String process = element.getAttributeNS(MC, "ProcessContent");
        String preserveElements = element.getAttributeNS(MC, "PreserveElements");
        String preserveAttributes = element.getAttributeNS(MC, "PreserveAttributes");
        if (ignorable.isBlank() && must.isBlank() && process.isBlank() && preserveElements.isBlank() && preserveAttributes.isBlank()) return null;
        List<String> ignorablePrefixes = tokens(ignorable);
        List<String> mustPrefixes = tokens(must);
        return new CompatibilityRuleSnapshot(partName, locator,
                ignorablePrefixes, resolvePrefixes(element, ignorablePrefixes, "mc:Ignorable"),
                mustPrefixes, resolvePrefixes(element, mustPrefixes, "mc:MustUnderstand"),
                resolveQNames(element, process, "mc:ProcessContent"),
                resolveQNames(element, preserveElements, "mc:PreserveElements"),
                resolveQNames(element, preserveAttributes, "mc:PreserveAttributes"));
    }

    private AlternateContentSnapshot snapshotAlternateContent(Element ac, String partName, String locator, String partSha) throws IOException {
        validateAlternateContent(ac, partName, locator);
        ArrayList<ChoiceSnapshot> choices = new ArrayList<>();
        int index = 0;
        for (Element choice : directChildren(ac, MC, "Choice")) {
            index++;
            List<String> prefixes = tokens(choice.getAttribute("Requires"));
            choices.add(new ChoiceSnapshot(index, prefixes, resolvePrefixes(choice, prefixes, "Choice@Requires"), structuralSha256(choice)));
        }
        List<Element> fallback = directChildren(ac, MC, "Fallback");
        return new AlternateContentSnapshot(partName, locator, choices, !fallback.isEmpty(), fallback.isEmpty() ? "" : structuralSha256(fallback.get(0)), partSha);
    }

    private ResolutionDecision selectBranch(Element ac, String partName, String locator, CompatibilityProfile profile) throws IOException {
        validateAlternateContent(ac, partName, locator);
        validateCompatibilityContainerForProfile(ac, profile, RuleScope.empty(), partName, locator, false);
        RuleScope acScope = RuleScope.empty().derive(ac);
        for (Element branch : directElementChildren(ac)) {
            if (MC.equals(branch.getNamespaceURI()) && ("Choice".equals(branch.getLocalName()) || "Fallback".equals(branch.getLocalName()))) {
                validateCompatibilityContainerForProfile(branch, profile, acScope, partName, locator + "/" + branch.getLocalName(), "Choice".equals(branch.getLocalName()));
            }
        }
        List<Element> choices = directChildren(ac, MC, "Choice");
        for (int i = 0; i < choices.size(); i++) {
            Element choice = choices.get(i);
            List<String> prefixes = tokens(choice.getAttribute("Requires"));
            List<String> uris = resolvePrefixes(choice, prefixes, "Choice@Requires");
            boolean allUnderstood = uris.stream().allMatch(profile::understands);
            if (allUnderstood) {
                return new ResolutionDecision(partName, locator, BranchKind.CHOICE, i + 1, uris,
                        "First Choice in markup order whose required namespace URIs are all understood by profile " + profile.id() + ".");
            }
        }
        List<Element> fallback = directChildren(ac, MC, "Fallback");
        if (!fallback.isEmpty()) {
            return new ResolutionDecision(partName, locator, BranchKind.FALLBACK, 0, List.of(),
                    "No Choice requirements are fully understood; Fallback is selected.");
        }
        return new ResolutionDecision(partName, locator, BranchKind.NONE, 0, List.of(),
                "No Choice is supported and no Fallback exists; caller must treat AlternateContent as absent.");
    }

    private void validateCompatibilityContainerForProfile(Element element, CompatibilityProfile profile, RuleScope inherited,
                                                          String partName, String locator, boolean choice) throws IOException {
        RuleScope scope = inherited.derive(element);
        for (String uri : scope.mustUnderstand) {
            if (!profile.understands(uri)) throw new IOException("unsupported mc:MustUnderstand namespace on mc:" + element.getLocalName() + ": " + uri + " at " + partName + " " + locator);
        }
        NamedNodeMap attributes = element.getAttributes();
        for (int i = 0; i < attributes.getLength(); i++) {
            Node node = attributes.item(i);
            if (!(node instanceof Attr attr)) continue;
            String ns = attr.getNamespaceURI();
            if (XMLNS.equals(ns) || MC.equals(ns) || XMLConstants.XML_NS_URI.equals(ns)) continue;
            if ((ns == null || ns.isBlank()) && choice && "Requires".equals(attr.getName())) continue;
            if (ns == null || ns.isBlank() || profile.understands(ns)) continue;
            if (!scope.ignorable.contains(ns)) {
                throw new IOException("non-understood non-ignorable attribute on mc:" + element.getLocalName() + ": " + qualifiedName(attr) + " at " + partName + " " + locator);
            }
        }
    }

    private void validateAlternateContent(Element ac, String partName, String locator) throws IOException {
        if (!MC.equals(ac.getNamespaceURI()) || !"AlternateContent".equals(ac.getLocalName())) throw new IOException("not mc:AlternateContent");
        if (ac.getParentNode() instanceof Element parent && MC.equals(parent.getNamespaceURI()) && "AlternateContent".equals(parent.getLocalName())) {
            throw new IOException("mc:AlternateContent shall not be a direct child of mc:AlternateContent: " + partName + " " + locator);
        }
        validateMcContainerAttributes(ac, false, partName, locator);
        int choiceCount = 0;
        int fallbackCount = 0;
        boolean fallbackSeen = false;
        for (Element child : directElementChildren(ac)) {
            if (MC.equals(child.getNamespaceURI()) && "Choice".equals(child.getLocalName())) {
                if (fallbackSeen) throw new IOException("mc:Choice shall not follow mc:Fallback: " + partName + " " + locator);
                choiceCount++;
                validateMcContainerAttributes(child, true, partName, locator + "/Choice[" + choiceCount + "]");
                String requires = child.getAttribute("Requires");
                if (requires.isBlank()) throw new IOException("mc:Choice Requires is mandatory: " + partName + " " + locator);
                List<String> prefixes = tokens(requires);
                if (prefixes.isEmpty()) throw new IOException("mc:Choice Requires must contain at least one prefix");
                resolvePrefixes(child, prefixes, "Choice@Requires");
            } else if (MC.equals(child.getNamespaceURI()) && "Fallback".equals(child.getLocalName())) {
                fallbackCount++;
                fallbackSeen = true;
                if (fallbackCount > 1) throw new IOException("mc:AlternateContent shall contain at most one Fallback: " + partName + " " + locator);
                validateMcContainerAttributes(child, false, partName, locator + "/Fallback");
            } else {
                String childNs = child.getNamespaceURI();
                RuleScope scope = RuleScope.empty().derive(ac);
                if (childNs == null || !scope.ignorable.contains(childNs)) {
                    throw new IOException("unexpected non-ignorable child of mc:AlternateContent: " + qualifiedName(child) + " at " + partName + " " + locator);
                }
            }
        }
        if (choiceCount < 1) throw new IOException("mc:AlternateContent shall contain at least one Choice: " + partName + " " + locator);
    }

    private void validateMcContainerAttributes(Element element, boolean choice, String partName, String locator) throws IOException {
        NamedNodeMap attributes = element.getAttributes();
        for (int i = 0; i < attributes.getLength(); i++) {
            Node node = attributes.item(i);
            if (!(node instanceof Attr attr)) continue;
            String ns = attr.getNamespaceURI();
            if (XMLNS.equals(ns)) continue;
            if (XMLConstants.XML_NS_URI.equals(ns) && ("lang".equals(attr.getLocalName()) || "space".equals(attr.getLocalName()))) {
                throw new IOException("xml:lang/xml:space is not conformant on mc:" + element.getLocalName() + " at " + partName + " " + locator);
            }
            if (ns == null || ns.isBlank()) {
                if (choice && "Requires".equals(attr.getName())) continue;
                throw new IOException("unprefixed attribute is not permitted on mc:" + element.getLocalName() + ": " + attr.getName());
            }
        }
        // Resolve all compatibility attributes now so unbound prefixes fail during conformance checking.
        ruleSnapshot(element, partName, locator);
    }

    private static List<String> resolvePrefixes(Element context, List<String> prefixes, String source) throws IOException {
        ArrayList<String> uris = new ArrayList<>();
        for (String prefix : prefixes) {
            requireNcName(prefix, source + " prefix");
            String uri = context.lookupNamespaceURI(prefix);
            if (uri == null || uri.isBlank()) throw new IOException(source + " references unbound namespace prefix: " + prefix);
            uris.add(uri);
        }
        return List.copyOf(uris);
    }

    private static List<QNameRef> resolveQNames(Element context, String lexicalList, String source) throws IOException {
        ArrayList<QNameRef> out = new ArrayList<>();
        for (String lexical : tokens(lexicalList)) {
            int colon = lexical.indexOf(':');
            if (colon <= 0 || colon == lexical.length() - 1 || lexical.indexOf(':', colon + 1) >= 0) {
                throw new IOException(source + " requires namespace-qualified names: " + lexical);
            }
            String prefix = requireNcName(lexical.substring(0, colon), source + " prefix");
            String local = lexical.substring(colon + 1);
            boolean wildcard = "*".equals(local);
            if (!wildcard) requireNcName(local, source + " local name");
            String uri = context.lookupNamespaceURI(prefix);
            if (uri == null || uri.isBlank()) throw new IOException(source + " references unbound namespace prefix: " + prefix);
            out.add(new QNameRef(lexical, prefix, local, uri, wildcard));
        }
        return List.copyOf(out);
    }

    private static List<String> tokens(String lexical) {
        if (lexical == null || lexical.isBlank()) return List.of();
        return List.of(lexical.strip().split("\\s+"));
    }

    private static List<String> markupXmlParts(Map<String, byte[]> parts) {
        return parts.keySet().stream()
                .filter(name -> name.startsWith("word/"))
                .filter(name -> name.endsWith(".xml"))
                .sorted()
                .toList();
    }

    private static boolean isCompatibilityNamespace(String namespaceUri) {
        return MC.equals(namespaceUri);
    }

    private static boolean matchesAny(Set<QNameRef> refs, Element element) {
        for (QNameRef ref : refs) if (ref.matches(element)) return true;
        return false;
    }

    private static boolean matchesAny(Set<QNameRef> refs, Attr attr) {
        for (QNameRef ref : refs) if (ref.matches(attr)) return true;
        return false;
    }

    private static void removeCompatibilityAttributesRecursively(Element element) {
        ArrayList<Attr> remove = new ArrayList<>();
        NamedNodeMap map = element.getAttributes();
        for (int i = 0; i < map.getLength(); i++) {
            if (map.item(i) instanceof Attr attr && MC.equals(attr.getNamespaceURI())) remove.add(attr);
        }
        for (Attr attr : remove) element.removeAttributeNode(attr);
        for (Element child : directElementChildren(element)) removeCompatibilityAttributesRecursively(child);
    }

    private static void copyNamespaceDeclarations(Element source, Element target) {
        NamedNodeMap attrs = source.getAttributes();
        for (int i = 0; i < attrs.getLength(); i++) {
            Node node = attrs.item(i);
            if (!(node instanceof Attr attr) || !XMLNS.equals(attr.getNamespaceURI())) continue;
            String local = attr.getLocalName();
            String qualified = XMLConstants.XMLNS_ATTRIBUTE.equals(local) ? XMLConstants.XMLNS_ATTRIBUTE : "xmlns:" + local;
            String existing = target.lookupNamespaceURI(XMLConstants.XMLNS_ATTRIBUTE.equals(local) ? null : local);
            if (existing == null || !existing.equals(attr.getValue())) target.setAttributeNS(XMLNS, qualified, attr.getValue());
        }
    }

    private static void ensureNamespace(Element element, String prefix, String uri) {
        String current = element.lookupNamespaceURI(prefix);
        if (!Objects.equals(current, uri)) element.setAttributeNS(XMLNS, "xmlns:" + prefix, uri);
    }

    private static void addPrefixToken(Element element, String namespace, String local, String prefix) {
        LinkedHashSet<String> values = new LinkedHashSet<>(tokens(element.getAttributeNS(namespace, local)));
        values.add(prefix);
        element.setAttributeNS(namespace, "mc:" + local, String.join(" ", values));
    }

    private static List<Element> elements(Node node, String namespace, String local) {
        ArrayList<Element> out = new ArrayList<>();
        if (node instanceof Element element && Objects.equals(namespace, element.getNamespaceURI()) && local.equals(element.getLocalName())) out.add(element);
        NodeList nodes = node.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) out.addAll(elements(nodes.item(i), namespace, local));
        return List.copyOf(out);
    }

    private static List<Element> directChildren(Element parent, String namespace, String local) {
        ArrayList<Element> out = new ArrayList<>();
        for (Element child : directElementChildren(parent)) {
            if (Objects.equals(namespace, child.getNamespaceURI()) && local.equals(child.getLocalName())) out.add(child);
        }
        return List.copyOf(out);
    }

    private static List<Element> directElementChildren(Element parent) {
        ArrayList<Element> out = new ArrayList<>();
        Node node = parent.getFirstChild();
        while (node != null) {
            if (node instanceof Element element) out.add(element);
            node = node.getNextSibling();
        }
        return List.copyOf(out);
    }

    private static List<Node> childNodes(Element parent) {
        ArrayList<Node> out = new ArrayList<>();
        Node node = parent.getFirstChild();
        while (node != null) {
            Node next = node.getNextSibling();
            out.add(node);
            node = next;
        }
        return List.copyOf(out);
    }

    private static Element first(NodeList list) {
        return list == null || list.getLength() == 0 ? null : (Element) list.item(0);
    }

    private static byte[] requirePart(Map<String, byte[]> parts, String name) throws IOException {
        byte[] value = parts.get(name);
        if (value == null) throw new IOException("required DOCX part missing: " + name);
        return value;
    }

    private static String qualifiedName(Node node) {
        String prefix = node.getPrefix();
        String local = node.getLocalName();
        if (local == null || local.isBlank()) local = node.getNodeName();
        return prefix == null || prefix.isBlank() ? local : prefix + ":" + local;
    }

    private static String structuralSha256(Node node) {
        StringBuilder out = new StringBuilder();
        appendCanonical(node, out);
        return sha256(out.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static void appendCanonical(Node node, StringBuilder out) {
        if (node instanceof Element element) {
            out.append('<').append('{').append(Objects.requireNonNullElse(element.getNamespaceURI(), "")).append('}')
                    .append(Objects.requireNonNullElse(element.getLocalName(), element.getNodeName()));
            ArrayList<String> attrs = new ArrayList<>();
            NamedNodeMap map = element.getAttributes();
            for (int i = 0; i < map.getLength(); i++) {
                Node attr = map.item(i);
                if (XMLNS.equals(attr.getNamespaceURI())) continue;
                attrs.add("{" + Objects.requireNonNullElse(attr.getNamespaceURI(), "") + "}" + Objects.requireNonNullElse(attr.getLocalName(), attr.getNodeName()) + "=" + attr.getNodeValue());
            }
            attrs.sort(Comparator.naturalOrder());
            for (String attr : attrs) out.append('|').append(attr);
            out.append('>');
            Node child = element.getFirstChild();
            while (child != null) {
                appendCanonical(child, out);
                child = child.getNextSibling();
            }
            out.append("</>");
        } else if (node.getNodeType() == Node.TEXT_NODE || node.getNodeType() == Node.CDATA_SECTION_NODE) {
            out.append("#text[").append(node.getNodeValue()).append(']');
        }
    }

    private static String sha256(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String requireSha256(String value, String label) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(label + " must be lowercase SHA-256");
        return value;
    }

    private static String requireNonBlank(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " required");
        return value;
    }

    private static String requireNcName(String value, String label) {
        requireNonBlank(value, label);
        if (!value.matches("[A-Za-z_][A-Za-z0-9._-]*")) throw new IllegalArgumentException(label + " must be an NCName: " + value);
        return value;
    }

    private static final class RuleScope {
        private final Set<String> ignorable;
        private final Set<String> mustUnderstand;
        private final Set<QNameRef> processContent;
        private final Set<QNameRef> preserveElements;
        private final Set<QNameRef> preserveAttributes;

        private RuleScope(Set<String> ignorable, Set<String> mustUnderstand, Set<QNameRef> processContent,
                          Set<QNameRef> preserveElements, Set<QNameRef> preserveAttributes) {
            this.ignorable = Set.copyOf(ignorable);
            this.mustUnderstand = Set.copyOf(mustUnderstand);
            this.processContent = Set.copyOf(processContent);
            this.preserveElements = Set.copyOf(preserveElements);
            this.preserveAttributes = Set.copyOf(preserveAttributes);
        }

        static RuleScope empty() { return new RuleScope(Set.of(), Set.of(), Set.of(), Set.of(), Set.of()); }

        RuleScope derive(Element element) throws IOException {
            LinkedHashSet<String> ignorableNext = new LinkedHashSet<>(ignorable);
            LinkedHashSet<String> mustNext = new LinkedHashSet<>(mustUnderstand);
            LinkedHashSet<QNameRef> processNext = new LinkedHashSet<>(processContent);
            LinkedHashSet<QNameRef> preserveElementsNext = new LinkedHashSet<>(preserveElements);
            LinkedHashSet<QNameRef> preserveAttributesNext = new LinkedHashSet<>(preserveAttributes);
            ignorableNext.addAll(resolvePrefixes(element, tokens(element.getAttributeNS(MC, "Ignorable")), "mc:Ignorable"));
            mustNext.addAll(resolvePrefixes(element, tokens(element.getAttributeNS(MC, "MustUnderstand")), "mc:MustUnderstand"));
            processNext.addAll(resolveQNames(element, element.getAttributeNS(MC, "ProcessContent"), "mc:ProcessContent"));
            preserveElementsNext.addAll(resolveQNames(element, element.getAttributeNS(MC, "PreserveElements"), "mc:PreserveElements"));
            preserveAttributesNext.addAll(resolveQNames(element, element.getAttributeNS(MC, "PreserveAttributes"), "mc:PreserveAttributes"));
            return new RuleScope(ignorableNext, mustNext, processNext, preserveElementsNext, preserveAttributesNext);
        }
    }
}
