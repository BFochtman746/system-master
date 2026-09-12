package org.systemmaster.tools.design;

import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;

/** Deterministic OOXML exporter for approved layout candidates. */
public final class MasterpiecePptxExporter {
    private static final long SLIDE_W = 12192000L;
    private static final long SLIDE_H = 6858000L;

    public byte[] export(NarrativePlan plan, BrandDesignProfile brand, List<SlideLayoutCandidate> candidates) throws IOException {
        Objects.requireNonNull(plan, "plan"); Objects.requireNonNull(brand, "brand");
        candidates = List.copyOf(Objects.requireNonNull(candidates, "candidates"));
        if (candidates.size() != plan.slides().size()) throw new IllegalArgumentException("one selected candidate required per slide");
        for (int i = 0; i < candidates.size(); i++) if (candidates.get(i).slideIndex() != i + 1) throw new IllegalArgumentException("candidate order mismatch");

        LinkedHashMap<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("[Content_Types].xml", bytes(contentTypes(candidates.size())));
        entries.put("_rels/.rels", bytes(rootRels()));
        entries.put("docProps/core.xml", bytes(core(plan.title())));
        entries.put("ppt/presentation.xml", bytes(presentation(candidates.size())));
        entries.put("ppt/_rels/presentation.xml.rels", bytes(presentationRels(candidates.size())));
        for (int i = 0; i < candidates.size(); i++) {
            int n = i + 1;
            entries.put("ppt/slides/slide" + n + ".xml", bytes(slideXml(candidates.get(i), brand)));
            entries.put("ppt/slides/_rels/slide" + n + ".xml.rels", bytes(emptyRelationships()));
            String notes = plan.slides().get(i).speakerNotes();
            if (!notes.isBlank()) entries.put("ppt/notesSlides/notesSlide" + n + ".xml", bytes(notesXml(notes)));
        }
        return OoxmlPackageSupport.write(entries);
    }

    private static String slideXml(SlideLayoutCandidate candidate, BrandDesignProfile brand) {
        StringBuilder shapes = new StringBuilder();
        int id = 2;
        shapes.append(rect(id++, "Accent", brand.margin(), .055, .10, .012, brand.accentRgb()));
        for (SlideLayoutCandidate.TextElement element : candidate.elements()) shapes.append(textBox(id++, element));
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">"
                + "<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val=\"" + brand.backgroundRgb() + "\"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>"
                + "<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>"
                + "<p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
                + shapes + "</p:spTree></p:cSld></p:sld>";
    }

    private static String textBox(int id, SlideLayoutCandidate.TextElement e) {
        LayoutFrame f = e.frame();
        StringBuilder paragraphs = new StringBuilder();
        for (String line : e.text().split("\\R", -1)) {
            if (line.isBlank()) continue;
            paragraphs.append("<a:p><a:r><a:rPr lang=\"en-US\" sz=\"").append(e.fontPt() * 100).append("\" b=\"").append(e.bold() ? "1" : "0").append("\">"
                    + "<a:solidFill><a:srgbClr val=\"").append(e.rgb()).append("\"/></a:solidFill><a:latin typeface=\"").append(escape(e.fontFamily())).append("\"/>"
                    + "</a:rPr><a:t>").append(escape(line)).append("</a:t></a:r></a:p>");
        }
        return "<p:sp><p:nvSpPr><p:cNvPr id=\"" + id + "\" name=\"" + escape(e.role().name()) + "\"/><p:cNvSpPr txBox=\"1\"/><p:nvPr/></p:nvSpPr>"
                + "<p:spPr><a:xfrm><a:off x=\"" + emuX(f.x()) + "\" y=\"" + emuY(f.y()) + "\"/><a:ext cx=\"" + emuX(f.width()) + "\" cy=\"" + emuY(f.height()) + "\"/></a:xfrm>"
                + "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>"
                + "<p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" rIns=\"0\" tIns=\"0\" bIns=\"0\" anchor=\"t\"/><a:lstStyle/>" + paragraphs + "</p:txBody></p:sp>";
    }

    private static String rect(int id, String name, double x, double y, double w, double h, String rgb) {
        return "<p:sp><p:nvSpPr><p:cNvPr id=\"" + id + "\" name=\"" + escape(name) + "\"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>"
                + "<p:spPr><a:xfrm><a:off x=\"" + emuX(x) + "\" y=\"" + emuY(y) + "\"/><a:ext cx=\"" + emuX(w) + "\" cy=\"" + emuY(h) + "\"/></a:xfrm>"
                + "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"" + rgb + "\"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>";
    }

    private static long emuX(double normalized) { return Math.round(normalized * SLIDE_W); }
    private static long emuY(double normalized) { return Math.round(normalized * SLIDE_H); }
    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String rootRels() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>"; }
    private static String emptyRelationships() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"/>"; }
    private static String core(String title) { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>" + escape(title) + "</dc:title></cp:coreProperties>"; }
    private static String contentTypes(int count) { StringBuilder s = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>"); for (int i = 1; i <= count; i++) s.append("<Override PartName=\"/ppt/slides/slide").append(i).append(".xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>"); return s.append("</Types>").toString(); }
    private static String presentation(int count) { StringBuilder ids = new StringBuilder(); for (int i = 1; i <= count; i++) ids.append("<p:sldId id=\"").append(255 + i).append("\" r:id=\"rId").append(i).append("\"/>"); return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><p:presentation xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><p:sldSz cx=\"12192000\" cy=\"6858000\"/><p:sldIdLst>" + ids + "</p:sldIdLst></p:presentation>"; }
    private static String presentationRels(int count) { StringBuilder s = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"); for (int i = 1; i <= count; i++) s.append("<Relationship Id=\"rId").append(i).append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide\" Target=\"slides/slide").append(i).append(".xml\"/>"); return s.append("</Relationships>").toString(); }
    private static String notesXml(String notes) { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><p:notes xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>" + escape(notes) + "</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>"; }
    private static String escape(String s) { return (s == null ? "" : s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
}
