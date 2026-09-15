package org.systemmaster.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Stream;

/** Unattended crash-safe claim dispatcher invoked by claim-driver.yml. */
public final class ClaimDriverMain {

    private static final long NANO_BASE = System.nanoTime();
    private ClaimDriverMain() { }

    public static void main(String[] args) throws Exception {
        String queueDir = "execution/claims/queue";
        int maxIterations = 25;
        long budgetSeconds = 300;
        Map<String, String> claims = new LinkedHashMap<>();

        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--queue" -> queueDir = need(args, ++i, "--queue");
                case "--max-iterations" -> maxIterations = Integer.parseInt(need(args, ++i, "--max-iterations"));
                case "--budget-seconds" -> budgetSeconds = Long.parseLong(need(args, ++i, "--budget-seconds"));
                case "--claim" -> {
                    String spec = need(args, ++i, "--claim");
                    int eq = spec.indexOf('=');
                    if (eq < 1 || eq == spec.length() - 1) throw new IllegalArgumentException("INVALID_CLAIM_SPEC:" + spec);
                    putClaim(claims, spec.substring(0, eq), spec.substring(eq + 1));
                }
                default -> throw new IllegalArgumentException("UNKNOWN_ARGUMENT:" + args[i]);
            }
        }
        if (maxIterations < 1) throw new IllegalArgumentException("INVALID_MAX_ITERATIONS");
        if (budgetSeconds < 1) throw new IllegalArgumentException("INVALID_BUDGET_SECONDS");

        int invalid = loadQueue(Path.of(queueDir), claims);
        String consumerRef = "claim-driver/" + env("GITHUB_RUN_ID", "local-" + ProcessHandle.current().pid());

        ActionsDispatch actions = ActionsDispatch.fromEnvironment(ActionsDispatch.httpTransport());
        ActionsRunPoller poller = ActionsRunPoller.fromEnvironment(ActionsRunPoller.httpTransport());
        ControlGatewayClaimStateStore stateStore = ControlGatewayClaimStateStore.fromEnvironment(ControlGatewayClaimStateStore.httpTransport());
        stateStore.verifyStateRef();

        DurableDispatchCoordinator.Dispatch dispatch = new DurableDispatchCoordinator.Dispatch() {
            public void preflight() { actions.preflight(); }
            public String newDispatchId() { return actions.newDispatchId(); }
            public String post(String claimId, String payloadDigest, String dispatchId) throws Exception {
                return actions.executePrepared(claimId, payloadDigest, dispatchId);
            }
        };
        DurableDispatchCoordinator.Reconciler reconciler = new DurableDispatchCoordinator.Reconciler() {
            public DurableDispatchCoordinator.Discovery discover(String claimId, String dispatchId) throws Exception {
                ActionsRunPoller.Discovery d = poller.discover(claimId, dispatchId);
                return d.found() ? DurableDispatchCoordinator.Discovery.found(d.runId())
                        : DurableDispatchCoordinator.Discovery.notFound();
            }
            public DurableDispatchCoordinator.Completion await(String claimId, String dispatchId, long runId) throws Exception {
                ActionsRunPoller.Completion c = poller.reconcile(claimId, dispatchId, runId);
                return new DurableDispatchCoordinator.Completion(c.runId(), c.status(), c.conclusion(), c.evidenceDigest());
            }
        };
        DurableDispatchCoordinator coordinator = new DurableDispatchCoordinator(
                stateStore, dispatch, reconciler, Instant::now, consumerRef);

        Instant deadline = Instant.now().plusSeconds(budgetSeconds);
        int iterations = 0;
        int attention = invalid;
        StringBuilder md = new StringBuilder();
        md.append("### Crash-safe claim driver run\n\n");
        md.append("| claim | durable state | epoch | dispatch id | run id | disposition |\n");
        md.append("|---|---|---:|---|---:|---|\n");

        System.out.println("CLAIM-DRIVER start consumer=" + consumerRef
                + " queued=" + claims.size() + " invalidQueueEntries=" + invalid
                + " maxIterations=" + maxIterations + " budgetSeconds=" + budgetSeconds
                + " stateRef=" + env("CLAIM_STATE_REF", "second-shift/execution-state"));

        for (Map.Entry<String, String> claim : claims.entrySet()) {
            if (iterations >= maxIterations || !Instant.now().isBefore(deadline)) break;
            iterations++;
            DurableDispatchCoordinator.DriveResult result;
            try {
                result = coordinator.drive(claim.getKey(), claim.getValue());
            } catch (Exception failure) {
                attention++;
                System.out.println("CLAIM-DRIVER claim=" + claim.getKey() + " fatal="
                        + failure.getClass().getSimpleName() + ":" + failure.getMessage());
                continue;
            }
            if (result.needsAttention()) attention++;
            DurableDispatchCoordinator.Versioned v = stateStore.load(claim.getKey());
            if (v == null) throw new IllegalStateException("STATE_DISAPPEARED");
            DurableDispatchCoordinator.ClaimRecord r = v.record();
            System.out.println("CLAIM-DRIVER claim=" + claim.getKey() + " state=" + r.state()
                    + " epoch=" + r.epoch() + " dispatchId=" + dash(r.dispatchId())
                    + " runId=" + (r.runId() == null ? "-" : r.runId())
                    + " disposition=" + result.disposition());
            md.append("| `").append(claim.getKey()).append("` | ").append(r.state())
                    .append(" | ").append(r.epoch()).append(" | `").append(dash(r.dispatchId()))
                    .append("` | ").append(r.runId() == null ? "-" : r.runId())
                    .append(" | ").append(result.disposition()).append(" |\n");
        }

        if (iterations < claims.size()) {
            attention++;
            System.out.println("CLAIM-DRIVER ceiling reached processed=" + iterations + " queued=" + claims.size());
        }

        String stepSummary = env("GITHUB_STEP_SUMMARY", "");
        if (!stepSummary.isEmpty()) {
            Files.writeString(Path.of(stepSummary), md.toString(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        }

        System.out.println("CLAIM-DRIVER durable-summary processed=" + iterations + " attention=" + attention);
        if (attention > 0) {
            System.out.println("RESULT: ATTENTION");
            System.exit(1);
        }
        System.out.println("RESULT: OK");
    }

    /** Kept for existing time-contract qualification; production terminal time is Instant::now after polling. */
    static ClaimDriver.TimeSource systemTime() {
        return () -> new CoordinationContracts.TimeEvidence(
                Instant.now(), Math.max(0L, System.nanoTime() - NANO_BASE), Duration.ofSeconds(5),
                CoordinationContracts.TimeStanding.TRUSTED);
    }

    private static int loadQueue(Path queue, Map<String, String> claims) throws IOException {
        if (!Files.isDirectory(queue)) return 0;
        int invalid = 0;
        try (Stream<Path> list = Files.list(queue)) {
            for (Path entry : list.filter(Files::isRegularFile).sorted().toList()) {
                String claimId = entry.getFileName().toString();
                if (claimId.startsWith(".") || claimId.endsWith(".md")) continue;
                String digest = firstNonBlankLine(entry);
                if (digest == null) {
                    System.out.println("CLAIM-DRIVER queue-entry-invalid name=" + claimId + " reason=EMPTY_PAYLOAD_DIGEST");
                    invalid++;
                    continue;
                }
                putClaim(claims, claimId, digest);
            }
        }
        return invalid;
    }

    private static void putClaim(Map<String, String> claims, String id, String payload) {
        String previous = claims.putIfAbsent(id, payload);
        if (previous != null && !previous.equals(payload)) throw new IllegalStateException("CLAIM_DUPLICATE_PAYLOAD_MISMATCH:" + id);
    }

    private static String firstNonBlankLine(Path file) throws IOException {
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) if (!line.isBlank()) return line.trim();
        return null;
    }
    private static String need(String[] args, int i, String flag) {
        if (i >= args.length) throw new IllegalArgumentException("MISSING_VALUE_FOR:" + flag);
        return args[i];
    }
    private static String env(String key, String fallback) {
        String v = System.getenv(key); return v == null || v.isBlank() ? fallback : v.trim();
    }
    private static String dash(String value) { return value == null || value.isBlank() ? "-" : value; }
}
