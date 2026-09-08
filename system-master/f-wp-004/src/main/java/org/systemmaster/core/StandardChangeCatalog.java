package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** F-WP-004 bounded, versioned StandardChange preauthorization models. */
public final class StandardChangeCatalog {
    public enum Standing { MATCHED_STANDARD, NORMAL_ASSESSMENT_REQUIRED, EXPIRED_OR_REVIEW_REQUIRED }

    public record StandardChangeModel(
            String modelId,
            long version,
            ChangePolicyEngine.ChangeType allowedChangeType,
            String semanticOwnerRef,
            Set<String> exactTargetIdentities,
            Set<String> prerequisiteRefs,
            Instant effectiveFrom,
            Instant expiresAt,
            Instant reviewAt,
            String digest) {
        public StandardChangeModel {
            requireText(modelId, "modelId");
            if (version < 1) throw new IllegalArgumentException("INVALID_MODEL_VERSION");
            Objects.requireNonNull(allowedChangeType, "allowedChangeType");
            requireText(semanticOwnerRef, "semanticOwnerRef");
            exactTargetIdentities = Set.copyOf(Objects.requireNonNull(exactTargetIdentities, "exactTargetIdentities"));
            prerequisiteRefs = Set.copyOf(Objects.requireNonNull(prerequisiteRefs, "prerequisiteRefs"));
            if (exactTargetIdentities.isEmpty()) throw new IllegalArgumentException("STANDARD_TARGET_SET_REQUIRED");
            effectiveFrom = Objects.requireNonNull(effectiveFrom, "effectiveFrom");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            reviewAt = Objects.requireNonNull(reviewAt, "reviewAt");
            if (!effectiveFrom.isBefore(expiresAt)) throw new IllegalArgumentException("INVALID_MODEL_LIFETIME");
            if (reviewAt.isAfter(expiresAt)) throw new IllegalArgumentException("REVIEW_AFTER_EXPIRY");
            String computed = digestModel(modelId, version, allowedChangeType, semanticOwnerRef,
                    exactTargetIdentities, prerequisiteRefs, effectiveFrom, expiresAt, reviewAt);
            if (digest == null || digest.isBlank()) digest = computed;
            if (!digest.equals(computed)) throw new IllegalArgumentException("STANDARD_MODEL_DIGEST_MISMATCH");
        }
    }

    public record MatchResult(Standing standing, String modelId, long modelVersion, String modelDigest, List<String> reasons) {
        public MatchResult { reasons = List.copyOf(reasons); }
    }

    public MatchResult evaluate(
            StandardChangeModel model,
            ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision,
            ChangePolicyEngine.ClassificationDecision classification,
            Set<String> currentPrerequisiteRefs,
            Instant now) {
        Objects.requireNonNull(model, "model");
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(revision, "revision");
        Objects.requireNonNull(classification, "classification");
        Objects.requireNonNull(currentPrerequisiteRefs, "currentPrerequisiteRefs");
        Objects.requireNonNull(now, "now");
        java.util.ArrayList<String> reasons = new java.util.ArrayList<>();

        if (!sameSubject(record, revision, classification)) reasons.add("STALE_OR_MISMATCHED_CLASSIFICATION");
        if (classification.standing() != ChangePolicyEngine.Standing.CLASSIFIED) reasons.add("CLASSIFICATION_NOT_CURRENT");
        if (classification.riskClass() != ChangePolicyEngine.RiskClass.LOW) reasons.add("STANDARD_CHANGE_REQUIRES_LOW_RISK");
        if (classification.changeType() != model.allowedChangeType()) reasons.add("CHANGE_TYPE_CONSTRAINT_MISMATCH");
        if (!revision.semanticOwnerRef().equals(model.semanticOwnerRef())) reasons.add("SEMANTIC_OWNER_CONSTRAINT_MISMATCH");
        if (!new TreeSet<>(revision.resolvedTargetIdentities()).equals(new TreeSet<>(model.exactTargetIdentities()))) {
            reasons.add("TARGET_SET_CONSTRAINT_MISMATCH");
        }
        if (!currentPrerequisiteRefs.containsAll(model.prerequisiteRefs())) reasons.add("STANDARD_PREREQUISITE_MISSING");
        boolean temporalInvalid = now.isBefore(model.effectiveFrom()) || !now.isBefore(model.expiresAt()) || !now.isBefore(model.reviewAt());
        if (temporalInvalid) reasons.add("STANDARD_MODEL_EXPIRED_OR_REVIEW_REQUIRED");

        if (reasons.isEmpty()) {
            return new MatchResult(Standing.MATCHED_STANDARD, model.modelId(), model.version(), model.digest(), reasons);
        }
        Standing standing = temporalInvalid && reasons.size() == 1
                ? Standing.EXPIRED_OR_REVIEW_REQUIRED : Standing.NORMAL_ASSESSMENT_REQUIRED;
        return new MatchResult(standing, model.modelId(), model.version(), model.digest(), reasons);
    }

    private static boolean sameSubject(ChangeRegistry.ChangeRecord r, ChangeRegistry.ChangeRevision v,
            ChangePolicyEngine.ClassificationDecision c) {
        return r.changeId().equals(v.changeId()) && r.changeId().equals(c.changeId())
                && r.currentRevision() == v.revision() && c.revision() == v.revision()
                && r.currentRevisionDigest().equals(v.contentDigest()) && c.contentDigest().equals(v.contentDigest())
                && r.targetDigest().equals(v.targetDigest()) && c.targetDigest().equals(v.targetDigest());
    }

    private static String digestModel(String id, long version, ChangePolicyEngine.ChangeType type, String owner,
            Set<String> targets, Set<String> prerequisites, Instant from, Instant expires, Instant review) {
        return sha256("FWP004-STANDARD-V1|id=" + id + "|version=" + version + "|type=" + type
                + "|owner=" + owner + "|targets=" + String.join(",", new TreeSet<>(targets))
                + "|prerequisites=" + String.join(",", new TreeSet<>(prerequisites))
                + "|from=" + from + "|expires=" + expires + "|review=" + review);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }
}
