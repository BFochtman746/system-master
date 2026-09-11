package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * DOCUMENT-DOCX-MASTERY/T01 semantic WordprocessingML engine.
 *
 * This is deliberately feature-specific rather than a generic OOXML escape hatch. It provides typed
 * run, paragraph, style, section, and page-geometry operations while preserving unrelated OPC parts.
 */
public final class DocxNativeMasteryEngine {
    public static final String WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    public record RunFormat(
            String styleId,
            Boolean bold,
            Boolean italic,
            String underline,
            String colorHex,
            String fontAscii,
            Integer sizeHalfPoints,
            String language) {
        public RunFormat {
            styleId = clean(styleId);
            underline = clean(underline);
            colorHex = clean(colorHex).toUpperCase(Locale.ROOT);
            fontAscii = clean(fontAscii);
            language = clean(language);
            if (!colorHex.isBlank() && !colorHex.equals("AUTO") && !colorHex.matches("[0-9A-F]{6}")) {
                throw new IllegalArgumentException("colorHex must be RRGGBB or auto");
            }
            if (sizeHalfPoints != null && (sizeHalfPoints < 2 || sizeHalfPoints > 1638)) {
                throw new IllegalArgumentException("sizeHalfPoints out of range");
            }
        }

        public static RunFormat empty() {
            return new RunFormat("", null, null, "", "", "", null, "");
        }
    }

    public record ParagraphFormat(
            String styleId,
            String alignment,
            Integer leftTwips,
            Integer rightTwips,
            Integer firstLineTwips,
            Integer hangingTwips,
            Integer spacingBeforeTwips,
            Integer spacingAfterTwips,
            Integer lineTwips,
            Boolean keepNext,
            Boolean keepLines,
            Boolean widowControl) {
        public ParagraphFormat {
            styleId = clean(styleId);
            alignment = clean(alignment);
            if (!alignment.isBlank() && !List.of("left", "center", "right", "both", "distribute", "start", "end").contains(alignment)) {
                throw new IllegalArgumentException("unsupported paragraph alignment: " + alignment);
            }
            for (Integer value : new Integer[] { leftTwips, rightTwips, firstLineTwips, hangingTwips, spacingBeforeTwips, spacingAfterTwips, lineTwips }) {
                if (value != null && Math.abs((long) value) > 1_000_000L) {
                    throw new IllegalArgumentException("paragraph twips value out of range");
                }
            }
            if (firstLineTwips != null && hangingTwips != null) {
                throw new IllegalArgumentException("firstLineTwips and hangingTwips are mutually exclusive");
            }
        }

        public static ParagraphFormat empty() {
            return new ParagraphFormat("", "", null, null, null, null, null, null, null, null, null, null);
        }
    }

    public record SectionFormat(
            Integer widthTwips,
            Integer heightTwips,
            String orientation,
            Integer marginTopTwips,
            Integer marginRightTwips,
            Integer marginBottomTwips,
            Integer marginLeftTwips,
            Integer marginHeaderTwips,
            Integer marginFooterTwips,
            Integer gutterTwips) {
        public SectionFormat {
            orientation = clean(orientation);
            if (!orientation.isBlank() && !List.of("portrait", "landscape").contains(orientation)) {
                throw new IllegalArgumentException("orientation must be portrait or landscape");
            }
            if ((widthTwips != null && widthTwips <= 0) || (heightTwips != null && heightTwips <= 0)) {
                throw new IllegalArgumentException("page dimensions must be positive");
            }
            for (Integer value : new Integer[] { marginTopTwips, marginRightTwips, marginBottomTwips, marginLeftTwips, marginHeaderTwips, marginFooterTwips, gutterTwips }) {
                if (value != null && (value < 0 || value > 1_000_000)) {
                    throw new IllegalArgumentException("section margin out of range");
                }
            }
        }

        public static SectionFormat empty() {
            return new SectionFormat(null, null, "", null, null, null, null, null, null, null);
        }
    }

    public record StyleSpec(
            String styleId,
            String type,
            String name,
            String basedOn,
            ParagraphFormat paragraph,
            RunFormat run) {
        public StyleSpec {
            styleId = requireToken(styleId, "styleId");
            type = clean(type).isBlank() ? "paragraph" : clean(type);
            if (!List.of("paragraph", "character", "table", "numbering").contains(type)) {
                throw new IllegalArgumentException("unsupported style type: " + type);
            }
            name = clean(name).isBlank() ? styleId : clean(name);
            basedOn = clean(basedOn);
            if (styleId.equals(basedOn)) {
                throw new IllegalArgumentException("style cannot be based on itself");
            }
            paragraph = Objects.requireNonNullElseGet(paragraph, ParagraphFormat::empty);
            run = Objects.requireNonNullElseGet(run, RunFormat::empty);
        }
    }

    public record RunSpec(String text, RunFormat format) {
        public RunSpec {
            text = Objects.requireNonNullElse(text, "");
            format = Objects.requireNonNullElseGet(format, RunFormat::empty);
        }
    }

    public record ParagraphSpec(ParagraphFormat format, List<RunSpec> runs) {
        public ParagraphSpec {
            format = Objects.requireNonNullElseGet(format, ParagraphFormat::empty);
            runs = List.copyOf(Objects.requireNonNullElse(runs, List.of()));
        }
    }

    public record RunSnapshot(String text, RunFormat format) {}
    public record ParagraphSnapshot(String text, ParagraphFormat format) {}
    public record SectionSnapshot(SectionFormat format) {}
    public record StyleSnapshot(String styleId, String type, String name, String basedOn, ParagraphFormat paragraph, RunFormat run) {}

    public RunSnapshot readRun(byte[] bytes, String locator) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Element run = locate(parts, "word/document.xml", locator, "r");
        return new RunSnapshot(text(run), readRunFormat(run));
    }

    public ParagraphSnapshot readParagraph(byte[] bytes, String locator) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Element paragraph = locate(parts, "word/document.xml", locator, "p");
        return new ParagraphSnapshot(text(paragraph), readParagraphFormat(paragraph));
    }

    public SectionSnapshot readSection(byte[] bytes, String locator) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Element section = locate(parts, "word/document.xml", locator, "sectPr");
        return new SectionSnapshot(readSectionFormat(section));
    }

    public Map<String, StyleSnapshot> readStyles(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        byte[] styleBytes = parts.get("word/styles.xml");
        if (styleBytes == null) {
            return Map.of();
        }
        Document doc = OoxmlPackageSupport.parseXml(styleBytes);
        LinkedHashMap<String, StyleSnapshot> out = new LinkedHashMap<>();
        NodeList styles = doc.getElementsByTagNameNS(WORD_NS, "style");
        for (int i = 0; i < styles.getLength(); i++) {
            Element style = (Element) styles.item(i);
            String id = style.getAttributeNS(WORD_NS, "styleId");
            if (id.isBlank()) {
                continue;
            }
            out.put(id, new StyleSnapshot(
                    id,
                    style.getAttributeNS(WORD_NS, "type"),
                    value(firstDirect(style, "name"), "val"),
                    value(firstDirect(style, "basedOn"), "val"),
                    readParagraphFormatFromProperties(firstDirect(style, "pPr")),
                    readRunFormatFromProperties(firstDirect(style, "rPr"))));
        }
        return Map.copyOf(out);
    }

    public byte[] insertRun(byte[] bytes, String paragraphLocator, RunSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element paragraph = locate(document, paragraphLocator, "p");
            Element run = document.createElementNS(WORD_NS, "w:r");
            applyRunFormat(run, spec.format());
            appendText(document, run, spec.text());
            paragraph.appendChild(run);
        });
    }

    public byte[] formatRun(byte[] bytes, String runLocator, RunFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        return mutateDocument(bytes, document -> applyRunFormat(locate(document, runLocator, "r"), format));
    }

    public byte[] insertParagraph(byte[] bytes, String afterParagraphLocator, ParagraphSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element after = locate(document, afterParagraphLocator, "p");
            Element paragraph = document.createElementNS(WORD_NS, "w:p");
            applyParagraphFormat(paragraph, spec.format());
            for (RunSpec runSpec : spec.runs()) {
                Element run = document.createElementNS(WORD_NS, "w:r");
                applyRunFormat(run, runSpec.format());
                appendText(document, run, runSpec.text());
                paragraph.appendChild(run);
            }
            insertAfter(after, paragraph);
        });
    }

    public byte[] formatParagraph(byte[] bytes, String paragraphLocator, ParagraphFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        return mutateDocument(bytes, document -> applyParagraphFormat(locate(document, paragraphLocator, "p"), format));
    }

    public byte[] upsertStyle(byte[] bytes, StyleSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = new LinkedHashMap<>(requireDocx(bytes));
        ensureStylesPart(parts);
        Document styles = OoxmlPackageSupport.parseXml(parts.get("word/styles.xml"));
        Element root = styles.getDocumentElement();
        Element style = null;
        for (Element candidate : directChildren(root, "style")) {
            if (spec.styleId().equals(candidate.getAttributeNS(WORD_NS, "styleId"))) {
                style = candidate;
                break;
            }
        }
        if (style == null) {
            style = styles.createElementNS(WORD_NS, "w:style");
            root.appendChild(style);
        }
        style.setAttributeNS(WORD_NS, "w:styleId", spec.styleId());
        style.setAttributeNS(WORD_NS, "w:type", spec.type());
        setValChild(style, "name", spec.name());
        if (spec.basedOn().isBlank()) {
            removeDirect(style, "basedOn");
        } else {
            setValChild(style, "basedOn", spec.basedOn());
        }
        Element pPr = ensureDirect(style, "pPr", true);
        clearChildren(pPr);
        applyParagraphProperties(pPr, spec.paragraph());
        if (!pPr.hasChildNodes()) {
            style.removeChild(pPr);
        }
        Element rPr = ensureDirect(style, "rPr", false);
        clearChildren(rPr);
        applyRunProperties(rPr, spec.run());
        if (!rPr.hasChildNodes()) {
            style.removeChild(rPr);
        }
        parts.put("word/styles.xml", OoxmlPackageSupport.serialize(styles));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] insertSectionBreak(byte[] bytes, String afterParagraphLocator, SectionFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        return mutateDocument(bytes, document -> {
            Element after = locate(document, afterParagraphLocator, "p");
            Element paragraph = document.createElementNS(WORD_NS, "w:p");
            Element pPr = document.createElementNS(WORD_NS, "w:pPr");
            Element sectPr = document.createElementNS(WORD_NS, "w:sectPr");
            applySectionFormat(sectPr, format);
            pPr.appendChild(sectPr);
            paragraph.appendChild(pPr);
            insertAfter(after, paragraph);
        });
    }

    public byte[] formatSection(byte[] bytes, String sectionLocator, SectionFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        return mutateDocument(bytes, document -> applySectionFormat(locate(document, sectionLocator, "sectPr"), format));
    }

    private static RunFormat readRunFormat(Element run) {
        return readRunFormatFromProperties(firstDirect(run, "rPr"));
    }

    private static RunFormat readRunFormatFromProperties(Element rPr) {
        if (rPr == null) {
            return RunFormat.empty();
        }
        Element fonts = firstDirect(rPr, "rFonts");
        Element size = firstDirect(rPr, "sz");
        return new RunFormat(
                value(firstDirect(rPr, "rStyle"), "val"),
                onOff(firstDirect(rPr, "b")),
                onOff(firstDirect(rPr, "i")),
                value(firstDirect(rPr, "u"), "val"),
                value(firstDirect(rPr, "color"), "val"),
                fonts == null ? "" : fonts.getAttributeNS(WORD_NS, "ascii"),
                intOrNull(value(size, "val")),
                value(firstDirect(rPr, "lang"), "val"));
    }

    private static ParagraphFormat readParagraphFormat(Element paragraph) {
        return readParagraphFormatFromProperties(firstDirect(paragraph, "pPr"));
    }

    private static ParagraphFormat readParagraphFormatFromProperties(Element pPr) {
        if (pPr == null) {
            return ParagraphFormat.empty();
        }
        Element ind = firstDirect(pPr, "ind");
        Element spacing = firstDirect(pPr, "spacing");
        return new ParagraphFormat(
                value(firstDirect(pPr, "pStyle"), "val"),
                value(firstDirect(pPr, "jc"), "val"),
                intAttr(ind, "left"),
                intAttr(ind, "right"),
                intAttr(ind, "firstLine"),
                intAttr(ind, "hanging"),
                intAttr(spacing, "before"),
                intAttr(spacing, "after"),
                intAttr(spacing, "line"),
                onOff(firstDirect(pPr, "keepNext")),
                onOff(firstDirect(pPr, "keepLines")),
                onOff(firstDirect(pPr, "widowControl")));
    }

    private static SectionFormat readSectionFormat(Element sectPr) {
        Element size = firstDirect(sectPr, "pgSz");
        Element margin = firstDirect(sectPr, "pgMar");
        return new SectionFormat(
                intAttr(size, "w"),
                intAttr(size, "h"),
                value(size, "orient"),
                intAttr(margin, "top"),
                intAttr(margin, "right"),
                intAttr(margin, "bottom"),
                intAttr(margin, "left"),
                intAttr(margin, "header"),
                intAttr(margin, "footer"),
                intAttr(margin, "gutter"));
    }

    private static void applyRunFormat(Element run, RunFormat format) {
        Element rPr = ensureDirect(run, "rPr", true);
        applyRunProperties(rPr, format);
        if (!rPr.hasChildNodes()) {
            run.removeChild(rPr);
        }
    }

    private static void applyRunProperties(Element rPr, RunFormat format) {
        if (!format.styleId().isBlank()) setValChild(rPr, "rStyle", format.styleId());
        setOnOff(rPr, "b", format.bold());
        setOnOff(rPr, "i", format.italic());
        if (!format.underline().isBlank()) setValChild(rPr, "u", format.underline());
        if (!format.colorHex().isBlank()) setValChild(rPr, "color", format.colorHex());
        if (!format.fontAscii().isBlank()) {
            Element fonts = ensureDirect(rPr, "rFonts", false);
            fonts.setAttributeNS(WORD_NS, "w:ascii", format.fontAscii());
            fonts.setAttributeNS(WORD_NS, "w:hAnsi", format.fontAscii());
        }
        if (format.sizeHalfPoints() != null) setValChild(rPr, "sz", Integer.toString(format.sizeHalfPoints()));
        if (!format.language().isBlank()) setValChild(rPr, "lang", format.language());
    }

    private static void applyParagraphFormat(Element paragraph, ParagraphFormat format) {
        Element pPr = ensureDirect(paragraph, "pPr", true);
        applyParagraphProperties(pPr, format);
        if (!pPr.hasChildNodes()) {
            paragraph.removeChild(pPr);
        }
    }

    private static void applyParagraphProperties(Element pPr, ParagraphFormat format) {
        if (!format.styleId().isBlank()) setValChild(pPr, "pStyle", format.styleId());
        if (!format.alignment().isBlank()) setValChild(pPr, "jc", format.alignment());
        if (format.leftTwips() != null || format.rightTwips() != null || format.firstLineTwips() != null || format.hangingTwips() != null) {
            Element ind = ensureDirect(pPr, "ind", false);
            setIntAttr(ind, "left", format.leftTwips());
            setIntAttr(ind, "right", format.rightTwips());
            setIntAttr(ind, "firstLine", format.firstLineTwips());
            setIntAttr(ind, "hanging", format.hangingTwips());
        }
        if (format.spacingBeforeTwips() != null || format.spacingAfterTwips() != null || format.lineTwips() != null) {
            Element spacing = ensureDirect(pPr, "spacing", false);
            setIntAttr(spacing, "before", format.spacingBeforeTwips());
            setIntAttr(spacing, "after", format.spacingAfterTwips());
            setIntAttr(spacing, "line", format.lineTwips());
        }
        setOnOff(pPr, "keepNext", format.keepNext());
        setOnOff(pPr, "keepLines", format.keepLines());
        setOnOff(pPr, "widowControl", format.widowControl());
    }

    private static void applySectionFormat(Element sectPr, SectionFormat format) {
        if (format.widthTwips() != null || format.heightTwips() != null || !format.orientation().isBlank()) {
            Element size = ensureDirect(sectPr, "pgSz", false);
            setIntAttr(size, "w", format.widthTwips());
            setIntAttr(size, "h", format.heightTwips());
            if (!format.orientation().isBlank()) size.setAttributeNS(WORD_NS, "w:orient", format.orientation());
        }
        if (format.marginTopTwips() != null || format.marginRightTwips() != null || format.marginBottomTwips() != null
                || format.marginLeftTwips() != null || format.marginHeaderTwips() != null || format.marginFooterTwips() != null || format.gutterTwips() != null) {
            Element margin = ensureDirect(sectPr, "pgMar", false);
            setIntAttr(margin, "top", format.marginTopTwips());
            setIntAttr(margin, "right", format.marginRightTwips());
            setIntAttr(margin, "bottom", format.marginBottomTwips());
            setIntAttr(margin, "left", format.marginLeftTwips());
            setIntAttr(margin, "header", format.marginHeaderTwips());
            setIntAttr(margin, "footer", format.marginFooterTwips());
            setIntAttr(margin, "gutter", format.gutterTwips());
        }
    }

    private static byte[] mutateDocument(byte[] bytes, XmlMutation mutation) throws IOException {
        Map<String, byte[]> parts = new LinkedHashMap<>(requireDocx(bytes));
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        mutation.apply(document);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        return OoxmlPackageSupport.write(parts);
    }

    private static Map<String, byte[]> requireDocx(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        if (!parts.containsKey("[Content_Types].xml") || !parts.containsKey("word/document.xml")) {
            throw new IOException("not a WordprocessingML package");
        }
        return parts;
    }

    private static Element locate(Map<String, byte[]> parts, String part, String locator, String expectedLocal) throws IOException {
        byte[] bytes = parts.get(part);
        if (bytes == null) throw new IOException("missing DOCX part: " + part);
        return locate(OoxmlPackageSupport.parseXml(bytes), locator, expectedLocal);
    }

    private static Element locate(Document document, String locator, String expectedLocal) {
        String normalized = Objects.requireNonNullElse(locator, "").strip();
        if (normalized.isBlank() || normalized.contains("..") || normalized.startsWith("/")) {
            throw new IllegalArgumentException("unsafe or empty DOCX locator");
        }
        String[] tokens = normalized.split("/");
        Element current;
        int offset;
        if (tokens[0].equals("body")) {
            NodeList bodies = document.getElementsByTagNameNS(WORD_NS, "body");
            if (bodies.getLength() != 1) throw new IllegalArgumentException("DOCX body locator ambiguous");
            current = (Element) bodies.item(0);
            offset = 1;
        } else {
            throw new IllegalArgumentException("unsupported DOCX locator root: " + tokens[0]);
        }
        for (int i = offset; i < tokens.length; i++) {
            String token = tokens[i];
            int colon = token.lastIndexOf(':');
            if (colon <= 0 || colon == token.length() - 1) throw new IllegalArgumentException("invalid DOCX locator token: " + token);
            String local = token.substring(0, colon);
            int index;
            try {
                index = Integer.parseInt(token.substring(colon + 1));
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("invalid DOCX locator index: " + token, exception);
            }
            if (index < 1) throw new IllegalArgumentException("DOCX locator index must be 1-based");
            List<Element> candidates = directChildren(current, local);
            if (index > candidates.size()) throw new IllegalArgumentException("DOCX locator not found: " + locator);
            current = candidates.get(index - 1);
        }
        if (!expectedLocal.equals(current.getLocalName())) {
            throw new IllegalArgumentException("DOCX locator expected " + expectedLocal + " but found " + current.getLocalName());
        }
        return current;
    }

    private static void ensureStylesPart(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/styles.xml")) {
            String styles = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:styles xmlns:w=\"" + WORD_NS + "\"/>";
            parts.put("word/styles.xml", styles.getBytes(StandardCharsets.UTF_8));
        }
        Document contentTypes = OoxmlPackageSupport.parseXml(parts.get("[Content_Types].xml"));
        if (!hasOverride(contentTypes, "/word/styles.xml")) {
            Element override = contentTypes.createElementNS(CONTENT_TYPES_NS, "Override");
            override.setAttribute("PartName", "/word/styles.xml");
            override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml");
            contentTypes.getDocumentElement().appendChild(override);
            parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(contentTypes));
        }
        byte[] relBytes = parts.get("word/_rels/document.xml.rels");
        if (relBytes == null) {
            String rels = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"" + REL_NS + "\"/>";
            relBytes = rels.getBytes(StandardCharsets.UTF_8);
        }
        Document rels = OoxmlPackageSupport.parseXml(relBytes);
        if (!hasRelationshipType(rels, OFFICE_REL_NS + "/styles")) {
            Element rel = rels.createElementNS(REL_NS, "Relationship");
            rel.setAttribute("Id", nextRelationshipId(rels));
            rel.setAttribute("Type", OFFICE_REL_NS + "/styles");
            rel.setAttribute("Target", "styles.xml");
            rels.getDocumentElement().appendChild(rel);
            parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        }
    }

    private static boolean hasOverride(Document doc, String partName) {
        NodeList nodes = doc.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override");
        for (int i = 0; i < nodes.getLength(); i++) {
            if (partName.equals(((Element) nodes.item(i)).getAttribute("PartName"))) return true;
        }
        return false;
    }

    private static boolean hasRelationshipType(Document doc, String type) {
        NodeList nodes = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            if (type.equals(((Element) nodes.item(i)).getAttribute("Type"))) return true;
        }
        return false;
    }

    private static String nextRelationshipId(Document doc) {
        int max = 0;
        NodeList nodes = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            String id = ((Element) nodes.item(i)).getAttribute("Id");
            if (id.startsWith("rId")) {
                try { max = Math.max(max, Integer.parseInt(id.substring(3))); }
                catch (NumberFormatException ignored) { /* non-numeric relationship IDs are preserved */ }
            }
        }
        return "rId" + (max + 1);
    }

    private static void appendText(Document document, Element run, String text) {
        Element t = document.createElementNS(WORD_NS, "w:t");
        String value = Objects.requireNonNullElse(text, "");
        if (!value.isEmpty() && (Character.isWhitespace(value.charAt(0)) || Character.isWhitespace(value.charAt(value.length() - 1)))) {
            t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        }
        t.setTextContent(value);
        run.appendChild(t);
    }

    private static String text(Element element) {
        NodeList texts = element.getElementsByTagNameNS(WORD_NS, "t");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < texts.getLength(); i++) out.append(texts.item(i).getTextContent());
        return out.toString();
    }

    private static Element ensureDirect(Element parent, String local, boolean first) {
        Element existing = firstDirect(parent, local);
        if (existing != null) return existing;
        Document document = parent.getOwnerDocument();
        Element created = document.createElementNS(WORD_NS, "w:" + local);
        if (first && parent.getFirstChild() != null) parent.insertBefore(created, parent.getFirstChild());
        else parent.appendChild(created);
        return created;
    }

    private static Element firstDirect(Element parent, String local) {
        if (parent == null) return null;
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && WORD_NS.equals(element.getNamespaceURI()) && local.equals(element.getLocalName())) return element;
        }
        return null;
    }

    private static List<Element> directChildren(Element parent, String local) {
        ArrayList<Element> out = new ArrayList<>();
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && WORD_NS.equals(element.getNamespaceURI()) && local.equals(element.getLocalName())) out.add(element);
        }
        return out;
    }

    private static void insertAfter(Node current, Node added) {
        Node parent = current.getParentNode();
        Node next = current.getNextSibling();
        if (next == null) parent.appendChild(added); else parent.insertBefore(added, next);
    }

    private static void setValChild(Element parent, String local, String val) {
        Element child = ensureDirect(parent, local, false);
        child.setAttributeNS(WORD_NS, "w:val", val);
    }

    private static void setOnOff(Element parent, String local, Boolean value) {
        if (value == null) return;
        Element child = ensureDirect(parent, local, false);
        child.setAttributeNS(WORD_NS, "w:val", value ? "1" : "0");
    }

    private static void setIntAttr(Element element, String local, Integer value) {
        if (value != null) element.setAttributeNS(WORD_NS, "w:" + local, Integer.toString(value));
    }

    private static String value(Element element, String local) {
        return element == null ? "" : Objects.requireNonNullElse(element.getAttributeNS(WORD_NS, local), "");
    }

    private static Integer intAttr(Element element, String local) {
        return intOrNull(value(element, local));
    }

    private static Integer intOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Integer.valueOf(value); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid integer WordprocessingML value: " + value, exception); }
    }

    private static Boolean onOff(Element element) {
        if (element == null) return null;
        String value = value(element, "val").strip().toLowerCase(Locale.ROOT);
        return value.isBlank() || value.equals("1") || value.equals("true") || value.equals("on");
    }

    private static void removeDirect(Element parent, String local) {
        Element child = firstDirect(parent, local);
        if (child != null) parent.removeChild(child);
    }

    private static void clearChildren(Element element) {
        while (element.getFirstChild() != null) element.removeChild(element.getFirstChild());
    }

    private static String clean(String value) {
        return Objects.requireNonNullElse(value, "").strip();
    }

    private static String requireToken(String value, String name) {
        String token = clean(value);
        if (!token.matches("[A-Za-z0-9_.-]{1,128}")) throw new IllegalArgumentException(name + " must be a safe token");
        return token;
    }

    @FunctionalInterface
    private interface XmlMutation {
        void apply(Document document) throws IOException;
    }
}
