package org.systemmaster.tools.design;

import java.awt.image.BufferedImage;
import java.util.List;

/** Independent presentation-to-raster boundary used by design proof. */
public interface PresentationRasterizerPort {
    record RasterizedSlide(int slideIndex, BufferedImage image, String pngSha256) {
        public RasterizedSlide {
            if (slideIndex < 1) throw new IllegalArgumentException("slideIndex");
            if (image == null) throw new IllegalArgumentException("image required");
            if (pngSha256 == null || !pngSha256.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("pngSha256");
        }
    }
    List<RasterizedSlide> rasterize(byte[] pptx) throws Exception;
    String identity();
}
