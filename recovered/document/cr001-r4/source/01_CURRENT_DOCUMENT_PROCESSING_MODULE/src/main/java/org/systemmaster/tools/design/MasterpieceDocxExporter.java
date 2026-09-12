package org.systemmaster.tools.design;

import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;

/** Reflow-native DOCX exporter using semantic styles, section constraints, widow control, and brand tokens. */
public final class MasterpieceDocxExporter {
    public byte[] export(DocumentFormattingPlan plan, BrandDesignProfile brand) throws IOException {
        Objects.requireNonNull(plan, "plan"); Objects.requireNonNull(brand, "brand");
        LinkedHashMap<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("[Content_Types].xml", bytes(contentTypes()));
        entries.put("_rels/.rels", bytes(rootRels()));
        entries.put("docProps/core.xml", bytes(core(plan.title())));
        entries.put("word/document.xml", bytes(documentXml(plan, brand)));
        entries.put("word/styles.xml", bytes(stylesXml(brand)));
        entries.put("word/_rels/document.xml.rels", bytes(documentRels()));
        return OoxmlPackageSupport.write(entries);
    }

    private static String documentXml(DocumentFormattingPlan plan, BrandDesignProfile brand) {
        StringBuilder body = new StringBuilder();
        for (DocumentPageBrief section : plan.sections()) {
            boolean pageBreakBefore = section.sequence() > 1 && switch (section.archetype()) {
                case TITLE_PAGE, SECTION_OPENER, EXECUTIVE_SUMMARY, REFERENCES, APPENDIX, BACK_COVER -> true;
                default -> false;
            };
            switch (section.archetype()) {
                case COVER, TITLE_PAGE -> {
                    body.append(paragraph("Title", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("Subtitle", block, false));
                    body.append(pageBreak());
                }
                case SECTION_OPENER -> {
                    body.append(paragraph("SectionTitle", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("Lead", block, false));
                }
                case QUOTE_FOCUS -> {
                    body.append(paragraph("Heading1", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("Quote", block, false));
                }
                case REFERENCES -> {
                    body.append(paragraph("Heading1", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("Reference", block, false));
                }
                case FIGURE_FOCUS -> {
                    body.append(paragraph("Heading1", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("Caption", block, false));
                }
                case TABLE_FOCUS -> {
                    body.append(paragraph("Heading1", section.heading(), pageBreakBefore));
                    body.append(simpleTable(section.contentBlocks()));
                }
                case BODY_WITH_SIDEBAR -> {
                    body.append(paragraph("Heading1", section.heading(), pageBreakBefore));
                    List<String> blocks = section.contentBlocks();
                    for (int i = 0; i < blocks.size(); i++) body.append(paragraph(i == blocks.size() - 1 ? "Sidebar" : "BodyText", blocks.get(i), false));
                }
                default -> {
                    body.append(paragraph(section.archetype() == PageArchetype.EXECUTIVE_SUMMARY ? "Heading1" : "Heading1", section.heading(), pageBreakBefore));
                    for (String block : section.contentBlocks()) body.append(paragraph("BodyText", block, false));
                }
            }
        }
        int marginX = clampTwips(Math.round(12240.0 * brand.margin()));
        int marginY = clampTwips(Math.round(15840.0 * brand.margin()));
        body.append("<w:sectPr><w:pgSz w:w=\"12240\" w:h=\"15840\"/><w:pgMar w:top=\"").append(marginY)
                .append("\" w:right=\"").append(marginX).append("\" w:bottom=\"").append(marginY)
                .append("\" w:left=\"").append(marginX).append("\" w:header=\"540\" w:footer=\"540\" w:gutter=\"0\"/></w:sectPr>");
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>" + body + "</w:body></w:document>";
    }

    private static String stylesXml(BrandDesignProfile brand) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:styles xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                + style("Normal", "Normal", brand.bodyFont(), brand.primaryTextRgb(), 11, false, 0, 120, 276, false, true)
                + style("Title", "Title", brand.headingFont(), brand.primaryTextRgb(), 34, true, 0, 240, 340, true, false)
                + style("Subtitle", "Subtitle", brand.bodyFont(), brand.mutedTextRgb(), 15, false, 0, 180, 300, false, true)
                + style("SectionTitle", "Section Title", brand.headingFont(), brand.primaryTextRgb(), 27, true, 0, 220, 330, true, false)
                + style("Heading1", "Heading 1", brand.headingFont(), brand.primaryTextRgb(), 20, true, 160, 100, 300, true, false)
                + style("Lead", "Lead", brand.bodyFont(), brand.primaryTextRgb(), 14, false, 0, 180, 310, false, true)
                + style("BodyText", "Body Text", brand.bodyFont(), brand.primaryTextRgb(), 11, false, 0, 120, 276, false, true)
                + style("Sidebar", "Sidebar", brand.bodyFont(), brand.mutedTextRgb(), 10, false, 80, 120, 260, false, true)
                + style("Quote", "Quote", brand.headingFont(), brand.accentRgb(), 17, false, 220, 220, 310, false, true)
                + style("Caption", "Caption", brand.bodyFont(), brand.mutedTextRgb(), 9, false, 80, 100, 240, false, true)
                + style("Reference", "Reference", brand.bodyFont(), brand.primaryTextRgb(), 9, false, 0, 80, 240, false, true)
                + "</w:styles>";
    }

    private static String style(String id, String name, String font, String color, int pt, boolean bold, int before, int after, int line, boolean keepNext, boolean widow) {
        return "<w:style w:type=\"paragraph\"" + (id.equals("Normal") ? " w:default=\"1\"" : "") + " w:styleId=\"" + escape(id) + "\">"
                + "<w:name w:val=\"" + escape(name) + "\"/>"
                + "<w:pPr><w:spacing w:before=\"" + before + "\" w:after=\"" + after + "\" w:line=\"" + line + "\" w:lineRule=\"auto\"/>"
                + (keepNext ? "<w:keepNext/><w:keepLines/>" : "") + (widow ? "<w:widowControl/>" : "") + "</w:pPr>"
                + "<w:rPr><w:rFonts w:ascii=\"" + escape(font) + "\" w:hAnsi=\"" + escape(font) + "\"/><w:color w:val=\"" + color + "\"/><w:sz w:val=\"" + (pt * 2) + "\"/><w:szCs w:val=\"" + (pt * 2) + "\"/>"
                + (bold ? "<w:b/>" : "") + "</w:rPr></w:style>";
    }

    private static String paragraph(String style, String text, boolean pageBreakBefore) {
        return "<w:p><w:pPr><w:pStyle w:val=\"" + escape(style) + "\"/>" + (pageBreakBefore ? "<w:pageBreakBefore/>" : "") + "</w:pPr><w:r><w:t xml:space=\"preserve\">" + escape(text) + "</w:t></w:r></w:p>";
    }
    private static String pageBreak() { return "<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>"; }
    private static String simpleTable(List<String> blocks) {
        if (blocks.isEmpty()) return paragraph("BodyText", "No table data supplied.", false);
        StringBuilder rows = new StringBuilder();
        for (String block : blocks) {
            rows.append("<w:tr><w:tc><w:tcPr><w:tcW w:w=\"10000\" w:type=\"dxa\"/></w:tcPr>")
                    .append(paragraph("BodyText", block, false)).append("</w:tc></w:tr>");
        }
        return "<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\" w:color=\"D9D9D9\"/><w:left w:val=\"nil\"/><w:bottom w:val=\"single\" w:sz=\"4\" w:color=\"D9D9D9\"/><w:right w:val=\"nil\"/><w:insideH w:val=\"single\" w:sz=\"2\" w:color=\"EDEDED\"/><w:insideV w:val=\"nil\"/></w:tblBorders></w:tblPr>" + rows + "</w:tbl>";
    }

    private static int clampTwips(long value) { return (int) Math.max(720, Math.min(1800, value)); }
    private static String contentTypes() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/><Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/><Override PartName=\"/docProps/core.xml\" ContentType=\"application/vnd.openxmlformats-package.core-properties+xml\"/></Types>"; }
    private static String rootRels() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>"; }
    private static String documentRels() { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdStyles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>"; }
    private static String core(String title) { return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><cp:coreProperties xmlns:cp=\"http://schemas.openxmlformats.org/package/2006/metadata/core-properties\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:title>" + escape(title) + "</dc:title></cp:coreProperties>"; }
    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String escape(String value) { return (value == null ? "" : value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;"); }
}
