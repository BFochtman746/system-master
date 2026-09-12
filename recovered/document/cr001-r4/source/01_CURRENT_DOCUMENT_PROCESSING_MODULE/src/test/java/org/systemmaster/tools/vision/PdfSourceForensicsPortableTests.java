package org.systemmaster.tools.vision;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.systemmaster.tools.pdf.PdfStructuralEngine;

public final class PdfSourceForensicsPortableTests {
    private static int n;

    public static void main(String[] args) {
        PdfSourceForensics forensics = new PdfSourceForensics();
        PdfStructuralEngine pdf = new PdfStructuralEngine();

        byte[] nativePdf = pdf.createTextPdf(List.of("Native digital text", "Second line"));
        var nativeResult = forensics.inspect(nativePdf);
        check(nativeResult.contentClass() == PdfSourceForensics.ContentClass.NATIVE_TEXT_LIKELY, "native text classified");
        check(!nativeResult.deepRenderAnalysisRequired(), "native simple PDF can avoid OCR/deep perception");
        check(nativeResult.literalTextHints() > 0, "native literal hints found");
        check(nativeResult.imageXObjects() == 0, "native test has no image objects");

        byte[] scanPdf = syntheticPdf("<< /Type /XObject /Subtype /Image /Width 10 /Height 10 >>");
        var scanResult = forensics.inspect(scanPdf);
        check(scanResult.contentClass() == PdfSourceForensics.ContentClass.IMAGE_ONLY_SCAN_LIKELY, "image scan classified");
        check(scanResult.deepRenderAnalysisRequired(), "scan routes to deep vision");
        check(scanResult.imageXObjects() == 1, "image object counted");
        check(scanResult.diagnostics().contains("IMAGE_ONLY_LIKELY_ROUTE_TO_DOCUMENT_VISION"), "scan diagnostic");

        byte[] mixedPdf = syntheticPdf("<< /Type /XObject /Subtype /Image /Width 10 /Height 10 >>\n(Existing OCR text) Tj");
        var mixed = forensics.inspect(mixedPdf);
        check(mixed.contentClass() == PdfSourceForensics.ContentClass.MIXED_NATIVE_AND_RASTER, "mixed classified");
        check(mixed.deepRenderAnalysisRequired(), "mixed deep analysis");
        check(mixed.diagnostics().contains("MIXED_CONTENT_MAY_INCLUDE_EXISTING_OCR_LAYER"), "mixed OCR warning");

        byte[] compressed = syntheticPdf("<< /Type /ObjStm /N 1 /First 0 >>");
        var compressedResult = forensics.inspect(compressed);
        check(compressedResult.contentClass() == PdfSourceForensics.ContentClass.UNKNOWN_REQUIRES_DEEP_RENDER_ANALYSIS, "object stream abstains");
        check(compressedResult.deepRenderAnalysisRequired(), "object stream deep analysis");
        check(compressedResult.diagnostics().contains("COMPRESSED_OBJECT_STREAMS_REQUIRE_DEEP_PARSER_OR_RENDERER"), "object stream diagnostic");

        byte[] active = syntheticPdf("<< /Type /Action /S /JavaScript /JS (alert) >>");
        var activeResult = forensics.inspect(active);
        check(activeResult.activeContentPresent(), "active content surfaced");
        check(activeResult.diagnostics().contains("ACTIVE_CONTENT_PRESENT"), "active diagnostic");

        System.out.println("PDF_SOURCE_FORENSICS_PORTABLE_PASS assertions=" + n);
    }

    private static byte[] syntheticPdf(String extra) {
        String source = "%PDF-1.7\n"
                + "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
                + "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
                + "3 0 obj << /Type /Page /Parent 2 0 R >> endobj\n"
                + "4 0 obj " + extra + " endobj\n"
                + "startxref\n0\n%%EOF\n";
        return source.getBytes(StandardCharsets.ISO_8859_1);
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
