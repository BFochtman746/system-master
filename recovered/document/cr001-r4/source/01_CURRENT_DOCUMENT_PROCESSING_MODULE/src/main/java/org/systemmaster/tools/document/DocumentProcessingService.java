package org.systemmaster.tools.document;

import org.systemmaster.tools.docx.*;
import org.systemmaster.tools.pdf.*;
import org.systemmaster.tools.pptx.*;
import java.io.IOException;
import java.security.*;
import java.util.*;

/** Headless multi-format document/presentation facade. It owns human content semantics, not app-level storage or external effects. */
public final class DocumentProcessingService {
    public record Inspection(DocumentFormat format, String sha256, Map<String,String> facts, List<String> diagnostics) {}
    public record Conversion(DocumentFormat sourceFormat, DocumentFormat targetFormat, byte[] bytes,
                             String sourceSha256, String resultSha256, String fidelity, List<String> lossLedger) {
        public Conversion { bytes = bytes.clone(); lossLedger = List.copyOf(lossLedger); }
    }
    public record Edit(DocumentFormat format, byte[] bytes, int replacements, String sourceSha256, String resultSha256) {
        public Edit { bytes = bytes.clone(); }
    }

    private final DocxPackageEngine docx = new DocxPackageEngine();
    private final DocxFullLaneEngine docxFull = new DocxFullLaneEngine();
    private final PdfStructuralEngine pdf = new PdfStructuralEngine();
    private final PptxPackageEngine pptx = new PptxPackageEngine();
    private final PptxFullLaneEngine pptxFull = new PptxFullLaneEngine();
    private final TextDocumentEngine text = new TextDocumentEngine();
    private final DocumentFormatDetector formats = new DocumentFormatDetector();
    private final CanonicalDocumentGraphProjector graphProjector = new CanonicalDocumentGraphProjector();
    private final CanonicalDocumentGraphV2Projector graphProjectorV2 = new CanonicalDocumentGraphV2Projector();
    private final NativePartPreservationMap preservationMap = new NativePartPreservationMap();
    private final DocumentFinalizationGate finalizationGate = new DocumentFinalizationGate();

    public DocumentFormat detect(byte[] bytes, String fileNameHint, String declaredMediaType) {
        return formats.detect(bytes, fileNameHint, declaredMediaType);
    }

    public CanonicalDocumentGraph projectCanonicalGraph(DocumentFormat format, byte[] bytes) throws IOException {
        return graphProjector.project(format, bytes);
    }

    public CanonicalDocumentGraphV2 projectCanonicalGraphV2(DocumentFormat format, byte[] bytes) throws IOException {
        return graphProjectorV2.project(format, bytes);
    }

    public NativePartPreservationMap.Assessment assessNativePreservation(
            DocumentFormat format, byte[] source, byte[] result, Set<String> expectedChangedNativeParts) throws IOException {
        return preservationMap.assess(format, source, result, expectedChangedNativeParts);
    }

    public DocumentFinalizationGate.Result evaluateFinalCandidate(
            DocumentOperationContract operation,
            byte[] candidateArtifact,
            NativePartPreservationMap.Assessment preservation,
            List<DocumentProofReceipt> receipts,
            String mutationEngine) {
        return finalizationGate.evaluate(operation, candidateArtifact, preservation, receipts, mutationEngine);
    }

    public Inspection inspect(DocumentFormat format, byte[] bytes) throws IOException {
        Objects.requireNonNull(format, "format"); Objects.requireNonNull(bytes, "bytes");
        LinkedHashMap<String,String> facts = new LinkedHashMap<>();
        ArrayList<String> diagnostics = new ArrayList<>();
        switch (format) {
            case DOCX, DOCM -> {
                var basic = docx.inspect(bytes);
                var inv = docxFull.inventory(bytes);
                facts.put("paragraphs", Integer.toString(inv.paragraphs()));
                facts.put("tables", Integer.toString(inv.tables()));
                facts.put("headings", Integer.toString(inv.headings()));
                facts.put("semanticDigest", basic.semanticDigest());
                facts.put("macros", Boolean.toString(inv.macros()));
                facts.put("signatures", Boolean.toString(inv.signatures()));
                if (basic.activeContent().macroProject()) diagnostics.add("ACTIVE_CONTENT:MACRO_PROJECT");
                if (basic.activeContent().embeddedObjects()) diagnostics.add("ACTIVE_CONTENT:EMBEDDED_OBJECTS");
                if (basic.activeContent().activeX()) diagnostics.add("ACTIVE_CONTENT:ACTIVEX");
                if (basic.activeContent().externalRelationships()) diagnostics.add("ACTIVE_CONTENT:EXTERNAL_RELATIONSHIP");
            }
            case PDF -> {
                var i = pdf.inspect(bytes);
                facts.put("version", i.version());
                facts.put("pages", Integer.toString(i.pages()));
                facts.put("indirectObjects", Integer.toString(i.indirectObjects()));
                facts.put("features", String.join(",", i.features()));
                diagnostics.addAll(pdf.diagnose(bytes));
            }
            case PPTX, PPTM -> {
                var i = pptx.inspect(bytes);
                facts.put("slides", Integer.toString(i.slides().size()));
                facts.put("notes", Integer.toString(i.notes().size()));
                facts.put("hyperlinks", Integer.toString(i.hyperlinks().size()));
                facts.put("mediaParts", Integer.toString(i.mediaParts().size()));
                facts.put("activeContentParts", Integer.toString(i.activeContent().size()));
                facts.put("externalTargets", Integer.toString(i.externalTargets().size()));
                diagnostics.addAll(pptxFull.diagnose(bytes));
            }
            case MARKDOWN, PLAIN_TEXT, HTML, RTF -> {
                var i = text.inspect(format, bytes);
                facts.put("characters", Integer.toString(i.characters()));
                facts.put("lines", Integer.toString(i.lines()));
                facts.put("nonBlankLines", Integer.toString(i.nonBlankLines()));
                facts.put("headings", Integer.toString(i.headings()));
                facts.put("links", Integer.toString(i.links()));
                diagnostics.addAll(i.diagnostics());
            }
            case ODT, EPUB, LEGACY_DOC, LEGACY_PPT, ODP, PPSX, POTX -> diagnostics.add("RECOGNIZED_FORMAT_ENGINE_PENDING");
            case UNKNOWN -> diagnostics.add("UNKNOWN_DOCUMENT_FORMAT");
        }
        return new Inspection(format, sha256(bytes), Map.copyOf(facts), List.copyOf(diagnostics));
    }

    public String extractPlainText(DocumentFormat format, byte[] bytes) throws IOException {
        return switch (format) {
            case DOCX, DOCM -> String.join("\n\n", docx.inspect(bytes).paragraphs());
            case PDF -> String.join("\n", pdf.inspect(bytes).literalText());
            case PPTX, PPTM -> presentationText(pptx.inspect(bytes));
            case MARKDOWN, PLAIN_TEXT, HTML, RTF -> text.toPlainText(format, bytes);
            case ODT, EPUB, LEGACY_DOC, LEGACY_PPT, ODP, PPSX, POTX -> throw new UnsupportedOperationException("recognized format requires qualified engine: " + format);
            case UNKNOWN -> throw new IllegalArgumentException("unknown document format");
        };
    }

    byte[] create(DocumentFormat target, String plainText) throws IOException {
        String textValue = Objects.requireNonNullElse(plainText, "");
        List<String> paragraphs = splitParagraphs(textValue);
        return switch (target) {
            case DOCX -> docxFull.createDocument(paragraphs);
            case PDF -> pdf.createTextPdf(textValue.lines().toList());
            case PPTX -> pptxFull.createPresentation("Generated presentation", slidesFromText(textValue));
            case MARKDOWN, PLAIN_TEXT, HTML, RTF -> text.fromPlainText(target, textValue);
            case DOCM -> throw new UnsupportedOperationException("macro-enabled document creation is not automatic");
            case PPTM -> throw new UnsupportedOperationException("macro-enabled presentation creation is not automatic");
            case ODT, EPUB, LEGACY_DOC, LEGACY_PPT, ODP, PPSX, POTX -> throw new UnsupportedOperationException("qualified output engine pending: " + target);
            case UNKNOWN -> throw new IllegalArgumentException("unknown target format");
        };
    }

    /** Semantic conversion through canonical plain text. This intentionally does not claim layout fidelity. */
    Conversion convert(DocumentFormat sourceFormat, DocumentFormat targetFormat, byte[] source) throws IOException {
        if (sourceFormat == targetFormat) return new Conversion(sourceFormat, targetFormat, source.clone(), sha256(source), sha256(source), "IDENTITY", List.of());
        String plain = extractPlainText(sourceFormat, source);
        byte[] out = create(targetFormat, plain);
        ArrayList<String> losses = new ArrayList<>();
        if (!sourceFormat.textFamily() || !targetFormat.textFamily()) losses.add("LAYOUT_AND_FORMATTING_NOT_GUARANTEED");
        if (sourceFormat == DocumentFormat.PDF) losses.add("PDF_PORTABLE_EXTRACTION_IS_LITERAL_TEXT_FALLBACK");
        if (sourceFormat == DocumentFormat.HTML) losses.add("HTML_SCRIPTS_STYLES_AND_NON_TEXT_STRUCTURE_REMOVED");
        if (sourceFormat == DocumentFormat.RTF) losses.add("RTF_ADVANCED_LAYOUT_CONTROL_WORDS_NOT_PRESERVED");
        if (sourceFormat.presentationFamily() || targetFormat.presentationFamily()) losses.add("PRESENTATION_THEME_LAYOUT_MEDIA_AND_ANIMATION_NOT_GUARANTEED_IN_SEMANTIC_CONVERSION");
        return new Conversion(sourceFormat, targetFormat, out, sha256(source), sha256(out), "SEMANTIC_TEXT_DERIVATIVE", List.copyOf(losses));
    }

    Edit replaceText(DocumentFormat format, byte[] source, String search, String replacement) throws IOException {
        Objects.requireNonNull(format); Objects.requireNonNull(source);
        if (format == DocumentFormat.DOCX || format == DocumentFormat.DOCM) {
            var m = docx.replaceText(source, search, replacement);
            return new Edit(format, m.bytes(), m.replacements(), sha256(source), sha256(m.bytes()));
        }
        if (format == DocumentFormat.PPTX || format == DocumentFormat.PPTM) {
            byte[] out = pptxFull.replaceText(source, search, replacement);
            return new Edit(format, out, 1, sha256(source), sha256(out));
        }
        if (format.textFamily()) {
            var m = text.replaceText(format, source, search, replacement);
            return new Edit(format, m.bytes(), m.replacements(), m.sourceSha256(), m.resultSha256());
        }
        if (format == DocumentFormat.PDF) throw new UnsupportedOperationException("PDF direct text replacement is unsafe; create a governed derivative with a qualified PDF editor");
        throw new UnsupportedOperationException("editing engine pending for " + format);
    }

    private static String presentationText(PptxPackageEngine.Inspection inspection) {
        StringBuilder out = new StringBuilder();
        for (var slide : inspection.slides()) {
            if (!out.isEmpty()) out.append("\n\n");
            out.append("Slide ").append(slide.index()).append("\n");
            for (String t : slide.texts()) out.append(t).append('\n');
        }
        if (!inspection.notes().isEmpty()) {
            out.append("\nSpeaker notes\n");
            for (String note : inspection.notes()) out.append(note).append('\n');
        }
        return out.toString().strip();
    }

    private static List<PptxFullLaneEngine.SlideSpec> slidesFromText(String text) {
        List<String> blocks = splitParagraphs(text);
        ArrayList<PptxFullLaneEngine.SlideSpec> slides = new ArrayList<>();
        int sequence = 1;
        for (String block : blocks) {
            List<String> lines = block.lines().map(String::trim).filter(s -> !s.isEmpty()).toList();
            if (lines.isEmpty()) continue;
            String title = lines.getFirst();
            List<String> bullets = lines.size() > 1 ? lines.subList(1, lines.size()) : List.of();
            slides.add(new PptxFullLaneEngine.SlideSpec(title, bullets, null));
            sequence++;
        }
        if (slides.isEmpty()) slides.add(new PptxFullLaneEngine.SlideSpec("Untitled", List.of(), null));
        return List.copyOf(slides);
    }

    private static List<String> splitParagraphs(String text) {
        String normalized = text.replace("\r\n", "\n").replace('\r', '\n');
        if (normalized.isEmpty()) return List.of("");
        return Arrays.asList(normalized.split("\n\s*\n", -1));
    }

    private static String sha256(byte[] b) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
