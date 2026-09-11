package org.systemmaster.tools.review;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Hash-chained decision ledger. History is append-only; current state is derived, never overwritten. */
public final class ReviewDecisionLedger {
    public enum State { OPEN, ACCEPTED, REJECTED, DEFERRED }
    private final DocumentReviewGraph graph;
    private final String reviewGraphDigest;
    private final ArrayList<ReviewDecisionReceipt> receipts = new ArrayList<>();

    public ReviewDecisionLedger(DocumentReviewGraph graph) {
        if (graph == null) throw new IllegalArgumentException("review graph required");
        this.graph = graph;
        this.reviewGraphDigest = graph.digest();
    }

    public ReviewDecisionReceipt append(String changeId, ReviewDecisionReceipt.Decision decision, String actor, Instant at, String reason) {
        Objects.requireNonNull(decision, "decision"); Objects.requireNonNull(at, "at"); graph.requireChange(changeId);
        if (!receipts.isEmpty() && at.isBefore(receipts.getLast().decidedAt())) throw new IllegalStateException("review decision time moved backwards");
        State current = stateOf(changeId);
        if (decision == ReviewDecisionReceipt.Decision.REOPEN && current == State.OPEN) throw new IllegalStateException("cannot reopen an open change");
        if (decision != ReviewDecisionReceipt.Decision.REOPEN && current != State.OPEN) throw new IllegalStateException("resolved change must be reopened before a new decision");
        String prev = receipts.isEmpty() ? null : receipts.getLast().receiptDigest();
        ReviewDecisionReceipt receipt = ReviewDecisionReceipt.create(reviewGraphDigest, changeId, decision, actor, at, reason, prev);
        receipts.add(receipt);
        return receipt;
    }

    public List<ReviewDecisionReceipt> receipts() { return List.copyOf(receipts); }
    public String reviewGraphDigest() { return reviewGraphDigest; }

    public Map<String,State> states() {
        LinkedHashMap<String,State> states = new LinkedHashMap<>();
        for (ReviewChange c : graph.changes()) states.put(c.changeId(), State.OPEN);
        String expectedPrev = null;
        for (ReviewDecisionReceipt r : receipts) {
            if (!Objects.equals(expectedPrev, r.previousReceiptDigest())) throw new IllegalStateException("review decision chain broken");
            graph.requireChange(r.changeId());
            State current = states.get(r.changeId());
            State next = switch (r.decision()) {
                case ACCEPT -> State.ACCEPTED;
                case REJECT -> State.REJECTED;
                case DEFER -> State.DEFERRED;
                case REOPEN -> State.OPEN;
            };
            if (r.decision() == ReviewDecisionReceipt.Decision.REOPEN && current == State.OPEN) throw new IllegalStateException("cannot reopen an open change");
            if (r.decision() != ReviewDecisionReceipt.Decision.REOPEN && current != State.OPEN) throw new IllegalStateException("decision sequence skipped reopen");
            states.put(r.changeId(), next);
            expectedPrev = r.receiptDigest();
        }
        return Map.copyOf(states);
    }

    private State stateOf(String changeId) { return states().get(changeId); }
}
