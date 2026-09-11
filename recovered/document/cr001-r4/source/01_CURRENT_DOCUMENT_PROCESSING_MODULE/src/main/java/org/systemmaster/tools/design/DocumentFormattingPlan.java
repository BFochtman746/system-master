package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Semantic document-formatting plan. Page briefs are intent constraints; reflow output may paginate differently. */
public record DocumentFormattingPlan(
        String title,
        String audience,
        String purpose,
        List<DocumentPageBrief> sections) {
    public DocumentFormattingPlan {
        title = text(title, "title");
        audience = text(audience, "audience");
        purpose = text(purpose, "purpose");
        sections = List.copyOf(Objects.requireNonNull(sections, "sections"));
        if (sections.isEmpty()) throw new IllegalArgumentException("sections empty");
        int expected = 1;
        for (DocumentPageBrief section : sections) {
            if (section.sequence() != expected++) throw new IllegalArgumentException("section sequence gap");
        }
    }
    private static String text(String value, String name) {
        String v = Objects.requireNonNull(value, name).trim();
        if (v.isEmpty()) throw new IllegalArgumentException(name + " blank");
        return v;
    }
}
