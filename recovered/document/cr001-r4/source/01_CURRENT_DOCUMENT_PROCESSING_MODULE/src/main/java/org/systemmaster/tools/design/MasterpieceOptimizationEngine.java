package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Generate multiple PPTX candidates, batch-render them, independently critique pixels, select, and prove a final deck. */
public final class MasterpieceOptimizationEngine {
    public record CandidateEvaluation(
            SlideLayoutCandidate candidate,
            DeterministicDesignScorer.Score deterministic,
            RenderedVisualCriticPort.Critique visual,
            double combinedScore) {
        public CandidateEvaluation {
            Objects.requireNonNull(candidate, "candidate"); Objects.requireNonNull(deterministic, "deterministic"); Objects.requireNonNull(visual, "visual");
            if (!Double.isFinite(combinedScore) || combinedScore < 0 || combinedScore > 1) throw new IllegalArgumentException("combinedScore");
        }
    }
    public record SlideSelection(int slideIndex, CandidateEvaluation selected, List<CandidateEvaluation> evaluated) {
        public SlideSelection {
            if (slideIndex < 1) throw new IllegalArgumentException("slideIndex");
            Objects.requireNonNull(selected, "selected");
            evaluated = List.copyOf(Objects.requireNonNull(evaluated, "evaluated"));
            if (evaluated.size() < 2) throw new IllegalArgumentException("multiple candidates must be evaluated");
        }
    }
    public record Result(
            byte[] pptx,
            List<SlideSelection> selections,
            List<RenderedVisualCriticPort.Critique> finalVisualProof,
            MasterpieceQualityGate.Decision qualityDecision,
            Map<MasterpieceDesignContract.Dimension, Double> finalScores,
            double overallScore,
            String rasterizerId,
            int previewCandidateCount,
            int refinementCandidateCount) {
        public Result {
            pptx = pptx.clone();
            selections = List.copyOf(Objects.requireNonNull(selections, "selections"));
            finalVisualProof = List.copyOf(Objects.requireNonNull(finalVisualProof, "finalVisualProof"));
            Objects.requireNonNull(qualityDecision, "qualityDecision");
            finalScores = Map.copyOf(Objects.requireNonNull(finalScores, "finalScores"));
            rasterizerId = Objects.requireNonNull(rasterizerId, "rasterizerId");
            if (previewCandidateCount < 2) throw new IllegalArgumentException("previewCandidateCount");
            if (refinementCandidateCount < 0) throw new IllegalArgumentException("refinementCandidateCount");
        }
    }
    private record Seed(SlideBrief brief, SlideLayoutCandidate candidate, DeterministicDesignScorer.Score score) { }

    private final DeterministicLayoutSolver solver = new DeterministicLayoutSolver();
    private final DeterministicDesignScorer scorer = new DeterministicDesignScorer();
    private final LayoutConstraintValidator constraints = new LayoutConstraintValidator();
    private final MasterpiecePptxExporter exporter = new MasterpiecePptxExporter();
    private final MasterpieceQualityGate gate = new MasterpieceQualityGate();
    private final DeterministicLayoutRefiner refiner = new DeterministicLayoutRefiner();

    public Result build(
            NarrativePlan plan,
            BrandDesignProfile brand,
            MasterpieceDesignContract contract,
            PresentationRasterizerPort rasterizer,
            RenderedVisualCriticPort critic) throws Exception {
        Objects.requireNonNull(plan, "plan"); Objects.requireNonNull(brand, "brand"); Objects.requireNonNull(contract, "contract"); Objects.requireNonNull(rasterizer, "rasterizer"); Objects.requireNonNull(critic, "critic");
        var narrative = new NarrativePlanValidator().validate(plan);
        if (!narrative.valid()) throw new IllegalArgumentException("narrative plan failed validation: " + narrative.findings());

        ArrayList<Seed> seeds = new ArrayList<>();
        Map<Integer, Integer> validPerSlide = new LinkedHashMap<>();
        for (SlideBrief brief : plan.slides()) {
            for (SlideLayoutCandidate candidate : solver.solve(brief, brand)) {
                var constraint = constraints.validate(candidate, brand);
                if (!constraint.valid()) continue;
                seeds.add(new Seed(brief, candidate, scorer.score(plan, brief, candidate, brand)));
                validPerSlide.merge(brief.index(), 1, Integer::sum);
            }
        }
        for (SlideBrief brief : plan.slides()) {
            if (validPerSlide.getOrDefault(brief.index(), 0) < 2) throw new IllegalStateException("fewer than two valid candidates for slide " + brief.index());
        }

        NarrativePlan previewPlan = previewPlan(plan, seeds);
        List<SlideLayoutCandidate> previewCandidates = new ArrayList<>();
        for (int i = 0; i < seeds.size(); i++) previewCandidates.add(reindex(seeds.get(i).candidate(), i + 1));
        byte[] previewPptx = exporter.export(previewPlan, brand, previewCandidates);
        List<PresentationRasterizerPort.RasterizedSlide> previewRasters = rasterizer.rasterize(previewPptx);
        if (previewRasters.size() != seeds.size()) throw new IllegalStateException("preview render count mismatch expected=" + seeds.size() + " actual=" + previewRasters.size());

        Map<Integer, List<CandidateEvaluation>> bySlide = new LinkedHashMap<>();
        for (int i = 0; i < seeds.size(); i++) {
            Seed seed = seeds.get(i);
            var visual = critic.critique(previewRasters.get(i).image());
            double combined = clamp(.64 * seed.score().overall() + .36 * visual.overall());
            bySlide.computeIfAbsent(seed.brief().index(), ignored -> new ArrayList<>())
                    .add(new CandidateEvaluation(seed.candidate(), seed.score(), visual, combined));
        }

        ArrayList<SlideSelection> selections = new ArrayList<>();
        for (SlideBrief brief : plan.slides()) {
            ArrayList<CandidateEvaluation> evals = new ArrayList<>(bySlide.getOrDefault(brief.index(), List.of()));
            evals.sort(Comparator.comparingDouble(CandidateEvaluation::combinedScore).reversed().thenComparing(e -> e.candidate().candidateId()));
            if (evals.size() < 2) throw new IllegalStateException("fewer than two rendered candidates for slide " + brief.index());
            selections.add(new SlideSelection(brief.index(), evals.getFirst(), evals));
        }

        ArrayList<Seed> refinementSeeds = new ArrayList<>();
        for (SlideSelection selection : selections) {
            var visual = selection.selected().visual();
            if (visual.overall() < .88 || !visual.findings().isEmpty()) {
                SlideBrief brief = plan.slides().get(selection.slideIndex() - 1);
                SlideLayoutCandidate refined = refiner.refine(selection.selected().candidate(), brand, visual);
                if (constraints.validate(refined, brand).valid()) refinementSeeds.add(new Seed(brief, refined, scorer.score(plan, brief, refined, brand)));
            }
        }
        if (!refinementSeeds.isEmpty()) {
            byte[] refinePreview = exporter.export(previewPlan(plan, refinementSeeds), brand,
                    java.util.stream.IntStream.range(0, refinementSeeds.size()).mapToObj(i -> reindex(refinementSeeds.get(i).candidate(), i + 1)).toList());
            List<PresentationRasterizerPort.RasterizedSlide> refinedRasters = rasterizer.rasterize(refinePreview);
            if (refinedRasters.size() != refinementSeeds.size()) throw new IllegalStateException("refinement render count mismatch");
            for (int i = 0; i < refinementSeeds.size(); i++) {
                Seed seed = refinementSeeds.get(i);
                var visual = critic.critique(refinedRasters.get(i).image());
                CandidateEvaluation refinedEval = new CandidateEvaluation(seed.candidate(), seed.score(), visual, clamp(.64 * seed.score().overall() + .36 * visual.overall()));
                int selectionIndex = seed.brief().index() - 1;
                SlideSelection current = selections.get(selectionIndex);
                ArrayList<CandidateEvaluation> all = new ArrayList<>(current.evaluated());
                all.add(refinedEval);
                all.sort(Comparator.comparingDouble(CandidateEvaluation::combinedScore).reversed().thenComparing(e -> e.candidate().candidateId()));
                CandidateEvaluation winner = all.getFirst();
                selections.set(selectionIndex, new SlideSelection(current.slideIndex(), winner, all));
            }
        }

        List<SlideLayoutCandidate> selectedCandidates = selections.stream().map(s -> s.selected().candidate()).toList();
        byte[] pptx = exporter.export(plan, brand, selectedCandidates);
        List<PresentationRasterizerPort.RasterizedSlide> finalRasters = rasterizer.rasterize(pptx);
        if (finalRasters.size() != plan.slides().size()) throw new IllegalStateException("final render slide count mismatch");
        ArrayList<RenderedVisualCriticPort.Critique> finalCritiques = new ArrayList<>();
        for (var raster : finalRasters) finalCritiques.add(critic.critique(raster.image()));

        EnumMap<MasterpieceDesignContract.Dimension, Double> aggregate = aggregateScores(selections);
        double minVisualBalance = finalCritiques.stream().mapToDouble(RenderedVisualCriticPort.Critique::visualBalance).min().orElse(0);
        double minWhitespace = finalCritiques.stream().mapToDouble(RenderedVisualCriticPort.Critique::whitespace).min().orElse(0);
        double minLegibility = finalCritiques.stream().mapToDouble(RenderedVisualCriticPort.Critique::legibilityRiskScore).min().orElse(0);
        aggregate.put(MasterpieceDesignContract.Dimension.ALIGNMENT_AND_GRID, Math.min(aggregate.get(MasterpieceDesignContract.Dimension.ALIGNMENT_AND_GRID), minVisualBalance));
        aggregate.put(MasterpieceDesignContract.Dimension.WHITESPACE, Math.min(aggregate.get(MasterpieceDesignContract.Dimension.WHITESPACE), minWhitespace));
        aggregate.put(MasterpieceDesignContract.Dimension.DENSITY_AND_LEGIBILITY, Math.min(aggregate.get(MasterpieceDesignContract.Dimension.DENSITY_AND_LEGIBILITY), minLegibility));
        double overall = aggregate.values().stream().mapToDouble(Double::doubleValue).average().orElse(0);
        List<String> critical = finalCritiques.stream().flatMap(c -> c.findings().stream()).distinct().toList();
        boolean accessibility = aggregate.get(MasterpieceDesignContract.Dimension.ACCESSIBILITY) >= contract.minimumScores().get(MasterpieceDesignContract.Dimension.ACCESSIBILITY);
        MasterpieceQualityGate.Assessment assessment = new MasterpieceQualityGate.Assessment(
                aggregate, overall, accessibility, true, critical, critic.getClass().getName());
        MasterpieceQualityGate.Decision decision = gate.evaluate(contract, assessment);
        return new Result(pptx, selections, finalCritiques, decision, aggregate, overall, rasterizer.identity(), seeds.size(), refinementSeeds.size());
    }

    private static NarrativePlan previewPlan(NarrativePlan source, List<Seed> seeds) {
        ArrayList<SlideBrief> slides = new ArrayList<>();
        for (int i = 0; i < seeds.size(); i++) {
            SlideBrief b = seeds.get(i).brief();
            slides.add(new SlideBrief(i + 1, b.archetype(), b.headline(), b.supportingPoints(), "", b.evidenceIds()));
        }
        return new NarrativePlan(source.title() + " - candidate preview", source.audience(), source.objective(), source.thesis(), slides);
    }
    private static EnumMap<MasterpieceDesignContract.Dimension, Double> aggregateScores(List<SlideSelection> selections) {
        EnumMap<MasterpieceDesignContract.Dimension, Double> result = new EnumMap<>(MasterpieceDesignContract.Dimension.class);
        for (MasterpieceDesignContract.Dimension dimension : MasterpieceDesignContract.Dimension.values()) {
            double min = selections.stream().mapToDouble(s -> s.selected().deterministic().dimensions().get(dimension)).min().orElse(0);
            result.put(dimension, min);
        }
        return result;
    }
    private static SlideLayoutCandidate reindex(SlideLayoutCandidate source, int index) {
        return new SlideLayoutCandidate(source.candidateId() + "-preview-" + index, index, source.archetype(), source.elements(), source.variant());
    }
    private static double clamp(double value) { return Math.max(0, Math.min(1, value)); }
}
