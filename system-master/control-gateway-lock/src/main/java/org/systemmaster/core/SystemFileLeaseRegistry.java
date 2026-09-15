package org.systemmaster.core;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import static org.systemmaster.core.CoordinationContracts.ExecutionLease;
import static org.systemmaster.core.CoordinationContracts.TimeEvidence;

/**
 * Single-writer admission for system files.
 *
 * <p>WHY THIS EXISTS. The repository already contained three pieces of real
 * concurrency machinery and still had no mutual exclusion:
 *
 * <ul>
 *   <li>{@link ExecutionLeaseManager} issues monotonic epochs and fence tokens, and
 *       rejects a <em>stale</em> writer via {@code requireMutationAuthority}.</li>
 *   <li>{@code ChangeRegistry} (F-WP-002) implements optimistic concurrency with an
 *       expected-revision precondition.</li>
 *   <li>The {@code *-LOCK-*.json} governance records freeze <em>ownership decisions</em>
 *       ("which subsystem owns which lane"). They are locked-in decisions, not mutexes:
 *       they cannot refuse a write, and they are validated only after a push.</li>
 * </ul>
 *
 * <p>The gap was precise. {@code ExecutionLeaseManager.acquire} unconditionally
 * increments the epoch and grants the lease — correct for <em>taking over</em> from a
 * dead executor, but it means a second concurrent session is never refused admission.
 * Fencing answers "is this writer current?"; it never answers "may a second writer
 * start at all?". This class adds that second question — exclusion — and delegates
 * fencing and revision checks to the implementations that already prove those
 * semantics, rather than introducing a second lock implementation.
 *
 * <p>Liveness is preserved deliberately: once a lease expires it may be taken over,
 * which bumps the epoch and thereby renders the previous holder's fence token stale.
 * A crashed session therefore cannot deadlock a file forever, and a resurrected one
 * cannot write through a lease it no longer holds.
 *
 * <p>This class is not thread-safe by itself; callers serialize through the gateway.
 */
public final class SystemFileLeaseRegistry {

    /** Refused because another session currently holds the file. */
    public static final String LOCKED = "SYSTEM_FILE_LOCKED";
    /** Refused because the writer's base revision is no longer current. */
    public static final String STALE_REVISION = "STALE_EXPECTED_REVISION";
    /** Refused because no recovery contract was presented for the session. */
    public static final String NO_CONTRACT = "SESSION_CONTRACT_MISSING";

    /** Refused because the lease was explicitly released and cannot be replayed. */
    public static final String RELEASED = "LEASE_RELEASED";

    private final ExecutionLeaseManager leases = new ExecutionLeaseManager();
    private final Map<String, Long> revisions = new HashMap<>();
    private final Map<String, String> admittedSessions = new HashMap<>();

    /**
     * Highest epoch explicitly released per path.
     *
     * <p>Release state lives here rather than in {@link ExecutionLeaseManager} because
     * that class is intentionally monotonic: {@code restore} only ever accepts a higher
     * epoch or a later expiry, so an attempt to hand it an early-expiring lease to
     * simulate release is silently discarded and the file stays locked forever. Keeping
     * release in this layer preserves the manager's monotonicity — which is what makes
     * fence tokens trustworthy — while still allowing prompt handoff.
     */
    private final Map<String, Long> releasedEpoch = new HashMap<>();

    /**
     * Normalizes a repository-relative system-file path into a lock key.
     * Two spellings of the same file must never yield two different locks, or the
     * exclusion is vacuous.
     */
    public static String normalizePath(String path) {
        Objects.requireNonNull(path, "path");
        String p = path.trim().replace('\\', '/');
        while (p.startsWith("./")) p = p.substring(2);
        while (p.startsWith("/")) p = p.substring(1);
        while (p.contains("//")) p = p.replace("//", "/");
        if (p.isEmpty()) throw new IllegalArgumentException("EMPTY_SYSTEM_FILE_PATH");
        if (p.contains("../")) throw new IllegalArgumentException("PATH_TRAVERSAL_REJECTED");
        return p;
    }

    /**
     * Admits a session by recording its recovery-contract digest. A session that has
     * not been admitted cannot acquire a lease, which is what converts the required
     * chat-response contract from documentation into a gate.
     */
    public void admitSession(String sessionRef, String recoveryContractDigest) {
        requireText(sessionRef, "sessionRef");
        requireText(recoveryContractDigest, "recoveryContractDigest");
        admittedSessions.put(sessionRef, recoveryContractDigest);
    }

    public boolean isAdmitted(String sessionRef) {
        return sessionRef != null && admittedSessions.containsKey(sessionRef);
    }

    /** Current committed revision for a file; 0 when the file has never been written. */
    public long currentRevision(String path) {
        return revisions.getOrDefault(normalizePath(path), 0L);
    }

    public ExecutionLease currentLease(String path) {
        return leases.current(normalizePath(path));
    }

    /**
     * Claims exclusive write authority over one system file.
     *
     * @throws SecurityException {@link #NO_CONTRACT} when the session was never admitted,
     *         {@link #LOCKED} when a live lease is held by a different session, or
     *         {@link #STALE_REVISION} when expectedRevision is not the current revision.
     */
    public ExecutionLease acquireWriteLease(String path, String sessionRef, long expectedRevision,
                                            Duration ttl, Instant now, TimeEvidence time) {
        String key = normalizePath(path);
        requireText(sessionRef, "sessionRef");

        // (d) The required-response gate. An unadmitted session is refused before it
        // can touch a file, rather than being asked politely in a Markdown contract.
        if (!isAdmitted(sessionRef)) {
            throw new SecurityException(NO_CONTRACT + ":" + sessionRef);
        }

        // (b) Exclusion — the piece that did not exist anywhere in the repository.
        // A lease counts as held only while it is unexpired AND not explicitly released.
        ExecutionLease held = leases.current(key);
        if (held != null && now.isBefore(held.expiresAt())
                && !isReleased(key, held.epoch())
                && !held.ownerRef().equals(sessionRef)) {
            throw new SecurityException(LOCKED + ":" + key + ":held_by=" + held.ownerRef());
        }

        // (c) Expected-revision precondition, same semantics ChangeRegistry proves.
        long actual = revisions.getOrDefault(key, 0L);
        if (expectedRevision != actual) {
            throw new SecurityException(STALE_REVISION + ":" + key
                    + ":expected=" + expectedRevision + ":actual=" + actual);
        }

        return leases.acquire(key, sessionRef, ttl, now, time);
    }

    /** Fencing check, delegated to the implementation that already proves it. */
    public void requireWriteAuthority(String path, long epoch, String fenceToken, Instant now) {
        String key = normalizePath(path);
        // A released token must never be replayable, even before its TTL elapses.
        if (isReleased(key, epoch)) throw new SecurityException(RELEASED + ":" + key + ":epoch=" + epoch);
        leases.requireMutationAuthority(key, epoch, fenceToken, now);
    }

    private boolean isReleased(String key, long epoch) {
        Long r = releasedEpoch.get(key);
        return r != null && r >= epoch;
    }

    /**
     * Commits a write under a held lease and advances the file's revision.
     * @return the new revision.
     */
    public long commitWrite(String path, long epoch, String fenceToken, Instant now) {
        String key = normalizePath(path);
        requireWriteAuthority(key, epoch, fenceToken, now);
        long next = revisions.getOrDefault(key, 0L) + 1;
        revisions.put(key, next);
        return next;
    }

    /** Releases the lease so another session may acquire it without waiting for expiry. */
    public void release(String path, long epoch, String fenceToken, Instant now) {
        String key = normalizePath(path);
        requireWriteAuthority(key, epoch, fenceToken, now);
        releasedEpoch.merge(key, epoch, Math::max);
    }

    private static void requireText(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("BLANK_" + label);
    }
}
