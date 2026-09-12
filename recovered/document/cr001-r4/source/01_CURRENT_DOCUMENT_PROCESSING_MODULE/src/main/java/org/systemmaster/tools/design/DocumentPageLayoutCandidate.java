package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Format-neutral page composition proposal for proof and fixed-layout export. */
public record DocumentPageLayoutCandidate(
        String candidateId,
        int sequence,
        PageArchetype archetype,
        List<Region> regions,
        String variant) {
    public enum Role { HEADING, BODY, SIDEBAR, FIGURE, TABLE, QUOTE, FOOTNOTE }
    public record Region(Role role, LayoutFrame frame, int fontPt, int contentBlockStart, int contentBlockEnd) {
        public Region {
            Objects.requireNonNull(role, "role"); Objects.requireNonNull(frame, "frame");
            if (fontPt < 8 || fontPt > 72) throw new IllegalArgumentException("fontPt");
            if (contentBlockStart < 0 || contentBlockEnd < contentBlockStart) throw new IllegalArgumentException("content block range");
        }
    }
    public DocumentPageLayoutCandidate {
        candidateId = Objects.requireNonNull(candidateId, "candidateId").trim();
        if (candidateId.isEmpty()) throw new IllegalArgumentException("candidateId blank");
        if (sequence < 1) throw new IllegalArgumentException("sequence");
        Objects.requireNonNull(archetype, "archetype");
        regions = List.copyOf(Objects.requireNonNull(regions, "regions"));
        if (regions.isEmpty()) throw new IllegalArgumentException("regions empty");
        variant = Objects.requireNonNull(variant, "variant").trim();
        if (variant.isEmpty()) throw new IllegalArgumentException("variant blank");
    }
}
