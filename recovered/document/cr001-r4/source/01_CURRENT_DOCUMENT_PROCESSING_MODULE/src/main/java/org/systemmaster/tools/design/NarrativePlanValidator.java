package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/** Deterministic story-level checks. Generative systems cannot self-certify these conditions. */
public final class NarrativePlanValidator {
    public record Result(boolean valid, List<String> findings, double clarityScore, double evidenceScore) {
        public Result {
            findings = List.copyOf(Objects.requireNonNull(findings, "findings"));
            if (valid != findings.isEmpty()) throw new IllegalArgumentException("valid must match findings emptiness");
            score(clarityScore);
            score(evidenceScore);
        }
    }

    public Result validate(NarrativePlan plan) {
        Objects.requireNonNull(plan, "plan");
        ArrayList<String> findings = new ArrayList<>();
        Set<String> headlines = new HashSet<>();
        int expected = 1;
        int evidenceRequired = 0;
        int evidenceSatisfied = 0;
        int longSlides = 0;
        for (SlideBrief slide : plan.slides()) {
            if (slide.index() != expected) findings.add("SLIDE_INDEX_GAP expected=" + expected + " actual=" + slide.index());
            expected++;
            String normalized = slide.headline().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
            if (!headlines.add(normalized)) findings.add("DUPLICATE_HEADLINE slide=" + slide.index());
            if (slide.visibleCharacterCount() > 520) {
                longSlides++;
                findings.add("EXCESSIVE_VISIBLE_TEXT slide=" + slide.index());
            }
            if (slide.supportingPoints().size() > 7) findings.add("TOO_MANY_SUPPORTING_POINTS slide=" + slide.index());
            if (slide.evidenceExpected()) {
                evidenceRequired++;
                if (!slide.evidenceIds().isEmpty()) evidenceSatisfied++;
                else findings.add("EVIDENCE_REQUIRED slide=" + slide.index());
            }
        }
        if (plan.slides().size() > 60) findings.add("DECK_TOO_LONG_FOR_SINGLE_NARRATIVE");
        double evidence = evidenceRequired == 0 ? 1.0 : (double) evidenceSatisfied / evidenceRequired;
        double clarity = clamp(1.0 - 0.06 * findings.stream().filter(f -> !f.startsWith("EVIDENCE_REQUIRED")).count() - 0.04 * longSlides);
        return new Result(findings.isEmpty(), findings, clarity, evidence);
    }

    private static double clamp(double value) { return Math.max(0.0, Math.min(1.0, value)); }
    private static void score(double value) {
        if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException("score outside [0,1]");
    }
}
