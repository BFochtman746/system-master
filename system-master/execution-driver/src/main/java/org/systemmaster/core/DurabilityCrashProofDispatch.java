package org.systemmaster.core;

import java.util.Objects;

/**
 * Proof-only hard-crash wrapper for the two production dispatch durability windows.
 * With no proof environment configured, {@link #fromEnvironment} returns the original
 * dispatch object unchanged. Armed mode is accepted only on GitHub Actions for one exact
 * durability proof claim and one frozen acknowledgement string.
 */
final class DurabilityCrashProofDispatch implements DurableDispatchCoordinator.Dispatch {
    static final String ACK = "SECOND-SHIFT-DISPATCH-DURABILITY-003";
    static final int BEFORE_POST_EXIT = 86;
    static final int AFTER_POST_EXIT = 87;

    enum Point {
        AFTER_PREPARED_BEFORE_POST,
        AFTER_ACCEPTED_POST_BEFORE_DISPATCHED
    }

    @FunctionalInterface
    interface Halter { void halt(int status); }

    private final DurableDispatchCoordinator.Dispatch delegate;
    private final Point point;
    private final String expectedClaimId;
    private final Halter halter;

    DurabilityCrashProofDispatch(DurableDispatchCoordinator.Dispatch delegate, Point point,
            String expectedClaimId, Halter halter) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        this.point = Objects.requireNonNull(point, "point");
        this.expectedClaimId = requireProofClaim(expectedClaimId);
        this.halter = Objects.requireNonNull(halter, "halter");
    }

    static DurableDispatchCoordinator.Dispatch fromEnvironment(DurableDispatchCoordinator.Dispatch delegate) {
        Objects.requireNonNull(delegate, "delegate");
        String rawPoint = rawEnv("SECOND_SHIFT_DURABILITY_PROOF_FAULT");
        if (rawPoint.isEmpty()) return delegate;
        if (!"true".equals(rawEnv("GITHUB_ACTIONS"))) {
            throw new IllegalStateException("DURABILITY_CRASH_PROOF_NOT_GITHUB_ACTIONS");
        }
        if (!ACK.equals(rawEnv("SECOND_SHIFT_DURABILITY_PROOF_ACK"))) {
            throw new IllegalStateException("DURABILITY_CRASH_PROOF_ACK_MISMATCH");
        }
        String claimId = requireProofClaim(rawEnv("SECOND_SHIFT_DURABILITY_PROOF_CLAIM_ID"));
        Point point;
        try {
            point = Point.valueOf(rawPoint);
        } catch (IllegalArgumentException bad) {
            throw new IllegalStateException("DURABILITY_CRASH_PROOF_POINT_INVALID:" + rawPoint, bad);
        }
        return new DurabilityCrashProofDispatch(delegate, point, claimId,
                status -> Runtime.getRuntime().halt(status));
    }

    @Override
    public void preflight() throws Exception { delegate.preflight(); }

    @Override
    public String newDispatchId() { return delegate.newDispatchId(); }

    @Override
    public String post(String claimId, String payloadDigest, String dispatchId) throws Exception {
        if (!expectedClaimId.equals(claimId)) {
            throw new IllegalStateException("DURABILITY_CRASH_PROOF_CLAIM_MISMATCH");
        }
        if (point == Point.AFTER_PREPARED_BEFORE_POST) crash(BEFORE_POST_EXIT, claimId, dispatchId);
        String receipt = delegate.post(claimId, payloadDigest, dispatchId);
        if (point == Point.AFTER_ACCEPTED_POST_BEFORE_DISPATCHED) crash(AFTER_POST_EXIT, claimId, dispatchId);
        return receipt;
    }

    private void crash(int status, String claimId, String dispatchId) {
        System.out.println("DURABILITY-CRASH-PROOF point=" + point + " claim=" + claimId
                + " dispatchId=" + dispatchId + " exit=" + status);
        System.out.flush();
        System.err.flush();
        halter.halt(status);
        throw new IllegalStateException("DURABILITY_CRASH_PROOF_HALTER_RETURNED");
    }

    private static String requireProofClaim(String claimId) {
        if (claimId == null || !claimId.matches("durability-003-crash-[A-Za-z0-9._-]+")) {
            throw new IllegalStateException("DURABILITY_CRASH_PROOF_CLAIM_INVALID");
        }
        return claimId;
    }

    private static String rawEnv(String key) {
        String value = System.getenv(key);
        return value == null ? "" : value.trim();
    }
}
