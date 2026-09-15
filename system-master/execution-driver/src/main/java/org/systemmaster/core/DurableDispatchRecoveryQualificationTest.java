package org.systemmaster.core;

import java.time.Instant;

/**
 * Focused restart/terminal qualification for SECOND-SHIFT-DISPATCH-DURABILITY-003.
 *
 * <p>This class covers two state-machine edges that must remain true independently of
 * the broader coordinator qualification:
 * <ul>
 *   <li>a crash after CLAIMED but before DISPATCH_PREPARED is safe to resume because
 *       no remote POST can have happened before the durable PREPARED barrier; and</li>
 *   <li>a completed non-success remote run becomes durable FAILED and can never be
 *       admitted or dispatched again.</li>
 * </ul>
 */
public final class DurableDispatchRecoveryQualificationTest {

    private static final Instant T0 = Instant.parse("2026-09-15T04:30:00Z");
    private static int checks;
    private static int failures;

    public static void main(String[] args) throws Exception {
        restartFromClaimedBeforePreparedPostsExactlyOnce();
        nonSuccessCompletionDurablyFailsAndNeverReadmits();

        System.out.println();
        System.out.println("DISPATCH-DURABILITY-003-RECOVERY checks=" + checks
                + " failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void restartFromClaimedBeforePreparedPostsExactlyOnce() throws Exception {
        MemStore store = new MemStore();
        DurableDispatchCoordinator.ClaimRecord ready =
                DurableDispatchCoordinator.ClaimRecord.ready("job-claimed", "sha256:claimed", T0);
        DurableDispatchCoordinator.Versioned v = store.save(null, ready);
        DurableDispatchCoordinator.ClaimRecord claimed =
                ready.claimed("crashed-consumer", "fence-crashed", T0);
        store.save(v.revision(), claimed);

        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler(
                DurableDispatchCoordinator.Discovery.found(1101L),
                new DurableDispatchCoordinator.Completion(
                        1101L, "completed", "success",
                        "ACTIONS_COMPLETED run_id=1101 conclusion=success dispatch_id=dispatch-1"));

        DurableDispatchCoordinator restarted = coordinator(
                store, dispatch, reconcile, "restart-consumer");
        DurableDispatchCoordinator.DriveResult result =
                restarted.drive("job-claimed", "sha256:claimed");
        DurableDispatchCoordinator.ClaimRecord done = store.record("job-claimed");

        eq("CLAIMED restart reaches DONE", DurableDispatchCoordinator.State.DONE, done.state());
        eq("CLAIMED restart performs exactly one POST", 1, dispatch.posts);
        eq("pre-PREPARED crash preserves attempt high-water", 1, done.attempts());
        eq("pre-PREPARED crash preserves epoch high-water", 1L, done.epoch());
        ok("restart persisted a dispatch identity before POST",
                done.dispatchId() != null && !done.dispatchId().isBlank());
        ok("DONE durably retains completion evidence",
                done.terminalReason().contains(
                        "EVIDENCE=ACTIONS_COMPLETED run_id=1101 conclusion=success dispatch_id=dispatch-1"));
        eq("restart terminal disposition", "TERMINAL_NO_READMISSION",
                restarted.drive("job-claimed", "sha256:claimed").disposition());
        eq("terminal replay does not POST", 1, dispatch.posts);
        eq("initial drive result is terminal", DurableDispatchCoordinator.State.DONE, result.state());
    }

    private static void nonSuccessCompletionDurablyFailsAndNeverReadmits() throws Exception {
        MemStore store = new MemStore();
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler(
                DurableDispatchCoordinator.Discovery.found(1202L),
                new DurableDispatchCoordinator.Completion(
                        1202L, "completed", "failure",
                        "ACTIONS_COMPLETED run_id=1202 conclusion=failure dispatch_id=dispatch-1"));

        DurableDispatchCoordinator first = coordinator(store, dispatch, reconcile, "consumer-1");
        DurableDispatchCoordinator.DriveResult firstResult =
                first.drive("job-failed", "sha256:failed");
        DurableDispatchCoordinator.ClaimRecord failed = store.record("job-failed");

        eq("completed non-success maps to FAILED",
                DurableDispatchCoordinator.State.FAILED, failed.state());
        eq("FAILED run status is durably terminal", "completed", failed.runStatus());
        eq("FAILED conclusion is durable", "failure", failed.runConclusion());
        eq("FAILED terminal reason retains exact completion evidence",
                "RUN_NON_SUCCESS:failure EVIDENCE=ACTIONS_COMPLETED run_id=1202 conclusion=failure dispatch_id=dispatch-1",
                failed.terminalReason());
        eq("FAILED retains exact run id", Long.valueOf(1202L), failed.runId());
        eq("first FAILED result requires attention", true, firstResult.needsAttention());
        eq("fresh execution POSTed once", 1, dispatch.posts);

        int discoveries = reconcile.discoveries;
        int completions = reconcile.completions;
        DurableDispatchCoordinator.DriveResult replay =
                coordinator(store, dispatch, reconcile, "consumer-2")
                        .drive("job-failed", "sha256:failed");

        eq("FAILED replay stays FAILED", DurableDispatchCoordinator.State.FAILED, replay.state());
        eq("FAILED replay disposition blocks readmission", "TERMINAL_NO_READMISSION",
                replay.disposition());
        eq("FAILED replay never POSTs", 1, dispatch.posts);
        eq("FAILED replay never rediscovers", discoveries, reconcile.discoveries);
        eq("FAILED replay never waits for completion again", completions, reconcile.completions);
        eq("FAILED replay preserves epoch high-water", failed.epoch(), store.record("job-failed").epoch());
    }

    private static DurableDispatchCoordinator coordinator(
            MemStore store, FakeDispatch dispatch, FakeReconciler reconcile, String consumer) {
        return new DurableDispatchCoordinator(
                store, dispatch, reconcile, () -> T0,
                () -> "fence-" + consumer, consumer);
    }

    private static final class FakeDispatch implements DurableDispatchCoordinator.Dispatch {
        int ids;
        int posts;

        @Override
        public void preflight() { }

        @Override
        public String newDispatchId() {
            return "dispatch-" + (++ids);
        }

        @Override
        public String post(String claimId, String payloadDigest, String dispatchId) {
            posts++;
            return "ACTIONS_DISPATCHED dispatch_id=" + dispatchId;
        }
    }

    private static final class FakeReconciler implements DurableDispatchCoordinator.Reconciler {
        final DurableDispatchCoordinator.Discovery discovery;
        final DurableDispatchCoordinator.Completion completion;
        int discoveries;
        int completions;

        FakeReconciler(DurableDispatchCoordinator.Discovery discovery,
                DurableDispatchCoordinator.Completion completion) {
            this.discovery = discovery;
            this.completion = completion;
        }

        @Override
        public DurableDispatchCoordinator.Discovery discover(String claimId, String dispatchId) {
            discoveries++;
            return discovery;
        }

        @Override
        public DurableDispatchCoordinator.Completion await(
                String claimId, String dispatchId, long runId) {
            completions++;
            return completion;
        }
    }

    private static final class MemStore implements DurableDispatchCoordinator.Store {
        DurableDispatchCoordinator.Versioned current;
        long sequence;

        @Override
        public DurableDispatchCoordinator.Versioned load(String claimId) {
            if (current == null || !current.record().claimId().equals(claimId)) return null;
            return current;
        }

        @Override
        public DurableDispatchCoordinator.Versioned save(
                String expectedRevision, DurableDispatchCoordinator.ClaimRecord next)
                throws Exception {
            if (expectedRevision == null) {
                if (current != null) {
                    throw new DurableDispatchCoordinator.CasConflictException("CAS_CONFLICT");
                }
            } else if (current == null || !expectedRevision.equals(current.revision())) {
                throw new DurableDispatchCoordinator.CasConflictException("CAS_CONFLICT");
            }
            current = new DurableDispatchCoordinator.Versioned(next, "r" + (++sequence));
            return current;
        }

        DurableDispatchCoordinator.ClaimRecord record(String claimId) {
            DurableDispatchCoordinator.Versioned found = load(claimId);
            if (found == null) throw new AssertionError("missing state for " + claimId);
            return found.record();
        }
    }

    private static void ok(String label, boolean condition) {
        checks++;
        if (condition) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label);
        }
    }

    private static void eq(String label, Object expected, Object actual) {
        checks++;
        if (expected == null ? actual == null : expected.equals(actual)) {
            System.out.println("  PASS  " + label);
        } else {
            failures++;
            System.out.println("  FAIL  " + label + " expected=" + expected + " actual=" + actual);
        }
    }
}
