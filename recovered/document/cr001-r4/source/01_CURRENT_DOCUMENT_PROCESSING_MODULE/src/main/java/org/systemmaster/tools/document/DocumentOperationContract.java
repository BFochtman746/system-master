package org.systemmaster.tools.document;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * CDG-1/CDG-2 governed operation contract. Models may propose this contract; deterministic format engines execute it.
 * It binds the exact source, semantic projection, intended effect, rollback, preservation expectations, and proof gates.
 */
public record DocumentOperationContract(
        String schemaVersion,
        String operationId,
        String sourceArtifactSha256,
        String sourceSemanticSha256,
        Type type,
        List<DocumentSelector> selectors,
        String intendedEffect,
        Map<String,String> parameters,
        Risk risk,
        String rollbackArtifactSha256,
        Set<String> expectedChangedNativeParts,
        VisualImpact visualImpact,
        boolean lossyAllowed,
        List<String> declaredLosses,
        boolean finalCandidate,
        Set<DocumentProofReceipt.Gate> requiredProofGates) {

    public static final String SCHEMA_V1 = "DOC-OP-1";

    public enum Type { REPLACE_TEXT, INSERT_CONTENT, DELETE_CONTENT, REORDER, FORMAT, CONVERT, ACCESSIBILITY_REPAIR, METADATA_UPDATE }
    public enum Risk { READ_ONLY, REVERSIBLE_EDIT, LOSSY_TRANSFORM, SECURITY_SENSITIVE }
    public enum VisualImpact { NONE, TEXT_REFLOW, LAYOUT_CHANGE, PAGE_COUNT_CHANGE, SLIDE_COUNT_CHANGE, FULL_RENDER_CHANGE }

    public DocumentOperationContract {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported operation schema: " + schemaVersion);
        if (operationId == null || operationId.isBlank()) throw new IllegalArgumentException("operation id required");
        requireSha(sourceArtifactSha256, "source artifact");
        requireSha(sourceSemanticSha256, "source semantic");
        Objects.requireNonNull(type, "type");
        selectors = List.copyOf(Objects.requireNonNullElse(selectors, List.of()));
        if (selectors.isEmpty()) throw new IllegalArgumentException("at least one selector required");
        intendedEffect = Objects.requireNonNullElse(intendedEffect, "").trim();
        if (intendedEffect.isEmpty()) throw new IllegalArgumentException("intended effect required");
        parameters = Map.copyOf(Objects.requireNonNullElse(parameters, Map.of()));
        Objects.requireNonNull(risk, "risk");
        if (rollbackArtifactSha256 != null) requireSha(rollbackArtifactSha256, "rollback artifact");
        expectedChangedNativeParts = Set.copyOf(Objects.requireNonNullElse(expectedChangedNativeParts, Set.of()));
        validatePartPatterns(expectedChangedNativeParts);
        Objects.requireNonNull(visualImpact, "visualImpact");
        declaredLosses = List.copyOf(Objects.requireNonNullElse(declaredLosses, List.of()));
        requiredProofGates = normalizedProofGates(requiredProofGates, visualImpact, finalCandidate, risk);

        if (risk != Risk.READ_ONLY && rollbackArtifactSha256 == null) {
            throw new IllegalArgumentException("effectful operation requires rollback artifact digest");
        }
        if (risk == Risk.READ_ONLY && rollbackArtifactSha256 != null) {
            throw new IllegalArgumentException("read-only operation must not carry rollback artifact");
        }
        if (risk == Risk.LOSSY_TRANSFORM && (!lossyAllowed || declaredLosses.isEmpty())) {
            throw new IllegalArgumentException("lossy transform requires explicit allowance and declared losses");
        }
        if (!lossyAllowed && !declaredLosses.isEmpty()) {
            throw new IllegalArgumentException("declared losses require lossyAllowed=true");
        }
        if (risk != Risk.READ_ONLY && expectedChangedNativeParts.isEmpty()) {
            throw new IllegalArgumentException("effectful operation must declare expected native-part changes");
        }
    }

    public String intentDigest() {
        StringBuilder b = new StringBuilder();
        b.append(schemaVersion).append('|').append(sourceArtifactSha256).append('|').append(sourceSemanticSha256)
                .append('|').append(type).append('|').append(risk).append('|').append(visualImpact)
                .append('|').append(lossyAllowed).append('|').append(finalCandidate).append('|').append(intendedEffect);
        selectors.stream().map(s -> s.kind() + ":" + s.value()).sorted().forEach(v -> b.append("|selector=").append(v));
        parameters.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> b.append('|').append(e.getKey()).append('=').append(e.getValue()));
        expectedChangedNativeParts.stream().sorted().forEach(v -> b.append("|part=").append(v));
        declaredLosses.stream().sorted().forEach(v -> b.append("|loss=").append(v));
        requiredProofGates.stream().sorted().forEach(v -> b.append("|proof=").append(v));
        return CanonicalDocumentGraph.sha256(b.toString().getBytes(StandardCharsets.UTF_8));
    }

    public static DocumentOperationContract replaceText(
            String operationId,
            CanonicalDocumentGraph source,
            List<String> targetNodeIds,
            String search,
            String replacement,
            Set<String> expectedChangedNativeParts,
            boolean finalCandidate) {
        Objects.requireNonNull(source, "source");
        ArrayList<DocumentSelector> selectors = new ArrayList<>();
        for (String id : targetNodeIds) selectors.add(DocumentSelector.node(id));
        return new DocumentOperationContract(
                SCHEMA_V1,
                operationId,
                source.sourceSha256(),
                source.semanticDigest(),
                Type.REPLACE_TEXT,
                selectors,
                "Replace selected document text while preserving unrelated native content",
                Map.of("search", Objects.requireNonNullElse(search, ""), "replacement", Objects.requireNonNullElse(replacement, "")),
                Risk.REVERSIBLE_EDIT,
                source.sourceSha256(),
                expectedChangedNativeParts,
                VisualImpact.TEXT_REFLOW,
                false,
                List.of(),
                finalCandidate,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    public static DocumentOperationContract replaceText(
            String operationId,
            CanonicalDocumentGraphV2 source,
            List<String> targetElementIds,
            String search,
            String replacement,
            Set<String> expectedChangedNativeParts,
            boolean finalCandidate) {
        Objects.requireNonNull(source, "source");
        ArrayList<DocumentSelector> selectors = new ArrayList<>();
        for (String id : targetElementIds) {
            selectors.add(DocumentSelector.node(id));
        }
        return new DocumentOperationContract(
                SCHEMA_V1,
                operationId,
                source.sourceSha256(),
                source.semanticDigest(),
                Type.REPLACE_TEXT,
                selectors,
                "Replace selected CDG-2 document text while preserving unrelated native content",
                Map.of(
                        "search", Objects.requireNonNullElse(search, ""),
                        "replacement", Objects.requireNonNullElse(replacement, "")),
                Risk.REVERSIBLE_EDIT,
                source.sourceSha256(),
                expectedChangedNativeParts,
                VisualImpact.TEXT_REFLOW,
                false,
                List.of(),
                finalCandidate,
                EnumSet.noneOf(DocumentProofReceipt.Gate.class));
    }

    private static Set<DocumentProofReceipt.Gate> normalizedProofGates(
            Set<DocumentProofReceipt.Gate> requested,
            VisualImpact visualImpact,
            boolean finalCandidate,
            Risk risk) {
        EnumSet<DocumentProofReceipt.Gate> gates = requested == null || requested.isEmpty()
                ? EnumSet.noneOf(DocumentProofReceipt.Gate.class)
                : EnumSet.copyOf(requested);
        if (risk != Risk.READ_ONLY) {
            gates.add(DocumentProofReceipt.Gate.PACKAGE);
            gates.add(DocumentProofReceipt.Gate.SEMANTIC);
            gates.add(DocumentProofReceipt.Gate.SECURITY);
            gates.add(DocumentProofReceipt.Gate.PROVENANCE);
        }
        if (visualImpact != VisualImpact.NONE) gates.add(DocumentProofReceipt.Gate.RENDERED);
        if (finalCandidate) gates.addAll(EnumSet.allOf(DocumentProofReceipt.Gate.class));
        return Set.copyOf(gates);
    }

    private static void validatePartPatterns(Set<String> patterns) {
        for (String pattern : patterns) {
            if (pattern == null || pattern.isBlank()) throw new IllegalArgumentException("native-part change pattern required");
            if (pattern.equals("*")) throw new IllegalArgumentException("blanket native-part wildcard is forbidden");
            if (pattern.startsWith("/") || pattern.contains("..") || pattern.contains("\\")) throw new IllegalArgumentException("unsafe native-part pattern: " + pattern);
            int star = pattern.indexOf('*');
            if (star >= 0 && star != pattern.length() - 1) throw new IllegalArgumentException("only trailing wildcard is supported: " + pattern);
        }
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
