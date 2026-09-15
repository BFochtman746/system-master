package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;

import static org.systemmaster.core.CoordinationContracts.ExecutionLease;
import static org.systemmaster.core.CoordinationContracts.TimeEvidence;
import static org.systemmaster.core.CoordinationContracts.TimeStanding;

/**
 * Qualification for {@link SystemFileLeaseRegistry}.
 *
 * <p>The weight of this suite is deliberately on the negative proofs. The mechanisms
 * this layer replaces all "passed" in the sense that they never objected to anything:
 * the governance {@code *-LOCK-*.json} records validate that JSON agrees with JSON, and
 * the chat recovery gate was fully implemented but imported by nothing. A lock is only
 * demonstrated by watching it refuse — so every refusal path below asserts both that an
 * exception was raised and that it carried the specific contract code, because a test
 * that merely expects "some throw" passes for the wrong reason.
 */
public final class SystemFileLeaseRegistryTest {

    private static int passed = 0;
    private static int failed = 0;

    private static final String FILE = "governance/CURRENT-AUTHORITY.json";
    private static final Duration TTL = Duration.ofMinutes(10);

    public static void main(String[] args) {
        Instant t0 = Instant.parse("2026-09-14T20:00:00Z");

        // --- positive path -------------------------------------------------------
        check("admitted session acquires, commits, revision advances", () -> {
            SystemFileLeaseRegistry r = fresh();
            ExecutionLease lease = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            expect(lease.epoch() == 1, "first epoch must be 1, was " + lease.epoch());
            expect(!lease.fenceToken().isBlank(), "fence token must be issued");
            long rev = r.commitWrite(FILE, lease.epoch(), lease.fenceToken(), t0);
            expect(rev == 1, "revision must advance to 1, was " + rev);
            expect(r.currentRevision(FILE) == 1, "committed revision must persist");
        });

        // --- NEGATIVE 1: exclusion. Two concurrent chats, same file. --------------
        check("NEGATIVE second concurrent session is refused SYSTEM_FILE_LOCKED", () -> {
            SystemFileLeaseRegistry r = fresh();
            r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            String code = refusal(() -> r.acquireWriteLease(FILE, "chat-B", 0L, TTL, t0, time(t0)));
            expect(code.startsWith(SystemFileLeaseRegistry.LOCKED),
                    "expected SYSTEM_FILE_LOCKED, got: " + code);
            expect(code.contains("held_by=chat-A"), "refusal must name the holder, got: " + code);
        });

        // --- NEGATIVE 2: expected-revision precondition. -------------------------
        check("NEGATIVE stale expected revision is refused", () -> {
            SystemFileLeaseRegistry r = fresh();
            ExecutionLease a = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            r.commitWrite(FILE, a.epoch(), a.fenceToken(), t0);
            r.release(FILE, a.epoch(), a.fenceToken(), t0);
            // chat-B still believes the file is at revision 0 — the classic lost update.
            String code = refusal(() -> r.acquireWriteLease(FILE, "chat-B", 0L, TTL, t0.plusSeconds(1), time(t0.plusSeconds(1))));
            expect(code.startsWith(SystemFileLeaseRegistry.STALE_REVISION),
                    "expected STALE_EXPECTED_REVISION, got: " + code);
            expect(code.contains("expected=0") && code.contains("actual=1"),
                    "refusal must report both revisions, got: " + code);
        });

        // --- NEGATIVE 3: the required-response / recovery-contract gate. ---------
        check("NEGATIVE session with no recovery contract is refused", () -> {
            SystemFileLeaseRegistry r = new SystemFileLeaseRegistry(); // nobody admitted
            String code = refusal(() -> r.acquireWriteLease(FILE, "chat-ghost", 0L, TTL, t0, time(t0)));
            expect(code.startsWith(SystemFileLeaseRegistry.NO_CONTRACT),
                    "expected SESSION_CONTRACT_MISSING, got: " + code);
        });

        // --- NEGATIVE 4: fencing survives takeover. -----------------------------
        check("NEGATIVE lease taken over after expiry fences the old holder", () -> {
            SystemFileLeaseRegistry r = fresh();
            ExecutionLease a = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            Instant later = t0.plus(Duration.ofMinutes(11)); // A's lease has expired
            ExecutionLease b = r.acquireWriteLease(FILE, "chat-B", 0L, TTL, later, time(later));
            expect(b.epoch() == 2, "takeover must bump epoch to 2, was " + b.epoch());
            // A wakes up and tries to write through its dead lease.
            String code = refusal(() -> r.commitWrite(FILE, a.epoch(), a.fenceToken(), later));
            expect(code.contains("FENCED_STALE_EXECUTOR"),
                    "resurrected writer must be fenced, got: " + code);
            expect(r.currentRevision(FILE) == 0, "fenced writer must not have committed");
        });

        // --- NEGATIVE 5: path spellings must not split the lock. -----------------
        check("NEGATIVE alternate path spelling maps to the same lock", () -> {
            SystemFileLeaseRegistry r = fresh();
            r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            String code = refusal(() -> r.acquireWriteLease("./" + FILE, "chat-B", 0L, TTL, t0, time(t0)));
            expect(code.startsWith(SystemFileLeaseRegistry.LOCKED),
                    "'./' spelling must hit the same lock, got: " + code);
            String code2 = refusal(() -> r.acquireWriteLease("governance//CURRENT-AUTHORITY.json", "chat-B", 0L, TTL, t0, time(t0)));
            expect(code2.startsWith(SystemFileLeaseRegistry.LOCKED),
                    "'//' spelling must hit the same lock, got: " + code2);
        });

        check("NEGATIVE path traversal is rejected", () -> {
            String code = refusal(() -> SystemFileLeaseRegistry.normalizePath("governance/../../etc/passwd"));
            expect(code.contains("PATH_TRAVERSAL_REJECTED"), "expected traversal rejection, got: " + code);
        });

        // --- liveness and re-entrancy -------------------------------------------
        check("release lets another session acquire immediately", () -> {
            SystemFileLeaseRegistry r = fresh();
            ExecutionLease a = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            r.release(FILE, a.epoch(), a.fenceToken(), t0);
            Instant t1 = t0.plusSeconds(2);
            ExecutionLease b = r.acquireWriteLease(FILE, "chat-B", 0L, TTL, t1, time(t1));
            expect(b.ownerRef().equals("chat-B"), "chat-B must hold the lease after release");
            expect(b.epoch() > a.epoch(), "epoch must advance across handoff");
        });

        check("same session re-acquiring its own live lease is permitted", () -> {
            SystemFileLeaseRegistry r = fresh();
            r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            ExecutionLease again = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0.plusSeconds(1), time(t0.plusSeconds(1)));
            expect(again.ownerRef().equals("chat-A"), "same-session re-acquire must succeed");
        });

        check("distinct files do not block each other", () -> {
            SystemFileLeaseRegistry r = fresh();
            r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            ExecutionLease other = r.acquireWriteLease("governance/SYSTEM-TOPOLOGY-007.json", "chat-B", 0L, TTL, t0, time(t0));
            expect(other.ownerRef().equals("chat-B"), "per-file locking must not serialize the whole repo");
        });

        check("untrusted time is refused", () -> {
            SystemFileLeaseRegistry r = fresh();
            TimeEvidence bad = new TimeEvidence(t0, 1L, Duration.ofSeconds(30), TimeStanding.UNTRUSTED);
            String code = refusal(() -> r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, bad));
            expect(code.contains("UNTRUSTED_TIME"), "expected UNTRUSTED_TIME, got: " + code);
        });

        check("NEGATIVE released token cannot be replayed", () -> {
            SystemFileLeaseRegistry r = fresh();
            ExecutionLease a = r.acquireWriteLease(FILE, "chat-A", 0L, TTL, t0, time(t0));
            r.release(FILE, a.epoch(), a.fenceToken(), t0);
            // Still inside the original TTL, but the lease was handed back.
            String code = refusal(() -> r.commitWrite(FILE, a.epoch(), a.fenceToken(), t0.plusSeconds(1)));
            expect(code.startsWith(SystemFileLeaseRegistry.RELEASED),
                    "expected LEASE_RELEASED, got: " + code);
            expect(r.currentRevision(FILE) == 0, "replayed write must not commit");
        });

        System.out.println((failed == 0 ? "PASS" : "FAIL")
                + " SystemFileLeaseRegistry tests=" + passed + " failures=" + failed);
        if (failed > 0) {
            System.exit(1);
        }
    }

    private static SystemFileLeaseRegistry fresh() {
        SystemFileLeaseRegistry r = new SystemFileLeaseRegistry();
        r.admitSession("chat-A", "digest-a");
        r.admitSession("chat-B", "digest-b");
        return r;
    }

    private static TimeEvidence time(Instant now) {
        return new TimeEvidence(now, 1L, Duration.ofSeconds(30), TimeStanding.TRUSTED);
    }

    /** Runs a body expected to throw, returning the message so the CODE can be asserted. */
    private static String refusal(Runnable body) {
        try {
            body.run();
            return "NO_EXCEPTION_RAISED";
        } catch (RuntimeException e) {
            String m = e.getMessage();
            return m == null ? e.getClass().getSimpleName() : m;
        }
    }

    private static void expect(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void check(String name, Runnable body) {
        try {
            body.run();
            passed++;
            System.out.println("  PASS " + name);
        } catch (Throwable t) {
            failed++;
            System.out.println("  FAIL " + name + " -> " + t.getMessage());
        }
    }
}
