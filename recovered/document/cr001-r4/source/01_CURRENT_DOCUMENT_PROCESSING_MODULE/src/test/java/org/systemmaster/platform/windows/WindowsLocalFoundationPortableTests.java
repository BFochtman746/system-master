package org.systemmaster.platform.windows;

import java.util.Map;
import java.util.Set;

import org.systemmaster.platform.windows.WindowsLocalEngineDescriptor.Role;

public final class WindowsLocalFoundationPortableTests {
    private static int n;

    public static void main(String[] args) {
        var catalog = WindowsLocalEngineCatalog.defaultCatalog();
        check(catalog.size() == 11, "catalog size");
        check(catalog.stream().allMatch(WindowsLocalEngineDescriptor::inferenceIsLocal), "all runtime engines local");
        check(catalog.stream().noneMatch(WindowsLocalEngineDescriptor::networkRequiredAtInference), "no inference requires network");
        check(WindowsLocalEngineCatalog.byId().size() == catalog.size(), "unique ids");
        check(WindowsLocalEngineCatalog.byId().get(WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3).supports(Role.TABLE_RECOGNITION), "paddle table role");
        check(WindowsLocalEngineCatalog.byId().get(WindowsLocalEngineCatalog.QPDF).supports(Role.PDF_STRUCTURE), "qpdf structural role");
        check(WindowsLocalEngineCatalog.byId().get(WindowsLocalEngineCatalog.PDFIUM).supports(Role.PDF_RENDER), "pdfium render role");
        check(WindowsLocalEngineCatalog.byId().get(WindowsLocalEngineCatalog.MICROSOFT_OFFICE_ORACLE).supports(Role.PROOF_ORACLE), "office oracle role");

        WindowsLocalRuntimeProfile profile = new WindowsLocalRuntimeProfile(
                26100,
                "x64",
                32L * 1024 * 1024 * 1024,
                true,
                false,
                false,
                Set.of(
                        WindowsLocalEngineCatalog.WINDOWS_ML,
                        WindowsLocalEngineCatalog.FOUNDRY_LOCAL,
                        WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3,
                        WindowsLocalEngineCatalog.TESSERACT,
                        WindowsLocalEngineCatalog.OPENCV,
                        WindowsLocalEngineCatalog.LIBREOFFICE,
                        WindowsLocalEngineCatalog.PDFIUM,
                        WindowsLocalEngineCatalog.QPDF,
                        WindowsLocalEngineCatalog.POPPLER),
                Set.of("doc-vlm-primary", "phi-4"),
                Map.of("gpu", "RTX-class"));
        check(profile.hasEngine(WindowsLocalEngineCatalog.WINDOWS_ML), "profile engine presence");
        check(profile.hasCachedModel("doc-vlm-primary"), "cached model presence");

        LocalOnlyExecutionPolicy policy = new LocalOnlyExecutionPolicy();
        var winMl = WindowsLocalEngineCatalog.byId().get(WindowsLocalEngineCatalog.WINDOWS_ML);
        check(policy.evaluate(winMl, profile, LocalOnlyExecutionPolicy.Phase.DOCUMENT_RUNTIME, "doc-vlm-primary").allowed(), "cached local model allowed");
        check(!policy.evaluate(winMl, profile, LocalOnlyExecutionPolicy.Phase.DOCUMENT_RUNTIME, "missing-model").allowed(), "uncached model blocked at runtime");
        check(policy.evaluate(winMl, profile, LocalOnlyExecutionPolicy.Phase.MODEL_OR_ENGINE_ACQUISITION, "missing-model").allowed(), "setup acquisition separately allowed");

        WindowsLocalCapabilityPlanner planner = new WindowsLocalCapabilityPlanner();
        check(planner.requireBest(Role.PDF_RENDER, profile, null).engineId().equals(WindowsLocalEngineCatalog.PDFIUM), "pdfium preferred render");
        check(planner.requireBest(Role.OCR, profile, null).engineId().equals(WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3), "paddle preferred without windows ai ocr");
        check(planner.requireBest(Role.LOCAL_VISION_LANGUAGE_MODEL, profile, "doc-vlm-primary").engineId().equals(WindowsLocalEngineCatalog.WINDOWS_ML), "windows ml preferred vlm");
        check(planner.requireBest(Role.LOCAL_LANGUAGE_MODEL, profile, "phi-4").engineId().equals(WindowsLocalEngineCatalog.FOUNDRY_LOCAL), "foundry preferred llm");
        check(planner.requireBest(Role.OFFICE_FIDELITY, profile, null).engineId().equals(WindowsLocalEngineCatalog.LIBREOFFICE), "libreoffice preferred when Office absent");

        WindowsLocalRuntimeProfile withOffice = new WindowsLocalRuntimeProfile(
                profile.windowsBuild(), profile.architecture(), profile.physicalMemoryBytes(), profile.directX12Capable(),
                profile.npuPresent(), profile.copilotPlusClass(),
                union(profile.availableEngineIds(), WindowsLocalEngineCatalog.MICROSOFT_OFFICE_ORACLE),
                profile.cachedModelIds(), profile.facts());
        check(planner.requireBest(Role.OFFICE_FIDELITY, withOffice, null).engineId().equals(WindowsLocalEngineCatalog.MICROSOFT_OFFICE_ORACLE), "native Office oracle preferred when installed");

        WindowsLocalRuntimeProfile oldBuild = new WindowsLocalRuntimeProfile(
                22000, "x64", 16L * 1024 * 1024 * 1024, true, false, false,
                Set.of(WindowsLocalEngineCatalog.FOUNDRY_LOCAL), Set.of("phi-4"), Map.of());
        check(planner.eligible(Role.LOCAL_LANGUAGE_MODEL, oldBuild, "phi-4").isEmpty(), "foundry build floor enforced");

        System.out.println("WINDOWS_LOCAL_FOUNDATION_PORTABLE_PASS assertions=" + n + " engines=" + catalog.size());
    }

    private static Set<String> union(Set<String> source, String value) {
        java.util.HashSet<String> result = new java.util.HashSet<>(source);
        result.add(value);
        return Set.copyOf(result);
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
