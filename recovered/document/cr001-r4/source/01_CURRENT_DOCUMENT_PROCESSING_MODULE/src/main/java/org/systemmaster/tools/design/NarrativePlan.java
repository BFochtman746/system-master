package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Auditable story architecture produced before slide layout. */
public record NarrativePlan(
        String title,
        String audience,
        String objective,
        String thesis,
        List<SlideBrief> slides) {
    public NarrativePlan {
        title = requireText(title, "title");
        audience = requireText(audience, "audience");
        objective = requireText(objective, "objective");
        thesis = requireText(thesis, "thesis");
        slides = List.copyOf(Objects.requireNonNull(slides, "slides"));
        if (slides.isEmpty()) throw new IllegalArgumentException("slides must not be empty");
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
