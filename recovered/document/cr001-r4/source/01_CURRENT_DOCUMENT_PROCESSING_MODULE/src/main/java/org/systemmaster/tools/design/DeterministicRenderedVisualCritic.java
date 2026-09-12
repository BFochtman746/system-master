package org.systemmaster.tools.design;

import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Raster-only visual heuristics. This critic has no access to candidate generation decisions. */
public final class DeterministicRenderedVisualCritic implements RenderedVisualCriticPort {
    @Override
    public Critique critique(BufferedImage image) {
        Objects.requireNonNull(image, "image");
        int width = image.getWidth();
        int height = image.getHeight();
        if (width < 100 || height < 100) return new Critique(0, 0, 0, 0, 0, List.of("RASTER_TOO_SMALL"), "deterministic-raster-critic-v1");
        long[] quadrant = new long[4];
        long ink = 0;
        long borderInk = 0;
        long dark = 0;
        int border = Math.max(4, Math.min(width, height) / 40);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >>> 16) & 0xff;
                int g = (rgb >>> 8) & 0xff;
                int b = rgb & 0xff;
                boolean nonWhite = r < 245 || g < 245 || b < 245;
                if (nonWhite) {
                    ink++;
                    int q = (x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0);
                    quadrant[q]++;
                    if (x < border || y < border || x >= width - border || y >= height - border) borderInk++;
                }
                if ((r + g + b) / 3 < 88) dark++;
            }
        }
        double total = (double) width * height;
        double coverage = ink / total;
        double whitespace = coverage < .003 ? 0 : clamp(.94 - Math.abs(coverage - .16) * .20);
        double maxQ = 0;
        double minQ = Double.MAX_VALUE;
        for (long q : quadrant) {
            double share = ink == 0 ? 0 : (double) q / ink;
            maxQ = Math.max(maxQ, share);
            minQ = Math.min(minQ, share);
        }
        double balance = ink == 0 ? 0 : clamp(.86 + Math.min(.10, minQ * .30) - Math.max(0, maxQ - .90));
        double borderRate = ink == 0 ? 0 : (double) borderInk / ink;
        double edge = clamp(1.0 - borderRate * 7.0);
        double darkRate = dark / total;
        double legibility = clamp(1.0 - Math.max(0, darkRate - .55) * 1.8);
        ArrayList<String> findings = new ArrayList<>();
        if (coverage < .003) findings.add("NEAR_BLANK_SLIDE");
        if (coverage > .62) findings.add("EXCESSIVE_VISUAL_DENSITY");
        if (borderRate > .10) findings.add("EDGE_INK_CLIPPING_RISK");
        if (maxQ > .84) findings.add("SEVERE_VISUAL_IMBALANCE");
        double overall = clamp(.30 * balance + .25 * whitespace + .25 * edge + .20 * legibility);
        return new Critique(balance, whitespace, edge, legibility, overall, findings, "deterministic-raster-critic-v1");
    }

    private static double clamp(double value) { return Math.max(0, Math.min(1, value)); }
}
