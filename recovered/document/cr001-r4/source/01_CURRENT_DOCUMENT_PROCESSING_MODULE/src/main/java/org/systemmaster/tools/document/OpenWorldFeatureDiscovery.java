package org.systemmaster.tools.document;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Converts CDG-2 unknown native features into provisional capability and certification records. */
public final class OpenWorldFeatureDiscovery {
    public record ProvisionalCapability(
            String provisionalId,
            DocumentFormat format,
            String nativePart,
            String featureKind,
            String nativeSha256,
            String requiredDisposition,
            List<String> proofRequirements) {
        public ProvisionalCapability {
            proofRequirements = List.copyOf(proofRequirements);
        }
    }

    public record LossGateResult(boolean allowed, List<String> blockingFeatureIds, List<String> diagnostics) {
        public LossGateResult {
            blockingFeatureIds = List.copyOf(blockingFeatureIds);
            diagnostics = List.copyOf(diagnostics);
        }
    }

    public List<ProvisionalCapability> discover(CanonicalDocumentGraphV2 graph) {
        Objects.requireNonNull(graph, "graph");
        ArrayList<ProvisionalCapability> out = new ArrayList<>();
        for (CanonicalDocumentGraphV2.UnknownNativeFeature feature : graph.unknownNativeFeatures()) {
            String provisionalId = CanonicalDocumentGraphV2.stableObjectId(
                    "prov",
                    graph.sourceFormat().name() + "|" + feature.featureKind() + "|" + feature.nativePart());
            out.add(new ProvisionalCapability(
                    provisionalId,
                    graph.sourceFormat(),
                    feature.nativePart(),
                    feature.featureKind(),
                    feature.nativeSha256(),
                    feature.disposition().name(),
                    List.of("semantic-adapter-test", "round-trip-preservation", "native-oracle-when-applicable")));
        }
        return List.copyOf(out);
    }

    public LossGateResult evaluateTargeting(CanonicalDocumentGraphV2 graph, Set<String> targetedNativeParts) {
        return evaluateTargetingPatterns(graph, targetedNativeParts);
    }

    public LossGateResult evaluateTargetingPatterns(CanonicalDocumentGraphV2 graph, Set<String> targetedNativePartPatterns) {
        Objects.requireNonNull(graph, "graph");
        Set<String> patterns = Set.copyOf(targetedNativePartPatterns);
        ArrayList<String> blocking = new ArrayList<>();
        ArrayList<String> diagnostics = new ArrayList<>();
        for (CanonicalDocumentGraphV2.UnknownNativeFeature feature : graph.unknownNativeFeatures()) {
            boolean targeted = patterns.stream().anyMatch(pattern -> patternMatches(pattern, feature.nativePart()));
            if (targeted) {
                blocking.add(feature.id());
                diagnostics.add("UNMODELED_NATIVE_FEATURE_TARGETED:" + feature.nativePart() + ":" + feature.featureKind());
            }
        }
        return new LossGateResult(blocking.isEmpty(), blocking, diagnostics);
    }

    private static boolean patternMatches(String pattern, String partName) {
        if (pattern.endsWith("*")) {
            return partName.startsWith(pattern.substring(0, pattern.length() - 1));
        }
        return pattern.equals(partName);
    }
}
