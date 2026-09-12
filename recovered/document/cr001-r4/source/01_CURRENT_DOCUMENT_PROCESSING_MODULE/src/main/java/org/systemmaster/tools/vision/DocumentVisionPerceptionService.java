package org.systemmaster.tools.vision;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import javax.imageio.ImageIO;

/** Adjudicates unresolved OCR regions with a cached local VLM while preserving fail-closed provenance. */
public final class DocumentVisionPerceptionService {
    public enum RegionState {
        ACCEPTED_BY_ENGINE_AGREEMENT,
        ACCEPTED_BY_LOCAL_VLM,
        REVIEW_REQUIRED
    }

    public record PerceivedRegion(
            String regionId,
            String text,
            double confidence,
            RegionState state,
            List<OcrEnsembleExecutor.Candidate> candidates,
            PageRegionProvenance provenance,
            List<String> diagnostics) {
        public PerceivedRegion {
            regionId = requireText(regionId, "regionId");
            text = Objects.requireNonNull(text, "text");
            if (confidence != -1.0 && (!Double.isFinite(confidence) || confidence < 0.0 || confidence > 1.0)) {
                throw new IllegalArgumentException("confidence must be -1 or in [0,1]");
            }
            state = Objects.requireNonNull(state, "state");
            candidates = List.copyOf(Objects.requireNonNull(candidates, "candidates"));
            provenance = Objects.requireNonNull(provenance, "provenance");
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
        }
    }

    public record PagePerception(
            String originalSourceSha256,
            String perceptionRasterSha256,
            List<PerceivedRegion> regions,
            List<String> diagnostics,
            String vlmModelId) {
        public PagePerception {
            originalSourceSha256 = requireText(originalSourceSha256, "originalSourceSha256");
            perceptionRasterSha256 = requireText(perceptionRasterSha256, "perceptionRasterSha256");
            regions = List.copyOf(Objects.requireNonNull(regions, "regions"));
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
            vlmModelId = vlmModelId == null ? "" : vlmModelId;
        }

        public long reviewRequiredCount() {
            return regions.stream().filter(region -> region.state() == RegionState.REVIEW_REQUIRED).count();
        }
    }

    private static final double VLM_MIN_CONFIDENCE = 0.65;

    public PagePerception adjudicate(
            byte[] perceptionRaster,
            OcrEnsembleExecutor.Result ensemble,
            LocalVisionLanguageModelPort vlm,
            Map<String, String> pageContext) throws Exception {
        Objects.requireNonNull(perceptionRaster, "perceptionRaster");
        Objects.requireNonNull(ensemble, "ensemble");
        Objects.requireNonNull(pageContext, "pageContext");
        if (!DocumentVisionDigest.sha256(perceptionRaster).equals(ensemble.perceptionRasterSha256())) {
            throw new IllegalArgumentException("perception raster does not match ensemble evidence binding");
        }
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(perceptionRaster));
        if (image == null) throw new IOException("perception raster is not a readable image");

        LocalVisionLanguageModelPort.Identity identity = vlm == null ? null : vlm.identity();
        boolean vlmEligible = identity != null
                && identity.healthy()
                && identity.modelCached()
                && !identity.networkRequiredAtInference()
                && identity.capabilities().contains("OCR_ADJUDICATION");
        ArrayList<PerceivedRegion> regions = new ArrayList<>();
        ArrayList<String> diagnostics = new ArrayList<>(ensemble.diagnostics());
        if (identity != null && !vlmEligible) diagnostics.add("LOCAL_VLM_INELIGIBLE:" + identity.modelId());

        for (OcrEnsembleExecutor.ConsensusRegion region : ensemble.regions()) {
            if (!region.requiresAdjudication()) {
                regions.add(new PerceivedRegion(
                        region.regionId(), region.selectedText(), region.selectedProbability(),
                        RegionState.ACCEPTED_BY_ENGINE_AGREEMENT, region.candidates(), region.provenance(), List.of()));
                continue;
            }
            if (!vlmEligible) {
                regions.add(reviewRequired(region, "VLM_UNAVAILABLE_OR_UNQUALIFIED"));
                continue;
            }

            byte[] crop = crop(image, region.x(), region.y(), region.width(), region.height());
            ArrayList<LocalVisionLanguageModelPort.Candidate> candidates = new ArrayList<>();
            for (OcrEnsembleExecutor.Candidate candidate : region.candidates()) {
                double confidence = candidate.calibrated() ? candidate.calibratedProbability() : candidate.rawConfidence();
                candidates.add(new LocalVisionLanguageModelPort.Candidate(
                        candidate.text(), candidate.engineId(), confidence,
                        Map.of(
                                "x", Double.toString(candidate.x()),
                                "y", Double.toString(candidate.y()),
                                "width", Double.toString(candidate.width()),
                                "height", Double.toString(candidate.height()),
                                "calibrated", Boolean.toString(candidate.calibrated()))));
            }
            Map<String, String> context = new LinkedHashMap<>(pageContext);
            context.put("regionId", region.regionId());
            context.put("rule", "Select only among supplied OCR candidates or abstain. Do not invent replacement text.");
            LocalVisionLanguageModelPort.Decision decision = vlm.adjudicate(crop, candidates, context);
            if (decision.abstained() || decision.confidence() < VLM_MIN_CONFIDENCE) {
                regions.add(reviewRequired(region, decision.abstained() ? "VLM_ABSTAINED" : "VLM_CONFIDENCE_BELOW_GATE"));
                continue;
            }
            boolean candidateMatch = region.candidates().stream().anyMatch(candidate -> candidate.text().equals(decision.selectedText()));
            if (!candidateMatch) {
                regions.add(reviewRequired(region, "VLM_RETURNED_NON_CANDIDATE_TEXT"));
                continue;
            }

            PageRegionProvenance old = region.provenance();
            PageRegionProvenance provenance = new PageRegionProvenance(
                    old.originalSourceSha256(), old.perceptionRasterSha256(), old.pageIndex(), old.regionId(),
                    old.x(), old.y(), old.width(), old.height(), old.cropSha256(), old.preprocessingVariantId(),
                    old.preprocessingOperations(), old.observingEngineIds(), old.candidateTextSha256s(),
                    DocumentVisionDigest.sha256(decision.selectedText().getBytes(StandardCharsets.UTF_8)),
                    PageRegionProvenance.DecisionAuthority.LOCAL_VLM_ADJUDICATION);
            regions.add(new PerceivedRegion(
                    region.regionId(), decision.selectedText(), decision.confidence(),
                    RegionState.ACCEPTED_BY_LOCAL_VLM, region.candidates(), provenance, decision.diagnostics()));
        }
        return new PagePerception(
                ensemble.originalSourceSha256(), ensemble.perceptionRasterSha256(), regions, diagnostics,
                identity == null ? "" : identity.modelId());
    }

    private static PerceivedRegion reviewRequired(OcrEnsembleExecutor.ConsensusRegion region, String diagnostic) {
        return new PerceivedRegion(
                region.regionId(), region.selectedText(), region.selectedProbability(), RegionState.REVIEW_REQUIRED,
                region.candidates(), region.provenance(), List.of(diagnostic));
    }

    private static byte[] crop(BufferedImage image, int x, int y, int width, int height) throws IOException {
        int safeX = Math.max(0, Math.min(x, image.getWidth() - 1));
        int safeY = Math.max(0, Math.min(y, image.getHeight() - 1));
        int safeWidth = Math.max(1, Math.min(width, image.getWidth() - safeX));
        int safeHeight = Math.max(1, Math.min(height, image.getHeight() - safeY));
        BufferedImage crop = image.getSubimage(safeX, safeY, safeWidth, safeHeight);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        if (!ImageIO.write(crop, "png", output)) throw new IOException("PNG writer unavailable");
        return output.toByteArray();
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
}
