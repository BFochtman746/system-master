package org.systemmaster.tools.design;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

public final class LocalVisualCriticWindowsQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("usage: <python> <worker> <modelDir>");
        LocalVisualCriticProcessPort port = new LocalVisualCriticProcessPort(
                List.of(args[0], args[1], "--model-path", args[2], "critique"), Duration.ofMinutes(2), "target-windows-local-vlm-critic");
        BufferedImage image = new BufferedImage(1280, 720, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(Color.WHITE); g.fillRect(0, 0, 1280, 720);
            g.setColor(Color.BLACK); g.fillRect(100, 100, 520, 85); g.fillRect(100, 260, 700, 120);
        } finally { g.dispose(); }
        var result = port.critique(image);
        check(result.evaluatorId().equals("target-windows-local-vlm-critic"), "critic identity retained");
        check(result.overall() >= 0 && result.overall() <= 1, "overall bounded");
        check(result.visualBalance() >= 0 && result.visualBalance() <= 1, "balance bounded");
        check(result.whitespace() >= 0 && result.whitespace() <= 1, "whitespace bounded");
        check(result.edgeSafety() >= 0 && result.edgeSafety() <= 1, "edge bounded");
        System.out.println("LOCAL_VISUAL_CRITIC_WINDOWS_QUALIFICATION_PASS assertions=" + n + " overall=" + result.overall() + " findings=" + result.findings().size());
    }
    private static void check(boolean condition, String message) { n++; if (!condition) throw new AssertionError(message); }
}
