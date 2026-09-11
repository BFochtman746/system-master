package org.systemmaster.platform.windows;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.platform.windows.WindowsLocalEngineDescriptor.Role;

/** Chooses the best declared local engine for a role without silently falling back to cloud. */
public final class WindowsLocalCapabilityPlanner {
    private final Map<String, WindowsLocalEngineDescriptor> catalog;
    private final LocalOnlyExecutionPolicy policy;

    public WindowsLocalCapabilityPlanner() {
        this(WindowsLocalEngineCatalog.byId(), new LocalOnlyExecutionPolicy());
    }

    public WindowsLocalCapabilityPlanner(
            Map<String, WindowsLocalEngineDescriptor> catalog,
            LocalOnlyExecutionPolicy policy) {
        this.catalog = Map.copyOf(Objects.requireNonNull(catalog, "catalog"));
        this.policy = Objects.requireNonNull(policy, "policy");
    }

    public List<WindowsLocalEngineDescriptor> eligible(
            Role role,
            WindowsLocalRuntimeProfile profile,
            String requiredModelId) {
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(profile, "profile");
        ArrayList<WindowsLocalEngineDescriptor> eligible = new ArrayList<>();
        for (WindowsLocalEngineDescriptor descriptor : catalog.values()) {
            if (!descriptor.supports(role)) {
                continue;
            }
            LocalOnlyExecutionPolicy.Decision decision = policy.evaluate(
                    descriptor,
                    profile,
                    LocalOnlyExecutionPolicy.Phase.DOCUMENT_RUNTIME,
                    requiredModelId);
            if (decision.allowed()) {
                eligible.add(descriptor);
            }
        }
        eligible.sort(Comparator
                .comparingInt((WindowsLocalEngineDescriptor descriptor) -> priority(role, descriptor.engineId()))
                .thenComparing(WindowsLocalEngineDescriptor::engineId));
        return List.copyOf(eligible);
    }

    public WindowsLocalEngineDescriptor requireBest(
            Role role,
            WindowsLocalRuntimeProfile profile,
            String requiredModelId) {
        List<WindowsLocalEngineDescriptor> eligible = eligible(role, profile, requiredModelId);
        if (eligible.isEmpty()) {
            throw new IllegalStateException("no local engine is eligible for role " + role);
        }
        return eligible.get(0);
    }

    private static int priority(Role role, String engineId) {
        if (role == Role.OCR) {
            if (engineId.equals(WindowsLocalEngineCatalog.WINDOWS_AI_OCR)) return 10;
            if (engineId.equals(WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3)) return 20;
            if (engineId.equals(WindowsLocalEngineCatalog.TESSERACT)) return 30;
        }
        if (role == Role.DOCUMENT_LAYOUT || role == Role.TABLE_RECOGNITION
                || role == Role.FORMULA_RECOGNITION || role == Role.CHART_UNDERSTANDING) {
            if (engineId.equals(WindowsLocalEngineCatalog.PADDLE_STRUCTURE_V3)) return 10;
            if (engineId.equals(WindowsLocalEngineCatalog.WINDOWS_ML)) return 20;
        }
        if (role == Role.PDF_RENDER) {
            if (engineId.equals(WindowsLocalEngineCatalog.PDFIUM)) return 10;
            if (engineId.equals(WindowsLocalEngineCatalog.POPPLER)) return 20;
        }
        if (role == Role.OFFICE_FIDELITY) {
            if (engineId.equals(WindowsLocalEngineCatalog.MICROSOFT_OFFICE_ORACLE)) return 10;
            if (engineId.equals(WindowsLocalEngineCatalog.LIBREOFFICE)) return 20;
        }
        if (role == Role.LOCAL_LANGUAGE_MODEL && engineId.equals(WindowsLocalEngineCatalog.FOUNDRY_LOCAL)) return 10;
        if (role == Role.LOCAL_VISION_LANGUAGE_MODEL && engineId.equals(WindowsLocalEngineCatalog.WINDOWS_ML)) return 10;
        return 100;
    }
}
