package org.systemmaster.tools.vision;

import org.systemmaster.platform.windows.WindowsLocalEngineCatalog;

public final class DifficultDocumentPlannerPortableTests {
    private static int n;

    public static void main(String[] args) {
        DifficultDocumentPlanner planner = new DifficultDocumentPlanner();

        var nativePdf = new DocumentVisionSourceProfile(
                .96, .10, 300, .05, .90, .02, .01, .01,
                false, false, false, false, false, false, false);
        check(nativePdf.difficulty() == DocumentVisionSourceProfile.Difficulty.NATIVE_DIGITAL, "native classification");
        var nativePlan = planner.plan(nativePdf);
        check(!nativePlan.requireIndependentOcrAgreement(), "native avoids OCR ensemble");
        check(!nativePlan.requireVisionLanguageAdjudication(), "native avoids VLM");
        check(nativePlan.stages().stream().anyMatch(s -> s.action().equals("NATIVE_TEXT_AND_STRUCTURE")), "native extraction stage");
        check(nativePlan.stages().stream().noneMatch(s -> s.action().equals("OCR_ENSEMBLE")), "no OCR stage");

        var fax = new DocumentVisionSourceProfile(
                .02, .99, 96, 3.4, .25, .72, .41, .08,
                true, false, false, false, false, false, true);
        check(fax.difficulty() == DocumentVisionSourceProfile.Difficulty.HANDWRITING_OR_NONSTANDARD_MARKS, "fax stamp classification");
        var faxPlan = planner.plan(fax);
        check(faxPlan.requireIndependentOcrAgreement(), "fax ensemble required");
        check(faxPlan.requireVisionLanguageAdjudication(), "fax VLM adjudication required");
        check(faxPlan.preserveOriginalRaster(), "original raster preserved");
        check(faxPlan.stages().stream().anyMatch(s -> s.action().equals("IMAGE_RESTORE_DESKEW_DEWARP_DENOISE")), "fax restoration stage");
        check(faxPlan.stages().stream().anyMatch(s -> s.action().equals("LOCAL_VISION_LANGUAGE_ADJUDICATION")), "fax VLM stage");
        var ocrStage = faxPlan.stages().stream().filter(s -> s.action().equals("OCR_ENSEMBLE")).findFirst().orElseThrow();
        check(ocrStage.preferredEngineIds().contains(WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3), "paddle in OCR ensemble");
        check(ocrStage.preferredEngineIds().contains(WindowsLocalEngineCatalog.TESSERACT), "tesseract in OCR ensemble");

        var complex = new DocumentVisionSourceProfile(
                .10, .95, 300, .2, .80, .08, .01, .02,
                false, true, true, true, true, false, false);
        check(complex.difficulty() == DocumentVisionSourceProfile.Difficulty.COMPLEX_LAYOUT, "complex classification");
        var complexPlan = planner.plan(complex);
        check(complexPlan.stages().stream().anyMatch(s -> s.action().equals("LAYOUT_TABLE_FORMULA_CHART_RECONSTRUCTION")), "complex reconstruction stage");
        check(complexPlan.requireVisionLanguageAdjudication(), "complex VLM adjudication");

        var degraded = new DocumentVisionSourceProfile(
                .01, 1.0, 150, 1.8, .40, .42, .12, .18,
                false, false, false, false, false, false, false);
        check(degraded.difficulty() == DocumentVisionSourceProfile.Difficulty.DEGRADED_SCAN, "degraded classification");
        check(planner.plan(degraded).rationale().contains("low-DPI"), "low dpi rationale");
        check(planner.plan(degraded).rationale().contains("skewed"), "skew rationale");
        check(planner.plan(degraded).rationale().contains("noisy"), "noise rationale");

        boolean rejected = false;
        try {
            new DocumentVisionSourceProfile(1.2, 0, 300, 0, .5, .1, .1, .1, false, false, false, false, false, false, false);
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        check(rejected, "invalid normalized signal rejected");

        System.out.println("DIFFICULT_DOCUMENT_PLANNER_PORTABLE_PASS assertions=" + n);
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
