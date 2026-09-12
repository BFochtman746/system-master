package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Objects;

/** Append-only decision event bound to a specific review graph digest. */
public record ReviewDecisionReceipt(
        String schemaVersion,
        String reviewGraphDigest,
        String changeId,
        Decision decision,
        String actor,
        Instant decidedAt,
        String reason,
        String previousReceiptDigest,
        String receiptDigest) {

    public static final String SCHEMA_V1 = "REVIEW-DECISION-1";
    public enum Decision { ACCEPT, REJECT, DEFER, REOPEN }

    public ReviewDecisionReceipt {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported decision schema");
        requireSha(reviewGraphDigest, "review graph");
        if (changeId == null || !changeId.matches("chg-[0-9a-f]{20}")) throw new IllegalArgumentException("invalid change id");
        Objects.requireNonNull(decision, "decision");
        if (actor == null || actor.isBlank() || actor.length() > 256) throw new IllegalArgumentException("actor required");
        Objects.requireNonNull(decidedAt, "decidedAt");
        reason = Objects.requireNonNullElse(reason, "");
        if (reason.length() > 16_384) throw new IllegalArgumentException("reason too long");
        if (previousReceiptDigest != null) requireSha(previousReceiptDigest, "previous receipt");
        requireSha(receiptDigest, "receipt");
        String expected = computeDigest(reviewGraphDigest, changeId, decision, actor, decidedAt, reason, previousReceiptDigest);
        if (!expected.equals(receiptDigest)) throw new IllegalArgumentException("receipt digest mismatch");
    }

    public static ReviewDecisionReceipt create(String reviewGraphDigest, String changeId, Decision decision, String actor,
                                               Instant decidedAt, String reason, String previousReceiptDigest) {
        String digest = computeDigest(reviewGraphDigest, changeId, decision, actor, decidedAt, Objects.requireNonNullElse(reason, ""), previousReceiptDigest);
        return new ReviewDecisionReceipt(SCHEMA_V1, reviewGraphDigest, changeId, decision, actor, decidedAt, reason, previousReceiptDigest, digest);
    }

    private static String computeDigest(String graph, String change, Decision decision, String actor, Instant at, String reason, String prev) {
        String canonical = SCHEMA_V1 + "|" + graph + "|" + change + "|" + decision + "|" + actor + "|" + at + "|" + reason + "|" + Objects.requireNonNullElse(prev, "");
        return ReviewDigests.sha256(canonical.getBytes(StandardCharsets.UTF_8));
    }
    private static void requireSha(String value, String name) { if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required"); }
}
