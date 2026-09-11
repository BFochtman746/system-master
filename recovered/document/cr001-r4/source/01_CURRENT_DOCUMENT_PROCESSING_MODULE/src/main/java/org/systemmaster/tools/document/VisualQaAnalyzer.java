package org.systemmaster.tools.document;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Deterministic raster heuristics for obviously blank output and edge-clipping risk. */
public final class VisualQaAnalyzer {
    public enum Severity { INFO, WARNING, ERROR }
    public record Metrics(int widthPx, int heightPx, double inkCoverage, double borderInkCoverage, double darkCoverage, boolean nonBlank) {}
    public record Finding(String code, Severity severity, String detail) {
        public Finding {
            if (code == null || code.isBlank()) throw new IllegalArgumentException("finding code required");
            Objects.requireNonNull(severity, "severity");
            detail = Objects.requireNonNullElse(detail, "");
        }
    }

    public Metrics analyze(BufferedImage image) {
        Objects.requireNonNull(image, "image");
        int width = image.getWidth();
        int height = image.getHeight();
        if (width <= 0 || height <= 0) return new Metrics(width, height, 0, 0, 0, false);
        int border = Math.max(2, Math.min(width, height) / 50);
        long total = 0;
        long ink = 0;
        long dark = 0;
        long borderTotal = 0;
        long borderInk = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >>> 16) & 0xff;
                int g = (rgb >>> 8) & 0xff;
                int b = rgb & 0xff;
                boolean nonWhite = r < 248 || g < 248 || b < 248;
                boolean isDark = (r + g + b) / 3 < 96;
                total++;
                if (nonWhite) ink++;
                if (isDark) dark++;
                boolean edge = x < border || y < border || x >= width - border || y >= height - border;
                if (edge) {
                    borderTotal++;
                    if (nonWhite) borderInk++;
                }
            }
        }
        double inkCoverage = total == 0 ? 0 : (double) ink / total;
        double borderCoverage = borderTotal == 0 ? 0 : (double) borderInk / borderTotal;
        double darkCoverage = total == 0 ? 0 : (double) dark / total;
        return new Metrics(width, height, inkCoverage, borderCoverage, darkCoverage, inkCoverage >= 0.00015d);
    }

    public List<Finding> findings(Metrics metrics, int extractedTextCharacters, int imageCount, boolean requireNonBlank) {
        Objects.requireNonNull(metrics, "metrics");
        ArrayList<Finding> findings = new ArrayList<>();
        if (metrics.widthPx() < 50 || metrics.heightPx() < 50) {
            findings.add(new Finding("RASTER_GEOMETRY_INVALID", Severity.ERROR, "raster dimensions are too small for proof"));
        }
        if (!metrics.nonBlank() && extractedTextCharacters == 0 && imageCount == 0) {
            findings.add(new Finding("BLANK_PAGE", requireNonBlank ? Severity.ERROR : Severity.WARNING, "no visible ink, extracted text, or images detected"));
        }
        if (metrics.borderInkCoverage() > 0.25d && metrics.inkCoverage() < 0.40d) {
            findings.add(new Finding("POSSIBLE_EDGE_CLIPPING", Severity.WARNING, "high edge ink with limited interior coverage; inspect for clipping or intentional border art"));
        }
        if (metrics.inkCoverage() > 0.985d) {
            findings.add(new Finding("NEAR_SOLID_PAGE", Severity.WARNING, "page is almost fully non-white; verify full-bleed background or rendering failure"));
        }
        return List.copyOf(findings);
    }
}
