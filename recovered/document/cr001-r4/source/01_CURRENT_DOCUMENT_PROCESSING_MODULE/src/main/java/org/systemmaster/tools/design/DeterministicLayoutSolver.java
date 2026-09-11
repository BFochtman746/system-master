package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Grid-based layout generator. Same inputs produce the same candidates and ordering. */
public final class DeterministicLayoutSolver {
    public List<SlideLayoutCandidate> solve(SlideBrief brief, BrandDesignProfile brand) {
        Objects.requireNonNull(brief, "brief");
        Objects.requireNonNull(brand, "brand");
        return switch (brief.archetype()) {
            case TITLE, SECTION_DIVIDER -> titleCandidates(brief, brand);
            case KPI, QUOTE -> emphasisCandidates(brief, brand);
            case COMPARISON -> comparisonCandidates(brief, brand);
            default -> contentCandidates(brief, brand);
        };
    }

    private static List<SlideLayoutCandidate> titleCandidates(SlideBrief brief, BrandDesignProfile brand) {
        double m = brand.margin();
        ArrayList<SlideLayoutCandidate> out = new ArrayList<>();
        out.add(candidate(brief, brand, "hero-left", List.of(
                text(SlideLayoutCandidate.Role.KICKER, brief.archetype() == SlideArchetype.TITLE ? "PRESENTATION" : "SECTION", m, .15, .30, .05, 13, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .27, .72, .30, 38, true, brand.primaryTextRgb(), brand.headingFont()),
                optionalBody(brief, brand, m, .65, .62, .16, 18))));
        out.add(candidate(brief, brand, "hero-centered", List.of(
                text(SlideLayoutCandidate.Role.KICKER, "KEY MESSAGE", .34, .18, .32, .05, 13, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.TITLE, brief.headline(), .14, .32, .72, .28, 36, true, brand.primaryTextRgb(), brand.headingFont()),
                optionalBody(brief, brand, .20, .66, .60, .14, 17))));
        return clean(out);
    }

    private static List<SlideLayoutCandidate> contentCandidates(SlideBrief brief, BrandDesignProfile brand) {
        double m = brand.margin();
        String body = body(brief);
        ArrayList<SlideLayoutCandidate> out = new ArrayList<>();
        out.add(candidate(brief, brand, "editorial-left", List.of(
                text(SlideLayoutCandidate.Role.KICKER, label(brief.archetype()), m, .07, .24, .04, 12, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .14, .78, .18, 30, true, brand.primaryTextRgb(), brand.headingFont()),
                text(SlideLayoutCandidate.Role.BODY, body, m, .39, .68, .43, 18, false, brand.primaryTextRgb(), brand.bodyFont()))));
        out.add(candidate(brief, brand, "split-message", List.of(
                text(SlideLayoutCandidate.Role.KICKER, label(brief.archetype()), m, .08, .22, .04, 12, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .18, .43, .38, 32, true, brand.primaryTextRgb(), brand.headingFont()),
                text(SlideLayoutCandidate.Role.BODY, body, .55, .20, .38, .55, 17, false, brand.primaryTextRgb(), brand.bodyFont()))));
        out.add(candidate(brief, brand, "top-message", List.of(
                text(SlideLayoutCandidate.Role.KICKER, label(brief.archetype()), m, .06, .24, .04, 12, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .13, .82, .17, 30, true, brand.primaryTextRgb(), brand.headingFont()),
                text(SlideLayoutCandidate.Role.BODY, body, m, .39, .82, .39, 18, false, brand.primaryTextRgb(), brand.bodyFont()))));
        return clean(out);
    }

    private static List<SlideLayoutCandidate> emphasisCandidates(SlideBrief brief, BrandDesignProfile brand) {
        double m = brand.margin();
        String body = body(brief);
        ArrayList<SlideLayoutCandidate> out = new ArrayList<>();
        out.add(candidate(brief, brand, "big-number", List.of(
                text(SlideLayoutCandidate.Role.KICKER, label(brief.archetype()), m, .09, .24, .04, 12, true, brand.accentRgb(), brand.bodyFont()),
                text(SlideLayoutCandidate.Role.EMPHASIS, brief.headline(), m, .27, .76, .27, 42, true, brand.primaryTextRgb(), brand.headingFont()),
                text(SlideLayoutCandidate.Role.BODY, body, m, .63, .65, .15, 17, false, brand.mutedTextRgb(), brand.bodyFont()))));
        out.add(candidate(brief, brand, "emphasis-side", List.of(
                text(SlideLayoutCandidate.Role.EMPHASIS, brief.headline(), m, .18, .46, .43, 38, true, brand.primaryTextRgb(), brand.headingFont()),
                text(SlideLayoutCandidate.Role.BODY, body, .59, .25, .34, .36, 18, false, brand.primaryTextRgb(), brand.bodyFont()))));
        return clean(out);
    }

    private static List<SlideLayoutCandidate> comparisonCandidates(SlideBrief brief, BrandDesignProfile brand) {
        double m = brand.margin();
        List<String> points = brief.supportingPoints();
        String left = points.isEmpty() ? "Option A" : points.get(0);
        String right = points.size() < 2 ? "Option B" : String.join("\n", points.subList(1, points.size()));
        return List.of(
                candidate(brief, brand, "comparison-columns", List.of(
                        text(SlideLayoutCandidate.Role.KICKER, "COMPARISON", m, .06, .24, .04, 12, true, brand.accentRgb(), brand.bodyFont()),
                        text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .13, .82, .16, 29, true, brand.primaryTextRgb(), brand.headingFont()),
                        text(SlideLayoutCandidate.Role.BODY, left, m, .38, .39, .37, 18, false, brand.primaryTextRgb(), brand.bodyFont()),
                        text(SlideLayoutCandidate.Role.BODY, right, .54, .38, .39, .37, 18, false, brand.primaryTextRgb(), brand.bodyFont()))),
                candidate(brief, brand, "comparison-stacked", List.of(
                        text(SlideLayoutCandidate.Role.TITLE, brief.headline(), m, .10, .80, .15, 28, true, brand.primaryTextRgb(), brand.headingFont()),
                        text(SlideLayoutCandidate.Role.BODY, left, m, .35, .80, .17, 18, false, brand.primaryTextRgb(), brand.bodyFont()),
                        text(SlideLayoutCandidate.Role.BODY, right, m, .61, .80, .17, 18, false, brand.primaryTextRgb(), brand.bodyFont()))));
    }

    private static SlideLayoutCandidate candidate(SlideBrief brief, BrandDesignProfile brand, String variant, List<SlideLayoutCandidate.TextElement> raw) {
        List<SlideLayoutCandidate.TextElement> elements = raw.stream().filter(Objects::nonNull).toList();
        return new SlideLayoutCandidate("s" + brief.index() + "-" + variant + "-" + brand.id(), brief.index(), brief.archetype(), elements, variant);
    }

    private static SlideLayoutCandidate.TextElement optionalBody(SlideBrief brief, BrandDesignProfile brand, double x, double y, double w, double h, int pt) {
        if (brief.supportingPoints().isEmpty()) return null;
        return text(SlideLayoutCandidate.Role.BODY, body(brief), x, y, w, h, pt, false, brand.mutedTextRgb(), brand.bodyFont());
    }

    private static SlideLayoutCandidate.TextElement text(SlideLayoutCandidate.Role role, String text, double x, double y, double w, double h, int pt, boolean bold, String rgb, String font) {
        return new SlideLayoutCandidate.TextElement(role, text, new LayoutFrame(x, y, w, h), pt, bold, rgb, font);
    }

    private static String body(SlideBrief brief) {
        if (brief.supportingPoints().isEmpty()) return "Supporting detail intentionally omitted.";
        return String.join("\n", brief.supportingPoints());
    }

    private static String label(SlideArchetype archetype) { return archetype.name().replace('_', ' '); }
    private static List<SlideLayoutCandidate> clean(List<SlideLayoutCandidate> values) { return List.copyOf(values); }
}
