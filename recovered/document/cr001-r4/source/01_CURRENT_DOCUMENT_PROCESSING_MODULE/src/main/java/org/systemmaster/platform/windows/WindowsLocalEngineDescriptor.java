package org.systemmaster.platform.windows;

import java.util.Objects;
import java.util.Set;

/** Immutable description of a local Windows document-processing engine. */
public record WindowsLocalEngineDescriptor(
        String engineId,
        String displayName,
        Set<Role> roles,
        Runtime runtime,
        boolean inferenceIsLocal,
        boolean networkRequiredAtInference,
        boolean modelCacheRequired,
        int minimumWindowsBuild,
        LicensePosture licensePosture,
        String qualificationNote) {

    public enum Role {
        OFFICE_FIDELITY,
        PDF_RENDER,
        PDF_STRUCTURE,
        IMAGE_PREPROCESS,
        OCR,
        DOCUMENT_LAYOUT,
        TABLE_RECOGNITION,
        FORMULA_RECOGNITION,
        CHART_UNDERSTANDING,
        LOCAL_LANGUAGE_MODEL,
        LOCAL_VISION_LANGUAGE_MODEL,
        PROOF_ORACLE
    }

    public enum Runtime {
        WINDOWS_AI_API,
        WINDOWS_ML,
        FOUNDRY_LOCAL,
        NATIVE_PROCESS,
        PYTHON_WORKER,
        OPTIONAL_DESKTOP_APPLICATION
    }

    public enum LicensePosture {
        PERMISSIVE,
        WEAK_COPYLEFT_REVIEW,
        STRONG_COPYLEFT_OR_COMMERCIAL_REVIEW,
        EXTERNAL_LICENSED_DEPENDENCY,
        REVIEW_REQUIRED
    }

    public WindowsLocalEngineDescriptor {
        engineId = requireText(engineId, "engineId");
        displayName = requireText(displayName, "displayName");
        roles = Set.copyOf(Objects.requireNonNull(roles, "roles"));
        if (roles.isEmpty()) {
            throw new IllegalArgumentException("roles must not be empty");
        }
        runtime = Objects.requireNonNull(runtime, "runtime");
        if (networkRequiredAtInference && inferenceIsLocal) {
            throw new IllegalArgumentException("local inference cannot require network");
        }
        if (minimumWindowsBuild < 0) {
            throw new IllegalArgumentException("minimumWindowsBuild must be non-negative");
        }
        licensePosture = Objects.requireNonNull(licensePosture, "licensePosture");
        qualificationNote = qualificationNote == null ? "" : qualificationNote.trim();
    }

    public boolean supports(Role role) {
        return roles.contains(Objects.requireNonNull(role, "role"));
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException(name + " must not be blank");
        }
        return trimmed;
    }
}
