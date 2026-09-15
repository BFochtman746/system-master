package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;

/**
 * The bounded, unattended runner for {@link ClaimLedger.Consumer}.
 *
 * <p>WHY THIS EXISTS. {@code ClaimLedger} gave this repository a real claim lifecycle,
 * but {@code tick()} still had to be called by hand, so nothing executed overnight —
 * the "no unattended launcher" gap found in the first study of this system. This class
 * is that launcher, and the scheduled workflow {@code .github/workflows/claim-driver.yml}
 * is what invokes it.
 *
 * <p>WHY IT IS BOUNDED. An unattended loop with no ceiling is how a scheduler wedges: it
 * either spins forever on a claim it cannot finish or holds a runner until the platform
 * kills it, leaving claims CLAIMED with no evidence and no operator signal. Every run
 * therefore has two independent ceilings — a maximum iteration count and a wall-clock
 * budget — and stops at whichever is reached first. Both are load-bearing and both are
 * proven by the accompanying qualification, including mutation proofs that show the suite
 * turns red when either ceiling is removed.
 *
 * <p>STOP CONDITIONS are explicit, never implicit: {@code QUEUE_DRAINED} (nothing left to
 * do — the ordinary outcome), {@code ITERATION_LIMIT}, {@code BUDGET_EXHAUSTED}. The stop
 * reason is part of the run summary because "the driver stopped" is not an answer an
 * operator can act on at 7am.
 *
 * <p>SAFE TO RE-RUN. The driver holds no state of its own; all state lives in the ledger.
 * A second run against a drained queue does nothing and reports {@code QUEUE_DRAINED} with
 * zero counts, so a schedule that overlaps a manual run cannot corrupt anything. Exclusion
 * between two concurrent drivers is the ledger's job, not the driver's: a second driver is
 * refused CLAIM_HELD by {@link ClaimLedger#claim}.
 *
 * <p>OBSERVABILITY. {@link RunSummary} counts what changed — readmitted, dead-lettered,
 * completed, failed — because the entire point of an overnight runner is that someone can
 * read what happened without re-running it.
 */
public final class ClaimDriver {

    /** Why a run ended. Always reported; never inferred by the caller. */
    public enum StopReason { QUEUE_DRAINED, ITERATION_LIMIT, BUDGET_EXHAUSTED }

    /**
     * Supplies trusted time for each iteration. Injected rather than read from the system
     * clock so the qualification can advance time deterministically and prove the
     * budget ceiling and the abandoned-consumer paths without sleeping.
     */
    public interface TimeSource {
        CoordinationContracts.TimeEvidence evidence();
    }

    /** The two independent ceilings on a single unattended run. */
    public record Bounds(int maxIterations, Duration wallClockBudget) {
        public Bounds {
            if (maxIterations < 1) throw new IllegalArgumentException("INVALID_MAX_ITERATIONS");
            Objects.requireNonNull(wallClockBudget, "wallClockBudget");
            if (wallClockBudget.isNegative() || wallClockBudget.isZero()) {
                throw new IllegalArgumentException("INVALID_WALL_CLOCK_BUDGET");
            }
        }
    }

    /** What an operator reads the next morning. */
    public record RunSummary(int iterations, int readmitted, int deadLettered,
            int completed, int failed, StopReason stopReason, Duration elapsed) {

        /** True when this run needs a human to look at it. */
        public boolean needsAttention() {
            return failed > 0 || deadLettered > 0;
        }

        public String format() {
            return "CLAIM-DRIVER run"
                    + " iterations=" + iterations
                    + " completed=" + completed
                    + " failed=" + failed
                    + " readmitted=" + readmitted
                    + " dead=" + deadLettered
                    + " stop=" + stopReason
                    + " elapsed=" + elapsed.toMillis() + "ms"
                    + " attention=" + needsAttention();
        }
    }

    private final ClaimLedger ledger;
    private final ClaimLedger.Consumer consumer;
    private final Bounds bounds;
    private final TimeSource time;

    public ClaimDriver(ClaimLedger ledger, ClaimLedger.Consumer consumer,
            Bounds bounds, TimeSource time) {
        this.ledger = Objects.requireNonNull(ledger, "ledger");
        this.consumer = Objects.requireNonNull(consumer, "consumer");
        this.bounds = Objects.requireNonNull(bounds, "bounds");
        this.time = Objects.requireNonNull(time, "time");
    }

    /**
     * Runs until the queue drains or a ceiling is reached, whichever comes first.
     *
     * <p>The explicit {@code ledger.recover(...)} call here is for observability only —
     * {@link ClaimLedger.Consumer#tick} calls {@code recover()} first on every iteration
     * regardless, which is the structural guarantee. Recovery is idempotent within an
     * iteration (a readmitted claim is READY, and {@code recover()} only considers CLAIMED
     * claims), so counting it here cannot double-readmit. The qualification proves that
     * idempotency rather than assuming it.
     */
    public RunSummary run() {
        Instant start = null;
        Instant last = null;
        int iterations = 0;
        int readmitted = 0;
        int deadLettered = 0;
        int completed = 0;
        int failed = 0;
        StopReason stop = StopReason.ITERATION_LIMIT;

        for (int i = 0; i < bounds.maxIterations(); i++) {
            CoordinationContracts.TimeEvidence evidence = time.evidence();
            Instant now = evidence.wallTime();
            if (start == null) start = now;
            last = now;

            // Checked before doing work, so an over-budget run cannot start one more
            // dispatch on its way out.
            if (Duration.between(start, now).compareTo(bounds.wallClockBudget()) >= 0) {
                stop = StopReason.BUDGET_EXHAUSTED;
                break;
            }

            for (String change : ledger.recover(now, evidence)) {
                if (change.endsWith(":DEAD")) deadLettered++;
                else readmitted++;
            }

            String claimId = consumer.tick(now, evidence);
            iterations++;
            if (claimId == null) {
                stop = StopReason.QUEUE_DRAINED;
                break;
            }
            switch (ledger.view(claimId).state()) {
                case DONE -> completed++;
                case FAILED -> failed++;
                default -> { /* still in flight or readmitted; counted on a later pass */ }
            }
        }

        Instant from = start == null ? Instant.EPOCH : start;
        Instant to = last == null ? from : last;
        return new RunSummary(iterations, readmitted, deadLettered, completed, failed,
                stop, Duration.between(from, to));
    }
}
