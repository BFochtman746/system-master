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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * DOCUMENT-DOCX-MASTERY-T14 bounded WordprocessingML conformance-profile authority.
 *
 * <p>This engine distinguishes ISO/IEC 29500 Strict and Transitional namespace/relationship
 * families, validates package/profile coherence, and performs only transformations that can be
 * proven namespace/relationship preserving. It does not claim full XSD conformance, Microsoft
 * Word fidelity, or ownership of T12 custom XML payload semantics.</p>
 */
public final class DocxConformanceProfileMasteryEngine {
    public static final String W_TRANSITIONAL = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    public static final String W_STRICT = "http://purl.oclc.org/ooxml/wordprocessingml/main";
    public static final String R_TRANSITIONAL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    public static final String R_STRICT = "http://purl.oclc.org/ooxml/officeDocument/relationships";
    public static final String OFFICE_REL_TRANSITIONAL_PREFIX = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
    public static final String OFFICE_REL_STRICT_PREFIX = "http://purl.oclc.org/ooxml/officeDocument/relationships/";
    public static final String OFFICE_DOCUMENT_REL_TRANSITIONAL = OFFICE_REL_TRANSITIONAL_PREFIX + "officeDocument";
    public static final String OFFICE_DOCUMENT_REL_STRICT = OFFICE_REL_STRICT_PREFIX + "officeDocument";
    public static final String MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";

    private static final String CONTENT_TYPES = "[Content_Types].xml";
    private static final String ROOT_RELS = "_rels/.rels";
    private static final String MAIN_DOCUMENT = "word/document.xml";
    private static final String REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CONTENT_TYPE_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

    private static final Map<String, String> TRANSITIONAL_TO_STRICT = Map.ofEntries(
            Map.entry(W_TRANSITIONAL, W_STRICT),
            Map.entry(R_TRANSITIONAL, R_STRICT),
            Map.entry("http://schemas.openxmlformats.org/drawingml/2006/main", "http://purl.oclc.org/ooxml/drawingml/main"),
            Map.entry("http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing", "http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing"),
            Map.entry("http://schemas.openxmlformats.org/drawingml/2006/picture", "http://purl.oclc.org/ooxml/drawingml/picture"),
            Map.entry("http://schemas.openxmlformats.org/drawingml/2006/chart", "http://purl.oclc.org/ooxml/drawingml/chart"),
            Map.entry("http://schemas.openxmlformats.org/drawingml/2006/diagram", "http://purl.oclc.org/ooxml/drawingml/diagram"),
            Map.entry("http://schemas.openxmlformats.org/officeDocument/2006/math", "http://purl.oclc.org/ooxml/officeDocument/math"),
            Map.entry("http://schemas.openxmlformats.org/officeDocument/2006/sharedTypes", "http://purl.oclc.org/ooxml/officeDocument/sharedTypes"),
            Map.entry("http://schemas.openxmlformats.org/schemaLibrary/2006/main", "http://purl.oclc.org/ooxml/schemaLibrary/main"));

    private static final Map<String, String> STRICT_TO_TRANSITIONAL = inverse(TRANSITIONAL_TO_STRICT);

    private static final Set<String> TRANSITIONAL_ONLY_LEGACY_NAMESPACES = Set.of(
            "urn:schemas-microsoft-com:vml",
            "urn:schemas-microsoft-com:office:office",
            "urn:schemas-microsoft-com:office:word");

    public enum Profile { TRANSITIONAL, STRICT, INVALID_MIXED, UNKNOWN }
    public enum Severity { ERROR, WARNING, INFO }
    public enum ConversionDisposition { CONVERTIBLE, ALREADY_TARGET, BLOCKED }

    public record Violation(String code, Severity severity, String partName, String locator, String detail) {
        public Violation {
            code = required(code, "code");
            Objects.requireNonNull(severity, "severity");
            partName = required(partName, "partName");
            locator = Objects.requireNonNullElse(locator, "");
            detail = required(detail, "detail");
        }
    }

    public record Snapshot(
            String sourceSha256,
            Profile profile,
            String mainDocumentNamespace,
            String declaredConformance,
            String rootOfficeDocumentRelationshipType,
            Set<String> namespaceUris,
            List<Violation> violations,
            boolean packageStructureValid,
            boolean profileCoherent,
            boolean fullSchemaConformanceClaimed) {
        public Snapshot {
            sourceSha256 = sha(sourceSha256);
            Objects.requireNonNull(profile, "profile");
            mainDocumentNamespace = Objects.requireNonNullElse(mainDocumentNamespace, "");
            declaredConformance = Objects.requireNonNullElse(declaredConformance, "");
            rootOfficeDocumentRelationshipType = Objects.requireNonNullElse(rootOfficeDocumentRelationshipType, "");
            namespaceUris = Set.copyOf(namespaceUris);
            violations = List.copyOf(violations);
            if (fullSchemaConformanceClaimed) throw new IllegalArgumentException("T14 shall not claim full XSD conformance without bound schemas");
        }
    }

    public record ConversionPlan(
            String sourceSha256,
            Profile sourceProfile,
            Profile targetProfile,
            ConversionDisposition disposition,
            List<String> namespaceMappings,
            List<String> relationshipMappings,
            List<Violation> blockers,
            boolean preservesCustomXmlBytes,
            boolean fullSchemaConformanceClaimed) {
        public ConversionPlan {
            sourceSha256 = sha(sourceSha256);
            Objects.requireNonNull(sourceProfile, "sourceProfile");
            Objects.requireNonNull(targetProfile, "targetProfile");
            Objects.requireNonNull(disposition, "disposition");
            namespaceMappings = List.copyOf(namespaceMappings);
            relationshipMappings = List.copyOf(relationshipMappings);
            blockers = List.copyOf(blockers);
            if (fullSchemaConformanceClaimed) throw new IllegalArgumentException("conversion plan cannot claim full schema conformance");
        }
    }

    public record ConversionResult(
            byte[] bytes,
            String sourceSha256,
            String resultSha256,
            Profile sourceProfile,
            Profile targetProfile,
            int changedXmlParts,
            int changedRelationshipTypes,
            int unchangedParts,
            boolean unrelatedPartsByteIdentical,
            boolean customXmlByteIdentical,
            Snapshot resultSnapshot) {
        public ConversionResult {
            bytes = bytes.clone();
            sourceSha256 = sha(sourceSha256);
            resultSha256 = sha(resultSha256);
            Objects.requireNonNull(sourceProfile, "sourceProfile");
            Objects.requireNonNull(targetProfile, "targetProfile");
            Objects.requireNonNull(resultSnapshot, "resultSnapshot");
        }
        @Override public byte[] bytes() { return bytes.clone(); }
    }

    public Snapshot inspect(byte[] packageBytes) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(packageBytes);
        ArrayList<Violation> violations = new ArrayList<>();
        boolean structure = validateRequiredParts(parts, violations);
        if (!parts.containsKey(MAIN_DOCUMENT)) {
            return new Snapshot(OoxmlPackageSupport.sha256(packageBytes), Profile.UNKNOWN, "", "", rootOfficeRelationship(parts, violations), Set.of(), violations, false, false, false);
        }

        Document main = OoxmlPackageSupport.parseXml(parts.get(MAIN_DOCUMENT));
        Element root = main.getDocumentElement();
        String mainNs = Objects.requireNonNullElse(root.getNamespaceURI(), "");
        String declared = conformanceValue(root);
        String officeRel = rootOfficeRelationship(parts, violations);
        LinkedHashSet<String> namespaces = new LinkedHashSet<>();
        collectNamespaces(parts, namespaces, violations);

        Profile byMain = profileForMainNamespace(mainNs);
        Profile byRel = profileForRelationshipType(officeRel);
        Profile profile = reconcileProfile(byMain, byRel, declared, namespaces, violations);
        validateContentType(parts, violations);
        validateProfileNamespaces(profile, namespaces, violations);
        validateRelationshipFamilies(parts, profile, violations);
        validateDeclaredConformance(profile, declared, violations);

        boolean coherent = profile == Profile.STRICT || profile == Profile.TRANSITIONAL;
        coherent &= violations.stream().noneMatch(v -> v.severity() == Severity.ERROR);
        return new Snapshot(OoxmlPackageSupport.sha256(packageBytes), profile, mainNs, declared, officeRel,
                namespaces, violations, structure, coherent, false);
    }

    public ConversionPlan planConversion(byte[] packageBytes, Profile target) throws IOException {
        if (target != Profile.STRICT && target != Profile.TRANSITIONAL) throw new IllegalArgumentException("target must be STRICT or TRANSITIONAL");
        Snapshot source = inspect(packageBytes);
        ArrayList<Violation> blockers = new ArrayList<>();
        if (!source.packageStructureValid() || !source.profileCoherent()) {
            blockers.add(new Violation("SOURCE_PROFILE_NOT_COHERENT", Severity.ERROR, MAIN_DOCUMENT, "/", "Source package/profile must pass T14 profile validation before conversion."));
        }
        if (source.profile() == target && blockers.isEmpty()) {
            return new ConversionPlan(source.sourceSha256(), source.profile(), target, ConversionDisposition.ALREADY_TARGET, List.of(), List.of(), List.of(), true, false);
        }
        if (source.profile() != Profile.STRICT && source.profile() != Profile.TRANSITIONAL) {
            blockers.add(new Violation("SOURCE_PROFILE_UNKNOWN", Severity.ERROR, MAIN_DOCUMENT, "/", "Source profile is not safely convertible."));
        }

        Map<String, byte[]> parts = OoxmlPackageSupport.read(packageBytes);
        if (target == Profile.STRICT) {
            for (String part : parts.keySet()) {
                if (part.startsWith("customXml/")) {
                    blockers.add(new Violation("T12_CUSTOM_XML_OWNER_COORDINATION_REQUIRED", Severity.ERROR, part, "/", "Strict conversion does not rewrite T12-owned custom XML parts; owner-scoped conversion is required."));
                }
            }
            for (String ns : source.namespaceUris()) {
                if (TRANSITIONAL_ONLY_LEGACY_NAMESPACES.contains(ns)) {
                    blockers.add(new Violation("TRANSITIONAL_LEGACY_NAMESPACE", Severity.ERROR, MAIN_DOCUMENT, "/", "Strict conversion cannot silently translate legacy namespace: " + ns));
                }
            }
        }

        List<String> nsMappings = mappingList(source.profile(), target);
        List<String> relMappings = source.profile() == target ? List.of() : List.of(
                (source.profile() == Profile.TRANSITIONAL ? OFFICE_REL_TRANSITIONAL_PREFIX : OFFICE_REL_STRICT_PREFIX)
                        + "* -> "
                        + (target == Profile.STRICT ? OFFICE_REL_STRICT_PREFIX : OFFICE_REL_TRANSITIONAL_PREFIX) + "*");
        ConversionDisposition disposition = blockers.isEmpty() ? ConversionDisposition.CONVERTIBLE : ConversionDisposition.BLOCKED;
        return new ConversionPlan(source.sourceSha256(), source.profile(), target, disposition, nsMappings, relMappings, blockers, true, false);
    }

    public ConversionResult convert(byte[] packageBytes, Profile target) throws IOException {
        ConversionPlan plan = planConversion(packageBytes, target);
        if (plan.disposition() == ConversionDisposition.BLOCKED) {
            throw new IOException("T14 profile conversion blocked: " + plan.blockers());
        }
        if (plan.disposition() == ConversionDisposition.ALREADY_TARGET) {
            Snapshot snap = inspect(packageBytes);
            return new ConversionResult(packageBytes, snap.sourceSha256(), snap.sourceSha256(), snap.profile(), target, 0, 0,
                    OoxmlPackageSupport.read(packageBytes).size(), true, true, snap);
        }

        Map<String, byte[]> before = OoxmlPackageSupport.read(packageBytes);
        LinkedHashMap<String, byte[]> after = new LinkedHashMap<>();
        int changedXml = 0;
        int changedRels = 0;
        for (Map.Entry<String, byte[]> entry : before.entrySet()) {
            String name = entry.getKey();
            byte[] value = entry.getValue();
            byte[] transformed = value;
            if ((name.endsWith(".xml") || name.endsWith(".rels")) && !name.startsWith("customXml/")) {
                Document doc = OoxmlPackageSupport.parseXml(value);
                int relChanges = rewriteRelationshipTypeValues(doc, target);
                boolean namespaceChanged = rewriteNamespaceFamily(doc, target);
                if (MAIN_DOCUMENT.equals(name)) {
                    Element root = doc.getDocumentElement();
                    String wns = root.getNamespaceURI();
                    String local = root.getLocalName();
                    if ("document".equals(local) && (W_STRICT.equals(wns) || W_TRANSITIONAL.equals(wns))) {
                        root.setAttributeNS(wns, root.getPrefix() == null || root.getPrefix().isBlank() ? "conformance" : root.getPrefix() + ":conformance",
                                target == Profile.STRICT ? "strict" : "transitional");
                    }
                }
                if (relChanges > 0 || namespaceChanged || MAIN_DOCUMENT.equals(name)) {
                    transformed = OoxmlPackageSupport.serialize(doc);
                    if (!Arrays.equals(value, transformed)) changedXml++;
                    changedRels += relChanges;
                }
            }
            after.put(name, transformed);
        }
        byte[] result = OoxmlPackageSupport.write(after);
        Snapshot resultSnapshot = inspect(result);
        if (resultSnapshot.profile() != target || !resultSnapshot.profileCoherent()) {
            throw new IOException("T14 converted package failed target profile validation: " + resultSnapshot.violations());
        }

        int unchanged = 0;
        boolean unrelatedIdentical = true;
        boolean customIdentical = true;
        for (Map.Entry<String, byte[]> entry : before.entrySet()) {
            byte[] current = after.get(entry.getKey());
            if (Arrays.equals(entry.getValue(), current)) unchanged++;
            else if (!isProfileOwnedPart(entry.getKey())) unrelatedIdentical = false;
            if (entry.getKey().startsWith("customXml/") && !Arrays.equals(entry.getValue(), current)) customIdentical = false;
        }
        return new ConversionResult(result, OoxmlPackageSupport.sha256(packageBytes), OoxmlPackageSupport.sha256(result),
                plan.sourceProfile(), target, changedXml, changedRels, unchanged, unrelatedIdentical, customIdentical, resultSnapshot);
    }

    private static boolean validateRequiredParts(Map<String, byte[]> parts, List<Violation> violations) {
        boolean ok = true;
        for (String name : List.of(CONTENT_TYPES, ROOT_RELS, MAIN_DOCUMENT)) {
            if (!parts.containsKey(name)) {
                violations.add(new Violation("REQUIRED_PART_MISSING", Severity.ERROR, name, "/", "Required DOCX part is absent."));
                ok = false;
            }
        }
        return ok;
    }

    private static void validateContentType(Map<String, byte[]> parts, List<Violation> violations) throws IOException {
        byte[] bytes = parts.get(CONTENT_TYPES);
        if (bytes == null) return;
        Document doc = OoxmlPackageSupport.parseXml(bytes);
        NodeList overrides = doc.getElementsByTagNameNS(CONTENT_TYPE_NS, "Override");
        int matches = 0;
        for (int i = 0; i < overrides.getLength(); i++) {
            Element e = (Element) overrides.item(i);
            if ("/word/document.xml".equals(e.getAttribute("PartName"))) {
                matches++;
                if (!MAIN_CONTENT_TYPE.equals(e.getAttribute("ContentType"))) {
                    violations.add(new Violation("MAIN_CONTENT_TYPE_INVALID", Severity.ERROR, CONTENT_TYPES, "/Types/Override", "Main document content type is not DOCX WordprocessingML main+xml."));
                }
            }
        }
        if (matches != 1) violations.add(new Violation("MAIN_CONTENT_TYPE_CARDINALITY", Severity.ERROR, CONTENT_TYPES, "/Types", "Exactly one main-document Override is required; found " + matches + "."));
    }

    private static String rootOfficeRelationship(Map<String, byte[]> parts, List<Violation> violations) throws IOException {
        byte[] bytes = parts.get(ROOT_RELS);
        if (bytes == null) return "";
        Document doc = OoxmlPackageSupport.parseXml(bytes);
        NodeList rels = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        ArrayList<Element> candidates = new ArrayList<>();
        for (int i = 0; i < rels.getLength(); i++) {
            Element e = (Element) rels.item(i);
            String type = e.getAttribute("Type");
            if (isOfficeDocumentRelationship(type)) candidates.add(e);
        }
        if (candidates.size() != 1) {
            violations.add(new Violation("OFFICE_DOCUMENT_REL_CARDINALITY", Severity.ERROR, ROOT_RELS, "/Relationships", "Exactly one officeDocument package relationship is required; found " + candidates.size() + "."));
            return candidates.isEmpty() ? "" : candidates.get(0).getAttribute("Type");
        }
        Element rel = candidates.get(0);
        if ("External".equalsIgnoreCase(rel.getAttribute("TargetMode"))) {
            violations.add(new Violation("OFFICE_DOCUMENT_REL_EXTERNAL", Severity.ERROR, ROOT_RELS, "/Relationships/Relationship", "Main document relationship must be internal."));
        }
        String target = rel.getAttribute("Target").replace("\\", "/");
        if (target.startsWith("/")) target = target.substring(1);
        if (!MAIN_DOCUMENT.equals(target)) {
            violations.add(new Violation("OFFICE_DOCUMENT_TARGET_UNEXPECTED", Severity.ERROR, ROOT_RELS, "/Relationships/Relationship", "Expected word/document.xml target; found " + target + "."));
        }
        return rel.getAttribute("Type");
    }

    private static boolean isOfficeDocumentRelationship(String type) {
        String t = normalizeStrictScheme(type);
        return OFFICE_DOCUMENT_REL_TRANSITIONAL.equals(t) || OFFICE_DOCUMENT_REL_STRICT.equals(t)
                || "http://purl.oclc.org/ooxml/relationships/officeDocument".equals(t);
    }

    private static Profile profileForRelationshipType(String type) {
        String t = normalizeStrictScheme(type);
        if (OFFICE_DOCUMENT_REL_TRANSITIONAL.equals(t)) return Profile.TRANSITIONAL;
        if (OFFICE_DOCUMENT_REL_STRICT.equals(t) || "http://purl.oclc.org/ooxml/relationships/officeDocument".equals(t)) return Profile.STRICT;
        return Profile.UNKNOWN;
    }

    private static Profile profileForMainNamespace(String ns) {
        String n = normalizeStrictScheme(ns);
        if (W_TRANSITIONAL.equals(n)) return Profile.TRANSITIONAL;
        if (W_STRICT.equals(n)) return Profile.STRICT;
        return Profile.UNKNOWN;
    }

    private static Profile reconcileProfile(Profile main, Profile rel, String declared, Set<String> namespaces, List<Violation> violations) {
        boolean hasTrans = namespaces.stream().map(DocxConformanceProfileMasteryEngine::normalizeStrictScheme).anyMatch(TRANSITIONAL_TO_STRICT::containsKey);
        boolean hasStrict = namespaces.stream().map(DocxConformanceProfileMasteryEngine::normalizeStrictScheme).anyMatch(STRICT_TO_TRANSITIONAL::containsKey);
        if (hasTrans && hasStrict) {
            violations.add(new Violation("MIXED_STRICT_TRANSITIONAL_NAMESPACES", Severity.ERROR, MAIN_DOCUMENT, "/", "Package uses both Strict and Transitional standard namespace families."));
            return Profile.INVALID_MIXED;
        }
        if (main != Profile.UNKNOWN && rel != Profile.UNKNOWN && main != rel) {
            violations.add(new Violation("MAIN_REL_PROFILE_MISMATCH", Severity.ERROR, ROOT_RELS, "/Relationships", "Main document namespace and officeDocument relationship declare different OOXML profiles."));
            return Profile.INVALID_MIXED;
        }
        Profile p = main != Profile.UNKNOWN ? main : rel;
        String d = declared.toLowerCase(Locale.ROOT);
        if ("strict".equals(d) && p == Profile.TRANSITIONAL) {
            violations.add(new Violation("FALSE_STRICT_DECLARATION", Severity.ERROR, MAIN_DOCUMENT, "/w:document/@w:conformance", "Document declares strict while using Transitional namespace/relationship family."));
            return Profile.INVALID_MIXED;
        }
        if ("transitional".equals(d) && p == Profile.STRICT) {
            violations.add(new Violation("FALSE_TRANSITIONAL_DECLARATION", Severity.ERROR, MAIN_DOCUMENT, "/w:document/@w:conformance", "Document declares transitional while using Strict namespace/relationship family."));
            return Profile.INVALID_MIXED;
        }
        return p;
    }

    private static void validateProfileNamespaces(Profile profile, Set<String> namespaces, List<Violation> violations) {
        if (profile == Profile.UNKNOWN || profile == Profile.INVALID_MIXED) return;
        for (String raw : namespaces) {
            String ns = normalizeStrictScheme(raw);
            if (profile == Profile.STRICT && TRANSITIONAL_TO_STRICT.containsKey(ns)) {
                violations.add(new Violation("TRANSITIONAL_NAMESPACE_IN_STRICT", Severity.ERROR, MAIN_DOCUMENT, "/", "Strict profile contains Transitional namespace: " + raw));
            }
            if (profile == Profile.TRANSITIONAL && STRICT_TO_TRANSITIONAL.containsKey(ns)) {
                violations.add(new Violation("STRICT_NAMESPACE_IN_TRANSITIONAL", Severity.ERROR, MAIN_DOCUMENT, "/", "Transitional profile contains Strict namespace: " + raw));
            }
            if (profile == Profile.STRICT && TRANSITIONAL_ONLY_LEGACY_NAMESPACES.contains(ns)) {
                violations.add(new Violation("LEGACY_NAMESPACE_IN_STRICT", Severity.WARNING, MAIN_DOCUMENT, "/", "Legacy Microsoft namespace requires extension/compatibility review under Strict: " + raw));
            }
        }
    }

    private static void validateRelationshipFamilies(Map<String, byte[]> parts, Profile profile, List<Violation> violations) throws IOException {
        if (profile != Profile.STRICT && profile != Profile.TRANSITIONAL) return;
        for (Map.Entry<String, byte[]> entry : parts.entrySet()) {
            if (!entry.getKey().endsWith(".rels")) continue;
            Document doc = OoxmlPackageSupport.parseXml(entry.getValue());
            NodeList rels = doc.getElementsByTagNameNS(REL_NS, "Relationship");
            for (int i = 0; i < rels.getLength(); i++) {
                Element e = (Element) rels.item(i);
                String type = normalizeStrictScheme(e.getAttribute("Type"));
                boolean trans = type.startsWith(OFFICE_REL_TRANSITIONAL_PREFIX);
                boolean strict = type.startsWith(OFFICE_REL_STRICT_PREFIX);
                if (profile == Profile.STRICT && trans) violations.add(new Violation("TRANSITIONAL_RELATIONSHIP_IN_STRICT", Severity.ERROR, entry.getKey(), "/Relationships/Relationship[" + (i + 1) + "]", type));
                if (profile == Profile.TRANSITIONAL && strict) violations.add(new Violation("STRICT_RELATIONSHIP_IN_TRANSITIONAL", Severity.ERROR, entry.getKey(), "/Relationships/Relationship[" + (i + 1) + "]", type));
            }
        }
    }

    private static void validateDeclaredConformance(Profile profile, String declared, List<Violation> violations) {
        if (declared.isBlank()) {
            if (profile == Profile.STRICT) violations.add(new Violation("STRICT_CONFORMANCE_ATTRIBUTE_MISSING", Severity.WARNING, MAIN_DOCUMENT, "/w:document", "Strict namespace package should explicitly carry w:conformance=strict for unambiguous standing."));
            return;
        }
        String d = declared.toLowerCase(Locale.ROOT);
        if (!d.equals("strict") && !d.equals("transitional")) {
            violations.add(new Violation("CONFORMANCE_ATTRIBUTE_INVALID", Severity.ERROR, MAIN_DOCUMENT, "/w:document/@w:conformance", "Unsupported conformance value: " + declared));
        }
    }

    private static String conformanceValue(Element root) {
        String ns = root.getNamespaceURI();
        String value = root.getAttributeNS(ns, "conformance");
        if (!value.isBlank()) return value.trim();
        return root.getAttribute("conformance").trim();
    }

    private static void collectNamespaces(Map<String, byte[]> parts, Set<String> namespaces, List<Violation> violations) throws IOException {
        for (Map.Entry<String, byte[]> entry : parts.entrySet()) {
            String name = entry.getKey();
            if (!(name.endsWith(".xml") || name.endsWith(".rels"))) continue;
            if (name.startsWith("customXml/") && !name.contains("itemProps")) continue; // T12 payload authority.
            Document doc;
            try {
                doc = OoxmlPackageSupport.parseXml(entry.getValue());
            } catch (IOException ex) {
                violations.add(new Violation("XML_PART_INVALID", Severity.ERROR, name, "/", "Invalid or unsafe XML: " + ex.getMessage()));
                continue;
            }
            collectNodeNamespaces(doc.getDocumentElement(), namespaces);
        }
    }

    private static void collectNodeNamespaces(Element e, Set<String> out) {
        if (e.getNamespaceURI() != null && !e.getNamespaceURI().isBlank()) out.add(e.getNamespaceURI());
        NamedNodeMap attrs = e.getAttributes();
        for (int i = 0; i < attrs.getLength(); i++) {
            Node n = attrs.item(i);
            if (n instanceof Attr a) {
                if (XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(a.getNamespaceURI())) {
                    if (!a.getValue().isBlank()) out.add(a.getValue());
                } else if (a.getNamespaceURI() != null && !a.getNamespaceURI().isBlank()) out.add(a.getNamespaceURI());
            }
        }
        NodeList children = e.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) if (children.item(i) instanceof Element child) collectNodeNamespaces(child, out);
    }

    private static boolean rewriteNamespaceFamily(Document doc, Profile target) {
        boolean[] changed = {false};
        rewriteElement(doc, doc.getDocumentElement(), target, changed);
        return changed[0];
    }

    private static void rewriteElement(Document doc, Element element, Profile target, boolean[] changed) {
        String current = normalizeStrictScheme(element.getNamespaceURI());
        String mapped = mapNamespace(current, target);
        Element currentElement = element;
        if (mapped != null && !mapped.equals(current)) {
            Node renamed = doc.renameNode(element, mapped, element.getNodeName());
            currentElement = (Element) renamed;
            changed[0] = true;
        }
        NamedNodeMap attrs = currentElement.getAttributes();
        ArrayList<Attr> normalAttrs = new ArrayList<>();
        ArrayList<Attr> xmlnsAttrs = new ArrayList<>();
        for (int i = 0; i < attrs.getLength(); i++) if (attrs.item(i) instanceof Attr a) {
            if (XMLConstants.XMLNS_ATTRIBUTE_NS_URI.equals(a.getNamespaceURI())) xmlnsAttrs.add(a); else normalAttrs.add(a);
        }
        for (Attr a : xmlnsAttrs) {
            String v = normalizeStrictScheme(a.getValue());
            String mv = mapNamespace(v, target);
            if (mv != null && !mv.equals(v)) { a.setValue(mv); changed[0] = true; }
        }
        for (Attr a : normalAttrs) {
            String ans = normalizeStrictScheme(a.getNamespaceURI());
            String am = mapNamespace(ans, target);
            if (am != null && !am.equals(ans)) {
                doc.renameNode(a, am, a.getNodeName());
                changed[0] = true;
            }
        }
        ArrayList<Element> children = new ArrayList<>();
        NodeList nodes = currentElement.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) if (nodes.item(i) instanceof Element child) children.add(child);
        for (Element child : children) rewriteElement(doc, child, target, changed);
    }

    private static int rewriteRelationshipTypeValues(Document doc, Profile target) {
        NodeList rels = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        int changed = 0;
        for (int i = 0; i < rels.getLength(); i++) {
            Element rel = (Element) rels.item(i);
            String type = normalizeStrictScheme(rel.getAttribute("Type"));
            String replacement = null;
            if (target == Profile.STRICT && type.startsWith(OFFICE_REL_TRANSITIONAL_PREFIX)) {
                replacement = OFFICE_REL_STRICT_PREFIX + type.substring(OFFICE_REL_TRANSITIONAL_PREFIX.length());
            } else if (target == Profile.TRANSITIONAL && type.startsWith(OFFICE_REL_STRICT_PREFIX)) {
                replacement = OFFICE_REL_TRANSITIONAL_PREFIX + type.substring(OFFICE_REL_STRICT_PREFIX.length());
            } else if (target == Profile.TRANSITIONAL && "http://purl.oclc.org/ooxml/relationships/officeDocument".equals(type)) {
                replacement = OFFICE_DOCUMENT_REL_TRANSITIONAL;
            }
            if (replacement != null && !replacement.equals(type)) { rel.setAttribute("Type", replacement); changed++; }
        }
        return changed;
    }

    private static String mapNamespace(String ns, Profile target) {
        if (ns == null || ns.isBlank()) return null;
        if (target == Profile.STRICT) return TRANSITIONAL_TO_STRICT.get(ns);
        if (target == Profile.TRANSITIONAL) return STRICT_TO_TRANSITIONAL.get(ns);
        return null;
    }

    private static List<String> mappingList(Profile source, Profile target) {
        if (source == target) return List.of();
        Map<String, String> map = target == Profile.STRICT ? TRANSITIONAL_TO_STRICT : STRICT_TO_TRANSITIONAL;
        return map.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e -> e.getKey() + " -> " + e.getValue()).toList();
    }

    private static boolean isProfileOwnedPart(String name) {
        return MAIN_DOCUMENT.equals(name) || name.endsWith(".rels") || (name.endsWith(".xml") && name.startsWith("word/"));
    }

    private static Map<String, String> inverse(Map<String, String> input) {
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : input.entrySet()) out.put(e.getValue(), e.getKey());
        return Map.copyOf(out);
    }

    private static String normalizeStrictScheme(String value) {
        if (value == null) return "";
        if (value.startsWith("https://purl.oclc.org/ooxml/")) return "http://" + value.substring("https://".length());
        return value;
    }

    private static String required(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + " required");
        return value;
    }

    private static String sha(String value) {
        String v = required(value, "sha256").toLowerCase(Locale.ROOT);
        if (!v.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("invalid sha256");
        return v;
    }
}
