package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/** Typed DOCX T06 chart-workbook, SmartArt, equation, reference, field and notes authority. */
public final class DocxAdvancedSemanticMasteryEngine {
    private static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CT = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
    private static final String A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
    private static final String DGM = "http://schemas.openxmlformats.org/drawingml/2006/diagram";
    private static final String WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
    private static final String X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static final String CHART_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
    private static final String PACKAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/package";
    private static final String HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
    private static final String FOOTNOTES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
    private static final String ENDNOTES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
    private static final String DIAGRAM_DATA_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData";
    private static final String DIAGRAM_LAYOUT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout";
    private static final String DIAGRAM_STYLE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle";
    private static final String DIAGRAM_COLORS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors";

    public record WorkbookSpec(String sheetName, List<String> categories, List<Double> values) {
        public WorkbookSpec {
            sheetName = clean(sheetName).isBlank() ? "Data" : clean(sheetName);
            categories = List.copyOf(Objects.requireNonNullElse(categories, List.of()));
            values = List.copyOf(Objects.requireNonNullElse(values, List.of()));
            if (categories.isEmpty() || categories.size() != values.size()) {
                throw new IllegalArgumentException("workbook categories/values must align");
            }
            for (Double value : values) Objects.requireNonNull(value, "workbook value");
        }
    }

    public record ChartWorkbookSnapshot(String locator, String chartPart, String workbookPart, String relationshipId, WorkbookSpec workbook, String workbookSha256) {}

    public record ChartDecorations(String title, String categoryAxisTitle, String valueAxisTitle, String legendPosition, boolean showLegend, boolean showDataLabels) {
        public ChartDecorations {
            title = clean(title);
            categoryAxisTitle = clean(categoryAxisTitle);
            valueAxisTitle = clean(valueAxisTitle);
            legendPosition = clean(legendPosition).toLowerCase(Locale.ROOT);
            if (!legendPosition.isBlank() && !List.of("r", "l", "t", "b", "tr").contains(legendPosition)) {
                throw new IllegalArgumentException("unsupported legend position");
            }
        }
    }

    public record SmartArtNode(String id, String text) {
        public SmartArtNode {
            id = clean(id);
            text = clean(text);
            if (id.isBlank()) throw new IllegalArgumentException("SmartArt node id required");
        }
    }

    public record SmartArtSpec(String title, List<SmartArtNode> nodes) {
        public SmartArtSpec {
            title = clean(title);
            nodes = List.copyOf(Objects.requireNonNullElse(nodes, List.of()));
            if (nodes.isEmpty()) throw new IllegalArgumentException("SmartArt requires nodes");
        }
    }

    public record SmartArtSnapshot(String locator, String dataPart, String layoutPart, String stylePart, String colorsPart, SmartArtSpec spec) {}
    public record EquationSpec(String linearText) { public EquationSpec { linearText = clean(linearText); if (linearText.isBlank()) throw new IllegalArgumentException("equation text required"); } }
    public record EquationSnapshot(String locator, String linearText) {}
    public record HyperlinkSpec(String text, String target, String tooltip) { public HyperlinkSpec { text = clean(text); target = clean(target); tooltip = clean(tooltip); if (text.isBlank() || target.isBlank()) throw new IllegalArgumentException("hyperlink text/target required"); validateHyperlinkTarget(target); } }
    public record HyperlinkSnapshot(String locator, String text, String target, String relationshipId, String tooltip) {}
    public record BookmarkSnapshot(String locator, String id, String name) {}
    public record FieldSpec(String instruction, String result) { public FieldSpec { instruction = clean(instruction); result = Objects.requireNonNullElse(result, ""); if (instruction.isBlank()) throw new IllegalArgumentException("field instruction required"); validateSafeFieldInstruction(instruction); } }
    public record FieldSnapshot(String locator, String instruction, String result, boolean complex) {}
    public record CrossReferenceSpec(String bookmarkName, String displayText, boolean hyperlink) { public CrossReferenceSpec { bookmarkName = clean(bookmarkName); displayText = Objects.requireNonNullElse(displayText, ""); validateBookmarkName(bookmarkName); } }
    public record CrossReferenceSnapshot(String locator, String bookmarkName, String displayText, boolean hyperlink) {}
    public record CaptionSpec(String label, String text, String sequenceIdentifier) { public CaptionSpec { label = clean(label).isBlank() ? "Figure" : clean(label); text = clean(text); sequenceIdentifier = clean(sequenceIdentifier).isBlank() ? label : clean(sequenceIdentifier); } }
    public record CaptionSnapshot(String locator, String label, String text, String sequenceIdentifier) {}
    public record NoteSnapshot(String locator, int id, String text) {}

    public List<ChartWorkbookSnapshot> readChartWorkbooks(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document docRels = documentRelationships(parts);
        ArrayList<ChartWorkbookSnapshot> out = new ArrayList<>();
        for (Element paragraph : bodyParagraphs(document)) {
            int pIndex = paragraphIndex(document, paragraph);
            NodeList refs = paragraph.getElementsByTagNameNS(C, "chart");
            for (int i = 0; i < refs.getLength(); i++) {
                Element ref = (Element) refs.item(i);
                String chartRid = ref.getAttributeNS(R, "id");
                String chartPart = resolveTarget("word/document.xml", relationshipTarget(docRels, chartRid));
                String chartRelsPart = relsPart(chartPart);
                if (!parts.containsKey(chartPart) || !parts.containsKey(chartRelsPart)) continue;
                Document chart = OoxmlPackageSupport.parseXml(parts.get(chartPart));
                Element external = first(chart.getElementsByTagNameNS(C, "externalData"));
                if (external == null) continue;
                String rid = external.getAttributeNS(R, "id");
                Document chartRels = OoxmlPackageSupport.parseXml(parts.get(chartRelsPart));
                String workbookPart = resolveTarget(chartPart, relationshipTarget(chartRels, rid));
                byte[] workbookBytes = parts.get(workbookPart);
                if (workbookBytes == null) throw new IOException("chart workbook target missing: " + workbookPart);
                out.add(new ChartWorkbookSnapshot(
                        "body/p:" + pIndex + "/chart:" + (i + 1) + "/workbook:1",
                        chartPart, workbookPart, rid, parseWorkbook(workbookBytes), OoxmlPackageSupport.sha256(workbookBytes)));
            }
        }
        return List.copyOf(out);
    }

    public byte[] upsertChartWorkbook(byte[] bytes, String chartLocator, WorkbookSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        ChartOwner owner = exclusiveChartOwner(requireDocx(bytes), chartLocator);
        Map<String, byte[]> parts = owner.parts();
        Document chart = OoxmlPackageSupport.parseXml(parts.get(owner.chartPart()));
        String chartRelsPart = relsPart(owner.chartPart());
        Document chartRels = parts.containsKey(chartRelsPart) ? OoxmlPackageSupport.parseXml(parts.get(chartRelsPart)) : emptyRelationships();
        Element external = first(chart.getElementsByTagNameNS(C, "externalData"));
        String rid;
        String workbookPart;
        if (external == null) {
            workbookPart = nextPart(parts, "word/embeddings/Microsoft_Excel_Worksheet", "xlsx");
            rid = addRelationship(chartRels, PACKAGE_REL, relativeTarget(owner.chartPart(), workbookPart), false);
            Element chartRoot = first(chart.getElementsByTagNameNS(C, "chart"));
            if (chartRoot == null) throw new IOException("chart root missing");
            external = chart.createElementNS(C, "c:externalData");
            external.setAttributeNS(R, "r:id", rid);
            Element auto = chart.createElementNS(C, "c:autoUpdate");
            auto.setAttribute("val", "0");
            external.appendChild(auto);
            chart.getDocumentElement().appendChild(external);
        } else {
            rid = external.getAttributeNS(R, "id");
            workbookPart = resolveTarget(owner.chartPart(), relationshipTarget(chartRels, rid));
            if (workbookPart.isBlank()) throw new IOException("chart workbook relationship missing");
            if (countWorkbookUses(parts, workbookPart) > 1) {
                String detached = nextPart(parts, "word/embeddings/Microsoft_Excel_Worksheet", "xlsx");
                byte[] current = parts.get(workbookPart);
                if (current == null) throw new IOException("shared chart workbook missing: " + workbookPart);
                parts.put(detached, current.clone());
                setRelationshipTarget(chartRels, rid, relativeTarget(owner.chartPart(), detached));
                workbookPart = detached;
            }
        }
        parts.put(workbookPart, workbookBytes(spec));
        ensureDefaultContentType(parts, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        parts.put(owner.chartPart(), OoxmlPackageSupport.serialize(chart));
        parts.put(chartRelsPart, OoxmlPackageSupport.serialize(chartRels));
        owner.flushDocument(parts);
        return OoxmlPackageSupport.write(parts);
    }

    public ChartDecorations readChartDecorations(byte[] bytes, String chartLocator) throws IOException {
        ChartOwner owner = locateChartOwner(requireDocx(bytes), chartLocator, false);
        Document chart = OoxmlPackageSupport.parseXml(owner.parts().get(owner.chartPart()));
        Element chartElement = first(chart.getElementsByTagNameNS(C, "chart"));
        String title = directChartTitle(chartElement);
        String catTitle = "";
        String valTitle = "";
        Element catAx = first(chart.getElementsByTagNameNS(C, "catAx"));
        Element valAx = first(chart.getElementsByTagNameNS(C, "valAx"));
        if (catAx != null) catTitle = directChartTitle(catAx);
        if (valAx != null) valTitle = directChartTitle(valAx);
        Element legend = first(chart.getElementsByTagNameNS(C, "legend"));
        String pos = "";
        if (legend != null) {
            Element lp = first(legend.getElementsByTagNameNS(C, "legendPos"));
            if (lp != null) pos = lp.getAttribute("val");
        }
        boolean labels = chart.getElementsByTagNameNS(C, "dLbls").getLength() > 0;
        return new ChartDecorations(title, catTitle, valTitle, pos, legend != null, labels);
    }

    public byte[] formatChartDecorations(byte[] bytes, String chartLocator, ChartDecorations decorations) throws IOException {
        Objects.requireNonNull(decorations, "decorations");
        ChartOwner owner = exclusiveChartOwner(requireDocx(bytes), chartLocator);
        Map<String, byte[]> parts = owner.parts();
        Document chart = OoxmlPackageSupport.parseXml(parts.get(owner.chartPart()));
        Element chartElement = first(chart.getElementsByTagNameNS(C, "chart"));
        if (chartElement == null) throw new IOException("chart root missing");
        setChartTitle(chart, chartElement, decorations.title());
        Element catAx = ensureAxis(chart, chartElement, true);
        Element valAx = ensureAxis(chart, chartElement, false);
        setChartTitle(chart, catAx, decorations.categoryAxisTitle());
        setChartTitle(chart, valAx, decorations.valueAxisTitle());
        removeDirectChildren(chartElement, C, "legend");
        if (decorations.showLegend()) {
            Element legend = chart.createElementNS(C, "c:legend");
            Element pos = chart.createElementNS(C, "c:legendPos");
            pos.setAttribute("val", decorations.legendPosition().isBlank() ? "r" : decorations.legendPosition());
            legend.appendChild(pos);
            chartElement.appendChild(legend);
        }
        NodeList types = chart.getElementsByTagNameNS(C, "barChart");
        if (types.getLength() == 0) types = chart.getElementsByTagNameNS(C, "lineChart");
        if (types.getLength() == 0) types = chart.getElementsByTagNameNS(C, "pieChart");
        if (types.getLength() > 0) {
            Element type = (Element) types.item(0);
            removeDirectChildren(type, C, "dLbls");
            if (decorations.showDataLabels()) {
                Element labels = chart.createElementNS(C, "c:dLbls");
                Element showVal = chart.createElementNS(C, "c:showVal");
                showVal.setAttribute("val", "1");
                labels.appendChild(showVal);
                type.appendChild(labels);
            }
        }
        parts.put(owner.chartPart(), OoxmlPackageSupport.serialize(chart));
        owner.flushDocument(parts);
        return OoxmlPackageSupport.write(parts);
    }

    public List<SmartArtSnapshot> readSmartArt(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        ArrayList<SmartArtSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(document)) {
            int pIndex = paragraphIndex(document, p);
            NodeList relIds = p.getElementsByTagNameNS(DGM, "relIds");
            for (int i = 0; i < relIds.getLength(); i++) {
                Element relId = (Element) relIds.item(i);
                String dm = relId.getAttributeNS(R, "dm");
                String lo = relId.getAttributeNS(R, "lo");
                String qs = relId.getAttributeNS(R, "qs");
                String cs = relId.getAttributeNS(R, "cs");
                String dataPart = resolveTarget("word/document.xml", relationshipTarget(rels, dm));
                String layoutPart = resolveTarget("word/document.xml", relationshipTarget(rels, lo));
                String stylePart = resolveTarget("word/document.xml", relationshipTarget(rels, qs));
                String colorsPart = resolveTarget("word/document.xml", relationshipTarget(rels, cs));
                SmartArtSpec spec = parseSmartArt(required(parts, dataPart));
                out.add(new SmartArtSnapshot("body/p:" + pIndex + "/smartart:" + (i + 1), dataPart, layoutPart, stylePart, colorsPart, spec));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertSmartArt(byte[] bytes, String paragraphLocator, SmartArtSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        String data = nextPart(parts, "word/diagrams/data", "xml");
        String layout = nextPart(parts, "word/diagrams/layout", "xml");
        String style = nextPart(parts, "word/diagrams/quickStyle", "xml");
        String colors = nextPart(parts, "word/diagrams/colors", "xml");
        parts.put(data, smartArtData(spec));
        parts.put(layout, smartArtLayout(spec));
        parts.put(style, smartArtStyle(spec));
        parts.put(colors, smartArtColors(spec));
        String dm = addRelationship(rels, DIAGRAM_DATA_REL, relativeTarget("word/document.xml", data), false);
        String lo = addRelationship(rels, DIAGRAM_LAYOUT_REL, relativeTarget("word/document.xml", layout), false);
        String qs = addRelationship(rels, DIAGRAM_STYLE_REL, relativeTarget("word/document.xml", style), false);
        String cs = addRelationship(rels, DIAGRAM_COLORS_REL, relativeTarget("word/document.xml", colors), false);
        locateParagraph(doc, paragraphLocator).appendChild(createSmartArtRun(doc, spec.title(), dm, lo, qs, cs));
        ensureOverrideContentType(parts, "/" + data, "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml");
        ensureOverrideContentType(parts, "/" + layout, "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml");
        ensureOverrideContentType(parts, "/" + style, "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml");
        ensureOverrideContentType(parts, "/" + colors, "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml");
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editSmartArt(byte[] bytes, String locator, SmartArtSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        Element relIds = locateSmartArt(doc, locator);
        String dm = relIds.getAttributeNS(R, "dm");
        String dataPart = resolveTarget("word/document.xml", relationshipTarget(rels, dm));
        if (countRelationshipUses(doc, DGM, "relIds", "dm", dm) > 1) {
            String newData = nextPart(parts, "word/diagrams/data", "xml");
            parts.put(newData, required(parts, dataPart).clone());
            String newDm = addRelationship(rels, DIAGRAM_DATA_REL, relativeTarget("word/document.xml", newData), false);
            relIds.setAttributeNS(R, "r:dm", newDm);
            dataPart = newData;
        }
        parts.put(dataPart, smartArtData(spec));
        Element drawing = ancestor(relIds, W, "drawing");
        if (drawing != null) {
            Element dp = first(drawing.getElementsByTagNameNS(WP, "docPr"));
            if (dp != null) dp.setAttribute("name", spec.title().isBlank() ? "SmartArt" : spec.title());
        }
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    public List<EquationSnapshot> readEquations(byte[] bytes) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        ArrayList<EquationSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(doc)) {
            int pIndex = paragraphIndex(doc, p);
            NodeList eq = p.getElementsByTagNameNS(M, "oMath");
            for (int i = 0; i < eq.getLength(); i++) out.add(new EquationSnapshot("body/p:" + pIndex + "/equation:" + (i + 1), textContent((Element) eq.item(i), M, "t")));
        }
        return List.copyOf(out);
    }

    public byte[] insertEquation(byte[] bytes, String paragraphLocator, EquationSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        locateParagraph(doc, paragraphLocator).appendChild(createEquation(doc, spec));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editEquation(byte[] bytes, String locator, EquationSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element old = locateWithinParagraph(doc, locator, "equation", M, "oMath");
        old.getParentNode().replaceChild(createEquation(doc, spec), old);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<HyperlinkSnapshot> readHyperlinks(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        ArrayList<HyperlinkSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(doc)) {
            int pIndex = paragraphIndex(doc, p);
            NodeList links = p.getElementsByTagNameNS(W, "hyperlink");
            for (int i = 0; i < links.getLength(); i++) {
                Element link = (Element) links.item(i);
                String rid = link.getAttributeNS(R, "id");
                String anchor = link.getAttributeNS(W, "anchor");
                String target = !anchor.isBlank() ? "#" + anchor : relationshipTarget(rels, rid);
                if (target.isBlank()) continue;
                out.add(new HyperlinkSnapshot("body/p:" + pIndex + "/hyperlink:" + (i + 1), textContent(link, W, "t"), target, rid, link.getAttributeNS(W, "tooltip")));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertHyperlink(byte[] bytes, String paragraphLocator, HyperlinkSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        if (isInternalHyperlinkTarget(spec.target())) requireBookmark(doc, spec.target().substring(1));
        String rid = isInternalHyperlinkTarget(spec.target()) ? "" : addRelationship(rels, HYPERLINK_REL, spec.target(), true);
        Element link = createHyperlink(doc, rid, spec);
        locateParagraph(doc, paragraphLocator).appendChild(link);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editHyperlink(byte[] bytes, String locator, HyperlinkSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        Element link = locateWithinParagraph(doc, locator, "hyperlink", W, "hyperlink");
        if (isInternalHyperlinkTarget(spec.target())) requireBookmark(doc, spec.target().substring(1));
        String rid = isInternalHyperlinkTarget(spec.target()) ? "" : addRelationship(rels, HYPERLINK_REL, spec.target(), true);
        Element replacement = createHyperlink(doc, rid, spec);
        link.getParentNode().replaceChild(replacement, link);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    public List<BookmarkSnapshot> readBookmarks(byte[] bytes) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        ArrayList<BookmarkSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(doc)) {
            int pIndex = paragraphIndex(doc, p);
            NodeList starts = p.getElementsByTagNameNS(W, "bookmarkStart");
            for (int i = 0; i < starts.getLength(); i++) {
                Element start = (Element) starts.item(i);
                out.add(new BookmarkSnapshot("body/p:" + pIndex + "/bookmark:" + (i + 1), start.getAttributeNS(W, "id"), start.getAttributeNS(W, "name")));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertBookmark(byte[] bytes, String paragraphLocator, String name) throws IOException {
        name = clean(name);
        validateBookmarkName(name);
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        if (bookmarkExists(doc, name)) throw new IllegalArgumentException("bookmark already exists: " + name);
        Element p = locateParagraph(doc, paragraphLocator);
        String id = Integer.toString(nextBookmarkId(doc));
        Element start = doc.createElementNS(W, "w:bookmarkStart");
        start.setAttributeNS(W, "w:id", id);
        start.setAttributeNS(W, "w:name", name);
        Element end = doc.createElementNS(W, "w:bookmarkEnd");
        end.setAttributeNS(W, "w:id", id);
        Node first = p.getFirstChild();
        if (first == null) p.appendChild(start); else p.insertBefore(start, first);
        p.appendChild(end);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editBookmark(byte[] bytes, String locator, String name) throws IOException {
        name = clean(name);
        validateBookmarkName(name);
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element start = locateWithinParagraph(doc, locator, "bookmark", W, "bookmarkStart");
        if (!name.equals(start.getAttributeNS(W, "name")) && bookmarkExists(doc, name)) throw new IllegalArgumentException("bookmark already exists: " + name);
        start.setAttributeNS(W, "w:name", name);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<CrossReferenceSnapshot> readCrossReferences(byte[] bytes) throws IOException {
        ArrayList<CrossReferenceSnapshot> out = new ArrayList<>();
        for (FieldSnapshot field : readSimpleFields(bytes)) {
            if (field.instruction().toUpperCase(Locale.ROOT).startsWith("REF ")) {
                out.add(new CrossReferenceSnapshot(field.locator().replace("simple-field:", "cross-reference:"), refBookmark(field.instruction()), field.result(), field.instruction().contains("\\h")));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertCrossReference(byte[] bytes, String paragraphLocator, CrossReferenceSpec spec) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        requireBookmark(doc, spec.bookmarkName());
        return insertSimpleFieldInternal(bytes, paragraphLocator, new FieldSpec("REF " + spec.bookmarkName() + (spec.hyperlink() ? " \\h" : ""), spec.displayText()));
    }

    public byte[] editCrossReference(byte[] bytes, String locator, CrossReferenceSpec spec) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        requireBookmark(doc, spec.bookmarkName());
        String fieldLocator = locator.replace("cross-reference:", "simple-field:");
        return editSimpleField(bytes, fieldLocator, new FieldSpec("REF " + spec.bookmarkName() + (spec.hyperlink() ? " \\h" : ""), spec.displayText()));
    }

    public List<FieldSnapshot> readSimpleFields(byte[] bytes) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        ArrayList<FieldSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(doc)) {
            int pIndex = paragraphIndex(doc, p);
            NodeList fields = p.getElementsByTagNameNS(W, "fldSimple");
            for (int i = 0; i < fields.getLength(); i++) {
                Element field = (Element) fields.item(i);
                out.add(new FieldSnapshot("body/p:" + pIndex + "/simple-field:" + (i + 1), field.getAttributeNS(W, "instr").strip(), textContent(field, W, "t"), false));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertSimpleField(byte[] bytes, String paragraphLocator, FieldSpec spec) throws IOException {
        return insertSimpleFieldInternal(bytes, paragraphLocator, spec);
    }

    private byte[] insertSimpleFieldInternal(byte[] bytes, String paragraphLocator, FieldSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        locateParagraph(doc, paragraphLocator).appendChild(createSimpleField(doc, spec));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editSimpleField(byte[] bytes, String locator, FieldSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element old = locateWithinParagraph(doc, locator, "simple-field", W, "fldSimple");
        old.getParentNode().replaceChild(createSimpleField(doc, spec), old);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<FieldSnapshot> readComplexFields(byte[] bytes) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        ArrayList<FieldSnapshot> out = new ArrayList<>();
        for (Element p : bodyParagraphs(doc)) {
            int pIndex = paragraphIndex(doc, p);
            List<Element> runs = directChildren(p, W, "r");
            int ordinal = 0;
            for (int i = 0; i < runs.size(); i++) {
                if (!isFieldChar(runs.get(i), "begin")) continue;
                ordinal++;
                StringBuilder instruction = new StringBuilder();
                StringBuilder result = new StringBuilder();
                boolean separated = false;
                int end = -1;
                for (int j = i + 1; j < runs.size(); j++) {
                    Element r = runs.get(j);
                    if (isFieldChar(r, "separate")) { separated = true; continue; }
                    if (isFieldChar(r, "end")) { end = j; break; }
                    if (!separated) instruction.append(textContent(r, W, "instrText")); else result.append(textContent(r, W, "t"));
                }
                if (end < 0) throw new IOException("unclosed complex field");
                out.add(new FieldSnapshot("body/p:" + pIndex + "/complex-field:" + ordinal, instruction.toString().strip(), result.toString(), true));
                i = end;
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertComplexField(byte[] bytes, String paragraphLocator, FieldSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element p = locateParagraph(doc, paragraphLocator);
        for (Element run : createComplexFieldRuns(doc, spec)) p.appendChild(run);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editComplexField(byte[] bytes, String locator, FieldSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        ComplexFieldRange range = locateComplexField(doc, locator);
        Node parent = range.runs().get(0).getParentNode();
        Node before = range.runs().get(0);
        for (Element replacement : createComplexFieldRuns(doc, spec)) parent.insertBefore(replacement, before);
        for (Element old : range.runs()) parent.removeChild(old);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<CaptionSnapshot> readCaptions(byte[] bytes) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(requireDocx(bytes).get("word/document.xml"));
        ArrayList<CaptionSnapshot> out = new ArrayList<>();
        int pIndex = 0;
        for (Element p : bodyParagraphs(doc)) {
            pIndex++;
            Element pPr = firstDirect(p, W, "pPr");
            Element style = firstDirect(pPr, W, "pStyle");
            if (style == null || !"Caption".equalsIgnoreCase(style.getAttributeNS(W, "val"))) continue;
            String text = textContent(p, W, "t").strip();
            String instruction = "";
            Element field = first(p.getElementsByTagNameNS(W, "fldSimple"));
            if (field != null) instruction = field.getAttributeNS(W, "instr").strip();
            String sequence = sequenceIdentifier(instruction);
            String label = text.contains(" ") ? text.substring(0, text.indexOf(' ')) : "Figure";
            out.add(new CaptionSnapshot("body/p:" + pIndex + "/caption:1", label, text, sequence));
        }
        return List.copyOf(out);
    }

    public byte[] insertCaption(byte[] bytes, String paragraphLocator, CaptionSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element anchor = locateParagraph(doc, paragraphLocator);
        Element caption = createCaption(doc, spec);
        Node next = anchor.getNextSibling();
        if (next == null) anchor.getParentNode().appendChild(caption); else anchor.getParentNode().insertBefore(caption, next);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] editCaption(byte[] bytes, String locator, CaptionSpec spec) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        String paragraphLocator = locator.substring(0, locator.indexOf("/caption:"));
        Element old = locateParagraph(doc, paragraphLocator);
        old.getParentNode().replaceChild(createCaption(doc, spec), old);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        return OoxmlPackageSupport.write(parts);
    }

    public List<NoteSnapshot> readFootnotes(byte[] bytes) throws IOException { return readNotes(bytes, true); }
    public List<NoteSnapshot> readEndnotes(byte[] bytes) throws IOException { return readNotes(bytes, false); }
    public byte[] insertFootnote(byte[] bytes, String paragraphLocator, String text) throws IOException { return insertNote(bytes, paragraphLocator, text, true); }
    public byte[] insertEndnote(byte[] bytes, String paragraphLocator, String text) throws IOException { return insertNote(bytes, paragraphLocator, text, false); }
    public byte[] editFootnote(byte[] bytes, String locator, String text) throws IOException { return editNote(bytes, locator, text, true); }
    public byte[] editEndnote(byte[] bytes, String locator, String text) throws IOException { return editNote(bytes, locator, text, false); }

    private List<NoteSnapshot> readNotes(byte[] bytes, boolean footnote) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        String part = footnote ? "word/footnotes.xml" : "word/endnotes.xml";
        if (!parts.containsKey(part)) return List.of();
        Document notes = OoxmlPackageSupport.parseXml(parts.get(part));
        String local = footnote ? "footnote" : "endnote";
        NodeList list = notes.getElementsByTagNameNS(W, local);
        ArrayList<NoteSnapshot> out = new ArrayList<>();
        for (int i = 0; i < list.getLength(); i++) {
            Element note = (Element) list.item(i);
            int id = intAttrNs(note, W, "id", Integer.MIN_VALUE);
            if (id <= 0) continue;
            out.add(new NoteSnapshot(local + ":" + id, id, textContent(note, W, "t")));
        }
        return List.copyOf(out);
    }

    private byte[] insertNote(byte[] bytes, String paragraphLocator, String text, boolean footnote) throws IOException {
        text = clean(text);
        if (text.isBlank()) throw new IllegalArgumentException("note text required");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document doc = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        String part = footnote ? "word/footnotes.xml" : "word/endnotes.xml";
        Document notes = parts.containsKey(part) ? OoxmlPackageSupport.parseXml(parts.get(part)) : createNotesDocument(footnote);
        int id = nextNoteId(notes, footnote);
        Element note = notes.createElementNS(W, footnote ? "w:footnote" : "w:endnote");
        note.setAttributeNS(W, "w:id", Integer.toString(id));
        note.appendChild(noteParagraph(notes, text, footnote));
        notes.getDocumentElement().appendChild(note);
        Element host = locateParagraph(doc, paragraphLocator);
        Element hostRun = doc.createElementNS(W, "w:r");
        Element ref = doc.createElementNS(W, footnote ? "w:footnoteReference" : "w:endnoteReference");
        ref.setAttributeNS(W, "w:id", Integer.toString(id));
        hostRun.appendChild(ref); host.appendChild(hostRun);
        if (!parts.containsKey(part)) {
            addRelationship(rels, footnote ? FOOTNOTES_REL : ENDNOTES_REL, footnote ? "footnotes.xml" : "endnotes.xml", false);
            ensureOverrideContentType(parts, "/" + part, footnote
                    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml");
        }
        parts.put(part, OoxmlPackageSupport.serialize(notes));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(doc));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    private byte[] editNote(byte[] bytes, String locator, String text, boolean footnote) throws IOException {
        text = clean(text);
        if (text.isBlank()) throw new IllegalArgumentException("note text required");
        String prefix = footnote ? "footnote:" : "endnote:";
        if (!locator.matches(prefix + "[1-9][0-9]*")) throw new IllegalArgumentException("unsafe note locator: " + locator);
        int id = Integer.parseInt(locator.substring(prefix.length()));
        Map<String, byte[]> parts = requireDocx(bytes);
        String part = footnote ? "word/footnotes.xml" : "word/endnotes.xml";
        Document notes = OoxmlPackageSupport.parseXml(required(parts, part));
        Element note = findNote(notes, footnote, id);
        if (note == null) throw new IllegalArgumentException("note not found: " + locator);
        removeAllChildren(note);
        note.appendChild(noteParagraph(notes, text, footnote));
        parts.put(part, OoxmlPackageSupport.serialize(notes));
        return OoxmlPackageSupport.write(parts);
    }

    private static byte[] workbookBytes(WorkbookSpec spec) throws IOException {
        LinkedHashMap<String, byte[]> parts = new LinkedHashMap<>();
        parts.put("[Content_Types].xml", ("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"" + CT + "\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>").getBytes(StandardCharsets.UTF_8));
        parts.put("_rels/.rels", ("<Relationships xmlns=\"" + REL + "\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>").getBytes(StandardCharsets.UTF_8));
        parts.put("xl/workbook.xml", ("<?xml version=\"1.0\" encoding=\"UTF-8\"?><workbook xmlns=\"" + X + "\" xmlns:r=\"" + R + "\"><sheets><sheet name=\"" + xml(spec.sheetName()) + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>").getBytes(StandardCharsets.UTF_8));
        parts.put("xl/_rels/workbook.xml.rels", ("<Relationships xmlns=\"" + REL + "\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>").getBytes(StandardCharsets.UTF_8));
        StringBuilder sheet = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"").append(X).append("\"><sheetData>");
        sheet.append("<row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>Category</t></is></c><c r=\"B1\" t=\"inlineStr\"><is><t>Value</t></is></c></row>");
        for (int i = 0; i < spec.categories().size(); i++) {
            int row = i + 2;
            sheet.append("<row r=\"").append(row).append("\"><c r=\"A").append(row).append("\" t=\"inlineStr\"><is><t>").append(xml(spec.categories().get(i))).append("</t></is></c><c r=\"B").append(row).append("\"><v>").append(spec.values().get(i)).append("</v></c></row>");
        }
        sheet.append("</sheetData></worksheet>");
        parts.put("xl/worksheets/sheet1.xml", sheet.toString().getBytes(StandardCharsets.UTF_8));
        return OoxmlPackageSupport.write(parts);
    }

    private static WorkbookSpec parseWorkbook(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        Document workbook = OoxmlPackageSupport.parseXml(required(parts, "xl/workbook.xml"));
        Element sheet = first(workbook.getElementsByTagNameNS(X, "sheet"));
        if (sheet == null) throw new IOException("chart workbook has no worksheet");
        String name = clean(sheet.getAttribute("name"));
        String sheetRid = sheet.getAttributeNS(R, "id");
        Document workbookRels = OoxmlPackageSupport.parseXml(required(parts, "xl/_rels/workbook.xml.rels"));
        String worksheetPart = resolveTarget("xl/workbook.xml", relationshipTarget(workbookRels, sheetRid));
        if (worksheetPart.isBlank()) throw new IOException("chart workbook worksheet relationship missing");
        Document data = OoxmlPackageSupport.parseXml(required(parts, worksheetPart));
        List<String> sharedStrings = parseSharedStrings(parts);
        NodeList rows = data.getElementsByTagNameNS(X, "row");
        if (rows.getLength() < 2) throw new IOException("chart workbook requires header and data rows");
        Map<Integer, String> headers = worksheetRowValues((Element) rows.item(0), sharedStrings);
        int categoryColumn = findHeaderColumn(headers, "category", 1);
        int valueColumn = findHeaderColumn(headers, "value", firstColumnAfter(headers, categoryColumn));
        ArrayList<String> categories = new ArrayList<>();
        ArrayList<Double> values = new ArrayList<>();
        for (int i = 1; i < rows.getLength(); i++) {
            Map<Integer, String> row = worksheetRowValues((Element) rows.item(i), sharedStrings);
            String category = clean(row.get(categoryColumn));
            String value = clean(row.get(valueColumn));
            if (category.isBlank() && value.isBlank()) continue;
            if (category.isBlank() || value.isBlank()) throw new IOException("chart workbook category/value row is incomplete");
            categories.add(category);
            try { values.add(Double.parseDouble(value)); } catch (NumberFormatException ex) { throw new IOException("invalid chart workbook numeric value", ex); }
        }
        if (categories.isEmpty()) throw new IOException("chart workbook has no data rows");
        return new WorkbookSpec(name.isBlank() ? "Data" : name, categories, values);
    }

    private static List<String> parseSharedStrings(Map<String, byte[]> parts) throws IOException {
        if (!parts.containsKey("xl/sharedStrings.xml")) return List.of();
        Document shared = OoxmlPackageSupport.parseXml(parts.get("xl/sharedStrings.xml"));
        ArrayList<String> values = new ArrayList<>();
        NodeList items = shared.getElementsByTagNameNS(X, "si");
        for (int i = 0; i < items.getLength(); i++) values.add(textContent((Element) items.item(i), X, "t"));
        return List.copyOf(values);
    }

    private static Map<Integer, String> worksheetRowValues(Element row, List<String> sharedStrings) throws IOException {
        LinkedHashMap<Integer, String> values = new LinkedHashMap<>();
        NodeList cells = row.getElementsByTagNameNS(X, "c");
        for (int i = 0; i < cells.getLength(); i++) {
            Element cell = (Element) cells.item(i);
            int column = spreadsheetColumn(cell.getAttribute("r"));
            if (column <= 0) column = i + 1;
            String type = cell.getAttribute("t");
            String value;
            if ("inlineStr".equals(type)) {
                value = textContent(cell, X, "t");
            } else {
                value = textContent(cell, X, "v");
                if ("s".equals(type) && !value.isBlank()) {
                    try {
                        int index = Integer.parseInt(value);
                        if (index < 0 || index >= sharedStrings.size()) throw new IOException("shared-string index out of range");
                        value = sharedStrings.get(index);
                    } catch (NumberFormatException ex) {
                        throw new IOException("invalid shared-string index", ex);
                    }
                }
            }
            values.put(column, value);
        }
        return Map.copyOf(values);
    }

    private static int spreadsheetColumn(String reference) {
        int value = 0;
        for (int i = 0; i < reference.length(); i++) {
            char c = Character.toUpperCase(reference.charAt(i));
            if (c < 'A' || c > 'Z') break;
            value = value * 26 + (c - 'A' + 1);
        }
        return value;
    }

    private static int findHeaderColumn(Map<Integer, String> headers, String expected, int fallback) {
        for (Map.Entry<Integer, String> entry : headers.entrySet()) if (expected.equalsIgnoreCase(clean(entry.getValue()))) return entry.getKey();
        return fallback;
    }

    private static int firstColumnAfter(Map<Integer, String> headers, int column) {
        return headers.keySet().stream().filter(c -> c > column).sorted().findFirst().orElse(column + 1);
    }

    private static SmartArtSpec parseSmartArt(byte[] bytes) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(bytes);
        String title = d.getDocumentElement().getAttribute("title");
        ArrayList<SmartArtNode> nodes = new ArrayList<>();
        NodeList pts = d.getElementsByTagNameNS(DGM, "pt");
        for (int i = 0; i < pts.getLength(); i++) {
            Element pt = (Element) pts.item(i);
            String id = pt.getAttribute("modelId");
            String text = textContent(pt, A, "t");
            if (!id.isBlank()) nodes.add(new SmartArtNode(id, text));
        }
        return new SmartArtSpec(title, nodes);
    }

    private static byte[] smartArtData(SmartArtSpec spec) throws IOException {
        Document d = newXml("dgm:dataModel", DGM, "dgm", Map.of("a", A));
        d.getDocumentElement().setAttribute("title", spec.title());
        Element ptLst = append(d, d.getDocumentElement(), DGM, "dgm:ptLst");
        for (SmartArtNode node : spec.nodes()) {
            Element pt = append(d, ptLst, DGM, "dgm:pt"); pt.setAttribute("modelId", node.id());
            Element txBody = append(d, pt, DGM, "dgm:t"); append(d, txBody, A, "a:bodyPr"); append(d, txBody, A, "a:lstStyle");
            Element p = append(d, txBody, A, "a:p"); Element r = append(d, p, A, "a:r"); appendText(d, r, A, "a:t", node.text());
        }
        append(d, d.getDocumentElement(), DGM, "dgm:cxnLst");
        return OoxmlPackageSupport.serialize(d);
    }

    private static byte[] smartArtLayout(SmartArtSpec spec) throws IOException {
        Document d = newXml("dgm:layoutDef", DGM, "dgm", Map.of("a", A));
        d.getDocumentElement().setAttribute("uniqueId", "urn:systemmaster:t06:layout");
        d.getDocumentElement().setAttribute("minVer", "12.0");
        Element title = append(d, d.getDocumentElement(), DGM, "dgm:title"); title.setAttribute("val", spec.title().isBlank() ? "System Master SmartArt" : spec.title());
        append(d, d.getDocumentElement(), DGM, "dgm:layoutNode").setAttribute("name", "root");
        return OoxmlPackageSupport.serialize(d);
    }

    private static byte[] smartArtStyle(SmartArtSpec spec) throws IOException {
        Document d = newXml("dgm:styleDef", DGM, "dgm", Map.of("a", A));
        d.getDocumentElement().setAttribute("uniqueId", "urn:systemmaster:t06:style");
        Element title = append(d, d.getDocumentElement(), DGM, "dgm:title"); title.setAttribute("val", spec.title().isBlank() ? "System Master SmartArt" : spec.title());
        append(d, d.getDocumentElement(), DGM, "dgm:scene3d");
        return OoxmlPackageSupport.serialize(d);
    }

    private static byte[] smartArtColors(SmartArtSpec spec) throws IOException {
        Document d = newXml("dgm:colorsDef", DGM, "dgm", Map.of("a", A));
        d.getDocumentElement().setAttribute("uniqueId", "urn:systemmaster:t06:colors");
        Element title = append(d, d.getDocumentElement(), DGM, "dgm:title"); title.setAttribute("val", spec.title().isBlank() ? "System Master SmartArt" : spec.title());
        append(d, d.getDocumentElement(), DGM, "dgm:catLst");
        return OoxmlPackageSupport.serialize(d);
    }

    private static Element createSmartArtRun(Document doc, String title, String dm, String lo, String qs, String cs) {
        Element run = doc.createElementNS(W, "w:r");
        Element drawing = doc.createElementNS(W, "w:drawing"); run.appendChild(drawing);
        Element inline = doc.createElementNS(WP, "wp:inline"); drawing.appendChild(inline);
        Element extent = doc.createElementNS(WP, "wp:extent"); extent.setAttribute("cx", "5000000"); extent.setAttribute("cy", "2500000"); inline.appendChild(extent);
        Element docPr = doc.createElementNS(WP, "wp:docPr"); docPr.setAttribute("id", "1"); docPr.setAttribute("name", title.isBlank() ? "SmartArt" : title); inline.appendChild(docPr);
        Element graphic = doc.createElementNS(A, "a:graphic"); inline.appendChild(graphic);
        Element data = doc.createElementNS(A, "a:graphicData"); data.setAttribute("uri", DGM); graphic.appendChild(data);
        Element relIds = doc.createElementNS(DGM, "dgm:relIds");
        relIds.setAttributeNS(R, "r:dm", dm); relIds.setAttributeNS(R, "r:lo", lo); relIds.setAttributeNS(R, "r:qs", qs); relIds.setAttributeNS(R, "r:cs", cs); data.appendChild(relIds);
        return run;
    }

    private static Element createEquation(Document doc, EquationSpec spec) {
        Element math = doc.createElementNS(M, "m:oMath");
        Element run = doc.createElementNS(M, "m:r");
        Element text = doc.createElementNS(M, "m:t"); text.setTextContent(spec.linearText());
        run.appendChild(text); math.appendChild(run); return math;
    }

    private static Element createHyperlink(Document doc, String rid, HyperlinkSpec spec) {
        Element link = doc.createElementNS(W, "w:hyperlink");
        if (isInternalHyperlinkTarget(spec.target())) link.setAttributeNS(W, "w:anchor", spec.target().substring(1)); else link.setAttributeNS(R, "r:id", rid);
        if (!spec.tooltip().isBlank()) link.setAttributeNS(W, "w:tooltip", spec.tooltip());
        Element run = doc.createElementNS(W, "w:r"); Element text = doc.createElementNS(W, "w:t"); text.setTextContent(spec.text()); run.appendChild(text); link.appendChild(run); return link;
    }

    private static Element createSimpleField(Document doc, FieldSpec spec) {
        Element field = doc.createElementNS(W, "w:fldSimple"); field.setAttributeNS(W, "w:instr", spec.instruction());
        Element run = doc.createElementNS(W, "w:r"); Element text = doc.createElementNS(W, "w:t"); text.setTextContent(spec.result()); run.appendChild(text); field.appendChild(run); return field;
    }

    private static List<Element> createComplexFieldRuns(Document doc, FieldSpec spec) {
        ArrayList<Element> out = new ArrayList<>();
        out.add(fieldCharRun(doc, "begin"));
        Element instructionRun = doc.createElementNS(W, "w:r"); Element instr = doc.createElementNS(W, "w:instrText"); instr.setAttribute("xml:space", "preserve"); instr.setTextContent(" " + spec.instruction() + " "); instructionRun.appendChild(instr); out.add(instructionRun);
        out.add(fieldCharRun(doc, "separate"));
        Element resultRun = doc.createElementNS(W, "w:r"); Element result = doc.createElementNS(W, "w:t"); result.setTextContent(spec.result()); resultRun.appendChild(result); out.add(resultRun);
        out.add(fieldCharRun(doc, "end"));
        return List.copyOf(out);
    }

    private static Element fieldCharRun(Document doc, String type) {
        Element run = doc.createElementNS(W, "w:r"); Element field = doc.createElementNS(W, "w:fldChar"); field.setAttributeNS(W, "w:fldCharType", type); run.appendChild(field); return run;
    }

    private static Element createCaption(Document doc, CaptionSpec spec) {
        Element p = doc.createElementNS(W, "w:p"); Element pPr = doc.createElementNS(W, "w:pPr"); Element style = doc.createElementNS(W, "w:pStyle"); style.setAttributeNS(W, "w:val", "Caption"); pPr.appendChild(style); p.appendChild(pPr);
        Element prefixRun = doc.createElementNS(W, "w:r"); Element prefix = doc.createElementNS(W, "w:t"); prefix.setTextContent(spec.label() + " "); prefixRun.appendChild(prefix); p.appendChild(prefixRun);
        p.appendChild(createSimpleField(doc, new FieldSpec("SEQ " + spec.sequenceIdentifier() + " \\* ARABIC", "1")));
        if (!spec.text().isBlank()) { Element run = doc.createElementNS(W, "w:r"); Element text = doc.createElementNS(W, "w:t"); text.setTextContent(" " + spec.text()); run.appendChild(text); p.appendChild(run); }
        return p;
    }

    private static Document createNotesDocument(boolean footnote) throws IOException {
        String rootName = footnote ? "w:footnotes" : "w:endnotes";
        String noteName = footnote ? "w:footnote" : "w:endnote";
        Document d = newXml(rootName, W, "w", Map.of());
        Element sep = d.createElementNS(W, noteName); sep.setAttributeNS(W, "w:id", "-1"); Element p1 = d.createElementNS(W, "w:p"); Element r1 = d.createElementNS(W, "w:r"); Element s = d.createElementNS(W, footnote ? "w:separator" : "w:separator"); r1.appendChild(s); p1.appendChild(r1); sep.appendChild(p1); d.getDocumentElement().appendChild(sep);
        Element cont = d.createElementNS(W, noteName); cont.setAttributeNS(W, "w:id", "0"); Element p2 = d.createElementNS(W, "w:p"); Element r2 = d.createElementNS(W, "w:r"); Element cs = d.createElementNS(W, footnote ? "w:continuationSeparator" : "w:continuationSeparator"); r2.appendChild(cs); p2.appendChild(r2); cont.appendChild(p2); d.getDocumentElement().appendChild(cont);
        return d;
    }

    private static Element findNote(Document notes, boolean footnote, int id) {
        NodeList list = notes.getElementsByTagNameNS(W, footnote ? "footnote" : "endnote");
        for (int i = 0; i < list.getLength(); i++) { Element e = (Element) list.item(i); if (Integer.toString(id).equals(e.getAttributeNS(W, "id"))) return e; }
        return null;
    }

    private static int nextNoteId(Document notes, boolean footnote) {
        int max = 0; NodeList list = notes.getElementsByTagNameNS(W, footnote ? "footnote" : "endnote");
        for (int i = 0; i < list.getLength(); i++) max = Math.max(max, intAttrNs((Element) list.item(i), W, "id", 0));
        return max + 1;
    }

    private static ComplexFieldRange locateComplexField(Document doc, String locator) {
        if (locator == null || !locator.matches("body/p:[1-9][0-9]*/complex-field:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe complex-field locator: " + locator);
        String[] p = locator.split("/"); Element paragraph = locateParagraph(doc, p[0] + "/" + p[1]); int wanted = Integer.parseInt(p[2].substring("complex-field:".length()));
        List<Element> runs = directChildren(paragraph, W, "r"); int ordinal = 0;
        for (int i = 0; i < runs.size(); i++) {
            if (!isFieldChar(runs.get(i), "begin")) continue;
            ordinal++; ArrayList<Element> range = new ArrayList<>(); range.add(runs.get(i));
            for (int j = i + 1; j < runs.size(); j++) { range.add(runs.get(j)); if (isFieldChar(runs.get(j), "end")) break; }
            if (ordinal == wanted) { if (!isFieldChar(range.get(range.size() - 1), "end")) throw new IllegalArgumentException("unclosed complex field"); return new ComplexFieldRange(List.copyOf(range)); }
        }
        throw new IllegalArgumentException("complex field locator out of range");
    }

    private static boolean isFieldChar(Element run, String type) {
        Element field = first(run.getElementsByTagNameNS(W, "fldChar")); return field != null && type.equals(field.getAttributeNS(W, "fldCharType"));
    }

    private static String refBookmark(String instruction) {
        String[] parts = instruction.strip().split("\\s+"); return parts.length >= 2 ? parts[1] : "";
    }

    private static String sequenceIdentifier(String instruction) {
        String[] parts = instruction.strip().split("\\s+"); return parts.length >= 2 && "SEQ".equalsIgnoreCase(parts[0]) ? parts[1] : "";
    }

    private static ChartOwner exclusiveChartOwner(Map<String, byte[]> parts, String locator) throws IOException {
        ChartOwner owner = locateChartOwner(parts, locator, true);
        if (countChartTargetUses(owner.document(), owner.documentRels(), owner.chartPart()) <= 1) return owner;
        String newPart = nextPart(parts, "word/charts/chart", "xml");
        parts.put(newPart, required(parts, owner.chartPart()).clone());
        String oldRels = relsPart(owner.chartPart());
        if (parts.containsKey(oldRels)) parts.put(relsPart(newPart), parts.get(oldRels).clone());
        ensureOverrideContentType(parts, "/" + newPart, "application/vnd.openxmlformats-officedocument.drawingml.chart+xml");
        String newRid = addRelationship(owner.documentRels(), CHART_REL, relativeTarget("word/document.xml", newPart), false);
        owner.chartRef().setAttributeNS(R, "r:id", newRid);
        return new ChartOwner(parts, owner.document(), owner.documentRels(), owner.chartRef(), newPart);
    }

    private static ChartOwner locateChartOwner(Map<String, byte[]> parts, String locator, boolean requirePart) throws IOException {
        Document doc = OoxmlPackageSupport.parseXml(required(parts, "word/document.xml")); Document rels = documentRelationships(parts);
        Element ref = locateWithinParagraph(doc, locator, "chart", C, "chart"); String rid = ref.getAttributeNS(R, "id"); String part = resolveTarget("word/document.xml", relationshipTarget(rels, rid));
        if (requirePart && !parts.containsKey(part)) throw new IOException("chart part missing: " + part);
        return new ChartOwner(parts, doc, rels, ref, part);
    }

    private record ChartOwner(Map<String, byte[]> parts, Document document, Document documentRels, Element chartRef, String chartPart) {
        private void flushDocument(Map<String, byte[]> target) throws IOException {
            target.put("word/document.xml", OoxmlPackageSupport.serialize(document));
            target.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(documentRels));
        }
    }

    private record ComplexFieldRange(List<Element> runs) {}

    private static int countWorkbookUses(Map<String, byte[]> parts, String workbookPart) throws IOException {
        int count = 0;
        for (String name : parts.keySet().stream().filter(n -> n.matches("word/charts/_rels/chart[0-9]+\\.xml\\.rels")).toList()) {
            Document rels = OoxmlPackageSupport.parseXml(parts.get(name));
            String chartPart = chartPartFromRels(name);
            NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
            for (int i = 0; i < list.getLength(); i++) {
                Element rel = (Element) list.item(i);
                if (PACKAGE_REL.equals(rel.getAttribute("Type")) && workbookPart.equals(resolveTarget(chartPart, rel.getAttribute("Target")))) count++;
            }
        }
        return count;
    }

    private static String chartPartFromRels(String rels) {
        int slash = rels.lastIndexOf("/_rels/"); String dir = rels.substring(0, slash + 1); String base = rels.substring(slash + "/_rels/".length());
        return dir + base.substring(0, base.length() - ".rels".length());
    }

    private static int countChartTargetUses(Document doc, Document rels, String target) {
        int count = 0; NodeList refs = doc.getElementsByTagNameNS(C, "chart");
        for (int i = 0; i < refs.getLength(); i++) { String rid = ((Element) refs.item(i)).getAttributeNS(R, "id"); if (target.equals(resolveTargetUnchecked("word/document.xml", relationshipTarget(rels, rid)))) count++; }
        return count;
    }

    private static int countRelationshipUses(Document doc, String ns, String local, String attributeLocal, String rid) {
        int count = 0; NodeList list = doc.getElementsByTagNameNS(ns, local);
        for (int i = 0; i < list.getLength(); i++) if (rid.equals(((Element) list.item(i)).getAttributeNS(R, attributeLocal))) count++;
        return count;
    }

    private static Element ensureAxis(Document chart, Element chartElement, boolean category) {
        String local = category ? "catAx" : "valAx"; Element existing = first(chart.getElementsByTagNameNS(C, local)); if (existing != null) return existing;
        Element plot = first(chartElement.getElementsByTagNameNS(C, "plotArea")); if (plot == null) { plot = chart.createElementNS(C, "c:plotArea"); chartElement.appendChild(plot); }
        Element axis = chart.createElementNS(C, "c:" + local); Element id = chart.createElementNS(C, "c:axId"); id.setAttribute("val", category ? "1001" : "1002"); axis.appendChild(id); plot.appendChild(axis); return axis;
    }

    private static void setChartTitle(Document d, Element parent, String text) {
        removeDirectChildren(parent, C, "title"); if (text.isBlank()) return;
        Element title = append(d, parent, C, "c:title"); Element tx = append(d, title, C, "c:tx"); Element rich = append(d, tx, C, "c:rich"); append(d, rich, A, "a:bodyPr"); append(d, rich, A, "a:lstStyle"); Element p = append(d, rich, A, "a:p"); Element r = append(d, p, A, "a:r"); appendText(d, r, A, "a:t", text);
    }

    private static String directChartTitle(Element parent) {
        if (parent == null) return ""; for (Element child : childElements(parent)) if (C.equals(child.getNamespaceURI()) && "title".equals(child.getLocalName())) return textContent(child, A, "t"); return "";
    }

    private static void removeDirectChildren(Element parent, String ns, String local) {
        for (Node node = parent.getFirstChild(); node != null; ) { Node next = node.getNextSibling(); if (node instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) parent.removeChild(node); node = next; }
    }

    private static Map<String, byte[]> requireDocx(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = new LinkedHashMap<>(OoxmlPackageSupport.read(bytes)); required(parts, "word/document.xml"); required(parts, "[Content_Types].xml"); return parts;
    }

    private static Document documentRelationships(Map<String, byte[]> parts) throws IOException {
        byte[] rels = parts.get("word/_rels/document.xml.rels"); return rels == null ? emptyRelationships() : OoxmlPackageSupport.parseXml(rels);
    }

    private static Document emptyRelationships() throws IOException { return newXml("Relationships", REL, "", Map.of()); }

    private static Document newXml(String rootName, String ns, String prefix, Map<String, String> namespaces) throws IOException {
        String q = prefix.isBlank() ? rootName : rootName; StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><").append(q).append(" xmlns"); if (!prefix.isBlank()) xml.append(":").append(prefix); xml.append("=\"").append(ns).append("\"");
        for (Map.Entry<String, String> entry : namespaces.entrySet()) xml.append(" xmlns:").append(entry.getKey()).append("=\"").append(entry.getValue()).append("\"");
        xml.append("/>"); return OoxmlPackageSupport.parseXml(xml.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static String addRelationship(Document rels, String type, String target, boolean external) {
        String id = nextRelationshipId(rels); Element rel = rels.createElementNS(REL, "Relationship"); rel.setAttribute("Id", id); rel.setAttribute("Type", type); rel.setAttribute("Target", target); if (external) rel.setAttribute("TargetMode", "External"); rels.getDocumentElement().appendChild(rel); return id;
    }

    private static void setRelationshipTarget(Document rels, String rid, String target) {
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship"); for (int i = 0; i < list.getLength(); i++) { Element rel = (Element) list.item(i); if (rid.equals(rel.getAttribute("Id"))) { rel.setAttribute("Target", target); return; } } throw new IllegalArgumentException("relationship not found: " + rid);
    }

    private static String relationshipTarget(Document rels, String rid) {
        NodeList list = rels.getElementsByTagNameNS(REL, "Relationship"); for (int i = 0; i < list.getLength(); i++) { Element rel = (Element) list.item(i); if (rid.equals(rel.getAttribute("Id"))) return rel.getAttribute("Target"); } return "";
    }

    private static String nextRelationshipId(Document rels) {
        int max = 0; NodeList list = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < list.getLength(); i++) { String id = ((Element) list.item(i)).getAttribute("Id"); if (id.startsWith("rId")) try { max = Math.max(max, Integer.parseInt(id.substring(3))); } catch (NumberFormatException ignored) { } }
        return "rId" + (max + 1);
    }

    private static String relsPart(String part) {
        int slash = part.lastIndexOf('/'); String dir = slash < 0 ? "" : part.substring(0, slash + 1); String base = slash < 0 ? part : part.substring(slash + 1); return dir + "_rels/" + base + ".rels";
    }

    private static String resolveTarget(String sourcePart, String target) throws IOException {
        if (target == null || target.isBlank()) return ""; if (target.startsWith("/")) return OoxmlPackageSupport.safeName(target.substring(1));
        String base = sourcePart.contains("/") ? sourcePart.substring(0, sourcePart.lastIndexOf('/') + 1) : "";
        ArrayDeque<String> stack = new ArrayDeque<>(); for (String segment : (base + target).replace('\\', '/').split("/")) { if (segment.isBlank() || ".".equals(segment)) continue; if ("..".equals(segment)) { if (stack.isEmpty()) throw new IOException("relationship target escapes package"); stack.removeLast(); } else stack.addLast(segment); }
        return OoxmlPackageSupport.safeName(String.join("/", stack));
    }

    private static String resolveTargetUnchecked(String sourcePart, String target) {
        try { return resolveTarget(sourcePart, target); } catch (IOException ex) { return ""; }
    }

    private static String relativeTarget(String sourcePart, String targetPart) {
        String[] source = sourcePart.substring(0, sourcePart.lastIndexOf('/') + 1).split("/"); String[] target = targetPart.split("/"); int common = 0; while (common < source.length && common < target.length && source[common].equals(target[common])) common++;
        StringBuilder out = new StringBuilder(); for (int i = common; i < source.length; i++) if (!source[i].isBlank()) out.append("../"); for (int i = common; i < target.length; i++) { if (i > common) out.append('/'); out.append(target[i]); } return out.toString();
    }

    private static String nextPart(Map<String, byte[]> parts, String prefix, String ext) { int i = 1; while (parts.containsKey(prefix + i + "." + ext)) i++; return prefix + i + "." + ext; }

    private static void ensureDefaultContentType(Map<String, byte[]> parts, String ext, String mime) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(parts, "[Content_Types].xml")); NodeList list = d.getElementsByTagNameNS(CT, "Default");
        for (int i = 0; i < list.getLength(); i++) if (ext.equalsIgnoreCase(((Element) list.item(i)).getAttribute("Extension"))) { parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d)); return; }
        Element e = d.createElementNS(CT, "Default"); e.setAttribute("Extension", ext); e.setAttribute("ContentType", mime); d.getDocumentElement().appendChild(e); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }

    private static void ensureOverrideContentType(Map<String, byte[]> parts, String part, String mime) throws IOException {
        Document d = OoxmlPackageSupport.parseXml(required(parts, "[Content_Types].xml")); NodeList list = d.getElementsByTagNameNS(CT, "Override");
        for (int i = 0; i < list.getLength(); i++) if (part.equals(((Element) list.item(i)).getAttribute("PartName"))) { ((Element) list.item(i)).setAttribute("ContentType", mime); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d)); return; }
        Element e = d.createElementNS(CT, "Override"); e.setAttribute("PartName", part); e.setAttribute("ContentType", mime); d.getDocumentElement().appendChild(e); parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(d));
    }

    private static Element locateParagraph(Document d, String locator) {
        if (locator == null || !locator.matches("body/p:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe paragraph locator: " + locator); int n = Integer.parseInt(locator.substring("body/p:".length())); List<Element> ps = bodyParagraphs(d); if (n > ps.size()) throw new IllegalArgumentException("paragraph locator out of range"); return ps.get(n - 1);
    }

    private static Element locateWithinParagraph(Document d, String locator, String kind, String ns, String local) {
        if (locator == null || !locator.matches("body/p:[1-9][0-9]*/" + kind + ":[1-9][0-9]*")) throw new IllegalArgumentException("unsafe " + kind + " locator: " + locator);
        String[] chunks = locator.split("/"); Element p = locateParagraph(d, chunks[0] + "/" + chunks[1]); int index = Integer.parseInt(chunks[2].substring((kind + ":").length())); NodeList list = p.getElementsByTagNameNS(ns, local); if (index > list.getLength()) throw new IllegalArgumentException(kind + " locator out of range"); return (Element) list.item(index - 1);
    }

    private static Element locateSmartArt(Document d, String locator) { return locateWithinParagraph(d, locator, "smartart", DGM, "relIds"); }

    private static List<Element> bodyParagraphs(Document d) {
        Element body = first(d.getElementsByTagNameNS(W, "body")); ArrayList<Element> out = new ArrayList<>(); if (body != null) for (Node node = body.getFirstChild(); node != null; node = node.getNextSibling()) if (node instanceof Element e && W.equals(e.getNamespaceURI()) && "p".equals(e.getLocalName())) out.add(e); return out;
    }

    private static int paragraphIndex(Document d, Element target) { List<Element> ps = bodyParagraphs(d); for (int i = 0; i < ps.size(); i++) if (ps.get(i) == target) return i + 1; return -1; }

    private static Element noteParagraph(Document notes, String text, boolean footnote) {
        Element paragraph = notes.createElementNS(W, "w:p");
        Element referenceRun = notes.createElementNS(W, "w:r");
        referenceRun.appendChild(notes.createElementNS(W, footnote ? "w:footnoteRef" : "w:endnoteRef"));
        paragraph.appendChild(referenceRun);
        Element textRun = notes.createElementNS(W, "w:r");
        Element value = notes.createElementNS(W, "w:t");
        value.setTextContent(text);
        textRun.appendChild(value);
        paragraph.appendChild(textRun);
        return paragraph;
    }

    private static void validateSafeFieldInstruction(String instruction) {
        String first = instruction.strip().split("\\s+", 2)[0].toUpperCase(Locale.ROOT);
        if (List.of("DDE", "DDEAUTO", "LINK", "INCLUDETEXT", "INCLUDEPICTURE", "MACROBUTTON").contains(first)) {
            throw new IllegalArgumentException("effectful Word field command is blocked: " + first);
        }
    }

    private static boolean isInternalHyperlinkTarget(String target) { return target.startsWith("#"); }

    private static void validateHyperlinkTarget(String target) {
        if (isInternalHyperlinkTarget(target)) { validateBookmarkName(target.substring(1)); return; }
        String lower = target.toLowerCase(Locale.ROOT);
        if (!(lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("mailto:"))) {
            throw new IllegalArgumentException("unsupported hyperlink scheme");
        }
    }

    private static void validateBookmarkName(String name) {
        if (name == null || !name.matches("[A-Za-z_][A-Za-z0-9_]{0,39}")) throw new IllegalArgumentException("invalid bookmark name");
    }

    private static boolean bookmarkExists(Document doc, String name) {
        NodeList list = doc.getElementsByTagNameNS(W, "bookmarkStart");
        for (int i = 0; i < list.getLength(); i++) if (name.equals(((Element) list.item(i)).getAttributeNS(W, "name"))) return true;
        return false;
    }

    private static void requireBookmark(Document doc, String name) {
        validateBookmarkName(name);
        if (!bookmarkExists(doc, name)) throw new IllegalArgumentException("bookmark not found: " + name);
    }
    private static int nextBookmarkId(Document d) { int max = 0; NodeList list = d.getElementsByTagNameNS(W, "bookmarkStart"); for (int i = 0; i < list.getLength(); i++) max = Math.max(max, intAttrNs((Element) list.item(i), W, "id", 0)); return max + 1; }
    private static int intAttrNs(Element e, String ns, String local, int fallback) { try { return Integer.parseInt(e.getAttributeNS(ns, local)); } catch (NumberFormatException ex) { return fallback; } }
    private static Element ancestor(Node node, String ns, String local) { for (Node p = node.getParentNode(); p != null; p = p.getParentNode()) if (p instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static Element firstDirect(Element parent, String ns, String local) { if (parent == null) return null; for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e; return null; }
    private static List<Element> directChildren(Element parent, String ns, String local) { ArrayList<Element> out = new ArrayList<>(); if (parent != null) for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e && ns.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) out.add(e); return List.copyOf(out); }
    private static List<Element> childElements(Element parent) { ArrayList<Element> out = new ArrayList<>(); for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) if (n instanceof Element e) out.add(e); return List.copyOf(out); }
    private static Element first(NodeList list) { return list == null || list.getLength() == 0 ? null : (Element) list.item(0); }
    private static void removeAllChildren(Element e) { while (e.getFirstChild() != null) e.removeChild(e.getFirstChild()); }
    private static String textContent(Element p, String ns, String local) { if (p == null) return ""; NodeList list = p.getElementsByTagNameNS(ns, local); StringBuilder out = new StringBuilder(); for (int i = 0; i < list.getLength(); i++) out.append(Objects.requireNonNullElse(list.item(i).getTextContent(), "")); return out.toString(); }
    private static Element append(Document d, Element parent, String ns, String qname) { Element e = d.createElementNS(ns, qname); parent.appendChild(e); return e; }
    private static Element appendText(Document d, Element parent, String ns, String qname, String value) { Element e = append(d, parent, ns, qname); e.setTextContent(value); return e; }
    private static byte[] required(Map<String, byte[]> parts, String name) throws IOException { byte[] value = parts.get(name); if (value == null) throw new IOException("missing OOXML part: " + name); return value; }
    private static String clean(String value) { return Objects.requireNonNullElse(value, "").strip(); }
    private static String xml(String s) { return Objects.requireNonNullElse(s, "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
}
