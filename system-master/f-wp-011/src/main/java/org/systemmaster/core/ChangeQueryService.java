package org.systemmaster.core;

import static org.systemmaster.core.ChangeQueryContracts.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Read-only projection service over authoritative 021F snapshots/events. */
public final class ChangeQueryService {
    public static final int MAX_PAGE_SIZE = 500;

    public ChangeProjection getChange(AuthoritativeChangeSnapshot snapshot, Long latestKnownRevision,
            boolean authoritativeStoreAvailable, Instant projectedAt) {
        Objects.requireNonNull(snapshot, "snapshot"); Objects.requireNonNull(projectedAt, "projectedAt");
        Freshness freshness;
        if (!authoritativeStoreAvailable) freshness = Freshness.DEGRADED;
        else if (latestKnownRevision == null) freshness = Freshness.UNKNOWN;
        else if (latestKnownRevision < 0) throw new IllegalArgumentException("latestKnownRevision");
        else if (snapshot.revision() < latestKnownRevision) freshness = Freshness.STALE;
        else if (snapshot.revision() == latestKnownRevision) freshness = Freshness.CURRENT;
        else throw new IllegalArgumentException("snapshot_ahead_of_authority");

        ProgressStanding progressStanding = snapshot.durableMilestonesTotal() == 0 ? ProgressStanding.UNKNOWN : ProgressStanding.KNOWN;
        Integer progressPercent = progressStanding == ProgressStanding.UNKNOWN ? null :
                Math.toIntExact((snapshot.durableMilestonesCompleted() * 100L) / snapshot.durableMilestonesTotal());
        CompletionStanding completion = authoritativeStoreAvailable ? snapshot.completionStanding() : CompletionStanding.UNKNOWN;

        return new ChangeProjection(snapshot.changeId(), snapshot.revision(), freshness, snapshot.riskClass(), snapshot.approvalsDigest(),
                snapshot.executionState(), snapshot.recoveryEligibility(), snapshot.linkedIncidentIds(), snapshot.evidenceFreshnessDigest(),
                progressStanding, progressPercent, completion, snapshot.digest(), projectedAt);
    }

    public TimelinePage getChangeTimeline(List<TimelineEvent> authoritativeEvents, long authoritativeRevision, int pageSize,
            String cursor, Freshness freshness) {
        Objects.requireNonNull(authoritativeEvents, "authoritativeEvents"); Objects.requireNonNull(freshness, "freshness");
        if (authoritativeRevision < 0) throw new IllegalArgumentException("authoritativeRevision");
        if (pageSize < 1 || pageSize > MAX_PAGE_SIZE) throw new IllegalArgumentException("pageSize");
        validateTimeline(authoritativeEvents);
        int start = cursor == null ? 0 : decodeCursor(cursor, authoritativeRevision);
        if (start > authoritativeEvents.size()) throw new IllegalArgumentException("cursor_out_of_range");
        int end = Math.min(start + pageSize, authoritativeEvents.size());
        List<TimelineEvent> page = List.copyOf(authoritativeEvents.subList(start, end));
        String next = end < authoritativeEvents.size() ? encodeCursor(authoritativeRevision, end) : null;
        String body = page.stream().map(e -> e.sequence()+":"+e.eventId()+":"+e.kind()+":"+e.eventDigest()+":"+e.occurredAt()).reduce("", (a,b)->a+"|"+b);
        String pageDigest = ChangeQueryContracts.sha256(authoritativeRevision + "|" + freshness + "|" + start + "|" + end + body);
        return new TimelinePage(page, next, authoritativeRevision, freshness, pageDigest);
    }

    private static void validateTimeline(List<TimelineEvent> events) {
        long previous = -1; Set<Long> seen = new HashSet<>();
        for (TimelineEvent e : events) {
            Objects.requireNonNull(e, "timelineEvent");
            if (!seen.add(e.sequence())) throw new IllegalArgumentException("duplicate_sequence");
            if (e.sequence() <= previous) throw new IllegalArgumentException("timeline_not_strictly_ordered");
            previous = e.sequence();
        }
    }

    private static String encodeCursor(long revision, int nextIndex) {
        String prefix = revision + ":" + nextIndex;
        return prefix + ":" + ChangeQueryContracts.sha256("F-WP-011|" + prefix);
    }

    private static int decodeCursor(String cursor, long authoritativeRevision) {
        String[] p = cursor.split(":", -1);
        if (p.length != 3) throw new IllegalArgumentException("malformed_cursor");
        long revision; int index;
        try { revision = Long.parseLong(p[0]); index = Integer.parseInt(p[1]); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("malformed_cursor", e); }
        if (revision != authoritativeRevision) throw new IllegalArgumentException("stale_cursor");
        if (index < 0) throw new IllegalArgumentException("cursor_index");
        String expected = ChangeQueryContracts.sha256("F-WP-011|" + p[0] + ":" + p[1]);
        if (!expected.equals(p[2])) throw new IllegalArgumentException("cursor_integrity");
        return index;
    }
}
