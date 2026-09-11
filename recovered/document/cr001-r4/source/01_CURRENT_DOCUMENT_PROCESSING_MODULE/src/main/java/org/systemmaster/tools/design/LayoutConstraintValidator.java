package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Hard geometry and legibility constraints. */
public final class LayoutConstraintValidator {
    public record Result(boolean valid, List<String> findings, double alignmentScore, double whitespaceScore, double densityScore) {
        public Result {
            findings = List.copyOf(Objects.requireNonNull(findings, "findings"));
            if (valid != findings.isEmpty()) throw new IllegalArgumentException("valid mismatch");
            score(alignmentScore); score(whitespaceScore); score(densityScore);
        }
    }

    public Result validate(SlideLayoutCandidate candidate, BrandDesignProfile brand) {
        Objects.requireNonNull(candidate, "candidate");
        Objects.requireNonNull(brand, "brand");
        ArrayList<String> findings = new ArrayList<>();
        double usedArea = 0;
        int charCount = 0;
        int offGrid = 0;
        int comparisons = 0;
        int overlaps = 0;
        for (int i = 0; i < candidate.elements().size(); i++) {
            var e = candidate.elements().get(i);
            LayoutFrame f = e.frame();
            usedArea += f.area();
            charCount += e.text().length();
            if (f.x() < brand.margin() - .012 || f.right() > 1 - brand.margin() + .012) findings.add("MARGIN_VIOLATION role=" + e.role());
            if (e.role() == SlideLayoutCandidate.Role.BODY && e.fontPt() < 14) findings.add("BODY_TEXT_TOO_SMALL");
            if (!nearGrid(f.x(), brand.margin(), brand.gutter()) || !nearGrid(f.y(), brand.margin(), brand.gutter())) offGrid++;
            for (int j = i + 1; j < candidate.elements().size(); j++) {
                comparisons++;
                double overlap = f.overlapArea(candidate.elements().get(j).frame());
                if (overlap > .001) {
                    overlaps++;
                    findings.add("ELEMENT_OVERLAP roles=" + e.role() + "+" + candidate.elements().get(j).role());
                }
            }
        }
        double alignment = clamp(1.0 - .03 * offGrid - .25 * overlaps);
        double targetUsed = switch (brand.density()) { case AIRY -> .32; case BALANCED -> .43; case DENSE -> .54; };
        double whitespace = clamp(1.0 - Math.abs(usedArea - targetUsed) * 1.15);
        double charBudget = switch (brand.density()) { case AIRY -> 260.0; case BALANCED -> 380.0; case DENSE -> 520.0; };
        double density = clamp(1.0 - Math.max(0, charCount - charBudget) / charBudget);
        if (density < .70) findings.add("TEXT_DENSITY_EXCESSIVE chars=" + charCount);
        return new Result(findings.isEmpty(), findings, alignment, whitespace, density);
    }

    private static boolean nearGrid(double value, double margin, double gutter) {
        if (Math.abs(value - margin) < .015) return true;
        double unit = .05 + gutter;
        double nearest = Math.rint((value - margin) / unit) * unit + margin;
        return Math.abs(value - nearest) < .022;
    }
    private static double clamp(double v) { return Math.max(0, Math.min(1, v)); }
    private static void score(double v) { if (!Double.isFinite(v) || v < 0 || v > 1) throw new IllegalArgumentException("score"); }
}
