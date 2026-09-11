package org.systemmaster.tools.design;

import org.systemmaster.tools.pptx.PptxPackageEngine;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

public final class MasterpiecePptxRenderQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <soffice> <pdftoppm>");
        BrandDesignProfile brand = BrandDesignProfile.executiveDefault("render-qualified-brand-v1");
        NarrativePlan plan = new NarrativePlan(
                "Masterpiece qualification",
                "executive leadership",
                "communicate a clear decision",
                "A disciplined narrative and measured layout improve comprehension.",
                List.of(
                        new SlideBrief(1, SlideArchetype.TITLE, "Design quality should be measured after rendering", List.of("Local Windows design qualification"), "", List.of()),
                        new SlideBrief(2, SlideArchetype.ASSERTION_EVIDENCE, "Rendered evidence catches failures layout math cannot see", List.of("Independent raster critic", "Hard layout constraints", "Final proof gate"), "", List.of("Q-001")),
                        new SlideBrief(3, SlideArchetype.COMPARISON, "Evidence-driven design beats one-shot template generation", List.of("Measured: candidates are rendered and compared", "One-shot: output is accepted without visual proof"), "", List.of("Q-002"))));
        MasterpieceDesignContract contract = MasterpieceDesignContract.strictPresentation(plan.audience(), plan.objective(), brand.id());
        LocalPresentationRasterizer rasterizer = new LocalPresentationRasterizer(Path.of(args[0]), Path.of(args[1]), Duration.ofSeconds(60), 64L * 1024 * 1024, 120);
        DeterministicRenderedVisualCritic critic = new DeterministicRenderedVisualCritic();
        MasterpieceOptimizationEngine.Result result = new MasterpieceOptimizationEngine().build(plan, brand, contract, rasterizer, critic);

        check(result.pptx().length > 1000, "pptx produced");
        check(result.selections().size() == 3, "three slides selected");
        check(result.selections().stream().allMatch(s -> s.evaluated().size() >= 2), "multiple real rendered candidates per slide");
        check(result.finalVisualProof().size() == 3, "three final slide raster proofs");
        check(result.finalVisualProof().stream().allMatch(c -> c.overall() >= .82), "final raster quality strong");
        check(result.finalVisualProof().stream().allMatch(c -> c.findings().isEmpty()), "no critical raster findings");
        check(result.qualityDecision().passed(), "quality gate passes: " + result.qualityDecision().blockers());
        check(result.overallScore() >= .86, "overall score passes");
        check(result.rasterizerId().contains("libreoffice-poppler"), "independent rasterizer recorded");
        PptxPackageEngine.Inspection inspection = new PptxPackageEngine().inspect(result.pptx());
        check(inspection.slides().size() == 3, "reopen slide count");
        check(inspection.activeContent().isEmpty(), "no active content");
        check(inspection.externalTargets().isEmpty(), "no external targets");
        check(inspection.slides().get(1).texts().stream().anyMatch(t -> t.contains("Rendered evidence")), "semantic headline preserved");

        System.out.println("MASTERPIECE_PPTX_RENDER_QUALIFICATION_PASS assertions=" + n + " candidates=" + result.selections().stream().mapToInt(s -> s.evaluated().size()).sum() + " overall=" + result.overallScore());
    }

    private static void check(boolean condition, String message) { n++; if (!condition) throw new AssertionError(message); }
}
