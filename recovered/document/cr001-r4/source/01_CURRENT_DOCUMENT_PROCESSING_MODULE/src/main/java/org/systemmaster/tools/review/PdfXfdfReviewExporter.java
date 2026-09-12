package org.systemmaster.tools.review;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Local XFDF sidecar exporter for PDF review events. Does not pretend to be embedded PDF mutation. */
public final class PdfXfdfReviewExporter {
    public record Export(byte[] xfdfBytes, List<String> diagnostics) {
        public Export { xfdfBytes = xfdfBytes.clone(); diagnostics = List.copyOf(diagnostics); }
        @Override public byte[] xfdfBytes() { return xfdfBytes.clone(); }
    }

    public Export export(DocumentReviewGraph graph, String pdfFileName) {
        Objects.requireNonNull(graph, "graph");
        if (graph.format() != org.systemmaster.tools.document.DocumentFormat.PDF) throw new IllegalArgumentException("XFDF review export requires PDF graph");
        String name = requireText(pdfFileName, "pdf file name", 1024);
        StringBuilder x = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?><xfdf xmlns=\"http://ns.adobe.com/xfdf/\" xml:space=\"preserve\"><f href=\"")
                .append(xml(name)).append("\"/><annots>");
        ArrayList<String> diagnostics = new ArrayList<>();
        int exported = 0;
        for (ReviewChange c : graph.changes()) {
            int page = pageNumber(c.anchor().locator());
            if (page < 0) { diagnostics.add("UNMAPPED_PDF_ANCHOR:" + c.changeId()); continue; }
            String contents = c.type() + ": " + (c.afterText().isBlank() ? c.beforeText() : c.afterText());
            x.append("<text page=\"").append(page).append("\" rect=\"36,36,72,72\" title=\"").append(xml(c.author()))
                    .append("\" subject=\"System Master Review\" name=\"").append(xml(c.changeId())).append("\" color=\"#FFD54F\"><contents>")
                    .append(xml(contents)).append("</contents></text>");
            exported++;
        }
        x.append("</annots></xfdf>");
        diagnostics.add("XFDF_SIDECAR_NOT_EMBEDDED_PDF_ANNOTATION");
        diagnostics.add("EXPORTED_ANNOTATIONS:" + exported);
        return new Export(x.toString().getBytes(StandardCharsets.UTF_8), diagnostics);
    }

    private static int pageNumber(String locator) {
        if (locator != null && locator.matches("page:[1-9][0-9]*")) return Integer.parseInt(locator.substring(5)) - 1;
        return -1;
    }
    private static String requireText(String v,String n,int max){if(v==null||v.isBlank()||v.length()>max)throw new IllegalArgumentException(n+" required");return v;}
    private static String xml(String s){return Objects.requireNonNullElse(s,"").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");}
}
