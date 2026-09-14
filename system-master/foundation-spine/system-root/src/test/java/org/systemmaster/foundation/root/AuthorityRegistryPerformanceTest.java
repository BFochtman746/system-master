package org.systemmaster.foundation.root;

import java.nio.file.Files;
import java.nio.file.Path;

public final class AuthorityRegistryPerformanceTest {
    public static void main(String[] args) throws Exception {
        long startBootstrap = System.nanoTime();
        AuthorityRegistry registry = FoundationAuthorityBootstrap.createRegistry();
        long bootstrapMs = elapsedMs(startBootstrap);

        AuthorityRegistry.Snapshot snapshot = registry.snapshot();
        long startLookup = System.nanoTime();
        int lookups = 250_000;
        for (int i = 0; i < lookups; i++) {
            if (snapshot.resolve((i & 1) == 0 ? "Keel" : "SYSTEM_ROOT").isEmpty()) {
                throw new AssertionError("lookup unexpectedly missed");
            }
        }
        long lookupMs = elapsedMs(startLookup);

        Path dir = Files.createTempDirectory("authority-performance-");
        AuthorityJournal journal = new AuthorityJournal(dir.resolve("authority.journal"));
        FoundationAuthorityBootstrap.bootstrap(journal);
        int mutations = 150;
        long startMutations = System.nanoTime();
        for (int i = 0; i < mutations; i++) {
            long revision = journal.load().revision();
            journal.transact(new AuthorityRegistry.AdvancePointer(
                    "perf-pointer-" + i, revision, "SYSTEM_ROOT", "performance_probe", "revision-" + i));
        }
        long mutationMs = elapsedMs(startMutations);

        long startReplay = System.nanoTime();
        AuthorityRegistry.Snapshot replayed = new AuthorityJournal(journal.path()).load();
        long replayMs = elapsedMs(startReplay);
        long journalBytes = journal.sizeBytes();

        if (replayed.revision() != 28 + mutations) throw new AssertionError("performance replay revision mismatch");
        if (bootstrapMs > 5_000) throw new AssertionError("bootstrap latency unreasonable: " + bootstrapMs + "ms");
        if (lookupMs > 5_000) throw new AssertionError("lookup latency unreasonable: " + lookupMs + "ms");
        if (mutationMs > 30_000) throw new AssertionError("durable mutation latency unreasonable: " + mutationMs + "ms");
        if (replayMs > 5_000) throw new AssertionError("journal replay latency unreasonable: " + replayMs + "ms");
        if (journalBytes > 5_000_000) throw new AssertionError("journal growth unreasonable: " + journalBytes);

        double lookupPerSecond = lookupMs == 0 ? lookups : lookups * 1000.0 / lookupMs;
        double mutationsPerSecond = mutationMs == 0 ? mutations : mutations * 1000.0 / mutationMs;
        System.out.printf("PERFORMANCE FOUNDATION_SYSTEM_ROOT bootstrap_ms=%d lookup_count=%d lookup_ms=%d lookup_per_sec=%.1f durable_mutations=%d durable_mutation_ms=%d durable_mutations_per_sec=%.2f replay_ms=%d journal_bytes=%d%n",
                bootstrapMs, lookups, lookupMs, lookupPerSecond, mutations, mutationMs, mutationsPerSecond, replayMs, journalBytes);
        System.out.println("PASS FOUNDATION_SYSTEM_ROOT_PERFORMANCE");
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000L;
    }
}
