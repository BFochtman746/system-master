package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

public final class CoordinationContracts {
    private CoordinationContracts() {}

    public enum ExecutionState { READY, RUNNING, PAUSED, HALTED, CANCELLED, PENDING_RECONCILIATION, COMPLETED }
    public enum EffectStanding { INTENT_RECORDED, APPLIED, NOT_APPLIED, UNKNOWN, DIVERGED, COMPENSATED }
    public enum ReplayDisposition { FIRST_APPLY, REPLAY_SAME_RESULT, CONFLICT_REJECTED }
    public enum ConflictDisposition { NO_CONFLICT, SERIALIZE, REJECT, COMPATIBLE_COMPOSITE }
    public enum TimeStanding { TRUSTED, UNTRUSTED }

    public record TimeEvidence(Instant wallTime, long monotonicNanos, Duration maxSkew, TimeStanding standing) {
        public TimeEvidence {
            wallTime = Objects.requireNonNull(wallTime, "wallTime");
            maxSkew = Objects.requireNonNull(maxSkew, "maxSkew");
            standing = Objects.requireNonNull(standing, "standing");
            if (monotonicNanos < 0 || maxSkew.isNegative()) throw new IllegalArgumentException("INVALID_TIME_EVIDENCE");
        }
    }

    public record GrantRef(String grantDigest, String changeId, long revision, String principalRef,
            String action, Set<String> targetRefs, long authorizationRevocationEpoch, Instant expiresAt) {
        public GrantRef {
            requireText(grantDigest, "grantDigest"); requireText(changeId, "changeId");
            if (revision < 1) throw new IllegalArgumentException("INVALID_REVISION");
            requireText(principalRef, "principalRef"); requireText(action, "action");
            targetRefs = Set.copyOf(Objects.requireNonNull(targetRefs, "targetRefs"));
            if (targetRefs.isEmpty()) throw new IllegalArgumentException("TARGETS_REQUIRED");
            if (authorizationRevocationEpoch < 0) throw new IllegalArgumentException("INVALID_REVOCATION_EPOCH");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
        }
    }

    public record ExecutionLease(String changeId, long epoch, String ownerRef, String fenceToken,
            Instant acquiredAt, Instant expiresAt) {
        public ExecutionLease {
            requireText(changeId, "changeId"); if (epoch < 1) throw new IllegalArgumentException("INVALID_EPOCH");
            requireText(ownerRef, "ownerRef"); requireText(fenceToken, "fenceToken");
            acquiredAt = Objects.requireNonNull(acquiredAt, "acquiredAt");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!acquiredAt.isBefore(expiresAt)) throw new IllegalArgumentException("INVALID_LEASE_WINDOW");
        }
    }

    public record CommandRequest(String changeId, long revision, String commandName, String idempotencyKey,
            String payloadDigest, GrantRef grant, long executionEpoch, String fenceToken,
            Set<String> targetRefs, ConflictDisposition overlapPolicy) {
        public CommandRequest {
            requireText(changeId, "changeId"); if (revision < 1) throw new IllegalArgumentException("INVALID_REVISION");
            requireText(commandName, "commandName"); requireText(idempotencyKey, "idempotencyKey");
            requireText(payloadDigest, "payloadDigest"); grant = Objects.requireNonNull(grant, "grant");
            if (executionEpoch < 1) throw new IllegalArgumentException("INVALID_EPOCH"); requireText(fenceToken, "fenceToken");
            targetRefs = Set.copyOf(Objects.requireNonNull(targetRefs, "targetRefs"));
            overlapPolicy = Objects.requireNonNull(overlapPolicy, "overlapPolicy");
        }
    }

    public record CommandReceipt(String changeId, String idempotencyKey, String payloadDigest,
            ReplayDisposition disposition, String resultDigest, ExecutionState state, long epoch, Instant recordedAt) {
        public CommandReceipt {
            requireText(changeId, "changeId"); requireText(idempotencyKey, "idempotencyKey");
            requireText(payloadDigest, "payloadDigest"); disposition = Objects.requireNonNull(disposition, "disposition");
            requireText(resultDigest, "resultDigest"); state = Objects.requireNonNull(state, "state");
            if (epoch < 1) throw new IllegalArgumentException("INVALID_EPOCH"); recordedAt = Objects.requireNonNull(recordedAt, "recordedAt");
        }
    }

    public record ExternalEffectIntent(String intentId, String changeId, long revision, long epoch,
            String stepId, String targetRef, String payloadDigest, String idempotencyKey, String intentDigest) {
        public ExternalEffectIntent {
            requireText(intentId, "intentId"); requireText(changeId, "changeId");
            if (revision < 1 || epoch < 1) throw new IllegalArgumentException("INVALID_EFFECT_IDENTITY");
            requireText(stepId, "stepId"); requireText(targetRef, "targetRef"); requireText(payloadDigest, "payloadDigest");
            requireText(idempotencyKey, "idempotencyKey");
            String computed = sha256("FWP007-INTENT-V1|"+intentId+"|"+changeId+"|"+revision+"|"+epoch+"|"+stepId+"|"+targetRef+"|"+payloadDigest+"|"+idempotencyKey);
            if (intentDigest == null || intentDigest.isBlank()) intentDigest = computed;
            if (!intentDigest.equals(computed)) throw new IllegalArgumentException("INTENT_DIGEST_MISMATCH");
        }
    }

    public record ExternalEffectObservation(String intentId, EffectStanding standing, String receiptDigest, Instant observedAt) {
        public ExternalEffectObservation {
            requireText(intentId, "intentId"); standing = Objects.requireNonNull(standing, "standing");
            if (standing == EffectStanding.INTENT_RECORDED) throw new IllegalArgumentException("OBSERVATION_REQUIRES_EFFECT_STANDING");
            if ((standing == EffectStanding.APPLIED || standing == EffectStanding.COMPENSATED) && (receiptDigest == null || receiptDigest.isBlank()))
                throw new IllegalArgumentException("RECEIPT_REQUIRED");
            observedAt = Objects.requireNonNull(observedAt, "observedAt");
        }
    }

    public record ReconciliationDecision(String intentId, EffectStanding resolvedStanding, boolean retrySafe,
            String evidenceDigest, String decisionDigest) {
        public ReconciliationDecision {
            requireText(intentId, "intentId"); resolvedStanding = Objects.requireNonNull(resolvedStanding, "resolvedStanding");
            if (resolvedStanding == EffectStanding.UNKNOWN || resolvedStanding == EffectStanding.DIVERGED || resolvedStanding == EffectStanding.INTENT_RECORDED)
                throw new IllegalArgumentException("UNRESOLVED_RECONCILIATION");
            requireText(evidenceDigest, "evidenceDigest");
            String computed = sha256("FWP007-RECON-V1|"+intentId+"|"+resolvedStanding+"|"+retrySafe+"|"+evidenceDigest);
            if (decisionDigest == null || decisionDigest.isBlank()) decisionDigest = computed;
            if (!decisionDigest.equals(computed)) throw new IllegalArgumentException("RECONCILIATION_DIGEST_MISMATCH");
        }
    }

    public static String commandIdentity(CommandRequest r) {
        return sha256("FWP007-CMD-V1|"+r.changeId()+"|"+r.revision()+"|"+r.commandName()+"|"+r.payloadDigest()+"|"+String.join(",",new TreeSet<>(r.targetRefs())));
    }

    public static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:"+name);
        return value;
    }
}
