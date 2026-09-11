package org.systemmaster.tools.vision;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.imageio.ImageIO;

import org.systemmaster.tools.ocr.OcrEnginePort;

public final class DocumentVision001APortableTests {
    private static int n;

    public static void main(String[] args) throws Exception {
        byte[] page = pageImage();
        String sourceSha = DocumentVisionDigest.sha256(page);

        ConfidenceCalibrationProfile aProfile = ConfidenceCalibrationProfile.fit(
                "OCR_A", "1.0", "corpus-a", calibrationSamples());
        ConfidenceCalibrationProfile bProfile = ConfidenceCalibrationProfile.fit(
                "OCR_B", "2.0", "corpus-b", calibrationSamples());
        check(aProfile.sampleCount() == 12, "calibration sample count");
        check(!aProfile.blocks().isEmpty(), "calibration blocks created");
        double previous = -1;
        for (var block : aProfile.blocks()) {
            check(block.calibratedProbability() >= previous, "calibration is isotonic");
            previous = block.calibratedProbability();
        }
        check(aProfile.calibrate(.96) >= .80, "high-confidence bin calibrates high");

        ConfidenceCalibrationRegistry registry = new ConfidenceCalibrationRegistry();
        registry.register(aProfile);
        registry.register(bProfile);
        check(registry.size() == 2, "two exact calibration profiles registered");
        check(registry.apply("OCR_A", "1.0", .96).calibrated(), "exact engine/version calibration applied");
        check(!registry.apply("OCR_A", "1.1", .96).calibrated(), "stale engine version does not inherit calibration");

        OcrEnginePort a = fake("OCR_A", "1.0", false, List.of(
                region("a1", "Invoice", 40, 40, 120, 30, .96),
                region("a2", "$18,735.82", 40, 100, 170, 30, .96)));
        OcrEnginePort b = fake("OCR_B", "2.0", false, List.of(
                region("b1", "Invoice", 42, 41, 118, 29, .97),
                region("b2", "$18,735.B2", 41, 101, 172, 30, .95)));
        OcrEnginePort network = fake("CLOUDISH", "1", true, List.of(
                region("c1", "Invoice", 40, 40, 120, 30, .99)));

        OcrEnsembleExecutor ensembleExecutor = new OcrEnsembleExecutor();
        var ensemble = ensembleExecutor.execute(
                sourceSha, page, 0, "original", List.of("none"), List.of(a, b, network), registry, Map.of());
        check(ensemble.executedEngineIds().size() == 2, "network-required OCR engine rejected");
        check(ensemble.diagnostics().stream().anyMatch(x -> x.contains("ENGINE_REJECTED_NETWORK_REQUIRED:CLOUDISH")), "network rejection recorded");
        check(ensemble.regions().size() == 2, "spatial matching creates two consensus regions");
        check(ensemble.unresolvedCount() == 1, "one disagreement requires adjudication");

        var invoice = ensemble.regions().stream().filter(r -> r.selectedText().equals("Invoice")).findFirst().orElseThrow();
        check(!invoice.requiresAdjudication(), "two calibrated engines auto-accept exact agreement");
        check(invoice.agreementRatio() == 1.0, "full agreement ratio");
        check(invoice.selectedProbability() >= .80, "accepted agreement has calibrated probability");
        check(invoice.provenance().decisionAuthority() == PageRegionProvenance.DecisionAuthority.ENGINE_AGREEMENT, "agreement provenance authority");
        check(invoice.provenance().observingEngineIds().size() == 2, "provenance binds both engines");
        check(invoice.provenance().candidateTextSha256s().size() == 1, "identical text has one candidate digest");
        check(invoice.provenance().cropSha256().length() == 64, "exact crop digest bound");
        check(invoice.provenance().acceptedTextSha256().length() == 64, "accepted text digest bound");

        var total = ensemble.regions().stream().filter(OcrEnsembleExecutor.ConsensusRegion::requiresAdjudication).findFirst().orElseThrow();
        check(total.agreementRatio() == .5, "OCR disagreement is explicit");
        check(total.provenance().decisionAuthority() == PageRegionProvenance.DecisionAuthority.HUMAN_REVIEW_REQUIRED, "unresolved region cannot self-accept");
        check(total.provenance().acceptedTextSha256().isEmpty(), "unresolved region has no accepted text digest");
        check(total.provenance().candidateTextSha256s().size() == 2, "disagreement preserves both candidate digests");

        LocalVisionLanguageModelPort selectingVlm = new FixedVlm(false, "$18,735.82", .88);
        DocumentVisionPerceptionService service = new DocumentVisionPerceptionService();
        var perceived = service.adjudicate(page, ensemble, selectingVlm, Map.of("documentType", "invoice"));
        check(perceived.reviewRequiredCount() == 0, "qualified local VLM resolves disagreement");
        var resolved = perceived.regions().stream().filter(r -> r.state() == DocumentVisionPerceptionService.RegionState.ACCEPTED_BY_LOCAL_VLM).findFirst().orElseThrow();
        check(resolved.text().equals("$18,735.82"), "VLM selects supplied OCR candidate");
        check(resolved.provenance().decisionAuthority() == PageRegionProvenance.DecisionAuthority.LOCAL_VLM_ADJUDICATION, "VLM provenance authority recorded");
        check(resolved.provenance().acceptedTextSha256().length() == 64, "VLM accepted text digest bound");

        var abstained = service.adjudicate(page, ensemble, new FixedVlm(true, "", .30), Map.of());
        check(abstained.reviewRequiredCount() == 1, "VLM abstention routes to human review");
        check(abstained.regions().stream().anyMatch(r -> r.diagnostics().contains("VLM_ABSTAINED")), "abstention diagnostic retained");

        var invented = service.adjudicate(page, ensemble, new FixedVlm(false, "$99,999.99", .99), Map.of());
        check(invented.reviewRequiredCount() == 1, "VLM cannot invent replacement text");
        check(invented.regions().stream().anyMatch(r -> r.diagnostics().contains("VLM_RETURNED_NON_CANDIDATE_TEXT")), "invented-text diagnostic");

        LocalVisionLanguageModelPort uncached = new LocalVisionLanguageModelPort() {
            @Override
            public Identity identity() {
                return new Identity("VLM", "WINDOWS_ML", "1", Set.of("OCR_ADJUDICATION"), true, false, false);
            }

            @Override
            public Decision adjudicate(byte[] pageImage, List<Candidate> candidates, Map<String, String> context) {
                throw new AssertionError("uncached VLM must not execute");
            }
        };
        var uncachedResult = service.adjudicate(page, ensemble, uncached, Map.of());
        check(uncachedResult.reviewRequiredCount() == 1, "uncached model cannot adjudicate");
        check(uncachedResult.diagnostics().stream().anyMatch(x -> x.startsWith("LOCAL_VLM_INELIGIBLE:")), "uncached VLM ineligibility recorded");

        boolean sourceMismatchRejected = false;
        try {
            service.adjudicate("not an image".getBytes(java.nio.charset.StandardCharsets.UTF_8), ensemble, selectingVlm, Map.of());
        } catch (IllegalArgumentException expected) {
            sourceMismatchRejected = true;
        }
        check(sourceMismatchRejected, "perception service rejects raster/provenance mismatch");

        boolean ensembleNeedsTwo = false;
        try {
            ensembleExecutor.execute(sourceSha, page, 0, "original", List.of(), List.of(a), registry, Map.of());
        } catch (IllegalArgumentException expected) {
            ensembleNeedsTwo = true;
        }
        check(ensembleNeedsTwo, "ensemble refuses single-engine OCR");

        System.out.println("DOCUMENT_VISION_001A_PORTABLE_PASS assertions=" + n);
    }

    private static List<ConfidenceCalibrationProfile.Sample> calibrationSamples() {
        ArrayList<ConfidenceCalibrationProfile.Sample> samples = new ArrayList<>();
        samples.add(new ConfidenceCalibrationProfile.Sample(.20, false));
        samples.add(new ConfidenceCalibrationProfile.Sample(.30, false));
        samples.add(new ConfidenceCalibrationProfile.Sample(.40, false));
        samples.add(new ConfidenceCalibrationProfile.Sample(.55, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.60, false));
        samples.add(new ConfidenceCalibrationProfile.Sample(.70, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.78, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.82, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.88, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.92, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.96, true));
        samples.add(new ConfidenceCalibrationProfile.Sample(.99, true));
        return List.copyOf(samples);
    }

    private static OcrEnginePort.Region region(String id, String text, double x, double y, double w, double h, double confidence) {
        return new OcrEnginePort.Region(id, text, x, y, w, h, confidence, "WORD", Map.of());
    }

    private static OcrEnginePort fake(String id, String version, boolean networkRequired, List<OcrEnginePort.Region> regions) {
        return new OcrEnginePort() {
            @Override
            public Identity identity() {
                return new Identity(id, version, "digest-" + id, Set.of("ocr.run.recognize"), true, networkRequired);
            }

            @Override
            public Result recognize(byte[] image, String action, Map<String, String> options) {
                return new Result(regions, Map.of(), List.of());
            }
        };
    }

    private static byte[] pageImage() throws Exception {
        BufferedImage image = new BufferedImage(400, 180, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, image.getWidth(), image.getHeight());
        g.setColor(Color.BLACK);
        g.drawString("Invoice", 45, 60);
        g.drawString("$18,735.82", 45, 120);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private record FixedVlm(boolean abstain, String selectedText, double confidence) implements LocalVisionLanguageModelPort {
        @Override
        public Identity identity() {
            return new Identity("LOCAL_VLM_TEST", "WINDOWS_ML", "1", Set.of("OCR_ADJUDICATION"), true, true, false);
        }

        @Override
        public Decision adjudicate(byte[] pageImage, List<Candidate> candidates, Map<String, String> context) {
            return new Decision(selectedText, confidence, abstain, abstain ? List.of() : List.of("OCR_A"), List.of());
        }
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
