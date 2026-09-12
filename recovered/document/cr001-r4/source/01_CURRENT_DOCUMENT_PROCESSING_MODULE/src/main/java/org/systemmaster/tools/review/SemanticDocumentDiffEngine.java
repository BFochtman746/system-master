package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Deterministic CDG sequence diff. It prefers exact locator replacements, then LCS insert/delete alignment. */
public final class SemanticDocumentDiffEngine {
    private static final int MAX_REVIEWABLE_NODES = 2_000;

    public DocumentReviewGraph diff(CanonicalDocumentGraph base, CanonicalDocumentGraph target, String author, Instant at) {
        Objects.requireNonNull(base, "base");
        Objects.requireNonNull(target, "target");
        if (base.sourceFormat() != target.sourceFormat()) throw new IllegalArgumentException("cross-format diff requires explicit conversion review");
        Objects.requireNonNull(at, "at");
        String authorValue = Objects.requireNonNull(author, "author");
        List<CanonicalDocumentGraph.Node> left = reviewable(base);
        List<CanonicalDocumentGraph.Node> right = reviewable(target);
        if (left.size() > MAX_REVIEWABLE_NODES || right.size() > MAX_REVIEWABLE_NODES || (long) (left.size() + 1) * (right.size() + 1) > 4_000_000L) throw new IllegalArgumentException("review graph too large for portable diff");

        int[][] lcs = lcs(left, right);
        ArrayList<ReviewChange> changes = new ArrayList<>();
        int i = 0, j = 0;
        while (i < left.size() || j < right.size()) {
            if (i < left.size() && j < right.size() && equivalent(left.get(i), right.get(j))) { i++; j++; continue; }
            if (i < left.size() && j < right.size() && sameAnchor(left.get(i), right.get(j))) {
                add(changes, ReviewChange.Type.REPLACE, left.get(i), left.get(i).text(), right.get(j).text(), authorValue, at, ReviewChange.Confidence.EXACT);
                i++; j++; continue;
            }
            if (j < right.size() && (i == left.size() || lcs[i][j + 1] >= lcs[i + 1][j])) {
                CanonicalDocumentGraph.Node n = right.get(j++);
                add(changes, ReviewChange.Type.INSERT, n, "", n.text(), authorValue, at, ReviewChange.Confidence.HIGH);
            } else {
                CanonicalDocumentGraph.Node n = left.get(i++);
                add(changes, ReviewChange.Type.DELETE, n, n.text(), "", authorValue, at, ReviewChange.Confidence.HIGH);
            }
        }
        String reviewId = "review-" + digest(base.sourceSha256() + "|" + target.sourceSha256() + "|" + at).substring(0, 20);
        return new DocumentReviewGraph(DocumentReviewGraph.SCHEMA_V1, reviewId, base.sourceFormat(), base.sourceSha256(), target.sourceSha256(),
                base.semanticDigest(), target.semanticDigest(), at, List.copyOf(changes));
    }

    private static List<CanonicalDocumentGraph.Node> reviewable(CanonicalDocumentGraph graph) {
        return graph.nodes().stream().filter(n -> switch (n.type()) {
            case PARAGRAPH, TABLE_CELL, SLIDE_TEXT, SPEAKER_NOTE, TEXT_BLOCK, COMMENT, REVISION -> true;
            default -> false;
        }).toList();
    }

    private static int[][] lcs(List<CanonicalDocumentGraph.Node> a, List<CanonicalDocumentGraph.Node> b) {
        int[][] out = new int[a.size() + 1][b.size() + 1];
        for (int i = a.size() - 1; i >= 0; i--) for (int j = b.size() - 1; j >= 0; j--) {
            out[i][j] = equivalent(a.get(i), b.get(j)) ? 1 + out[i + 1][j + 1] : Math.max(out[i + 1][j], out[i][j + 1]);
        }
        return out;
    }

    private static boolean equivalent(CanonicalDocumentGraph.Node a, CanonicalDocumentGraph.Node b) {
        return a.type() == b.type() && a.text().equals(b.text());
    }
    private static boolean sameAnchor(CanonicalDocumentGraph.Node a, CanonicalDocumentGraph.Node b) {
        return a.type() == b.type() && a.sourceAnchor().nativePart().equals(b.sourceAnchor().nativePart()) && a.sourceAnchor().locator().equals(b.sourceAnchor().locator());
    }
    private static void add(ArrayList<ReviewChange> out, ReviewChange.Type type, CanonicalDocumentGraph.Node anchor, String before, String after,
                            String author, Instant at, ReviewChange.Confidence confidence) {
        String seed = type + "|" + anchor.type() + "|" + anchor.sourceAnchor().nativePart() + "|" + anchor.sourceAnchor().locator() + "|" + before + "|" + after;
        String id = "chg-" + digest(seed).substring(0, 20);
        out.add(new ReviewChange(id, type, ReviewAnchor.wholeNode(anchor), before, after, author, at, confidence, java.util.Map.of(), List.of()));
    }
    private static String digest(String value) { return ReviewDigests.sha256(value.getBytes(StandardCharsets.UTF_8)); }
}
