package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Semantic page/section brief. Reflow formats may realize this as style/section constraints rather than fixed coordinates. */
public record DocumentPageBrief(
        int sequence,
        PageArchetype archetype,
        String heading,
        List<String> contentBlocks,
        List<String> evidenceIds) {
    public DocumentPageBrief {
        if (sequence < 1) throw new IllegalArgumentException("sequence");
        Objects.requireNonNull(archetype, "archetype");
        heading = Objects.requireNonNull(heading, "heading").trim();
        if (heading.isEmpty()) throw new IllegalArgumentException("heading blank");
        contentBlocks = contentBlocks == null ? List.of() : contentBlocks.stream().map(v -> Objects.requireNonNull(v, "contentBlock").trim()).filter(v -> !v.isEmpty()).toList();
        evidenceIds = evidenceIds == null ? List.of() : evidenceIds.stream().map(v -> Objects.requireNonNull(v, "evidenceId").trim()).filter(v -> !v.isEmpty()).distinct().toList();
    }
}
