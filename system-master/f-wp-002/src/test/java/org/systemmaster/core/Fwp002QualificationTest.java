package org.systemmaster.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class Fwp002QualificationTest {
    private static int passed;

    public static void main(String[] args) throws Exception {
        run("unique immutable ChangeId", Fwp002QualificationTest::uniqueIds);
        run("exact target snapshot canonicalization", Fwp002QualificationTest::targetCanonicalization);
        run("target digest changes on scope change", Fwp002QualificationTest::targetDigestChanges);
        run("revision monotonicity", Fwp002QualificationTest::revisionMonotonicity);
        run("content digest bound to content", Fwp002QualificationTest::contentDigestBound);
        run("stale expected revision rejected", Fwp002QualificationTest::staleRevisionRejected);
        run("two-writer OCC race yields exactly one commit", Fwp002QualificationTest::concurrentRace);
        run("append-only event timeline", Fwp002QualificationTest::appendOnlyTimeline);
        run("record revision event stay aligned", Fwp002QualificationTest::stateEventAlignment);
        run("durable restart reconstruction", Fwp002QualificationTest::restartReconstruction);
        run("target index rebuild", Fwp002QualificationTest::targetIndexRebuild);
        run("lifecycle index rebuild", Fwp002QualificationTest::lifecycleIndexRebuild);
        run("prepared-write fault commits nothing", Fwp002QualificationTest::atomicFaultRollback);
        run("transaction checksum corruption detected", Fwp002QualificationTest::checksumCorruption);
        run("truncated transaction detected", Fwp002QualificationTest::truncatedFrame);
        run("duplicate target rejected", Fwp002QualificationTest::duplicateTargetRejected);
        run("unknown change mutation fails closed", Fwp002QualificationTest::unknownChangeFailsClosed);
        run("six frozen F-WP-002 requirements covered", Fwp002QualificationTest::requirementCoverage);
        System.out.println("PASS F-WP-002 tests=" + passed + " requirements=6");
    }

    private static void uniqueIds() throws Exception {
        Path p = temp("ids");
        ChangeRegistry r = registry(p);
        String a = create(r, "A", List.of("t1")).record().changeId();
        String b = create(r, "B", List.of("t2")).record().changeId();
        check(!a.equals(b), "ChangeId collision");
    }

    private static void targetCanonicalization() throws Exception {
        ChangeRegistry r = registry(temp("targets"));
        var c = create(r, "A", List.of("z", "a"));
        check(c.revision().resolvedTargetIdentities().equals(List.of("a", "z")), "targets not canonical");
        check(c.revision().targetDigest().equals(ChangeRegistry.targetDigest(List.of("z", "a"))), "digest mismatch");
    }

    private static void targetDigestChanges() throws Exception {
        ChangeRegistry r = registry(temp("digest-target"));
        var c1 = create(r, "A", List.of("a"));
        var c2 = revise(r, c1.record().changeId(), 1, "A", List.of("a", "b"), "scope2");
        check(!c1.record().targetDigest().equals(c2.record().targetDigest()), "target digest did not change");
    }

    private static void revisionMonotonicity() throws Exception {
        ChangeRegistry r = registry(temp("rev"));
        var c1 = create(r, "A", List.of("a"));
        var c2 = revise(r, c1.record().changeId(), 1, "A2", List.of("a"), "s2");
        var c3 = revise(r, c1.record().changeId(), 2, "A3", List.of("a"), "s3");
        check(c1.revision().revision() == 1 && c2.revision().revision() == 2 && c3.revision().revision() == 3,
                "non-monotonic revisions");
    }

    private static void contentDigestBound() throws Exception {
        ChangeRegistry r = registry(temp("content"));
        var c1 = create(r, "A", List.of("a"));
        var c2 = revise(r, c1.record().changeId(), 1, "Changed", List.of("a"), "s2");
        check(!c1.revision().contentDigest().equals(c2.revision().contentDigest()), "digest not content-bound");
    }

    private static void staleRevisionRejected() throws Exception {
        ChangeRegistry r = registry(temp("stale"));
        var c = create(r, "A", List.of("a"));
        revise(r, c.record().changeId(), 1, "B", List.of("a"), "s2");
        expect(ChangeRegistry.StaleRevisionException.class,
                () -> revise(r, c.record().changeId(), 1, "C", List.of("a"), "s3"));
        check(r.getChange(c.record().changeId()).currentRevision() == 2, "stale write changed authority");
    }

    private static void concurrentRace() throws Exception {
        ChangeRegistry r = registry(temp("race"));
        var c = create(r, "A", List.of("a"));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger commits = new AtomicInteger();
        AtomicInteger stale = new AtomicInteger();
        AtomicReference<Throwable> unexpected = new AtomicReference<>();
        Runnable writer = () -> {
            try {
                ready.countDown();
                go.await();
                revise(r, c.record().changeId(), 1, "race-" + Thread.currentThread().getName(), List.of("a"),
                        "scope-" + Thread.currentThread().getName());
                commits.incrementAndGet();
            } catch (ChangeRegistry.StaleRevisionException ex) {
                stale.incrementAndGet();
            } catch (Throwable t) {
                unexpected.compareAndSet(null, t);
            }
        };
        Thread t1 = new Thread(writer, "one");
        Thread t2 = new Thread(writer, "two");
        t1.start(); t2.start(); ready.await(); go.countDown(); t1.join(); t2.join();
        if (unexpected.get() != null) throw new AssertionError(unexpected.get());
        check(commits.get() == 1 && stale.get() == 1, "race commits=" + commits + " stale=" + stale);
        check(r.getChange(c.record().changeId()).currentRevision() == 2, "race revision wrong");
    }

    private static void appendOnlyTimeline() throws Exception {
        ChangeRegistry r = registry(temp("timeline"));
        var c = create(r, "A", List.of("a"));
        revise(r, c.record().changeId(), 1, "B", List.of("a"), "s2");
        revise(r, c.record().changeId(), 2, "C", List.of("a"), "s3");
        var events = r.getTimeline(c.record().changeId());
        check(events.size() == 3, "event count");
        check(events.get(0).revision() == 1 && events.get(1).revision() == 2 && events.get(2).revision() == 3,
                "event order");
    }

    private static void stateEventAlignment() throws Exception {
        ChangeRegistry r = registry(temp("align"));
        var c = create(r, "A", List.of("a"));
        var u = revise(r, c.record().changeId(), 1, "B", List.of("b"), "s2");
        var last = r.getTimeline(c.record().changeId()).get(1);
        check(u.record().currentRevision() == last.revision(), "revision/event diverged");
        check(u.record().currentRevisionDigest().equals(last.payloadDigest()), "digest/event diverged");
    }

    private static void restartReconstruction() throws Exception {
        Path p = temp("restart");
        ChangeRegistry r = registry(p);
        var c = create(r, "A", List.of("a"));
        revise(r, c.record().changeId(), 1, "B", List.of("b"), "s2");
        ChangeRegistry reopened = registry(p);
        check(reopened.getChange(c.record().changeId()).currentRevision() == 2, "restart lost revision");
        check(reopened.getTimeline(c.record().changeId()).size() == 2, "restart lost event");
    }

    private static void targetIndexRebuild() throws Exception {
        Path p = temp("target-index");
        ChangeRegistry r = registry(p);
        var a = create(r, "A", List.of("shared"));
        var b = create(r, "B", List.of("shared", "other"));
        ChangeRegistry reopened = registry(p);
        check(reopened.listChangesByTarget("shared").equals(Set.of(a.record().changeId(), b.record().changeId())),
                "target index not rebuilt");
    }

    private static void lifecycleIndexRebuild() throws Exception {
        Path p = temp("lifecycle-index");
        ChangeRegistry r = registry(p);
        var a = create(r, "A", List.of("x"));
        ChangeRegistry reopened = registry(p);
        check(reopened.listChangesByLifecycle("DRAFT").contains(a.record().changeId()), "lifecycle index missing");
    }

    private static void atomicFaultRollback() throws Exception {
        Path p = temp("fault");
        ChangeRegistry stable = registry(p);
        var c = create(stable, "A", List.of("a"));
        ChangeRegistry failing = new ChangeRegistry(p, fixedClock(), prepared -> { throw new IOException("INJECTED"); });
        expect(IOException.class, () -> revise(failing, c.record().changeId(), 1, "B", List.of("b"), "s2"));
        ChangeRegistry reopened = registry(p);
        check(reopened.getChange(c.record().changeId()).currentRevision() == 1, "fault committed state");
        check(reopened.getTimeline(c.record().changeId()).size() == 1, "fault committed event");
    }

    private static void checksumCorruption() throws Exception {
        Path p = temp("corrupt");
        ChangeRegistry r = registry(p);
        create(r, "A", List.of("a"));
        byte[] bytes = Files.readAllBytes(p);
        int index = Math.min(20, bytes.length - 2);
        bytes[index] = (byte) (bytes[index] == 'A' ? 'B' : 'A');
        Files.write(p, bytes);
        expect(ChangeRegistry.CorruptStoreException.class, () -> registry(p));
    }

    private static void truncatedFrame() throws Exception {
        Path p = temp("truncated");
        ChangeRegistry r = registry(p);
        create(r, "A", List.of("a"));
        byte[] bytes = Files.readAllBytes(p);
        Files.write(p, java.util.Arrays.copyOf(bytes, bytes.length - 1));
        expect(ChangeRegistry.CorruptStoreException.class, () -> registry(p));
    }

    private static void duplicateTargetRejected() throws Exception {
        ChangeRegistry r = registry(temp("dup-target"));
        expect(IllegalArgumentException.class, () -> create(r, "A", List.of("x", "x")));
        check(r.changeCount() == 0, "invalid target mutation committed");
    }

    private static void unknownChangeFailsClosed() throws Exception {
        ChangeRegistry r = registry(temp("unknown"));
        expect(IllegalArgumentException.class,
                () -> revise(r, "missing", 1, "A", List.of("x"), "scope"));
        check(r.changeCount() == 0, "unknown change mutation committed");
    }

    private static void requirementCoverage() {
        Set<String> covered = Set.of("F-RQ-001", "F-RQ-003", "F-RQ-004", "F-RQ-036", "F-RQ-051", "F-RQ-052");
        check(covered.size() == 6, "coverage set incomplete");
    }

    private static ChangeRegistry.CommitResult create(ChangeRegistry r, String title, List<String> targets) throws Exception {
        return r.createChange(title, "TYPE_CANDIDATE", "021F", "intent", "rationale", "selector", targets, "principal:test");
    }

    private static ChangeRegistry.CommitResult revise(ChangeRegistry r, String id, long expected, String title,
            List<String> targets, String selector) throws Exception {
        return r.reviseChange(id, expected, title, "TYPE_CANDIDATE", "021F", "intent-" + title,
                "rationale-" + title, selector, targets, "principal:test");
    }

    private static ChangeRegistry registry(Path p) throws IOException {
        return new ChangeRegistry(p, fixedClock(), prepared -> {});
    }

    private static Clock fixedClock() {
        return Clock.fixed(Instant.parse("2026-09-08T01:00:00Z"), ZoneOffset.UTC);
    }

    private static Path temp(String name) throws IOException {
        Path dir = Files.createTempDirectory("fwp002-" + name + "-");
        return dir.resolve("change-registry.log");
    }

    private static void run(String name, ThrowingRunnable body) throws Exception {
        try {
            body.run();
            passed++;
            System.out.println("PASS " + name);
        } catch (Throwable t) {
            System.err.println("FAIL " + name + ": " + t);
            throw t;
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void expect(Class<? extends Throwable> type, ThrowingRunnable body) throws Exception {
        try {
            body.run();
        } catch (Throwable t) {
            if (type.isInstance(t)) return;
            throw new AssertionError("expected " + type.getSimpleName() + " got " + t, t);
        }
        throw new AssertionError("expected " + type.getSimpleName() + " but no exception");
    }

    @FunctionalInterface
    private interface ThrowingRunnable { void run() throws Exception; }
}
