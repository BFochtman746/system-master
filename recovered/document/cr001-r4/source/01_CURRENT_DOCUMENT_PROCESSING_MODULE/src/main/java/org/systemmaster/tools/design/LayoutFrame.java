package org.systemmaster.tools.design;

/** Normalized slide rectangle. */
public record LayoutFrame(double x, double y, double width, double height) {
    public LayoutFrame {
        finite(x, "x"); finite(y, "y"); finite(width, "width"); finite(height, "height");
        if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.0000001 || y + height > 1.0000001) {
            throw new IllegalArgumentException("frame must be within normalized slide bounds");
        }
    }
    public double right() { return x + width; }
    public double bottom() { return y + height; }
    public double area() { return width * height; }
    public double overlapArea(LayoutFrame other) {
        double w = Math.max(0, Math.min(right(), other.right()) - Math.max(x, other.x));
        double h = Math.max(0, Math.min(bottom(), other.bottom()) - Math.max(y, other.y));
        return w * h;
    }
    private static void finite(double v, String name) { if (!Double.isFinite(v)) throw new IllegalArgumentException(name + " must be finite"); }
}
