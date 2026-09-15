package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Claim lifecycle and consumer for delegated execution.
 *
 * <p>WHY THIS EXISTS. The repository's governance records and CI scripts have long
 * described a scheduler that claims work, executes it, writes an evidence receipt and
 * terminalizes the claim — including a STALE readmission path. That runtime was never
 * written: before this class there was no {@code recover()}, no {@code tick()} loop and
 * no claim/consumer/executor type anywhere in the tree. The vocabulary existed only in
 * documents, which is why nothing ever failed: there was no code to fail.
 *
 * <p>WHY IT DOES NOT REUSE {@link ExecutionLeaseManager} FOR EXCLUSION.
 * {@code ExecutionLeaseManager} is real and is reused here for what it genuinely
 * provides: monotonic epochs, fence tokens, trusted-time admission, and rejection of a
 * <em>stale</em> writer via {@code requireMutationAuthority}. What it deliberately does
 * NOT provide is mutual exclusion — {@code acquire()} unconditionally grants a new
 * epoch, which is correct behaviour for taking over from a dead holder, but means a
 * second <em>live</em> consumer is never refused. So the "only one consumer per claim"
 * decision is made here, by inspecting the current lease's expiry, and fencing is
 * delegated downward. This is the same split the control-gateway-lock subsystem uses for
 * system files.
 *
 * <p>STATES. {@code READY -> CLAIMED -> (DONE | FAILED)}. A {@code CLAIMED} claim whose
 * lease has expired is presumed abandoned; {@link #recover} readmits it to {@code READY}
 * a bounded number of times and then terminalizes it {@code DEAD} rather than looping
 * forever. That bound is what stops a wedged claim from being retried indefinitely.
 *
 * <p>NO DOUBLE EXECUTION. Readmission issues a new epoch to the next consumer, which
 * makes the abandoned consumer's fence token stale. If that process wakes up and tries
 * to write, {@code requireMutationAuthority} refuses it. A terminal claim can never be
 * claimed again. Both paths are proven by the accompanying test.
 */
public final class ClaimLedger {

    /** Terminal states are DONE, FAILED and DEAD; DEAD means the attempt bound was spent. */
    public enum ClaimState { READY, CLAIMED, DONE, FAILED, DEAD }

    /** Default bound on execution attempts before a claim is declared DEAD. */
    public static final int DEFAULT_MAX_ATTEMPTS = 3;

    /** A durable execution receipt. Append-only: a claim's evidence is never rewritten. */
    public record Receipt(String claimId, long epoch, String consumerRef,
            String receiptDigest, Instant writtenAt) {
        public Receipt {
            requireText(claimId, "CLAIM_ID");
            if (epoch < 1) throw new IllegalArgumentException("INVALID_EPOCH");
            requireText(consumerRef, "CONSUMER_REF");
            requireText(receiptDigest, "RECEIPT_DIGEST");
            Objects.requireNonNull(writtenAt, "writtenAt");
        }
    }

    /** Immutable view of a claim for callers and assertions. */
    public record ClaimView(String claimId, String payloadDigest, ClaimState state,
            int attempts, String consumerRef, long epoch, String terminalReason) {
    }

    private static final class Entry {
        final String claimId;
        final String payloadDigest;
        ClaimState state = ClaimState.READY;
        int attempts;
        String consumerRef;
        long epoch;
        String terminalReason;
        final List<Receipt> receipts = new ArrayList<>();

        Entry(String claimId, String payloadDigest) {
            this.claimId = claimId;
            this.payloadDigest = payloadDigest;
        }
    }

    private final Map<String, Entry> claims = new LinkedHashMap<>();
    private final ExecutionLeaseManager leases;
    private final int maxAttempts;

    public ClaimLedger(ExecutionLeaseManager leases) {
        this(leases, DEFAULT_MAX_ATTEMPTS);
    }

    public ClaimLedger(ExecutionLeaseManager leases, int maxAttempts) {
        this.leases = Objects.requireNonNull(leases, "leases");
        if (maxAttempts < 1) throw new IllegalArgumentException("INVALID_MAX_ATTEMPTS");
        this.maxAttempts = maxAttempts;
    }

    public int maxAttempts() { return maxAttempts; }

    /** Queues new work. A claim id is single-use so a resubmit cannot silently reset state. */
    public void submit(String claimId, String payloadDigest) {
        requireText(claimId, "CLAIM_ID");
        requireText(payloadDigest, "PAYLOAD_DIGEST");
        if (claims.containsKey(claimId)) throw new IllegalStateException("CLAIM_EXISTS");
        claims.put(claimId, new Entry(claimId, payloadDigest));
    }

    /**
     * Takes exclusive possession of a READY claim and returns the lease that authorizes
     * writing to it. This is the mutual-exclusion point.
     *
     * @throws IllegalStateException CLAIM_HELD when another consumer's lease is still live,
     *         CLAIM_STALE_AWAITING_READMISSION when the holder is presumed dead but the claim
     *         has not been swept yet (a takeover here would bypass the attempt bound),
     *         CLAIM_TERMINAL when the claim is already finished.
     */
    public CoordinationContracts.ExecutionLease claim(String claimId, String consumerRef,
            Duration ttl, Instant now, CoordinationContracts.TimeEvidence time) {
        requireText(consumerRef, "CONSUMER_REF");
        ExecutionLeaseManager.requireTrustedTime(now, time);
        Entry e = require(claimId);
        if (isTerminal(e.state)) throw new IllegalStateException("CLAIM_TERMINAL");
        if (e.state == ClaimState.CLAIMED) {
            CoordinationContracts.ExecutionLease held = leases.current(claimId);
            if (held != null && now.isBefore(held.expiresAt())) {
                throw new IllegalStateException("CLAIM_HELD");
            }
            // The holder is presumed dead, but silently taking over here would let a claim
            // be retried without ever incrementing the attempt counter — an unbounded retry
            // loop wearing the costume of a successful takeover. Readmission is recover()'s
            // job alone, so refuse and stay visible.
            throw new IllegalStateException("CLAIM_STALE_AWAITING_READMISSION");
        }
        CoordinationContracts.ExecutionLease lease = leases.acquire(claimId, consumerRef, ttl, now, time);
        e.state = ClaimState.CLAIMED;
        e.consumerRef = consumerRef;
        e.epoch = lease.epoch();
        e.attempts = e.attempts + 1;
        return lease;
    }

    /**
     * Writes a durable evidence receipt for work performed under a live lease.
     *
     * @throws SecurityException FENCED_STALE_EXECUTOR / LEASE_EXPIRED / LEASE_MISSING,
     *         raised by the fencing layer — an abandoned consumer cannot write.
     */
    public Receipt recordEvidence(String claimId, long epoch, String fenceToken,
            String receiptDigest, Instant now) {
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (e.state != ClaimState.CLAIMED) throw new IllegalStateException("CLAIM_NOT_IN_EXECUTION");
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");
        Receipt r = new Receipt(claimId, epoch, e.consumerRef, receiptDigest, now);
        e.receipts.add(r);
        return r;
    }

    /**
     * Closes a claim. Refuses to terminalize without an evidence receipt from this epoch,
     * so "done" always has something behind it.
     *
     * @throws IllegalStateException CLAIM_NO_EVIDENCE when no receipt exists for this epoch.
     */
    public void terminalize(String claimId, long epoch, String fenceToken,
            ClaimState outcome, Instant now) {
        if (outcome != ClaimState.DONE && outcome != ClaimState.FAILED) {
            throw new IllegalArgumentException("INVALID_TERMINAL_OUTCOME");
        }
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (e.state != ClaimState.CLAIMED) throw new IllegalStateException("CLAIM_NOT_IN_EXECUTION");
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");
        boolean evidenced = false;
        for (Receipt r : e.receipts) {
            if (r.epoch() == epoch) { evidenced = true; break; }
        }
        if (!evidenced) throw new IllegalStateException("CLAIM_NO_EVIDENCE");
        e.state = outcome;
        e.terminalReason = outcome == ClaimState.DONE ? "COMPLETED" : "EXECUTION_FAILED";
    }

    /**
     * Readmits abandoned claims, bounded by the attempt counter. This is the method the
     * governance records have described all along; it now exists and is called from
     * {@link Consumer#tick}.
     *
     * @return one {@code claimId:NEWSTATE} entry per claim whose state changed.
     */
    public List<String> recover(Instant now, CoordinationContracts.TimeEvidence time) {
        ExecutionLeaseManager.requireTrustedTime(now, time);
        List<String> changed = new ArrayList<>();
        for (Entry e : claims.values()) {
            if (e.state != ClaimState.CLAIMED) continue;
            CoordinationContracts.ExecutionLease held = leases.current(e.claimId);
            if (held != null && now.isBefore(held.expiresAt())) continue; // consumer still alive
            if (e.attempts >= maxAttempts) {
                e.state = ClaimState.DEAD;
                e.terminalReason = "ATTEMPT_LIMIT_EXHAUSTED";
                e.consumerRef = null;
                changed.add(e.claimId + ":DEAD");
            } else {
                e.state = ClaimState.READY;
                e.consumerRef = null;
                changed.add(e.claimId + ":READY");
            }
        }
        return changed;
    }

    public List<String> readyClaimIds() {
        List<String> out = new ArrayList<>();
        for (Entry e : claims.values()) {
            if (e.state == ClaimState.READY) out.add(e.claimId);
        }
        return out;
    }

    public ClaimView view(String claimId) {
        Entry e = require(claimId);
        return new ClaimView(e.claimId, e.payloadDigest, e.state, e.attempts,
                e.consumerRef, e.epoch, e.terminalReason);
    }

    public List<Receipt> receipts(String claimId) {
        return Collections.unmodifiableList(require(claimId).receipts);
    }

    private Entry require(String claimId) {
        requireText(claimId, "CLAIM_ID");
        Entry e = claims.get(claimId);
        if (e == null) throw new IllegalStateException("CLAIM_NOT_FOUND");
        return e;
    }

    private static boolean isTerminal(ClaimState s) {
        return s == ClaimState.DONE || s == ClaimState.FAILED || s == ClaimState.DEAD;
    }

    private static void requireText(String s, String code) {
        if (s == null || s.isBlank()) throw new IllegalArgumentException("MISSING_" + code);
    }

    /**
     * The claim consumer: recovers abandoned claims, then takes and executes one claim,
     * writing a receipt and terminalizing it.
     *
     * <p>{@code tick()} calls {@link ClaimLedger#recover} first, every time. Recovery that
     * only runs when someone remembers to call it is the failure this whole subsystem
     * exists to prevent, so the ordering is structural rather than conventional.
     *
     * <p>Work is dispatched through {@link Dispatch}, which keeps this class independent of
     * how execution actually happens. The chosen executor is GitHub Actions — the tree
     * already runs 48 workflows with auth, scheduling, retries and durable artifacts — so
     * the production dispatch posts a workflow and returns its receipt digest. A failing
     * dispatch terminalizes FAILED with evidence rather than throwing away the attempt.
     */
    public static final class Consumer {

        /** Performs the delegated work and returns a receipt digest for the evidence trail. */
        public interface Dispatch {
            String execute(String claimId, String payloadDigest) throws Exception;
        }

        private final ClaimLedger ledger;
        private final Dispatch dispatch;
        private final String consumerRef;
        private final Duration ttl;

        public Consumer(ClaimLedger ledger, Dispatch dispatch, String consumerRef, Duration ttl) {
            this.ledger = Objects.requireNonNull(ledger, "ledger");
            this.dispatch = Objects.requireNonNull(dispatch, "dispatch");
            requireText(consumerRef, "CONSUMER_REF");
            this.consumerRef = consumerRef;
            this.ttl = Objects.requireNonNull(ttl, "ttl");
        }

        /**
         * One scheduler iteration: recover abandoned claims, then execute at most one
         * READY claim to completion.
         *
         * @return the claim id handled, or null when there was nothing to do.
         */
        public String tick(Instant now, CoordinationContracts.TimeEvidence time) {
            ledger.recover(now, time);

            List<String> ready = ledger.readyClaimIds();
            if (ready.isEmpty()) return null;
            String claimId = ready.get(0);

            CoordinationContracts.ExecutionLease lease =
                    ledger.claim(claimId, consumerRef, ttl, now, time);
            ClaimView v = ledger.view(claimId);

            String digest;
            try {
                digest = dispatch.execute(claimId, v.payloadDigest());
            } catch (Exception failure) {
                String reason = failure.getClass().getSimpleName()
                        + ":" + String.valueOf(failure.getMessage());
                ledger.recordEvidence(claimId, lease.epoch(), lease.fenceToken(), reason, now);
                ledger.terminalize(claimId, lease.epoch(), lease.fenceToken(), ClaimState.FAILED, now);
                return claimId;
            }

            ledger.recordEvidence(claimId, lease.epoch(), lease.fenceToken(), digest, now);
            ledger.terminalize(claimId, lease.epoch(), lease.fenceToken(), ClaimState.DONE, now);
            return claimId;
        }
    }
}
