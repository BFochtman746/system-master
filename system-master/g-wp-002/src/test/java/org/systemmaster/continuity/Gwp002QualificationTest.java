package org.systemmaster.continuity;

import org.systemmaster.continuity.DurableWorkIdentityRegistry.IdentityConflictException;
import org.systemmaster.continuity.DurableWorkIdentityRegistry.InvalidLineageException;
import org.systemmaster.continuity.DurableWorkIdentityRegistry.RegistrationResult;
import org.systemmaster.continuity.RecoveryRecord.RecoveryState;
import org.systemmaster.continuity.RecoveryRegistry.InvalidRecoveryTransitionException;
import org.systemmaster.continuity.RecoveryRegistry.RecoveryConflictException;
import org.systemmaster.continuity.RecoveryRegistry.StaleRecoveryVersionException;
import org.systemmaster.continuity.RecoveryRegistry.TransientLocalTransactionException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

public final class Gwp002QualificationTest {
    private static int tests;

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("gwp002-qualification-");
        DurableWorkIdentityRegistry ids = new DurableWorkIdentityRegistry(root);
        RecoveryRegistry recoveries = new RecoveryRegistry(root);

        check(ids.registerDurableWorkIdentity("task-1","wf-1","stage-1","work-root","intent-a","owner-a") == RegistrationResult.CREATED, "identity create");
        DurableWorkIdentity rootIdentity = ids.get("work-root").orElseThrow();
        check(rootIdentity.workUnitId().equals("work-root"), "stable work identity");
        check(rootIdentity.taskId().equals("task-1") && rootIdentity.workflowId().equals("wf-1") && rootIdentity.stageId().equals("stage-1"), "lineage fields persisted");
        check(rootIdentity.parentWorkUnitId() == null, "root has no parent");
        check(ids.registerDurableWorkIdentity("task-1","wf-1","stage-1","work-root","intent-a","owner-a") == RegistrationResult.IDEMPOTENT_EXISTING, "identity idempotency");
        expect(IdentityConflictException.class, () -> ids.registerDurableWorkIdentity("task-1","wf-1","stage-1","work-root","intent-b","owner-a"));
        expect(IdentityConflictException.class, () -> ids.registerDurableWorkIdentity("task-1","wf-1","stage-1","work-root","intent-a","owner-b"));
        expect(InvalidLineageException.class, () -> ids.registerDurableWorkIdentity("task-1","wf-1","stage-2","orphan","missing","intent-o","owner-a","LOW"));
        check(ids.registerDurableWorkIdentity("task-1","wf-1","stage-2","work-child","work-root","intent-c","owner-a","HIGH") == RegistrationResult.CREATED, "child identity create");
        DurableWorkIdentity child = ids.get("work-child").orElseThrow();
        check("work-root".equals(child.parentWorkUnitId()), "parent lineage persisted");
        expect(InvalidLineageException.class, () -> ids.registerDurableWorkIdentity("task-2","wf-2","stage-2","bad-child","work-root","intent-x","owner-a","LOW"));
        check(ids.size() == 2, "identity conflicts do not mutate authority");

        DurableWorkIdentityRegistry idsAfterRestart = new DurableWorkIdentityRegistry(root);
        check(idsAfterRestart.get("work-child").orElseThrow().parentWorkUnitId().equals("work-root"), "identity replay after restart");
        check(idsAfterRestart.get("work-root").orElseThrow().intentDigest().equals("intent-a"), "identity intent replay");

        expect(RecoveryConflictException.class, () -> new RecoveryRegistry(Files.createTempDirectory("gwp002-no-id-")).openRecovery("missing", 1, "interrupt-x"));
        RecoveryRegistry.OpenResult opened = recoveries.openRecovery("work-child", 7, "interrupt-1");
        check(!opened.idempotentExisting(), "recovery opened");
        check(opened.record().state() == RecoveryState.DETECTED, "open state detected");
        check(opened.record().version() == 1 && opened.record().recoveryEpoch() == 1, "open version and epoch");
        check(recoveries.getRecoveryEvents(opened.record().recoveryId()).size() == 1, "open event append");
        check(recoveries.openRecovery("work-child", 7, "interrupt-1").idempotentExisting(), "open idempotency");
        expect(RecoveryConflictException.class, () -> recoveries.openRecovery("work-child", 7, "interrupt-2"));

        RecoveryRegistry.RecoveryStatus status = recoveries.getRecoveryStatus("work-child");
        check(status.recoveryState() == RecoveryState.DETECTED && status.evidenceFreshness().equals("AUTHORITATIVE_CURRENT"), "status derives durable truth");
        check(recoveries.getRecoveryStatus("work-root").userVisibleState().equals("UNAVAILABLE"), "query never fabricates missing recovery");

        String rid = opened.record().recoveryId();
        RecoveryRecord classifying = recoveries.transitionRecovery(rid, 1, RecoveryState.DETECTED, RecoveryState.CLASSIFYING, "classify", List.of("ev-1"), "cmd-1");
        check(classifying.version() == 2 && classifying.state() == RecoveryState.CLASSIFYING, "valid transition increments version");
        check(recoveries.getRecoveryEvents(rid).size() == 2, "transition appends event");
        expect(StaleRecoveryVersionException.class, () -> recoveries.transitionRecovery(rid, 1, RecoveryState.CLASSIFYING, RecoveryState.PLAN_READY, "stale", List.of(), "cmd-stale"));
        check(recoveries.getRecovery(rid).orElseThrow().version() == 2 && recoveries.getRecoveryEvents(rid).size() == 2, "stale transition side-effect free");
        expect(InvalidRecoveryTransitionException.class, () -> recoveries.transitionRecovery(rid, 2, RecoveryState.DETECTED, RecoveryState.CLASSIFYING, "wrong from", List.of(), "cmd-wrong-from"));
        expect(InvalidRecoveryTransitionException.class, () -> recoveries.transitionRecovery(rid, 2, RecoveryState.CLASSIFYING, RecoveryState.RECOVERED, "illegal", List.of(), "cmd-illegal"));

        RecoveryRecord waiting = recoveries.transitionRecovery(rid, 2, RecoveryState.CLASSIFYING, RecoveryState.WAITING_DEPENDENCY, "dependency unavailable", List.of(), "cmd-wait");
        check(waiting.state() == RecoveryState.WAITING_DEPENDENCY && recoveries.getRecoveryStatus("work-child").userVisibleState().equals("WAITING"), "waiting distinct");
        RecoveryRecord reclassifying = recoveries.transitionRecovery(rid, 3, RecoveryState.WAITING_DEPENDENCY, RecoveryState.CLASSIFYING, "dependency restored", List.of(), "cmd-reclassify");
        check(reclassifying.state() == RecoveryState.CLASSIFYING, "waiting can resume classification");
        RecoveryRecord plan = recoveries.transitionRecovery(rid, 4, RecoveryState.CLASSIFYING, RecoveryState.PLAN_READY, "plan", List.of(), "cmd-plan");
        check(plan.state() == RecoveryState.PLAN_READY, "plan ready state");
        RecoveryRecord blocked = recoveries.transitionRecovery(rid, 5, RecoveryState.PLAN_READY, RecoveryState.BLOCKED, "policy blocker", List.of(), "cmd-block");
        check(blocked.state() == RecoveryState.BLOCKED && recoveries.getRecoveryStatus("work-child").blockers().equals(List.of("policy blocker")), "blocked distinct with reason");
        RecoveryRecord manual = recoveries.transitionRecovery(rid, 6, RecoveryState.BLOCKED, RecoveryState.MANUAL_DECISION, "operator decision", List.of(), "cmd-manual");
        check(manual.state() == RecoveryState.MANUAL_DECISION && recoveries.getRecoveryStatus("work-child").userVisibleState().equals("MANUAL_DECISION"), "manual distinct");
        RecoveryRecord quarantined = recoveries.transitionRecovery(rid, 7, RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, "integrity uncertainty", List.of(), "cmd-quarantine");
        check(quarantined.state() == RecoveryState.QUARANTINED && recoveries.getRecoveryStatus("work-child").userVisibleState().equals("QUARANTINED"), "quarantine distinct");
        RecoveryRecord terminal = recoveries.transitionRecovery(rid, 8, RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, "adjudicated terminal", List.of("ev-terminal"), "cmd-terminal");
        check(terminal.state() == RecoveryState.TERMINAL_FAILED && recoveries.getRecoveryStatus("work-child").userVisibleState().equals("TERMINAL"), "terminal distinct");
        expect(InvalidRecoveryTransitionException.class, () -> recoveries.transitionRecovery(rid, 9, RecoveryState.TERMINAL_FAILED, RecoveryState.CLASSIFYING, "resurrect", List.of(), "cmd-resurrect"));

        RecoveryRegistry.OpenResult secondEpoch = recoveries.openRecovery("work-child", 8, "interrupt-2");
        check(secondEpoch.record().recoveryEpoch() == 2 && secondEpoch.record().version() == 1, "new epoch after terminal");

        AtomicInteger injected = new AtomicInteger();
        RecoveryRecord retryResult = recoveries.transitionRecoveryWithLocalRetry(secondEpoch.record().recoveryId(), 1,
                RecoveryState.DETECTED, RecoveryState.CLASSIFYING, "retry-local", List.of("ev-retry"), "cmd-retry", 2,
                attempt -> { if (injected.getAndIncrement() == 0) throw new TransientLocalTransactionException("serialization retry"); });
        check(retryResult.version() == 2 && injected.get() == 2, "safe local transaction retry");
        check(recoveries.getRecoveryEvents(secondEpoch.record().recoveryId()).size() == 2, "retry does not duplicate event");
        RecoveryRecord idem = recoveries.transitionRecovery(secondEpoch.record().recoveryId(), 1, RecoveryState.DETECTED, RecoveryState.CLASSIFYING,
                "retry-local", List.of("ev-retry"), "cmd-retry");
        check(idem.version() == 2 && recoveries.getRecoveryEvents(secondEpoch.record().recoveryId()).size() == 2, "command idempotency after commit");
        expect(RecoveryConflictException.class, () -> recoveries.transitionRecovery(secondEpoch.record().recoveryId(), 2, RecoveryState.CLASSIFYING, RecoveryState.PLAN_READY,
                "changed payload", List.of(), "cmd-retry"));

        ids.registerDurableWorkIdentity("task-c","wf-c","stage-c","work-concurrent","intent-concurrent","owner-c");
        RecoveryRegistry.OpenResult concurrentOpen = recoveries.openRecovery("work-concurrent", 1, "interrupt-c");
        String concurrentRid = concurrentOpen.record().recoveryId();
        int workers = 16;
        ExecutorService pool = Executors.newFixedThreadPool(workers);
        CountDownLatch ready = new CountDownLatch(workers), go = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();
        for (int n=0;n<workers;n++) {
            final int idx=n;
            futures.add(pool.submit(() -> {
                ready.countDown(); go.await();
                try {
                    recoveries.transitionRecovery(concurrentRid, 1, RecoveryState.DETECTED, RecoveryState.CLASSIFYING,
                            "race", List.of("worker-"+idx), "race-"+idx);
                    return true;
                } catch (StaleRecoveryVersionException | InvalidRecoveryTransitionException e) { return false; }
            }));
        }
        ready.await(); go.countDown();
        int winners=0; for (Future<Boolean> f:futures) if (f.get()) winners++;
        pool.shutdownNow();
        check(winners == 1, "OCC admits exactly one concurrent winner");
        check(recoveries.getRecovery(concurrentRid).orElseThrow().version() == 2, "concurrency produces one version increment");
        check(recoveries.getRecoveryEvents(concurrentRid).size() == 2, "concurrency produces one event");

        RecoveryRegistry afterRestart = new RecoveryRegistry(root);
        check(afterRestart.getRecovery(secondEpoch.record().recoveryId()).orElseThrow().version() == 2, "recovery replay after restart");
        check(afterRestart.getRecoveryEvents(secondEpoch.record().recoveryId()).size() == 2, "event replay after restart");
        check(afterRestart.getRecoveryStatus("work-concurrent").recoveryState() == RecoveryState.CLASSIFYING, "status survives restart");

        Path corruptRoot = Files.createTempDirectory("gwp002-corrupt-");
        DurableWorkIdentityRegistry corruptIds = new DurableWorkIdentityRegistry(corruptRoot);
        corruptIds.registerDurableWorkIdentity("t","w","s","u","intent","owner");
        Path journal = corruptRoot.resolve("continuity.journal");
        byte[] bytes = Files.readAllBytes(journal);
        Files.write(journal, java.util.Arrays.copyOf(bytes, bytes.length - 1), StandardOpenOption.TRUNCATE_EXISTING);
        expect(ContinuityJournal.CorruptJournalException.class, () -> new DurableWorkIdentityRegistry(corruptRoot).size());

        check(Files.size(root.resolve("continuity.journal")) > 0, "durable journal materialized");
        System.out.println("PASS G-WP-002 tests=" + tests + " requirements=6");
    }

    private static void check(boolean condition, String message) {
        tests++;
        if (!condition) throw new AssertionError("FAIL " + tests + ": " + message);
    }

    private static void expect(Class<? extends Throwable> type, ThrowingRunnable body) {
        tests++;
        try { body.run(); }
        catch (Throwable t) { if (type.isInstance(t)) return; throw new AssertionError("FAIL " + tests + ": expected " + type.getSimpleName() + " got " + t, t); }
        throw new AssertionError("FAIL " + tests + ": expected " + type.getSimpleName());
    }

    @FunctionalInterface private interface ThrowingRunnable { void run() throws Exception; }
}
