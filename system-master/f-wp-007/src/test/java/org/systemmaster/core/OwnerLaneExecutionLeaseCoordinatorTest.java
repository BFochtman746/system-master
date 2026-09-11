package org.systemmaster.core;

import java.time.*;
import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

public final class OwnerLaneExecutionLeaseCoordinatorTest {
    static int tests = 0;
    interface Throwing { void run() throws Exception; }
    static void check(boolean ok, String name) { tests++; if (!ok) throw new AssertionError(name); }
    static void throwsLike(Class<? extends Throwable> type, String text, Throwing r, String name) {
        tests++;
        try { r.run(); throw new AssertionError(name + ":NO_EXCEPTION"); }
        catch (Throwable t) {
            if (!type.isInstance(t) || !String.valueOf(t.getMessage()).contains(text)) {
                throw new AssertionError(name + ":" + t, t);
            }
        }
    }
    static TimeEvidence trusted(Instant now) { return new TimeEvidence(now, 1, Duration.ofSeconds(2), TimeStanding.TRUSTED); }
    static String sha(char c) { return String.valueOf(c).repeat(40); }

    public static void main(String[] args) throws Exception {
        Instant t = Instant.parse("2026-09-10T20:00:00Z");
        OwnerLaneExecutionLeaseCoordinator c = new OwnerLaneExecutionLeaseCoordinator();

        var fg = c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('a'),
            "book-writing-chat-v1", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(60), t, trusted(t));
        check(fg.lease().epoch() == 1, "first owner-lane epoch");
        check(c.inspect("SYSTEM_MASTER/BOOK").isPresent(), "claim visible to read-only inspection");
        check(c.readOnlyInspectionAllowed("SYSTEM_MASTER/BOOK"), "read-only inspection allowed");

        throwsLike(SecurityException.class, "OWNER_LANE_LEASE_HELD", () -> c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('a'),
            "second-shift-book", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.SECOND_SHIFT,
            Duration.ofSeconds(60), t.plusSeconds(1), trusted(t.plusSeconds(1))), "second shift blocked by foreground");

        throwsLike(SecurityException.class, "OWNER_LANE_LEASE_HELD", () -> c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-002", sha('a'),
            "other-chat", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(60), t.plusSeconds(2), trusted(t.plusSeconds(2))), "successor packet cannot steal live lane");

        c.requireMutationAuthority(fg, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('a'), t.plusSeconds(3));
        check(true, "exact mutation authority accepted");
        throwsLike(SecurityException.class, "CURRENT_PACKET_MISMATCH", () -> c.requireMutationAuthority(
            fg, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-OTHER", sha('a'), t.plusSeconds(3)), "packet drift rejected");
        throwsLike(SecurityException.class, "CANONICAL_BRANCH_MISMATCH", () -> c.requireMutationAuthority(
            fg, "SYSTEM_MASTER/BOOK", "main", "PACKET-001", sha('a'), t.plusSeconds(3)), "branch mismatch rejected");
        throwsLike(SecurityException.class, "BRANCH_HEAD_DRIFT", () -> c.requireMutationAuthority(
            fg, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('b'), t.plusSeconds(3)), "head drift rejected before mutation");

        var afterWrite = c.acknowledgeMutationResult(fg, sha('a'), sha('b'), t.plusSeconds(4));
        check(afterWrite.baseHeadSha().equals(sha('a')) && afterWrite.expectedHeadSha().equals(sha('b')), "head progression bound");
        throwsLike(SecurityException.class, "OWNER_LANE_STALE_OR_FOREIGN_CLAIM", () -> c.requireMutationAuthority(
            fg, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('b'), t.plusSeconds(5)), "pre-write claim stale after head advance");
        c.requireMutationAuthority(afterWrite, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-001", sha('b'), t.plusSeconds(5));
        check(true, "advanced exact head authorized");
        throwsLike(SecurityException.class, "PREVIOUS_HEAD_MISMATCH", () -> c.acknowledgeMutationResult(
            afterWrite, sha('a'), sha('c'), t.plusSeconds(5)), "cannot skip expected prior head");

        var renewed = c.renew(afterWrite, Duration.ofSeconds(90), t.plusSeconds(6), trusted(t.plusSeconds(6)));
        check(renewed.lease().epoch() == afterWrite.lease().epoch(), "renewal preserves epoch");
        check(renewed.lease().fenceToken().equals(afterWrite.lease().fenceToken()), "renewal preserves fence");

        var forged = new OwnerLaneExecutionLeaseCoordinator.OwnerLaneClaim(
            renewed.ownerPath(), renewed.canonicalBranch(), renewed.currentPacket(), renewed.baseHeadSha(), renewed.expectedHeadSha(),
            "intruder", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT, renewed.lease());
        throwsLike(SecurityException.class, "OWNER_LANE_STALE_OR_FOREIGN_CLAIM", () -> c.release(forged, t.plusSeconds(7)), "foreign holder cannot release");
        c.release(renewed, t.plusSeconds(7));
        check(c.inspect("SYSTEM_MASTER/BOOK").isEmpty(), "exact holder release succeeds");

        var ss = c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-002", sha('b'),
            "second-shift-book", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.SECOND_SHIFT,
            Duration.ofSeconds(20), t.plusSeconds(8), trusted(t.plusSeconds(8)));
        check(ss.lease().epoch() == 2, "released successor receives new epoch");
        throwsLike(SecurityException.class, "OWNER_LANE_LEASE_HELD", () -> c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-002", sha('b'),
            "foreground-return", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(20), t.plusSeconds(9), trusted(t.plusSeconds(9))), "foreground blocked by second shift");

        var replacement = c.claim(
            "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-002", sha('b'),
            "foreground-recovery", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(30), t.plusSeconds(29), trusted(t.plusSeconds(29)));
        check(replacement.lease().epoch() == 3, "expired claim replaced with new epoch");
        throwsLike(SecurityException.class, "OWNER_LANE_STALE_OR_FOREIGN_CLAIM", () -> c.requireMutationAuthority(
            ss, "SYSTEM_MASTER/BOOK", "book-system/control-v1", "PACKET-002", sha('b'), t.plusSeconds(30)), "expired prior holder remains fenced");

        var docs = c.claim(
            "SYSTEM_MASTER/DOCUMENTS", "documents/control-v1", "DOCS-001", sha('c'),
            "documents-chat", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(30), t.plusSeconds(30), trusted(t.plusSeconds(30)));
        check(docs.lease().epoch() == 1, "owner lanes have independent lease epochs");
        throwsLike(IllegalArgumentException.class, "UNKNOWN_OWNER_LANE", () -> c.claim(
            "SYSTEM_MASTER/PROSE", "prose/control-v1", "PROSE-001", sha('d'),
            "prose-chat", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(30), t.plusSeconds(30), trusted(t.plusSeconds(30))), "retired independent Prose lane cannot gain owner-lane claim");
        throwsLike(IllegalArgumentException.class, "HEAD_SHA_INVALID", () -> c.claim(
            "SYSTEM_MASTER/CORE", "main", "CORE-001", "not-a-sha",
            "core-chat", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(30), t.plusSeconds(30), trusted(t.plusSeconds(30))), "malformed head rejected");
        throwsLike(SecurityException.class, "UNTRUSTED_TIME", () -> c.claim(
            "SYSTEM_MASTER/LEARNING", "learning/control-v1", "LEARN-001", sha('e'),
            "learning-chat", OwnerLaneExecutionLeaseCoordinator.ExecutorMode.FOREGROUND_CHAT,
            Duration.ofSeconds(30), t.plusSeconds(30), new TimeEvidence(t.plusSeconds(30), 2, Duration.ofSeconds(2), TimeStanding.UNTRUSTED)), "trusted time still required");

        check(c.highestEpoch("SYSTEM_MASTER/BOOK") == 3, "highest epoch retained");
        check(c.highestEpoch("SYSTEM_MASTER/DOCUMENTS") == 1, "independent documents epoch retained");
        System.out.println("PASS OWNER-LANE-EXECUTION-LEASE-BINDING tests=" + tests);
    }
}
