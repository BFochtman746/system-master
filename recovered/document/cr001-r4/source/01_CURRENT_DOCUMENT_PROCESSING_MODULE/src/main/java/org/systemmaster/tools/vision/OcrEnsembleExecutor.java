package org.systemmaster.tools.vision;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import javax.imageio.ImageIO;

import org.systemmaster.tools.ocr.OcrEnginePort;

/** Runs independent OCR engines, spatially aligns their observations, calibrates confidence, and emits evidence-bound consensus. */
public final class OcrEnsembleExecutor {
    public record Candidate(
            String engineId,
            String engineVersion,
            String text,
            double rawConfidence,
            boolean calibrated,
            double calibratedProbability,
            double x,
            double y,
            double width,
            double height,
            String type) {
        public Candidate {
            engineId = requireText(engineId, "engineId");
            engineVersion = requireText(engineVersion, "engineVersion");
            text = Objects.requireNonNull(text, "text");
            if (!Double.isFinite(rawConfidence) || rawConfidence < -1.0 || rawConfidence > 1.0) {
                throw new IllegalArgumentException("rawConfidence must be in [-1,1]");
            }
            if (calibrated && (!Double.isFinite(calibratedProbability) || calibratedProbability < 0.0 || calibratedProbability > 1.0)) {
                throw new IllegalArgumentException("calibratedProbability must be in [0,1]");
            }
            if (!calibrated && calibratedProbability != -1.0) {
                throw new IllegalArgumentException("uncalibrated probability must be -1");
            }
            finiteNonNegative(x, "x");
            finiteNonNegative(y, "y");
            finitePositive(width, "width");
            finitePositive(height, "height");
            type = requireText(type, "type");
        }
    }

    public record ConsensusRegion(
            String regionId,
            int x,
            int y,
            int width,
            int height,
            List<Candidate> candidates,
            String selectedText,
            double agreementRatio,
            double selectedProbability,
            boolean requiresAdjudication,
            PageRegionProvenance provenance) {
        public ConsensusRegion {
            regionId = requireText(regionId, "regionId");
            if (x < 0 || y < 0 || width <= 0 || height <= 0) throw new IllegalArgumentException("invalid consensus bounds");
            candidates = List.copyOf(Objects.requireNonNull(candidates, "candidates"));
            if (candidates.isEmpty()) throw new IllegalArgumentException("candidates must not be empty");
            selectedText = Objects.requireNonNull(selectedText, "selectedText");
            unit(agreementRatio, "agreementRatio");
            if (selectedProbability != -1.0) unit(selectedProbability, "selectedProbability");
            provenance = Objects.requireNonNull(provenance, "provenance");
        }
    }

    public record Result(
            String originalSourceSha256,
            String perceptionRasterSha256,
            List<String> executedEngineIds,
            List<ConsensusRegion> regions,
            List<String> diagnostics) {
        public Result {
            originalSourceSha256 = requireText(originalSourceSha256, "originalSourceSha256");
            perceptionRasterSha256 = requireText(perceptionRasterSha256, "perceptionRasterSha256");
            executedEngineIds = List.copyOf(Objects.requireNonNull(executedEngineIds, "executedEngineIds"));
            regions = List.copyOf(Objects.requireNonNull(regions, "regions"));
            diagnostics = List.copyOf(Objects.requireNonNull(diagnostics, "diagnostics"));
        }

        public long unresolvedCount() {
            return regions.stream().filter(ConsensusRegion::requiresAdjudication).count();
        }
    }

    private static final double IOU_THRESHOLD = 0.25;
    private static final double AUTO_ACCEPT_AGREEMENT = 0.67;
    private static final double AUTO_ACCEPT_PROBABILITY = 0.78;

    public Result execute(
            String originalSourceSha256,
            byte[] perceptionRaster,
            int pageIndex,
            String preprocessingVariantId,
            List<String> preprocessingOperations,
            List<OcrEnginePort> engines,
            ConfidenceCalibrationRegistry calibration,
            Map<String, String> options) throws Exception {
        originalSourceSha256 = requireText(originalSourceSha256, "originalSourceSha256");
        Objects.requireNonNull(perceptionRaster, "perceptionRaster");
        Objects.requireNonNull(preprocessingOperations, "preprocessingOperations");
        Objects.requireNonNull(engines, "engines");
        Objects.requireNonNull(calibration, "calibration");
        Objects.requireNonNull(options, "options");
        if (engines.size() < 2) throw new IllegalArgumentException("OCR ensemble requires at least two independent engine ports");
        if (pageIndex < 0) throw new IllegalArgumentException("pageIndex must be non-negative");

        BufferedImage image = ImageIO.read(new ByteArrayInputStream(perceptionRaster));
        if (image == null) throw new IOException("perception raster is not a readable image");
        String perceptionSha = DocumentVisionDigest.sha256(perceptionRaster);
        ArrayList<Observed> observations = new ArrayList<>();
        ArrayList<String> executed = new ArrayList<>();
        ArrayList<String> diagnostics = new ArrayList<>();

        for (OcrEnginePort engine : engines) {
            OcrEnginePort.Identity identity = engine.identity();
            if (!identity.healthy()) {
                diagnostics.add("ENGINE_SKIPPED_UNHEALTHY:" + identity.engineId());
                continue;
            }
            if (identity.networkRequired()) {
                diagnostics.add("ENGINE_REJECTED_NETWORK_REQUIRED:" + identity.engineId());
                continue;
            }
            if (!identity.capabilities().contains("ocr.run.recognize")) {
                diagnostics.add("ENGINE_SKIPPED_CAPABILITY:" + identity.engineId());
                continue;
            }
            OcrEnginePort.Result result = engine.recognize(perceptionRaster, "ocr.run.recognize", options);
            executed.add(identity.engineId());
            for (OcrEnginePort.Region region : result.regions()) {
                if (region.text().isBlank() || region.width() <= 0 || region.height() <= 0) continue;
                ConfidenceCalibrationRegistry.Result calibrated = calibration.apply(
                        identity.engineId(), identity.version(), region.confidence());
                observations.add(new Observed(identity, region, calibrated));
            }
            for (String diagnostic : result.diagnostics()) {
                diagnostics.add(identity.engineId() + ":" + diagnostic);
            }
        }
        if (executed.size() < 2) {
            throw new IllegalStateException("fewer than two local OCR engines executed; independent agreement unavailable");
        }

        List<Cluster> clusters = cluster(observations);
        ArrayList<ConsensusRegion> regions = new ArrayList<>();
        int index = 0;
        for (Cluster cluster : clusters) {
            regions.add(resolveCluster(
                    originalSourceSha256,
                    perceptionRaster,
                    image,
                    pageIndex,
                    preprocessingVariantId,
                    preprocessingOperations,
                    "r" + index++,
                    cluster));
        }
        regions.sort(Comparator.comparingInt(ConsensusRegion::y).thenComparingInt(ConsensusRegion::x));
        if (regions.isEmpty()) diagnostics.add("NO_TEXT_REGIONS_OBSERVED");
        return new Result(originalSourceSha256, perceptionSha, distinct(executed), regions, diagnostics);
    }

    private static ConsensusRegion resolveCluster(
            String originalSourceSha256,
            byte[] perceptionRaster,
            BufferedImage image,
            int pageIndex,
            String preprocessingVariantId,
            List<String> preprocessingOperations,
            String regionId,
            Cluster cluster) throws IOException {
        ArrayList<Candidate> candidates = new ArrayList<>();
        for (Observed observed : cluster.members) {
            OcrEnginePort.Region region = observed.region;
            candidates.add(new Candidate(
                    observed.identity.engineId(), observed.identity.version(), region.text(), region.confidence(),
                    observed.calibrated.calibrated(), observed.calibrated.probability(),
                    region.x(), region.y(), region.width(), region.height(), region.type()));
        }

        Map<String, Vote> votes = new LinkedHashMap<>();
        for (Candidate candidate : candidates) {
            String normalized = normalize(candidate.text());
            Vote vote = votes.computeIfAbsent(normalized, ignored -> new Vote(candidate.text()));
            vote.engines.add(candidate.engineId());
            double weight = candidate.calibrated() ? Math.max(0.01, candidate.calibratedProbability()) : 0.25;
            vote.weight += weight;
            if (candidate.calibrated()) {
                vote.calibratedProbabilitySum += candidate.calibratedProbability();
                vote.calibratedCount++;
            }
        }
        Vote winner = votes.values().stream()
                .max(Comparator.comparingDouble((Vote vote) -> vote.weight).thenComparingInt(vote -> vote.engines.size()))
                .orElseThrow();
        double agreement = (double) winner.engines.size() / distinct(candidates.stream().map(Candidate::engineId).toList()).size();
        double selectedProbability = winner.calibratedCount == 0 ? -1.0 : winner.calibratedProbabilitySum / winner.calibratedCount;
        boolean hasAtLeastTwoSupportingEngines = winner.engines.size() >= 2;
        boolean requiresAdjudication = !hasAtLeastTwoSupportingEngines
                || agreement < AUTO_ACCEPT_AGREEMENT
                || selectedProbability < AUTO_ACCEPT_PROBABILITY;

        int x = clamp((int) Math.floor(cluster.minX), 0, image.getWidth() - 1);
        int y = clamp((int) Math.floor(cluster.minY), 0, image.getHeight() - 1);
        int maxX = clamp((int) Math.ceil(cluster.maxX), x + 1, image.getWidth());
        int maxY = clamp((int) Math.ceil(cluster.maxY), y + 1, image.getHeight());
        int width = Math.max(1, maxX - x);
        int height = Math.max(1, maxY - y);
        BufferedImage crop = image.getSubimage(x, y, width, height);
        ByteArrayOutputStream cropBytes = new ByteArrayOutputStream();
        if (!ImageIO.write(crop, "png", cropBytes)) throw new IOException("PNG writer unavailable for provenance crop");

        List<String> engineIds = distinct(candidates.stream().map(Candidate::engineId).toList());
        List<String> candidateDigests = candidates.stream()
                .map(candidate -> DocumentVisionDigest.sha256(candidate.text().getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                .distinct().toList();
        String acceptedDigest = requiresAdjudication ? "" : DocumentVisionDigest.sha256(
                winner.displayText.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        PageRegionProvenance provenance = new PageRegionProvenance(
                originalSourceSha256,
                DocumentVisionDigest.sha256(perceptionRaster),
                pageIndex,
                regionId,
                x, y, width, height,
                DocumentVisionDigest.sha256(cropBytes.toByteArray()),
                preprocessingVariantId,
                preprocessingOperations,
                engineIds,
                candidateDigests,
                acceptedDigest,
                requiresAdjudication
                        ? PageRegionProvenance.DecisionAuthority.HUMAN_REVIEW_REQUIRED
                        : PageRegionProvenance.DecisionAuthority.ENGINE_AGREEMENT);
        return new ConsensusRegion(
                regionId, x, y, width, height, candidates,
                winner.displayText, agreement, selectedProbability, requiresAdjudication, provenance);
    }

    private static List<Cluster> cluster(List<Observed> observations) {
        ArrayList<Observed> ordered = new ArrayList<>(observations);
        ordered.sort(Comparator
                .comparingDouble((Observed observed) -> observed.region.y())
                .thenComparingDouble(observed -> observed.region.x())
                .thenComparing(observed -> observed.identity.engineId()));
        ArrayList<Cluster> clusters = new ArrayList<>();
        for (Observed observed : ordered) {
            Cluster best = null;
            double bestScore = 0.0;
            for (Cluster cluster : clusters) {
                double score = iou(cluster, observed.region);
                if (score > bestScore) {
                    bestScore = score;
                    best = cluster;
                }
            }
            if (best != null && bestScore >= IOU_THRESHOLD && !best.hasEngine(observed.identity.engineId())) {
                best.add(observed);
            } else {
                clusters.add(new Cluster(observed));
            }
        }
        return clusters;
    }

    private static double iou(Cluster cluster, OcrEnginePort.Region region) {
        double x1 = Math.max(cluster.minX, region.x());
        double y1 = Math.max(cluster.minY, region.y());
        double x2 = Math.min(cluster.maxX, region.x() + region.width());
        double y2 = Math.min(cluster.maxY, region.y() + region.height());
        double intersection = Math.max(0.0, x2 - x1) * Math.max(0.0, y2 - y1);
        if (intersection == 0.0) return 0.0;
        double a = (cluster.maxX - cluster.minX) * (cluster.maxY - cluster.minY);
        double b = region.width() * region.height();
        return intersection / (a + b - intersection);
    }

    private static String normalize(String text) {
        return text.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static List<String> distinct(List<String> source) {
        return List.copyOf(new LinkedHashSet<>(source));
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private record Observed(OcrEnginePort.Identity identity, OcrEnginePort.Region region,
                            ConfidenceCalibrationRegistry.Result calibrated) {
    }

    private static final class Vote {
        final String displayText;
        final LinkedHashSet<String> engines = new LinkedHashSet<>();
        double weight;
        double calibratedProbabilitySum;
        int calibratedCount;

        Vote(String displayText) {
            this.displayText = displayText;
        }
    }

    private static final class Cluster {
        final ArrayList<Observed> members = new ArrayList<>();
        double minX;
        double minY;
        double maxX;
        double maxY;

        Cluster(Observed first) {
            minX = first.region.x();
            minY = first.region.y();
            maxX = first.region.x() + first.region.width();
            maxY = first.region.y() + first.region.height();
            members.add(first);
        }

        void add(Observed observed) {
            members.add(observed);
            minX = Math.min(minX, observed.region.x());
            minY = Math.min(minY, observed.region.y());
            maxX = Math.max(maxX, observed.region.x() + observed.region.width());
            maxY = Math.max(maxY, observed.region.y() + observed.region.height());
        }

        boolean hasEngine(String engineId) {
            return members.stream().anyMatch(member -> member.identity.engineId().equals(engineId));
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }

    private static void unit(double value, String name) {
        if (!Double.isFinite(value) || value < 0.0 || value > 1.0) throw new IllegalArgumentException(name + " must be in [0,1]");
    }

    private static void finiteNonNegative(double value, String name) {
        if (!Double.isFinite(value) || value < 0.0) throw new IllegalArgumentException(name + " must be finite and non-negative");
    }

    private static void finitePositive(double value, String name) {
        if (!Double.isFinite(value) || value <= 0.0) throw new IllegalArgumentException(name + " must be finite and positive");
    }
}
