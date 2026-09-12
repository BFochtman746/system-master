package org.systemmaster.platform.windows;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.systemmaster.platform.windows.WindowsLocalEngineDescriptor.LicensePosture;
import static org.systemmaster.platform.windows.WindowsLocalEngineDescriptor.Role;
import static org.systemmaster.platform.windows.WindowsLocalEngineDescriptor.Runtime;

/** Frozen v1 engine catalog for the Windows-local document stack. */
public final class WindowsLocalEngineCatalog {
    public static final String WINDOWS_ML = "WINDOWS_ML";
    public static final String FOUNDRY_LOCAL = "FOUNDRY_LOCAL";
    public static final String WINDOWS_AI_OCR = "WINDOWS_AI_OCR";
    public static final String PADDLE_STRUCTURE_V3 = "PADDLE_STRUCTURE_V3";
    public static final String TESSERACT = "TESSERACT";
    public static final String OPENCV = "OPENCV";
    public static final String LIBREOFFICE = "LIBREOFFICE";
    public static final String PDFIUM = "PDFIUM";
    public static final String QPDF = "QPDF";
    public static final String POPPLER = "POPPLER";
    public static final String MICROSOFT_OFFICE_ORACLE = "MICROSOFT_OFFICE_ORACLE";

    private WindowsLocalEngineCatalog() {
    }

    public static List<WindowsLocalEngineDescriptor> defaultCatalog() {
        return List.of(
                new WindowsLocalEngineDescriptor(
                        WINDOWS_ML,
                        "Windows ML",
                        Set.of(Role.LOCAL_VISION_LANGUAGE_MODEL, Role.DOCUMENT_LAYOUT, Role.OCR),
                        Runtime.WINDOWS_ML,
                        true,
                        false,
                        true,
                        0,
                        LicensePosture.REVIEW_REQUIRED,
                        "Preferred hardware abstraction for custom ONNX models; optimized execution providers require newer Windows 11 builds."),
                new WindowsLocalEngineDescriptor(
                        FOUNDRY_LOCAL,
                        "Microsoft Foundry Local",
                        Set.of(Role.LOCAL_LANGUAGE_MODEL),
                        Runtime.FOUNDRY_LOCAL,
                        true,
                        false,
                        true,
                        26100,
                        LicensePosture.REVIEW_REQUIRED,
                        "Local LLM runtime after models are cached; catalog/model acquisition is a separate setup-time operation."),
                new WindowsLocalEngineDescriptor(
                        WINDOWS_AI_OCR,
                        "Windows AI OCR",
                        Set.of(Role.OCR),
                        Runtime.WINDOWS_AI_API,
                        true,
                        false,
                        false,
                        26100,
                        LicensePosture.REVIEW_REQUIRED,
                        "Optional fast native OCR path when supported Windows AI components and hardware are present."),
                new WindowsLocalEngineDescriptor(
                        PADDLE_STRUCTURE_V3,
                        "PaddleOCR PP-StructureV3",
                        Set.of(Role.OCR, Role.DOCUMENT_LAYOUT, Role.TABLE_RECOGNITION, Role.FORMULA_RECOGNITION, Role.CHART_UNDERSTANDING),
                        Runtime.PYTHON_WORKER,
                        true,
                        false,
                        true,
                        0,
                        LicensePosture.PERMISSIVE,
                        "Primary structured-document perception candidate: layout, tables, formulas, charts, reading order and Markdown reconstruction."),
                new WindowsLocalEngineDescriptor(
                        TESSERACT,
                        "Tesseract OCR",
                        Set.of(Role.OCR),
                        Runtime.NATIVE_PROCESS,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.PERMISSIVE,
                        "Independent OCR fallback and disagreement oracle; already qualified by the recovered OCR lane."),
                new WindowsLocalEngineDescriptor(
                        OPENCV,
                        "OpenCV",
                        Set.of(Role.IMAGE_PREPROCESS),
                        Runtime.PYTHON_WORKER,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.PERMISSIVE,
                        "Deskew, dewarp, thresholding, denoise, morphology, perspective correction and fax restoration primitives."),
                new WindowsLocalEngineDescriptor(
                        LIBREOFFICE,
                        "LibreOffice",
                        Set.of(Role.OFFICE_FIDELITY, Role.PROOF_ORACLE),
                        Runtime.NATIVE_PROCESS,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.WEAK_COPYLEFT_REVIEW,
                        "Current independent DOCX/PPTX render and conversion worker; execute headless with isolated user profile."),
                new WindowsLocalEngineDescriptor(
                        PDFIUM,
                        "PDFium",
                        Set.of(Role.PDF_RENDER, Role.PROOF_ORACLE),
                        Runtime.NATIVE_PROCESS,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.PERMISSIVE,
                        "Preferred embeddable Windows PDF render candidate for production qualification."),
                new WindowsLocalEngineDescriptor(
                        QPDF,
                        "qpdf",
                        Set.of(Role.PDF_STRUCTURE),
                        Runtime.NATIVE_PROCESS,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.PERMISSIVE,
                        "Content-preserving low-level PDF structural transform and inspection engine."),
                new WindowsLocalEngineDescriptor(
                        POPPLER,
                        "Poppler tools",
                        Set.of(Role.PDF_RENDER, Role.PROOF_ORACLE),
                        Runtime.NATIVE_PROCESS,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.STRONG_COPYLEFT_OR_COMMERCIAL_REVIEW,
                        "Retained as an independent qualification oracle where license/deployment policy permits."),
                new WindowsLocalEngineDescriptor(
                        MICROSOFT_OFFICE_ORACLE,
                        "Microsoft Word/PowerPoint desktop oracle",
                        Set.of(Role.OFFICE_FIDELITY, Role.PROOF_ORACLE),
                        Runtime.OPTIONAL_DESKTOP_APPLICATION,
                        true,
                        false,
                        false,
                        0,
                        LicensePosture.EXTERNAL_LICENSED_DEPENDENCY,
                        "Optional top-tier local fidelity oracle when licensed desktop Office is installed; never the canonical storage authority."));
    }

    public static Map<String, WindowsLocalEngineDescriptor> byId() {
        LinkedHashMap<String, WindowsLocalEngineDescriptor> result = new LinkedHashMap<>();
        for (WindowsLocalEngineDescriptor descriptor : defaultCatalog()) {
            WindowsLocalEngineDescriptor previous = result.put(descriptor.engineId(), descriptor);
            if (previous != null) {
                throw new IllegalStateException("duplicate engineId " + descriptor.engineId());
            }
        }
        return Map.copyOf(result);
    }
}
