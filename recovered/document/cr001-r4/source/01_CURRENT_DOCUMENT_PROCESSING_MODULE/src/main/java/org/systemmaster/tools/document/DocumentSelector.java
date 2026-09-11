package org.systemmaster.tools.document;

import java.util.Objects;

/** Format-neutral selector used by governed document operations. */
public record DocumentSelector(Kind kind, String value) {
    public enum Kind { NODE_ID, NATIVE_PART, TEXT_QUERY, PAGE, SLIDE, ROOT }

    public DocumentSelector {
        Objects.requireNonNull(kind, "kind");
        value = Objects.requireNonNullElse(value, "").trim();
        if (kind != Kind.ROOT && value.isEmpty()) throw new IllegalArgumentException("selector value required");
        if (kind == Kind.PAGE || kind == Kind.SLIDE) {
            try {
                if (Integer.parseInt(value) < 1) throw new IllegalArgumentException("page/slide selector must be >= 1");
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("page/slide selector must be numeric", e);
            }
        }
        if (kind == Kind.NODE_ID && !(value.startsWith("n-") || value.startsWith("e-"))) {
            throw new IllegalArgumentException("node selector must use a CDG-1 n-* or CDG-2 e-* element id");
        }
        if (kind == Kind.NATIVE_PART && (value.startsWith("/") || value.contains("..") || value.contains("\\"))) {
            throw new IllegalArgumentException("unsafe native-part selector");
        }
    }

    public static DocumentSelector root() { return new DocumentSelector(Kind.ROOT, "root"); }
    public static DocumentSelector node(String id) { return new DocumentSelector(Kind.NODE_ID, id); }
    public static DocumentSelector nativePart(String part) { return new DocumentSelector(Kind.NATIVE_PART, part); }
}
