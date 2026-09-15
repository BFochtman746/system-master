package org.systemmaster.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * The unattended entry point invoked by {@code .github/workflows/claim-driver.yml}.
 *
 * <p>Loads queued claims, runs {@link ClaimDriver} inside its ceilings, prints a summary an
 * operator can read the next morning, and exits non-zero when the run needs attention.
 *
 * <p>REMOTE COMPLETION IS REAL, PERSISTENCE IS NOT YET. Production uses
 * {@link ActionsDispatch} only for workflow_dispatch acceptance and an explicit
 * {@link ActionsRunPoller} for run completion. A 204 dispatch can therefore no longer
 * become DONE by returning from the POST. The ledger is still in-memory across process
 * runs; durable restoration of the prepared dispatch identity and DISPATCHED state is the
 * next packet and remains required for crash-safe reconciliation.
 */
public final class ClaimDriverMain {

    private static final long NANO_BASE = System.nanoTime();

    private ClaimDriverMain() { }

    public static void main(String[] args) throws Exception {
        // Deliberately outside governance/: those paths are governed by the lease-receipt
        // audit, and a work queue is operational state, not an authority record.
        String queueDir = "execution/claims/queue";
        int maxIterations = 25;
        long budgetSeconds = 300;
        List<String[]> inline = new ArrayList<>();

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--queue" -> queueDir = need(args, ++i, "--queue");
                case "--max-iterations" -> maxIterations = Integer.parseInt(need(args, ++i, "--max-iterations"));
                case "--budget-seconds" -> budgetSeconds = Long.parseLong(need(args, ++i, "--budget-seconds"));
                case "--claim" -> {
                    String spec = need(args, ++i, "--claim");
                    int eq = spec.indexOf('=');
                    if (eq < 1 || eq == spec.length() - 1) {
                        throw new IllegalArgumentException("INVALID_CLAIM_SPEC:" + spec);
                    }
                    inline.add(new String[] { spec.substring(0, eq), spec.substring(eq + 1) });
                }
                default -> throw new IllegalArgumentException("UNKNOWN_ARGUMENT:" + args[i]);
            }
        }

        ExecutionLeaseManager leases = new ExecutionLeaseManager();
        ClaimLedger ledger = new ClaimLedger(leases);
        List<String> ids = new ArrayList<>();
        int invalid = 0;

        for (String[] c : inline) {
            ledger.submit(c[0], c[1]);
            ids.add(c[0]);
        }

        Path queue = Path.of(queueDir);
        if (Files.isDirectory(queue)) {
            List<Path> entries;
            try (Stream<Path> list = Files.list(queue)) {
                entries = list.filter(Files::isRegularFile).sorted().toList();
            }
            for (Path entry : entries) {
                String claimId = entry.getFileName().toString();
                if (claimId.startsWith(".") || claimId.endsWith(".md")) continue;
                String digest = firstNonBlankLine(entry);
                if (digest == null) {
                    System.out.println("CLAIM-DRIVER queue-entry-invalid name=" + claimId
                            + " reason=EMPTY_PAYLOAD_DIGEST");
                    invalid++;
                    continue;
                }
                ledger.submit(claimId, digest);
                ids.add(claimId);
            }
        }

        String consumerRef = "claim-driver/" + env("GITHUB_RUN_ID",
                "local-" + ProcessHandle.current().pid());
        ActionsDispatch dispatch = ActionsDispatch.fromEnvironment(ActionsDispatch.httpTransport());
        ActionsRunPoller completion = ActionsRunPoller.fromEnvironment(ActionsRunPoller.httpTransport());
        ClaimLedger.Consumer consumer = new ClaimLedger.Consumer(ledger,
                dispatch, completion, consumerRef, Duration.ofMinutes(10));

        ClaimDriver driver = new ClaimDriver(ledger, consumer,
                new ClaimDriver.Bounds(maxIterations, Duration.ofSeconds(budgetSeconds)),
                systemTime());

        System.out.println("CLAIM-DRIVER start consumer=" + consumerRef
                + " queued=" + ids.size() + " invalidQueueEntries=" + invalid
                + " maxIterations=" + maxIterations + " budgetSeconds=" + budgetSeconds);

        ClaimDriver.RunSummary summary = driver.run();
        System.out.println(summary.format());

        StringBuilder md = new StringBuilder();
        md.append("### Claim driver run\n\n");
        md.append("`").append(summary.format()).append("`\n\n");
        md.append("| claim | state | attempts | receipts | reason |\n");
        md.append("|---|---|---|---|---|\n");
        for (String id : ids) {
            ClaimLedger.ClaimView v = ledger.view(id);
            String line = id + " state=" + v.state() + " attempts=" + v.attempts()
                    + " receipts=" + ledger.receipts(id).size()
                    + " reason=" + (v.terminalReason() == null ? "-" : v.terminalReason());
            System.out.println("  " + line);
            md.append("| `").append(id).append("` | ").append(v.state()).append(" | ")
              .append(v.attempts()).append(" | ").append(ledger.receipts(id).size())
              .append(" | ").append(v.terminalReason() == null ? "-" : v.terminalReason())
              .append(" |\n");
            for (ClaimLedger.Receipt r : ledger.receipts(id)) {
                System.out.println("    receipt epoch=" + r.epoch() + " digest=" + r.receiptDigest());
            }
        }

        String stepSummary = env("GITHUB_STEP_SUMMARY", "");
        if (!stepSummary.isEmpty()) {
            Files.writeString(Path.of(stepSummary), md.toString(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        }

        if (invalid > 0 || summary.needsAttention()) {
            System.out.println("RESULT: ATTENTION");
            System.exit(1);
        }
        System.out.println("RESULT: OK");
    }

    static ClaimDriver.TimeSource systemTime() {
        return () -> new CoordinationContracts.TimeEvidence(
                Instant.now(),
                Math.max(0L, System.nanoTime() - NANO_BASE),
                Duration.ofSeconds(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    private static String firstNonBlankLine(Path file) throws IOException {
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) return line.trim();
        }
        return null;
    }

    private static String need(String[] args, int i, String flag) {
        if (i >= args.length) throw new IllegalArgumentException("MISSING_VALUE_FOR:" + flag);
        return args[i];
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? fallback : v.trim();
    }
}
