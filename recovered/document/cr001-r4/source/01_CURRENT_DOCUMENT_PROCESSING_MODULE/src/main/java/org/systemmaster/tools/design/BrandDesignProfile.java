package org.systemmaster.tools.design;

import java.util.Locale;
import java.util.Objects;

/** Local brand/design tokens. Values are deterministic inputs, never remote assets. */
public record BrandDesignProfile(
        String id,
        String headingFont,
        String bodyFont,
        String backgroundRgb,
        String primaryTextRgb,
        String accentRgb,
        String mutedTextRgb,
        double margin,
        double gutter,
        Density density) {
    public enum Density { AIRY, BALANCED, DENSE }

    public BrandDesignProfile {
        id = text(id, "id");
        headingFont = text(headingFont, "headingFont");
        bodyFont = text(bodyFont, "bodyFont");
        backgroundRgb = rgb(backgroundRgb, "backgroundRgb");
        primaryTextRgb = rgb(primaryTextRgb, "primaryTextRgb");
        accentRgb = rgb(accentRgb, "accentRgb");
        mutedTextRgb = rgb(mutedTextRgb, "mutedTextRgb");
        if (!Double.isFinite(margin) || margin < 0.03 || margin > 0.16) throw new IllegalArgumentException("margin outside [0.03,0.16]");
        if (!Double.isFinite(gutter) || gutter < 0.01 || gutter > 0.10) throw new IllegalArgumentException("gutter outside [0.01,0.10]");
        Objects.requireNonNull(density, "density");
    }

    public static BrandDesignProfile executiveDefault(String id) {
        return new BrandDesignProfile(id, "Aptos Display", "Aptos", "F7F7F5", "171717", "2457E6", "5B5B5B", .065, .028, Density.BALANCED);
    }

    public double primaryContrastRatio() { return contrastRatio(primaryTextRgb, backgroundRgb); }
    public double mutedContrastRatio() { return contrastRatio(mutedTextRgb, backgroundRgb); }
    public boolean passesNormalTextContrast() { return primaryContrastRatio() >= 4.5 && mutedContrastRatio() >= 4.5; }

    public static double contrastRatio(String foreground, String background) {
        double a = luminance(rgb(foreground, "foreground"));
        double b = luminance(rgb(background, "background"));
        double light = Math.max(a, b);
        double dark = Math.min(a, b);
        return (light + .05) / (dark + .05);
    }

    private static double luminance(String rgb) {
        int r = Integer.parseInt(rgb.substring(0, 2), 16);
        int g = Integer.parseInt(rgb.substring(2, 4), 16);
        int b = Integer.parseInt(rgb.substring(4, 6), 16);
        return .2126 * channel(r / 255.0) + .7152 * channel(g / 255.0) + .0722 * channel(b / 255.0);
    }

    private static double channel(double v) { return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
    private static String text(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }
    private static String rgb(String value, String name) {
        String v = text(value, name).toUpperCase(Locale.ROOT);
        if (v.startsWith("#")) v = v.substring(1);
        if (!v.matches("[0-9A-F]{6}")) throw new IllegalArgumentException(name + " must be 6-digit RGB");
        return v;
    }
}
