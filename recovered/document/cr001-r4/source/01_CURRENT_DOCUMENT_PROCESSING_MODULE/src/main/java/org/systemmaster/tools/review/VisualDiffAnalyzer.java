package org.systemmaster.tools.review;

import java.awt.image.BufferedImage;
import java.util.Objects;

/** Pixel evidence comparator used after independent rendering. */
public final class VisualDiffAnalyzer {
    public record Metrics(int width, int height, long pixelsCompared, long changedPixels, double changedRatio,
                          double meanAbsoluteLumaDelta, int maxChannelDelta) {}

    public Metrics compare(BufferedImage before, BufferedImage after, int channelThreshold) {
        Objects.requireNonNull(before); Objects.requireNonNull(after);
        if (before.getWidth() != after.getWidth() || before.getHeight() != after.getHeight()) throw new IllegalArgumentException("visual diff dimensions differ");
        if (channelThreshold < 0 || channelThreshold > 255) throw new IllegalArgumentException("channel threshold");
        long changed = 0; double luma = 0; int max = 0; long pixels = (long) before.getWidth() * before.getHeight();
        for (int y = 0; y < before.getHeight(); y++) for (int x = 0; x < before.getWidth(); x++) {
            int a = before.getRGB(x, y), b = after.getRGB(x, y);
            int dr = Math.abs(((a >> 16) & 255) - ((b >> 16) & 255));
            int dg = Math.abs(((a >> 8) & 255) - ((b >> 8) & 255));
            int db = Math.abs((a & 255) - (b & 255));
            int localMax = Math.max(dr, Math.max(dg, db)); max = Math.max(max, localMax);
            if (localMax > channelThreshold) changed++;
            luma += Math.abs((0.2126d * dr) + (0.7152d * dg) + (0.0722d * db));
        }
        return new Metrics(before.getWidth(), before.getHeight(), pixels, changed, pixels == 0 ? 0 : (double) changed / pixels,
                pixels == 0 ? 0 : luma / pixels, max);
    }
}
