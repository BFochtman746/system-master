package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;

/** Deterministic crash/restart qualification for SECOND-SHIFT-DISPATCH-DURABILITY-003. */
public final class DurableDispatchCoordinatorTest {
    private static int checks;
    private static int failures;
    private static final Instant T0 = Instant.parse("2026-09-15T03:00:00Z");

    public static void main(String[] args) throws Exception {
        preparedBeforePostIsDurableBarrier();
        crashAfterAcceptedPostReconcilesWithoutRedispatch();
        crashWhileDispatchedResumesCompletionOnly();
        preparedNoRunStaysUncertainNoRedispatch();
        preparedAmbiguityFailsClosedNoRedispatch();
        terminalNeverReadmits();
        casConflictCannotAuthorizeSecondPost();
        corruptionFailsClosed();
        freshCompletionTimeSurvivesFifteenMinuteWait();

        System.out.println();
        System.out.println("DISPATCH-DURABILITY-003 checks=" + checks + " failures=" + failures);
        if (failures > 0) { System.out.println("RESULT: FAIL"); System.exit(1); }
        System.out.println("RESULT: PASS");
    }

    private static void preparedBeforePostIsDurableBarrier() throws Exception {
        MemStore store = new MemStore();
        MutableClock clock = new MutableClock(T0);
        FakeDispatch dispatch = new FakeDispatch();
        dispatch.failPost = true;
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.notFound();
        DurableDispatchCoordinator c = coordinator(store, dispatch, reconcile, clock, "consumer-1");
        DurableDispatchCoordinator.DriveResult result = c.drive("job-1", "sha256:p");
        DurableDispatchCoordinator.ClaimRecord r = store.record("job-1");
        eq("PREPARED is durable when POST does not complete locally", DurableDispatchCoordinator.State.DISPATCH_PREPARED, r.state());
        ok("dispatch id persisted before POST", r.dispatchId() != null && !r.dispatchId().isBlank());
        eq("exactly one POST attempt by PREPARED writer", 1, dispatch.posts);
        eq("failure returns uncertainty not a redispatchable state", "PREPARED_UNCERTAIN_NO_REDISPATCH", result.disposition());
        dispatch.failPost = false;
        coordinator(store, dispatch, reconcile, clock, "consumer-2").drive("job-1", "sha256:p");
        eq("restart never POSTs a PREPARED claim", 1, dispatch.posts);
        eq("PREPARED remains PREPARED when exact run is absent", DurableDispatchCoordinator.State.DISPATCH_PREPARED, store.record("job-1").state());
    }

    private static void crashAfterAcceptedPostReconcilesWithoutRedispatch() throws Exception {
        MemStore store = new MemStore();
        MutableClock clock = new MutableClock(T0);
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        store.crashOnNextDispatchedSave = true;
        DurableDispatchCoordinator first = coordinator(store, dispatch, reconcile, clock, "consumer-1");
        refuses("simulated crash after accepted POST escapes", RuntimeException.class, "SIMULATED_CRASH", () -> first.drive("job-2", "sha256:p2"));
        eq("one accepted POST occurred before crash", 1, dispatch.posts);
        eq("durable state is still PREPARED across crash", DurableDispatchCoordinator.State.DISPATCH_PREPARED, store.record("job-2").state());
        String persistedId = store.record("job-2").dispatchId();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.found(202L);
        reconcile.completion = success(202L, persistedId);
        coordinator(store, dispatch, reconcile, clock, "consumer-2").drive("job-2", "sha256:p2");
        eq("restart did not send a second POST", 1, dispatch.posts);
        eq("restart discovered exact persisted dispatch id", persistedId, reconcile.lastDispatchId);
        eq("reconciled accepted POST reaches DONE", DurableDispatchCoordinator.State.DONE, store.record("job-2").state());
        eq("run id persisted", Long.valueOf(202L), store.record("job-2").runId());
    }

    private static void crashWhileDispatchedResumesCompletionOnly() throws Exception {
        MemStore store = new MemStore();
        MutableClock clock = new MutableClock(T0);
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.found(303L);
        reconcile.failAwait = true;
        coordinator(store, dispatch, reconcile, clock, "consumer-1").drive("job-3", "sha256:p3");
        eq("completion interruption leaves DISPATCHED", DurableDispatchCoordinator.State.DISPATCHED, store.record("job-3").state());
        eq("run id persisted before completion wait", Long.valueOf(303L), store.record("job-3").runId());
        eq("fresh path POST count", 1, dispatch.posts);
        reconcile.failAwait = false;
        reconcile.completion = success(303L, store.record("job-3").dispatchId());
        int discoveriesBefore = reconcile.discoveries;
        coordinator(store, dispatch, reconcile, clock, "consumer-2").drive("job-3", "sha256:p3");
        eq("DISPATCHED restart never POSTs", 1, dispatch.posts);
        eq("known run id avoids rediscovery", discoveriesBefore, reconcile.discoveries);
        eq("DISPATCHED restart completes", DurableDispatchCoordinator.State.DONE, store.record("job-3").state());
    }

    private static void preparedNoRunStaysUncertainNoRedispatch() throws Exception {
        MemStore store = preparedStore("job-4", "sha256:p4", "dispatch-fixed");
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.notFound();
        DurableDispatchCoordinator.DriveResult result = coordinator(store, dispatch, reconcile, new MutableClock(T0), "restart").drive("job-4", "sha256:p4");
        eq("no run leaves PREPARED", DurableDispatchCoordinator.State.DISPATCH_PREPARED, store.record("job-4").state());
        eq("no run cannot authorize POST", 0, dispatch.posts);
        ok("no run requires attention", result.needsAttention());
    }

    private static void preparedAmbiguityFailsClosedNoRedispatch() throws Exception {
        MemStore store = preparedStore("job-5", "sha256:p5", "dispatch-fixed");
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.failDiscover = new IllegalStateException("DISPATCH_RUN_AMBIGUOUS");
        DurableDispatchCoordinator.DriveResult result = coordinator(store, dispatch, reconcile, new MutableClock(T0), "restart").drive("job-5", "sha256:p5");
        eq("ambiguous discovery leaves PREPARED", DurableDispatchCoordinator.State.DISPATCH_PREPARED, store.record("job-5").state());
        eq("ambiguity cannot trigger POST", 0, dispatch.posts);
        eq("ambiguity is reconciliation-blocked", "PREPARED_RECONCILIATION_BLOCKED", result.disposition());
    }

    private static void terminalNeverReadmits() throws Exception {
        MemStore store = new MemStore();
        MutableClock clock = new MutableClock(T0);
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.found(606L);
        coordinator(store, dispatch, reconcile, clock, "consumer-1").drive("job-6", "sha256:p6");
        eq("claim reached DONE", DurableDispatchCoordinator.State.DONE, store.record("job-6").state());
        long epoch = store.record("job-6").epoch();
        DurableDispatchCoordinator.DriveResult again = coordinator(store, dispatch, reconcile, clock, "consumer-2").drive("job-6", "sha256:p6");
        eq("terminal claim did not POST again", 1, dispatch.posts);
        eq("terminal epoch high-water never resets", epoch, store.record("job-6").epoch());
        eq("terminal disposition explicit", "TERMINAL_NO_READMISSION", again.disposition());
    }

    private static void casConflictCannotAuthorizeSecondPost() throws Exception {
        MemStore store = new MemStore();
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.notFound();
        store.installCompetingPreparedOnClaimedToPrepared = true;
        coordinator(store, dispatch, reconcile, new MutableClock(T0), "consumer-loser").drive("job-7", "sha256:p7");
        eq("loser of PREPARED CAS never POSTs", 0, dispatch.posts);
        eq("competing PREPARED state preserved", DurableDispatchCoordinator.State.DISPATCH_PREPARED, store.record("job-7").state());
        eq("competing dispatch id is authoritative", "dispatch-winner", store.record("job-7").dispatchId());
    }

    private static void corruptionFailsClosed() {
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready("job-8", "sha256:p8", T0);
        String json = ready.toJson();
        eq("versioned state JSON round-trips", ready, DurableDispatchCoordinator.ClaimRecord.fromJson(json));
        refuses("unsupported schema fails closed", IllegalStateException.class, "STATE_SCHEMA_UNSUPPORTED", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json.replace("\"schema_version\":1", "\"schema_version\":99")));
        refuses("missing required field fails closed", IllegalStateException.class, "STATE_CORRUPT_MISSING_CLAIM_ID", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json.replace("\"claim_id\":\"job-8\",\n", "")));
        refuses("trailing bytes fail closed", IllegalStateException.class, "STATE_CORRUPT_NON_CANONICAL", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json + "{}"));
        refuses("duplicate field fails closed", IllegalStateException.class, "STATE_CORRUPT_NON_CANONICAL", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json.replace("\"payload_digest\":\"sha256:p8\",\n", "\"payload_digest\":\"sha256:p8\",\n  \"claim_id\":\"job-8\",\n")));
        refuses("unknown field fails closed", IllegalStateException.class, "STATE_CORRUPT_NON_CANONICAL", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json.replace("\n}\n", ",\n  \"unexpected\":\"x\"\n}\n")));
        refuses("noncanonical whitespace fails closed", IllegalStateException.class, "STATE_CORRUPT_NON_CANONICAL", () -> DurableDispatchCoordinator.ClaimRecord.fromJson(json.replace("\"schema_version\":1", "\"schema_version\" : 1")));
    }

    private static void freshCompletionTimeSurvivesFifteenMinuteWait() throws Exception {
        MemStore store = new MemStore();
        MutableClock clock = new MutableClock(T0);
        FakeDispatch dispatch = new FakeDispatch();
        FakeReconciler reconcile = new FakeReconciler();
        reconcile.discovery = DurableDispatchCoordinator.Discovery.found(909L);
        reconcile.onAwait = () -> clock.advance(Duration.ofMinutes(15));
        coordinator(store, dispatch, reconcile, clock, "consumer-1").drive("job-9", "sha256:p9");
        DurableDispatchCoordinator.ClaimRecord terminal = store.record("job-9");
        eq("15-minute remote run still terminalizes", DurableDispatchCoordinator.State.DONE, terminal.state());
        eq("terminal timestamp is fresh after wait", T0.plus(Duration.ofMinutes(15)), terminal.updatedAt());
        ok("terminal timestamp is later than prepared time", terminal.updatedAt().isAfter(terminal.preparedAt()));
        eq("epoch remains monotonic through long wait", 1L, terminal.epoch());
    }

    private static DurableDispatchCoordinator coordinator(MemStore store, FakeDispatch dispatch, FakeReconciler reconciler, MutableClock clock, String consumer) {
        return new DurableDispatchCoordinator(store, dispatch, reconciler, clock, () -> "fence-" + consumer, consumer);
    }

    private static MemStore preparedStore(String id, String payload, String dispatchId) throws Exception {
        MemStore store = new MemStore();
        DurableDispatchCoordinator.ClaimRecord ready = DurableDispatchCoordinator.ClaimRecord.ready(id, payload, T0);
        DurableDispatchCoordinator.Versioned v = store.save(null, ready);
        DurableDispatchCoordinator.ClaimRecord claimed = v.record().claimed("old-consumer", "old-fence", T0);
        v = store.save(v.revision(), claimed);
        store.save(v.revision(), claimed.prepared(dispatchId, T0));
        return store;
    }

    private static DurableDispatchCoordinator.Completion success(long runId, String dispatchId) {
        return new DurableDispatchCoordinator.Completion(runId, "completed", "success", "ACTIONS_COMPLETED run_id=" + runId + " conclusion=success dispatch_id=" + dispatchId);
    }

    private static final class MutableClock implements DurableDispatchCoordinator.Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        public Instant now() { return now; }
        void advance(Duration d) { now = now.plus(d); }
    }

    private static final class FakeDispatch implements DurableDispatchCoordinator.Dispatch {
        int posts;
        int ids;
        boolean failPost;
        public void preflight() { }
        public String newDispatchId() { return "dispatch-" + (++ids); }
        public String post(String claimId, String payloadDigest, String dispatchId) {
            posts++;
            if (failPost) throw new IllegalStateException("SIMULATED_POST_BOUNDARY_FAILURE");
            return "accepted:" + dispatchId;
        }
    }

    private static final class FakeReconciler implements DurableDispatchCoordinator.Reconciler {
        int discoveries;
        String lastDispatchId;
        DurableDispatchCoordinator.Discovery discovery = DurableDispatchCoordinator.Discovery.found(101L);
        DurableDispatchCoordinator.Completion completion;
        RuntimeException failDiscover;
        boolean failAwait;
        Runnable onAwait;
        public DurableDispatchCoordinator.Discovery discover(String claimId, String dispatchId) {
            discoveries++; lastDispatchId = dispatchId; if (failDiscover != null) throw failDiscover; return discovery;
        }
        public DurableDispatchCoordinator.Completion await(String claimId, String dispatchId, long runId) {
            lastDispatchId = dispatchId; if (onAwait != null) onAwait.run();
            if (failAwait) throw new IllegalStateException("SIMULATED_COMPLETION_CRASH");
            return completion != null ? completion : success(runId, dispatchId);
        }
    }

    private static final class MemStore implements DurableDispatchCoordinator.Store {
        private DurableDispatchCoordinator.Versioned current;
        private long rev;
        boolean crashOnNextDispatchedSave;
        boolean installCompetingPreparedOnClaimedToPrepared;
        public DurableDispatchCoordinator.Versioned load(String claimId) {
            if (current == null || !current.record().claimId().equals(claimId)) return null;
            return current;
        }
        public DurableDispatchCoordinator.Versioned save(String expected, DurableDispatchCoordinator.ClaimRecord next) throws Exception {
            if (expected == null) {
                if (current != null) throw new DurableDispatchCoordinator.CasConflictException("CAS_CONFLICT");
            } else if (current == null || !expected.equals(current.revision())) {
                throw new DurableDispatchCoordinator.CasConflictException("CAS_CONFLICT");
            }
            if (installCompetingPreparedOnClaimedToPrepared && current != null
                    && current.record().state() == DurableDispatchCoordinator.State.CLAIMED
                    && next.state() == DurableDispatchCoordinator.State.DISPATCH_PREPARED) {
                installCompetingPreparedOnClaimedToPrepared = false;
                DurableDispatchCoordinator.ClaimRecord winner = current.record().prepared("dispatch-winner", T0);
                current = new DurableDispatchCoordinator.Versioned(winner, "r" + (++rev));
                throw new DurableDispatchCoordinator.CasConflictException("CAS_CONFLICT");
            }
            if (crashOnNextDispatchedSave && next.state() == DurableDispatchCoordinator.State.DISPATCHED) {
                crashOnNextDispatchedSave = false;
                throw new RuntimeException("SIMULATED_CRASH");
            }
            current = new DurableDispatchCoordinator.Versioned(next, "r" + (++rev));
            return current;
        }
        DurableDispatchCoordinator.ClaimRecord record(String id) {
            DurableDispatchCoordinator.Versioned v = load(id);
            if (v == null) throw new AssertionError("missing " + id);
            return v.record();
        }
    }

    private interface Checked { void run() throws Exception; }
    private static void refuses(String label, Class<? extends Throwable> type, String code, Checked body) {
        checks++;
        try { body.run(); failures++; System.out.println("  FAIL  " + label + " (no exception)"); }
        catch (Throwable t) {
            boolean ok = type.isInstance(t) && code.equals(t.getMessage());
            if (ok) System.out.println("  PASS  " + label);
            else { failures++; System.out.println("  FAIL  " + label + " expected=" + type.getSimpleName() + ":" + code + " actual=" + t.getClass().getSimpleName() + ":" + t.getMessage()); }
        }
    }
    private static void ok(String label, boolean condition) { checks++; if (condition) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label); } }
    private static void eq(String label, Object expected, Object actual) { checks++; if (expected == null ? actual == null : expected.equals(actual)) System.out.println("  PASS  " + label); else { failures++; System.out.println("  FAIL  " + label + " expected=" + expected + " actual=" + actual); } }
}
