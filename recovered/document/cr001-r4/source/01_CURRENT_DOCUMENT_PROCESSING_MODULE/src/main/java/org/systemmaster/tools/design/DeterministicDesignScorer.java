package org.systemmaster.tools.design;

import java.util.EnumMap;
import java.util.Map;
import java.util.Objects;

/** Evidence-bound non-generative score producer for candidate layouts. */
public final class DeterministicDesignScorer {
    public record Score(Map<MasterpieceDesignContract.Dimension, Double> dimensions, double overall, String evaluatorId) {
        public Score {
            dimensions = Map.copyOf(Objects.requireNonNull(dimensions, "dimensions"));
            if (!dimensions.keySet().containsAll(java.util.Set.of(MasterpieceDesignContract.Dimension.values()))) throw new IllegalArgumentException("all dimensions required");
            if (!Double.isFinite(overall) || overall < 0 || overall > 1) throw new IllegalArgumentException("overall");
            evaluatorId = Objects.requireNonNull(evaluatorId, "evaluatorId");
        }
    }

    private final NarrativePlanValidator narrativeValidator = new NarrativePlanValidator();
    private final LayoutConstraintValidator layoutValidator = new LayoutConstraintValidator();

    public Score score(NarrativePlan plan, SlideBrief brief, SlideLayoutCandidate candidate, BrandDesignProfile brand) {
        Objects.requireNonNull(plan, "plan"); Objects.requireNonNull(brief, "brief"); Objects.requireNonNull(candidate, "candidate"); Objects.requireNonNull(brand, "brand");
        var narrative = narrativeValidator.validate(plan);
        var layout = layoutValidator.validate(candidate, brand);
        EnumMap<MasterpieceDesignContract.Dimension, Double> s = new EnumMap<>(MasterpieceDesignContract.Dimension.class);
        s.put(MasterpieceDesignContract.Dimension.NARRATIVE_CLARITY, narrative.clarityScore());
        s.put(MasterpieceDesignContract.Dimension.INFORMATION_HIERARCHY, hierarchy(candidate));
        s.put(MasterpieceDesignContract.Dimension.TYPOGRAPHY, typography(candidate));
        s.put(MasterpieceDesignContract.Dimension.ALIGNMENT_AND_GRID, layout.alignmentScore());
        s.put(MasterpieceDesignContract.Dimension.WHITESPACE, layout.whitespaceScore());
        s.put(MasterpieceDesignContract.Dimension.COLOR_AND_CONTRAST, brand.passesNormalTextContrast() ? .96 : .55);
        s.put(MasterpieceDesignContract.Dimension.IMAGE_AND_CROP_QUALITY, brief.archetype() == SlideArchetype.IMAGE_STORY ? 0.0 : .92);
        s.put(MasterpieceDesignContract.Dimension.CHART_AND_DIAGRAM_CLARITY, brief.archetype() == SlideArchetype.CHART_INSIGHT ? 0.0 : .92);
        s.put(MasterpieceDesignContract.Dimension.DENSITY_AND_LEGIBILITY, layout.densityScore());
        s.put(MasterpieceDesignContract.Dimension.BRAND_CONSISTENCY, brandConsistency(candidate, brand));
        s.put(MasterpieceDesignContract.Dimension.CROSS_PAGE_OR_SLIDE_RHYTHM, .90);
        s.put(MasterpieceDesignContract.Dimension.ACCESSIBILITY, brand.passesNormalTextContrast() && minFont(candidate) >= 12 ? .94 : .62);
        s.put(MasterpieceDesignContract.Dimension.EVIDENCE_AND_PROVENANCE, narrative.evidenceScore());
        double total = 0;
        for (double value : s.values()) total += value;
        return new Score(s, total / s.size(), "deterministic-design-scorer-v1");
    }

    private static double hierarchy(SlideLayoutCandidate candidate) {
        int maxTitle = candidate.elements().stream().filter(e -> e.role() == SlideLayoutCandidate.Role.TITLE || e.role() == SlideLayoutCandidate.Role.EMPHASIS).mapToInt(SlideLayoutCandidate.TextElement::fontPt).max().orElse(0);
        int maxBody = candidate.elements().stream().filter(e -> e.role() == SlideLayoutCandidate.Role.BODY).mapToInt(SlideLayoutCandidate.TextElement::fontPt).max().orElse(14);
        if (maxTitle == 0) return .55;
        double ratio = (double) maxTitle / Math.max(1, maxBody);
        return clamp(.80 + Math.min(.18, Math.max(0, ratio - 1.20) * .22));
    }

    private static double typography(SlideLayoutCandidate candidate) {
        boolean small = candidate.elements().stream().anyMatch(e -> e.role() == SlideLayoutCandidate.Role.BODY && e.fontPt() < 14);
        boolean boldTitle = candidate.elements().stream().anyMatch(e -> (e.role() == SlideLayoutCandidate.Role.TITLE || e.role() == SlideLayoutCandidate.Role.EMPHASIS) && e.bold());
        return small ? .60 : boldTitle ? .95 : .84;
    }

    private static double brandConsistency(SlideLayoutCandidate candidate, BrandDesignProfile brand) {
        long correctFonts = candidate.elements().stream().filter(e -> e.fontFamily().equals(brand.headingFont()) || e.fontFamily().equals(brand.bodyFont())).count();
        long allowedColors = candidate.elements().stream().filter(e -> e.rgb().equals(brand.primaryTextRgb()) || e.rgb().equals(brand.mutedTextRgb()) || e.rgb().equals(brand.accentRgb())).count();
        return clamp((correctFonts + allowedColors) / (2.0 * candidate.elements().size()));
    }

    private static int minFont(SlideLayoutCandidate c) { return c.elements().stream().mapToInt(SlideLayoutCandidate.TextElement::fontPt).min().orElse(0); }
    private static double clamp(double v) { return Math.max(0, Math.min(1, v)); }
}
