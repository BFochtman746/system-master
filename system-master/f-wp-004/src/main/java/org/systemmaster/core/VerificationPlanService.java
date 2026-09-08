package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/** Predeclared, version-bound success criteria for F-WP-004. */
public final class VerificationPlanService {
    public record Criterion(String criterionId, String description, String evidenceClass, String successPredicateRef) {
        public Criterion {
            requireText(criterionId, "criterionId");
            requireText(description, "description");
            requireText(evidenceClass, "evidenceClass");
            requireText(successPredicateRef, "successPredicateRef");
        }
    }

    public record VerificationPlan(
            String planId,
            long version,
            String changeId,
            long revision,
            String changeContentDigest,
            String targetDigest,
            List<Criterion> criteria,
            Instant declaredAt,
            String digest) {
        public VerificationPlan {
            requireText(planId, "planId");
            if (version < 1) throw new IllegalArgumentException("INVALID_VERIFICATION_PLAN_VERSION");
            requireText(changeId, "changeId");
            if (revision < 1) throw new IllegalArgumentException("INVALID_CHANGE_REVISION");
            requireText(changeContentDigest, "changeContentDigest");
            requireText(targetDigest, "targetDigest");
            criteria = List.copyOf(Objects.requireNonNull(criteria, "criteria"));
            if (criteria.isEmpty()) throw new IllegalArgumentException("SUCCESS_CRITERIA_REQUIRED");
            declaredAt = Objects.requireNonNull(declaredAt, "declaredAt");
            java.util.HashSet<String> ids = new java.util.HashSet<>();
            for (Criterion criterion : criteria) {
                if (!ids.add(criterion.criterionId())) throw new IllegalArgumentException("DUPLICATE_CRITERION_ID:" + criterion.criterionId());
            }
            String computed = digestPlan(planId, version, changeId, revision, changeContentDigest,
                    targetDigest, criteria, declaredAt);
            if (digest == null || digest.isBlank()) digest = computed;
            if (!digest.equals(computed)) throw new IllegalArgumentException("VERIFICATION_PLAN_DIGEST_MISMATCH");
        }
    }

    public VerificationPlan bind(String planId, long version, ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision, List<Criterion> criteria, Instant declaredAt) {
        requireSameSubject(record, revision);
        return new VerificationPlan(planId, version, record.changeId(), revision.revision(), revision.contentDigest(),
                revision.targetDigest(), criteria, declaredAt, null);
    }

    public boolean isCurrentFor(VerificationPlan plan, ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision) {
        return plan.changeId().equals(record.changeId()) && plan.changeId().equals(revision.changeId())
                && plan.revision() == record.currentRevision() && plan.revision() == revision.revision()
                && plan.changeContentDigest().equals(record.currentRevisionDigest())
                && plan.changeContentDigest().equals(revision.contentDigest())
                && plan.targetDigest().equals(record.targetDigest()) && plan.targetDigest().equals(revision.targetDigest());
    }

    private static void requireSameSubject(ChangeRegistry.ChangeRecord record, ChangeRegistry.ChangeRevision revision) {
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(revision, "revision");
        if (!record.changeId().equals(revision.changeId())) throw new IllegalArgumentException("CHANGE_ID_MISMATCH");
        if (record.currentRevision() != revision.revision()) throw new IllegalArgumentException("STALE_REVISION_BINDING");
        if (!record.currentRevisionDigest().equals(revision.contentDigest())) throw new IllegalArgumentException("CONTENT_DIGEST_BINDING_MISMATCH");
        if (!record.targetDigest().equals(revision.targetDigest())) throw new IllegalArgumentException("TARGET_DIGEST_BINDING_MISMATCH");
    }

    private static String digestPlan(String id, long version, String changeId, long revision, String content,
            String targetDigest, List<Criterion> criteria, Instant at) {
        ArrayList<String> parts = new ArrayList<>();
        for (Criterion c : criteria) parts.add(c.criterionId() + ":" + c.description() + ":" + c.evidenceClass() + ":" + c.successPredicateRef());
        return sha256("FWP004-VERIFY-V1|id=" + id + "|version=" + version + "|change=" + changeId
                + "|revision=" + revision + "|content=" + content + "|target=" + targetDigest
                + "|criteria=" + String.join("|", parts) + "|at=" + at);
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
