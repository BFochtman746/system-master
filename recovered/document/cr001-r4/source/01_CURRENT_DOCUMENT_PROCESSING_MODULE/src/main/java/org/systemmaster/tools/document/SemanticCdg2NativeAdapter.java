package org.systemmaster.tools.document;

import org.systemmaster.tools.document.accessibility.AccessibilityNativeRemediator;
import org.systemmaster.tools.docx.DocxNativeMasteryEngine;
import org.systemmaster.tools.docx.DocxPageArchitectureEngine;
import org.systemmaster.tools.docx.DocxParagraphMechanicsEngine;
import org.systemmaster.tools.docx.DocxTableImageMasteryEngine;
import org.systemmaster.tools.docx.DocxDrawingChartMasteryEngine;
import org.systemmaster.tools.docx.DocxAdvancedSemanticMasteryEngine;
import org.systemmaster.tools.docx.DocxStructuredMetadataMasteryEngine;
import org.systemmaster.tools.docx.DocxReviewProtectionMasteryEngine;

import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * First semantic reverse adapter for the spine. It exposes only operations backed by first-class
 * deterministic format APIs; unsupported native features remain LOW_LEVEL/PENDING in the capability ledger.
 */
public final class SemanticCdg2NativeAdapter implements CanonicalDocumentGraphV2OperationAdapter {
    private final DocumentFormat format;
    private final DocumentProcessingService service;

    public SemanticCdg2NativeAdapter(DocumentFormat format) {
        this(format, new DocumentProcessingService());
    }

    SemanticCdg2NativeAdapter(DocumentFormat format, DocumentProcessingService service) {
        this.format = Objects.requireNonNull(format, "format");
        this.service = Objects.requireNonNull(service, "service");
    }

    @Override
    public DocumentFormat format() {
        return format;
    }

    @Override
    public MutationResult applyOperation(OperationMutationRequest request) throws IOException {
        Objects.requireNonNull(request, "request");
        if (request.sourceGraph().sourceFormat() != format) {
            throw new IllegalArgumentException("adapter/source format mismatch");
        }
        DocumentOperationContract operation = request.operation();
        byte[] source = request.sourceBytes();
        byte[] result;
        ArrayList<String> diagnostics = new ArrayList<>();

        if (operation.type() == DocumentOperationContract.Type.REPLACE_TEXT) {
            String search = operation.parameters().getOrDefault("search", "");
            String replacement = operation.parameters().getOrDefault("replacement", "");
            if (search.isEmpty()) {
                throw new IllegalArgumentException("replace operation requires non-empty search");
            }
            DocumentProcessingService.Edit edit = service.replaceText(format, source, search, replacement);
            if (edit.replacements() < 1 || edit.resultSha256().equals(edit.sourceSha256())) {
                throw new IllegalStateException("semantic replacement made no change");
            }
            result = edit.bytes();
            diagnostics.add("SEMANTIC_REPLACE_COUNT=" + edit.replacements());
        } else if (operation.type() == DocumentOperationContract.Type.ACCESSIBILITY_REPAIR) {
            AccessibilityNativeRemediator.Result repair = new AccessibilityNativeRemediator().apply(
                    format,
                    source,
                    request.sourceGraph(),
                    operation);
            result = repair.bytes();
            diagnostics.addAll(repair.diagnostics());
            diagnostics.add("A11Y_CHANGED_PARTS=" + String.join(";", repair.changedParts()));
        } else if (operation.type() == DocumentOperationContract.Type.CONVERT && format == DocumentFormat.PDF) {
            String rebuildText = operation.parameters().getOrDefault("rebuildText", "");
            if (rebuildText.isBlank()) {
                throw new IllegalArgumentException("PDF rebuild requires rebuildText");
            }
            result = service.create(DocumentFormat.PDF, rebuildText);
            diagnostics.add("PDF_REBUILD_FROM_CANONICAL_TEXT");
        } else if ((format == DocumentFormat.DOCX || format == DocumentFormat.DOCM)
                && (operation.type() == DocumentOperationContract.Type.FORMAT || operation.type() == DocumentOperationContract.Type.INSERT_CONTENT)) {
            result = applyDocxMastery(source, request.sourceGraph(), request.targetedElementIds(), operation, diagnostics);
        } else {
            throw new UnsupportedOperationException(
                    "semantic CDG-2 adapter does not implement " + format + " " + operation.type());
        }

        NativePartPreservationMap.Assessment assessment = new NativePartPreservationMap().assess(
                format,
                source,
                result,
                request.expectedChangedNativeParts());
        List<String> changedParts = assessment.parts().stream()
                .filter(delta -> delta.change() != NativePartPreservationMap.Change.PRESERVED)
                .map(NativePartPreservationMap.PartDelta::partName)
                .toList();
        diagnostics.addAll(assessment.diagnostics());
        diagnostics.add("OPERATION_INTENT_DIGEST=" + operation.intentDigest());
        return new MutationResult(
                result,
                CanonicalDocumentGraph.sha256(source),
                CanonicalDocumentGraph.sha256(result),
                changedParts,
                diagnostics);
    }

    private static byte[] applyDocxMastery(
            byte[] source,
            CanonicalDocumentGraphV2 graph,
            Set<String> targetIds,
            DocumentOperationContract operation,
            List<String> diagnostics) throws IOException {
        String action = operation.parameters().getOrDefault("docx.action", "").strip();
        if (action.isBlank()) {
            throw new IllegalArgumentException("DOCX semantic FORMAT/INSERT_CONTENT requires docx.action");
        }
        String targetId = targetIds.stream().sorted().findFirst().orElseThrow(() -> new IllegalArgumentException("DOCX mastery target required"));
        CanonicalDocumentGraphV2.Element target = graph.requireElement(targetId);
        DocxNativeMasteryEngine engine = new DocxNativeMasteryEngine();
        byte[] result = switch (action) {
            case "INSERT_RUN" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield engine.insertRun(source, target.nativeAnchor().locator(), new DocxNativeMasteryEngine.RunSpec(
                        operation.parameters().getOrDefault("text", ""),
                        runFormat(operation.parameters(), "run.")));
            }
            case "FORMAT_RUN" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.RUN, action);
                yield engine.formatRun(source, target.nativeAnchor().locator(), runFormat(operation.parameters(), "run."));
            }
            case "INSERT_PARAGRAPH" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield engine.insertParagraph(source, target.nativeAnchor().locator(), new DocxNativeMasteryEngine.ParagraphSpec(
                        paragraphFormat(operation.parameters(), "paragraph."),
                        List.of(new DocxNativeMasteryEngine.RunSpec(
                                operation.parameters().getOrDefault("text", ""),
                                runFormat(operation.parameters(), "run.")))));
            }
            case "FORMAT_PARAGRAPH" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield engine.formatParagraph(source, target.nativeAnchor().locator(), paragraphFormat(operation.parameters(), "paragraph."));
            }
            case "UPSERT_STYLE" -> engine.upsertStyle(source, new DocxNativeMasteryEngine.StyleSpec(
                    required(operation.parameters(), "style.id"),
                    operation.parameters().getOrDefault("style.type", "paragraph"),
                    operation.parameters().getOrDefault("style.name", ""),
                    operation.parameters().getOrDefault("style.basedOn", ""),
                    paragraphFormat(operation.parameters(), "style.paragraph."),
                    runFormat(operation.parameters(), "style.run.")));
            case "INSERT_SECTION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield engine.insertSectionBreak(source, target.nativeAnchor().locator(), sectionFormat(operation.parameters(), "section."));
            }
            case "FORMAT_SECTION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield engine.formatSection(source, target.nativeAnchor().locator(), sectionFormat(operation.parameters(), "section."));
            }
            case "FORMAT_PAGE_BORDERS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().formatPageBorders(source, target.nativeAnchor().locator(), pageBorders(operation.parameters()));
            }
            case "FORMAT_PAGE_BACKGROUND" -> {
                requireArtifactRootOrPageBackground(target, action);
                yield new DocxPageArchitectureEngine().formatPageBackground(source, pageBackground(operation.parameters()));
            }
            case "FORMAT_COLUMNS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().formatColumns(source, target.nativeAnchor().locator(), columnLayout(operation.parameters()));
            }
            case "FORMAT_LINE_NUMBERING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().formatLineNumbering(source, target.nativeAnchor().locator(), lineNumbering(operation.parameters()));
            }
            case "UPSERT_HEADER_FOOTER" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().upsertHeaderFooter(source, target.nativeAnchor().locator(), new DocxPageArchitectureEngine.HeaderFooterSpec(
                        required(operation.parameters(), "headerFooter.kind"),
                        operation.parameters().getOrDefault("headerFooter.variant", "default"),
                        operation.parameters().getOrDefault("headerFooter.text", "")));
            }
            case "FORMAT_PAGE_NUMBERING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().formatPageNumbering(source, target.nativeAnchor().locator(), pageNumbering(operation.parameters()));
            }
            case "INSERT_BREAK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxPageArchitectureEngine().insertBreak(source, target.nativeAnchor().locator(), new DocxPageArchitectureEngine.BreakSpec(required(operation.parameters(), "break.type")));
            }
            case "FORMAT_BREAK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.BREAK, action);
                yield new DocxPageArchitectureEngine().formatBreak(source, target.nativeAnchor().locator(), new DocxPageArchitectureEngine.BreakSpec(required(operation.parameters(), "break.type")));
            }
            case "INSERT_SECTION_BREAK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxPageArchitectureEngine().insertSectionBreak(source, target.nativeAnchor().locator(), new DocxPageArchitectureEngine.SectionBreakSpec(required(operation.parameters(), "sectionBreak.type")));
            }
            case "FORMAT_SECTION_BREAK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.SECTION, action);
                yield new DocxPageArchitectureEngine().formatSectionBreak(source, target.nativeAnchor().locator(), new DocxPageArchitectureEngine.SectionBreakSpec(required(operation.parameters(), "sectionBreak.type")));
            }
            case "FORMAT_TABS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatTabs(source, target.nativeAnchor().locator(), tabs(operation.parameters()));
            }
            case "FORMAT_INDENTS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatIndentation(source, target.nativeAnchor().locator(), indentation(operation.parameters()));
            }
            case "FORMAT_LINE_SPACING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatLineSpacing(source, target.nativeAnchor().locator(), lineSpacing(operation.parameters()));
            }
            case "FORMAT_PARAGRAPH_SPACING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatParagraphSpacing(source, target.nativeAnchor().locator(), paragraphSpacing(operation.parameters()));
            }
            case "FORMAT_PAGINATION_CONTROLS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatPaginationControls(source, target.nativeAnchor().locator(), paginationControls(operation.parameters()));
            }
            case "FORMAT_PARAGRAPH_BORDER_SHADING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().formatBorderShading(source, target.nativeAnchor().locator(), borderShading(operation.parameters()));
            }
            case "UPSERT_NUMBERING_DEFINITION" -> {
                requireArtifactRoot(target, action);
                yield new DocxParagraphMechanicsEngine().upsertNumberingDefinition(source, numberingDefinition(operation.parameters()));
            }
            case "ASSIGN_NUMBERING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().assignNumbering(source, target.nativeAnchor().locator(), new DocxParagraphMechanicsEngine.NumberingReference(
                        requiredInt(operation.parameters(), "numbering.numId"), requiredInt(operation.parameters(), "numbering.level")));
            }
            case "CLEAR_NUMBERING" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxParagraphMechanicsEngine().clearNumbering(source, target.nativeAnchor().locator());
            }
            case "INSERT_TABLE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxTableImageMasteryEngine().insertTable(source, target.nativeAnchor().locator(), tableSpec(operation.parameters()));
            }
            case "INSERT_NESTED_TABLE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE_CELL, action);
                yield new DocxTableImageMasteryEngine().insertNestedTable(source, target.nativeAnchor().locator(), tableSpec(operation.parameters()));
            }
            case "FORMAT_TABLE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE, action);
                yield new DocxTableImageMasteryEngine().formatTable(source, target.nativeAnchor().locator(), tableFormat(operation.parameters()));
            }
            case "MERGE_TABLE_CELLS_HORIZONTAL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE_ROW, action);
                yield new DocxTableImageMasteryEngine().mergeCellsHorizontal(source, target.nativeAnchor().locator(), requiredInt(operation.parameters(), "table.startCell"), requiredInt(operation.parameters(), "table.span"));
            }
            case "MERGE_TABLE_CELLS_VERTICAL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE, action);
                yield new DocxTableImageMasteryEngine().mergeCellsVertical(source, target.nativeAnchor().locator(), requiredInt(operation.parameters(), "table.column"), requiredInt(operation.parameters(), "table.startRow"), requiredInt(operation.parameters(), "table.rowSpan"));
            }
            case "SPLIT_TABLE_CELL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE_CELL, action);
                yield new DocxTableImageMasteryEngine().splitCell(source, target.nativeAnchor().locator(), requiredInt(operation.parameters(), "table.parts"));
            }
            case "FORMAT_TABLE_ROW" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE_ROW, action);
                yield new DocxTableImageMasteryEngine().formatRow(source, target.nativeAnchor().locator(), rowHeight(operation.parameters()), Boolean.TRUE.equals(boolOrNull(operation.parameters().get("table.repeatHeader"))));
            }
            case "FORMAT_TABLE_CELL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.TABLE_CELL, action);
                yield new DocxTableImageMasteryEngine().formatCell(source, target.nativeAnchor().locator(), cellMargins(operation.parameters(), "cell.margin."), operation.parameters().getOrDefault("cell.verticalAlignment", ""));
            }
            case "INSERT_INLINE_IMAGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxTableImageMasteryEngine().insertInlineImage(source, target.nativeAnchor().locator(), imageSpec(operation.parameters()));
            }
            case "INSERT_FLOATING_IMAGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxTableImageMasteryEngine().insertFloatingImage(source, target.nativeAnchor().locator(), imageSpec(operation.parameters()), floatingPlacement(operation.parameters()));
            }
            case "FORMAT_IMAGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.IMAGE, action);
                yield new DocxTableImageMasteryEngine().formatImage(source, target.nativeAnchor().locator(), imageFormat(operation.parameters()));
            }
            case "REPLACE_IMAGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.IMAGE, action);
                yield new DocxTableImageMasteryEngine().replaceImageBytes(source, target.nativeAnchor().locator(), java.util.Base64.getDecoder().decode(required(operation.parameters(), "image.base64")), required(operation.parameters(), "image.extension"));
            }
            case "STYLE_IMAGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.IMAGE, action);
                yield new DocxDrawingChartMasteryEngine().styleImage(source, target.nativeAnchor().locator(), drawingImageStyle(operation.parameters()));
            }
            case "INSERT_SVG" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertSvg(source, target.nativeAnchor().locator(), svgSpec(operation.parameters(), false));
            }
            case "INSERT_ICON" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertIcon(source, target.nativeAnchor().locator(), svgSpec(operation.parameters(), true));
            }
            case "REPLACE_SVG" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.IMAGE, action);
                yield new DocxDrawingChartMasteryEngine().replaceSvgBytes(source, target.nativeAnchor().locator(), java.util.Base64.getDecoder().decode(required(operation.parameters(), "svg.base64")), false);
            }
            case "REPLACE_ICON" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.IMAGE, action);
                yield new DocxDrawingChartMasteryEngine().replaceSvgBytes(source, target.nativeAnchor().locator(), java.util.Base64.getDecoder().decode(required(operation.parameters(), "svg.base64")), true);
            }
            case "INSERT_SHAPE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertShape(source, target.nativeAnchor().locator(), shapeSpec(operation.parameters(), "shape."));
            }
            case "INSERT_TEXT_BOX" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertTextBox(source, target.nativeAnchor().locator(), shapeSpec(operation.parameters(), "shape."));
            }
            case "INSERT_WORDART" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertWordArt(source, target.nativeAnchor().locator(), shapeSpec(operation.parameters(), "shape."));
            }
            case "EDIT_SHAPE" -> {
                if (target.type() != CanonicalDocumentGraphV2.ElementType.SHAPE && target.type() != CanonicalDocumentGraphV2.ElementType.TEXT_FRAME) {
                    throw new IllegalArgumentException(action + " requires SHAPE or TEXT_FRAME target");
                }
                yield new DocxDrawingChartMasteryEngine().editShape(source, target.nativeAnchor().locator(), shapeSpec(operation.parameters(), "shape."), target.type() == CanonicalDocumentGraphV2.ElementType.TEXT_FRAME);
            }
            case "INSERT_DRAWING_GROUP" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertGroup(source, target.nativeAnchor().locator(), groupSpec(operation.parameters()));
            }
            case "REPLACE_DRAWING_GROUP" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.DIAGRAM, action);
                yield new DocxDrawingChartMasteryEngine().replaceGroup(source, target.nativeAnchor().locator(), groupSpec(operation.parameters()));
            }
            case "INSERT_CHART" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxDrawingChartMasteryEngine().insertChart(source, target.nativeAnchor().locator(), chartSpec(operation.parameters()));
            }
            case "EDIT_CHART" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.CHART, action);
                yield new DocxDrawingChartMasteryEngine().editChart(source, target.nativeAnchor().locator(), chartSpec(operation.parameters()));
            }
            case "UPSERT_CHART_WORKBOOK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.CHART, action);
                yield new DocxAdvancedSemanticMasteryEngine().upsertChartWorkbook(source, target.nativeAnchor().locator(), chartWorkbook(operation.parameters()));
            }
            case "FORMAT_CHART_DECORATIONS" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.CHART, action);
                yield new DocxAdvancedSemanticMasteryEngine().formatChartDecorations(source, target.nativeAnchor().locator(), chartDecorations(operation.parameters()));
            }
            case "INSERT_SMARTART" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertSmartArt(source, target.nativeAnchor().locator(), smartArtSpec(operation.parameters()));
            }
            case "EDIT_SMARTART" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.DIAGRAM, action);
                yield new DocxAdvancedSemanticMasteryEngine().editSmartArt(source, target.nativeAnchor().locator(), smartArtSpec(operation.parameters()));
            }
            case "INSERT_EQUATION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertEquation(source, target.nativeAnchor().locator(), new DocxAdvancedSemanticMasteryEngine.EquationSpec(required(operation.parameters(), "equation.text")));
            }
            case "EDIT_EQUATION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.EQUATION, action);
                yield new DocxAdvancedSemanticMasteryEngine().editEquation(source, target.nativeAnchor().locator(), new DocxAdvancedSemanticMasteryEngine.EquationSpec(required(operation.parameters(), "equation.text")));
            }
            case "INSERT_HYPERLINK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertHyperlink(source, target.nativeAnchor().locator(), hyperlinkSpec(operation.parameters()));
            }
            case "EDIT_HYPERLINK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.HYPERLINK, action);
                yield new DocxAdvancedSemanticMasteryEngine().editHyperlink(source, target.nativeAnchor().locator(), hyperlinkSpec(operation.parameters()));
            }
            case "INSERT_BOOKMARK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertBookmark(source, target.nativeAnchor().locator(), required(operation.parameters(), "bookmark.name"));
            }
            case "EDIT_BOOKMARK" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.METADATA, action);
                yield new DocxAdvancedSemanticMasteryEngine().editBookmark(source, target.nativeAnchor().locator(), required(operation.parameters(), "bookmark.name"));
            }
            case "INSERT_CROSS_REFERENCE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertCrossReference(source, target.nativeAnchor().locator(), crossReferenceSpec(operation.parameters()));
            }
            case "EDIT_CROSS_REFERENCE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.FIELD, action);
                yield new DocxAdvancedSemanticMasteryEngine().editCrossReference(source, target.nativeAnchor().locator(), crossReferenceSpec(operation.parameters()));
            }
            case "INSERT_SIMPLE_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertSimpleField(source, target.nativeAnchor().locator(), fieldSpec(operation.parameters()));
            }
            case "EDIT_SIMPLE_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.FIELD, action);
                yield new DocxAdvancedSemanticMasteryEngine().editSimpleField(source, target.nativeAnchor().locator(), fieldSpec(operation.parameters()));
            }
            case "INSERT_COMPLEX_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertComplexField(source, target.nativeAnchor().locator(), fieldSpec(operation.parameters()));
            }
            case "EDIT_COMPLEX_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.FIELD, action);
                yield new DocxAdvancedSemanticMasteryEngine().editComplexField(source, target.nativeAnchor().locator(), fieldSpec(operation.parameters()));
            }
            case "INSERT_CAPTION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertCaption(source, target.nativeAnchor().locator(), captionSpec(operation.parameters()));
            }
            case "EDIT_CAPTION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().editCaption(source, target.nativeAnchor().locator(), captionSpec(operation.parameters()));
            }
            case "INSERT_FOOTNOTE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertFootnote(source, target.nativeAnchor().locator(), required(operation.parameters(), "note.text"));
            }
            case "EDIT_FOOTNOTE" -> {
                requireNativeType(target, CanonicalDocumentGraphV2.ElementType.FOOTNOTE, "word/footnotes.xml", action);
                yield new DocxAdvancedSemanticMasteryEngine().editFootnote(source, target.nativeAnchor().locator(), required(operation.parameters(), "note.text"));
            }
            case "INSERT_ENDNOTE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxAdvancedSemanticMasteryEngine().insertEndnote(source, target.nativeAnchor().locator(), required(operation.parameters(), "note.text"));
            }
            case "EDIT_ENDNOTE" -> {
                requireNativeType(target, CanonicalDocumentGraphV2.ElementType.ENDNOTE, "word/endnotes.xml", action);
                yield new DocxAdvancedSemanticMasteryEngine().editEndnote(source, target.nativeAnchor().locator(), required(operation.parameters(), "note.text"));
            }
            case "INSERT_CITATION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertCitation(source, target.nativeAnchor().locator(), citationSpec(operation.parameters()));
            }
            case "EDIT_CITATION" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.CITATION, "citation", action);
                yield new DocxStructuredMetadataMasteryEngine().editCitation(source, target.nativeAnchor().locator(), citationSpec(operation.parameters()));
            }
            case "UPSERT_BIBLIOGRAPHY_SOURCE" -> {
                requireArtifactRoot(target, action);
                yield new DocxStructuredMetadataMasteryEngine().upsertBibliographySource(source, bibliographySource(operation.parameters()));
            }
            case "INSERT_BIBLIOGRAPHY" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertBibliography(source, target.nativeAnchor().locator());
            }
            case "EDIT_BIBLIOGRAPHY" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.FIELD, "bibliography", action);
                yield new DocxStructuredMetadataMasteryEngine().editBibliography(source, target.nativeAnchor().locator(), operation.parameters().getOrDefault("bibliography.instruction", "BIBLIOGRAPHY"));
            }
            case "INSERT_GENERATED_TABLE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertGeneratedTable(source, target.nativeAnchor().locator(), generatedTableSpec(operation.parameters()));
            }
            case "EDIT_GENERATED_TABLE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.FIELD, action);
                yield new DocxStructuredMetadataMasteryEngine().editGeneratedTable(source, target.nativeAnchor().locator(), generatedTableSpec(operation.parameters()));
            }
            case "INSERT_CONTENT_CONTROL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertContentControl(source, target.nativeAnchor().locator(), contentControlSpec(operation.parameters()), false);
            }
            case "EDIT_CONTENT_CONTROL" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT, "content-control", action);
                yield new DocxStructuredMetadataMasteryEngine().editContentControl(source, target.nativeAnchor().locator(), contentControlSpec(operation.parameters()), false);
            }
            case "INSERT_REPEATING_CONTENT_CONTROL" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertContentControl(source, target.nativeAnchor().locator(), contentControlSpec(operation.parameters()), true);
            }
            case "EDIT_REPEATING_CONTENT_CONTROL" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT, "repeating-content-control", action);
                yield new DocxStructuredMetadataMasteryEngine().editContentControl(source, target.nativeAnchor().locator(), contentControlSpec(operation.parameters()), true);
            }
            case "CREATE_CUSTOM_XML_MAPPING" -> {
                requireArtifactRoot(target, action);
                yield new DocxStructuredMetadataMasteryEngine().createCustomXmlMapping(source, customXmlMappingSpec(operation.parameters()));
            }
            case "EDIT_CUSTOM_XML_MAPPING" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.METADATA, "custom-xml-mapping", action);
                yield new DocxStructuredMetadataMasteryEngine().editCustomXmlMapping(source, target.nativeAnchor().locator(), customXmlMappingSpec(operation.parameters()));
            }
            case "BIND_CONTENT_CONTROL" -> {
                requireContentControl(target, action);
                yield new DocxStructuredMetadataMasteryEngine().bindContentControl(source, target.nativeAnchor().locator(), customXmlMappingSpec(operation.parameters()));
            }
            case "INSERT_LEGACY_FORM_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxStructuredMetadataMasteryEngine().insertLegacyFormField(source, target.nativeAnchor().locator(), legacyFormSpec(operation.parameters()));
            }
            case "EDIT_LEGACY_FORM_FIELD" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.FIELD, "legacy-form-field", action);
                yield new DocxStructuredMetadataMasteryEngine().editLegacyFormField(source, target.nativeAnchor().locator(), legacyFormSpec(operation.parameters()));
            }
            case "UPSERT_DOCUMENT_PROPERTY" -> {
                requireArtifactRoot(target, action);
                yield new DocxStructuredMetadataMasteryEngine().upsertDocumentProperty(source, new DocxStructuredMetadataMasteryEngine.PropertyValue(required(operation.parameters(), "property.name"), operation.parameters().getOrDefault("property.value", "")));
            }
            case "UPSERT_CUSTOM_PROPERTY" -> {
                requireArtifactRoot(target, action);
                yield new DocxStructuredMetadataMasteryEngine().upsertCustomProperty(source, customProperty(operation.parameters()));
            }
            case "UPSERT_DOCUMENT_VARIABLE" -> {
                requireArtifactRoot(target, action);
                yield new DocxStructuredMetadataMasteryEngine().upsertDocumentVariable(source, new DocxStructuredMetadataMasteryEngine.DocumentVariable(required(operation.parameters(), "variable.name"), operation.parameters().getOrDefault("variable.value", "")));
            }
            case "INSERT_MAIL_MERGE_FIELD" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().insertMailMergeField(source, target.nativeAnchor().locator(), mailMergeSpec(operation.parameters()));
            }
            case "EDIT_MAIL_MERGE_FIELD" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.FIELD, "mail-merge-field", action);
                yield new DocxReviewProtectionMasteryEngine().editMailMergeField(source, target.nativeAnchor().locator(), mailMergeSpec(operation.parameters()));
            }
            case "INSERT_TRACKED_INSERTION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().insertTrackedInsertion(source, target.nativeAnchor().locator(), revisionSpec(operation.parameters(), DocxReviewProtectionMasteryEngine.RevisionKind.INSERTION));
            }
            case "INSERT_TRACKED_DELETION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().insertTrackedDeletion(source, target.nativeAnchor().locator(), revisionSpec(operation.parameters(), DocxReviewProtectionMasteryEngine.RevisionKind.DELETION));
            }
            case "CREATE_TRACKED_MOVE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().createTrackedMove(source, target.nativeAnchor().locator(), required(operation.parameters(), "revision.toParagraph"), revisionSpec(operation.parameters(), DocxReviewProtectionMasteryEngine.RevisionKind.MOVE_FROM));
            }
            case "APPLY_FORMATTING_REVISION" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().applyFormattingRevision(source, target.nativeAnchor().locator(), formattingRevisionSpec(operation.parameters()));
            }
            case "EDIT_REVISION" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.REVISION, "tracked-revision", action);
                yield new DocxReviewProtectionMasteryEngine().editRevision(source, target.nativeAnchor().locator(), revisionSpec(operation.parameters(), revisionKind(target.semantic().properties().get("kind"))));
            }
            case "ADD_CLASSIC_COMMENT" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().addClassicComment(source, target.nativeAnchor().locator(), commentSpec(operation.parameters()));
            }
            case "ADD_MODERN_COMMENT" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().addModernComment(source, target.nativeAnchor().locator(), commentSpec(operation.parameters()), Boolean.TRUE.equals(boolOrNull(operation.parameters().getOrDefault("comment.resolved", "false"))), mentionSpecOrNull(operation.parameters()));
            }
            case "ADD_MODERN_REPLY" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.COMMENT, "modern-comment", action);
                yield new DocxReviewProtectionMasteryEngine().addModernReply(source, Integer.parseInt(target.nativeAnchor().nativeObjectId()), commentSpec(operation.parameters()), Boolean.TRUE.equals(boolOrNull(operation.parameters().getOrDefault("comment.resolved", "false"))), mentionSpecOrNull(operation.parameters()));
            }
            case "EDIT_COMMENT" -> {
                if (target.type() != CanonicalDocumentGraphV2.ElementType.COMMENT) throw new IllegalArgumentException(action + " requires COMMENT target");
                yield new DocxReviewProtectionMasteryEngine().editComment(source, Integer.parseInt(target.nativeAnchor().nativeObjectId()), commentSpec(operation.parameters()), mentionSpecOrNull(operation.parameters()));
            }
            case "SET_COMMENT_RESOLVED" -> {
                requireSemanticType(target, CanonicalDocumentGraphV2.ElementType.COMMENT, "modern-comment", action);
                yield new DocxReviewProtectionMasteryEngine().setCommentResolved(source, Integer.parseInt(target.nativeAnchor().nativeObjectId()), Boolean.TRUE.equals(boolOrNull(required(operation.parameters(), "comment.resolved"))));
            }
            case "UPSERT_DOCUMENT_PROTECTION" -> {
                requireArtifactRoot(target, action);
                yield new DocxReviewProtectionMasteryEngine().upsertDocumentProtection(source, protectionSpec(operation.parameters()));
            }
            case "UPSERT_RESTRICTED_RANGE" -> {
                requireType(target, CanonicalDocumentGraphV2.ElementType.PARAGRAPH, action);
                yield new DocxReviewProtectionMasteryEngine().upsertRestrictedRange(source, new DocxReviewProtectionMasteryEngine.RestrictedRangeSpec(required(operation.parameters(), "restriction.id"), operation.parameters().getOrDefault("restriction.editorGroup", "everyone"), target.nativeAnchor().locator()));
            }
            default -> throw new UnsupportedOperationException("unsupported semantic DOCX mastery action: " + action);
        };
        diagnostics.add("DOCX_MASTERY_ACTION=" + action);
        diagnostics.add("DOCX_MASTERY_TARGET=" + target.id());
        return result;
    }

    private static void requireType(CanonicalDocumentGraphV2.Element element, CanonicalDocumentGraphV2.ElementType type, String action) {
        if (element.type() != type) {
            throw new IllegalArgumentException(action + " requires " + type + " target, got " + element.type());
        }
        if (!"word/document.xml".equals(element.nativeAnchor().nativePart())) {
            throw new IllegalArgumentException(action + " supports word/document.xml targets only");
        }
    }

    private static void requireSemanticType(CanonicalDocumentGraphV2.Element element, CanonicalDocumentGraphV2.ElementType type, String role, String action) {
        if (element.type() != type || !role.equals(element.semantic().role())) {
            throw new IllegalArgumentException(action + " requires " + type + "/" + role + " target");
        }
    }

    private static void requireContentControl(CanonicalDocumentGraphV2.Element element, String action) {
        if (element.type() != CanonicalDocumentGraphV2.ElementType.EMBEDDED_OBJECT
                || !("content-control".equals(element.semantic().role()) || "repeating-content-control".equals(element.semantic().role()))) {
            throw new IllegalArgumentException(action + " requires content-control target");
        }
    }

    private static void requireNativeType(CanonicalDocumentGraphV2.Element element, CanonicalDocumentGraphV2.ElementType type, String nativePart, String action) {
        if (element.type() != type || !nativePart.equals(element.nativeAnchor().nativePart())) {
            throw new IllegalArgumentException(action + " requires " + type + " target in " + nativePart);
        }
    }

    private static void requireArtifactRoot(CanonicalDocumentGraphV2.Element element, String action) {
        if (element.type() != CanonicalDocumentGraphV2.ElementType.ROOT || !"<artifact>".equals(element.nativeAnchor().nativePart())) {
            throw new IllegalArgumentException(action + " requires artifact ROOT target");
        }
    }

    private static void requireArtifactRootOrPageBackground(CanonicalDocumentGraphV2.Element element, String action) {
        boolean root = element.type() == CanonicalDocumentGraphV2.ElementType.ROOT
                && "<artifact>".equals(element.nativeAnchor().nativePart());
        boolean pageBackground = element.type() == CanonicalDocumentGraphV2.ElementType.PAGE
                && "word/document.xml".equals(element.nativeAnchor().nativePart())
                && "page-background".equals(element.semantic().role());
        if (!root && !pageBackground) {
            throw new IllegalArgumentException(action + " requires the artifact ROOT or DOCX page-background target");
        }
    }



    private static DocxReviewProtectionMasteryEngine.MailMergeFieldSpec mailMergeSpec(Map<String, String> p) {
        return new DocxReviewProtectionMasteryEngine.MailMergeFieldSpec(required(p, "mailMerge.fieldName"), p.getOrDefault("mailMerge.switches", ""), p.getOrDefault("mailMerge.displayText", ""));
    }

    private static DocxReviewProtectionMasteryEngine.RevisionSpec revisionSpec(Map<String, String> p, DocxReviewProtectionMasteryEngine.RevisionKind kind) {
        return new DocxReviewProtectionMasteryEngine.RevisionSpec(kind, required(p, "revision.id"), required(p, "revision.author"), Instant.parse(required(p, "revision.date")), p.getOrDefault("revision.text", ""));
    }

    private static DocxReviewProtectionMasteryEngine.FormattingRevisionSpec formattingRevisionSpec(Map<String, String> p) {
        return new DocxReviewProtectionMasteryEngine.FormattingRevisionSpec(required(p, "revision.id"), required(p, "revision.author"), Instant.parse(required(p, "revision.date")), Boolean.TRUE.equals(boolOrNull(p.getOrDefault("revision.bold", "false"))), Boolean.TRUE.equals(boolOrNull(p.getOrDefault("revision.italic", "false"))), p.getOrDefault("revision.color", ""));
    }

    private static DocxReviewProtectionMasteryEngine.RevisionKind revisionKind(String raw) {
        try { return DocxReviewProtectionMasteryEngine.RevisionKind.valueOf(required(Map.of("kind", Objects.requireNonNullElse(raw, "")), "kind")); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("invalid revision kind", ex); }
    }

    private static DocxReviewProtectionMasteryEngine.CommentSpec commentSpec(Map<String, String> p) {
        return new DocxReviewProtectionMasteryEngine.CommentSpec(required(p, "comment.author"), p.getOrDefault("comment.initials", "U"), Instant.parse(required(p, "comment.date")), required(p, "comment.text"));
    }

    private static DocxReviewProtectionMasteryEngine.MentionSpec mentionSpecOrNull(Map<String, String> p) {
        String name = p.getOrDefault("mention.displayName", "").strip();
        if (name.isBlank()) return null;
        return new DocxReviewProtectionMasteryEngine.MentionSpec(name, p.getOrDefault("mention.providerId", "PeoplePicker"), p.getOrDefault("mention.userId", name));
    }

    private static DocxReviewProtectionMasteryEngine.ProtectionSpec protectionSpec(Map<String, String> p) {
        DocxReviewProtectionMasteryEngine.ProtectionEdit edit;
        try { edit = DocxReviewProtectionMasteryEngine.ProtectionEdit.valueOf(p.getOrDefault("protection.edit", "NONE").toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("invalid protection.edit", ex); }
        return new DocxReviewProtectionMasteryEngine.ProtectionSpec(edit,
                Boolean.TRUE.equals(boolOrNull(p.getOrDefault("protection.enforcement", "false"))),
                Boolean.TRUE.equals(boolOrNull(p.getOrDefault("protection.formattingLocked", "false"))),
                p.getOrDefault("protection.cryptProviderType", ""), p.getOrDefault("protection.cryptAlgorithmClass", ""), p.getOrDefault("protection.cryptAlgorithmType", ""),
                intOrDefault(p.get("protection.cryptAlgorithmSid"), 0), intOrDefault(p.get("protection.cryptSpinCount"), 0), p.getOrDefault("protection.hash", ""), p.getOrDefault("protection.salt", ""));
    }

    private static DocxStructuredMetadataMasteryEngine.CitationSpec citationSpec(Map<String, String> p) {
        return new DocxStructuredMetadataMasteryEngine.CitationSpec(required(p, "citation.tag"), p.getOrDefault("citation.displayText", ""), intOrDefault(p.get("citation.localeId"), 1033));
    }

    private static DocxStructuredMetadataMasteryEngine.BibliographySource bibliographySource(Map<String, String> p) {
        return new DocxStructuredMetadataMasteryEngine.BibliographySource(required(p, "bibliography.tag"), p.getOrDefault("bibliography.sourceType", "Misc"), p.getOrDefault("bibliography.title", ""), p.getOrDefault("bibliography.author", ""), p.getOrDefault("bibliography.year", ""));
    }

    private static DocxStructuredMetadataMasteryEngine.GeneratedTableSpec generatedTableSpec(Map<String, String> p) {
        DocxStructuredMetadataMasteryEngine.GeneratedTableKind kind;
        try { kind = DocxStructuredMetadataMasteryEngine.GeneratedTableKind.valueOf(required(p, "generated.kind").toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("invalid generated.kind", ex); }
        return new DocxStructuredMetadataMasteryEngine.GeneratedTableSpec(kind, p.getOrDefault("generated.title", ""), p.getOrDefault("generated.instruction", ""));
    }

    private static DocxStructuredMetadataMasteryEngine.ContentControlSpec contentControlSpec(Map<String, String> p) {
        return new DocxStructuredMetadataMasteryEngine.ContentControlSpec(
                p.getOrDefault("contentControl.alias", ""), p.getOrDefault("contentControl.tag", ""), intOrDefault(p.get("contentControl.id"), 0),
                p.getOrDefault("contentControl.text", ""), p.getOrDefault("contentControl.lock", ""), p.getOrDefault("contentControl.storeItemId", ""),
                p.getOrDefault("contentControl.xpath", ""), p.getOrDefault("contentControl.prefixMappings", ""));
    }

    private static DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec customXmlMappingSpec(Map<String, String> p) {
        return new DocxStructuredMetadataMasteryEngine.CustomXmlMappingSpec(required(p, "customXml.storeItemId"), required(p, "customXml.xpath"), p.getOrDefault("customXml.prefixMappings", ""), required(p, "customXml.xml"));
    }

    private static DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec legacyFormSpec(Map<String, String> p) {
        DocxStructuredMetadataMasteryEngine.LegacyFormFieldType type;
        try { type = DocxStructuredMetadataMasteryEngine.LegacyFormFieldType.valueOf(required(p, "form.type").toUpperCase(java.util.Locale.ROOT)); }
        catch (IllegalArgumentException ex) { throw new IllegalArgumentException("invalid form.type", ex); }
        return new DocxStructuredMetadataMasteryEngine.LegacyFormFieldSpec(type, required(p, "form.name"), p.getOrDefault("form.defaultText", ""),
                Boolean.TRUE.equals(boolOrNull(p.getOrDefault("form.checked", "false"))), splitList(p.getOrDefault("form.items", "")),
                !Boolean.FALSE.equals(boolOrNull(p.getOrDefault("form.enabled", "true"))), Boolean.TRUE.equals(boolOrNull(p.getOrDefault("form.calculateOnExit", "false"))));
    }

    private static DocxStructuredMetadataMasteryEngine.CustomPropertyValue customProperty(Map<String, String> p) {
        return new DocxStructuredMetadataMasteryEngine.CustomPropertyValue(required(p, "customProperty.name"), p.getOrDefault("customProperty.type", "string"), p.getOrDefault("customProperty.value", ""), intOrDefault(p.get("customProperty.pid"), 0));
    }

    private static DocxAdvancedSemanticMasteryEngine.WorkbookSpec chartWorkbook(Map<String, String> p) {
        List<String> categories = splitList(required(p, "chartWorkbook.categories"));
        List<String> rawValues = splitList(required(p, "chartWorkbook.values"));
        if (categories.size() != rawValues.size()) throw new IllegalArgumentException("chart workbook categories/values must align");
        ArrayList<Double> values = new ArrayList<>();
        for (String value : rawValues) values.add(Double.parseDouble(value));
        return new DocxAdvancedSemanticMasteryEngine.WorkbookSpec(p.getOrDefault("chartWorkbook.sheetName", "Data"), categories, values);
    }

    private static DocxAdvancedSemanticMasteryEngine.ChartDecorations chartDecorations(Map<String, String> p) {
        return new DocxAdvancedSemanticMasteryEngine.ChartDecorations(
                p.getOrDefault("chart.title", ""), p.getOrDefault("chart.categoryAxisTitle", ""),
                p.getOrDefault("chart.valueAxisTitle", ""), p.getOrDefault("chart.legendPosition", "r"),
                Boolean.TRUE.equals(boolOrNull(p.getOrDefault("chart.showLegend", "true"))),
                Boolean.TRUE.equals(boolOrNull(p.getOrDefault("chart.showDataLabels", "false"))));
    }

    private static DocxAdvancedSemanticMasteryEngine.SmartArtSpec smartArtSpec(Map<String, String> p) {
        int count = requiredInt(p, "smartArt.nodeCount");
        if (count < 1 || count > 128) throw new IllegalArgumentException("smartArt.nodeCount out of range");
        ArrayList<DocxAdvancedSemanticMasteryEngine.SmartArtNode> nodes = new ArrayList<>();
        for (int i = 1; i <= count; i++) nodes.add(new DocxAdvancedSemanticMasteryEngine.SmartArtNode(
                p.getOrDefault("smartArt.node." + i + ".id", Integer.toString(i)),
                p.getOrDefault("smartArt.node." + i + ".text", "")));
        return new DocxAdvancedSemanticMasteryEngine.SmartArtSpec(p.getOrDefault("smartArt.title", ""), nodes);
    }

    private static DocxAdvancedSemanticMasteryEngine.HyperlinkSpec hyperlinkSpec(Map<String, String> p) {
        return new DocxAdvancedSemanticMasteryEngine.HyperlinkSpec(required(p, "hyperlink.text"), required(p, "hyperlink.target"), p.getOrDefault("hyperlink.tooltip", ""));
    }

    private static DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec crossReferenceSpec(Map<String, String> p) {
        return new DocxAdvancedSemanticMasteryEngine.CrossReferenceSpec(required(p, "crossReference.bookmark"), p.getOrDefault("crossReference.display", ""), Boolean.TRUE.equals(boolOrNull(p.getOrDefault("crossReference.hyperlink", "true"))));
    }

    private static DocxAdvancedSemanticMasteryEngine.FieldSpec fieldSpec(Map<String, String> p) {
        return new DocxAdvancedSemanticMasteryEngine.FieldSpec(required(p, "field.instruction"), p.getOrDefault("field.result", ""));
    }

    private static DocxAdvancedSemanticMasteryEngine.CaptionSpec captionSpec(Map<String, String> p) {
        return new DocxAdvancedSemanticMasteryEngine.CaptionSpec(p.getOrDefault("caption.label", "Figure"), p.getOrDefault("caption.text", ""), p.getOrDefault("caption.sequence", ""));
    }

    private static List<String> splitList(String value) {
        if (value.isBlank()) return List.of();
        return java.util.Arrays.stream(value.split(";", -1)).map(String::strip).toList();
    }

    private static DocxPageArchitectureEngine.PageBorders pageBorders(Map<String, String> p) {
        return new DocxPageArchitectureEngine.PageBorders(
                p.getOrDefault("pageBorder.offsetFrom", ""),
                p.getOrDefault("pageBorder.display", ""),
                p.getOrDefault("pageBorder.zOrder", ""),
                borderEdge(p, "pageBorder.top."),
                borderEdge(p, "pageBorder.right."),
                borderEdge(p, "pageBorder.bottom."),
                borderEdge(p, "pageBorder.left."));
    }

    private static DocxPageArchitectureEngine.BorderEdge borderEdge(Map<String, String> p, String prefix) {
        boolean present = p.keySet().stream().anyMatch(key -> key.startsWith(prefix));
        if (!present) return null;
        return new DocxPageArchitectureEngine.BorderEdge(
                p.getOrDefault(prefix + "style", ""),
                intOrNull(p.get(prefix + "sizeEighthPoints")),
                intOrNull(p.get(prefix + "spacePoints")),
                p.getOrDefault(prefix + "colorHex", ""));
    }

    private static DocxPageArchitectureEngine.PageBackground pageBackground(Map<String, String> p) {
        return new DocxPageArchitectureEngine.PageBackground(
                p.getOrDefault("background.colorHex", ""),
                p.getOrDefault("background.themeColor", ""),
                p.getOrDefault("background.themeTint", ""),
                p.getOrDefault("background.themeShade", ""));
    }

    private static DocxPageArchitectureEngine.ColumnLayout columnLayout(Map<String, String> p) {
        Integer count = intOrNull(p.get("columns.count"));
        ArrayList<DocxPageArchitectureEngine.ColumnSpec> columns = new ArrayList<>();
        int explicitCount = count == null ? 45 : Math.min(count, 45);
        for (int i = 1; i <= explicitCount; i++) {
            String prefix = "columns." + i + ".";
            Integer width = intOrNull(p.get(prefix + "widthTwips"));
            Integer space = intOrNull(p.get(prefix + "spaceTwips"));
            if (width != null || space != null) columns.add(new DocxPageArchitectureEngine.ColumnSpec(width, space));
        }
        return new DocxPageArchitectureEngine.ColumnLayout(
                count,
                intOrNull(p.get("columns.spacingTwips")),
                boolOrNull(p.get("columns.separator")),
                boolOrNull(p.get("columns.equalWidth")),
                columns);
    }

    private static DocxPageArchitectureEngine.LineNumbering lineNumbering(Map<String, String> p) {
        return new DocxPageArchitectureEngine.LineNumbering(
                intOrNull(p.get("lineNumbering.countBy")),
                intOrNull(p.get("lineNumbering.start")),
                intOrNull(p.get("lineNumbering.distanceTwips")),
                p.getOrDefault("lineNumbering.restart", ""));
    }

    private static DocxPageArchitectureEngine.PageNumbering pageNumbering(Map<String, String> p) {
        return new DocxPageArchitectureEngine.PageNumbering(
                intOrNull(p.get("pageNumbering.start")),
                p.getOrDefault("pageNumbering.format", ""),
                intOrNull(p.get("pageNumbering.chapterStyle")),
                p.getOrDefault("pageNumbering.chapterSeparator", ""));
    }

    private static List<DocxParagraphMechanicsEngine.TabStop> tabs(Map<String, String> p) {
        int count = Objects.requireNonNullElse(intOrNull(p.get("tabs.count")), 0);
        if (count < 0 || count > 128) throw new IllegalArgumentException("tabs.count out of range");
        ArrayList<DocxParagraphMechanicsEngine.TabStop> out = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            String prefix = "tabs." + i + ".";
            out.add(new DocxParagraphMechanicsEngine.TabStop(
                    requiredInt(p, prefix + "positionTwips"),
                    p.getOrDefault(prefix + "alignment", "left"),
                    p.getOrDefault(prefix + "leader", "none")));
        }
        return List.copyOf(out);
    }

    private static DocxParagraphMechanicsEngine.Indentation indentation(Map<String, String> p) {
        return new DocxParagraphMechanicsEngine.Indentation(
                intOrNull(p.get("indent.leftTwips")), intOrNull(p.get("indent.rightTwips")),
                intOrNull(p.get("indent.firstLineTwips")), intOrNull(p.get("indent.hangingTwips")));
    }

    private static DocxParagraphMechanicsEngine.LineSpacing lineSpacing(Map<String, String> p) {
        return new DocxParagraphMechanicsEngine.LineSpacing(intOrNull(p.get("lineSpacing.lineTwips")), p.getOrDefault("lineSpacing.rule", ""));
    }

    private static DocxParagraphMechanicsEngine.ParagraphSpacing paragraphSpacing(Map<String, String> p) {
        return new DocxParagraphMechanicsEngine.ParagraphSpacing(
                intOrNull(p.get("paragraphSpacing.beforeTwips")), intOrNull(p.get("paragraphSpacing.afterTwips")),
                boolOrNull(p.get("paragraphSpacing.beforeAuto")), boolOrNull(p.get("paragraphSpacing.afterAuto")),
                boolOrNull(p.get("paragraphSpacing.contextual")));
    }

    private static DocxParagraphMechanicsEngine.PaginationControls paginationControls(Map<String, String> p) {
        return new DocxParagraphMechanicsEngine.PaginationControls(
                boolOrNull(p.get("pagination.widowControl")), boolOrNull(p.get("pagination.keepNext")), boolOrNull(p.get("pagination.keepLines")));
    }

    private static DocxParagraphMechanicsEngine.BorderShading borderShading(Map<String, String> p) {
        boolean anyBorder = p.keySet().stream().anyMatch(key -> key.startsWith("paragraphBorder."));
        DocxParagraphMechanicsEngine.ParagraphBorders borders = anyBorder ? new DocxParagraphMechanicsEngine.ParagraphBorders(
                paragraphBorder(p, "paragraphBorder.top."), paragraphBorder(p, "paragraphBorder.right."),
                paragraphBorder(p, "paragraphBorder.bottom."), paragraphBorder(p, "paragraphBorder.left."),
                paragraphBorder(p, "paragraphBorder.between."), paragraphBorder(p, "paragraphBorder.bar.")) : null;
        boolean anyShading = p.keySet().stream().anyMatch(key -> key.startsWith("paragraphShading."));
        DocxParagraphMechanicsEngine.Shading shading = anyShading ? new DocxParagraphMechanicsEngine.Shading(
                p.getOrDefault("paragraphShading.pattern", ""), p.getOrDefault("paragraphShading.fillHex", ""), p.getOrDefault("paragraphShading.colorHex", "")) : null;
        return new DocxParagraphMechanicsEngine.BorderShading(borders, shading);
    }

    private static DocxParagraphMechanicsEngine.BorderEdge paragraphBorder(Map<String, String> p, String prefix) {
        boolean present = p.keySet().stream().anyMatch(key -> key.startsWith(prefix));
        if (!present) return null;
        return new DocxParagraphMechanicsEngine.BorderEdge(p.getOrDefault(prefix + "style", ""), intOrNull(p.get(prefix + "sizeEighthPoints")), intOrNull(p.get(prefix + "spacePoints")), p.getOrDefault(prefix + "colorHex", ""));
    }

    private static DocxParagraphMechanicsEngine.NumberingDefinition numberingDefinition(Map<String, String> p) {
        int abstractNumId = requiredInt(p, "numbering.abstractNumId");
        int numId = requiredInt(p, "numbering.numId");
        int count = requiredInt(p, "numbering.levelCount");
        if (count < 1 || count > 9) throw new IllegalArgumentException("numbering.levelCount must be 1..9");
        ArrayList<DocxParagraphMechanicsEngine.NumberingLevel> levels = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String prefix = "numbering.level." + i + ".";
            levels.add(new DocxParagraphMechanicsEngine.NumberingLevel(
                    i, intOrNull(p.get(prefix + "start")), p.getOrDefault(prefix + "format", "decimal"),
                    p.getOrDefault(prefix + "text", ""), p.getOrDefault(prefix + "suffix", "tab"),
                    p.getOrDefault(prefix + "justification", "left"), intOrNull(p.get(prefix + "leftTwips")),
                    intOrNull(p.get(prefix + "hangingTwips"))));
        }
        return new DocxParagraphMechanicsEngine.NumberingDefinition(abstractNumId, numId, levels);
    }

    private static DocxTableImageMasteryEngine.TableSpec tableSpec(Map<String, String> p) {
        int rows = requiredInt(p, "table.rows");
        int cols = requiredInt(p, "table.columns");
        if (rows < 1 || rows > 200 || cols < 1 || cols > 100) throw new IllegalArgumentException("table dimensions out of range");
        ArrayList<DocxTableImageMasteryEngine.RowSpec> rowSpecs = new ArrayList<>();
        for (int r = 1; r <= rows; r++) {
            ArrayList<DocxTableImageMasteryEngine.CellSpec> cells = new ArrayList<>();
            for (int c = 1; c <= cols; c++) {
                String prefix = "table.cell." + r + "." + c + ".";
                cells.add(new DocxTableImageMasteryEngine.CellSpec(
                        p.getOrDefault(prefix + "text", ""), intOrNull(p.get(prefix + "gridSpan")),
                        p.getOrDefault(prefix + "verticalMerge", ""), p.getOrDefault(prefix + "verticalAlignment", ""),
                        cellMargins(p, prefix + "margin.")));
            }
            rowSpecs.add(new DocxTableImageMasteryEngine.RowSpec(cells, new DocxTableImageMasteryEngine.RowHeight(
                    intOrNull(p.get("table.row." + r + ".heightTwips")), p.getOrDefault("table.row." + r + ".heightRule", "")),
                    Boolean.TRUE.equals(boolOrNull(p.get("table.row." + r + ".repeatHeader")))));
        }
        return new DocxTableImageMasteryEngine.TableSpec(rowSpecs, tableFormat(p));
    }

    private static DocxTableImageMasteryEngine.TableFormat tableFormat(Map<String, String> p) {
        boolean anyBorders = p.keySet().stream().anyMatch(key -> key.startsWith("table.border."));
        DocxTableImageMasteryEngine.TableBorders borders = anyBorders ? new DocxTableImageMasteryEngine.TableBorders(
                tableBorder(p, "table.border.top."), tableBorder(p, "table.border.right."), tableBorder(p, "table.border.bottom."),
                tableBorder(p, "table.border.left."), tableBorder(p, "table.border.insideH."), tableBorder(p, "table.border.insideV.")) : null;
        return new DocxTableImageMasteryEngine.TableFormat(
                new DocxTableImageMasteryEngine.Width(intOrNull(p.get("table.width.value")), p.getOrDefault("table.width.type", "dxa")),
                cellMargins(p, "table.cellMargin."), borders, new DocxTableImageMasteryEngine.Shading(
                p.getOrDefault("table.shading.pattern", ""), p.getOrDefault("table.shading.fillHex", ""), p.getOrDefault("table.shading.colorHex", "")));
    }

    private static DocxTableImageMasteryEngine.BorderEdge tableBorder(Map<String, String> p, String prefix) {
        boolean present = p.keySet().stream().anyMatch(key -> key.startsWith(prefix));
        if (!present) return null;
        return new DocxTableImageMasteryEngine.BorderEdge(p.getOrDefault(prefix + "style", ""), intOrNull(p.get(prefix + "sizeEighthPoints")), intOrNull(p.get(prefix + "spacePoints")), p.getOrDefault(prefix + "colorHex", ""));
    }

    private static DocxTableImageMasteryEngine.CellMargins cellMargins(Map<String, String> p, String prefix) {
        return new DocxTableImageMasteryEngine.CellMargins(intOrNull(p.get(prefix + "topTwips")), intOrNull(p.get(prefix + "rightTwips")), intOrNull(p.get(prefix + "bottomTwips")), intOrNull(p.get(prefix + "leftTwips")));
    }

    private static DocxTableImageMasteryEngine.RowHeight rowHeight(Map<String, String> p) {
        return new DocxTableImageMasteryEngine.RowHeight(intOrNull(p.get("table.rowHeightTwips")), p.getOrDefault("table.rowHeightRule", ""));
    }

    private static DocxTableImageMasteryEngine.ImageSpec imageSpec(Map<String, String> p) {
        return DocxTableImageMasteryEngine.ImageSpec.fromBase64(required(p, "image.base64"), required(p, "image.extension"), requiredLong(p, "image.widthEmu"), requiredLong(p, "image.heightEmu"), p.getOrDefault("image.name", "Image"), p.getOrDefault("image.title", ""), p.getOrDefault("image.altText", ""));
    }

    private static DocxTableImageMasteryEngine.FloatingPlacement floatingPlacement(Map<String, String> p) {
        return new DocxTableImageMasteryEngine.FloatingPlacement(longOrDefault(p.get("image.xEmu"), 0L), longOrDefault(p.get("image.yEmu"), 0L), p.getOrDefault("image.horizontalRelativeFrom", "column"), p.getOrDefault("image.verticalRelativeFrom", "paragraph"), p.getOrDefault("image.wrap", "square"));
    }

    private static DocxTableImageMasteryEngine.ImageFormat imageFormat(Map<String, String> p) {
        return new DocxTableImageMasteryEngine.ImageFormat(longOrNull(p.get("image.widthEmu")), longOrNull(p.get("image.heightEmu")), longOrNull(p.get("image.xEmu")), longOrNull(p.get("image.yEmu")), p.containsKey("image.title") ? p.get("image.title") : null, p.containsKey("image.altText") ? p.get("image.altText") : null);
    }


    private static DocxDrawingChartMasteryEngine.ImageStyle drawingImageStyle(Map<String, String> p) {
        return new DocxDrawingChartMasteryEngine.ImageStyle(
                new DocxDrawingChartMasteryEngine.Crop(
                        intOrDefault(p.get("image.crop.left"), 0), intOrDefault(p.get("image.crop.top"), 0),
                        intOrDefault(p.get("image.crop.right"), 0), intOrDefault(p.get("image.crop.bottom"), 0)),
                p.getOrDefault("image.wrap", ""), longOrNull(p.get("image.xEmu")), longOrNull(p.get("image.yEmu")),
                p.getOrDefault("image.horizontalRelativeFrom", ""), p.getOrDefault("image.verticalRelativeFrom", ""),
                p.containsKey("image.title") ? p.get("image.title") : null,
                p.containsKey("image.altText") ? p.get("image.altText") : null,
                boolOrNull(p.get("image.decorative")));
    }

    private static DocxDrawingChartMasteryEngine.SvgSpec svgSpec(Map<String, String> p, boolean icon) {
        return new DocxDrawingChartMasteryEngine.SvgSpec(
                java.util.Base64.getDecoder().decode(required(p, "svg.base64")), requiredLong(p, "svg.widthEmu"), requiredLong(p, "svg.heightEmu"),
                p.getOrDefault("svg.name", icon ? "Icon" : "SVG"), p.getOrDefault("svg.title", ""), p.getOrDefault("svg.altText", ""), icon);
    }

    private static DocxDrawingChartMasteryEngine.ShapeSpec shapeSpec(Map<String, String> p, String prefix) {
        return new DocxDrawingChartMasteryEngine.ShapeSpec(
                p.getOrDefault(prefix + "preset", "rect"), requiredLong(p, prefix + "widthEmu"), requiredLong(p, prefix + "heightEmu"),
                p.getOrDefault(prefix + "fillHex", "D9EAF7"), p.getOrDefault(prefix + "lineHex", "4F81BD"),
                p.getOrDefault(prefix + "text", ""), p.getOrDefault(prefix + "wordArtPreset", ""));
    }

    private static DocxDrawingChartMasteryEngine.GroupSpec groupSpec(Map<String, String> p) {
        int count = requiredInt(p, "group.shapeCount");
        if (count < 1 || count > 64) throw new IllegalArgumentException("group shape count out of range");
        ArrayList<DocxDrawingChartMasteryEngine.ShapeSpec> shapes = new ArrayList<>();
        for (int i = 1; i <= count; i++) shapes.add(shapeSpec(p, "group.shape." + i + "."));
        return new DocxDrawingChartMasteryEngine.GroupSpec(shapes, requiredLong(p, "group.widthEmu"), requiredLong(p, "group.heightEmu"));
    }

    private static DocxDrawingChartMasteryEngine.ChartSpec chartSpec(Map<String, String> p) {
        int count = requiredInt(p, "chart.seriesCount");
        if (count < 1 || count > 32) throw new IllegalArgumentException("chart series count out of range");
        ArrayList<DocxDrawingChartMasteryEngine.ChartSeries> series = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            String prefix = "chart.series." + i + ".";
            List<String> categories = splitSemicolon(required(p, prefix + "categories"));
            List<String> rawValues = splitSemicolon(required(p, prefix + "values"));
            ArrayList<Double> values = new ArrayList<>();
            for (String raw : rawValues) {
                try { values.add(Double.valueOf(raw)); }
                catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid chart value: " + raw, exception); }
            }
            series.add(new DocxDrawingChartMasteryEngine.ChartSeries(p.getOrDefault(prefix + "name", "Series " + i), categories, values));
        }
        return new DocxDrawingChartMasteryEngine.ChartSpec(p.getOrDefault("chart.type", "bar"), p.getOrDefault("chart.title", ""),
                requiredLong(p, "chart.widthEmu"), requiredLong(p, "chart.heightEmu"), series);
    }

    private static List<String> splitSemicolon(String raw) {
        return java.util.Arrays.stream(raw.split(";", -1)).map(String::strip).toList();
    }

    private static int intOrDefault(String value, int defaultValue) {
        Integer parsed = intOrNull(value);
        return parsed == null ? defaultValue : parsed;
    }

    private static DocxNativeMasteryEngine.RunFormat runFormat(Map<String, String> p, String prefix) {
        return new DocxNativeMasteryEngine.RunFormat(
                p.getOrDefault(prefix + "styleId", ""),
                boolOrNull(p.get(prefix + "bold")),
                boolOrNull(p.get(prefix + "italic")),
                p.getOrDefault(prefix + "underline", ""),
                p.getOrDefault(prefix + "colorHex", ""),
                p.getOrDefault(prefix + "fontAscii", ""),
                intOrNull(p.get(prefix + "sizeHalfPoints")),
                p.getOrDefault(prefix + "language", ""));
    }

    private static DocxNativeMasteryEngine.ParagraphFormat paragraphFormat(Map<String, String> p, String prefix) {
        return new DocxNativeMasteryEngine.ParagraphFormat(
                p.getOrDefault(prefix + "styleId", ""),
                p.getOrDefault(prefix + "alignment", ""),
                intOrNull(p.get(prefix + "leftTwips")),
                intOrNull(p.get(prefix + "rightTwips")),
                intOrNull(p.get(prefix + "firstLineTwips")),
                intOrNull(p.get(prefix + "hangingTwips")),
                intOrNull(p.get(prefix + "spacingBeforeTwips")),
                intOrNull(p.get(prefix + "spacingAfterTwips")),
                intOrNull(p.get(prefix + "lineTwips")),
                boolOrNull(p.get(prefix + "keepNext")),
                boolOrNull(p.get(prefix + "keepLines")),
                boolOrNull(p.get(prefix + "widowControl")));
    }

    private static DocxNativeMasteryEngine.SectionFormat sectionFormat(Map<String, String> p, String prefix) {
        return new DocxNativeMasteryEngine.SectionFormat(
                intOrNull(p.get(prefix + "widthTwips")),
                intOrNull(p.get(prefix + "heightTwips")),
                p.getOrDefault(prefix + "orientation", ""),
                intOrNull(p.get(prefix + "marginTopTwips")),
                intOrNull(p.get(prefix + "marginRightTwips")),
                intOrNull(p.get(prefix + "marginBottomTwips")),
                intOrNull(p.get(prefix + "marginLeftTwips")),
                intOrNull(p.get(prefix + "marginHeaderTwips")),
                intOrNull(p.get(prefix + "marginFooterTwips")),
                intOrNull(p.get(prefix + "gutterTwips")));
    }

    private static Boolean boolOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        return switch (value.strip().toLowerCase(java.util.Locale.ROOT)) {
            case "1", "true", "on", "yes" -> Boolean.TRUE;
            case "0", "false", "off", "no" -> Boolean.FALSE;
            default -> throw new IllegalArgumentException("invalid boolean parameter: " + value);
        };
    }

    private static Integer intOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Integer.valueOf(value.strip()); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid integer parameter: " + value, exception); }
    }

    private static int requiredInt(Map<String, String> parameters, String key) {
        Integer value = intOrNull(parameters.get(key));
        if (value == null) throw new IllegalArgumentException("missing integer parameter: " + key);
        return value;
    }

    private static Long longOrNull(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Long.valueOf(value.strip()); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid long parameter: " + value, exception); }
    }

    private static long longOrDefault(String value, long defaultValue) {
        Long parsed = longOrNull(value);
        return parsed == null ? defaultValue : parsed;
    }

    private static long requiredLong(Map<String, String> parameters, String key) {
        Long value = longOrNull(parameters.get(key));
        if (value == null) throw new IllegalArgumentException("missing long parameter: " + key);
        return value;
    }

    private static String required(Map<String, String> parameters, String key) {
        String value = parameters.getOrDefault(key, "").strip();
        if (value.isBlank()) throw new IllegalArgumentException("missing parameter: " + key);
        return value;
    }
}
