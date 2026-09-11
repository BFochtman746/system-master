package org.systemmaster.tools.design;

import java.util.List;
import java.util.Objects;

/** Page archetype solver used by PDF/fixed-layout output and by reflow-document proof planning. */
public final class DeterministicPageLayoutSolver {
    public List<DocumentPageLayoutCandidate> solve(DocumentPageBrief brief, BrandDesignProfile brand) {
        Objects.requireNonNull(brief, "brief"); Objects.requireNonNull(brand, "brand");
        double m = brand.margin();
        return switch (brief.archetype()) {
            case COVER, TITLE_PAGE, SECTION_OPENER -> List.of(
                    candidate(brief, "editorial-cover", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .22, .72, .24, 34, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.BODY, m, .59, .58, .18, 15, 0, Math.max(0, brief.contentBlocks().size() - 1)))),
                    candidate(brief, "centered-cover", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, .16, .29, .68, .25, 32, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.BODY, .21, .64, .58, .14, 14, 0, Math.max(0, brief.contentBlocks().size() - 1)))));
            case FIGURE_FOCUS -> List.of(
                    candidate(brief, "figure-dominant", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 24, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.FIGURE, m, .24, .80, .48, 12, 0, Math.max(0, brief.contentBlocks().size() - 1)),
                            region(DocumentPageLayoutCandidate.Role.FOOTNOTE, m, .78, .80, .08, 9, 0, Math.max(0, brief.contentBlocks().size() - 1)))),
                    candidate(brief, "figure-caption-split", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 24, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.FIGURE, m, .25, .52, .50, 12, 0, Math.max(0, brief.contentBlocks().size() - 1)),
                            region(DocumentPageLayoutCandidate.Role.BODY, .64, .25, .28, .50, 13, 0, Math.max(0, brief.contentBlocks().size() - 1)))));
            case TABLE_FOCUS -> List.of(
                    candidate(brief, "table-wide", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 23, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.TABLE, m, .25, .80, .55, 10, 0, Math.max(0, brief.contentBlocks().size() - 1)))),
                    candidate(brief, "table-with-context", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 23, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.BODY, m, .23, .80, .16, 12, 0, Math.max(0, brief.contentBlocks().size() - 1)),
                            region(DocumentPageLayoutCandidate.Role.TABLE, m, .45, .80, .38, 9, 0, Math.max(0, brief.contentBlocks().size() - 1)))));
            default -> List.of(
                    candidate(brief, "single-column", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 23, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.BODY, m, .23, .70, .62, 12, 0, Math.max(0, brief.contentBlocks().size() - 1)))),
                    candidate(brief, "body-sidebar", List.of(
                            region(DocumentPageLayoutCandidate.Role.HEADING, m, .08, .80, .10, 23, 0, 0),
                            region(DocumentPageLayoutCandidate.Role.BODY, m, .23, .55, .62, 12, 0, Math.max(0, brief.contentBlocks().size() - 1)),
                            region(DocumentPageLayoutCandidate.Role.SIDEBAR, .69, .23, .23, .42, 10, 0, Math.max(0, brief.contentBlocks().size() - 1)))));
        };
    }

    private static DocumentPageLayoutCandidate candidate(DocumentPageBrief brief, String variant, List<DocumentPageLayoutCandidate.Region> regions) {
        return new DocumentPageLayoutCandidate("p" + brief.sequence() + "-" + variant, brief.sequence(), brief.archetype(), regions, variant);
    }
    private static DocumentPageLayoutCandidate.Region region(DocumentPageLayoutCandidate.Role role, double x, double y, double w, double h, int font, int start, int end) {
        return new DocumentPageLayoutCandidate.Region(role, new LayoutFrame(x, y, w, h), font, start, end);
    }
}
