package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

/**
 * Owner-lane single-writer admission layer over the existing F-WP-007 lease primitive.
 * This class grants execution exclusivity only; it grants no product/semantic authority.
 */
public final class OwnerLaneExecutionLeaseCoordinator {
    public enum ExecutorMode { FOREGROUND_CHAT, SECOND_SHIFT, SYSTEM_AUTOMATION }

    public record OwnerLaneClaim(
        String ownerPath,
        String canonicalBranch,
        String currentPacket,
        String baseHeadSha,
        String expectedHeadSha,
        String executorId,
        ExecutorMode executorMode,
        ExecutionLease lease
    ) {}

    private static final Set<String> ACTIVE_OWNER_LANES = Set.of(
        "SYSTEM_MASTER/CORE",
        "SYSTEM_MASTER/LEARNING",
        "SYSTEM_MASTER/BOOK",
        "SYSTEM_MASTER/DOCUMENTS"
    );

    private final ExecutionLeaseManager leaseManager;
    private final Map<String, OwnerLaneClaim> currentClaims = new HashMap<>();

    public OwnerLaneExecutionLeaseCoordinator() {
        this(new ExecutionLeaseManager());
    }

    public OwnerLaneExecutionLeaseCoordinator(ExecutionLeaseManager leaseManager) {
        this.leaseManager = Objects.requireNonNull(leaseManager, "leaseManager");
    }

    public OwnerLaneClaim claim(
        String ownerPath,
        String canonicalBranch,
        String currentPacket,
        String headSha,
        String executorId,
        ExecutorMode executorMode,
        Duration ttl,
        Instant now,
        TimeEvidence time
    ) {
        validateScope(ownerPath, canonicalBranch, currentPacket, headSha);
        requireText(executorId, "EXECUTOR_ID_REQUIRED");
        Objects.requireNonNull(executorMode, "executorMode");
        Objects.requireNonNull(now, "now");

        OwnerLaneClaim existing = currentClaims.get(ownerPath);
        if (existing != null && now.isBefore(existing.lease().expiresAt())) {
            throw new SecurityException("OWNER_LANE_LEASE_HELD");
        }

        String changeId = changeId(ownerPath);
        ExecutionLease lease = leaseManager.acquire(changeId, executorRef(executorId, executorMode), ttl, now, time);
        OwnerLaneClaim claim = new OwnerLaneClaim(
            ownerPath, canonicalBranch, currentPacket, headSha, headSha,
            executorId, executorMode, lease
        );
        currentClaims.put(ownerPath, claim);
        return claim;
    }

    public OwnerLaneClaim renew(
        OwnerLaneClaim claim,
        Duration ttl,
        Instant now,
        TimeEvidence time
    ) {
        OwnerLaneClaim current = requireExactCurrentHolder(claim);
        ExecutionLease renewed = leaseManager.renew(current.lease(), ttl, now, time);
        OwnerLaneClaim updated = new OwnerLaneClaim(
            current.ownerPath(), current.canonicalBranch(), current.currentPacket(),
            current.baseHeadSha(), current.expectedHeadSha(), current.executorId(),
            current.executorMode(), renewed
        );
        currentClaims.put(current.ownerPath(), updated);
        return updated;
    }

    public void requireMutationAuthority(
        OwnerLaneClaim claim,
        String ownerPath,
        String canonicalBranch,
        String currentPacket,
        String actualHeadSha,
        Instant now
    ) {
        OwnerLaneClaim current = requireExactCurrentHolder(claim);
        if (!current.ownerPath().equals(ownerPath)) throw new SecurityException("OWNER_PATH_MISMATCH");
        if (!current.canonicalBranch().equals(canonicalBranch)) throw new SecurityException("CANONICAL_BRANCH_MISMATCH");
        if (!current.currentPacket().equals(currentPacket)) throw new SecurityException("CURRENT_PACKET_MISMATCH");
        validateSha(actualHeadSha, "ACTUAL_HEAD_SHA_INVALID");
        if (!current.expectedHeadSha().equals(actualHeadSha)) throw new SecurityException("BRANCH_HEAD_DRIFT");
        leaseManager.requireMutationAuthority(changeId(ownerPath), current.lease().epoch(), current.lease().fenceToken(), now);
    }

    public OwnerLaneClaim acknowledgeMutationResult(
        OwnerLaneClaim claim,
        String previousHeadSha,
        String resultingHeadSha,
        Instant now
    ) {
        OwnerLaneClaim current = requireExactCurrentHolder(claim);
        leaseManager.requireMutationAuthority(changeId(current.ownerPath()), current.lease().epoch(), current.lease().fenceToken(), now);
        validateSha(previousHeadSha, "PREVIOUS_HEAD_SHA_INVALID");
        validateSha(resultingHeadSha, "RESULTING_HEAD_SHA_INVALID");
        if (!current.expectedHeadSha().equals(previousHeadSha)) throw new SecurityException("PREVIOUS_HEAD_MISMATCH");
        if (previousHeadSha.equals(resultingHeadSha)) throw new IllegalArgumentException("RESULTING_HEAD_UNCHANGED");
        OwnerLaneClaim updated = new OwnerLaneClaim(
            current.ownerPath(), current.canonicalBranch(), current.currentPacket(),
            current.baseHeadSha(), resultingHeadSha, current.executorId(),
            current.executorMode(), current.lease()
        );
        currentClaims.put(current.ownerPath(), updated);
        return updated;
    }

    public void release(OwnerLaneClaim claim, Instant now) {
        OwnerLaneClaim current = requireExactCurrentHolder(claim);
        leaseManager.requireMutationAuthority(changeId(current.ownerPath()), current.lease().epoch(), current.lease().fenceToken(), now);
        currentClaims.remove(current.ownerPath());
    }

    public Optional<OwnerLaneClaim> inspect(String ownerPath) {
        validateOwnerPath(ownerPath);
        return Optional.ofNullable(currentClaims.get(ownerPath));
    }

    public boolean readOnlyInspectionAllowed(String ownerPath) {
        validateOwnerPath(ownerPath);
        return true;
    }

    public long highestEpoch(String ownerPath) {
        validateOwnerPath(ownerPath);
        return leaseManager.highestEpoch(changeId(ownerPath));
    }

    private OwnerLaneClaim requireExactCurrentHolder(OwnerLaneClaim claim) {
        Objects.requireNonNull(claim, "claim");
        OwnerLaneClaim current = currentClaims.get(claim.ownerPath());
        if (current == null) throw new SecurityException("OWNER_LANE_LEASE_MISSING");
        if (!sameHolder(current, claim)) throw new SecurityException("OWNER_LANE_STALE_OR_FOREIGN_CLAIM");
        return current;
    }

    private static boolean sameHolder(OwnerLaneClaim a, OwnerLaneClaim b) {
        return a.ownerPath().equals(b.ownerPath())
            && a.canonicalBranch().equals(b.canonicalBranch())
            && a.currentPacket().equals(b.currentPacket())
            && a.executorId().equals(b.executorId())
            && a.executorMode() == b.executorMode()
            && a.lease().epoch() == b.lease().epoch()
            && a.lease().fenceToken().equals(b.lease().fenceToken())
            && a.expectedHeadSha().equals(b.expectedHeadSha());
    }

    private static void validateScope(String ownerPath, String branch, String packet, String headSha) {
        validateOwnerPath(ownerPath);
        requireText(branch, "CANONICAL_BRANCH_REQUIRED");
        requireText(packet, "CURRENT_PACKET_REQUIRED");
        validateSha(headSha, "HEAD_SHA_INVALID");
    }

    private static void validateOwnerPath(String ownerPath) {
        requireText(ownerPath, "OWNER_PATH_REQUIRED");
        if (!ACTIVE_OWNER_LANES.contains(ownerPath)) throw new IllegalArgumentException("UNKNOWN_OWNER_LANE");
    }

    private static void validateSha(String value, String code) {
        if (value == null || !value.matches("[0-9a-f]{40}")) throw new IllegalArgumentException(code);
    }

    private static void requireText(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(code);
    }

    private static String changeId(String ownerPath) {
        return "OWNER_LANE_EXECUTION:" + ownerPath;
    }

    private static String executorRef(String executorId, ExecutorMode mode) {
        return mode.name() + ":" + executorId;
    }
}
