package org.systemmaster.tools.vision;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.imageio.ImageIO;

public final class LocalVlmWindowsQualification {
    private static int n;

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("usage: <python> <localVlmWorker> <localModelDirectory>");
        String python = Path.of(args[0]).toAbsolutePath().normalize().toString();
        String worker = Path.of(args[1]).toAbsolutePath().normalize().toString();
        String model = Path.of(args[2]).toAbsolutePath().normalize().toString();
        LocalVlmProcessPort port = new LocalVlmProcessPort(
                List.of(python, worker, "--model-path", model),
                Path.of(model).getFileName().toString(), "LOCAL_TRANSFORMERS_VLM", "1",
                Duration.ofMinutes(5), true, Set.of("OCR_ADJUDICATION"));
        check(port.identity().modelCached(), "VLM model declared cached");
        check(!port.identity().networkRequiredAtInference(), "VLM inference is local-only");
        check(port.identity().capabilities().contains("OCR_ADJUDICATION"), "VLM adjudication capability");

        var candidates = List.of(
                new LocalVisionLanguageModelPort.Candidate("TOTAL 1234S", "OCR_A", .72, Map.of()),
                new LocalVisionLanguageModelPort.Candidate("TOTAL 12345", "OCR_B", .88, Map.of()));
        var decision = port.adjudicate(sample(), candidates, Map.of("task", "read exact printed text"));
        check(decision.abstained() || candidates.stream().anyMatch(candidate -> candidate.text().equals(decision.selectedText())),
                "VLM can only select a supplied candidate or abstain");
        check(decision.confidence() >= 0.0 && decision.confidence() <= 1.0, "VLM decision confidence protocol bounds");
        if (!decision.abstained()) {
            check(!decision.supportingEngineIds().isEmpty(), "selected candidate retains supporting OCR engine");
        } else {
            check(decision.selectedText().isEmpty(), "abstention has no selected text");
        }

        System.out.println("LOCAL_VLM_WINDOWS_QUALIFICATION_PASS assertions=" + n
                + " decision=" + (decision.abstained() ? "ABSTAIN" : "SELECT"));
    }

    private static byte[] sample() throws Exception {
        BufferedImage image = new BufferedImage(600, 180, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, image.getWidth(), image.getHeight());
        g.setColor(Color.BLACK);
        g.setFont(new Font(Font.MONOSPACED, Font.BOLD, 54));
        g.drawString("TOTAL 12345", 60, 110);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
