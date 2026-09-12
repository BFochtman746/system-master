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
 * DOCUMENT-DOCX-MASTERY-T02 typed WordprocessingML page architecture engine.
 *
 * <p>The engine exposes semantic operations for page borders/background, columns, line numbering,
 * headers/footers and their variants, page numbering, and page/section/column breaks. All OOXML
 * mutations preserve unrelated OPC parts byte-for-byte through {@link OoxmlPackageSupport}.</p>
 */
public final class DocxPageArchitectureEngine {
    public static final String WORD_NS = DocxNativeMasteryEngine.WORD_NS;
    private static final String OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";

    public record BorderEdge(String style, Integer sizeEighthPoints, Integer spacePoints, String colorHex) {
        public BorderEdge {
            style = clean(style);
            colorHex = normalizeColor(colorHex);
            if (!style.isBlank() && !style.matches("[A-Za-z][A-Za-z0-9_-]{0,63}")) {
                throw new IllegalArgumentException("border style must be a safe OOXML token");
            }
            if (sizeEighthPoints != null && (sizeEighthPoints < 0 || sizeEighthPoints > 768)) {
                throw new IllegalArgumentException("border size out of range");
            }
            if (spacePoints != null && (spacePoints < 0 || spacePoints > 255)) {
                throw new IllegalArgumentException("border space out of range");
            }
        }

        public static BorderEdge empty() {
            return new BorderEdge("", null, null, "");
        }
    }

    public record PageBorders(
            String offsetFrom,
            String display,
            String zOrder,
            BorderEdge top,
            BorderEdge right,
            BorderEdge bottom,
            BorderEdge left) {
        public PageBorders {
            offsetFrom = clean(offsetFrom);
            display = clean(display);
            zOrder = clean(zOrder);
            if (!offsetFrom.isBlank() && !List.of("page", "text").contains(offsetFrom)) {
                throw new IllegalArgumentException("offsetFrom must be page or text");
            }
            if (!display.isBlank() && !List.of("allPages", "firstPage", "notFirstPage").contains(display)) {
                throw new IllegalArgumentException("unsupported page-border display");
            }
            if (!zOrder.isBlank() && !List.of("front", "back").contains(zOrder)) {
                throw new IllegalArgumentException("zOrder must be front or back");
            }
        }

        public static PageBorders empty() {
            return new PageBorders("", "", "", null, null, null, null);
        }
    }

    public record PageBackground(String colorHex, String themeColor, String themeTint, String themeShade) {
        public PageBackground {
            colorHex = normalizeColor(colorHex);
            themeColor = clean(themeColor);
            themeTint = normalizeByteHex(themeTint, "themeTint");
            themeShade = normalizeByteHex(themeShade, "themeShade");
            if (!themeColor.isBlank() && !themeColor.matches("[A-Za-z][A-Za-z0-9_-]{0,63}")) {
                throw new IllegalArgumentException("themeColor must be a safe OOXML token");
            }
        }

        public static PageBackground empty() {
            return new PageBackground("", "", "", "");
        }
    }

    public record ColumnSpec(Integer widthTwips, Integer spaceTwips) {
        public ColumnSpec {
            if (widthTwips != null && widthTwips <= 0) throw new IllegalArgumentException("column width must be positive");
            if (spaceTwips != null && spaceTwips < 0) throw new IllegalArgumentException("column space cannot be negative");
        }
    }

    public record ColumnLayout(
            Integer count,
            Integer spacingTwips,
            Boolean separator,
            Boolean equalWidth,
            List<ColumnSpec> columns) {
        public ColumnLayout {
            if (count != null && (count < 1 || count > 45)) throw new IllegalArgumentException("column count out of range");
            if (spacingTwips != null && spacingTwips < 0) throw new IllegalArgumentException("column spacing cannot be negative");
            columns = List.copyOf(Objects.requireNonNullElse(columns, List.of()));
            if (count != null && !columns.isEmpty() && count < columns.size()) {
                throw new IllegalArgumentException("column count cannot be less than explicit column definitions");
            }
        }

        public static ColumnLayout empty() {
            return new ColumnLayout(null, null, null, null, List.of());
        }
    }

    public record LineNumbering(Integer countBy, Integer start, Integer distanceTwips, String restart) {
        public LineNumbering {
            restart = clean(restart);
            if (countBy != null && countBy < 1) throw new IllegalArgumentException("line-number countBy must be positive");
            if (start != null && start < 0) throw new IllegalArgumentException("line-number start cannot be negative");
            if (distanceTwips != null && distanceTwips < 0) throw new IllegalArgumentException("line-number distance cannot be negative");
            if (!restart.isBlank() && !List.of("newPage", "newSection", "continuous").contains(restart)) {
                throw new IllegalArgumentException("unsupported line-number restart");
            }
        }

        public static LineNumbering empty() {
            return new LineNumbering(null, null, null, "");
        }
    }

    public record HeaderFooterSpec(String kind, String variant, String text) {
        public HeaderFooterSpec {
            kind = clean(kind).toLowerCase(Locale.ROOT);
            variant = clean(variant).toLowerCase(Locale.ROOT);
            text = Objects.requireNonNullElse(text, "");
            if (!List.of("header", "footer").contains(kind)) throw new IllegalArgumentException("kind must be header or footer");
            if (!List.of("default", "first", "even").contains(variant)) throw new IllegalArgumentException("variant must be default, first, or even");
        }
    }

    public record HeaderFooterSnapshot(
            String sectionLocator,
            String sourceSectionLocator,
            String kind,
            String variant,
            String relationshipId,
            String partName,
            String text,
            boolean titlePage,
            boolean evenAndOddHeaders,
            boolean inherited) {}

    public record PageNumbering(Integer start, String format, Integer chapterStyle, String chapterSeparator) {
        public PageNumbering {
            format = clean(format);
            chapterSeparator = clean(chapterSeparator);
            if (start != null && start < 0) throw new IllegalArgumentException("page-number start cannot be negative");
            if (chapterStyle != null && chapterStyle < 0) throw new IllegalArgumentException("chapter style cannot be negative");
            if (!format.isBlank() && !format.matches("[A-Za-z][A-Za-z0-9_-]{0,63}")) {
                throw new IllegalArgumentException("page-number format must be a safe OOXML token");
            }
            if (!chapterSeparator.isBlank() && !List.of("hyphen", "period", "colon", "emDash", "enDash").contains(chapterSeparator)) {
                throw new IllegalArgumentException("unsupported chapter separator");
            }
        }

        public static PageNumbering empty() {
            return new PageNumbering(null, "", null, "");
        }
    }

    public record BreakSpec(String type) {
        public BreakSpec {
            type = clean(type);
            if (!List.of("page", "column").contains(type)) throw new IllegalArgumentException("break type must be page or column");
        }
    }

    public record BreakSnapshot(String type) {}

    public record SectionBreakSpec(String type) {
        public SectionBreakSpec {
            type = clean(type);
            if (!List.of("nextPage", "nextColumn", "continuous", "evenPage", "oddPage").contains(type)) {
                throw new IllegalArgumentException("unsupported section-break type");
            }
        }
    }

    public record SectionBreakSnapshot(String type) {}

    public PageBorders readPageBorders(byte[] bytes, String sectionLocator) throws IOException {
        Element section = locateDocumentPart(bytes, sectionLocator, "sectPr");
        Element borders = firstDirect(section, "pgBorders");
        if (borders == null) return PageBorders.empty();
        return new PageBorders(
                attr(borders, "offsetFrom"),
                attr(borders, "display"),
                attr(borders, "zOrder"),
                readBorder(firstDirect(borders, "top")),
                readBorder(firstDirect(borders, "right")),
                readBorder(firstDirect(borders, "bottom")),
                readBorder(firstDirect(borders, "left")));
    }

    public byte[] formatPageBorders(byte[] bytes, String sectionLocator, PageBorders spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element section = locate(document, sectionLocator, "sectPr");
            Element borders = ensureDirect(section, "pgBorders", false);
            setAttr(borders, "offsetFrom", spec.offsetFrom());
            setAttr(borders, "display", spec.display());
            setAttr(borders, "zOrder", spec.zOrder());
            applyBorder(borders, "top", spec.top());
            applyBorder(borders, "right", spec.right());
            applyBorder(borders, "bottom", spec.bottom());
            applyBorder(borders, "left", spec.left());
        });
    }

    public PageBackground readPageBackground(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element background = firstDirect(document.getDocumentElement(), "background");
        if (background == null) return PageBackground.empty();
        return new PageBackground(attr(background, "color"), attr(background, "themeColor"), attr(background, "themeTint"), attr(background, "themeShade"));
    }

    public byte[] formatPageBackground(byte[] bytes, PageBackground spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element root = document.getDocumentElement();
            Element background = firstDirect(root, "background");
            if (background == null) {
                background = document.createElementNS(WORD_NS, "w:background");
                Node body = firstDirect(root, "body");
                if (body == null) root.appendChild(background); else root.insertBefore(background, body);
            }
            setAttr(background, "color", spec.colorHex());
            setAttr(background, "themeColor", spec.themeColor());
            setAttr(background, "themeTint", spec.themeTint());
            setAttr(background, "themeShade", spec.themeShade());
        });
    }

    public ColumnLayout readColumns(byte[] bytes, String sectionLocator) throws IOException {
        Element section = locateDocumentPart(bytes, sectionLocator, "sectPr");
        Element cols = firstDirect(section, "cols");
        if (cols == null) return ColumnLayout.empty();
        ArrayList<ColumnSpec> definitions = new ArrayList<>();
        for (Element col : directChildren(cols, "col")) {
            definitions.add(new ColumnSpec(intAttr(col, "w"), intAttr(col, "space")));
        }
        return new ColumnLayout(intAttr(cols, "num"), intAttr(cols, "space"), onOffAttr(cols, "sep"), onOffAttr(cols, "equalWidth"), definitions);
    }

    public byte[] formatColumns(byte[] bytes, String sectionLocator, ColumnLayout spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element section = locate(document, sectionLocator, "sectPr");
            Element cols = ensureDirect(section, "cols", false);
            List<Element> existingDefinitions = directChildren(cols, "col");
            Boolean existingEqualWidth = onOffAttr(cols, "equalWidth");
            if (spec.count() != null
                    && spec.columns().isEmpty()
                    && !Boolean.TRUE.equals(spec.equalWidth())
                    && Boolean.FALSE.equals(existingEqualWidth)
                    && !existingDefinitions.isEmpty()
                    && spec.count() != existingDefinitions.size()) {
                throw new IllegalArgumentException("changing unequal column count requires explicit column definitions or equalWidth=true");
            }
            setIntAttr(cols, "num", spec.count());
            setIntAttr(cols, "space", spec.spacingTwips());
            setOnOffAttr(cols, "sep", spec.separator());
            setOnOffAttr(cols, "equalWidth", spec.equalWidth());
            if (Boolean.TRUE.equals(spec.equalWidth())) {
                removeDirectChildren(cols, "col");
            } else if (!spec.columns().isEmpty()) {
                removeDirectChildren(cols, "col");
                for (ColumnSpec definition : spec.columns()) {
                    Element col = document.createElementNS(WORD_NS, "w:col");
                    setIntAttr(col, "w", definition.widthTwips());
                    setIntAttr(col, "space", definition.spaceTwips());
                    cols.appendChild(col);
                }
            }
        });
    }

    public LineNumbering readLineNumbering(byte[] bytes, String sectionLocator) throws IOException {
        Element section = locateDocumentPart(bytes, sectionLocator, "sectPr");
        Element line = firstDirect(section, "lnNumType");
        if (line == null) return LineNumbering.empty();
        return new LineNumbering(intAttr(line, "countBy"), intAttr(line, "start"), intAttr(line, "distance"), attr(line, "restart"));
    }

    public byte[] formatLineNumbering(byte[] bytes, String sectionLocator, LineNumbering spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element section = locate(document, sectionLocator, "sectPr");
            Element line = ensureDirect(section, "lnNumType", false);
            setIntAttr(line, "countBy", spec.countBy());
            setIntAttr(line, "start", spec.start());
            setIntAttr(line, "distance", spec.distanceTwips());
            setAttr(line, "restart", spec.restart());
        });
    }

    public List<HeaderFooterSnapshot> readHeaderFooters(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        boolean evenOdd = readEvenAndOdd(parts);
        ArrayList<HeaderFooterSnapshot> out = new ArrayList<>();
        Map<String, EffectiveHeaderFooter> effective = new LinkedHashMap<>();
        for (SectionRef sectionRef : sectionRefs(document)) {
            Element section = sectionRef.section();
            boolean titlePage = firstDirect(section, "titlePg") != null;
            Map<String, Element> explicit = new LinkedHashMap<>();
            for (String kind : List.of("header", "footer")) {
                for (Element ref : directChildren(section, kind + "Reference")) {
                    explicit.put(kind + ":" + defaultVariant(attr(ref, "type")), ref);
                }
            }
            for (String kind : List.of("header", "footer")) {
                for (String variant : List.of("default", "first", "even")) {
                    String key = kind + ":" + variant;
                    Element ref = explicit.get(key);
                    EffectiveHeaderFooter selected = effective.get(key);
                    boolean inherited = ref == null && selected != null;
                    if (ref != null) {
                        String relationshipId = ref.getAttributeNS(OFFICE_REL_NS, "id");
                        String part = resolveWordTarget(relationshipTarget(rels, relationshipId));
                        selected = new EffectiveHeaderFooter(sectionRef.locator(), relationshipId, part);
                        effective.put(key, selected);
                    }
                    if (selected == null) continue;
                    String content = "";
                    if (!selected.partName().isBlank() && parts.containsKey(selected.partName())) {
                        content = allText(OoxmlPackageSupport.parseXml(parts.get(selected.partName())).getDocumentElement());
                    }
                    out.add(new HeaderFooterSnapshot(
                            sectionRef.locator(),
                            selected.sourceSectionLocator(),
                            kind,
                            variant,
                            selected.relationshipId(),
                            selected.partName(),
                            content,
                            titlePage,
                            evenOdd,
                            inherited));
                }
            }
        }
        return List.copyOf(out);
    }

    public byte[] upsertHeaderFooter(byte[] bytes, String sectionLocator, HeaderFooterSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = new LinkedHashMap<>(requireDocx(bytes));
        if (spec.variant().equals("even")) ensureEvenAndOdd(parts);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element section = locate(document, sectionLocator, "sectPr");
        Document rels = documentRelationships(parts);
        String refLocal = spec.kind() + "Reference";
        Element reference = directChildren(section, refLocal).stream()
                .filter(candidate -> spec.variant().equals(defaultVariant(attr(candidate, "type"))))
                .findFirst().orElse(null);

        String existingPart = "";
        if (reference != null) {
            existingPart = resolveWordTarget(relationshipTarget(rels, reference.getAttributeNS(OFFICE_REL_NS, "id")));
        } else {
            EffectiveHeaderFooter inherited = inheritedHeaderFooter(document, rels, section, spec.kind(), spec.variant());
            if (inherited != null) existingPart = inherited.partName();
        }

        boolean shared = !existingPart.isBlank() && referenceCountForPart(document, rels, existingPart) > 1;
        if (reference == null || shared) {
            String relationshipId = nextRelationshipId(rels);
            String partName = nextHeaderFooterPart(parts, spec.kind());
            Element rel = rels.createElementNS(REL_NS, "Relationship");
            rel.setAttribute("Id", relationshipId);
            rel.setAttribute("Type", OFFICE_REL_NS + "/" + spec.kind());
            rel.setAttribute("Target", partName.substring("word/".length()));
            rels.getDocumentElement().appendChild(rel);

            if (reference == null) {
                reference = document.createElementNS(WORD_NS, "w:" + refLocal);
                reference.setAttributeNS(WORD_NS, "w:type", spec.variant());
                insertSectionReference(section, reference);
            }
            reference.setAttributeNS(OFFICE_REL_NS, "r:id", relationshipId);
            ensureContentTypeOverride(parts, "/" + partName, headerFooterContentType(spec.kind()));
            if (!existingPart.isBlank() && parts.containsKey(existingPart)) {
                parts.put(partName, replaceFirstText(parts.get(existingPart), spec.kind(), spec.text()));
                cloneRelationshipPart(parts, existingPart, partName);
            } else {
                parts.put(partName, newHeaderFooterPart(spec.kind(), spec.text()));
            }
        } else {
            String relationshipId = reference.getAttributeNS(OFFICE_REL_NS, "id");
            String partName = resolveWordTarget(relationshipTarget(rels, relationshipId));
            if (partName.isBlank()) throw new IOException("header/footer relationship target missing: " + relationshipId);
            byte[] existing = parts.get(partName);
            if (existing == null) throw new IOException("header/footer part missing: " + partName);
            parts.put(partName, replaceFirstText(existing, spec.kind(), spec.text()));
        }
        if (spec.variant().equals("first")) ensureOnOffChild(section, "titlePg");
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    public PageNumbering readPageNumbering(byte[] bytes, String sectionLocator) throws IOException {
        Element section = locateDocumentPart(bytes, sectionLocator, "sectPr");
        Element page = firstDirect(section, "pgNumType");
        if (page == null) return PageNumbering.empty();
        return new PageNumbering(intAttr(page, "start"), attr(page, "fmt"), intAttr(page, "chapStyle"), attr(page, "chapSep"));
    }

    public byte[] formatPageNumbering(byte[] bytes, String sectionLocator, PageNumbering spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element section = locate(document, sectionLocator, "sectPr");
            Element page = ensureDirect(section, "pgNumType", false);
            setIntAttr(page, "start", spec.start());
            setAttr(page, "fmt", spec.format());
            setIntAttr(page, "chapStyle", spec.chapterStyle());
            setAttr(page, "chapSep", spec.chapterSeparator());
        });
    }

    public BreakSnapshot readBreak(byte[] bytes, String breakLocator) throws IOException {
        Element br = locateDocumentPart(bytes, breakLocator, "br");
        String type = attr(br, "type");
        return new BreakSnapshot(type.isBlank() ? "textWrapping" : type);
    }

    public byte[] insertBreak(byte[] bytes, String paragraphLocator, BreakSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element paragraph = locate(document, paragraphLocator, "p");
            Element run = document.createElementNS(WORD_NS, "w:r");
            Element br = document.createElementNS(WORD_NS, "w:br");
            br.setAttributeNS(WORD_NS, "w:type", spec.type());
            run.appendChild(br);
            paragraph.appendChild(run);
        });
    }

    public byte[] formatBreak(byte[] bytes, String breakLocator, BreakSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> locate(document, breakLocator, "br").setAttributeNS(WORD_NS, "w:type", spec.type()));
    }

    public SectionBreakSnapshot readSectionBreak(byte[] bytes, String sectionLocator) throws IOException {
        Element section = locateDocumentPart(bytes, sectionLocator, "sectPr");
        Element type = firstDirect(section, "type");
        return new SectionBreakSnapshot(type == null ? "nextPage" : defaultSectionBreak(attr(type, "val")));
    }

    public byte[] insertSectionBreak(byte[] bytes, String paragraphLocator, SectionBreakSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element paragraph = locate(document, paragraphLocator, "p");
            Element pPr = firstDirect(paragraph, "pPr");
            if (pPr == null) {
                pPr = document.createElementNS(WORD_NS, "w:pPr");
                paragraph.insertBefore(pPr, paragraph.getFirstChild());
            }
            if (firstDirect(pPr, "sectPr") != null) {
                throw new IllegalArgumentException("target paragraph already terminates a section");
            }
            Element inherited = finalBodySection(document);
            Element section = inherited == null
                    ? document.createElementNS(WORD_NS, "w:sectPr")
                    : (Element) inherited.cloneNode(true);
            setValChild(section, "type", spec.type());
            pPr.appendChild(section);
        });
    }

    public byte[] formatSectionBreak(byte[] bytes, String sectionLocator, SectionBreakSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> setValChild(locate(document, sectionLocator, "sectPr"), "type", spec.type()));
    }

    private static BorderEdge readBorder(Element edge) {
        if (edge == null) return null;
        return new BorderEdge(attr(edge, "val"), intAttr(edge, "sz"), intAttr(edge, "space"), attr(edge, "color"));
    }

    private static void applyBorder(Element borders, String local, BorderEdge edge) {
        if (edge == null) return;
        Element target = ensureDirect(borders, local, false);
        setAttr(target, "val", edge.style());
        setIntAttr(target, "sz", edge.sizeEighthPoints());
        setIntAttr(target, "space", edge.spacePoints());
        setAttr(target, "color", edge.colorHex());
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

    private static Element locateDocumentPart(byte[] bytes, String locator, String expected) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        return locate(OoxmlPackageSupport.parseXml(parts.get("word/document.xml")), locator, expected);
    }

    private static Element locate(Document document, String locator, String expectedLocal) {
        String normalized = clean(locator);
        if (normalized.isBlank() || normalized.contains("..") || normalized.startsWith("/") || normalized.contains("\\")) {
            throw new IllegalArgumentException("unsafe or empty DOCX locator");
        }
        String[] tokens = normalized.split("/");
        if (!tokens[0].equals("body")) throw new IllegalArgumentException("unsupported DOCX locator root: " + tokens[0]);
        NodeList bodies = document.getElementsByTagNameNS(WORD_NS, "body");
        if (bodies.getLength() != 1) throw new IllegalArgumentException("DOCX body locator ambiguous");
        Element current = (Element) bodies.item(0);
        for (int i = 1; i < tokens.length; i++) {
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

    private static Document documentRelationships(Map<String, byte[]> parts) throws IOException {
        byte[] relBytes = parts.get("word/_rels/document.xml.rels");
        if (relBytes == null) {
            String rels = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"" + REL_NS + "\"/>";
            return OoxmlPackageSupport.parseXml(rels.getBytes(StandardCharsets.UTF_8));
        }
        return OoxmlPackageSupport.parseXml(relBytes);
    }

    private static String relationshipTarget(Document rels, String id) {
        NodeList relationships = rels.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < relationships.getLength(); i++) {
            Element relationship = (Element) relationships.item(i);
            if (id.equals(relationship.getAttribute("Id"))) return relationship.getAttribute("Target");
        }
        return "";
    }

    private static String resolveWordTarget(String target) {
        String normalized = clean(target).replace('\\', '/');
        if (normalized.isBlank() || normalized.startsWith("/") || normalized.contains("..")) return "";
        return normalized.startsWith("word/") ? normalized : "word/" + normalized;
    }

    private static EffectiveHeaderFooter inheritedHeaderFooter(
            Document document,
            Document rels,
            Element targetSection,
            String kind,
            String variant) {
        EffectiveHeaderFooter effective = null;
        for (SectionRef sectionRef : sectionRefs(document)) {
            if (sectionRef.section() == targetSection) return effective;
            for (Element ref : directChildren(sectionRef.section(), kind + "Reference")) {
                if (!variant.equals(defaultVariant(attr(ref, "type")))) continue;
                String relationshipId = ref.getAttributeNS(OFFICE_REL_NS, "id");
                String partName = resolveWordTarget(relationshipTarget(rels, relationshipId));
                if (!partName.isBlank()) effective = new EffectiveHeaderFooter(sectionRef.locator(), relationshipId, partName);
            }
        }
        return effective;
    }

    private static int referenceCountForPart(Document document, Document rels, String partName) {
        int count = 0;
        for (SectionRef sectionRef : sectionRefs(document)) {
            for (String kind : List.of("header", "footer")) {
                for (Element ref : directChildren(sectionRef.section(), kind + "Reference")) {
                    String target = resolveWordTarget(relationshipTarget(rels, ref.getAttributeNS(OFFICE_REL_NS, "id")));
                    if (partName.equals(target)) count++;
                }
            }
        }
        return count;
    }

    private static void cloneRelationshipPart(Map<String, byte[]> parts, String sourcePart, String targetPart) {
        String sourceRels = relationshipPartName(sourcePart);
        String targetRels = relationshipPartName(targetPart);
        byte[] bytes = parts.get(sourceRels);
        if (bytes != null) parts.put(targetRels, bytes.clone());
    }

    private static String relationshipPartName(String partName) {
        int slash = partName.lastIndexOf('/');
        String directory = slash < 0 ? "" : partName.substring(0, slash + 1);
        String file = slash < 0 ? partName : partName.substring(slash + 1);
        return directory + "_rels/" + file + ".rels";
    }

    private static String nextRelationshipId(Document rels) {
        int max = 0;
        NodeList nodes = rels.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            String id = ((Element) nodes.item(i)).getAttribute("Id");
            if (!id.startsWith("rId")) continue;
            try {
                max = Math.max(max, Integer.parseInt(id.substring(3)));
            } catch (NumberFormatException ignored) {
                // Non-numeric relationship identifiers remain preserved and are ignored for allocation.
            }
        }
        return "rId" + (max + 1);
    }

    private static String nextHeaderFooterPart(Map<String, byte[]> parts, String kind) {
        int index = 1;
        while (parts.containsKey("word/" + kind + index + ".xml")) index++;
        return "word/" + kind + index + ".xml";
    }

    private static String headerFooterContentType(String kind) {
        return kind.equals("header")
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"
                : "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";
    }

    private static void ensureContentTypeOverride(Map<String, byte[]> parts, String partName, String contentType) throws IOException {
        Document contentTypes = OoxmlPackageSupport.parseXml(parts.get("[Content_Types].xml"));
        NodeList overrides = contentTypes.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override");
        for (int i = 0; i < overrides.getLength(); i++) {
            Element override = (Element) overrides.item(i);
            if (partName.equals(override.getAttribute("PartName"))) return;
        }
        Element override = contentTypes.createElementNS(CONTENT_TYPES_NS, "Override");
        override.setAttribute("PartName", partName);
        override.setAttribute("ContentType", contentType);
        contentTypes.getDocumentElement().appendChild(override);
        parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(contentTypes));
    }

    private static byte[] newHeaderFooterPart(String kind, String text) throws IOException {
        String root = kind.equals("header") ? "hdr" : "ftr";
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:" + root + " xmlns:w=\"" + WORD_NS + "\"><w:p><w:r><w:t/></w:r></w:p></w:" + root + ">";
        Document document = OoxmlPackageSupport.parseXml(xml.getBytes(StandardCharsets.UTF_8));
        Element t = (Element) document.getElementsByTagNameNS(WORD_NS, "t").item(0);
        setText(t, text);
        return OoxmlPackageSupport.serialize(document);
    }

    private static byte[] replaceFirstText(byte[] bytes, String kind, String text) throws IOException {
        Document document = OoxmlPackageSupport.parseXml(bytes);
        String expectedRoot = kind.equals("header") ? "hdr" : "ftr";
        if (!expectedRoot.equals(document.getDocumentElement().getLocalName())) {
            throw new IOException("unexpected header/footer root: " + document.getDocumentElement().getLocalName());
        }
        NodeList texts = document.getElementsByTagNameNS(WORD_NS, "t");
        Element t;
        if (texts.getLength() > 0) {
            t = (Element) texts.item(0);
        } else {
            Element p = document.createElementNS(WORD_NS, "w:p");
            Element r = document.createElementNS(WORD_NS, "w:r");
            t = document.createElementNS(WORD_NS, "w:t");
            r.appendChild(t);
            p.appendChild(r);
            document.getDocumentElement().appendChild(p);
        }
        setText(t, text);
        return OoxmlPackageSupport.serialize(document);
    }

    private static void setText(Element t, String text) {
        String value = Objects.requireNonNullElse(text, "");
        if (!value.isEmpty() && (Character.isWhitespace(value.charAt(0)) || Character.isWhitespace(value.charAt(value.length() - 1)))) {
            t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        } else {
            t.removeAttributeNS("http://www.w3.org/XML/1998/namespace", "space");
        }
        t.setTextContent(value);
    }

    private static void insertSectionReference(Element section, Element reference) {
        Node cursor = section.getFirstChild();
        while (cursor instanceof Element element
                && WORD_NS.equals(element.getNamespaceURI())
                && List.of("headerReference", "footerReference").contains(element.getLocalName())) {
            cursor = cursor.getNextSibling();
        }
        if (cursor == null) section.appendChild(reference); else section.insertBefore(reference, cursor);
    }

    private static void ensureOnOffChild(Element parent, String local) {
        Element child = ensureDirect(parent, local, false);
        child.setAttributeNS(WORD_NS, "w:val", "1");
    }

    private static boolean readEvenAndOdd(Map<String, byte[]> parts) throws IOException {
        byte[] settings = parts.get("word/settings.xml");
        if (settings == null) return false;
        Document document = OoxmlPackageSupport.parseXml(settings);
        Element value = firstDirect(document.getDocumentElement(), "evenAndOddHeaders");
        return value != null && onOffValue(attr(value, "val"));
    }

    private static void ensureEvenAndOdd(Map<String, byte[]> parts) throws IOException {
        ensureSettingsPart(parts);
        Document settings = OoxmlPackageSupport.parseXml(parts.get("word/settings.xml"));
        ensureOnOffChild(settings.getDocumentElement(), "evenAndOddHeaders");
        parts.put("word/settings.xml", OoxmlPackageSupport.serialize(settings));
    }

    private static void ensureSettingsPart(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/settings.xml")) {
            String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:settings xmlns:w=\"" + WORD_NS + "\"/>";
            parts.put("word/settings.xml", xml.getBytes(StandardCharsets.UTF_8));
        }
        ensureContentTypeOverride(parts, "/word/settings.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml");
        Document rels = documentRelationships(parts);
        if (!hasRelationshipType(rels, OFFICE_REL_NS + "/settings")) {
            Element rel = rels.createElementNS(REL_NS, "Relationship");
            rel.setAttribute("Id", nextRelationshipId(rels));
            rel.setAttribute("Type", OFFICE_REL_NS + "/settings");
            rel.setAttribute("Target", "settings.xml");
            rels.getDocumentElement().appendChild(rel);
            parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        }
    }

    private static boolean hasRelationshipType(Document rels, String type) {
        NodeList nodes = rels.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            if (type.equals(((Element) nodes.item(i)).getAttribute("Type"))) return true;
        }
        return false;
    }

    private static List<SectionRef> sectionRefs(Document document) {
        Element body = first(document.getElementsByTagNameNS(WORD_NS, "body"));
        if (body == null) return List.of();
        ArrayList<SectionRef> out = new ArrayList<>();
        int paragraphIndex = 0;
        int finalSectionIndex = 0;
        for (Element child : childElements(body)) {
            if ("p".equals(child.getLocalName())) {
                paragraphIndex++;
                Element pPr = firstDirect(child, "pPr");
                Element section = firstDirect(pPr, "sectPr");
                if (section != null) out.add(new SectionRef("body/p:" + paragraphIndex + "/pPr:1/sectPr:1", section));
            } else if ("sectPr".equals(child.getLocalName())) {
                finalSectionIndex++;
                out.add(new SectionRef("body/sectPr:" + finalSectionIndex, child));
            }
        }
        return List.copyOf(out);
    }

    private static Element finalBodySection(Document document) {
        Element body = first(document.getElementsByTagNameNS(WORD_NS, "body"));
        if (body == null) return null;
        Element result = null;
        for (Element child : childElements(body)) if ("sectPr".equals(child.getLocalName())) result = child;
        return result;
    }

    private static String allText(Element root) {
        NodeList texts = root.getElementsByTagNameNS(WORD_NS, "t");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < texts.getLength(); i++) out.append(texts.item(i).getTextContent());
        return out.toString();
    }

    private static void setValChild(Element parent, String local, String value) {
        Element child = ensureDirect(parent, local, false);
        child.setAttributeNS(WORD_NS, "w:val", value);
    }

    private static Element ensureDirect(Element parent, String local, boolean first) {
        Element existing = firstDirect(parent, local);
        if (existing != null) return existing;
        Element created = parent.getOwnerDocument().createElementNS(WORD_NS, "w:" + local);
        if (first && parent.getFirstChild() != null) parent.insertBefore(created, parent.getFirstChild()); else parent.appendChild(created);
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
        if (parent == null) return out;
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && WORD_NS.equals(element.getNamespaceURI()) && local.equals(element.getLocalName())) out.add(element);
        }
        return out;
    }

    private static List<Element> childElements(Element parent) {
        ArrayList<Element> out = new ArrayList<>();
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) if (child instanceof Element element) out.add(element);
        return out;
    }

    private static Element first(NodeList nodes) {
        return nodes == null || nodes.getLength() == 0 ? null : (Element) nodes.item(0);
    }

    private static void removeDirectChildren(Element parent, String local) {
        for (Element child : new ArrayList<>(directChildren(parent, local))) parent.removeChild(child);
    }

    private static void insertAfter(Node current, Node added) {
        Node parent = current.getParentNode();
        Node next = current.getNextSibling();
        if (next == null) parent.appendChild(added); else parent.insertBefore(added, next);
    }

    private static void setAttr(Element element, String local, String value) {
        if (value != null && !value.isBlank()) element.setAttributeNS(WORD_NS, "w:" + local, value);
    }

    private static void setIntAttr(Element element, String local, Integer value) {
        if (value != null) element.setAttributeNS(WORD_NS, "w:" + local, Integer.toString(value));
    }

    private static void setOnOffAttr(Element element, String local, Boolean value) {
        if (value != null) element.setAttributeNS(WORD_NS, "w:" + local, value ? "1" : "0");
    }

    private static String attr(Element element, String local) {
        return element == null ? "" : clean(element.getAttributeNS(WORD_NS, local));
    }

    private static Integer intAttr(Element element, String local) {
        String value = attr(element, local);
        if (value.isBlank()) return null;
        try {
            return Integer.valueOf(value);
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("invalid integer WordprocessingML value: " + value, exception);
        }
    }

    private static Boolean onOffAttr(Element element, String local) {
        if (element == null || !element.hasAttributeNS(WORD_NS, local)) return null;
        return onOffValue(attr(element, local));
    }

    private static boolean onOffValue(String value) {
        String normalized = clean(value).toLowerCase(Locale.ROOT);
        return normalized.isBlank() || normalized.equals("1") || normalized.equals("true") || normalized.equals("on");
    }

    private static String defaultVariant(String value) {
        String normalized = clean(value).toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "default" : normalized;
    }

    private static String defaultSectionBreak(String value) {
        return clean(value).isBlank() ? "nextPage" : clean(value);
    }

    private static String normalizeColor(String value) {
        String color = clean(value).toUpperCase(Locale.ROOT);
        if (!color.isBlank() && !color.equals("AUTO") && !color.matches("[0-9A-F]{6}")) {
            throw new IllegalArgumentException("color must be RRGGBB or auto");
        }
        return color;
    }

    private static String normalizeByteHex(String value, String name) {
        String normalized = clean(value).toUpperCase(Locale.ROOT);
        if (!normalized.isBlank() && !normalized.matches("[0-9A-F]{2}")) throw new IllegalArgumentException(name + " must be two hex digits");
        return normalized;
    }

    private static String clean(String value) {
        return Objects.requireNonNullElse(value, "").strip();
    }

    private record SectionRef(String locator, Element section) {}

    private record EffectiveHeaderFooter(String sourceSectionLocator, String relationshipId, String partName) {}

    @FunctionalInterface
    private interface XmlMutation {
        void apply(Document document) throws IOException;
    }
}
