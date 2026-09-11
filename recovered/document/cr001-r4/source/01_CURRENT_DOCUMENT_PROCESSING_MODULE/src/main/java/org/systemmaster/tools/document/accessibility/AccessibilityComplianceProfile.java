package org.systemmaster.tools.document.accessibility;

import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;

import java.util.Locale;
import java.util.Objects;

/** Explicit accessibility/conformance target. PDF/A is intentionally not accepted as an accessibility profile. */
public enum AccessibilityComplianceProfile {
    OFFICE_ACCESSIBLE(false),
    WCAG_2_2_AA(false),
    GENERAL_ACCESSIBILITY(false),
    PDF_UA_2(true);

    private final boolean qualifiedValidatorRequired;

    AccessibilityComplianceProfile(boolean qualifiedValidatorRequired) {
        this.qualifiedValidatorRequired = qualifiedValidatorRequired;
    }

    public boolean qualifiedValidatorRequired() {
        return qualifiedValidatorRequired;
    }

    public static AccessibilityComplianceProfile resolve(DocumentFormat format, DocumentOperationContract operation) {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(operation, "operation");
        String requested = operation.parameters().getOrDefault("accessibilityProfile", "").strip();
        if (!requested.isEmpty()) {
            String normalized = requested.toUpperCase(Locale.ROOT).replace('-', '_').replace('.', '_');
            if (normalized.startsWith("PDF_A")) {
                throw new IllegalArgumentException("PDF/A is an archival conformance profile, not an accessibility profile");
            }
            if (normalized.equals("PDF_UA_2") || normalized.equals("PDFUA2")) {
                if (format != DocumentFormat.PDF) {
                    throw new IllegalArgumentException("PDF/UA-2 accessibility profile applies only to PDF artifacts");
                }
                return PDF_UA_2;
            }
            if (normalized.equals("WCAG_2_2_AA") || normalized.equals("WCAG22_AA")) {
                return WCAG_2_2_AA;
            }
            if (normalized.equals("OFFICE_ACCESSIBLE")) {
                return OFFICE_ACCESSIBLE;
            }
            if (normalized.equals("GENERAL") || normalized.equals("GENERAL_ACCESSIBILITY")) {
                return GENERAL_ACCESSIBILITY;
            }
            throw new IllegalArgumentException("unsupported accessibility profile: " + requested);
        }
        if (format == DocumentFormat.DOCX || format == DocumentFormat.DOCM
                || format == DocumentFormat.PPTX || format == DocumentFormat.PPTM) {
            return OFFICE_ACCESSIBLE;
        }
        if (format == DocumentFormat.PDF && operation.finalCandidate()) {
            return PDF_UA_2;
        }
        if (format == DocumentFormat.HTML) {
            return WCAG_2_2_AA;
        }
        return GENERAL_ACCESSIBILITY;
    }
}
