package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

public final class ExecutionLeaseManager {
    private final Map<String, ExecutionLease> current = new HashMap<>();
    private final Map<String, Long> highestEpoch = new HashMap<>();

    public ExecutionLease acquire(String changeId, String ownerRef, Duration ttl, Instant now, TimeEvidence time) {
        requireTrustedTime(now, time);
        if (ttl == null || ttl.isZero() || ttl.isNegative()) throw new IllegalArgumentException("INVALID_LEASE_TTL");
        long epoch = highestEpoch.getOrDefault(changeId, 0L) + 1;
        ExecutionLease lease = new ExecutionLease(changeId, epoch, ownerRef, UUID.randomUUID().toString(), now, now.plus(ttl));
        restore(lease);
        return lease;
    }

    public ExecutionLease renew(ExecutionLease lease, Duration ttl, Instant now, TimeEvidence time) {
        requireTrustedTime(now, time);
        requireCurrent(lease, now);
        if (ttl == null || ttl.isZero() || ttl.isNegative()) throw new IllegalArgumentException("INVALID_LEASE_TTL");
        ExecutionLease renewed = new ExecutionLease(lease.changeId(), lease.epoch(), lease.ownerRef(), lease.fenceToken(), lease.acquiredAt(), now.plus(ttl));
        restore(renewed); return renewed;
    }

    public void requireMutationAuthority(String changeId, long epoch, String fenceToken, Instant now) {
        ExecutionLease lease = current.get(changeId);
        if (lease == null) throw new SecurityException("LEASE_MISSING");
        if (lease.epoch() != epoch || !lease.fenceToken().equals(fenceToken)) throw new SecurityException("FENCED_STALE_EXECUTOR");
        if (!now.isBefore(lease.expiresAt())) throw new SecurityException("LEASE_EXPIRED");
    }

    public ExecutionLease current(String changeId) { return current.get(changeId); }
    public long highestEpoch(String changeId) { return highestEpoch.getOrDefault(changeId, 0L); }

    public void restore(ExecutionLease lease) {
        highestEpoch.merge(lease.changeId(), lease.epoch(), Math::max);
        ExecutionLease existing = current.get(lease.changeId());
        if (existing == null || lease.epoch() > existing.epoch() || (lease.epoch() == existing.epoch() && lease.expiresAt().isAfter(existing.expiresAt()))) current.put(lease.changeId(), lease);
    }

    private void requireCurrent(ExecutionLease lease, Instant now) {
        requireMutationAuthority(lease.changeId(), lease.epoch(), lease.fenceToken(), now);
    }

    public static void requireTrustedTime(Instant now, TimeEvidence time) {
        Objects.requireNonNull(now,"now"); Objects.requireNonNull(time,"time");
        if (time.standing() != TimeStanding.TRUSTED) throw new SecurityException("UNTRUSTED_TIME");
        Duration skew = Duration.between(time.wallTime(), now).abs();
        if (skew.compareTo(time.maxSkew()) > 0) throw new SecurityException("TIME_SKEW_EXCEEDED");
    }
}
