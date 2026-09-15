package org.systemmaster.core;

/** Deterministic qualification for the proof-only hard-crash dispatch wrapper. */
public final class DurabilityCrashProofDispatchTest {
    public static void main(String[] args) throws Exception {
        beforePostCrashDoesNotCallDelegatePost();
        afterAcceptedPostCrashCallsDelegateExactlyOnce();
        mismatchedClaimFailsBeforeDelegatePost();
        System.out.println("DURABILITY-CRASH-PROOF-DISPATCH RESULT: PASS");
    }

    private static void beforePostCrashDoesNotCallDelegatePost() throws Exception {
        FakeDispatch delegate = new FakeDispatch();
        StopBox stops = new StopBox();
        DurabilityCrashProofDispatch wrapped = new DurabilityCrashProofDispatch(delegate,
                DurabilityCrashProofDispatch.Point.AFTER_PREPARED_BEFORE_POST,
                "durability-003-crash-before-post-test", stops::halt);
        try {
            wrapped.post("durability-003-crash-before-post-test", "payload", "dispatch-a");
            throw new AssertionError("expected controlled halt");
        } catch (Stopped expected) {
            if (expected.status != DurabilityCrashProofDispatch.BEFORE_POST_EXIT) throw new AssertionError("wrong before-post exit");
        }
        if (delegate.posts != 0) throw new AssertionError("before-post crash must not POST");
        if (stops.calls != 1) throw new AssertionError("before-post crash must halt exactly once");
    }

    private static void afterAcceptedPostCrashCallsDelegateExactlyOnce() throws Exception {
        FakeDispatch delegate = new FakeDispatch();
        StopBox stops = new StopBox();
        DurabilityCrashProofDispatch wrapped = new DurabilityCrashProofDispatch(delegate,
                DurabilityCrashProofDispatch.Point.AFTER_ACCEPTED_POST_BEFORE_DISPATCHED,
                "durability-003-crash-after-post-test", stops::halt);
        try {
            wrapped.post("durability-003-crash-after-post-test", "payload", "dispatch-b");
            throw new AssertionError("expected controlled halt");
        } catch (Stopped expected) {
            if (expected.status != DurabilityCrashProofDispatch.AFTER_POST_EXIT) throw new AssertionError("wrong after-post exit");
        }
        if (delegate.posts != 1) throw new AssertionError("after-post crash must POST exactly once");
        if (stops.calls != 1) throw new AssertionError("after-post crash must halt exactly once");
    }

    private static void mismatchedClaimFailsBeforeDelegatePost() throws Exception {
        FakeDispatch delegate = new FakeDispatch();
        StopBox stops = new StopBox();
        DurabilityCrashProofDispatch wrapped = new DurabilityCrashProofDispatch(delegate,
                DurabilityCrashProofDispatch.Point.AFTER_ACCEPTED_POST_BEFORE_DISPATCHED,
                "durability-003-crash-expected-test", stops::halt);
        try {
            wrapped.post("durability-003-crash-other-test", "payload", "dispatch-c");
            throw new AssertionError("expected claim mismatch");
        } catch (IllegalStateException expected) {
            if (!"DURABILITY_CRASH_PROOF_CLAIM_MISMATCH".equals(expected.getMessage())) throw expected;
        }
        if (delegate.posts != 0 || stops.calls != 0) throw new AssertionError("mismatched claim must fail closed before POST/halt");
    }

    private static final class FakeDispatch implements DurableDispatchCoordinator.Dispatch {
        int posts;
        public void preflight() { }
        public String newDispatchId() { return "dispatch"; }
        public String post(String claimId, String payloadDigest, String dispatchId) {
            posts++;
            return "accepted";
        }
    }

    private static final class StopBox {
        int calls;
        void halt(int status) { calls++; throw new Stopped(status); }
    }

    private static final class Stopped extends RuntimeException {
        final int status;
        Stopped(int status) { this.status = status; }
    }
}
