package org.systemmaster.tools.document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Evidence emitted by an independent render + PDF inspection + raster QA pass. */
public record RenderProofReceipt(
        String schemaVersion,
        DocumentFormat sourceFormat,
        String proofedArtifactSha256,
        String renderedPdfSha256,
        String renderer,
        String rendererVersion,
        String pdfOracle,
        String pdfOracleVersion,
        Instant completedAt,
        IsolationEvidence isolation,
        List<PageEvidence> pages,
        List<VisualFinding> findings,
        Map<String,String> measurements) {

    public static final String SCHEMA_V1 = "RENDER-PROOF-1";

    public enum Severity { INFO, WARNING, ERROR }
    public enum NetworkIsolation { ENFORCED_BY_EXTERNAL_SANDBOX, NOT_KERNEL_ENFORCED_LOCAL_QUALIFICATION }

    public record IsolationEvidence(
            boolean freshWorkspace,
            boolean privateUserProfile,
            boolean sanitizedEnvironment,
            NetworkIsolation networkIsolation,
            long timeoutMillis,
            long maxOutputBytes,
            String locale,
            String timezone) {
        public IsolationEvidence {
            Objects.requireNonNull(networkIsolation, "networkIsolation");
            if (timeoutMillis < 1 || maxOutputBytes < 1) throw new IllegalArgumentException("positive render limits required");
            locale = Objects.requireNonNullElse(locale, "C.UTF-8");
            timezone = Objects.requireNonNullElse(timezone, "UTC");
        }
    }

    public record PageEvidence(
            int pageNumber,
            double widthPoints,
            double heightPoints,
            int rotationDegrees,
            int rasterWidthPx,
            int rasterHeightPx,
            String rasterSha256,
            double inkCoverage,
            double borderInkCoverage,
            int extractedTextCharacters,
            int imageCount) {
        public PageEvidence {
            if (pageNumber < 1) throw new IllegalArgumentException("page number must be >= 1");
            if (widthPoints <= 0 || heightPoints <= 0) throw new IllegalArgumentException("positive page geometry required");
            if (rasterWidthPx <= 0 || rasterHeightPx <= 0) throw new IllegalArgumentException("positive raster geometry required");
            requireSha(rasterSha256, "raster");
            if (inkCoverage < 0 || inkCoverage > 1 || borderInkCoverage < 0 || borderInkCoverage > 1) throw new IllegalArgumentException("coverage outside [0,1]");
            if (extractedTextCharacters < 0 || imageCount < 0) throw new IllegalArgumentException("negative evidence count");
        }
    }

    public record VisualFinding(String code, Severity severity, int pageNumber, String detail) {
        public VisualFinding {
            if (code == null || code.isBlank()) throw new IllegalArgumentException("finding code required");
            Objects.requireNonNull(severity, "severity");
            if (pageNumber < 0) throw new IllegalArgumentException("page number cannot be negative");
            detail = Objects.requireNonNullElse(detail, "");
        }
    }

    public RenderProofReceipt {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported render proof schema: " + schemaVersion);
        Objects.requireNonNull(sourceFormat, "sourceFormat");
        requireSha(proofedArtifactSha256, "proofed artifact");
        requireSha(renderedPdfSha256, "rendered PDF");
        if (renderer == null || renderer.isBlank()) throw new IllegalArgumentException("renderer required");
        rendererVersion = Objects.requireNonNullElse(rendererVersion, "unknown");
        if (pdfOracle == null || pdfOracle.isBlank()) throw new IllegalArgumentException("pdf oracle required");
        pdfOracleVersion = Objects.requireNonNullElse(pdfOracleVersion, "unknown");
        Objects.requireNonNull(completedAt, "completedAt");
        Objects.requireNonNull(isolation, "isolation");
        pages = List.copyOf(Objects.requireNonNullElse(pages, List.of()));
        if (pages.isEmpty()) throw new IllegalArgumentException("render proof requires page evidence");
        findings = List.copyOf(Objects.requireNonNullElse(findings, List.of()));
        measurements = Map.copyOf(Objects.requireNonNullElse(measurements, Map.of()));
    }

    public boolean pass() { return findings.stream().noneMatch(f -> f.severity() == Severity.ERROR); }

    public DocumentProofReceipt toGateReceipt(String operationSourceSha256) {
        requireSha(operationSourceSha256, "operation source");
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("rendered-pdf-sha256=" + renderedPdfSha256);
        evidence.add("pages=" + pages.size());
        evidence.add("renderer=" + renderer + " " + rendererVersion);
        evidence.add("pdf-oracle=" + pdfOracle + " " + pdfOracleVersion);
        evidence.add("network-isolation=" + isolation.networkIsolation());
        for (VisualFinding finding : findings) evidence.add(finding.severity() + ":" + finding.code() + ":page=" + finding.pageNumber());
        return new DocumentProofReceipt(
                DocumentProofReceipt.Gate.RENDERED,
                pass() ? DocumentProofReceipt.Status.PASS : DocumentProofReceipt.Status.FAIL,
                operationSourceSha256,
                proofedArtifactSha256,
                renderer + "->" + pdfOracle,
                rendererVersion + "/" + pdfOracleVersion,
                completedAt,
                evidence,
                measurements);
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
