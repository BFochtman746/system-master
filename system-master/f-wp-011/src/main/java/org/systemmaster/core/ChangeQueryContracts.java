package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;

/** Immutable read-side contracts for F-WP-011. Projections never own authority. */
public final class ChangeQueryContracts {
    private ChangeQueryContracts() {}

    public enum Freshness { CURRENT, STALE, DEGRADED, UNKNOWN }
    public enum ProgressStanding { KNOWN, UNKNOWN }
    public enum CompletionStanding { NOT_TERMINAL, VERIFIED_SUCCEEDED, VERIFIED_RECOVERED, TERMINAL_FAILED, UNKNOWN }

    public record AuthoritativeChangeSnapshot(
            String changeId,
            long revision,
            String stateDigest,
            String riskClass,
            String approvalsDigest,
            String executionState,
            String recoveryEligibility,
            List<String> linkedIncidentIds,
            Instant authoritativeObservedAt,
            String evidenceFreshnessDigest,
            long durableMilestonesCompleted,
            long durableMilestonesTotal,
            CompletionStanding completionStanding) {
        public AuthoritativeChangeSnapshot {
            require(changeId, "changeId");
            if (revision < 0) throw new IllegalArgumentException("revision");
            ChangeQueryContracts.digest(stateDigest, "stateDigest");
            require(riskClass, "riskClass");
            ChangeQueryContracts.digest(approvalsDigest, "approvalsDigest");
            require(executionState, "executionState");
            require(recoveryEligibility, "recoveryEligibility");
            linkedIncidentIds = List.copyOf(Objects.requireNonNull(linkedIncidentIds, "linkedIncidentIds"));
            authoritativeObservedAt = Objects.requireNonNull(authoritativeObservedAt, "authoritativeObservedAt");
            ChangeQueryContracts.digest(evidenceFreshnessDigest, "evidenceFreshnessDigest");
            if (durableMilestonesCompleted < 0 || durableMilestonesTotal < 0 || durableMilestonesCompleted > durableMilestonesTotal)
                throw new IllegalArgumentException("milestones");
            completionStanding = Objects.requireNonNull(completionStanding, "completionStanding");
        }
        public String digest() {
            return sha256(changeId + "|" + revision + "|" + stateDigest + "|" + riskClass + "|" + approvalsDigest + "|" + executionState + "|" +
                    recoveryEligibility + "|" + String.join(",", linkedIncidentIds) + "|" + authoritativeObservedAt + "|" + evidenceFreshnessDigest + "|" +
                    durableMilestonesCompleted + "|" + durableMilestonesTotal + "|" + completionStanding);
        }
    }

    public record TimelineEvent(long sequence, String eventId, String kind, String eventDigest, Instant occurredAt) {
        public TimelineEvent {
            if (sequence < 0) throw new IllegalArgumentException("sequence");
            require(eventId, "eventId"); require(kind, "kind"); ChangeQueryContracts.digest(eventDigest, "eventDigest");
            occurredAt = Objects.requireNonNull(occurredAt, "occurredAt");
        }
    }

    public record TimelinePage(List<TimelineEvent> events, String nextCursor, long authoritativeRevision, Freshness freshness, String pageDigest) {
        public TimelinePage {
            events = List.copyOf(Objects.requireNonNull(events, "events"));
            if (authoritativeRevision < 0) throw new IllegalArgumentException("authoritativeRevision");
            freshness = Objects.requireNonNull(freshness, "freshness");
            ChangeQueryContracts.digest(pageDigest, "pageDigest");
        }
    }

    public record ChangeProjection(
            String changeId,
            long revision,
            Freshness freshness,
            String riskClass,
            String approvalsDigest,
            String executionState,
            String recoveryEligibility,
            List<String> linkedIncidentIds,
            String evidenceFreshnessDigest,
            ProgressStanding progressStanding,
            Integer progressPercent,
            CompletionStanding completionStanding,
            String authoritativeSnapshotDigest,
            Instant projectedAt) {
        public ChangeProjection {
            require(changeId, "changeId"); if (revision < 0) throw new IllegalArgumentException("revision");
            freshness = Objects.requireNonNull(freshness, "freshness"); require(riskClass, "riskClass"); ChangeQueryContracts.digest(approvalsDigest, "approvalsDigest");
            require(executionState, "executionState"); require(recoveryEligibility, "recoveryEligibility");
            linkedIncidentIds = List.copyOf(Objects.requireNonNull(linkedIncidentIds, "linkedIncidentIds"));
            ChangeQueryContracts.digest(evidenceFreshnessDigest, "evidenceFreshnessDigest"); progressStanding = Objects.requireNonNull(progressStanding, "progressStanding");
            if (progressStanding == ProgressStanding.UNKNOWN && progressPercent != null) throw new IllegalArgumentException("unknown_progress_has_percent");
            if (progressPercent != null && (progressPercent < 0 || progressPercent > 100)) throw new IllegalArgumentException("progressPercent");
            completionStanding = Objects.requireNonNull(completionStanding, "completionStanding"); ChangeQueryContracts.digest(authoritativeSnapshotDigest, "authoritativeSnapshotDigest");
            projectedAt = Objects.requireNonNull(projectedAt, "projectedAt");
        }
        public boolean mayAuthorizeMutation() { return false; }
    }

    static void require(String value, String name) { if (value == null || value.isBlank()) throw new IllegalArgumentException(name); }
    static void digest(String value, String name) { require(value, name); if (!value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + "_sha256"); }
    static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
