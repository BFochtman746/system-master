package org.systemmaster.continuity;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

/** Frozen G-WP-001 continuity policy contract. */
public final class ContinuityPolicyRegistry {
    public static final String CONTRACT_VERSION = "021G-continuity-policy/v1";

    public enum Freshness { CURRENT, HISTORICAL, UNAVAILABLE }

    public record PolicyBody(
            String workClass,
            String recoverabilityClassDefaults,
            String checkpointPolicy,
            long maxProgressLoss,
            int retryBudget,
            String handoffRequirements,
            String historyRolloverPolicy) {
        public PolicyBody {
            req(workClass, "workClass"); req(recoverabilityClassDefaults, "recoverabilityClassDefaults");
            req(checkpointPolicy, "checkpointPolicy"); req(handoffRequirements, "handoffRequirements");
            req(historyRolloverPolicy, "historyRolloverPolicy");
            if (maxProgressLoss < 0) throw new IllegalArgumentException("maxProgressLoss");
            if (retryBudget < 0) throw new IllegalArgumentException("retryBudget");
        }
        public String canonical() {
            return workClass + "|" + recoverabilityClassDefaults + "|" + checkpointPolicy + "|" + maxProgressLoss + "|" + retryBudget + "|" + handoffRequirements + "|" + historyRolloverPolicy;
        }
    }

    public record ContinuityPolicy(
            String policyId,
            long version,
            PolicyBody body,
            Instant effectiveAt,
            String digest,
            String contractVersion) {
        public ContinuityPolicy {
            req(policyId, "policyId"); if (version < 1) throw new IllegalArgumentException("version");
            Objects.requireNonNull(body, "body"); Objects.requireNonNull(effectiveAt, "effectiveAt");
            sha(digest, "digest"); if (!CONTRACT_VERSION.equals(contractVersion)) throw new IllegalArgumentException("contractVersion");
        }
    }

    public record RegistrationResult(ContinuityPolicy policy, boolean idempotentReplay) {}
    public record PolicyQuery(ContinuityPolicy policy, long version, String digest, Freshness freshness, String contractVersion) {
        public PolicyQuery {
            Objects.requireNonNull(freshness, "freshness");
            if (policy == null) {
                if (version != 0 || digest != null || freshness != Freshness.UNAVAILABLE) throw new IllegalArgumentException("unavailable_shape");
            } else {
                if (version != policy.version() || !Objects.equals(digest, policy.digest())) throw new IllegalArgumentException("query_binding");
            }
            if (!CONTRACT_VERSION.equals(contractVersion)) throw new IllegalArgumentException("contractVersion");
        }
    }

    private final Map<String, NavigableMap<Long, ContinuityPolicy>> byId = new HashMap<>();
    private final Map<String, NavigableMap<Instant, ContinuityPolicy>> byWorkClass = new HashMap<>();
    private final Map<String, String> requestDigest = new HashMap<>();
    private final Map<String, ContinuityPolicy> requestResult = new HashMap<>();

    /** RegisterContinuityPolicy. expectedVersion=0 means create. */
    public synchronized RegistrationResult registerContinuityPolicy(
            String policyId, long expectedVersion, PolicyBody body, Instant effectiveAt, String requestId) {
        req(policyId, "policyId"); if (expectedVersion < 0) throw new IllegalArgumentException("expectedVersion");
        Objects.requireNonNull(body, "body"); Objects.requireNonNull(effectiveAt, "effectiveAt"); req(requestId, "requestId");
        String contentDigest = digest(policyId + "|" + body.canonical() + "|" + effectiveAt + "|" + CONTRACT_VERSION);
        String oldDigest = requestDigest.get(requestId);
        if (oldDigest != null) {
            if (!oldDigest.equals(contentDigest)) throw new IllegalStateException("idempotency_key_content_conflict");
            return new RegistrationResult(requestResult.get(requestId), true);
        }
        NavigableMap<Long, ContinuityPolicy> versions = byId.computeIfAbsent(policyId, k -> new TreeMap<>());
        long current = versions.isEmpty() ? 0 : versions.lastKey();
        if (current != expectedVersion) throw new IllegalStateException("stale_expected_version");
        long next = current + 1;
        ContinuityPolicy policy = new ContinuityPolicy(policyId, next, body, effectiveAt, contentDigest, CONTRACT_VERSION);
        NavigableMap<Instant, ContinuityPolicy> timeline = byWorkClass.computeIfAbsent(body.workClass(), k -> new TreeMap<>());
        ContinuityPolicy sameTime = timeline.get(effectiveAt);
        if (sameTime != null && !sameTime.digest().equals(contentDigest)) throw new IllegalStateException("effective_time_conflict");
        versions.put(next, policy); timeline.put(effectiveAt, policy);
        requestDigest.put(requestId, contentDigest); requestResult.put(requestId, policy);
        return new RegistrationResult(policy, false);
    }

    /** GetContinuityPolicy. asOf null means current. */
    public synchronized PolicyQuery getContinuityPolicy(String workClass, Instant asOf) {
        req(workClass, "workClass");
        NavigableMap<Instant, ContinuityPolicy> timeline = byWorkClass.get(workClass);
        if (timeline == null || timeline.isEmpty()) return new PolicyQuery(null, 0, null, Freshness.UNAVAILABLE, CONTRACT_VERSION);
        ContinuityPolicy policy;
        Freshness freshness;
        if (asOf == null) { policy = timeline.lastEntry().getValue(); freshness = Freshness.CURRENT; }
        else {
            Map.Entry<Instant, ContinuityPolicy> e = timeline.floorEntry(asOf);
            if (e == null) return new PolicyQuery(null, 0, null, Freshness.UNAVAILABLE, CONTRACT_VERSION);
            policy = e.getValue(); freshness = e.equals(timeline.lastEntry()) ? Freshness.CURRENT : Freshness.HISTORICAL;
        }
        return new PolicyQuery(policy, policy.version(), policy.digest(), freshness, CONTRACT_VERSION);
    }

    public synchronized ContinuityPolicy getPolicyVersion(String policyId, long version) {
        NavigableMap<Long, ContinuityPolicy> versions = byId.get(policyId);
        return versions == null ? null : versions.get(version);
    }

    private static void req(String v, String n) { if (v == null || v.isBlank()) throw new IllegalArgumentException(n); }
    private static void sha(String v, String n) { req(v,n); if (!v.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(n + "_sha256"); }
    static String digest(String v) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(v.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
