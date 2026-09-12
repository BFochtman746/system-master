package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;

import java.util.Objects;

/** Stable review anchor expressed against CDG source semantics rather than UI coordinates. */
public record ReviewAnchor(
        String nativePart,
        String locator,
        CanonicalDocumentGraph.NodeType nodeType,
        int startOffset,
        int endOffset) {

    public ReviewAnchor {
        nativePart = Objects.requireNonNullElse(nativePart, "<artifact>");
        if (locator == null || locator.isBlank()) throw new IllegalArgumentException("review anchor locator required");
        Objects.requireNonNull(nodeType, "nodeType");
        if (startOffset < 0 || endOffset < startOffset) throw new IllegalArgumentException("invalid review anchor range");
        if (nativePart.contains("..") || nativePart.contains("\\")) throw new IllegalArgumentException("unsafe native part");
    }

    public static ReviewAnchor wholeNode(CanonicalDocumentGraph.Node node) {
        Objects.requireNonNull(node, "node");
        return new ReviewAnchor(node.sourceAnchor().nativePart(), node.sourceAnchor().locator(), node.type(), 0, node.text().length());
    }

    public String stableKey() {
        return nodeType + "|" + nativePart + "|" + locator;
    }
}
