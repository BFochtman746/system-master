package org.systemmaster.tools.vision;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

public final class PaddleStructureAdapterPortableTests {
    private static int n;

    public static void main(String[] args) throws Exception {
        String text = Base64.getEncoder().encodeToString("Invoice total".getBytes(StandardCharsets.UTF_8));
        String facts = Base64.getEncoder().encodeToString("{\"source\":\"ocr\"}".getBytes(StandardCharsets.UTF_8));
        String markdown = Base64.getEncoder().encodeToString("# Invoice".getBytes(StandardCharsets.UTF_8));
        String diag = Base64.getEncoder().encodeToString("LOCAL_ONLY".getBytes(StandardCharsets.UTF_8));
        var result = PaddleStructureOcrEnginePort.parseRegions(List.of(
                "REGION\tocr-0\t" + text + "\t10\t20\t120\t30\t0.987\tWORD\t0\t" + facts,
                "FACT\tmarkdown_page_0\t" + markdown,
                "DIAG\t" + diag));
        check(result.regions().size() == 1, "one Paddle region parsed");
        check(result.regions().get(0).text().equals("Invoice total"), "UTF-8 text round trip");
        check(result.regions().get(0).confidence() == .987, "Paddle confidence preserved as raw evidence");
        check(result.regions().get(0).x() == 10.0 && result.regions().get(0).width() == 120.0, "Paddle geometry preserved");
        check(result.regions().get(0).facts().get("workerFacts").contains("source"), "worker facts preserved");
        check(result.facts().get("markdown_page_0").equals("# Invoice"), "structured Markdown fact preserved");
        check(result.diagnostics().contains("LOCAL_ONLY"), "Paddle diagnostic preserved");

        boolean badRowRejected = false;
        try {
            PaddleStructureOcrEnginePort.parseRegions(List.of("REGION\tbroken"));
        } catch (java.io.IOException expected) {
            badRowRejected = true;
        }
        check(badRowRejected, "malformed worker protocol fails closed");

        System.out.println("PADDLE_STRUCTURE_ADAPTER_PORTABLE_PASS assertions=" + n);
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
