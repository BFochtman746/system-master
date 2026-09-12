package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Format-neutral semantic brief. Layout is deliberately absent. */
public record SlideBrief(
        int index,
        SlideArchetype archetype,
        String headline,
        List<String> supportingPoints,
        String speakerNotes,
        List<String> evidenceIds) {
    public SlideBrief {
        if (index < 1) throw new IllegalArgumentException("index must be >= 1");
        Objects.requireNonNull(archetype, "archetype");
        headline = requireText(headline, "headline");
        supportingPoints = supportingPoints == null ? List.of() : supportingPoints.stream()
                .map(v -> requireText(v, "supportingPoint")).toList();
        speakerNotes = speakerNotes == null ? "" : speakerNotes.trim();
        evidenceIds = evidenceIds == null ? List.of() : evidenceIds.stream()
                .map(v -> requireText(v, "evidenceId")).distinct().toList();
    }

    public int visibleCharacterCount() {
        int count = headline.length();
        for (String point : supportingPoints) count += point.length();
        return count;
    }

    public boolean evidenceExpected() {
        return switch (archetype) {
            case ASSERTION_EVIDENCE, KPI, COMPARISON, CHART_INSIGHT, DECISION -> true;
            default -> false;
        };
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
