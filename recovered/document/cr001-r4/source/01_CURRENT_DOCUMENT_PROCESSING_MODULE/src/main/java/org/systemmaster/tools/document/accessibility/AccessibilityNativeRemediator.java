package org.systemmaster.tools.document.accessibility;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;
import org.systemmaster.tools.document.DocumentSelector;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Applies only explicit, deterministic accessibility repairs; ambiguous semantic content is never invented. */
public final class AccessibilityNativeRemediator {
    private static final String DC = "http://purl.org/dc/elements/1.1/";
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

    public record Result(byte[] bytes, List<String> changedParts, List<String> diagnostics) {
        public Result {
            bytes = Objects.requireNonNull(bytes, "bytes").clone();
            changedParts = List.copyOf(Objects.requireNonNullElse(changedParts, List.of()));
            diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
        }

        @Override
        public byte[] bytes() {
            return bytes.clone();
        }
    }

    public Result apply(
            DocumentFormat format,
            byte[] source,
            CanonicalDocumentGraphV2 graph,
            DocumentOperationContract operation) throws IOException {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(graph, "graph");
        Objects.requireNonNull(operation, "operation");
        if (operation.type() != DocumentOperationContract.Type.ACCESSIBILITY_REPAIR) {
            throw new IllegalArgumentException("ACCESSIBILITY_REPAIR operation required");
        }
        if (!(format == DocumentFormat.DOCX || format == DocumentFormat.DOCM
                || format == DocumentFormat.PPTX || format == DocumentFormat.PPTM)) {
            throw new UnsupportedOperationException("deterministic native accessibility remediation pending for " + format);
        }
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(source));
        ArrayList<String> changed = new ArrayList<>();
        ArrayList<String> diagnostics = new ArrayList<>();
        boolean any = false;

        String title = operation.parameters().getOrDefault("documentTitle", "").strip();
        if (!title.isEmpty()) {
            updateCoreTitle(parts, title);
            changed.add("docProps/core.xml");
            diagnostics.add("A11Y_REPAIR_DOCUMENT_TITLE");
            any = true;
        }

        String language = operation.parameters().getOrDefault("language", "").strip();
        if (!language.isEmpty()) {
            if (!(format == DocumentFormat.DOCX || format == DocumentFormat.DOCM)) {
                throw new UnsupportedOperationException("portable language remediation is currently implemented only for DOCX/DOCM");
            }
            updateDocxDefaultLanguage(parts, language);
            changed.add("word/styles.xml");
            diagnostics.add("A11Y_REPAIR_DOCUMENT_LANGUAGE");
            any = true;
        }

        String alt = operation.parameters().getOrDefault("altText", "").strip();
        if (!alt.isEmpty()) {
            CanonicalDocumentGraphV2.Element target = selectedVisual(graph, operation.selectors());
            updateAltText(parts, format, target, alt);
            changed.add(target.nativeAnchor().nativePart());
            diagnostics.add("A11Y_REPAIR_ALT_TEXT:" + target.id());
            any = true;
        }

        if (!any) {
            throw new IllegalArgumentException("no deterministic accessibility repair parameter supplied");
        }
        return new Result(OoxmlPackageSupport.write(parts), changed.stream().distinct().sorted().toList(), diagnostics);
    }

    private static void updateCoreTitle(Map<String, byte[]> parts, String title) throws IOException {
        byte[] raw = parts.get("docProps/core.xml");
        if (raw == null) {
            throw new UnsupportedOperationException("core properties part missing; adding new OPC relationships is a later native-mastery operation");
        }
        Document doc = OoxmlPackageSupport.parseXml(raw);
        Element root = doc.getDocumentElement();
        NodeList titles = doc.getElementsByTagNameNS(DC, "title");
        Element target;
        if (titles.getLength() > 0) {
            target = (Element) titles.item(0);
        } else {
            target = doc.createElementNS(DC, "dc:title");
            root.appendChild(target);
        }
        target.setTextContent(title);
        parts.put("docProps/core.xml", OoxmlPackageSupport.serialize(doc));
    }

    private static void updateDocxDefaultLanguage(Map<String, byte[]> parts, String language) throws IOException {
        byte[] raw = parts.get("word/styles.xml");
        if (raw == null) {
            throw new UnsupportedOperationException("word/styles.xml required for deterministic default-language remediation");
        }
        Document doc = OoxmlPackageSupport.parseXml(raw);
        Element styles = doc.getDocumentElement();
        Element docDefaults = firstChild(styles, W, "docDefaults");
        if (docDefaults == null) {
            docDefaults = doc.createElementNS(W, "w:docDefaults");
            styles.insertBefore(docDefaults, styles.getFirstChild());
        }
        Element rPrDefault = firstChild(docDefaults, W, "rPrDefault");
        if (rPrDefault == null) {
            rPrDefault = doc.createElementNS(W, "w:rPrDefault");
            docDefaults.appendChild(rPrDefault);
        }
        Element rPr = firstChild(rPrDefault, W, "rPr");
        if (rPr == null) {
            rPr = doc.createElementNS(W, "w:rPr");
            rPrDefault.appendChild(rPr);
        }
        Element lang = firstChild(rPr, W, "lang");
        if (lang == null) {
            lang = doc.createElementNS(W, "w:lang");
            rPr.appendChild(lang);
        }
        lang.setAttributeNS(W, "w:val", language);
        parts.put("word/styles.xml", OoxmlPackageSupport.serialize(doc));
    }

    private static CanonicalDocumentGraphV2.Element selectedVisual(
            CanonicalDocumentGraphV2 graph,
            List<DocumentSelector> selectors) {
        List<String> ids = selectors.stream()
                .filter(selector -> selector.kind() == DocumentSelector.Kind.NODE_ID)
                .map(DocumentSelector::value)
                .toList();
        if (ids.size() != 1) {
            throw new IllegalArgumentException("alt-text repair requires exactly one CDG-2 NODE_ID selector");
        }
        CanonicalDocumentGraphV2.Element target = graph.elements().stream()
                .filter(element -> ids.getFirst().equals(element.id()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("selected CDG-2 element not found"));
        if (!(target.type() == CanonicalDocumentGraphV2.ElementType.IMAGE
                || target.type() == CanonicalDocumentGraphV2.ElementType.CHART
                || target.type() == CanonicalDocumentGraphV2.ElementType.DIAGRAM)) {
            throw new IllegalArgumentException("alt-text repair selector must target an image/chart/diagram");
        }
        if (target.nativeAnchor().nativeObjectId().isBlank() || target.nativeAnchor().nativePart().isBlank()) {
            throw new UnsupportedOperationException("selected visual lacks a stable native object anchor");
        }
        return target;
    }

    private static void updateAltText(
            Map<String, byte[]> parts,
            DocumentFormat format,
            CanonicalDocumentGraphV2.Element target,
            String alt) throws IOException {
        String part = target.nativeAnchor().nativePart();
        byte[] raw = parts.get(part);
        if (raw == null) {
            throw new IllegalArgumentException("native part not found: " + part);
        }
        Document doc = OoxmlPackageSupport.parseXml(raw);
        String objectId = target.nativeAnchor().nativeObjectId();
        Element property = null;
        NodeList all = doc.getElementsByTagNameNS("*", format.presentationFamily() ? "cNvPr" : "docPr");
        for (int i = 0; i < all.getLength(); i++) {
            Element candidate = (Element) all.item(i);
            if (objectId.equals(candidate.getAttribute("id"))) {
                property = candidate;
                break;
            }
        }
        if (property == null) {
            throw new IllegalStateException("native accessibility property anchor not found");
        }
        property.setAttribute("descr", alt);
        parts.put(part, OoxmlPackageSupport.serialize(doc));
    }

    private static Element firstChild(Element parent, String namespace, String local) {
        if (parent == null) {
            return null;
        }
        for (Node node = parent.getFirstChild(); node != null; node = node.getNextSibling()) {
            if (node instanceof Element element
                    && local.equals(element.getLocalName())
                    && namespace.equals(element.getNamespaceURI())) {
                return element;
            }
        }
        return null;
    }
}
