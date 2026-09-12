package org.systemmaster.tools.vision;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.time.Duration;

import javax.imageio.ImageIO;

public final class OpenCvDocumentVisionQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <python> <workerScript>");
        PythonOpenCvPreprocessor port = new PythonOpenCvPreprocessor(
                Path.of(args[0]), Path.of(args[1]), Duration.ofSeconds(30));
        check(port.identity().healthy(), "OpenCV worker probe healthy");
        check(!port.identity().networkRequired(), "OpenCV worker is local-only");

        byte[] source = degradedFaxLikeImage();
        var result = port.preprocess(source, OpenCvPreprocessorPort.Profile.FAX_RESTORE);
        check(result.sourceSha256().equals(DocumentVisionDigest.sha256(source)), "preprocess source digest bound");
        check(result.profile() == OpenCvPreprocessorPort.Profile.FAX_RESTORE, "fax profile retained");
        check(result.variants().size() == 2, "restored and binarized variants emitted");
        var restored = result.requireVariant("restored");
        var binary = result.requireVariant("binarized");
        check(restored.width() >= 1000, "fax restoration upsamples source");
        check(restored.operations().contains("clahe"), "CLAHE applied");
        check(restored.operations().contains("denoise"), "denoise applied");
        check(restored.operations().contains("upsample"), "fax upsample applied");
        check(binary.operations().contains("adaptive_threshold"), "adaptive threshold emitted");
        check(binary.operations().contains("morph_close"), "morphological repair emitted");
        check(restored.sha256().equals(DocumentVisionDigest.sha256(restored.pngBytes())), "restored digest verified");
        check(binary.sha256().equals(DocumentVisionDigest.sha256(binary.pngBytes())), "binary digest verified");
        check(result.metrics().containsKey("deskew_correction_degrees"), "deskew measurement recorded");
        check(result.metrics().get("scale_factor") == 2.0, "fax scale factor recorded");
        check(result.diagnostics().contains("FAX_RESTORE_PROFILE"), "fax profile diagnostic recorded");

        System.out.println("OPENCV_DOCUMENT_VISION_QUALIFICATION_PASS assertions=" + n + " version=" + port.identity().version());
    }

    private static byte[] degradedFaxLikeImage() throws Exception {
        BufferedImage base = new BufferedImage(600, 220, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = base.createGraphics();
        g.setColor(new Color(235, 235, 225));
        g.fillRect(0, 0, base.getWidth(), base.getHeight());
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_OFF);
        g.setFont(new Font(Font.MONOSPACED, Font.PLAIN, 28));
        g.setColor(new Color(85, 85, 85));
        g.drawString("FAX TOTAL: $18,735.82", 55, 95);
        g.drawString("ACCOUNT 00418", 55, 145);
        g.dispose();

        BufferedImage rotated = new BufferedImage(600, 220, BufferedImage.TYPE_INT_RGB);
        Graphics2D r = rotated.createGraphics();
        r.setColor(Color.WHITE);
        r.fillRect(0, 0, rotated.getWidth(), rotated.getHeight());
        AffineTransform tx = AffineTransform.getRotateInstance(Math.toRadians(2.2), 300, 110);
        r.drawImage(base, tx, null);
        r.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(rotated, "png", out);
        return out.toByteArray();
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
