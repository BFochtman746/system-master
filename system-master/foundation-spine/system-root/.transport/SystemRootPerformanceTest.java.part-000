package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.SystemAuthority.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Portable performance acceptance for the standalone System Root control plane. */
public final class SystemRootPerformanceTest {
    private static final int MUTATIONS = 2_000;
    private static final int READS = 1_000;
    private static final long MAX_TOTAL_MUTATION_MS = 30_000;
    private static final double MAX_AVG_CACHED_READ_MS = 10.0;
    private static final long MAX_COLD_RELOAD_MS = 10_000;
    private static final long MAX_JOURNAL_BYTES = 16L * 1024L * 1024L;

    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("system-root-performance-");
        Path data = dir.resolve("root.store");
        SystemRootRegistry registry = registry(data);
        List<Descriptor> catalog = FoundationAuthorityCatalog.canonical();
        registry.bootstrap(catalog,
                new VersionPointer("performance-v1", hex('a'), "performance-source", hex('b')),
                new AdmissionBasis("authorization:performance", "qualification:performance", "release:performance"),
                "principal:performance", "decision:performance", "op:performance-bootstrap");

        SystemAuthority.Record base = registry.findSystem("identity-delegation").orElseThrow();
        long generation = base.generation();
        long mutationStart = System.nanoTime();
        for (int i = 0; i < MUTATIONS; i++) {
            Descriptor revised = new Descriptor(
                    base.descriptor().systemId(),
                    base.descriptor().displayName(),
                    base.descriptor().canonicalQuestion(),
                    base.descriptor().kind(),
                    base.descriptor().ownedTruthKeys(),
                    Set.of("Does not own specialist data", "Performance revision " + i));
            registry.reviseDescriptor("identity-delegation", generation, revised,
                    "principal:performance", "decision:performance", "op:performance-" + i);
            generation++;
        }
        long mutationEnd = System.nanoTime();

        long readStart = System.nanoTime();
        for (int i = 0; i < READS; i++) registry.snapshot();
        long readEnd = System.nanoTime();

        long coldStart = System.nanoTime();
        var cold = registry(data).snapshot();
        long coldEnd = System.nanoTime();

        long mutationMs = Math.round((mutationEnd - mutationStart) / 1_000_000.0);
        double avgMutationMs = (mutationEnd - mutationStart) / 1_000_000.0 / MUTATIONS;
        double avgReadMs = (readEnd - readStart) / 1_000_000.0 / READS;
        long coldMs = Math.round((coldEnd - coldStart) / 1_000_000.0);
        long bytes = Files.size(data);

        check(cold.storeRevision() == MUTATIONS + 1L, "cold reload revision mismatch");
        check(cold.events().size() == MUTATIONS + 1, "cold reload event mismatch");
        check(mutationMs <= MAX_TOTAL_MUTATION_MS, "mutation budget exceeded: " + mutationMs + "ms");
        check(avgReadMs <= MAX_AVG_CACHED_READ_MS, "cached read budget exceeded: " + avgReadMs + "ms");
        check(coldMs <= MAX_COLD_RELOAD_MS, "cold reload budget exceeded: " + coldMs + "ms");
        check(bytes <= MAX_JOURNAL_BYTES, "journal size budget exceeded: " + bytes);

        System.out.printf(Locale.ROOT,
                "PASS SYSTEM-ROOT-PERFORMANCE mutations=%d mutation_total_ms=%d avg_mutation_ms=%.3f "
                        + "reads=%d avg_cached_read_ms=%.3f cold_reload_ms=%d journal_bytes=%d%n",
                MUTATIONS, mutationMs, avgMutationMs, READS, avgReadMs, coldMs, bytes);
    }

    private static SystemRootRegistry registry(Path data) throws Exception {
        return new SystemRootRegistry(new FileSystemRootStore(data), ignored -> true, ignored -> true);
    }

    private static String hex(char c) {
        return String.valueOf(c).repeat(64);
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
