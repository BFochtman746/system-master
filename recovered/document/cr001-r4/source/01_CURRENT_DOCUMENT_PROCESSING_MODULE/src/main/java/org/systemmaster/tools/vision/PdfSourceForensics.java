package org.systemmaster.tools.vision;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.systemmaster.tools.pdf.PdfStructuralEngine;

/**
 * Conservative first-pass PDF source forensics. This class intentionally abstains when
 * compressed/encoded content prevents reliable byte-level classification.
 */
public final class PdfSourceForensics {
    public enum ContentClass {
        NATIVE_TEXT_LIKELY,
        IMAGE_ONLY_SCAN_LIKELY,
        MIXED_NATIVE_AND_RASTER,
        UNKNOWN_REQUIRES_DEEP_RENDER_ANALYSIS
    }

    public record Result(
            String sha256,
            int pageObjects,
            int imageXObjects,
            int visibleTextOperatorHints,
            int literalTextHints,
            boolean objectStreamsPresent,
            boolean encryptionPresent,
            boolean activeContentPresent,
            ContentClass contentClass,
            boolean deepRenderAnalysisRequired,
            List<String> diagnostics) {
        public Result {
            sha256 = Objects.requireNonNull(sha256, "sha256");
            if (pageObjects < 0 || imageXObjects < 0 || visibleTextOperatorHints < 0 || literalTextHints < 0) {
                throw new IllegalArgumentException("forensic counts must be non-negative");
            }
            contentClass = Objects.requireNonNull(contentClass, "contentClass");
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
        }
    }

    private static final Pattern IMAGE = Pattern.compile("/Subtype\\s*/Image\\b");
    private static final Pattern TEXT_OPERATOR = Pattern.compile("(?s)(?:\\)|\\])\\s*(?:Tj|TJ)\\b");

    private final PdfStructuralEngine structural = new PdfStructuralEngine();

    public Result inspect(byte[] pdfBytes) {
        Objects.requireNonNull(pdfBytes, "pdfBytes");
        PdfStructuralEngine.Inspection base = structural.inspect(pdfBytes);
        String raw = new String(pdfBytes, StandardCharsets.ISO_8859_1);
        int images = count(IMAGE, raw);
        int textOperators = count(TEXT_OPERATOR, raw);
        int literalHints = base.literalText().size();
        boolean objectStreams = base.features().contains("ObjStm") || base.features().contains("XRef");
        boolean encrypted = base.features().contains("Encrypt");
        boolean active = !base.activeContent().isEmpty();
        ArrayList<String> diagnostics = new ArrayList<>();

        ContentClass contentClass;
        boolean deep;
        if (encrypted) {
            contentClass = ContentClass.UNKNOWN_REQUIRES_DEEP_RENDER_ANALYSIS;
            deep = true;
            diagnostics.add("ENCRYPTED_CONTENT_REQUIRES_AUTHORIZED_DECRYPTION");
        } else if (objectStreams) {
            contentClass = ContentClass.UNKNOWN_REQUIRES_DEEP_RENDER_ANALYSIS;
            deep = true;
            diagnostics.add("COMPRESSED_OBJECT_STREAMS_REQUIRE_DEEP_PARSER_OR_RENDERER");
        } else {
            boolean textEvidence = textOperators > 0 || literalHints > 0;
            boolean imageEvidence = images > 0;
            if (textEvidence && imageEvidence) {
                contentClass = ContentClass.MIXED_NATIVE_AND_RASTER;
                deep = true;
                diagnostics.add("MIXED_CONTENT_MAY_INCLUDE_EXISTING_OCR_LAYER");
            } else if (textEvidence) {
                contentClass = ContentClass.NATIVE_TEXT_LIKELY;
                deep = false;
            } else if (imageEvidence) {
                contentClass = ContentClass.IMAGE_ONLY_SCAN_LIKELY;
                deep = true;
                diagnostics.add("IMAGE_ONLY_LIKELY_ROUTE_TO_DOCUMENT_VISION");
            } else {
                contentClass = ContentClass.UNKNOWN_REQUIRES_DEEP_RENDER_ANALYSIS;
                deep = true;
                diagnostics.add("NO_RELIABLE_TEXT_OR_IMAGE_HINTS");
            }
        }

        if (active) diagnostics.add("ACTIVE_CONTENT_PRESENT");
        if (!base.eofPresent()) diagnostics.add("MISSING_EOF");
        if (!base.startXrefPresent()) diagnostics.add("MISSING_STARTXREF");

        return new Result(
                base.sha256(),
                base.pages(),
                images,
                textOperators,
                literalHints,
                objectStreams,
                encrypted,
                active,
                contentClass,
                deep,
                diagnostics);
    }

    private static int count(Pattern pattern, String source) {
        int result = 0;
        Matcher matcher = pattern.matcher(source);
        while (matcher.find()) result++;
        return result;
    }
}
