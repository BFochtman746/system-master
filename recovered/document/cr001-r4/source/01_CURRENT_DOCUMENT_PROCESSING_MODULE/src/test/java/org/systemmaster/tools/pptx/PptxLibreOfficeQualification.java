package org.systemmaster.tools.pptx;

import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Local rendering oracle qualification. This is environment evidence, not a claim of native Microsoft fidelity. */
public final class PptxLibreOfficeQualification {
    static int n;
    public static void main(String[] args) throws Exception {
        if (args.length < 1) throw new IllegalArgumentException("usage: PptxLibreOfficeQualification <soffice>");
        Path tmp = Files.createTempDirectory("pptx-lo-qual-");
        try {
            var engine = new PptxFullLaneEngine();
            byte[] deck = engine.createPresentation("Qualification", List.of(
                    new PptxFullLaneEngine.SlideSpec("PowerPoint lane", List.of("DOCX", "PDF", "Markdown", "PPTX"), "qualification notes"),
                    new PptxFullLaneEngine.SlideSpec("Second slide", List.of("render oracle"), null)
            ));
            Path source = tmp.resolve("qualification.pptx");
            Files.write(source, deck);
            Process p = new ProcessBuilder(args[0], "--headless", "--convert-to", "pdf", "--outdir", tmp.toString(), source.toString())
                    .redirectErrorStream(true).start();
            String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exit = p.waitFor();
            check(exit == 0, "LibreOffice process exit 0: " + log);
            Path pdf = tmp.resolve("qualification.pdf");
            check(Files.isRegularFile(pdf) && Files.size(pdf) > 16, "PDF render created: " + log);
            byte[] probe = Files.readAllBytes(pdf);
            check(probe.length >= 5 && new String(probe, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-"), "render output is PDF");
            System.out.println("PPTX_LIBREOFFICE_QUALIFICATION_PASS assertions=" + n + " renderer=LibreOffice");
        } finally {
            try (var walk = Files.walk(tmp)) { walk.sorted(Comparator.reverseOrder()).forEach(x -> { try { Files.deleteIfExists(x); } catch (Exception ignored) {} }); }
        }
    }
    static void check(boolean condition, String message) { n++; if (!condition) throw new AssertionError(message); }
}
