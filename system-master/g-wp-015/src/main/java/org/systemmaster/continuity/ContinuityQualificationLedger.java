package org.systemmaster.continuity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Qualification governance for 021G. Evidence classes are explicit and never interchangeable. */
public final class ContinuityQualificationLedger {
    public enum EvidenceClass {
        PORTABLE_NON_TARGET,
        TARGET_WINDOWS_REBOOT,
        TARGET_IOS_CLIENT_SUSPEND_RESUME,
        EMPIRICAL_HUMAN_EVIDENCE,
        TRACEABILITY_META
    }
    public enum Standing { NOT_STARTED, PASS, FAIL, INVALID }

    public record RequirementMapping(String requirementId, String workPackage, String testFamily, boolean hardInvariant) {
        public RequirementMapping {
            requirementId = req(requirementId, "requirementId");
            workPackage = req(workPackage, "workPackage");
            testFamily = req(testFamily, "testFamily");
        }
    }

    public record Evidence(String evidenceId, String requirementId, EvidenceClass evidenceClass, Standing standing,
                           String sourceRef, String subjectDigest, Instant observedAt) {
        public Evidence {
            evidenceId = req(evidenceId, "evidenceId");
            requirementId = req(requirementId, "requirementId");
            evidenceClass = Objects.requireNonNull(evidenceClass, "evidenceClass");
            standing = Objects.requireNonNull(standing, "standing");
            observedAt = Objects.requireNonNull(observedAt, "observedAt");
            if (standing != Standing.NOT_STARTED) {
                sourceRef = req(sourceRef, "sourceRef");
                subjectDigest = req(subjectDigest, "subjectDigest");
            }
        }
    }

    public record RequirementView(String requirementId, boolean mapped, boolean hardInvariant,
                                  Map<EvidenceClass, Standing> standings, boolean implementationSatisfied) {
        public RequirementView { standings = Map.copyOf(standings); }
    }

    private final Map<String, RequirementMapping> mappings = new LinkedHashMap<>();
    private final Map<String, List<Evidence>> evidence = new LinkedHashMap<>();

    public RequirementMapping registerMapping(RequirementMapping mapping) {
        Objects.requireNonNull(mapping);
        if (mappings.putIfAbsent(mapping.requirementId(), mapping) != null) {
            throw new IllegalStateException("duplicate requirement mapping: " + mapping.requirementId());
        }
        return mapping;
    }

    public Evidence recordEvidence(Evidence item) {
        Objects.requireNonNull(item);
        RequirementMapping mapping = mappings.get(item.requirementId());
        if (mapping == null) throw new IllegalStateException("evidence without requirement mapping");
        if (!evidenceClassAllowed(mapping.testFamily(), item.evidenceClass())) {
            throw new IllegalStateException("mislabelled evidence class for " + item.requirementId());
        }
        evidence.computeIfAbsent(item.requirementId(), ignored -> new ArrayList<>()).add(item);
        return item;
    }

    public boolean mappingComplete(Set<String> expectedRequirementIds) {
        Objects.requireNonNull(expectedRequirementIds);
        return expectedRequirementIds.stream().allMatch(id -> {
            RequirementMapping mapping = mappings.get(id);
            return mapping != null && !mapping.testFamily().isBlank();
        });
    }

    public RequirementView view(String requirementId) {
        RequirementMapping mapping = mappings.get(req(requirementId, "requirementId"));
        if (mapping == null) return new RequirementView(requirementId, false, true, Map.of(), false);
        EnumMap<EvidenceClass, Standing> standings = new EnumMap<>(EvidenceClass.class);
        for (EvidenceClass c : EvidenceClass.values()) standings.put(c, Standing.NOT_STARTED);
        for (Evidence item : evidence.getOrDefault(requirementId, List.of())) standings.put(item.evidenceClass(), item.standing());
        boolean satisfied = !mapping.hardInvariant() || requiredEvidenceClasses(mapping.testFamily()).stream().allMatch(c -> standings.get(c) == Standing.PASS);
        return new RequirementView(requirementId, true, mapping.hardInvariant(), standings, satisfied);
    }

    public boolean implementationQualified(Collection<String> requirementIds) {
        Objects.requireNonNull(requirementIds);
        for (String id : requirementIds) {
            RequirementMapping mapping = mappings.get(id);
            if (mapping == null) return false;
            if (mapping.hardInvariant() && !view(id).implementationSatisfied()) return false;
        }
        return true;
    }

    public static Set<EvidenceClass> requiredEvidenceClasses(String testFamily) {
        String family = req(testFamily, "testFamily");
        java.util.LinkedHashSet<EvidenceClass> required = new java.util.LinkedHashSet<>();
        if (family.contains("TARGET_WINDOWS_REBOOT")) required.add(EvidenceClass.TARGET_WINDOWS_REBOOT);
        if (family.contains("IOS_CLIENT_SUSPEND_RESUME")) required.add(EvidenceClass.TARGET_IOS_CLIENT_SUSPEND_RESUME);
        if (family.contains("HUMAN_HANDOFF")) required.add(EvidenceClass.EMPIRICAL_HUMAN_EVIDENCE);
        if (family.contains("TRACEABILITY_META")) required.add(EvidenceClass.TRACEABILITY_META);
        if (required.isEmpty()) required.add(EvidenceClass.PORTABLE_NON_TARGET);
        return Set.copyOf(required);
    }

    public static boolean evidenceClassAllowed(String testFamily, EvidenceClass evidenceClass) {
        String family = req(testFamily, "testFamily");
        Objects.requireNonNull(evidenceClass);
        if (evidenceClass == EvidenceClass.TARGET_WINDOWS_REBOOT) return family.contains("TARGET_WINDOWS_REBOOT");
        if (evidenceClass == EvidenceClass.TARGET_IOS_CLIENT_SUSPEND_RESUME) return family.contains("IOS_CLIENT_SUSPEND_RESUME");
        if (evidenceClass == EvidenceClass.EMPIRICAL_HUMAN_EVIDENCE) return family.contains("HUMAN_HANDOFF");
        if (evidenceClass == EvidenceClass.TRACEABILITY_META) return family.contains("TRACEABILITY_META");
        return !family.contains("TARGET_WINDOWS_REBOOT") && !family.contains("IOS_CLIENT_SUSPEND_RESUME") && !family.contains("HUMAN_HANDOFF");
    }

    private static String req(String value, String field) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " required");
        return value;
    }
}
