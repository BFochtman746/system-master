package org.systemmaster.tools.vision;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;

import javax.imageio.ImageIO;

public final class PaddleStructureWindowsQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length < 3 || args.length > 5) {
            throw new IllegalArgumentException("usage: <python> <documentVisionWorker> <offlinePaddleConfig> [engine] [device]");
        }
        String engine = args.length >= 4 ? args[3] : "paddle";
        String device = args.length >= 5 ? args[4] : "cpu";
        PaddleStructureOcrEnginePort port = new PaddleStructureOcrEnginePort(
                Path.of(args[0]), Path.of(args[1]), Path.of(args[2]), Duration.ofMinutes(4),
                "en", engine, device);
        var identity = port.identity();
        check(identity.healthy(), "Paddle worker import/probe healthy");
        check(!identity.networkRequired(), "Paddle runtime declared local-only");
        check(identity.capabilities().contains("ocr.run.recognize"), "Paddle recognition capability");
        check(identity.capabilities().contains("ocr.run.structured"), "Paddle structured capability");

        var result = port.recognize(sample(), "ocr.run.recognize", Map.of("language", "en"));
        check(!result.regions().isEmpty(), "Paddle recognized at least one region");
        check(result.regions().stream().allMatch(region -> region.width() > 0 && region.height() > 0), "Paddle regions have geometry");
        check(result.regions().stream().allMatch(region -> !region.text().isBlank()), "Paddle regions have text");
        check(result.regions().stream().allMatch(region -> region.confidence() >= -1.0 && region.confidence() <= 1.0), "Paddle raw confidence bounds");

        System.out.println("PADDLE_STRUCTURE_WINDOWS_QUALIFICATION_PASS assertions=" + n
                + " version=" + identity.version() + " regions=" + result.regions().size()
                + " engine=" + engine + " device=" + device);
    }

    private static byte[] sample() throws Exception {
        BufferedImage image = new BufferedImage(1000, 300, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, image.getWidth(), image.getHeight());
        g.setColor(Color.BLACK);
        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 52));
        g.drawString("INVOICE TOTAL $18,735.82", 60, 130);
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 36));
        g.drawString("ACCOUNT 00418", 60, 210);
        g.dispose();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return output.toByteArray();
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
