package org.systemmaster.tools.review;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** One proposed semantic change. Decisions are deliberately stored outside this immutable proposal. */
public record ReviewChange(
        String changeId,
        Type type,
        ReviewAnchor anchor,
        String beforeText,
        String afterText,
        String author,
        Instant proposedAt,
        Confidence confidence,
        Map<String,String> attributes,
        List<String> diagnostics) {

    public enum Type { INSERT, DELETE, REPLACE, MOVE, FORMAT, COMMENT }
    public enum Confidence { EXACT, HIGH, REVIEW_REQUIRED }

    public ReviewChange {
        if (changeId == null || !changeId.matches("chg-[0-9a-f]{20}")) throw new IllegalArgumentException("invalid change id");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(anchor, "anchor");
        beforeText = Objects.requireNonNullElse(beforeText, "");
        afterText = Objects.requireNonNullElse(afterText, "");
        author = requireText(author, "author", 256);
        Objects.requireNonNull(proposedAt, "proposedAt");
        Objects.requireNonNull(confidence, "confidence");
        attributes = Map.copyOf(Objects.requireNonNullElse(attributes, Map.of()));
        diagnostics = List.copyOf(Objects.requireNonNullElse(diagnostics, List.of()));
        if (type == Type.INSERT && !beforeText.isEmpty()) throw new IllegalArgumentException("insert must not carry before text");
        if (type == Type.DELETE && !afterText.isEmpty()) throw new IllegalArgumentException("delete must not carry after text");
        if ((type == Type.REPLACE || type == Type.MOVE) && beforeText.equals(afterText)) throw new IllegalArgumentException("change must alter content");
    }

    private static String requireText(String value, String name, int max) {
        if (value == null || value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " required");
        return value;
    }
}
