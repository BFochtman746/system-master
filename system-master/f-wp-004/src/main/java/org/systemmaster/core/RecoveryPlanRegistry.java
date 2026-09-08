package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** F-WP-004 immutable recovery planning, exact rollback targets, and point-of-no-return semantics. */
public final class RecoveryPlanRegistry {
    public enum Strategy { ROLLBACK, ROLL_FORWARD, COMPENSATING_RECOVERY, NO_AUTOMATIC_RETURN, NOT_APPLICABLE }
    public enum TargetStanding { CURRENT_ELIGIBLE, INELIGIBLE, UNKNOWN }
    public enum RollbackStanding { ALLOWED, TARGET_BLOCKED, POINT_OF_NO_RETURN_CROSSED, STRATEGY_NOT_ROLLBACK }

    public record RollbackTarget(
            String targetType,
            String immutableIdentity,
            String compatibilityIdentity,
            TargetStanding standing) {
        public RollbackTarget {
            requireText(targetType, "targetType");
            requireText(immutableIdentity, "immutableIdentity");
            requireText(compatibilityIdentity, "compatibilityIdentity");
            standing = Objects.requireNonNull(standing, "standing");
        }
    }

    public record IrreversibleStepMarker(String stepId, boolean pointOfNoReturn, String rationale) {
        public IrreversibleStepMarker {
            requireText(stepId, "stepId");
            requireText(rationale, "rationale");
        }
    }

    public record RecoveryPlan(
            String planId,
            long version,
            String changeId,
            long revision,
            String changeContentDigest,
            String targetDigest,
            Strategy strategy,
            String rationale,
            RollbackTarget rollbackTarget,
            List<IrreversibleStepMarker> irreversibleSteps,
            List<String> verificationCriteriaRefs,
            Instant createdAt,
            String digest) {
        public RecoveryPlan {
            requireText(planId, "planId");
            if (version < 1) throw new IllegalArgumentException("INVALID_RECOVERY_PLAN_VERSION");
            requireText(changeId, "changeId");
            if (revision < 1) throw new IllegalArgumentException("INVALID_CHANGE_REVISION");
            requireText(changeContentDigest, "changeContentDigest");
            requireText(targetDigest, "targetDigest");
            strategy = Objects.requireNonNull(strategy, "strategy");
            rationale = rationale == null ? "" : rationale;
            irreversibleSteps = List.copyOf(irreversibleSteps == null ? List.of() : irreversibleSteps);
            verificationCriteriaRefs = List.copyOf(verificationCriteriaRefs == null ? List.of() : verificationCriteriaRefs);
            createdAt = Objects.requireNonNull(createdAt, "createdAt");
            if ((strategy == Strategy.NO_AUTOMATIC_RETURN || strategy == Strategy.NOT_APPLICABLE) && rationale.isBlank()) {
                throw new IllegalArgumentException("RECOVERY_RATIONALE_REQUIRED");
            }
            if (strategy == Strategy.ROLLBACK && rollbackTarget == null) {
                throw new IllegalArgumentException("ROLLBACK_TARGET_REQUIRED");
            }
            String computed = digestPlan(planId, version, changeId, revision, changeContentDigest, targetDigest,
                    strategy, rationale, rollbackTarget, irreversibleSteps, verificationCriteriaRefs, createdAt);
            if (digest == null || digest.isBlank()) digest = computed;
            if (!digest.equals(computed)) throw new IllegalArgumentException("RECOVERY_PLAN_DIGEST_MISMATCH");
        }
    }

    public RecoveryPlan bind(
            String planId,
            long version,
            ChangeRegistry.ChangeRecord record,
            ChangeRegistry.ChangeRevision revision,
            Strategy strategy,
            String rationale,
            RollbackTarget rollbackTarget,
            List<IrreversibleStepMarker> irreversibleSteps,
            List<String> verificationCriteriaRefs,
            Instant createdAt) {
        requireSameSubject(record, revision);
        return new RecoveryPlan(planId, version, record.changeId(), revision.revision(), revision.contentDigest(),
                revision.targetDigest(), strategy, rationale, rollbackTarget, irreversibleSteps,
                verificationCriteriaRefs, createdAt, null);
    }

    public RollbackStanding rollbackStanding(RecoveryPlan plan, Set<String> completedStepIds) {
        Objects.requireNonNull(plan, "plan");
        Objects.requireNonNull(completedStepIds, "completedStepIds");
        if (plan.strategy() != Strategy.ROLLBACK) return RollbackStanding.STRATEGY_NOT_ROLLBACK;
        if (plan.rollbackTarget() == null || plan.rollbackTarget().standing() != TargetStanding.CURRENT_ELIGIBLE) {
            return RollbackStanding.TARGET_BLOCKED;
        }
        for (IrreversibleStepMarker marker : plan.irreversibleSteps()) {
            if (marker.pointOfNoReturn() && completedStepIds.contains(marker.stepId())) {
                return RollbackStanding.POINT_OF_NO_RETURN_CROSSED;
            }
        }
        return RollbackStanding.ALLOWED;
    }

    public boolean hasExplicitPointOfNoReturn(RecoveryPlan plan) {
        return plan.irreversibleSteps().stream().anyMatch(IrreversibleStepMarker::pointOfNoReturn);
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
            String targetDigest, Strategy strategy, String rationale, RollbackTarget target,
            List<IrreversibleStepMarker> steps, List<String> criteria, Instant at) {
        ArrayList<String> stepParts = new ArrayList<>();
        for (IrreversibleStepMarker s : steps) stepParts.add(s.stepId() + ":" + s.pointOfNoReturn() + ":" + s.rationale());
        String targetPart = target == null ? "NONE" : target.targetType() + ":" + target.immutableIdentity()
                + ":" + target.compatibilityIdentity() + ":" + target.standing();
        return sha256("FWP004-RECOVERY-V1|id=" + id + "|version=" + version + "|change=" + changeId
                + "|revision=" + revision + "|content=" + content + "|targetDigest=" + targetDigest
                + "|strategy=" + strategy + "|rationale=" + rationale + "|rollbackTarget=" + targetPart
                + "|steps=" + String.join(",", stepParts) + "|criteria=" + String.join(",", new TreeSet<>(criteria))
                + "|at=" + at);
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
