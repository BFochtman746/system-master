package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class RootAuthorityRegistryPerformanceTest {
    public static void main(String[] args) throws Exception {
        int systems = args.length > 0 ? Integer.parseInt(args[0]) : 5000;
        int authorities = args.length > 1 ? Integer.parseInt(args[1]) : 5000;
        int edges = args.length > 2 ? Integer.parseInt(args[2]) : 5000;

        List<BootstrapSystem> systemRows = new ArrayList<>(systems);
        for (int i = 0; i < systems; i++) {
            String id = "SYS-%05d".formatted(i);
            systemRows.add(new BootstrapSystem(id, "System " + i, "PERF", "SYSTEM_MASTER",
                    "version:" + i, "control:" + i, Lifecycle.ACTIVE));
        }
        List<BootstrapAuthority> authorityRows = new ArrayList<>(authorities);
        for (int i = 0; i < authorities; i++) {
            authorityRows.add(new BootstrapAuthority("AUTH-%05d".formatted(i), "Authority " + i,
                    "SYS-%05d".formatted(i % systems), "version:" + i, Lifecycle.ACTIVE));
        }
        List<BootstrapEdge> edgeRows = new ArrayList<>(edges);
        for (int i = 0; i < edges; i++) {
            int producer = i % systems;
            int consumer = (i + 1) % systems;
            edgeRows.add(new BootstrapEdge("EDGE-%05d".formatted(i), "SYS-%05d".formatted(producer),
                    "SYS-%05d".formatted(consumer), "iface:" + i, Lifecycle.ACTIVE));
        }

        BootstrapDefinition definition = new BootstrapDefinition(
                new ProductRoot("SYSTEM_MASTER", "SYSTEM MASTER", "root:v1"),
                systemRows, authorityRows, edgeRows);
        MutationMetadata bootstrap = new MutationMetadata("bootstrap-perf", "decision:perf", "actor:perf",
                "performance bootstrap", Instant.parse("2026-09-11T00:00:00Z"));
        Path dir = Files.createTempDirectory("root-registry-perf");
        Path path = dir.resolve("registry.bin");

        long t0 = System.nanoTime();
        AuthorityRegistry registry = AuthorityRegistry.initialize(new FileAuthorityRegistryStore(path), definition, bootstrap);
        long t1 = System.nanoTime();
        long bytes = Files.size(path);

        long q0 = System.nanoTime();
        long hit = 0;
        for (int i = 0; i < 250_000; i++) {
            if (registry.snapshot().system("SYS-%05d".formatted(i % systems)).isPresent()) hit++;
        }
        long q1 = System.nanoTime();

        long l0 = System.nanoTime();
        AuthorityRegistry reopened = AuthorityRegistry.open(new FileAuthorityRegistryStore(path));
        long l1 = System.nanoTime();

        long m0 = System.nanoTime();
        long revision = reopened.snapshot().revision();
        for (int i = 0; i < 25; i++) {
            String id = "SYS-%05d".formatted(i % systems);
            String oldVersion = reopened.snapshot().system(id).orElseThrow().versionPointer();
            String newVersion = oldVersion + ".u" + i;
            reopened.updateSystemVersion(revision, id, oldVersion, newVersion,
                    new MutationMetadata("perf-update-" + i, "decision:perf", "actor:perf", "performance mutation",
                            Instant.parse("2026-09-11T01:00:00Z").plusSeconds(i)));
            revision++;
        }
        long m1 = System.nanoTime();

        double initMs = ms(t1 - t0);
        double queryMs = ms(q1 - q0);
        double loadMs = ms(l1 - l0);
        double mutationsMs = ms(m1 - m0);
        double queryNs = (q1 - q0) / 250_000.0;
        double mutationMs = mutationsMs / 25.0;

        if (hit != 250_000L) throw new AssertionError("query misses");
        if (reopened.snapshot().revision() != 26) throw new AssertionError("mutation revision mismatch");

        System.out.printf(Locale.ROOT,
                "PERF systems=%d authorities=%d edges=%d snapshot_bytes=%d init_ms=%.3f load_ms=%.3f query_250k_ms=%.3f query_avg_ns=%.1f mutation25_ms=%.3f mutation_avg_ms=%.3f%n",
                systems, authorities, edges, bytes, initMs, loadMs, queryMs, queryNs, mutationsMs, mutationMs);
    }

    private static double ms(long ns) { return ns / 1_000_000.0; }
}
