package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/**
 * Closes the gap {@link ActionsDispatch} documents and deliberately leaves open: a dispatched
 * claim is only <em>accepted</em> by Actions, not finished, so a DONE claim proved nothing about
 * the work actually running. This decorator polls the dispatched run to a terminal conclusion
 * before the claim is allowed to terminalize DONE.
 *
 * <p>WHY A DECORATOR, NOT A CHANGE TO THE LEDGER. {@link ClaimLedger.Consumer#tick} already has
 * exactly the semantics needed: the digest returned by
 * {@link ClaimLedger.Consumer.Dispatch#execute} terminalizes DONE, and any thrown exception is
 * recorded as evidence and terminalizes FAILED. So completion enforcement composes at the
 * Dispatch seam and the lifecycle code is untouched. Two consequences worth stating:
 * <ul>
 *   <li>Unwired — a {@link ClaimLedger.Consumer} built on a bare {@link ActionsDispatch} — the
 *       digest stays {@code ACTIONS_DISPATCHED}. The weaker guarantee stays visible in the
 *       evidence trail instead of being silently implied. Absence of this poller degrades
 *       loudly, which is why the digest string is asserted by the qualification.</li>
 *   <li>A non-success conclusion throws, so the existing FAILED path records the run id and
 *       conclusion as evidence with no new branch in the ledger.</li>
 * </ul>
 *
 * <p>WHY CORRELATION IS BY IDENTITY. {@code workflow_dispatch} answers {@code 204 No Content}
 * with no body and no run id, so the run cannot be addressed directly. The claim id rides along
 * as a workflow input and {@code claim-work.yml} surfaces it in the run title, so the run is
 * found by matching that title. Matching is <em>boundary checked</em>: a substring match would
 * let claim {@code job-1} be satisfied by the run for {@code job-11} — terminalizing one claim
 * on another's outcome, the worst failure this class could have. See
 * {@link #titleCorrelates(String, String)}.
 *
 * <p>TWO BOUNDED PHASES, TWO DISTINCT REFUSALS. Dispatch acceptance and run appearance are
 * separated by an unpredictable queue delay, so discovery is its own phase with its own bound.
 * The refusal codes are deliberately different because they are different operational faults:
 * <ul>
 *   <li>{@code DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW} — Actions accepted the dispatch but no
 *       correlated run ever appeared. Something is wrong with the workflow or the trigger.</li>
 *   <li>{@code DISPATCH_POLL_BUDGET_EXHAUSTED} — the run was found and was still going when the
 *       budget ran out. The executor is slow or wedged, not missing.</li>
 * </ul>
 * Collapsing these into one code would make the two situations indistinguishable in the
 * evidence trail, so the qualification asserts they are not equal.
 *
 * <p>EVERY PHASE IS DOUBLY BOUNDED — attempt ceiling <em>and</em> wall-clock budget. Attempts
 * alone cannot bound a phase whose polls block, and a clock alone cannot bound one whose polls
 * return instantly. Both bounds are mutation-proofed by the qualification.
 *
 * <p>NO SILENT PASS. An unresolvable run, a rejected query, an ambiguous correlation and any
 * non-success conclusion each throw with their own code. There is no path that returns a
 * completion digest without a run id and a {@code success} conclusion behind it.
 */
public final class ActionsRunPoller implements ClaimLedger.Consumer.Dispatch {

    /** The run fields completion depends on. Kept minimal so the seam carries no JSON type. */
    public record RunView(long id, String title, String status, String conclusion) { }

    /**
     * The run-query seam. Injected so the qualification can prove every refusal code and both
     * bounds without network access, which the build sandbox does not have.
     */
    public interface Runs {
        /** Recent runs of the claim workflow, newest first. */
        List<RunView> recent() throws Exception;

        /** One run by id, for the completion phase. */
        RunView byId(long runId) throws Exception;
    }

    /** Time source, separate from the transport so the wall-clock bound is provable. */
    public interface Clock {
        Instant now();
    }

    /** Pause between polls. Injected so the qualification does not actually sleep. */
    public interface Backoff {
        void pause(Duration interval) throws Exception;
    }

    private final ClaimLedger.Consumer.Dispatch inner;
    private final Runs runs;
    private final Clock clock;
    private final Backoff backoff;
    private final int discoveryAttempts;
    private final Duration discoveryBudget;
    private final int pollAttempts;
    private final Duration pollBudget;
    private final Duration interval;

    public ActionsRunPoller(ClaimLedger.Consumer.Dispatch inner, Runs runs, Clock clock,
            Backoff backoff, int discoveryAttempts, Duration discoveryBudget,
            int pollAttempts, Duration pollBudget, Duration interval) {
        this.inner = Objects.requireNonNull(inner, "inner");
        this.runs = Objects.requireNonNull(runs, "runs");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.backoff = Objects.requireNonNull(backoff, "backoff");
        this.discoveryAttempts = positive(discoveryAttempts, "DISCOVERY_ATTEMPTS");
        this.discoveryBudget = positive(discoveryBudget, "DISCOVERY_BUDGET");
        this.pollAttempts = positive(pollAttempts, "POLL_ATTEMPTS");
        this.pollBudget = positive(pollBudget, "POLL_BUDGET");
        this.interval = Objects.requireNonNull(interval, "interval");
        if (interval.isNegative()) throw new IllegalArgumentException("INVALID_INTERVAL");
    }

    private static int positive(int v, String code) {
        if (v <= 0) throw new IllegalArgumentException("INVALID_" + code);
        return v;
    }

    private static Duration positive(Duration v, String code) {
        Objects.requireNonNull(v, code);
        if (v.isZero() || v.isNegative()) throw new IllegalArgumentException("INVALID_" + code);
        return v;
    }

    /**
     * Dispatches, then blocks until the correlated run reaches a terminal conclusion.
     *
     * @return a digest naming the run id and its {@code success} conclusion.
     * @throws Exception with a phase-specific code for every refusal; never returns on a run
     *         that did not succeed.
     */
    @Override
    public String execute(String claimId, String payloadDigest) throws Exception {
        // Dispatch refusals (DISPATCH_NO_CREDENTIAL, DISPATCH_REJECTED_422, ...) propagate
        // unchanged: this class adds completion proof and must not mask acceptance faults.
        String acceptance = inner.execute(claimId, payloadDigest);

        long runId = resolveRun(claimId);
        return pollToConclusion(claimId, runId, acceptance);
    }

    /** Phase 1: find the run whose title carries this claim id. Bounded twice. */
    private long resolveRun(String claimId) throws Exception {
        Instant deadline = clock.now().plus(discoveryBudget);
        for (int attempt = 1; attempt <= discoveryAttempts; attempt++) {
            if (!clock.now().isBefore(deadline)) {
                throw new IllegalStateException("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW:"
                        + "budget_exceeded claim=" + claimId + " attempts=" + attempt);
            }

            List<RunView> recent;
            try {
                recent = runs.recent();
            } catch (Exception queryFailure) {
                // A query that cannot be made is not "no run yet": it must never decay into a
                // not-found verdict, which would misreport a credentials or transport fault.
                throw new IllegalStateException("DISPATCH_RUN_QUERY_FAILURE:"
                        + queryFailure.getClass().getSimpleName(), queryFailure);
            }
            if (recent == null) throw new IllegalStateException("DISPATCH_RUN_QUERY_FAILURE:NULL_RESULT");

            Set<Long> matches = new LinkedHashSet<>();
            for (RunView run : recent) {
                if (run != null && titleCorrelates(run.title(), claimId)) matches.add(run.id());
            }
            if (matches.size() > 1) {
                // Two runs claiming one id: picking either could terminalize this claim on the
                // wrong run's outcome. Refuse rather than guess.
                throw new IllegalStateException("DISPATCH_CORRELATION_AMBIGUOUS:claim="
                        + claimId + " runs=" + matches);
            }
            if (matches.size() == 1) return matches.iterator().next();

            if (attempt < discoveryAttempts) backoff.pause(interval);
        }
        throw new IllegalStateException("DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW:"
                + "attempts_exhausted claim=" + claimId + " attempts=" + discoveryAttempts);
    }

    /** Phase 2: poll the known run to a terminal conclusion. Bounded twice. */
    private String pollToConclusion(String claimId, long runId, String acceptance) throws Exception {
        Instant deadline = clock.now().plus(pollBudget);
        for (int attempt = 1; attempt <= pollAttempts; attempt++) {
            if (!clock.now().isBefore(deadline)) {
                throw new IllegalStateException("DISPATCH_POLL_BUDGET_EXHAUSTED:"
                        + "budget_exceeded claim=" + claimId + " run=" + runId
                        + " attempts=" + attempt);
            }

            RunView run;
            try {
                run = runs.byId(runId);
            } catch (Exception queryFailure) {
                throw new IllegalStateException("DISPATCH_RUN_QUERY_FAILURE:"
                        + queryFailure.getClass().getSimpleName(), queryFailure);
            }
            if (run == null) throw new IllegalStateException("DISPATCH_RUN_QUERY_FAILURE:NULL_RUN");

            if ("completed".equals(run.status())) {
                String conclusion = run.conclusion() == null ? "" : run.conclusion();
                if ("success".equals(conclusion)) {
                    return "ACTIONS_COMPLETED run=" + runId + " conclusion=success"
                            + " claim=" + claimId + " accepted=" + acceptance;
                }
                // failure / cancelled / timed_out / action_required / stale / empty all land
                // here. tick() turns this into FAILED with the run id in the evidence trail.
                throw new IllegalStateException("DISPATCH_RUN_CONCLUDED_"
                        + (conclusion.isEmpty() ? "UNKNOWN" : conclusion.toUpperCase())
                        + ":claim=" + claimId + " run=" + runId);
            }

            if (attempt < pollAttempts) backoff.pause(interval);
        }
        throw new IllegalStateException("DISPATCH_POLL_BUDGET_EXHAUSTED:"
                + "attempts_exhausted claim=" + claimId + " run=" + runId
                + " attempts=" + pollAttempts);
    }

    /**
     * True when {@code title} contains {@code claimId} as a whole token.
     *
     * <p>The boundary check is the point. {@code "claim job-11 work".contains("job-1")} is true,
     * so a substring match would satisfy claim {@code job-1} with the run for {@code job-11} and
     * terminalize it on another claim's outcome. A match therefore requires the characters on
     * both sides to be non-identifier characters; claim ids here contain {@code -}, so hyphen
     * counts as an identifier character rather than a separator.
     */
    static boolean titleCorrelates(String title, String claimId) {
        if (title == null || claimId == null || claimId.isEmpty()) return false;
        int from = 0;
        while (from <= title.length() - claimId.length()) {
            int at = title.indexOf(claimId, from);
            if (at < 0) return false;
            int end = at + claimId.length();
            boolean leftOk = at == 0 || !isIdentifierChar(title.charAt(at - 1));
            boolean rightOk = end == title.length() || !isIdentifierChar(title.charAt(end));
            if (leftOk && rightOk) return true;
            from = at + 1;
        }
        return false;
    }

    private static boolean isIdentifierChar(char c) {
        return Character.isLetterOrDigit(c) || c == '-' || c == '_';
    }
}
