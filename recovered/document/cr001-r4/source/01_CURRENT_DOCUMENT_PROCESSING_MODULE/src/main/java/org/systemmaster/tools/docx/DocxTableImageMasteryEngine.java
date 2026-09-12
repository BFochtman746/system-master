package org.systemmaster.tools.docx;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * DOCUMENT-DOCX-MASTERY/T04 typed WordprocessingML table and image-placement authority.
 *
 * <p>The engine intentionally exposes semantic operations rather than arbitrary XML replacement. It
 * preserves unrelated OPC parts and uses copy-on-write when a scoped image replacement would otherwise
 * mutate media shared by another drawing.</p>
 */
public final class DocxTableImageMasteryEngine {
    public static final String W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static final String R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static final String REL = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static final String CT = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static final String WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
    private static final String A = "http://schemas.openxmlformats.org/drawingml/2006/main";
    private static final String PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
    private static final String IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

    public record Width(Integer value, String type) {
        public Width {
            type = clean(type).isBlank() ? "dxa" : clean(type);
            if (!List.of("dxa", "pct", "auto", "nil").contains(type)) {
                throw new IllegalArgumentException("unsupported width type: " + type);
            }
            if (value != null && value < 0) throw new IllegalArgumentException("width cannot be negative");
        }
        public static Width empty() { return new Width(null, "dxa"); }
    }

    public record RowHeight(Integer valueTwips, String rule) {
        public RowHeight {
            rule = clean(rule);
            if (valueTwips != null && valueTwips < 0) throw new IllegalArgumentException("row height cannot be negative");
            if (!rule.isBlank() && !List.of("auto", "atLeast", "exact").contains(rule)) {
                throw new IllegalArgumentException("unsupported row-height rule: " + rule);
            }
        }
        public static RowHeight empty() { return new RowHeight(null, ""); }
    }

    public record CellMargins(Integer topTwips, Integer rightTwips, Integer bottomTwips, Integer leftTwips) {
        public CellMargins {
            for (Integer value : new Integer[] { topTwips, rightTwips, bottomTwips, leftTwips }) {
                if (value != null && value < 0) throw new IllegalArgumentException("cell margin cannot be negative");
            }
        }
        public static CellMargins empty() { return new CellMargins(null, null, null, null); }
    }

    public record BorderEdge(String style, Integer sizeEighthPoints, Integer spacePoints, String colorHex) {
        public BorderEdge {
            style = clean(style);
            colorHex = clean(colorHex).toUpperCase(Locale.ROOT);
            if (sizeEighthPoints != null && sizeEighthPoints < 0) throw new IllegalArgumentException("border size cannot be negative");
            if (spacePoints != null && spacePoints < 0) throw new IllegalArgumentException("border space cannot be negative");
            if (!colorHex.isBlank() && !colorHex.equals("AUTO") && !colorHex.matches("[0-9A-F]{6}")) {
                throw new IllegalArgumentException("border color must be RRGGBB or auto");
            }
        }
    }

    public record TableBorders(BorderEdge top, BorderEdge right, BorderEdge bottom, BorderEdge left, BorderEdge insideH, BorderEdge insideV) {}

    public record Shading(String pattern, String fillHex, String colorHex) {
        public Shading {
            pattern = clean(pattern);
            fillHex = color(fillHex, "fillHex");
            colorHex = color(colorHex, "colorHex");
        }
        public static Shading empty() { return new Shading("", "", ""); }
    }

    public record TableFormat(Width width, CellMargins defaultCellMargins, TableBorders borders, Shading shading) {
        public TableFormat {
            width = Objects.requireNonNullElseGet(width, Width::empty);
            defaultCellMargins = Objects.requireNonNullElseGet(defaultCellMargins, CellMargins::empty);
            shading = Objects.requireNonNullElseGet(shading, Shading::empty);
        }
        public static TableFormat empty() { return new TableFormat(Width.empty(), CellMargins.empty(), null, Shading.empty()); }
    }

    public record CellSpec(String text, Integer gridSpan, String verticalMerge, String verticalAlignment, CellMargins margins) {
        public CellSpec {
            text = Objects.requireNonNullElse(text, "");
            if (gridSpan != null && gridSpan < 1) throw new IllegalArgumentException("gridSpan must be positive");
            verticalMerge = clean(verticalMerge);
            if (!verticalMerge.isBlank() && !List.of("restart", "continue").contains(verticalMerge)) {
                throw new IllegalArgumentException("verticalMerge must be restart or continue");
            }
            verticalAlignment = clean(verticalAlignment);
            if (!verticalAlignment.isBlank() && !List.of("top", "center", "bottom", "both").contains(verticalAlignment)) {
                throw new IllegalArgumentException("unsupported cell vertical alignment");
            }
            margins = Objects.requireNonNullElseGet(margins, CellMargins::empty);
        }
        public static CellSpec text(String text) { return new CellSpec(text, 1, "", "", CellMargins.empty()); }
    }

    public record RowSpec(List<CellSpec> cells, RowHeight height, boolean repeatHeader) {
        public RowSpec {
            cells = List.copyOf(Objects.requireNonNullElse(cells, List.of()));
            if (cells.isEmpty()) throw new IllegalArgumentException("table row requires at least one cell");
            height = Objects.requireNonNullElseGet(height, RowHeight::empty);
        }
    }

    public record TableSpec(List<RowSpec> rows, TableFormat format) {
        public TableSpec {
            rows = List.copyOf(Objects.requireNonNullElse(rows, List.of()));
            if (rows.isEmpty()) throw new IllegalArgumentException("table requires at least one row");
            format = Objects.requireNonNullElseGet(format, TableFormat::empty);
        }
    }

    public record CellSnapshot(String locator, String text, int gridSpan, String verticalMerge, String verticalAlignment, CellMargins margins, int nestedTableCount) {}
    public record RowSnapshot(String locator, RowHeight height, boolean repeatHeader, List<CellSnapshot> cells) {}
    public record TableSnapshot(String locator, Width width, CellMargins defaultCellMargins, TableBorders borders, Shading shading, List<RowSnapshot> rows) {}

    public record ImageSpec(byte[] bytes, String extension, long widthEmu, long heightEmu, String name, String title, String altText) {
        public ImageSpec {
            bytes = Objects.requireNonNull(bytes, "bytes").clone();
            if (bytes.length == 0) throw new IllegalArgumentException("image bytes required");
            extension = clean(extension).toLowerCase(Locale.ROOT);
            if (!List.of("png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff").contains(extension)) {
                throw new IllegalArgumentException("unsupported image extension: " + extension);
            }
            if (widthEmu <= 0 || heightEmu <= 0) throw new IllegalArgumentException("image dimensions must be positive");
            name = clean(name).isBlank() ? "Image" : clean(name);
            title = clean(title);
            altText = clean(altText);
        }
        @Override public byte[] bytes() { return bytes.clone(); }
        public static ImageSpec fromBase64(String base64, String extension, long widthEmu, long heightEmu, String name, String title, String altText) {
            return new ImageSpec(Base64.getDecoder().decode(Objects.requireNonNullElse(base64, "")), extension, widthEmu, heightEmu, name, title, altText);
        }
    }

    public record FloatingPlacement(long xEmu, long yEmu, String horizontalRelativeFrom, String verticalRelativeFrom, String wrap) {
        public FloatingPlacement {
            horizontalRelativeFrom = clean(horizontalRelativeFrom).isBlank() ? "column" : clean(horizontalRelativeFrom);
            verticalRelativeFrom = clean(verticalRelativeFrom).isBlank() ? "paragraph" : clean(verticalRelativeFrom);
            wrap = clean(wrap).isBlank() ? "square" : clean(wrap);
            if (!List.of("square", "tight", "through", "topAndBottom", "none").contains(wrap)) {
                throw new IllegalArgumentException("unsupported image wrap: " + wrap);
            }
        }
        public static FloatingPlacement defaults() { return new FloatingPlacement(0, 0, "column", "paragraph", "square"); }
    }

    public record ImageFormat(Long widthEmu, Long heightEmu, Long xEmu, Long yEmu, String title, String altText) {
        public ImageFormat {
            if (widthEmu != null && widthEmu <= 0) throw new IllegalArgumentException("image width must be positive");
            if (heightEmu != null && heightEmu <= 0) throw new IllegalArgumentException("image height must be positive");
            title = title == null ? null : title.strip();
            altText = altText == null ? null : altText.strip();
        }
    }

    public record ImageSnapshot(String locator, String placement, String relationshipId, String partName, long widthEmu, long heightEmu, long xEmu, long yEmu, String title, String altText) {}

    public List<TableSnapshot> readTables(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element body = firstDirect(document.getDocumentElement(), "body");
        ArrayList<TableSnapshot> out = new ArrayList<>();
        int tableIndex = 0;
        for (Element child : directChildren(body)) {
            if (!"tbl".equals(child.getLocalName())) continue;
            tableIndex++;
            readTableRecursive(child, "body/tbl:" + tableIndex, out);
        }
        return List.copyOf(out);
    }

    public byte[] insertTable(byte[] bytes, String paragraphLocator, TableSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element paragraph = locate(document, paragraphLocator, "p");
            Node parent = paragraph.getParentNode();
            Element table = createTable(document, spec);
            Node next = paragraph.getNextSibling();
            if (next == null) parent.appendChild(table); else parent.insertBefore(table, next);
        });
    }

    public byte[] insertNestedTable(byte[] bytes, String cellLocator, TableSpec spec) throws IOException {
        Objects.requireNonNull(spec, "spec");
        return mutateDocument(bytes, document -> {
            Element cell = locate(document, cellLocator, "tc");
            Element table = createTable(document, spec);
            Element finalParagraph = null;
            List<Element> paragraphs = directChildren(cell, "p");
            if (!paragraphs.isEmpty()) finalParagraph = paragraphs.get(paragraphs.size() - 1);
            if (finalParagraph == null) cell.appendChild(table); else cell.insertBefore(table, finalParagraph);
        });
    }

    public byte[] formatTable(byte[] bytes, String tableLocator, TableFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        return mutateDocument(bytes, document -> applyTableFormat(locate(document, tableLocator, "tbl"), format));
    }

    public byte[] mergeCellsHorizontal(byte[] bytes, String rowLocator, int startCell, int span) throws IOException {
        if (startCell < 1 || span < 2) throw new IllegalArgumentException("horizontal merge requires positive startCell and span >= 2");
        return mutateDocument(bytes, document -> {
            Element row = locate(document, rowLocator, "tr");
            List<Element> cells = directChildren(row, "tc");
            if (startCell - 1 + span > cells.size()) throw new IllegalArgumentException("merge exceeds row cell count");
            Element first = cells.get(startCell - 1);
            Element tcPr = ensureDirect(first, "tcPr", true);
            setValChild(tcPr, "gridSpan", Integer.toString(span));
            for (int i = startCell; i < startCell - 1 + span; i++) {
                Element other = cells.get(i);
                for (Element p : directChildren(other, "p")) first.appendChild(p.cloneNode(true));
                row.removeChild(other);
            }
        });
    }

    public byte[] mergeCellsVertical(byte[] bytes, String tableLocator, int column, int startRow, int rowSpan) throws IOException {
        if (column < 1 || startRow < 1 || rowSpan < 2) throw new IllegalArgumentException("vertical merge requires positive indices and rowSpan >= 2");
        return mutateDocument(bytes, document -> {
            Element table = locate(document, tableLocator, "tbl");
            List<Element> rows = directChildren(table, "tr");
            if (startRow - 1 + rowSpan > rows.size()) throw new IllegalArgumentException("vertical merge exceeds table row count");
            for (int r = startRow - 1; r < startRow - 1 + rowSpan; r++) {
                List<Element> cells = directChildren(rows.get(r), "tc");
                if (column > cells.size()) throw new IllegalArgumentException("vertical merge column missing in row");
                Element tcPr = ensureDirect(cells.get(column - 1), "tcPr", true);
                Element vm = ensureDirect(tcPr, "vMerge", false);
                setAttr(vm, "val", r == startRow - 1 ? "restart" : "continue");
            }
        });
    }

    public byte[] splitCell(byte[] bytes, String cellLocator, int parts) throws IOException {
        if (parts < 2) throw new IllegalArgumentException("split parts must be >= 2");
        return mutateDocument(bytes, document -> {
            Element cell = locate(document, cellLocator, "tc");
            Element row = (Element) cell.getParentNode();
            Element tcPr = ensureDirect(cell, "tcPr", true);
            Element span = firstDirect(tcPr, "gridSpan");
            int existingSpan = span == null ? 1 : intOrDefault(attr(span, "val"), 1);
            if (existingSpan < parts) throw new IllegalArgumentException("cannot split cell beyond its grid span");
            removeDirect(tcPr, "gridSpan");
            removeDirect(tcPr, "vMerge");
            Node cursor = cell.getNextSibling();
            for (int i = 1; i < parts; i++) {
                Element clone = (Element) cell.cloneNode(true);
                clearCellText(clone);
                if (cursor == null) row.appendChild(clone); else row.insertBefore(clone, cursor);
            }
        });
    }

    public byte[] formatRow(byte[] bytes, String rowLocator, RowHeight height, boolean repeatHeader) throws IOException {
        Objects.requireNonNull(height, "height");
        return mutateDocument(bytes, document -> {
            Element row = locate(document, rowLocator, "tr");
            Element trPr = ensureDirect(row, "trPr", true);
            Element h = ensureDirect(trPr, "trHeight", false);
            setIntAttr(h, "val", height.valueTwips());
            setAttr(h, "hRule", height.rule());
            setOnOff(trPr, "tblHeader", repeatHeader);
        });
    }

    public byte[] formatCell(byte[] bytes, String cellLocator, CellMargins margins, String verticalAlignment) throws IOException {
        Objects.requireNonNull(margins, "margins");
        verticalAlignment = clean(verticalAlignment);
        if (!verticalAlignment.isBlank() && !List.of("top", "center", "bottom", "both").contains(verticalAlignment)) {
            throw new IllegalArgumentException("unsupported cell vertical alignment");
        }
        final String alignment = verticalAlignment;
        return mutateDocument(bytes, document -> {
            Element cell = locate(document, cellLocator, "tc");
            Element tcPr = ensureDirect(cell, "tcPr", true);
            applyMargins(tcPr, "tcMar", margins);
            if (!alignment.isBlank()) setValChild(tcPr, "vAlign", alignment);
        });
    }

    public List<ImageSnapshot> readImages(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        ArrayList<ImageSnapshot> out = new ArrayList<>();
        Element body = firstDirect(document.getDocumentElement(), "body");
        int pIndex = 0;
        for (Element child : directChildren(body)) {
            if (!"p".equals(child.getLocalName())) continue;
            pIndex++;
            NodeList drawings = child.getElementsByTagNameNS(W, "drawing");
            int imageIndex = 0;
            for (int i = 0; i < drawings.getLength(); i++) {
                Element drawing = (Element) drawings.item(i);
                Element container = first(drawing.getElementsByTagNameNS(WP, "inline"));
                String placement = "inline";
                if (container == null) { container = first(drawing.getElementsByTagNameNS(WP, "anchor")); placement = "floating"; }
                if (container == null) continue;
                Element blip = first(drawing.getElementsByTagNameNS(A, "blip"));
                if (blip == null) continue;
                imageIndex++;
                String rid = blip.getAttributeNS(R, "embed");
                String partName = relationshipTarget(rels, rid);
                Element extent = first(container.getElementsByTagNameNS(WP, "extent"));
                Element docPr = first(container.getElementsByTagNameNS(WP, "docPr"));
                long x = positionOffset(container, "positionH");
                long y = positionOffset(container, "positionV");
                out.add(new ImageSnapshot(
                        "body/p:" + pIndex + "/drawing-image:" + imageIndex,
                        placement,
                        rid,
                        normalizeTarget(partName),
                        longAttr(extent, "cx"),
                        longAttr(extent, "cy"),
                        x,
                        y,
                        docPr == null ? "" : docPr.getAttribute("title"),
                        docPr == null ? "" : docPr.getAttribute("descr")));
            }
        }
        return List.copyOf(out);
    }

    public byte[] insertInlineImage(byte[] bytes, String paragraphLocator, ImageSpec spec) throws IOException {
        return insertImage(bytes, paragraphLocator, spec, null);
    }

    public byte[] insertFloatingImage(byte[] bytes, String paragraphLocator, ImageSpec spec, FloatingPlacement placement) throws IOException {
        return insertImage(bytes, paragraphLocator, spec, Objects.requireNonNullElseGet(placement, FloatingPlacement::defaults));
    }

    public byte[] formatImage(byte[] bytes, String imageLocator, ImageFormat format) throws IOException {
        Objects.requireNonNull(format, "format");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Element drawing = locateDrawing(document, imageLocator);
        Element container = drawingContainer(drawing);
        Element extent = first(container.getElementsByTagNameNS(WP, "extent"));
        if (extent == null) throw new IllegalArgumentException("image extent missing");
        if (format.widthEmu() != null) extent.setAttribute("cx", Long.toString(format.widthEmu()));
        if (format.heightEmu() != null) extent.setAttribute("cy", Long.toString(format.heightEmu()));
        Element xfrm = first(drawing.getElementsByTagNameNS(A, "xfrm"));
        if (xfrm != null) {
            Element ext = first(xfrm.getElementsByTagNameNS(A, "ext"));
            if (ext != null) {
                if (format.widthEmu() != null) ext.setAttribute("cx", Long.toString(format.widthEmu()));
                if (format.heightEmu() != null) ext.setAttribute("cy", Long.toString(format.heightEmu()));
            }
        }
        if ("anchor".equals(container.getLocalName())) {
            if (format.xEmu() != null) setPositionOffset(container, "positionH", format.xEmu());
            if (format.yEmu() != null) setPositionOffset(container, "positionV", format.yEmu());
        } else if (format.xEmu() != null || format.yEmu() != null) {
            throw new IllegalArgumentException("inline image does not have floating x/y coordinates");
        }
        Element docPr = first(container.getElementsByTagNameNS(WP, "docPr"));
        if (docPr != null) {
            if (format.title() != null) setPlainAttr(docPr, "title", format.title());
            if (format.altText() != null) setPlainAttr(docPr, "descr", format.altText());
        }
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        return OoxmlPackageSupport.write(parts);
    }

    public byte[] replaceImageBytes(byte[] bytes, String imageLocator, byte[] replacementBytes, String extension) throws IOException {
        Objects.requireNonNull(replacementBytes, "replacementBytes");
        if (replacementBytes.length == 0) throw new IllegalArgumentException("replacement image bytes required");
        extension = clean(extension).toLowerCase(Locale.ROOT);
        if (!List.of("png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff").contains(extension)) {
            throw new IllegalArgumentException("unsupported replacement image extension");
        }
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        Element drawing = locateDrawing(document, imageLocator);
        Element blip = first(drawing.getElementsByTagNameNS(A, "blip"));
        if (blip == null) throw new IllegalArgumentException("image relationship missing");
        String rid = blip.getAttributeNS(R, "embed");
        Element rel = relationship(rels, rid);
        if (rel == null) throw new IllegalArgumentException("image relationship not found: " + rid);
        String target = normalizeTarget(rel.getAttribute("Target"));
        if (target.isBlank() || !parts.containsKey(target)) throw new IllegalArgumentException("image media part not found");

        int targetUseCount = countTargetUses(document, rels, target);
        if (targetUseCount > 1) {
            String newPart = nextImagePart(parts, extension);
            String newRid = nextRelationshipId(rels);
            Element cloneRel = rels.createElementNS(REL, "Relationship");
            cloneRel.setAttribute("Id", newRid);
            cloneRel.setAttribute("Type", IMAGE_REL);
            cloneRel.setAttribute("Target", newPart.substring("word/".length()));
            rels.getDocumentElement().appendChild(cloneRel);
            parts.put(newPart, replacementBytes.clone());
            blip.setAttributeNS(R, "r:embed", newRid);
            ensureContentType(parts, extension);
        } else {
            String currentExt = extensionOf(target);
            if (currentExt.equals(extension) || (currentExt.equals("jpg") && extension.equals("jpeg")) || (currentExt.equals("jpeg") && extension.equals("jpg"))) {
                parts.put(target, replacementBytes.clone());
            } else {
                String newPart = nextImagePart(parts, extension);
                parts.remove(target);
                parts.put(newPart, replacementBytes.clone());
                rel.setAttribute("Target", newPart.substring("word/".length()));
                ensureContentType(parts, extension);
            }
        }
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    private byte[] insertImage(byte[] bytes, String paragraphLocator, ImageSpec spec, FloatingPlacement floating) throws IOException {
        Objects.requireNonNull(spec, "spec");
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        Document rels = documentRelationships(parts);
        Element paragraph = locate(document, paragraphLocator, "p");
        String partName = nextImagePart(parts, spec.extension());
        String rid = nextRelationshipId(rels);
        Element relationship = rels.createElementNS(REL, "Relationship");
        relationship.setAttribute("Id", rid);
        relationship.setAttribute("Type", IMAGE_REL);
        relationship.setAttribute("Target", partName.substring("word/".length()));
        rels.getDocumentElement().appendChild(relationship);
        parts.put(partName, spec.bytes());
        ensureContentType(parts, spec.extension());
        int docPrId = nextDocPrId(document);
        paragraph.appendChild(createImageRun(document, spec, rid, docPrId, floating));
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        parts.put("word/_rels/document.xml.rels", OoxmlPackageSupport.serialize(rels));
        return OoxmlPackageSupport.write(parts);
    }

    private static void readTableRecursive(Element table, String locator, List<TableSnapshot> out) {
        Element tblPr = firstDirect(table, "tblPr");
        Width width = readWidth(firstDirect(tblPr, "tblW"));
        CellMargins margins = readMargins(firstDirect(tblPr, "tblCellMar"));
        TableBorders borders = readBorders(firstDirect(tblPr, "tblBorders"));
        Shading shading = readShading(firstDirect(tblPr, "shd"));
        ArrayList<RowSnapshot> rows = new ArrayList<>();
        int rowIndex = 0;
        for (Element row : directChildren(table, "tr")) {
            rowIndex++;
            String rowLocator = locator + "/tr:" + rowIndex;
            Element trPr = firstDirect(row, "trPr");
            RowHeight height = readRowHeight(firstDirect(trPr, "trHeight"));
            boolean header = onOff(firstDirect(trPr, "tblHeader"));
            ArrayList<CellSnapshot> cells = new ArrayList<>();
            int cellIndex = 0;
            for (Element cell : directChildren(row, "tc")) {
                cellIndex++;
                String cellLocator = rowLocator + "/tc:" + cellIndex;
                Element tcPr = firstDirect(cell, "tcPr");
                int span = intOrDefault(attr(firstDirect(tcPr, "gridSpan"), "val"), 1);
                String vMerge = attr(firstDirect(tcPr, "vMerge"), "val");
                if (firstDirect(tcPr, "vMerge") != null && vMerge.isBlank()) vMerge = "continue";
                String valign = attr(firstDirect(tcPr, "vAlign"), "val");
                int nested = directChildren(cell, "tbl").size();
                cells.add(new CellSnapshot(cellLocator, text(cell), span, vMerge, valign, readMargins(firstDirect(tcPr, "tcMar")), nested));
                int nestedIndex = 0;
                for (Element nestedTable : directChildren(cell, "tbl")) {
                    nestedIndex++;
                    readTableRecursive(nestedTable, cellLocator + "/tbl:" + nestedIndex, out);
                }
            }
            rows.add(new RowSnapshot(rowLocator, height, header, List.copyOf(cells)));
        }
        out.add(new TableSnapshot(locator, width, margins, borders, shading, List.copyOf(rows)));
    }

    private static Element createTable(Document document, TableSpec spec) {
        Element tbl = document.createElementNS(W, "w:tbl");
        Element tblPr = document.createElementNS(W, "w:tblPr");
        tbl.appendChild(tblPr);
        applyTableFormat(tbl, spec.format());
        for (RowSpec rowSpec : spec.rows()) {
            Element tr = document.createElementNS(W, "w:tr");
            tbl.appendChild(tr);
            Element trPr = document.createElementNS(W, "w:trPr");
            tr.appendChild(trPr);
            Element h = document.createElementNS(W, "w:trHeight");
            if (rowSpec.height().valueTwips() != null) h.setAttributeNS(W, "w:val", Integer.toString(rowSpec.height().valueTwips()));
            if (!rowSpec.height().rule().isBlank()) h.setAttributeNS(W, "w:hRule", rowSpec.height().rule());
            if (h.hasAttributes()) trPr.appendChild(h);
            if (rowSpec.repeatHeader()) {
                Element header = document.createElementNS(W, "w:tblHeader");
                header.setAttributeNS(W, "w:val", "1");
                trPr.appendChild(header);
            }
            for (CellSpec cellSpec : rowSpec.cells()) {
                Element tc = document.createElementNS(W, "w:tc");
                tr.appendChild(tc);
                Element tcPr = document.createElementNS(W, "w:tcPr");
                tc.appendChild(tcPr);
                if (cellSpec.gridSpan() != null && cellSpec.gridSpan() > 1) setValChild(tcPr, "gridSpan", Integer.toString(cellSpec.gridSpan()));
                if (!cellSpec.verticalMerge().isBlank()) setValChild(tcPr, "vMerge", cellSpec.verticalMerge());
                if (!cellSpec.verticalAlignment().isBlank()) setValChild(tcPr, "vAlign", cellSpec.verticalAlignment());
                applyMargins(tcPr, "tcMar", cellSpec.margins());
                tc.appendChild(textParagraph(document, cellSpec.text()));
            }
        }
        return tbl;
    }

    private static void applyTableFormat(Element table, TableFormat format) {
        Element tblPr = ensureDirect(table, "tblPr", true);
        Element width = ensureDirect(tblPr, "tblW", false);
        setIntAttr(width, "w", format.width().value());
        setAttr(width, "type", format.width().type());
        applyMargins(tblPr, "tblCellMar", format.defaultCellMargins());
        applyBorders(tblPr, format.borders());
        applyShading(tblPr, format.shading());
    }

    private static void applyMargins(Element properties, String local, CellMargins margins) {
        Element parent = ensureDirect(properties, local, false);
        margin(parent, "top", margins.topTwips());
        margin(parent, "right", margins.rightTwips());
        margin(parent, "bottom", margins.bottomTwips());
        margin(parent, "left", margins.leftTwips());
        if (!parent.hasChildNodes()) properties.removeChild(parent);
    }

    private static void margin(Element parent, String local, Integer twips) {
        if (twips == null) { removeDirect(parent, local); return; }
        Element edge = ensureDirect(parent, local, false);
        setIntAttr(edge, "w", twips);
        setAttr(edge, "type", "dxa");
    }

    private static void applyBorders(Element tblPr, TableBorders borders) {
        if (borders == null) return;
        Element parent = ensureDirect(tblPr, "tblBorders", false);
        border(parent, "top", borders.top());
        border(parent, "right", borders.right());
        border(parent, "bottom", borders.bottom());
        border(parent, "left", borders.left());
        border(parent, "insideH", borders.insideH());
        border(parent, "insideV", borders.insideV());
    }

    private static void border(Element parent, String local, BorderEdge edge) {
        if (edge == null) { removeDirect(parent, local); return; }
        Element e = ensureDirect(parent, local, false);
        setAttr(e, "val", edge.style());
        setIntAttr(e, "sz", edge.sizeEighthPoints());
        setIntAttr(e, "space", edge.spacePoints());
        setAttr(e, "color", edge.colorHex());
    }

    private static void applyShading(Element tblPr, Shading shading) {
        if (shading == null) return;
        if (shading.pattern().isBlank() && shading.fillHex().isBlank() && shading.colorHex().isBlank()) {
            removeDirect(tblPr, "shd");
            return;
        }
        Element shd = ensureDirect(tblPr, "shd", false);
        setAttr(shd, "val", shading.pattern());
        setAttr(shd, "fill", shading.fillHex());
        setAttr(shd, "color", shading.colorHex());
    }

    private static TableBorders readBorders(Element parent) {
        if (parent == null) return null;
        return new TableBorders(readBorder(firstDirect(parent, "top")), readBorder(firstDirect(parent, "right")), readBorder(firstDirect(parent, "bottom")), readBorder(firstDirect(parent, "left")), readBorder(firstDirect(parent, "insideH")), readBorder(firstDirect(parent, "insideV")));
    }

    private static BorderEdge readBorder(Element edge) {
        if (edge == null) return null;
        return new BorderEdge(attr(edge, "val"), intAttr(edge, "sz"), intAttr(edge, "space"), attr(edge, "color"));
    }

    private static Shading readShading(Element shd) {
        if (shd == null) return Shading.empty();
        return new Shading(attr(shd, "val"), attr(shd, "fill"), attr(shd, "color"));
    }

    private static Width readWidth(Element width) {
        if (width == null) return Width.empty();
        return new Width(intAttr(width, "w"), attr(width, "type"));
    }

    private static RowHeight readRowHeight(Element height) {
        if (height == null) return RowHeight.empty();
        return new RowHeight(intAttr(height, "val"), attr(height, "hRule"));
    }

    private static CellMargins readMargins(Element margins) {
        if (margins == null) return CellMargins.empty();
        return new CellMargins(marginValue(margins, "top"), marginValue(margins, "right"), marginValue(margins, "bottom"), marginValue(margins, "left"));
    }

    private static Integer marginValue(Element margins, String local) {
        return intAttr(firstDirect(margins, local), "w");
    }

    private static Element createImageRun(Document document, ImageSpec spec, String rid, int docPrId, FloatingPlacement floating) {
        Element run = document.createElementNS(W, "w:r");
        Element drawing = document.createElementNS(W, "w:drawing");
        run.appendChild(drawing);
        Element container;
        if (floating == null) {
            container = document.createElementNS(WP, "wp:inline");
            container.setAttribute("distT", "0"); container.setAttribute("distB", "0"); container.setAttribute("distL", "0"); container.setAttribute("distR", "0");
        } else {
            container = document.createElementNS(WP, "wp:anchor");
            container.setAttribute("distT", "0"); container.setAttribute("distB", "0"); container.setAttribute("distL", "0"); container.setAttribute("distR", "0");
            container.setAttribute("simplePos", "0"); container.setAttribute("relativeHeight", "251658240"); container.setAttribute("behindDoc", "0"); container.setAttribute("locked", "0"); container.setAttribute("layoutInCell", "1"); container.setAttribute("allowOverlap", "1");
            Element simplePos = document.createElementNS(WP, "wp:simplePos"); simplePos.setAttribute("x", "0"); simplePos.setAttribute("y", "0"); container.appendChild(simplePos);
            Element posH = document.createElementNS(WP, "wp:positionH"); posH.setAttribute("relativeFrom", floating.horizontalRelativeFrom()); Element x = document.createElementNS(WP, "wp:posOffset"); x.setTextContent(Long.toString(floating.xEmu())); posH.appendChild(x); container.appendChild(posH);
            Element posV = document.createElementNS(WP, "wp:positionV"); posV.setAttribute("relativeFrom", floating.verticalRelativeFrom()); Element y = document.createElementNS(WP, "wp:posOffset"); y.setTextContent(Long.toString(floating.yEmu())); posV.appendChild(y); container.appendChild(posV);
        }
        drawing.appendChild(container);
        Element extent = document.createElementNS(WP, "wp:extent"); extent.setAttribute("cx", Long.toString(spec.widthEmu())); extent.setAttribute("cy", Long.toString(spec.heightEmu())); container.appendChild(extent);
        Element effect = document.createElementNS(WP, "wp:effectExtent"); effect.setAttribute("l", "0"); effect.setAttribute("t", "0"); effect.setAttribute("r", "0"); effect.setAttribute("b", "0"); container.appendChild(effect);
        if (floating != null) {
            Element wrap = switch (floating.wrap()) {
                case "square" -> document.createElementNS(WP, "wp:wrapSquare");
                case "tight" -> document.createElementNS(WP, "wp:wrapTight");
                case "through" -> document.createElementNS(WP, "wp:wrapThrough");
                case "topAndBottom" -> document.createElementNS(WP, "wp:wrapTopAndBottom");
                default -> document.createElementNS(WP, "wp:wrapNone");
            };
            if ("square".equals(floating.wrap()) || "tight".equals(floating.wrap()) || "through".equals(floating.wrap())) wrap.setAttribute("wrapText", "bothSides");
            container.appendChild(wrap);
        }
        Element docPr = document.createElementNS(WP, "wp:docPr"); docPr.setAttribute("id", Integer.toString(docPrId)); docPr.setAttribute("name", spec.name()); if (!spec.title().isBlank()) docPr.setAttribute("title", spec.title()); if (!spec.altText().isBlank()) docPr.setAttribute("descr", spec.altText()); container.appendChild(docPr);
        Element cNv = document.createElementNS(WP, "wp:cNvGraphicFramePr"); container.appendChild(cNv);
        Element graphic = document.createElementNS(A, "a:graphic"); container.appendChild(graphic);
        Element graphicData = document.createElementNS(A, "a:graphicData"); graphicData.setAttribute("uri", PIC); graphic.appendChild(graphicData);
        Element pic = document.createElementNS(PIC, "pic:pic"); graphicData.appendChild(pic);
        Element nv = document.createElementNS(PIC, "pic:nvPicPr"); pic.appendChild(nv);
        Element cNvPr = document.createElementNS(PIC, "pic:cNvPr"); cNvPr.setAttribute("id", "0"); cNvPr.setAttribute("name", spec.name()); if (!spec.altText().isBlank()) cNvPr.setAttribute("descr", spec.altText()); nv.appendChild(cNvPr); nv.appendChild(document.createElementNS(PIC, "pic:cNvPicPr"));
        Element fill = document.createElementNS(PIC, "pic:blipFill"); pic.appendChild(fill);
        Element blip = document.createElementNS(A, "a:blip"); blip.setAttributeNS(R, "r:embed", rid); fill.appendChild(blip);
        Element stretch = document.createElementNS(A, "a:stretch"); stretch.appendChild(document.createElementNS(A, "a:fillRect")); fill.appendChild(stretch);
        Element spPr = document.createElementNS(PIC, "pic:spPr"); pic.appendChild(spPr);
        Element xfrm = document.createElementNS(A, "a:xfrm"); Element off = document.createElementNS(A, "a:off"); off.setAttribute("x", "0"); off.setAttribute("y", "0"); xfrm.appendChild(off); Element ext = document.createElementNS(A, "a:ext"); ext.setAttribute("cx", Long.toString(spec.widthEmu())); ext.setAttribute("cy", Long.toString(spec.heightEmu())); xfrm.appendChild(ext); spPr.appendChild(xfrm);
        Element geom = document.createElementNS(A, "a:prstGeom"); geom.setAttribute("prst", "rect"); geom.appendChild(document.createElementNS(A, "a:avLst")); spPr.appendChild(geom);
        return run;
    }

    private static Map<String, byte[]> requireDocx(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        if (!parts.containsKey("word/document.xml") || !parts.containsKey("[Content_Types].xml")) throw new IOException("not a DOCX package");
        return new LinkedHashMap<>(parts);
    }

    private static byte[] mutateDocument(byte[] bytes, XmlMutation mutation) throws IOException {
        Map<String, byte[]> parts = requireDocx(bytes);
        Document document = OoxmlPackageSupport.parseXml(parts.get("word/document.xml"));
        mutation.apply(document);
        parts.put("word/document.xml", OoxmlPackageSupport.serialize(document));
        return OoxmlPackageSupport.write(parts);
    }

    private static Document documentRelationships(Map<String, byte[]> parts) throws IOException {
        byte[] bytes = parts.get("word/_rels/document.xml.rels");
        if (bytes != null) return OoxmlPackageSupport.parseXml(bytes);
        return OoxmlPackageSupport.parseXml(("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"" + REL + "\"/>").getBytes(StandardCharsets.UTF_8));
    }

    private static void ensureContentType(Map<String, byte[]> parts, String extension) throws IOException {
        Document types = OoxmlPackageSupport.parseXml(parts.get("[Content_Types].xml"));
        String normalized = extension.equals("jpeg") ? "jpg" : extension;
        String mime = switch (normalized) {
            case "png" -> "image/png"; case "jpg" -> "image/jpeg"; case "gif" -> "image/gif"; case "bmp" -> "image/bmp"; case "tif", "tiff" -> "image/tiff"; default -> throw new IllegalArgumentException("unsupported image extension");
        };
        NodeList defaults = types.getElementsByTagNameNS(CT, "Default");
        for (int i = 0; i < defaults.getLength(); i++) {
            Element e = (Element) defaults.item(i);
            if (normalized.equalsIgnoreCase(e.getAttribute("Extension"))) { parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(types)); return; }
        }
        Element def = types.createElementNS(CT, "Default"); def.setAttribute("Extension", normalized); def.setAttribute("ContentType", mime); types.getDocumentElement().appendChild(def);
        parts.put("[Content_Types].xml", OoxmlPackageSupport.serialize(types));
    }

    private static String nextImagePart(Map<String, byte[]> parts, String extension) {
        String normalized = extension.equals("jpeg") ? "jpg" : extension;
        int i = 1;
        while (parts.containsKey("word/media/image" + i + "." + normalized)) i++;
        return "word/media/image" + i + "." + normalized;
    }

    private static String nextRelationshipId(Document rels) {
        int max = 0;
        NodeList nodes = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) {
            String id = ((Element) nodes.item(i)).getAttribute("Id");
            if (id.startsWith("rId")) max = Math.max(max, intOrDefault(id.substring(3), 0));
        }
        return "rId" + (max + 1);
    }

    private static int nextDocPrId(Document document) {
        int max = 0;
        NodeList nodes = document.getElementsByTagNameNS(WP, "docPr");
        for (int i = 0; i < nodes.getLength(); i++) max = Math.max(max, intOrDefault(((Element) nodes.item(i)).getAttribute("id"), 0));
        return max + 1;
    }

    private static String relationshipTarget(Document rels, String rid) {
        Element rel = relationship(rels, rid);
        return rel == null ? "" : rel.getAttribute("Target");
    }

    private static Element relationship(Document rels, String rid) {
        NodeList nodes = rels.getElementsByTagNameNS(REL, "Relationship");
        for (int i = 0; i < nodes.getLength(); i++) if (rid.equals(((Element) nodes.item(i)).getAttribute("Id"))) return (Element) nodes.item(i);
        return null;
    }

    private static int countTargetUses(Document document, Document rels, String targetPart) {
        int count = 0;
        NodeList blips = document.getElementsByTagNameNS(A, "blip");
        for (int i = 0; i < blips.getLength(); i++) {
            String rid = ((Element) blips.item(i)).getAttributeNS(R, "embed");
            String target = normalizeTarget(relationshipTarget(rels, rid));
            if (targetPart.equals(target)) count++;
        }
        return count;
    }

    private static String normalizeTarget(String target) {
        target = clean(target).replace('\\', '/');
        if (target.startsWith("../")) target = target.substring(3);
        if (target.startsWith("word/")) return target;
        if (target.startsWith("/")) target = target.substring(1);
        return target.isBlank() ? "" : "word/" + target;
    }

    private static String extensionOf(String partName) {
        int dot = partName.lastIndexOf('.'); return dot < 0 ? "" : partName.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static Element locateDrawing(Document document, String locator) {
        if (locator == null || !locator.matches("body/p:[1-9][0-9]*/drawing-image:[1-9][0-9]*")) throw new IllegalArgumentException("unsafe/unsupported image locator: " + locator);
        String[] chunks = locator.split("/");
        Element paragraph = locate(document, chunks[0] + "/" + chunks[1], "p");
        int target = Integer.parseInt(chunks[2].substring("drawing-image:".length()));
        NodeList drawings = paragraph.getElementsByTagNameNS(W, "drawing");
        int imageIndex = 0;
        for (int i = 0; i < drawings.getLength(); i++) {
            Element drawing = (Element) drawings.item(i);
            if (drawing.getElementsByTagNameNS(A, "blip").getLength() == 0) continue;
            imageIndex++;
            if (imageIndex == target) return drawing;
        }
        throw new IllegalArgumentException("image locator not found: " + locator);
    }

    private static Element drawingContainer(Element drawing) {
        Element inline = first(drawing.getElementsByTagNameNS(WP, "inline"));
        if (inline != null) return inline;
        Element anchor = first(drawing.getElementsByTagNameNS(WP, "anchor"));
        if (anchor != null) return anchor;
        throw new IllegalArgumentException("drawing has no inline/anchor placement");
    }

    private static long positionOffset(Element container, String local) {
        Element pos = first(container.getElementsByTagNameNS(WP, local));
        if (pos == null) return 0L;
        Element offset = first(pos.getElementsByTagNameNS(WP, "posOffset"));
        return offset == null ? 0L : longOrDefault(offset.getTextContent(), 0L);
    }

    private static void setPositionOffset(Element container, String local, long value) {
        Element pos = first(container.getElementsByTagNameNS(WP, local));
        if (pos == null) throw new IllegalArgumentException("floating image position missing: " + local);
        Element offset = first(pos.getElementsByTagNameNS(WP, "posOffset"));
        if (offset == null) throw new IllegalArgumentException("floating image offset missing: " + local);
        offset.setTextContent(Long.toString(value));
    }

    private static Element locate(Document document, String locator, String expectedLocal) {
        if (locator == null || locator.isBlank() || locator.contains("..") || locator.startsWith("/") || locator.contains("\\")) throw new IllegalArgumentException("unsafe locator: " + locator);
        String[] chunks = locator.split("/");
        Element current = firstDirect(document.getDocumentElement(), "body");
        int start = 0;
        if (chunks.length > 0 && chunks[0].equals("body")) start = 1;
        for (int i = start; i < chunks.length; i++) {
            String[] pair = chunks[i].split(":", 2);
            if (pair.length != 2 || !pair[1].matches("[1-9][0-9]*")) throw new IllegalArgumentException("unsupported locator segment: " + chunks[i]);
            String local = switch (pair[0]) { case "p" -> "p"; case "tbl" -> "tbl"; case "tr" -> "tr"; case "tc" -> "tc"; default -> throw new IllegalArgumentException("unsupported locator segment: " + pair[0]); };
            List<Element> children = directChildren(current, local);
            int index = Integer.parseInt(pair[1]);
            if (index > children.size()) throw new IllegalArgumentException("locator not found: " + locator);
            current = children.get(index - 1);
        }
        if (!expectedLocal.equals(current.getLocalName())) throw new IllegalArgumentException("locator type mismatch: expected " + expectedLocal + " got " + current.getLocalName());
        return current;
    }

    private static Element ensureDirect(Element parent, String local, boolean first) {
        Element existing = firstDirect(parent, local);
        if (existing != null) return existing;
        Element e = parent.getOwnerDocument().createElementNS(W, "w:" + local);
        if (first && parent.getFirstChild() != null) parent.insertBefore(e, parent.getFirstChild()); else parent.appendChild(e);
        return e;
    }

    private static Element firstDirect(Element parent, String local) {
        if (parent == null) return null;
        Node child = parent.getFirstChild();
        while (child != null) {
            if (child instanceof Element e && W.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) return e;
            child = child.getNextSibling();
        }
        return null;
    }

    private static List<Element> directChildren(Element parent, String local) {
        ArrayList<Element> out = new ArrayList<>();
        if (parent == null) return out;
        Node child = parent.getFirstChild();
        while (child != null) { if (child instanceof Element e && W.equals(e.getNamespaceURI()) && local.equals(e.getLocalName())) out.add(e); child = child.getNextSibling(); }
        return out;
    }

    private static List<Element> directChildren(Element parent) {
        ArrayList<Element> out = new ArrayList<>();
        if (parent == null) return out;
        Node child = parent.getFirstChild();
        while (child != null) { if (child instanceof Element e && W.equals(e.getNamespaceURI())) out.add(e); child = child.getNextSibling(); }
        return out;
    }

    private static void removeDirect(Element parent, String local) {
        Element e; while ((e = firstDirect(parent, local)) != null) parent.removeChild(e);
    }

    private static void setValChild(Element parent, String local, String value) {
        Element child = ensureDirect(parent, local, false); setAttr(child, "val", value);
    }

    private static void setOnOff(Element parent, String local, boolean value) {
        if (!value) { removeDirect(parent, local); return; }
        Element child = ensureDirect(parent, local, false); setAttr(child, "val", "1");
    }

    private static void setIntAttr(Element element, String local, Integer value) {
        if (value == null) element.removeAttributeNS(W, local); else element.setAttributeNS(W, "w:" + local, Integer.toString(value));
    }

    private static void setAttr(Element element, String local, String value) {
        value = clean(value); if (value.isBlank()) element.removeAttributeNS(W, local); else element.setAttributeNS(W, "w:" + local, value);
    }

    private static void setPlainAttr(Element element, String local, String value) {
        if (value == null || value.isBlank()) element.removeAttribute(local); else element.setAttribute(local, value);
    }

    private static String attr(Element element, String local) {
        if (element == null) return "";
        String value = element.getAttributeNS(W, local); if (value.isBlank()) value = element.getAttribute(local); return value;
    }

    private static Integer intAttr(Element e, String local) { String v = attr(e, local); return v.isBlank() ? null : Integer.valueOf(v); }
    private static int intOrDefault(String value, int def) { try { return Integer.parseInt(Objects.requireNonNullElse(value, "")); } catch (NumberFormatException e) { return def; } }
    private static long longOrDefault(String value, long def) { try { return Long.parseLong(Objects.requireNonNullElse(value, "").strip()); } catch (NumberFormatException e) { return def; } }
    private static long longAttr(Element e, String local) { return e == null ? 0L : longOrDefault(e.getAttribute(local), 0L); }
    private static boolean onOff(Element e) { if (e == null) return false; String v = attr(e, "val"); return v.isBlank() || List.of("1", "true", "on").contains(v); }

    private static String text(Element element) {
        StringBuilder b = new StringBuilder();
        NodeList nodes = element.getElementsByTagNameNS(W, "t");
        for (int i = 0; i < nodes.getLength(); i++) b.append(nodes.item(i).getTextContent());
        return b.toString();
    }

    private static void clearCellText(Element cell) {
        NodeList nodes = cell.getElementsByTagNameNS(W, "t");
        for (int i = 0; i < nodes.getLength(); i++) nodes.item(i).setTextContent("");
    }

    private static Element textParagraph(Document doc, String value) {
        Element p = doc.createElementNS(W, "w:p"); Element r = doc.createElementNS(W, "w:r"); Element t = doc.createElementNS(W, "w:t");
        if (value.startsWith(" ") || value.endsWith(" ")) t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
        t.setTextContent(value); r.appendChild(t); p.appendChild(r); return p;
    }

    private static Element first(NodeList nodes) { return nodes == null || nodes.getLength() == 0 ? null : (Element) nodes.item(0); }
    private static String color(String value, String name) { value = clean(value).toUpperCase(Locale.ROOT); if (!value.isBlank() && !value.equals("AUTO") && !value.matches("[0-9A-F]{6}")) throw new IllegalArgumentException(name + " must be RRGGBB or auto"); return value; }
    private static String clean(String value) { return Objects.requireNonNullElse(value, "").strip(); }

    @FunctionalInterface private interface XmlMutation { void apply(Document document) throws IOException; }
}
