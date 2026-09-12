package org.systemmaster.tools.vision;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.imageio.ImageIO;

public final class LocalVlmProcessPortPortableTests {
    private static int n;

    public static void main(String[] args) throws Exception {
        String java = Path.of(System.getProperty("java.home"), "bin", isWindows() ? "java.exe" : "java").toString();
        String cp = System.getProperty("java.class.path");
        LocalVlmProcessPort port = new LocalVlmProcessPort(
                List.of(java, "-cp", cp, FakeLocalVlmWorkerMain.class.getName()),
                "cached-vlm-test", "PROCESS_PROTOCOL", "1", Duration.ofSeconds(10), true,
                Set.of("OCR_ADJUDICATION"));
        check(port.identity().modelCached(), "process VLM identity marks model cached");
        check(!port.identity().networkRequiredAtInference(), "process VLM is local-only");

        var decision = port.adjudicate(image(), List.of(
                new LocalVisionLanguageModelPort.Candidate("$18,735.B2", "PADDLE", .82, Map.of()),
                new LocalVisionLanguageModelPort.Candidate("$18,735.82", "TESSERACT", .90, Map.of())), Map.of("type", "invoice"));
        check(!decision.abstained(), "process VLM selected a candidate");
        check(decision.selectedText().equals("$18,735.82"), "worker index maps only to supplied candidate");
        check(decision.confidence() == .91, "worker confidence parsed");
        check(decision.supportingEngineIds().contains("TESSERACT"), "supporting engine bound");
        check(decision.diagnostics().contains("FAKE_LOCAL_PROCESS_WORKER"), "worker diagnostic preserved");

        boolean uncachedRejected = false;
        LocalVlmProcessPort uncached = new LocalVlmProcessPort(
                List.of(java, "-cp", cp, FakeLocalVlmWorkerMain.class.getName()),
                "uncached", "PROCESS_PROTOCOL", "1", Duration.ofSeconds(10), false,
                Set.of("OCR_ADJUDICATION"));
        try {
            uncached.adjudicate(image(), List.of(
                    new LocalVisionLanguageModelPort.Candidate("a", "A", .8, Map.of()),
                    new LocalVisionLanguageModelPort.Candidate("b", "B", .8, Map.of())), Map.of());
        } catch (IllegalStateException expected) {
            uncachedRejected = true;
        }
        check(uncachedRejected, "uncached local model fails closed");

        System.out.println("LOCAL_VLM_PROCESS_PORT_PORTABLE_PASS assertions=" + n);
    }

    private static byte[] image() throws Exception {
        BufferedImage image = new BufferedImage(80, 40, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < image.getHeight(); y++) for (int x = 0; x < image.getWidth(); x++) image.setRGB(x, y, Color.WHITE.getRGB());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win");
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
