package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Structural proof for the remote execution ordering invariant:
 * CLAIMED -> dispatch accepted -> DISPATCHED -> completion wait -> DONE/FAILED.
 */
public final class ClaimDispatchOrderingTest {

    private static int checks;
    private static int failures;
    private static long mono = 10_000L;

    private static final Instant T0 = Instant.parse("2026-09-15T03:00:00Z");
    private static final Duration TTL = Duration.ofMinutes(10);

    public static void main(String[] args) {
        dispatchedIsVisibleBeforeCompletionWait();
        completionFailureStartsFromDispatched();
        rejectedDispatchNeverStartsCompletionWait();
        dispatchedWorkIsNotReadmittedAfterLeaseExpiry();

        System.out.println();
        System.out.println("CLAIM-DISPATCH-ORDERING-1.0  checks=" + checks
                + "  failures=" + failures);
        if (failures > 0) {
            System.out.println("RESULT: FAIL");
            System.exit(1);
        }
        System.out.println("RESULT: PASS");
    }

    private static void dispatchedIsVisibleBeforeCompletionWait() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("order-success", "payload-1");
        List<String> events = new ArrayList<>();

        ClaimLedger.Consumer.Dispatch dispatch = (id, payload) -> {
            eq("success: state while transport is dispatching",
                    ClaimLedger.ClaimState.CLAIMED, ledger.view(id).state());
            events.add("dispatch-accepted");
            return "ACTIONS_DISPATCHED correlation=" + id;
        };

        ClaimLedger.Consumer.Completion completion = (id, payload, dispatchReceipt) -> {
            // Load-bearing assertion: if markDispatched moves below await(), this turns red.
            eq("success: DISPATCHED visible before completion wait",
                    ClaimLedger.ClaimState.DISPATCHED, ledger.view(id).state());
            eq("success: dispatch evidence already observable", 1, ledger.receipts(id).size());
            events.add("completion-wait-entered");
            return "ACTIONS_COMPLETED conclusion=success correlation=" + id;
        };

        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger, dispatch, completion, "ordering-test", TTL);
        String handled = consumer.tick(T0, te(T0));

        eq("success: handled id", "order-success", handled);
        eq("success: terminal state", ClaimLedger.ClaimState.DONE,
                ledger.view("order-success").state());
        eq("success: dispatch plus completion evidence", 2,
                ledger.receipts("order-success").size());
        eq("success: call order", List.of("dispatch-accepted", "completion-wait-entered"), events);
    }

    private static void completionFailureStartsFromDispatched() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("order-failure", "payload-2");
        boolean[] completionCalled = { false };

        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger,
                (id, payload) -> "ACTIONS_DISPATCHED correlation=" + id,
                (id, payload, dispatchReceipt) -> {
                    completionCalled[0] = true;
                    eq("failure: DISPATCHED visible before failing completion wait",
                            ClaimLedger.ClaimState.DISPATCHED, ledger.view(id).state());
                    throw new IllegalStateException("ACTIONS_CONCLUSION_FAILURE");
                },
                "ordering-test", TTL);

        consumer.tick(T0, te(T0));

        ok("failure: completion wait was called", completionCalled[0]);
        eq("failure: terminal state", ClaimLedger.ClaimState.FAILED,
                ledger.view("order-failure").state());
        eq("failure: dispatch and failure evidence both retained", 2,
                ledger.receipts("order-failure").size());
        ok("failure: cause retained",
                ledger.receipts("order-failure").get(1).receiptDigest()
                        .contains("ACTIONS_CONCLUSION_FAILURE"));
    }

    private static void rejectedDispatchNeverStartsCompletionWait() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("dispatch-rejected", "payload-3");
        boolean[] completionCalled = { false };

        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(
                ledger,
                (id, payload) -> { throw new IllegalStateException("DISPATCH_REJECTED_422"); },
                (id, payload, dispatchReceipt) -> {
                    completionCalled[0] = true;
                    return "must-not-run";
                },
                "ordering-test", TTL);

        consumer.tick(T0, te(T0));

        ok("rejected: completion wait never called", !completionCalled[0]);
        eq("rejected: terminal state", ClaimLedger.ClaimState.FAILED,
                ledger.view("dispatch-rejected").state());
        eq("rejected: one refusal receipt", 1, ledger.receipts("dispatch-rejected").size());
    }

    private static void dispatchedWorkIsNotReadmittedAfterLeaseExpiry() {
        ClaimLedger ledger = new ClaimLedger(new ExecutionLeaseManager());
        ledger.submit("in-flight", "payload-4");
        CoordinationContracts.ExecutionLease lease =
                ledger.claim("in-flight", "ordering-test", TTL, T0, te(T0));
        ledger.markDispatched("in-flight", lease.epoch(), lease.fenceToken(),
                "ACTIONS_DISPATCHED correlation=in-flight", T0);

        Instant later = T0.plus(Duration.ofMinutes(30));
        eq("in-flight: recover does not readmit DISPATCHED", 0,
                ledger.recover(later, te(later)).size());
        eq("in-flight: remains DISPATCHED after local lease expiry",
                ClaimLedger.ClaimState.DISPATCHED, ledger.view("in-flight").state());
        refuses("in-flight: cannot be redispatched while completion is unresolved",
                IllegalStateException.class, "CLAIM_DISPATCHED_AWAITING_COMPLETION",
                () -> ledger.claim("in-flight", "other-consumer", TTL, later, te(later)));
    }

    private static CoordinationContracts.TimeEvidence te(Instant now) {
        mono += 1_000L;
        return new CoordinationContracts.TimeEvidence(now, mono, Duration.ofSeconds(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    private interface Body { void run() throws Exception; }

    private static void ok(String label, boolean condition) {
        checks++;
        if (condition) System.out.println("  PASS  " + label);
        else {
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
            System.out.println("  FAIL  " + label + " — expected " + expected + ", got " + actual);
        }
    }

    private static void refuses(String label, Class<? extends Throwable> type,
            String code, Body body) {
        checks++;
        try {
            body.run();
            failures++;
            System.out.println("  FAIL  " + label + " — no refusal raised");
        } catch (Throwable t) {
            String message = String.valueOf(t.getMessage());
            if (type.isInstance(t) && message.contains(code)) {
                System.out.println("  PASS  " + label);
            } else {
                failures++;
                System.out.println("  FAIL  " + label + " — expected "
                        + type.getSimpleName() + "(" + code + "), got "
                        + t.getClass().getSimpleName() + "(" + message + ")");
            }
        }
    }
}
