package org.systemmaster.tools.design;

import java.awt.image.BufferedImage;
import java.util.List;
import java.util.Objects;

/** Independent visual evaluation surface. It consumes a raster, not the layout model. */
public interface RenderedVisualCriticPort {
    record Critique(
            double visualBalance,
            double whitespace,
            double edgeSafety,
            double legibilityRiskScore,
            double overall,
            List<String> findings,
            String evaluatorId) {
        public Critique {
            score(visualBalance); score(whitespace); score(edgeSafety); score(legibilityRiskScore); score(overall);
            findings = List.copyOf(Objects.requireNonNull(findings, "findings"));
            evaluatorId = Objects.requireNonNull(evaluatorId, "evaluatorId").trim();
            if (evaluatorId.isEmpty()) throw new IllegalArgumentException("evaluatorId blank");
        }
        private static void score(double value) {
            if (!Double.isFinite(value) || value < 0 || value > 1) throw new IllegalArgumentException("score outside [0,1]");
        }
    }
    Critique critique(BufferedImage raster) throws Exception;
}
