package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.docx.DocxPackageEngine;
import org.systemmaster.tools.pdf.PdfStructuralEngine;
import org.systemmaster.tools.pptx.PptxPackageEngine;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Projects supported native formats into CDG-1 while retaining a native-part preservation ledger. */
public final class CanonicalDocumentGraphProjector {
    private final DocxPackageEngine docx = new DocxPackageEngine();
    private final PdfStructuralEngine pdf = new PdfStructuralEngine();
    private final PptxPackageEngine pptx = new PptxPackageEngine();
    private final TextDocumentEngine text = new TextDocumentEngine();

    public CanonicalDocumentGraph project(DocumentFormat format, byte[] bytes) throws IOException {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(bytes, "bytes");
        if (!format.portableFoundation()) throw new UnsupportedOperationException("CDG projection engine pending for " + format);
        String sourceSha = CanonicalDocumentGraph.sha256(bytes);
        List<CanonicalDocumentGraph.Node> nodes = new ArrayList<>();
        String rootId = CanonicalDocumentGraph.stableNodeId(sourceSha, "ROOT", "root");
        nodes.add(new CanonicalDocumentGraph.Node(rootId, CanonicalDocumentGraph.NodeType.ROOT, null, 0, "", Map.of("format", format.name()), new CanonicalDocumentGraph.SourceAnchor("<artifact>", "root")));

        CanonicalDocumentGraph.Kind kind;
        switch (format) {
            case DOCX, DOCM -> {
                kind = CanonicalDocumentGraph.Kind.FLOW_DOCUMENT;
                var inspection = docx.inspect(bytes);
                for (int i = 0; i < inspection.paragraphs().size(); i++) {
                    String locator = "paragraph:" + (i + 1);
                    nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.PARAGRAPH, rootId, i, inspection.paragraphs().get(i), "word/document.xml", locator, Map.of()));
                }
            }
            case PPTX, PPTM -> {
                kind = CanonicalDocumentGraph.Kind.PRESENTATION;
                var inspection = pptx.inspect(bytes);
                for (var slide : inspection.slides()) {
                    String slideLocator = "slide:" + slide.index();
                    String slideId = CanonicalDocumentGraph.stableNodeId(sourceSha, "SLIDE", slideLocator);
                    nodes.add(new CanonicalDocumentGraph.Node(slideId, CanonicalDocumentGraph.NodeType.SLIDE, rootId, slide.index() - 1, "", Map.of("relationshipCount", Integer.toString(slide.relationshipCount())), new CanonicalDocumentGraph.SourceAnchor(slide.partName(), slideLocator)));
                    for (int j = 0; j < slide.texts().size(); j++) {
                        String locator = slideLocator + "/text:" + (j + 1);
                        nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.SLIDE_TEXT, slideId, j, slide.texts().get(j), slide.partName(), locator, Map.of()));
                    }
                }
                for (int i = 0; i < inspection.notes().size(); i++) {
                    String locator = "speaker-note:" + (i + 1);
                    nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.SPEAKER_NOTE, rootId, i, inspection.notes().get(i), "ppt/notesSlides", locator, Map.of()));
                }
            }
            case PDF -> {
                kind = CanonicalDocumentGraph.Kind.FIXED_LAYOUT;
                var inspection = pdf.inspect(bytes);
                for (int page = 1; page <= inspection.pages(); page++) {
                    String locator = "page:" + page;
                    nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.PAGE, rootId, page - 1, "", "<artifact>", locator, Map.of()));
                }
                for (int i = 0; i < inspection.literalText().size(); i++) {
                    String locator = "literal-text:" + (i + 1);
                    nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.TEXT_BLOCK, rootId, i, inspection.literalText().get(i), "<artifact>", locator, Map.of("projection", "portable-literal-text")));
                }
            }
            case MARKDOWN, PLAIN_TEXT, HTML, RTF -> {
                kind = CanonicalDocumentGraph.Kind.TEXT_DOCUMENT;
                String plain = text.toPlainText(format, bytes);
                List<String> blocks = semanticBlocks(plain);
                for (int i = 0; i < blocks.size(); i++) {
                    String locator = "text-block:" + (i + 1);
                    nodes.add(node(sourceSha, CanonicalDocumentGraph.NodeType.TEXT_BLOCK, rootId, i, blocks.get(i), "<artifact>", locator, Map.of()));
                }
            }
            default -> throw new UnsupportedOperationException("CDG projection engine pending for " + format);
        }

        return new CanonicalDocumentGraph(CanonicalDocumentGraph.SCHEMA_V1, format, sourceSha, kind, nodes, nativeParts(format, bytes));
    }

    private static CanonicalDocumentGraph.Node node(String sourceSha, CanonicalDocumentGraph.NodeType type, String parentId, int ordinal, String text, String part, String locator, Map<String,String> attributes) {
        return new CanonicalDocumentGraph.Node(CanonicalDocumentGraph.stableNodeId(sourceSha, type.name(), locator), type, parentId, ordinal, text, attributes, new CanonicalDocumentGraph.SourceAnchor(part, locator));
    }

    private static List<CanonicalDocumentGraph.NativePart> nativeParts(DocumentFormat format, byte[] bytes) throws IOException {
        if (format == DocumentFormat.DOCX || format == DocumentFormat.DOCM || format == DocumentFormat.PPTX || format == DocumentFormat.PPTM) {
            Map<String,byte[]> parts = OoxmlPackageSupport.read(bytes);
            List<CanonicalDocumentGraph.NativePart> out = new ArrayList<>();
            parts.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> out.add(new CanonicalDocumentGraph.NativePart(e.getKey(), OoxmlPackageSupport.sha256(e.getValue()), true)));
            return List.copyOf(out);
        }
        return List.of(new CanonicalDocumentGraph.NativePart("<artifact>", CanonicalDocumentGraph.sha256(bytes), true));
    }

    private static List<String> semanticBlocks(String text) {
        if (text == null || text.isBlank()) return List.of("");
        String normalized = text.replace("\r\n", "\n").replace('\r', '\n');
        List<String> out = new ArrayList<>();
        for (String block : normalized.split("\\n\\s*\\n", -1)) if (!block.isBlank()) out.add(block.strip());
        if (out.isEmpty()) out.add(normalized.strip());
        return List.copyOf(out);
    }
}
