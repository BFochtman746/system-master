package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * DOCUMENT-DOCX-MASTERY-T03 semantic WordprocessingML engine.
 *
 * Owns paragraph mechanics that must not be represented as generic XML reachability: tabs,
 * indentation/spacing/pagination controls, paragraph borders/shading, and list/numbering semantics.
 */
public final class DocxParagraphMechanicsEngine {
    public static final String WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

    public record TabStop(Integer positionTwips, String alignment, String leader) {
        public TabStop {
            if (positionTwips == null || Math.abs((long) positionTwips) > 1_000_000L) {
                throw new IllegalArgumentException("tab positionTwips required and out of range");
            }
            alignment = clean(alignment).isBlank() ? "left" : clean(alignment);
            leader = clean(leader).isBlank() ? "none" : clean(leader);
            if (!List.of("left", "center", "right", "decimal", "bar", "num", "clear", "start", "end").contains(alignment)) {
                throw new IllegalArgumentException("unsupported tab alignment: " + alignment);
            }
            if (!List.of("none", "dot", "hyphen", "underscore", "heavy", "middleDot").contains(leader)) {
                throw new IllegalArgumentException("unsupported tab leader: " + leader);
            }
        }
    }

    public record Indentation(Integer leftTwips, Integer rightTwips, Integer firstLineTwips, Integer hangingTwips) {
        public Indentation {
            for (Integer value : new Integer[] { leftTwips, rightTwips, firstLineTwips, hangingTwips }) {
                if (value != null && Math.abs((long) value) > 1_000_000L) throw new IllegalArgumentException("indent out of range");
            }
            if (firstLineTwips != null && hangingTwips != null) {
                throw new IllegalArgumentException("firstLineTwips and hangingTwips are mutually exclusive");
            }
        }
    }

    public record LineSpacing(Integer lineTwips, String rule) {
        public LineSpacing {
            if (lineTwips != null && (lineTwips < 0 || lineTwips > 1_000_000)) throw new IllegalArgumentException("lineTwips out of range");
            rule = clean(rule);
            if (!rule.isBlank() && !List.of("auto", "atLeast", "exact").contains(rule)) {
                throw new IllegalArgumentException("unsupported line spacing rule: " + rule);
            }
        }
    }

    public record ParagraphSpacing(Integer beforeTwips, Integer afterTwips, Boolean beforeAuto, Boolean afterAuto, Boolean contextual) {
        public ParagraphSpacing {
            for (Integer value : new Integer[] { beforeTwips, afterTwips }) {
                if (value != null && (value < 0 || value > 1_000_000)) throw new IllegalArgumentException("paragraph spacing out of range");
            }
        }
    }

    public record PaginationControls(Boolean widowControl, Boolean keepNext, Boolean keepLines) {}

    public record BorderEdge(String style, Integer sizeEighthPoints, Integer spacePoints, String colorHex) {
        public BorderEdge {
            style = clean(style);
            colorHex = clean(colorHex).toUpperCase(Locale.ROOT);
            if (sizeEighthPoints != null && (sizeEighthPoints < 0 || sizeEighthPoints > 768)) throw new IllegalArgumentException("border size out of range");
            if (spacePoints != null && (spacePoints < 0 || spacePoints > 31)) throw new IllegalArgumentException("border space out of range");
            if (!colorHex.isBlank() && !colorHex.equals("AUTO") && !colorHex.matches("[0-9A-F]{6}")) throw new IllegalArgumentException("border color must be RRGGBB or auto");
        }
    }

    public record ParagraphBorders(BorderEdge top, BorderEdge right, BorderEdge bottom, BorderEdge left, BorderEdge between, BorderEdge bar) {}

    public record Shading(String pattern, String fillHex, String colorHex) {
        public Shading {
            pattern = clean(pattern);
            fillHex = color(fillHex, "fillHex");
            colorHex = color(colorHex, "colorHex");
        }
    }

    public record BorderShading(ParagraphBorders borders, Shading shading) {}

    public record NumberingReference(Integer numId, Integer level) {
        public NumberingReference {
            if (numId == null || numId < 0) throw new IllegalArgumentException("numId required and nonnegative");
            if (level == null || level < 0 || level > 8) throw new IllegalArgumentException("numbering level must be 0..8");
        }
    }

    public record NumberingLevel(
            int level,
            Integer start,
            String format,
            String text,
            String suffix,
            String justification,
            Integer leftTwips,
            Integer hangingTwips) {
        public NumberingLevel {
            if (level < 0 || level > 8) throw new IllegalArgumentException("numbering level must be 0..8");
            if (start != null && start < 0) throw new IllegalArgumentException("numbering start must be nonnegative");
            format = clean(format).isBlank() ? "decimal" : clean(format);
            text = Objects.requireNonNullElse(text, "");
            suffix = clean(suffix).isBlank() ? "tab" : clean(suffix);
            justification = clean(justification).isBlank() ? "left" : clean(justification);
            if (!List.of("tab", "space", "nothing").contains(suffix)) throw new IllegalArgumentException("unsupported numbering suffix: " + suffix);
            if (!List.of("left", "center", "right", "start", "end").contains(justification)) throw new IllegalArgumentException("unsupported numbering justification: " + justification);
            for (Integer value : new Integer[] { leftTwips, hangingTwips }) {
                if (value != null && Math.abs((long) value) > 1_000_000L) throw new IllegalArgumentException("numbering indent out of range");
            }
        }
    }

    public record NumberingDefinition(int abstractNumId, int numId, List<NumberingLevel> levels) {
        public NumberingDefinition {
            if (abstractNumId < 0 || numId < 0) throw new IllegalArgumentException("numbering ids must be nonnegative");
            levels = List.copyOf(Objects.requireNonNullElse(levels, List.of()));
            if (levels.isEmpty()) throw new IllegalArgumentException("at least one numbering level required");
            if (levels.stream().map(NumberingLevel::level).distinct().count() != levels.size()) throw new IllegalArgumentException("duplicate numbering level");
        }
    }

    public record NumberingSnapshot(NumberingReference reference, NumberingLevel resolvedLevel, String kind) {}

    public List<TabStop> readTabs(byte[] bytes, String paragraphLocator) throws IOException {
        Element pPr = paragraphProperties(requireDocx(bytes), paragraphLocator, false);
        Element tabs = firstDirect(pPr, "tabs");
        if (tabs == null) return List.of();
        ArrayList<TabStop> out = new ArrayList<>();
        for (Element tab : directChildren(tabs, "tab")) {
            out.add(new TabStop(intAttr(tab, "pos"), value(tab, "val"), value(tab, "leader")));
        }
        return List.copyOf(out);
    }

    public byte[] formatTabs(byte[] bytes, String paragraphLocator, List<TabStop> tabStops) throws IOException {
        List<TabStop> safe = List.copyOf(Objects.requireNonNullElse(tabStops, List.of()));
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            removeDirect(pPr, "tabs");
            if (safe.isEmpty()) return;
            Element tabs = document.createElementNS(WORD_NS, "w:tabs");
            for (TabStop spec : safe.stream().sorted(Comparator.comparingInt(TabStop::positionTwips)).toList()) {
                Element tab = document.createElementNS(WORD_NS, "w:tab");
                setAttr(tab, "val", spec.alignment());
                setAttr(tab, "pos", Integer.toString(spec.positionTwips()));
                if (!"none".equals(spec.leader())) setAttr(tab, "leader", spec.leader());
                tabs.appendChild(tab);
            }
            pPr.appendChild(tabs);
        });
    }

    public Indentation readIndentation(byte[] bytes, String paragraphLocator) throws IOException {
        Element ind = firstDirect(paragraphProperties(requireDocx(bytes), paragraphLocator, false), "ind");
        return new Indentation(intAttr(ind, "left"), intAttr(ind, "right"), intAttr(ind, "firstLine"), intAttr(ind, "hanging"));
    }

    public byte[] formatIndentation(byte[] bytes, String paragraphLocator, Indentation spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            Element ind = ensureDirect(pPr, "ind", false);
            setIntAttr(ind, "left", spec.leftTwips());
            setIntAttr(ind, "right", spec.rightTwips());
            if (spec.firstLineTwips() != null) { setIntAttr(ind, "firstLine", spec.firstLineTwips()); removeAttr(ind, "hanging"); }
            if (spec.hangingTwips() != null) { setIntAttr(ind, "hanging", spec.hangingTwips()); removeAttr(ind, "firstLine"); }
        });
    }

    public LineSpacing readLineSpacing(byte[] bytes, String paragraphLocator) throws IOException {
        Element spacing = firstDirect(paragraphProperties(requireDocx(bytes), paragraphLocator, false), "spacing");
        return new LineSpacing(intAttr(spacing, "line"), value(spacing, "lineRule"));
    }

    public byte[] formatLineSpacing(byte[] bytes, String paragraphLocator, LineSpacing spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element spacing = ensureDirect(paragraphProperties(document, paragraphLocator, true), "spacing", false);
            setIntAttr(spacing, "line", spec.lineTwips());
            if (!spec.rule().isBlank()) setAttr(spacing, "lineRule", spec.rule());
        });
    }

    public ParagraphSpacing readParagraphSpacing(byte[] bytes, String paragraphLocator) throws IOException {
        Element pPr = paragraphProperties(requireDocx(bytes), paragraphLocator, false);
        Element spacing = firstDirect(pPr, "spacing");
        return new ParagraphSpacing(intAttr(spacing, "before"), intAttr(spacing, "after"), boolAttr(spacing, "beforeAutospacing"), boolAttr(spacing, "afterAutospacing"), onOff(firstDirect(pPr, "contextualSpacing")));
    }

    public byte[] formatParagraphSpacing(byte[] bytes, String paragraphLocator, ParagraphSpacing spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            Element spacing = ensureDirect(pPr, "spacing", false);
            setIntAttr(spacing, "before", spec.beforeTwips());
            setIntAttr(spacing, "after", spec.afterTwips());
            setBoolAttr(spacing, "beforeAutospacing", spec.beforeAuto());
            setBoolAttr(spacing, "afterAutospacing", spec.afterAuto());
            setOnOff(pPr, "contextualSpacing", spec.contextual());
        });
    }

    public PaginationControls readPaginationControls(byte[] bytes, String paragraphLocator) throws IOException {
        Element pPr = paragraphProperties(requireDocx(bytes), paragraphLocator, false);
        return new PaginationControls(onOff(firstDirect(pPr, "widowControl")), onOff(firstDirect(pPr, "keepNext")), onOff(firstDirect(pPr, "keepLines")));
    }

    public byte[] formatPaginationControls(byte[] bytes, String paragraphLocator, PaginationControls spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            setOnOff(pPr, "widowControl", spec.widowControl());
            setOnOff(pPr, "keepNext", spec.keepNext());
            setOnOff(pPr, "keepLines", spec.keepLines());
        });
    }

    public BorderShading readBorderShading(byte[] bytes, String paragraphLocator) throws IOException {
        Element pPr = paragraphProperties(requireDocx(bytes), paragraphLocator, false);
        Element b = firstDirect(pPr, "pBdr");
        ParagraphBorders borders = new ParagraphBorders(readBorder(firstDirect(b, "top")), readBorder(firstDirect(b, "right")), readBorder(firstDirect(b, "bottom")), readBorder(firstDirect(b, "left")), readBorder(firstDirect(b, "between")), readBorder(firstDirect(b, "bar")));
        Element s = firstDirect(pPr, "shd");
        Shading shading = s == null ? null : new Shading(value(s, "val"), value(s, "fill"), value(s, "color"));
        return new BorderShading(borders, shading);
    }

    public byte[] formatBorderShading(byte[] bytes, String paragraphLocator, BorderShading spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            if (spec.borders() != null) {
                Element b = ensureDirect(pPr, "pBdr", false);
                applyBorder(b, "top", spec.borders().top());
                applyBorder(b, "right", spec.borders().right());
                applyBorder(b, "bottom", spec.borders().bottom());
                applyBorder(b, "left", spec.borders().left());
                applyBorder(b, "between", spec.borders().between());
                applyBorder(b, "bar", spec.borders().bar());
            }
            if (spec.shading() != null) {
                Element s = ensureDirect(pPr, "shd", false);
                if (!spec.shading().pattern().isBlank()) setAttr(s, "val", spec.shading().pattern());
                if (!spec.shading().fillHex().isBlank()) setAttr(s, "fill", spec.shading().fillHex());
                if (!spec.shading().colorHex().isBlank()) setAttr(s, "color", spec.shading().colorHex());
            }
        });
    }

    public byte[] upsertNumberingDefinition(byte[] bytes, NumberingDefinition spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = new LinkedHashMap<>(requireDocx(bytes));
        ensureNumberingPart(parts);
        Document numbering = OoxmlPackageSupport.parseXml(parts.get("word/numbering.xml"));
        Element root = numbering.getDocumentElement();
        Map<Integer, Integer> existingBindings = numberingBindings(root);
        boolean abstractSharedByOtherNum = existingBindings.entrySet().stream()
                .anyMatch(entry -> entry.getKey() != spec.numId() && entry.getValue() == spec.abstractNumId());
        int effectiveAbstractNumId = abstractSharedByOtherNum ? nextAbstractNumId(root) : spec.abstractNumId();
        if (!abstractSharedByOtherNum) removeById(root, "abstractNum", "abstractNumId", spec.abstractNumId());
        removeById(root, "num", "numId", spec.numId());

        Element abstractNum = numbering.createElementNS(WORD_NS, "w:abstractNum");
        setAttr(abstractNum, "abstractNumId", Integer.toString(effectiveAbstractNumId));
        Element nsid = numbering.createElementNS(WORD_NS, "w:nsid");
        setAttr(nsid, "val", String.format(Locale.ROOT, "%08X", spec.abstractNumId() + 1));
        abstractNum.appendChild(nsid);
        Element multi = numbering.createElementNS(WORD_NS, "w:multiLevelType");
        setAttr(multi, "val", spec.levels().size() > 1 ? "multilevel" : "singleLevel");
        abstractNum.appendChild(multi);
        for (NumberingLevel level : spec.levels().stream().sorted(Comparator.comparingInt(NumberingLevel::level)).toList()) {
            Element lvl = numbering.createElementNS(WORD_NS, "w:lvl");
            setAttr(lvl, "ilvl", Integer.toString(level.level()));
            setValChild(lvl, "start", Integer.toString(Objects.requireNonNullElse(level.start(), 1)));
            setValChild(lvl, "numFmt", level.format());
            setValChild(lvl, "lvlText", level.text().isBlank() ? defaultLevelText(level) : level.text());
            setValChild(lvl, "suff", level.suffix());
            setValChild(lvl, "lvlJc", level.justification());
            if (level.leftTwips() != null || level.hangingTwips() != null) {
                Element pPr = numbering.createElementNS(WORD_NS, "w:pPr");
                Element ind = numbering.createElementNS(WORD_NS, "w:ind");
                setIntAttr(ind, "left", level.leftTwips());
                setIntAttr(ind, "hanging", level.hangingTwips());
                pPr.appendChild(ind);
                lvl.appendChild(pPr);
            }
            abstractNum.appendChild(lvl);
        }
        insertBeforeFirst(root, abstractNum, "num");

        Element num = numbering.createElementNS(WORD_NS, "w:num");
        setAttr(num, "numId", Integer.toString(spec.numId()));
        setValChild(num, "abstractNumId", Integer.toString(effectiveAbstractNumId));
        root.appendChild(num);
        parts.put("word/numbering.xml", OoxmlPackageSupport.serialize(numbering));
        return OoxmlPackageSupport.write(parts);
    }

    public List<NumberingDefinition> readNumberingDefinitions(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        byte[] numberingBytes = parts.get("word/numbering.xml");
        if (numberingBytes == null) return List.of();
        Document doc = OoxmlPackageSupport.parseXml(numberingBytes);
        Map<Integer, Integer> nums = new LinkedHashMap<>();
        for (Element num : directChildren(doc.getDocumentElement(), "num")) {
            Integer numId = intAttr(num, "numId");
            Integer abstractId = intVal(firstDirect(num, "abstractNumId"));
            if (numId != null && abstractId != null) nums.put(numId, abstractId);
        }
        LinkedHashMap<Integer, List<NumberingLevel>> levels = new LinkedHashMap<>();
        for (Element abstractNum : directChildren(doc.getDocumentElement(), "abstractNum")) {
            Integer id = intAttr(abstractNum, "abstractNumId");
            if (id == null) continue;
            ArrayList<NumberingLevel> values = new ArrayList<>();
            for (Element lvl : directChildren(abstractNum, "lvl")) {
                Integer level = intAttr(lvl, "ilvl");
                if (level == null) continue;
                Element ind = firstDirect(firstDirect(lvl, "pPr"), "ind");
                values.add(new NumberingLevel(level, intVal(firstDirect(lvl, "start")), value(firstDirect(lvl, "numFmt"), "val"), value(firstDirect(lvl, "lvlText"), "val"), value(firstDirect(lvl, "suff"), "val"), value(firstDirect(lvl, "lvlJc"), "val"), intAttr(ind, "left"), intAttr(ind, "hanging")));
            }
            levels.put(id, List.copyOf(values));
        }
        ArrayList<NumberingDefinition> out = new ArrayList<>();
        for (Map.Entry<Integer, Integer> entry : nums.entrySet()) {
            List<NumberingLevel> values = levels.get(entry.getValue());
            if (values != null && !values.isEmpty()) out.add(new NumberingDefinition(entry.getValue(), entry.getKey(), values));
        }
        return List.copyOf(out);
    }

    public NumberingSnapshot readNumbering(byte[] bytes, String paragraphLocator) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Element pPr = paragraphProperties(parts, paragraphLocator, false);
        Element numPr = firstDirect(pPr, "numPr");
        Integer numId = intVal(firstDirect(numPr, "numId"));
        Integer level = intVal(firstDirect(numPr, "ilvl"));
        if (numId == null) return null;
        int safeLevel = Objects.requireNonNullElse(level, 0);
        NumberingDefinition definition = readNumberingDefinitions(bytes).stream().filter(d -> d.numId() == numId).findFirst().orElse(null);
        NumberingLevel resolved = definition == null ? null : definition.levels().stream().filter(l -> l.level() == safeLevel).findFirst().orElse(null);
        String kind = resolved == null ? "list" : ("bullet".equals(resolved.format()) ? "bullet" : (definition != null && definition.levels().size() > 1 ? "multilevel" : "numbered"));
        return new NumberingSnapshot(new NumberingReference(numId, safeLevel), resolved, kind);
    }

    public byte[] assignNumbering(byte[] bytes, String paragraphLocator, NumberingReference reference) throws IOException {
        Objects.requireNonNull(reference, "reference");
        if (readNumberingDefinitions(bytes).stream().noneMatch(d -> d.numId() == reference.numId())) {
            throw new IllegalArgumentException("numbering numId not defined: " + reference.numId());
        }
        return mutateDocument(bytes, document -> {
            Element pPr = paragraphProperties(document, paragraphLocator, true);
            Element numPr = ensureDirect(pPr, "numPr", false);
            setValChild(numPr, "ilvl", Integer.toString(reference.level()));
            setValChild(numPr, "numId", Integer.toString(reference.numId()));
        });
    }

    public byte[] clearNumbering(byte[] bytes, String paragraphLocator) throws IOException {
        return mutateDocument(bytes, document -> removeDirect(paragraphProperties(document, paragraphLocator, false), "numPr"));
    }

    private static BorderEdge readBorder(Element edge) {
        if (edge == null) return null;
        return new BorderEdge(value(edge, "val"), intAttr(edge, "sz"), intAttr(edge, "space"), value(edge, "color"));
    }

    private static void applyBorder(Element borders, String local, BorderEdge edge) {
        if (edge == null) return;
        Element target = ensureDirect(borders, local, false);
        if (!edge.style().isBlank()) setAttr(target, "val", edge.style());
        setIntAttr(target, "sz", edge.sizeEighthPoints());
        setIntAttr(target, "space", edge.spacePoints());
        if (!edge.colorHex().isBlank()) setAttr(target, "color", edge.colorHex());
    }

    private static String defaultLevelText(NumberingLevel level) {
        return "bullet".equals(level.format()) ? "•" : "%" + (level.level() + 1) + ".";
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
        if (!parts.containsKey("word/document.xml") || !parts.containsKey("[Content_Types].xml")) throw new IllegalArgumentException("not a valid DOCX/DOCM package");
        return parts;
    }

    private static Element paragraphProperties(Map<String, byte[]> parts, String locator, boolean create) throws IOException {
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        return paragraphProperties(document, locator, create);
    }

    private static Element paragraphProperties(Document document, String locator, boolean create) {
        Element paragraph = locate(document, locator, "p");
        Element pPr = firstDirect(paragraph, "pPr");
        if (pPr == null && create) pPr = ensureDirect(paragraph, "pPr", true);
        return pPr;
    }

    private static Element locate(Document document, String locator, String expectedLocal) {
        String normalized = Objects.requireNonNullElse(locator, "").strip();
        if (normalized.isBlank() || normalized.contains("..") || normalized.startsWith("/")) throw new IllegalArgumentException("unsafe or empty DOCX locator");
        String[] tokens = normalized.split("/");
        NodeList bodies = document.getElementsByTagNameNS(WORD_NS, "body");
        if (!"body".equals(tokens[0]) || bodies.getLength() != 1) throw new IllegalArgumentException("unsupported DOCX locator root: " + tokens[0]);
        Element current = (Element) bodies.item(0);
        for (int i = 1; i < tokens.length; i++) {
            String token = tokens[i];
            int colon = token.lastIndexOf(':');
            if (colon <= 0 || colon == token.length() - 1) throw new IllegalArgumentException("invalid DOCX locator token: " + token);
            String local = token.substring(0, colon);
            int index;
            try { index = Integer.parseInt(token.substring(colon + 1)); }
            catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid DOCX locator index: " + token, exception); }
            List<Element> children = directChildren(current, local);
            if (index < 1 || index > children.size()) throw new IllegalArgumentException("DOCX locator not found: " + locator);
            current = children.get(index - 1);
        }
        if (!expectedLocal.equals(current.getLocalName())) throw new IllegalArgumentException("DOCX locator expected " + expectedLocal + " but found " + current.getLocalName());
        return current;
    }

    private static void ensureNumberingPart(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("word/numbering.xml")) {
            String numbering = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:numbering xmlns:w=\"" + WORD_NS + "\"/>";
            parts.put("word/numbering.xml", numbering.getBytes(StandardCharsets.UTF_8));
        }
        Document contentTypes = OoxmlPackageSupport.parseXml(parts.get("[Content_Types].xml"));
        if (!hasOverride(contentTypes, "/word/numbering.xml")) {
            Element override = contentTypes.createElementNS(CONTENT_TYPES_NS, "Override");
            override.setAttribute("PartName", "/word/numbering.xml");
            override.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml");
            contentTypes.getDocumentElement().appendChild(override);
            parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(contentTypes));
        }
        byte[] relBytes = parts.get("word/_rels/document.xml.rels");
        if (relBytes == null) relBytes = ("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"" + REL_NS + "\"/>").getBytes(StandardCharsets.UTF_8);
        Document rels = OoxmlPackageSupport.parseXml(relBytes);
        if (!hasRelationshipType(rels, OFFICE_REL_NS + "/numbering")) {
            Element rel = rels.createElementNS(REL_NS, "Relationship");
            rel.setAttribute("Id", nextRelationshipId(rels));
            rel.setAttribute("Type", OFFICE_REL_NS + "/numbering");
            rel.setAttribute("Target", "numbering.xml");
            rels.getDocumentElement().appendChild(rel);
            parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        }
    }

    private static boolean hasOverride(Document doc, String partName) {
        NodeList nodes = doc.getElementsByTagNameNS(CONTENT_TYPES_NS, "Override");
        for (int i = 0; i < nodes.getLength(); i++) if (partName.equals(((Element) nodes.item(i)).getAttribute("PartName"))) return true;
        return false;
    }

    private static boolean hasRelationshipType(Document doc, String type) {
        NodeList nodes = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) if (type.equals(((Element) nodes.item(i)).getAttribute("Type"))) return true;
        return false;
    }

    private static String nextRelationshipId(Document doc) {
        int max = 0;
        NodeList nodes = doc.getElementsByTagNameNS(REL_NS, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            String id = ((Element) nodes.item(i)).getAttribute("Id");
            if (id.startsWith("rId")) {
                try { max = Math.max(max, Integer.parseInt(id.substring(3))); }
                catch (NumberFormatException ignored) { /* preserved */ }
            }
        }
        return "rId" + (max + 1);
    }

    private static Map<Integer, Integer> numberingBindings(Element root) {
        LinkedHashMap<Integer, Integer> out = new LinkedHashMap<>();
        for (Element num : directChildren(root, "num")) {
            Integer numId = intAttr(num, "numId");
            Integer abstractId = intVal(firstDirect(num, "abstractNumId"));
            if (numId != null && abstractId != null) out.put(numId, abstractId);
        }
        return Map.copyOf(out);
    }

    private static int nextAbstractNumId(Element root) {
        int max = -1;
        for (Element abstractNum : directChildren(root, "abstractNum")) {
            Integer id = intAttr(abstractNum, "abstractNumId");
            if (id != null) max = Math.max(max, id);
        }
        if (max == Integer.MAX_VALUE) throw new IllegalStateException("no abstract numbering id available");
        return max + 1;
    }

    private static void removeById(Element root, String local, String attribute, int id) {
        for (Element child : new ArrayList<>(directChildren(root, local))) {
            if (Integer.toString(id).equals(value(child, attribute))) root.removeChild(child);
        }
    }

    private static void insertBeforeFirst(Element root, Element newElement, String local) {
        Element first = firstDirect(root, local);
        if (first == null) root.appendChild(newElement); else root.insertBefore(newElement, first);
    }

    private static Element ensureDirect(Element parent, String local, boolean first) {
        if (parent == null) throw new IllegalArgumentException("paragraph properties missing");
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

    private static void removeDirect(Element parent, String local) {
        if (parent == null) return;
        Element child = firstDirect(parent, local);
        if (child != null) parent.removeChild(child);
    }

    private static void setValChild(Element parent, String local, String val) {
        Element child = ensureDirect(parent, local, false);
        setAttr(child, "val", val);
    }

    private static void setOnOff(Element parent, String local, Boolean val) {
        if (val == null) return;
        Element child = ensureDirect(parent, local, false);
        setAttr(child, "val", val ? "1" : "0");
    }

    private static void setBoolAttr(Element element, String local, Boolean val) {
        if (element != null && val != null) setAttr(element, local, val ? "1" : "0");
    }

    private static void setIntAttr(Element element, String local, Integer val) {
        if (element != null && val != null) setAttr(element, local, Integer.toString(val));
    }

    private static void setAttr(Element element, String local, String value) {
        element.setAttributeNS(WORD_NS, "w:" + local, value);
    }

    private static void removeAttr(Element element, String local) {
        if (element != null) element.removeAttributeNS(WORD_NS, local);
    }

    private static Integer intVal(Element element) { return intOrNull(value(element, "val")); }
    private static Integer intAttr(Element element, String local) { return intOrNull(value(element, local)); }
    private static Integer intOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Integer.valueOf(value); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid integer WordprocessingML value: " + value, exception); }
    }

    private static String value(Element element, String local) {
        return element == null ? "" : Objects.requireNonNullElse(element.getAttributeNS(WORD_NS, local), "");
    }

    private static Boolean boolAttr(Element element, String local) {
        if (element == null || !element.hasAttributeNS(WORD_NS, local)) return null;
        return truthy(value(element, local));
    }

    private static Boolean onOff(Element element) {
        if (element == null) return null;
        String value = value(element, "val");
        return value.isBlank() || truthy(value);
    }

    private static boolean truthy(String value) {
        String normalized = clean(value).toLowerCase(Locale.ROOT);
        return normalized.isBlank() || normalized.equals("1") || normalized.equals("true") || normalized.equals("on") || normalized.equals("yes");
    }

    private static String color(String value, String name) {
        String normalized = clean(value).toUpperCase(Locale.ROOT);
        if (!normalized.isBlank() && !normalized.equals("AUTO") && !normalized.matches("[0-9A-F]{6}")) throw new IllegalArgumentException(name + " must be RRGGBB or auto");
        return normalized;
    }

    private static String clean(String value) { return Objects.requireNonNullElse(value, "").strip(); }

    @FunctionalInterface
    private interface XmlMutation { void apply(Document document) throws IOException; }
}
