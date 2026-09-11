package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;
import org.systemmaster.tools.document.DocumentProcessingService;
import org.systemmaster.tools.document.DocumentProofReceipt;
import org.systemmaster.tools.document.NativePartPreservationMap;
import org.systemmaster.tools.document.RenderProofWorker;
import org.systemmaster.tools.document.accessibility.AccessibilityComplianceEngine;
import org.systemmaster.tools.document.accessibility.AccessibilityValidatorPort;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/** Independent proof collection used by the spine after mutation; it never performs native mutation. */
public final class DocumentSpineProofService {
    private final DocumentProcessingService documents;
    private final RenderProofWorker renderWorker;
    private final Clock clock;
    private final AccessibilityComplianceEngine accessibility;

    public DocumentSpineProofService(DocumentProcessingService documents, RenderProofWorker renderWorker, Clock clock) {
        this(documents, renderWorker, clock, null);
    }

    public DocumentSpineProofService(
            DocumentProcessingService documents,
            RenderProofWorker renderWorker,
            Clock clock,
            AccessibilityValidatorPort accessibilityValidator) {
        this.documents = Objects.requireNonNull(documents, "documents");
        this.renderWorker = renderWorker;
        this.clock = Objects.requireNonNull(clock, "clock");
        this.accessibility = new AccessibilityComplianceEngine(accessibilityValidator);
    }

    public String identity() {
        String renderer = renderWorker == null ? "no-render-worker" : renderWorker.getClass().getName();
        return "DOCUMENT-WORLD-CLASS-001C|" + renderer + "|a11y=" + accessibility.identity();
    }

    public Optional<DocumentProofReceipt> render(
            DocumentSpineJob job,
            DocumentOperationContract operation,
            DocumentFormat format,
            byte[] resultBytes) throws Exception {
        if (!operation.requiredProofGates().contains(DocumentProofReceipt.Gate.RENDERED)) {
            return Optional.empty();
        }
        if (renderWorker == null) {
            return Optional.empty();
        }
        List<String> snippets = requiredSnippets(operation);
        RenderProofWorker.Request request = new RenderProofWorker.Request(
                format,
                resultBytes,
                job.resultArtifactId() + extension(format),
                null,
                1,
                snippets,
                0,
                true);
        RenderProofWorker.Result result = renderWorker.prove(request);
        return Optional.of(result.receipt().toGateReceipt(operation.sourceArtifactSha256()));
    }

    public DocumentProofReceipt packageProof(
            DocumentOperationContract operation,
            DocumentFormat format,
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph,
            NativePartPreservationMap.Assessment preservation) throws Exception {
        DocumentFormat detected = documents.detect(resultBytes, "result" + extension(format), format.mediaType());
        CanonicalDocumentGraphV2 reprojection = documents.projectCanonicalGraphV2(format, resultBytes);
        boolean pass = detected == format
                && reprojection.sourceSha256().equals(resultGraph.sourceSha256())
                && preservation.pass();
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("detected-format=" + detected);
        evidence.add("cdg2-source=" + reprojection.sourceSha256());
        evidence.add("native-preservation=" + preservation.pass());
        evidence.add("changed-native-parts=" + preservation.changedParts());
        return receipt(
                DocumentProofReceipt.Gate.PACKAGE,
                pass,
                operation,
                resultGraph.sourceSha256(),
                "DocumentSpinePackageProof",
                evidence,
                Map.of("changedNativeParts", Long.toString(preservation.changedParts())));
    }

    public DocumentProofReceipt semanticProof(
            DocumentOperationContract operation,
            DocumentFormat format,
            byte[] sourceBytes,
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph) throws Exception {
        String sourceText = documents.extractPlainText(format, sourceBytes);
        String resultText = documents.extractPlainText(format, resultBytes);
        boolean pass;
        ArrayList<String> evidence = new ArrayList<>();
        if (operation.type() == DocumentOperationContract.Type.REPLACE_TEXT) {
            String search = operation.parameters().getOrDefault("search", "");
            String replacement = operation.parameters().getOrDefault("replacement", "");
            pass = !search.isEmpty()
                    && sourceText.contains(search)
                    && resultText.contains(replacement)
                    && !DocumentSpineDigests.sha256(sourceBytes).equals(DocumentSpineDigests.sha256(resultBytes));
            evidence.add("source-contained-search=" + sourceText.contains(search));
            evidence.add("result-contained-replacement=" + resultText.contains(replacement));
        } else if (operation.type() == DocumentOperationContract.Type.CONVERT && format == DocumentFormat.PDF) {
            String rebuildText = operation.parameters().getOrDefault("rebuildText", "");
            String expected = firstNonBlankLine(rebuildText);
            pass = !expected.isEmpty() && resultText.contains(expected);
            evidence.add("pdf-rebuild-expected-text=" + expected);
            evidence.add("pdf-rebuild-result-contains=" + resultText.contains(expected));
        } else {
            pass = !resultGraph.semanticDigest().isBlank();
            evidence.add("semantic-digest=" + resultGraph.semanticDigest());
        }
        evidence.add("source-semantic=" + operation.sourceSemanticSha256());
        evidence.add("result-semantic=" + resultGraph.semanticDigest());
        return receipt(
                DocumentProofReceipt.Gate.SEMANTIC,
                pass,
                operation,
                resultGraph.sourceSha256(),
                "DocumentSpineSemanticProof",
                evidence,
                Map.of("sourceTextLength", Integer.toString(sourceText.length()), "resultTextLength", Integer.toString(resultText.length())));
    }


    public DocumentProofReceipt accessibilityProof(
            DocumentOperationContract operation,
            DocumentFormat format,
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph) throws Exception {
        AccessibilityComplianceEngine.Report report = accessibility.evaluate(format, resultBytes, resultGraph, operation);
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("profile=" + report.profile());
        evidence.add("accessibility-engine=" + accessibility.identity());
        for (AccessibilityComplianceEngine.RuleResult rule : report.rules()) {
            evidence.add("rule=" + rule.code() + "|" + rule.capabilityId() + "|" + rule.status() + "|" + rule.elementId() + "|" + rule.message());
        }
        evidence.addAll(report.evidence());
        return new DocumentProofReceipt(
                DocumentProofReceipt.Gate.ACCESSIBILITY,
                report.pass() ? DocumentProofReceipt.Status.PASS : DocumentProofReceipt.Status.FAIL,
                operation.sourceArtifactSha256(),
                resultGraph.sourceSha256(),
                "AccessibilityComplianceEngine",
                AccessibilityComplianceEngine.ENGINE_VERSION,
                Instant.now(clock),
                evidence,
                report.measurements());
    }

    public DocumentProofReceipt securityProof(
            DocumentOperationContract operation,
            DocumentFormat format,
            byte[] resultBytes,
            CanonicalDocumentGraphV2 resultGraph) throws Exception {
        DocumentProcessingService.Inspection inspection = documents.inspect(format, resultBytes);
        List<String> active = inspection.diagnostics().stream()
                .filter(value -> value.contains("ACTIVE_CONTENT"))
                .toList();
        boolean pass = active.isEmpty();
        ArrayList<String> evidence = new ArrayList<>();
        evidence.add("active-content-findings=" + active.size());
        evidence.addAll(active);
        evidence.add("unknown-native-features=" + resultGraph.unknownNativeFeatures().size());
        return receipt(
                DocumentProofReceipt.Gate.SECURITY,
                pass,
                operation,
                resultGraph.sourceSha256(),
                "DocumentSpineSecurityProof",
                evidence,
                Map.of("activeContentFindings", Integer.toString(active.size())));
    }

    public DocumentProofReceipt provenanceProof(
            DocumentSpineJob job,
            DocumentSpineExecutionPlan plan,
            DocumentOperationContract operation,
            String mutationEngine,
            CanonicalDocumentGraphV2 resultGraph) {
        boolean pass = !job.projectId().isBlank()
                && !job.jobId().isBlank()
                && !job.sourceArtifactId().isBlank()
                && !job.resultArtifactId().isBlank()
                && !plan.capabilityIds().isEmpty()
                && !mutationEngine.isBlank();
        List<String> evidence = List.of(
                "project-id=" + job.projectId(),
                "job-id=" + job.jobId(),
                "source-artifact-id=" + job.sourceArtifactId(),
                "result-artifact-id=" + job.resultArtifactId(),
                "operation-intent=" + operation.intentDigest(),
                "mutation-engine=" + mutationEngine,
                "capabilities=" + String.join(";", plan.capabilityIds().stream().sorted().toList()));
        return receipt(
                DocumentProofReceipt.Gate.PROVENANCE,
                pass,
                operation,
                resultGraph.sourceSha256(),
                "DocumentSpineProvenanceProof",
                evidence,
                Map.of("capabilityCount", Integer.toString(plan.capabilityIds().size())));
    }

    public static String serialize(DocumentProofReceipt receipt) {
        String evidence = String.join("\n", receipt.evidence());
        String measurements = receipt.measurements().entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");
        return String.join("|",
                receipt.gate().name(),
                receipt.status().name(),
                receipt.sourceSha256(),
                receipt.resultSha256(),
                b64(receipt.engine()),
                b64(receipt.engineVersion()),
                receipt.completedAt().toString(),
                b64(evidence),
                b64(measurements));
    }

    public static DocumentProofReceipt deserialize(String serialized) {
        String[] fields = serialized.split("\\|", -1);
        if (fields.length != 9) {
            throw new IllegalArgumentException("invalid serialized proof receipt");
        }
        List<String> evidence = splitLines(unb64(fields[7]));
        Map<String, String> measurements = parseMeasurements(unb64(fields[8]));
        return new DocumentProofReceipt(
                DocumentProofReceipt.Gate.valueOf(fields[0]),
                DocumentProofReceipt.Status.valueOf(fields[1]),
                fields[2],
                fields[3],
                unb64(fields[4]),
                unb64(fields[5]),
                Instant.parse(fields[6]),
                evidence,
                measurements);
    }

    private DocumentProofReceipt receipt(
            DocumentProofReceipt.Gate gate,
            boolean pass,
            DocumentOperationContract operation,
            String resultSha,
            String engine,
            List<String> evidence,
            Map<String, String> measurements) {
        return new DocumentProofReceipt(
                gate,
                pass ? DocumentProofReceipt.Status.PASS : DocumentProofReceipt.Status.FAIL,
                operation.sourceArtifactSha256(),
                resultSha,
                engine,
                "DOCUMENT-SPINE-002A",
                Instant.now(clock),
                evidence,
                measurements);
    }

    private static List<String> requiredSnippets(DocumentOperationContract operation) {
        if (operation.type() == DocumentOperationContract.Type.REPLACE_TEXT) {
            String replacement = operation.parameters().getOrDefault("replacement", "");
            return replacement.isBlank() ? List.of() : List.of(replacement);
        }
        if (operation.type() == DocumentOperationContract.Type.CONVERT) {
            String first = firstNonBlankLine(operation.parameters().getOrDefault("rebuildText", ""));
            return first.isBlank() ? List.of() : List.of(first);
        }
        return List.of();
    }

    private static String firstNonBlankLine(String value) {
        return Objects.requireNonNullElse(value, "").lines()
                .map(String::trim)
                .filter(line -> !line.isEmpty())
                .findFirst()
                .orElse("");
    }

    private static String extension(DocumentFormat format) {
        return switch (format) {
            case DOCX -> ".docx";
            case DOCM -> ".docm";
            case PDF -> ".pdf";
            case PPTX -> ".pptx";
            case PPTM -> ".pptm";
            case MARKDOWN -> ".md";
            case PLAIN_TEXT -> ".txt";
            case HTML -> ".html";
            case RTF -> ".rtf";
            case ODT -> ".odt";
            case EPUB -> ".epub";
            case LEGACY_DOC -> ".doc";
            case LEGACY_PPT -> ".ppt";
            case ODP -> ".odp";
            case PPSX -> ".ppsx";
            case POTX -> ".potx";
            case UNKNOWN -> ".bin";
        };
    }

    private static String b64(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                Objects.requireNonNullElse(value, "").getBytes(StandardCharsets.UTF_8));
    }

    private static String unb64(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static List<String> splitLines(String value) {
        if (value.isEmpty()) {
            return List.of();
        }
        return List.of(value.split("\\n", -1));
    }

    private static Map<String, String> parseMeasurements(String value) {
        if (value.isEmpty()) {
            return Map.of();
        }
        LinkedHashMap<String, String> out = new LinkedHashMap<>();
        for (String line : value.split("\\n", -1)) {
            int equals = line.indexOf('=');
            if (equals < 1) {
                throw new IllegalArgumentException("invalid proof measurement");
            }
            out.put(line.substring(0, equals), line.substring(equals + 1));
        }
        return Map.copyOf(out);
    }
}
