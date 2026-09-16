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
 * <p>The remote-execution lifecycle is deliberately two phase:
 * {@code READY -> CLAIMED -> DISPATCHED -> (DONE | FAILED)}. A rejected dispatch may
 * terminalize {@code CLAIMED -> FAILED}; a successfully accepted remote dispatch must
 * become {@code DISPATCHED} before any completion waiter is invoked.
 *
 * <p>{@code DISPATCHED} is an execution fact, not a completion fact. It means the
 * executor accepted the work. The completion seam is separate so a GitHub
 * {@code workflow_dispatch} 204 can never by itself mean DONE.
 *
 * <p>The ledger is still in-memory. The ordering is therefore observable inside a
 * driver process, but crash/restart durability is not claimed here. Persistence must
 * make the same transition durable before this subsystem can claim restart safety.
 */
public final class ClaimLedger {

    /** Terminal states are DONE, FAILED and DEAD. */
    public enum ClaimState { READY, CLAIMED, DISPATCHED, DONE, FAILED, DEAD }

    /** Default bound on execution attempts before a claim is declared DEAD. */
    public static final int DEFAULT_MAX_ATTEMPTS = 3;

    /** Append-only evidence written under a fenced execution epoch. */
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

    /** Queues new work. A claim id is single-use. */
    public void submit(String claimId, String payloadDigest) {
        requireText(claimId, "CLAIM_ID");
        requireText(payloadDigest, "PAYLOAD_DIGEST");
        if (claims.containsKey(claimId)) throw new IllegalStateException("CLAIM_EXISTS");
        claims.put(claimId, new Entry(claimId, payloadDigest));
    }

    /** Takes exclusive possession of a READY claim. */
    public CoordinationContracts.ExecutionLease claim(String claimId, String consumerRef,
            Duration ttl, Instant now, CoordinationContracts.TimeEvidence time) {
        requireText(consumerRef, "CONSUMER_REF");
        ExecutionLeaseManager.requireTrustedTime(now, time);
        Entry e = require(claimId);
        if (isTerminal(e.state)) throw new IllegalStateException("CLAIM_TERMINAL");

        if (e.state == ClaimState.DISPATCHED) {
            // Remote work may still be running. Never redispatch merely because the local
            // lease aged out; completion reconciliation must resolve this state.
            throw new IllegalStateException("CLAIM_DISPATCHED_AWAITING_COMPLETION");
        }

        if (e.state == ClaimState.CLAIMED) {
            CoordinationContracts.ExecutionLease held = leases.current(claimId);
            if (held != null && now.isBefore(held.expiresAt())) {
                throw new IllegalStateException("CLAIM_HELD");
            }
            throw new IllegalStateException("CLAIM_STALE_AWAITING_READMISSION");
        }

        CoordinationContracts.ExecutionLease lease =
                leases.acquire(claimId, consumerRef, ttl, now, time);
        e.state = ClaimState.CLAIMED;
        e.consumerRef = consumerRef;
        e.epoch = lease.epoch();
        e.attempts = e.attempts + 1;
        return lease;
    }

    /**
     * Records successful dispatch acceptance and publishes DISPATCHED before any
     * completion waiter is allowed to run.
     */
    public Receipt markDispatched(String claimId, long epoch, String fenceToken,
            String dispatchReceiptDigest, Instant now) {
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (e.state != ClaimState.CLAIMED) {
            throw new IllegalStateException("CLAIM_NOT_CLAIMED_FOR_DISPATCH");
        }
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");
        Receipt receipt = appendReceipt(e, epoch, dispatchReceiptDigest, now);
        e.state = ClaimState.DISPATCHED;
        return receipt;
    }

    /**
     * Writes ordinary successful execution evidence under the live execution epoch.
     * Legacy callers historically used this method immediately before DONE, so when
     * called from CLAIMED it also publishes DISPATCHED. New remote execution should use
     * markDispatched() explicitly, which makes the acceptance boundary unambiguous.
     */
    public Receipt recordEvidence(String claimId, long epoch, String fenceToken,
            String receiptDigest, Instant now) {
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (e.state != ClaimState.CLAIMED && e.state != ClaimState.DISPATCHED) {
            throw new IllegalStateException("CLAIM_NOT_IN_EXECUTION");
        }
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");
        Receipt receipt = appendReceipt(e, epoch, receiptDigest, now);
        if (e.state == ClaimState.CLAIMED) e.state = ClaimState.DISPATCHED;
        return receipt;
    }

    /**
     * Closes a claim. DONE structurally requires DISPATCHED. FAILED may close either a
     * rejected CLAIMED dispatch or a DISPATCHED execution/completion failure.
     */
    public void terminalize(String claimId, long epoch, String fenceToken,
            ClaimState outcome, Instant now) {
        if (outcome != ClaimState.DONE && outcome != ClaimState.FAILED) {
            throw new IllegalArgumentException("INVALID_TERMINAL_OUTCOME");
        }
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");

        boolean evidenced = false;
        for (Receipt r : e.receipts) {
            if (r.epoch() == epoch) { evidenced = true; break; }
        }
        // Preserve the specific no-evidence refusal before evaluating state. Existing
        // callers and operators rely on this code to distinguish missing proof from an
        // illegal transition.
        if (!evidenced) throw new IllegalStateException("CLAIM_NO_EVIDENCE");

        if (outcome == ClaimState.DONE) {
            if (e.state != ClaimState.DISPATCHED) {
                throw new IllegalStateException("CLAIM_NOT_DISPATCHED");
            }
        } else if (e.state != ClaimState.CLAIMED && e.state != ClaimState.DISPATCHED) {
            throw new IllegalStateException("CLAIM_NOT_IN_EXECUTION");
        }

        e.state = outcome;
        e.terminalReason = outcome == ClaimState.DONE ? "COMPLETED" : "EXECUTION_FAILED";
    }

    /**
     * Readmits abandoned CLAIMED work. DISPATCHED work is deliberately excluded because
     * the remote executor may still be running it; completion reconciliation owns that
     * state and persistence must preserve it across process restart.
     */
    public List<String> recover(Instant now, CoordinationContracts.TimeEvidence time) {
        ExecutionLeaseManager.requireTrustedTime(now, time);
        List<String> changed = new ArrayList<>();
        for (Entry e : claims.values()) {
            if (e.state != ClaimState.CLAIMED) continue;
            CoordinationContracts.ExecutionLease held = leases.current(e.claimId);
            if (held != null && now.isBefore(held.expiresAt())) continue;
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

    private Receipt appendReceipt(Entry e, long epoch, String receiptDigest, Instant now) {
        Receipt r = new Receipt(e.claimId, epoch, e.consumerRef, receiptDigest, now);
        e.receipts.add(r);
        return r;
    }

    /** Failure evidence never promotes a rejected CLAIMED dispatch to DISPATCHED. */
    private Receipt recordFailureEvidence(String claimId, long epoch, String fenceToken,
            String receiptDigest, Instant now) {
        Entry e = require(claimId);
        leases.requireMutationAuthority(claimId, epoch, fenceToken, now);
        if (e.state != ClaimState.CLAIMED && e.state != ClaimState.DISPATCHED) {
            throw new IllegalStateException("CLAIM_NOT_IN_EXECUTION");
        }
        if (epoch != e.epoch) throw new SecurityException("FENCED_STALE_EXECUTOR");
        return appendReceipt(e, epoch, receiptDigest, now);
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

    /** Recovers, claims, dispatches, publishes DISPATCHED, then waits for completion. */
    public static final class Consumer {

        /** Dispatch only: success means the remote executor accepted the work. */
        public interface Dispatch {
            String execute(String claimId, String payloadDigest) throws Exception;
        }

        /**
         * Completion wait/reconciliation. It is invoked only after the ledger already
         * exposes DISPATCHED. A non-blank returned digest is appended as completion
         * evidence. Throwing records failure evidence and terminalizes FAILED.
         */
        public interface Completion {
            String await(String claimId, String payloadDigest, String dispatchReceiptDigest)
                    throws Exception;
        }

        private final ClaimLedger ledger;
        private final Dispatch dispatch;
        private final Completion completion;
        private final String consumerRef;
        private final Duration ttl;

        /**
         * Legacy synchronous constructor used by in-process qualifications. Remote
         * production wiring should supply an explicit Completion implementation.
         */
        public Consumer(ClaimLedger ledger, Dispatch dispatch, String consumerRef, Duration ttl) {
            this(ledger, dispatch, (claimId, payload, dispatchReceipt) -> null,
                    consumerRef, ttl);
        }

        public Consumer(ClaimLedger ledger, Dispatch dispatch, Completion completion,
                String consumerRef, Duration ttl) {
            this.ledger = Objects.requireNonNull(ledger, "ledger");
            this.dispatch = Objects.requireNonNull(dispatch, "dispatch");
            this.completion = Objects.requireNonNull(completion, "completion");
            requireText(consumerRef, "CONSUMER_REF");
            this.consumerRef = consumerRef;
            this.ttl = Objects.requireNonNull(ttl, "ttl");
        }

        /** One scheduler iteration, handling at most one READY claim. */
        public String tick(Instant now, CoordinationContracts.TimeEvidence time) {
            ledger.recover(now, time);

            List<String> ready = ledger.readyClaimIds();
            if (ready.isEmpty()) return null;
            String claimId = ready.get(0);

            CoordinationContracts.ExecutionLease lease =
                    ledger.claim(claimId, consumerRef, ttl, now, time);
            ClaimView v = ledger.view(claimId);

            String dispatchDigest;
            try {
                dispatchDigest = dispatch.execute(claimId, v.payloadDigest());
            } catch (Exception failure) {
                recordFailureAndTerminalize(claimId, lease, failure, now);
                return claimId;
            }

            // This is the load-bearing ordering point. Once execute() returns, the
            // executor has accepted the work. Publish DISPATCHED before entering await().
            ledger.markDispatched(claimId, lease.epoch(), lease.fenceToken(),
                    dispatchDigest, now);

            try {
                String completionDigest = completion.await(claimId, v.payloadDigest(), dispatchDigest);
                if (completionDigest != null && !completionDigest.isBlank()) {
                    ledger.recordEvidence(claimId, lease.epoch(), lease.fenceToken(),
                            completionDigest, now);
                }
                ledger.terminalize(claimId, lease.epoch(), lease.fenceToken(), ClaimState.DONE, now);
            } catch (Exception failure) {
                recordFailureAndTerminalize(claimId, lease, failure, now);
            }
            return claimId;
        }

        private void recordFailureAndTerminalize(String claimId,
                CoordinationContracts.ExecutionLease lease, Exception failure, Instant now) {
            String reason = failure.getClass().getSimpleName()
                    + ":" + String.valueOf(failure.getMessage());
            ledger.recordFailureEvidence(claimId, lease.epoch(), lease.fenceToken(), reason, now);
            ledger.terminalize(claimId, lease.epoch(), lease.fenceToken(), ClaimState.FAILED, now);
        }
    }
}
