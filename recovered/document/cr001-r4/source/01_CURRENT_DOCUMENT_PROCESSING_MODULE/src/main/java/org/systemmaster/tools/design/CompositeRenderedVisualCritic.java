package org.systemmaster.tools.design;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Combines deterministic raster proof with an optional local multimodal critic. The model can lower, never raise, deterministic evidence. */
public final class CompositeRenderedVisualCritic implements RenderedVisualCriticPort {
    private final RenderedVisualCriticPort deterministic;
    private final RenderedVisualCriticPort semantic;

    public CompositeRenderedVisualCritic(RenderedVisualCriticPort deterministic, RenderedVisualCriticPort semantic) {
        this.deterministic = Objects.requireNonNull(deterministic, "deterministic");
        this.semantic = Objects.requireNonNull(semantic, "semantic");
    }

    @Override
    public Critique critique(BufferedImage raster) throws Exception {
        Critique a = deterministic.critique(raster);
        Critique b = semantic.critique(raster);
        ArrayList<String> findings = new ArrayList<>(a.findings());
        for (String finding : b.findings()) if (!findings.contains(finding)) findings.add(finding);
        return new Critique(
                Math.min(a.visualBalance(), b.visualBalance()),
                Math.min(a.whitespace(), b.whitespace()),
                Math.min(a.edgeSafety(), b.edgeSafety()),
                Math.min(a.legibilityRiskScore(), b.legibilityRiskScore()),
                Math.min(a.overall(), b.overall()),
                List.copyOf(findings),
                "composite:" + a.evaluatorId() + "+" + b.evaluatorId());
    }
}
