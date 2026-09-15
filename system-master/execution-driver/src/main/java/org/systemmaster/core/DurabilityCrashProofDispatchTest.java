package org.systemmaster.core;

/** Deterministic qualification for the proof-only hard-crash dispatch wrapper. */
public final class DurabilityCrashProofDispatchTest {
    public static void main(String[] args) throws Exception {
        defaultOffReturnsOriginalDispatch();
        authorizationFailsClosedOutsideDedicatedWorkflow();
        beforePostCrashDoesNotCallDelegatePost();
        afterAcceptedPostCrashCallsDelegateExactlyOnce();
        mismatchedClaimFailsBeforeDelegatePost();
        System.out.println("DURABILITY-CRASH-PROOF-DISPATCH RESULT: PASS");
    }

    private static void defaultOffReturnsOriginalDispatch() {
        FakeDispatch delegate = new FakeDispatch();
        DurableDispatchCoordinator.Dispatch configured = DurabilityCrashProofDispatch.fromConfiguration(
                delegate, "", "", "", "", "", "", status -> { throw new AssertionError("must not halt"); });
        if (configured != delegate) throw new AssertionError("unarmed proof wrapper must be exact no-op");
    }

    private static void authorizationFailsClosedOutsideDedicatedWorkflow() {
        FakeDispatch delegate = new FakeDispatch();
        expectFailure("DURABILITY_CRASH_PROOF_NOT_GITHUB_ACTIONS", () ->
                DurabilityCrashProofDispatch.fromConfiguration(delegate,
                        "AFTER_PREPARED_BEFORE_POST", "false", DurabilityCrashProofDispatch.ACK,
                        "durability-003-crash-auth-test", DurabilityCrashProofDispatch.WORKFLOW,
                        DurabilityCrashProofDispatch.BRANCH, status -> { }));
        expectFailure("DURABILITY_CRASH_PROOF_WORKFLOW_MISMATCH", () ->
                DurabilityCrashProofDispatch.fromConfiguration(delegate,
                        "AFTER_PREPARED_BEFORE_POST", "true", DurabilityCrashProofDispatch.ACK,
                        "durability-003-crash-auth-test", "Different Workflow",
                        DurabilityCrashProofDispatch.BRANCH, status -> { }));
        expectFailure("DURABILITY_CRASH_PROOF_BRANCH_MISMATCH", () ->
                DurabilityCrashProofDispatch.fromConfiguration(delegate,
                        "AFTER_PREPARED_BEFORE_POST", "true", DurabilityCrashProofDispatch.ACK,
                        "durability-003-crash-auth-test", DurabilityCrashProofDispatch.WORKFLOW,
                        "main", status -> { }));
        expectFailure("DURABILITY_CRASH_PROOF_ACK_MISMATCH", () ->
                DurabilityCrashProofDispatch.fromConfiguration(delegate,
                        "AFTER_PREPARED_BEFORE_POST", "true", "wrong-ack",
                        "durability-003-crash-auth-test", DurabilityCrashProofDispatch.WORKFLOW,
                        DurabilityCrashProofDispatch.BRANCH, status -> { }));
        expectFailure("DURABILITY_CRASH_PROOF_POINT_INVALID:NOT_A_POINT", () ->
                DurabilityCrashProofDispatch.fromConfiguration(delegate,
                        "NOT_A_POINT", "true", DurabilityCrashProofDispatch.ACK,
                        "durability-003-crash-auth-test", DurabilityCrashProofDispatch.WORKFLOW,
                        DurabilityCrashProofDispatch.BRANCH, status -> { }));
        if (delegate.posts != 0) throw new AssertionError("authorization failures must never POST");
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

    private static void expectFailure(String message, Action action) {
        try {
            action.run();
            throw new AssertionError("expected failure " + message);
        } catch (IllegalStateException expected) {
            if (!message.equals(expected.getMessage())) {
                throw new AssertionError("expected=" + message + " actual=" + expected.getMessage(), expected);
            }
        } catch (Exception unexpected) {
            throw new AssertionError("unexpected checked failure", unexpected);
        }
    }

    @FunctionalInterface
    private interface Action { void run() throws Exception; }

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
