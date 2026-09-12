package org.systemmaster.tools.vision;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.systemmaster.platform.windows.WindowsLocalEngineCatalog;

/** Plans a fail-closed local perception route for digital PDFs, scans, faxes and complex pages. */
public final class DifficultDocumentPlanner {
    public DocumentVisionPlan plan(DocumentVisionSourceProfile profile) {
        Objects.requireNonNull(profile, "profile");
        DocumentVisionSourceProfile.Difficulty difficulty = profile.difficulty();
        ArrayList<DocumentVisionPlan.Stage> stages = new ArrayList<>();

        stages.add(stage("SOURCE_FORENSICS", List.of(
                WindowsLocalEngineCatalog.PDFIUM,
                WindowsLocalEngineCatalog.QPDF), true));

        if (difficulty == DocumentVisionSourceProfile.Difficulty.NATIVE_DIGITAL) {
            stages.add(stage("NATIVE_TEXT_AND_STRUCTURE", List.of(
                    WindowsLocalEngineCatalog.PDFIUM,
                    WindowsLocalEngineCatalog.QPDF), true));
            stages.add(stage("RENDER_PROOF", List.of(
                    WindowsLocalEngineCatalog.PDFIUM,
                    WindowsLocalEngineCatalog.POPPLER), true));
            return new DocumentVisionPlan(
                    difficulty,
                    stages,
                    false,
                    false,
                    true,
                    "Native text dominates; avoid destructive OCR and preserve the original PDF text/graphics objects." );
        }

        boolean degraded = difficulty == DocumentVisionSourceProfile.Difficulty.DEGRADED_SCAN
                || difficulty == DocumentVisionSourceProfile.Difficulty.MIXED;
        boolean complex = difficulty == DocumentVisionSourceProfile.Difficulty.COMPLEX_LAYOUT
                || difficulty == DocumentVisionSourceProfile.Difficulty.MIXED
                || profile.hasTables() || profile.hasFormulas() || profile.hasCharts() || profile.multiColumn();
        boolean nonstandard = difficulty == DocumentVisionSourceProfile.Difficulty.HANDWRITING_OR_NONSTANDARD_MARKS;

        if (degraded || profile.suspectExistingOcr()) {
            stages.add(stage("IMAGE_RESTORE_DESKEW_DEWARP_DENOISE", List.of(
                    WindowsLocalEngineCatalog.OPENCV,
                    WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3), true));
        }

        stages.add(stage("OCR_ENSEMBLE", List.of(
                WindowsLocalEngineCatalog.WINDOWS_AI_OCR,
                WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3,
                WindowsLocalEngineCatalog.TESSERACT), true));

        if (complex) {
            stages.add(stage("LAYOUT_TABLE_FORMULA_CHART_RECONSTRUCTION", List.of(
                    WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3,
                    WindowsLocalEngineCatalog.WINDOWS_ML), true));
        }

        boolean adjudicate = degraded || complex || nonstandard || profile.suspectExistingOcr();
        if (adjudicate) {
            stages.add(stage("LOCAL_VISION_LANGUAGE_ADJUDICATION", List.of(
                    WindowsLocalEngineCatalog.WINDOWS_ML), true));
        }

        stages.add(stage("CDG_RECONSTRUCTION_AND_PROVENANCE", List.of(
                WindowsLocalEngineCatalog.WINDOWS_ML), true));
        stages.add(stage("INDEPENDENT_RENDER_AND_TEXT_PROOF", List.of(
                WindowsLocalEngineCatalog.PDFIUM,
                WindowsLocalEngineCatalog.POPPLER), true));

        return new DocumentVisionPlan(
                difficulty,
                stages,
                true,
                adjudicate,
                true,
                rationale(profile, difficulty));
    }

    private static DocumentVisionPlan.Stage stage(String action, List<String> engines, boolean mandatory) {
        return new DocumentVisionPlan.Stage(action, engines, mandatory);
    }

    private static String rationale(DocumentVisionSourceProfile profile, DocumentVisionSourceProfile.Difficulty difficulty) {
        StringBuilder out = new StringBuilder("Difficulty=").append(difficulty);
        if (profile.estimatedDpi() > 0 && profile.estimatedDpi() < 220) out.append("; low-DPI");
        if (Math.abs(profile.skewDegrees()) >= 1.25) out.append("; skewed");
        if (profile.noiseScore() >= 0.30) out.append("; noisy");
        if (profile.bleedThroughScore() >= 0.20) out.append("; bleed-through");
        if (profile.perspectiveDistortionScore() >= 0.15) out.append("; perspective distortion");
        if (profile.suspectExistingOcr()) out.append("; suspect OCR layer");
        if (profile.hasTables()) out.append("; tables");
        if (profile.hasFormulas()) out.append("; formulas");
        if (profile.hasCharts()) out.append("; charts");
        if (profile.hasHandwriting()) out.append("; handwriting");
        if (profile.hasStampsOrSeals()) out.append("; stamps/seals");
        return out.toString();
    }
}
