package org.systemmaster.foundation.root;

import org.systemmaster.foundation.root.SystemRootStore.RootSnapshot;

import static org.systemmaster.foundation.root.SystemAuthority.*;
import static org.systemmaster.foundation.root.SystemRootRegistry.*;
import static org.systemmaster.foundation.root.SystemRootGuards.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class SystemRootQualificationTest {
    private static int tests;
    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-12T03:30:00Z"), ZoneOffset.UTC);

    public static void main(String[] args) throws Exception {
        testCanonicalCatalogIsCompleteAndCollisionFree();
        testCanonicalEncodingIsUnambiguous();
        testBootstrapPersistsCanonicalRosterAndRootAdmission();
        testIdempotentReplayAndOperationCollision();
        testMutationAuthorizationFailsClosed();
        testAdmissionVerificationFailsClosed();
        testTruthOwnerCollisionRejected();
        testVersionAdmissionAndStaleGeneration();
        testDrainResumeAndRetireLifecycle();
        testTopologyRulesAndRetirementCleanup();
        testAtomicReplacementTransfersAuthority();
        testRootIdentityCannotRetire();
        testCrashBeforeDurableAppendPreservesPriorTruth();
        testTornTailRecovery();
        testLosslessJournalCompaction();
        testCorruptStoreFailsClosed();
        testConcurrentWritersConvergeWithoutLostUpdate();
        testCrossProcessWritersConvergeWithoutLostUpdate();
        testClockRegressionFailsClosed();
        testSnapshotDigestStableAcrossReload();
        System.out.println("PASS SYSTEM-ROOT tests=" + tests);
    }

    private static void testCanonicalCatalogIsCompleteAndCollisionFree() {
        List<Descriptor> all = FoundationAuthorityCatalog.canonical();
        check(all.size() == 27, "expected 26 Foundation systems plus Creative Fabric");
        Set<String> ids = new HashSet<>();
        Set<String> truths = new HashSet<>();
        for (Descriptor d : all) {
            check(ids.add(d.systemId()), "duplicate system id " + d.systemId());
            for (String truth : d.ownedTruthKeys()) check(truths.add(truth), "duplicate truth key " + truth);
        }
        check(ids.contains("system-root"), "system-root missing");
        check(ids.contains("creative-fabric"), "creative-fabric missing");
        pass();
    }


    private static void testCanonicalEncodingIsUnambiguous() {
        Descriptor a = new Descriptor("canon-a", "A|B", "C", AuthorityKind.FOUNDATION_SHARED,
                Set.of("canon.a.truth"), Set.of("N|1"));
        Descriptor b = new Descriptor("canon-a", "A", "B|C", AuthorityKind.FOUNDATION_SHARED,
                Set.of("canon.a.truth"), Set.of("N|1"));
        check(!a.canonical().equals(b.canonical()), "length framing prevents delimiter ambiguity");
        TopologyEdge e1 = new TopologyEdge("canon-a", "system-root", EdgeKind.OPTIONAL_DEPENDENCY, "x|y");
        TopologyEdge e2 = new TopologyEdge("canon-a", "system-root", EdgeKind.OPTIONAL_DEPENDENCY, "x|y|z");
        check(!e1.canonical().equals(e2.canonical()), "topology canonical identity is unambiguous");
        pass();
    }

    private static void testBootstrapPersistsCanonicalRosterAndRootAdmission() throws Exception {
        Harness h = harness();
        MutationResult result = h.registry.bootstrap(FoundationAuthorityCatalog.canonical(), rootVersion(), rootBasis(),
                "principal:bootstrap", "decision:architecture-lock", "op:bootstrap");
        check(!result.replayed(), "first bootstrap cannot be replay");
        check(result.snapshot().storeRevision() == 1, "bootstrap revision");
        check(result.snapshot().systems().size() == 27, "bootstrap roster size");
        SystemAuthority.Record root = result.snapshot().systems().get("system-root");
        check(root.lifecycle() == Lifecycle.ADMITTED, "root admitted");
        check(root.currentVersion().equals(rootVersion()), "root version current");
        check(result.snapshot().systems().get("identity-delegation").lifecycle() == Lifecycle.DECLARED,
                "non-root systems declared but not falsely admitted");
        check(h.registry.authorityForTruth("foundation.topology").orElseThrow().equals("system-root"),
                "truth owner query");

        SystemRootRegistry reloaded = registry(new FileSystemRootStore(h.path));
        check(reloaded.snapshot().systems().size() == 27, "restart reconstruction");
        check(reloaded.snapshot().events().size() == 1, "event reconstruction");
        pass();
    }

    private static void testIdempotentReplayAndOperationCollision() throws Exception {
        Harness h = bootstrappedHarness();
        Descriptor extra = descriptor("diagnostic-service", "diag.truth");
        MutationResult first = h.registry.declare(extra, "principal:op", "decision:declare", "op:declare-diag");
        MutationResult replay = h.registry.declare(extra, "principal:op", "decision:declare", "op:declare-diag");
        check(replay.replayed(), "same operation should replay");
        check(replay.snapshot().storeRevision() == first.snapshot().storeRevision(), "replay cannot advance revision");
        expect(OperationIdConflictException.class,
                () -> h.registry.declare(descriptor("other-service", "other.truth"),
                        "principal:op", "decision:declare", "op:declare-diag"));
        expect(OperationIdConflictException.class,
                () -> h.registry.declare(extra, "principal:other", "decision:declare", "op:declare-diag"));
        SystemRootRegistry restarted = registry(new FileSystemRootStore(h.path));
        MutationResult restartReplay = restarted.declare(extra, "principal:op", "decision:declare", "op:declare-diag");
        check(restartReplay.replayed(), "idempotency receipt survives process reconstruction");
        check(restartReplay.snapshot().storeRevision() == first.snapshot().storeRevision(), "restart replay cannot advance revision");
        pass();
    }


    private static void testMutationAuthorizationFailsClosed() throws Exception {
        Path dir = Files.createTempDirectory("system-root-authz-");
        Path path = dir.resolve("root.store");
        SystemRootRegistry denied = new SystemRootRegistry(
                new FileSystemRootStore(path), ignored -> false, ignored -> true, CLOCK);
        expect(MutationAuthorizationException.class,
                () -> denied.bootstrap(FoundationAuthorityCatalog.canonical(), rootVersion(), rootBasis(),
                        "principal:denied", "decision:denied", "op:denied"));
        check(denied.snapshot().storeRevision() == 0, "denied mutation cannot persist");
        pass();
    }

    private static void testAdmissionVerificationFailsClosed() throws Exception {
        Path dir = Files.createTempDirectory("system-root-admission-");
        Path path = dir.resolve("root.store");
        SystemRootRegistry deniedBootstrap = new SystemRootRegistry(
                new FileSystemRootStore(path), ignored -> true, ignored -> false, CLOCK);
        expect(AdmissionVerificationException.class,
                () -> deniedBootstrap.bootstrap(FoundationAuthorityCatalog.canonical(), rootVersion(), rootBasis(),
                        "principal:p", "decision:d", "op:bootstrap-denied"));
        check(deniedBootstrap.snapshot().storeRevision() == 0, "rejected bootstrap admission cannot persist");

        Harness h = bootstrappedHarness();
        SystemRootRegistry deniedAdmission = new SystemRootRegistry(
                new FileSystemRootStore(h.path), ignored -> true, request -> request.bootstrap(), CLOCK);
        expect(AdmissionVerificationException.class,
                () -> deniedAdmission.admitVersion("identity-delegation", 1, version("1.0.0", 'c'), basis("identity"),
                        "principal:p", "decision:d", "op:admission-denied"));
        check(deniedAdmission.snapshot().systems().get("identity-delegation").lifecycle() == Lifecycle.DECLARED,
                "rejected admission leaves declaration unchanged");
        pass();
    }

    private static void testTruthOwnerCollisionRejected() throws Exception {
        Harness h = bootstrappedHarness();
        Descriptor duplicate = new Descriptor("duplicate-root", "Duplicate Root", "Bad duplicate authority",
                AuthorityKind.FOUNDATION_CONTROL, Set.of("foundation.topology"), Set.of("Does not own anything else"));
        expect(AuthorityConflictException.class,
                () -> h.registry.declare(duplicate, "principal:test", "decision:test", "op:collision"));
        check(h.registry.snapshot().storeRevision() == 1, "rejected collision must not mutate");
        pass();
    }

    private static void testVersionAdmissionAndStaleGeneration() throws Exception {
        Harness h = bootstrappedHarness();
        MutationResult admitted = h.registry.admitVersion("identity-delegation", 1, version("1.0.0", 'c'), basis("identity"),
                "principal:release", "decision:release", "op:admit-identity");
        SystemAuthority.Record record = admitted.snapshot().systems().get("identity-delegation");
        check(record.lifecycle() == Lifecycle.ADMITTED, "identity admitted");
        check(record.generation() == 2, "generation advanced");
        check(admitted.snapshot().versionHistory().get("identity-delegation").size() == 1, "version history appended");
        expect(StaleAuthorityGenerationException.class,
                () -> h.registry.admitVersion("identity-delegation", 1, version("1.1.0", 'd'), basis("identity2"),
                        "principal:release", "decision:release2", "op:stale-admit"));
        pass();
    }

    private static void testDrainResumeAndRetireLifecycle() throws Exception {
        Harness h = bootstrappedHarness();
        h.registry.admitVersion("identity-delegation", 1, version("1.0.0", 'c'), basis("identity"),
                "principal:p", "decision:a", "op:a");
        MutationResult draining = h.registry.beginDrain("identity-delegation", 2, "principal:p", "decision:d", "op:d");
        check(draining.snapshot().systems().get("identity-delegation").lifecycle() == Lifecycle.DRAINING, "draining");
        MutationResult resumed = h.registry.resumeFromDrain("identity-delegation", 3, "principal:p", "decision:r", "op:r");
        check(resumed.snapshot().systems().get("identity-delegation").lifecycle() == Lifecycle.ADMITTED, "resumed");
        h.registry.beginDrain("identity-delegation", 4, "principal:p", "decision:d2", "op:d2");
        MutationResult retired = h.registry.retire("identity-delegation", 5, "principal:p", "decision:retire", "op:retire");
        check(retired.snapshot().systems().get("identity-delegation").lifecycle() == Lifecycle.RETIRED, "retired");
        expect(IllegalLifecycleTransitionException.class,
                () -> h.registry.admitVersion("identity-delegation", 6, version("2.0.0", 'e'), basis("x"),
                        "principal:p", "decision:x", "op:x"));
        pass();
    }

    private static void testTopologyRulesAndRetirementCleanup() throws Exception {
        Harness h = bootstrappedHarness();
        TopologyEdge edge = new TopologyEdge("planning-orchestration", "intent-keel", EdgeKind.REQUIRED_DEPENDENCY,
                "Plans are bound to governed goal revisions");
        h.registry.putTopologyEdge(edge, "principal:arch", "decision:topology", "op:edge");
        check(h.registry.snapshot().topology().contains(edge), "edge added");
        expect(AuthorityConflictException.class,
                () -> h.registry.putTopologyEdge(edge, "principal:arch", "decision:topology", "op:edge-duplicate"));

        h.registry.admitVersion("intent-keel", 1, version("1.0.0", 'f'), basis("keel"),
                "principal:p", "decision:a", "op:keel-admit");
        h.registry.beginDrain("intent-keel", 2, "principal:p", "decision:d", "op:keel-drain");
        h.registry.retire("intent-keel", 3, "principal:p", "decision:r", "op:keel-retire");
        check(!h.registry.snapshot().topology().contains(edge), "retirement removes active topology edge");
        expect(AuthorityConflictException.class,
                () -> h.registry.putTopologyEdge(edge, "principal:arch", "decision:topology", "op:edge-retired"));
        pass();
    }

    private static void testAtomicReplacementTransfersAuthority() throws Exception {
        Harness h = bootstrappedHarness();
        Descriptor old = descriptor("legacy-service", "legacy.truth");
        h.registry.declare(old, "principal:p", "decision:declare", "op:legacy-declare");
        h.registry.admitVersion("legacy-service", 1, version("1.0.0", '1'), basis("legacy"),
                "principal:p", "decision:admit", "op:legacy-admit");
        h.registry.beginDrain("legacy-service", 2, "principal:p", "decision:drain", "op:legacy-drain");
        Descriptor replacement = descriptor("replacement-service", "legacy.truth");
        MutationResult result = h.registry.replaceAuthority("legacy-service", 3, replacement,
                version("2.0.0", '2'), basis("replacement"), "principal:p", "decision:replace", "op:replace");
        check(result.snapshot().systems().get("legacy-service").lifecycle() == Lifecycle.RETIRED, "old retired");
        check(result.snapshot().systems().get("legacy-service").replacementSystemId().equals("replacement-service"), "replacement lineage");
        check(result.snapshot().systems().get("replacement-service").lifecycle() == Lifecycle.ADMITTED, "replacement admitted");
        check(h.registry.authorityForTruth("legacy.truth").orElseThrow().equals("replacement-service"), "truth transferred atomically");
        pass();
    }

    private static void testRootIdentityCannotRetire() throws Exception {
        Harness h = bootstrappedHarness();
        expect(IllegalLifecycleTransitionException.class,
                () -> h.registry.retire("system-root", 1, "principal:p", "decision:bad", "op:bad"));
        expect(IllegalLifecycleTransitionException.class,
                () -> h.registry.beginDrain("system-root", 1, "principal:p", "decision:bad", "op:bad-drain"));
        pass();
    }

    private static void testCrashBeforeDurableAppendPreservesPriorTruth() throws Exception {
        Harness h = bootstrappedHarness();
        FileSystemRootStore failingStore = new FileSystemRootStore(h.path, (path, frame) -> {
            throw new IOException("SIMULATED_CRASH_BEFORE_DURABLE_APPEND");
        });
        SystemRootRegistry failing = registry(failingStore);
        expect(IOException.class,
                () -> failing.declare(descriptor("crash-service", "crash.truth"),
                        "principal:p", "decision:crash", "op:crash"));
        SystemRootRegistry recovered = registry(new FileSystemRootStore(h.path));
        check(recovered.snapshot().storeRevision() == 1, "failed pre-append write cannot advance authority");
        check(recovered.findSystem("crash-service").isEmpty(), "failed pre-append write cannot leak partial authority");
        pass();
    }


    private static void testTornTailRecovery() throws Exception {
        Harness h = bootstrappedHarness();
        long committedSize = Files.size(h.path);
        Files.write(h.path, "FRAME\t2\tTORN".getBytes(StandardCharsets.UTF_8), java.nio.file.StandardOpenOption.APPEND);
        SystemRootRegistry recovered = registry(new FileSystemRootStore(h.path));
        check(recovered.snapshot().storeRevision() == 1, "torn tail is uncommitted");
        recovered.declare(descriptor("after-torn", "after.torn"), "principal:p", "decision:r", "op:after-torn");
        check(recovered.snapshot().storeRevision() == 2, "writer truncates torn tail before append");
        check(Files.size(h.path) > committedSize, "new committed frame persisted after torn-tail repair");
        pass();
    }


    private static void testLosslessJournalCompaction() throws Exception {
        Harness h = bootstrappedHarness();
        for (int i = 0; i < 12; i++) {
            String id = "compact-" + i;
            h.registry.declare(descriptor(id, "compact.truth." + i), "principal:p", "decision:c", "op:compact-" + i);
        }
        String beforeDigest = h.registry.snapshotDigest();
        long beforeSize = Files.size(h.path);
        FileSystemRootStore store = new FileSystemRootStore(h.path);
        store.compact();
        long afterSize = Files.size(h.path);
        SystemRootRegistry reloaded = registry(new FileSystemRootStore(h.path));
        check(reloaded.snapshotDigest().equals(beforeDigest), "compaction preserves exact logical snapshot");
        check(reloaded.snapshot().storeRevision() == 13, "compaction preserves revision");
        check(reloaded.snapshot().operationReceipts().size() == 13, "compaction preserves idempotency receipts");
        MutationResult replay = reloaded.declare(descriptor("compact-0", "compact.truth.0"),
                "principal:p", "decision:c", "op:compact-0");
        check(replay.replayed(), "compacted receipt still prevents duplicate mutation");
        check(afterSize < beforeSize, "checkpoint compaction reduces journal size");
        pass();
    }

    private static void testCorruptStoreFailsClosed() throws Exception {
        Harness h = bootstrappedHarness();
        byte[] raw = Files.readAllBytes(h.path);
        for (int i = 0; i < raw.length; i++) {
            if (raw[i] == 'R') { raw[i] = 'Q'; break; }
        }
        Files.write(h.path, raw);
        expect(SystemRootStore.CorruptRootStoreException.class, () -> h.registry.snapshot());
        pass();
    }

    private static void testConcurrentWritersConvergeWithoutLostUpdate() throws Exception {
        Harness h = bootstrappedHarness();
        SystemRootRegistry a = registry(new FileSystemRootStore(h.path));
        SystemRootRegistry b = registry(new FileSystemRootStore(h.path));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<?> fa = pool.submit(() -> {
                await(start);
                try {
                    a.declare(descriptor("concurrent-a", "concurrent.a"), "principal:a", "decision:a", "op:concurrent-a");
                } catch (IOException e) { throw new RuntimeException(e); }
            });
            Future<?> fb = pool.submit(() -> {
                await(start);
                try {
                    b.declare(descriptor("concurrent-b", "concurrent.b"), "principal:b", "decision:b", "op:concurrent-b");
                } catch (IOException e) { throw new RuntimeException(e); }
            });
            start.countDown();
            fa.get();
            fb.get();
        } finally {
            pool.shutdownNow();
        }
        RootSnapshot finalState = h.registry.snapshot();
        check(finalState.storeRevision() == 3, "bootstrap plus two concurrent commits");
        check(finalState.systems().containsKey("concurrent-a") && finalState.systems().containsKey("concurrent-b"),
                "no lost concurrent update");
        pass();
    }


    private static void testCrossProcessWritersConvergeWithoutLostUpdate() throws Exception {
        Harness h = bootstrappedHarness();
        String java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        String cp = System.getProperty("java.class.path");
        Process a = new ProcessBuilder(java, "-cp", cp, SystemRootExternalWriter.class.getName(),
                h.path.toString(), "process-a", "process.a", "op:process-a", CLOCK.instant().toString()).redirectErrorStream(true).start();
        Process b = new ProcessBuilder(java, "-cp", cp, SystemRootExternalWriter.class.getName(),
                h.path.toString(), "process-b", "process.b", "op:process-b", CLOCK.instant().toString()).redirectErrorStream(true).start();
        int ea = a.waitFor();
        int eb = b.waitFor();
        String oa = new String(a.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String ob = new String(b.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        check(ea == 0, "external writer A failed: " + oa);
        check(eb == 0, "external writer B failed: " + ob);
        RootSnapshot finalState = h.registry.snapshot();
        check(finalState.storeRevision() == 3, "bootstrap plus two cross-process commits");
        check(finalState.systems().containsKey("process-a") && finalState.systems().containsKey("process-b"),
                "OS-level lock/CAS prevents lost cross-process update");
        pass();
    }

    private static void testClockRegressionFailsClosed() throws Exception {
        Harness h = bootstrappedHarness();
        Clock earlier = Clock.fixed(Instant.parse("2026-09-12T03:29:59Z"), ZoneOffset.UTC);
        SystemRootRegistry regressed = new SystemRootRegistry(
                new FileSystemRootStore(h.path), ignored -> true, ignored -> true, earlier);
        expect(AuthorityConflictException.class,
                () -> regressed.declare(descriptor("clock-regressed", "clock.regressed"),
                        "principal:p", "decision:clock", "op:clock-regressed"));
        check(regressed.snapshot().storeRevision() == 1, "clock regression cannot mutate authority");
        pass();
    }

    private static void testSnapshotDigestStableAcrossReload() throws Exception {
        Harness h = bootstrappedHarness();
        String first = h.registry.snapshotDigest();
        SystemRootRegistry reloaded = registry(new FileSystemRootStore(h.path));
        String second = reloaded.snapshotDigest();
        check(first.equals(second), "snapshot digest stable after restart");
        pass();
    }


    private static SystemRootRegistry registry(FileSystemRootStore store) {
        return new SystemRootRegistry(store, ignored -> true, ignored -> true, CLOCK);
    }

    private record Harness(Path path, SystemRootRegistry registry) {}

    private static Harness harness() throws Exception {
        Path dir = Files.createTempDirectory("system-root-test-");
        Path path = dir.resolve("root.store");
        return new Harness(path, registry(new FileSystemRootStore(path)));
    }

    private static Harness bootstrappedHarness() throws Exception {
        Harness h = harness();
        h.registry.bootstrap(FoundationAuthorityCatalog.canonical(), rootVersion(), rootBasis(),
                "principal:bootstrap", "decision:architecture-lock", "op:bootstrap");
        return h;
    }

    private static Descriptor descriptor(String id, String truth) {
        return new Descriptor(id, id, "Canonical question for " + id, AuthorityKind.FOUNDATION_SHARED,
                Set.of(truth), Set.of("Does not own unrelated state"));
    }

    private static VersionPointer rootVersion() {
        return new VersionPointer("1.0.0", hex('a'), "commit:root", hex('b'));
    }

    private static VersionPointer version(String v, char fill) {
        char other = fill == 'f' ? 'e' : 'f';
        return new VersionPointer(v, hex(fill), "commit:" + v + ":" + fill, hex(other));
    }

    private static AdmissionBasis rootBasis() {
        return new AdmissionBasis("authorization:bootstrap", "qualification:portable", "release:bootstrap");
    }

    private static AdmissionBasis basis(String suffix) {
        return new AdmissionBasis("authorization:" + suffix, "qualification:" + suffix, "release:" + suffix);
    }

    private static String hex(char c) {
        return String.valueOf(c).repeat(64);
    }

    @FunctionalInterface
    private interface CheckedRunnable { void run() throws Exception; }

    private static void expect(Class<? extends Throwable> type, CheckedRunnable action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected " + type.getSimpleName());
        } catch (Throwable t) {
            if (!type.isInstance(t)) throw t;
        }
    }

    private static void await(CountDownLatch latch) {
        try { latch.await(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
    }

    private static void pass() { tests++; }
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
