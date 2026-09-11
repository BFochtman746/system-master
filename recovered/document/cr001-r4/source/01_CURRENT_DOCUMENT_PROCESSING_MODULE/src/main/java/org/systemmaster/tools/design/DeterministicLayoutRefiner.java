package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Bounded critic-driven refinement. It may adjust geometry/type but never rewrite semantic claims. */
public final class DeterministicLayoutRefiner {
    public SlideLayoutCandidate refine(
            SlideLayoutCandidate source,
            BrandDesignProfile brand,
            RenderedVisualCriticPort.Critique critique) {
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(brand, "brand");
        Objects.requireNonNull(critique, "critique");
        double margin = brand.margin();
        ArrayList<SlideLayoutCandidate.TextElement> elements = new ArrayList<>();
        for (var element : source.elements()) {
            LayoutFrame f = element.frame();
            double x = f.x();
            double y = f.y();
            double w = f.width();
            double h = f.height();
            int font = element.fontPt();
            if (critique.edgeSafety() < .92) {
                x = Math.max(margin, x);
                y = Math.max(margin, y);
                w = Math.min(w, Math.max(.05, 1 - margin - x));
                h = Math.min(h, Math.max(.04, 1 - margin - y));
            }
            if (critique.whitespace() < .90 && element.role() == SlideLayoutCandidate.Role.BODY) {
                w *= .92;
                h *= .92;
            }
            if (critique.legibilityRiskScore() < .90 && element.role() == SlideLayoutCandidate.Role.BODY) {
                font = Math.min(24, font + 1);
            }
            if (critique.visualBalance() < .88 && (element.role() == SlideLayoutCandidate.Role.TITLE || element.role() == SlideLayoutCandidate.Role.EMPHASIS)) {
                double center = x + w / 2.0;
                double targetCenter = .50;
                x = clamp(x + (targetCenter - center) * .18, margin, 1 - margin - w);
            }
            elements.add(new SlideLayoutCandidate.TextElement(element.role(), element.text(), new LayoutFrame(x, y, w, h), font, element.bold(), element.rgb(), element.fontFamily()));
        }
        return new SlideLayoutCandidate(source.candidateId() + "-r1", source.slideIndex(), source.archetype(), List.copyOf(elements), source.variant() + "-refined");
    }

    private static double clamp(double value, double min, double max) { return Math.max(min, Math.min(max, value)); }
}
