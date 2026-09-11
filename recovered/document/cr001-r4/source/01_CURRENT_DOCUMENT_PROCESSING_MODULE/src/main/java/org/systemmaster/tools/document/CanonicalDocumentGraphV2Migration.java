package org.systemmaster.tools.document;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Explicit compatibility bridge from CDG-1 to CDG-2. */
public final class CanonicalDocumentGraphV2Migration {
    private CanonicalDocumentGraphV2Migration() {
    }

    public static CanonicalDocumentGraphV2 fromV1(CanonicalDocumentGraph source) {
        Objects.requireNonNull(source, "source");
        ArrayList<CanonicalDocumentGraphV2.Element> elements = new ArrayList<>();
        for (CanonicalDocumentGraph.Node node : source.nodes()) {
            CanonicalDocumentGraphV2.ElementType type = mapType(node.type());
            CanonicalDocumentGraphV2.NativeAnchor anchor = new CanonicalDocumentGraphV2.NativeAnchor(
                    node.sourceAnchor().nativePart(),
                    node.sourceAnchor().locator(),
                    "",
                    "");
            String id = CanonicalDocumentGraphV2.stableElementId(source.sourceFormat(), type, anchor);
            String parentId = null;
            if (node.parentId() != null) {
                CanonicalDocumentGraph.Node parent = source.requireNode(node.parentId());
                CanonicalDocumentGraphV2.NativeAnchor parentAnchor = new CanonicalDocumentGraphV2.NativeAnchor(
                        parent.sourceAnchor().nativePart(),
                        parent.sourceAnchor().locator(),
                        "",
                        "");
                parentId = CanonicalDocumentGraphV2.stableElementId(source.sourceFormat(), mapType(parent.type()), parentAnchor);
            }
            elements.add(new CanonicalDocumentGraphV2.Element(
                    id,
                    type,
                    parentId,
                    node.ordinal(),
                    node.text(),
                    new CanonicalDocumentGraphV2.SemanticState(node.type().name(), "", node.attributes()),
                    CanonicalDocumentGraphV2.StyleState.empty(),
                    CanonicalDocumentGraphV2.GeometryState.empty(),
                    CanonicalDocumentGraphV2.DataState.empty(),
                    CanonicalDocumentGraphV2.BehaviorState.empty(),
                    CanonicalDocumentGraphV2.AccessibilityState.empty(),
                    CanonicalDocumentGraphV2.ReviewState.empty(),
                    anchor,
                    List.of(),
                    List.of(),
                    Map.of("migration", "CDG-1")));
        }
        return new CanonicalDocumentGraphV2(
                CanonicalDocumentGraphV2.SCHEMA_V2,
                source.sourceFormat(),
                source.sourceSha256(),
                mapKind(source.kind()),
                elements,
                List.of(),
                List.of(),
                List.of(),
                source.nativeParts(),
                Map.of("migration.sourceSchema", CanonicalDocumentGraph.SCHEMA_V1));
    }

    private static CanonicalDocumentGraphV2.Kind mapKind(CanonicalDocumentGraph.Kind kind) {
        return switch (kind) {
            case FLOW_DOCUMENT -> CanonicalDocumentGraphV2.Kind.FLOW_DOCUMENT;
            case PRESENTATION -> CanonicalDocumentGraphV2.Kind.PRESENTATION;
            case FIXED_LAYOUT -> CanonicalDocumentGraphV2.Kind.FIXED_LAYOUT;
            case TEXT_DOCUMENT -> CanonicalDocumentGraphV2.Kind.TEXT_DOCUMENT;
        };
    }

    private static CanonicalDocumentGraphV2.ElementType mapType(CanonicalDocumentGraph.NodeType type) {
        return switch (type) {
            case ROOT -> CanonicalDocumentGraphV2.ElementType.ROOT;
            case METADATA -> CanonicalDocumentGraphV2.ElementType.METADATA;
            case SECTION -> CanonicalDocumentGraphV2.ElementType.SECTION;
            case PARAGRAPH -> CanonicalDocumentGraphV2.ElementType.PARAGRAPH;
            case RUN -> CanonicalDocumentGraphV2.ElementType.RUN;
            case LIST -> CanonicalDocumentGraphV2.ElementType.LIST;
            case LIST_ITEM -> CanonicalDocumentGraphV2.ElementType.LIST_ITEM;
            case TABLE -> CanonicalDocumentGraphV2.ElementType.TABLE;
            case TABLE_ROW -> CanonicalDocumentGraphV2.ElementType.TABLE_ROW;
            case TABLE_CELL -> CanonicalDocumentGraphV2.ElementType.TABLE_CELL;
            case FIGURE -> CanonicalDocumentGraphV2.ElementType.FIGURE;
            case IMAGE -> CanonicalDocumentGraphV2.ElementType.IMAGE;
            case CHART -> CanonicalDocumentGraphV2.ElementType.CHART;
            case EQUATION -> CanonicalDocumentGraphV2.ElementType.EQUATION;
            case HYPERLINK -> CanonicalDocumentGraphV2.ElementType.HYPERLINK;
            case CITATION -> CanonicalDocumentGraphV2.ElementType.CITATION;
            case FOOTNOTE -> CanonicalDocumentGraphV2.ElementType.FOOTNOTE;
            case ENDNOTE -> CanonicalDocumentGraphV2.ElementType.ENDNOTE;
            case COMMENT -> CanonicalDocumentGraphV2.ElementType.COMMENT;
            case REVISION -> CanonicalDocumentGraphV2.ElementType.REVISION;
            case SLIDE -> CanonicalDocumentGraphV2.ElementType.SLIDE;
            case SLIDE_TEXT -> CanonicalDocumentGraphV2.ElementType.TEXT_FRAME;
            case SLIDE_LAYOUT -> CanonicalDocumentGraphV2.ElementType.SLIDE_LAYOUT;
            case SLIDE_MASTER -> CanonicalDocumentGraphV2.ElementType.SLIDE_MASTER;
            case SPEAKER_NOTE -> CanonicalDocumentGraphV2.ElementType.SPEAKER_NOTE;
            case MEDIA -> CanonicalDocumentGraphV2.ElementType.MEDIA;
            case TEXT_BLOCK -> CanonicalDocumentGraphV2.ElementType.TEXT_BLOCK;
            case PAGE -> CanonicalDocumentGraphV2.ElementType.PAGE;
        };
    }
}
