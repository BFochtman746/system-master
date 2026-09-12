package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** One deterministic layout proposal for a semantic slide brief. */
public record SlideLayoutCandidate(
        String candidateId,
        int slideIndex,
        SlideArchetype archetype,
        List<TextElement> elements,
        String variant) {
    public enum Role { KICKER, TITLE, BODY, EMPHASIS, CAPTION }
    public record TextElement(Role role, String text, LayoutFrame frame, int fontPt, boolean bold, String rgb, String fontFamily) {
        public TextElement {
            Objects.requireNonNull(role, "role");
            text = Objects.requireNonNull(text, "text").trim();
            if (text.isEmpty()) throw new IllegalArgumentException("text must not be blank");
            Objects.requireNonNull(frame, "frame");
            if (fontPt < 9 || fontPt > 72) throw new IllegalArgumentException("fontPt outside [9,72]");
            rgb = normalizeRgb(rgb);
            fontFamily = Objects.requireNonNull(fontFamily, "fontFamily").trim();
            if (fontFamily.isEmpty()) throw new IllegalArgumentException("fontFamily blank");
        }
        private static String normalizeRgb(String value) {
            String v = Objects.requireNonNull(value, "rgb").trim().replace("#", "").toUpperCase(java.util.Locale.ROOT);
            if (!v.matches("[0-9A-F]{6}")) throw new IllegalArgumentException("rgb must be 6-digit hex");
            return v;
        }
    }
    public SlideLayoutCandidate {
        candidateId = require(candidateId, "candidateId");
        if (slideIndex < 1) throw new IllegalArgumentException("slideIndex");
        Objects.requireNonNull(archetype, "archetype");
        elements = List.copyOf(Objects.requireNonNull(elements, "elements"));
        if (elements.isEmpty()) throw new IllegalArgumentException("elements empty");
        variant = require(variant, "variant");
    }
    private static String require(String s, String name) {
        String v = Objects.requireNonNull(s, name).trim();
        if (v.isEmpty()) throw new IllegalArgumentException(name + " blank");
        return v;
    }
}
