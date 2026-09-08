package org.systemmaster.continuity;

import org.systemmaster.continuity.RecoveryRecord.ExternalEffectUncertainty;
import org.systemmaster.continuity.RecoveryRecord.RecoveryState;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public final class RecoveryRegistry {
    private static final Map<RecoveryState, EnumSet<RecoveryState>> ALLOWED = transitions();
    private final ContinuityJournal journal;

    public RecoveryRegistry(Path storeDirectory) {
        this.journal = new ContinuityJournal(storeDirectory);
    }

    public OpenResult openRecovery(String workUnitId, long expectedWorkVersion, String interruptionRef) {
        String normalizedWork = required(workUnitId, "workUnitId");
        String normalizedInterruption = required(interruptionRef, "interruptionRef");
        if (expectedWorkVersion < 0) throw new IllegalArgumentException("expectedWorkVersion must be >= 0");
        String commandId = "open:" + normalizedWork + ":" + normalizedInterruption;
        String commandDigest = ContinuityJournal.digest(normalizedWork + "|" + expectedWorkVersion + "|" + normalizedInterruption);
        return journal.transact(snapshot -> {
            if (!snapshot.identities().containsKey(normalizedWork)) throw new RecoveryConflictException("unknown work_unit_id");
            ContinuityJournal.CommandReceipt receipt = snapshot.commands().get(commandId);
            if (receipt != null) {
                if (!receipt.digest().equals(commandDigest)) throw new RecoveryConflictException("open command identity collision");
                return ContinuityJournal.Decision.readOnly(new OpenResult(snapshot.recoveries().get(receipt.recoveryId()), true));
            }
            String activeId = snapshot.activeRecoveryByWork().get(normalizedWork);
            if (activeId != null) {
                RecoveryRecord active = snapshot.recoveries().get(activeId);
                if (active.interruptionRef().equals(normalizedInterruption) && active.expectedWorkVersion() == expectedWorkVersion) {
                    return ContinuityJournal.Decision.readOnly(new OpenResult(active, true));
                }
                throw new RecoveryConflictException("newer or different active recovery already exists");
            }
            long epoch = snapshot.maxEpoch().getOrDefault(normalizedWork, 0L) + 1L;
            String recoveryId = recoveryId(normalizedWork, epoch);
            Instant now = Instant.now();
            RecoveryRecord record = new RecoveryRecord(recoveryId, normalizedWork, expectedWorkVersion, epoch,
                    RecoveryState.DETECTED, normalizedInterruption, null, null, null, null,
                    ExternalEffectUncertainty.NONE, null, now, now, 1L);
            RecoveryEvent event = new RecoveryEvent(recoveryId, 1L, "RECOVERY_OPENED", now, now, "RecoveryRegistry",
                    normalizedInterruption, normalizedWork, commandDigest, List.of(normalizedInterruption));
            String payload = ContinuityJournal.recoveryFrame("O", record, event, commandId, commandDigest);
            return ContinuityJournal.Decision.append(new OpenResult(record, false), payload);
        });
    }

    public RecoveryRecord transitionRecovery(String recoveryId, long expectedVersion, RecoveryState fromState,
                                             RecoveryState toState, String reason, List<String> evidenceRefs,
                                             String commandId) {
        return transitionRecoveryWithLocalRetry(recoveryId, expectedVersion, fromState, toState, reason,
                evidenceRefs, commandId, 0, attempt -> {});
    }

    public RecoveryRecord transitionRecoveryWithLocalRetry(String recoveryId, long expectedVersion,
                                                            RecoveryState fromState, RecoveryState toState,
                                                            String reason, List<String> evidenceRefs,
                                                            String commandId, int maxRetries,
                                                            LocalFailureInjector injector) {
        if (maxRetries < 0) throw new IllegalArgumentException("maxRetries must be >= 0");
        Objects.requireNonNull(injector, "injector");
        RuntimeException last = null;
        for (int attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                injector.beforeLocalCommit(attempt);
                return transitionOnce(recoveryId, expectedVersion, fromState, toState, reason, evidenceRefs, commandId);
            } catch (TransientLocalTransactionException e) {
                last = e;
                if (attempt == maxRetries) throw e;
            }
        }
        throw last == null ? new IllegalStateException("unreachable") : last;
    }

    private RecoveryRecord transitionOnce(String recoveryId, long expectedVersion, RecoveryState fromState,
                                          RecoveryState toState, String reason, List<String> evidenceRefs,
                                          String commandId) {
        String rid = required(recoveryId, "recoveryId");
        String cid = required(commandId, "commandId");
        Objects.requireNonNull(fromState, "fromState");
        Objects.requireNonNull(toState, "toState");
        List<String> evidence = List.copyOf(evidenceRefs == null ? List.of() : evidenceRefs);
        String normalizedReason = reason == null ? "" : reason.trim();
        String digest = ContinuityJournal.digest(rid + "|" + expectedVersion + "|" + fromState + "|" + toState + "|" + normalizedReason + "|" + String.join(",", evidence));
        return journal.transact(snapshot -> {
            ContinuityJournal.CommandReceipt priorCommand = snapshot.commands().get(cid);
            if (priorCommand != null) {
                if (!priorCommand.digest().equals(digest)) throw new RecoveryConflictException("command_id reused with different transition");
                RecoveryRecord current = snapshot.recoveries().get(priorCommand.recoveryId());
                return ContinuityJournal.Decision.readOnly(current);
            }
            RecoveryRecord current = snapshot.recoveries().get(rid);
            if (current == null) throw new RecoveryConflictException("unknown recovery_id");
            if (current.version() != expectedVersion) throw new StaleRecoveryVersionException(expectedVersion, current.version());
            if (current.state() != fromState) throw new InvalidRecoveryTransitionException("from_state does not match authoritative state");
            if (!ALLOWED.getOrDefault(fromState, EnumSet.noneOf(RecoveryState.class)).contains(toState)) {
                throw new InvalidRecoveryTransitionException("illegal transition " + fromState + " -> " + toState);
            }
            Instant now = Instant.now();
            String blockedReason = switch (toState) {
                case WAITING_DEPENDENCY, BLOCKED, MANUAL_DECISION, QUARANTINED -> normalizedReason.isEmpty() ? toState.name() : normalizedReason;
                default -> null;
            };
            RecoveryRecord next = new RecoveryRecord(current.recoveryId(), current.workUnitId(), current.expectedWorkVersion(),
                    current.recoveryEpoch(), toState, current.interruptionRef(), current.classificationRef(), current.recoveryPlanRef(),
                    current.currentClaimRef(), current.checkpointRef(), current.externalEffectUncertainty(), blockedReason,
                    current.createdAt(), now, current.version() + 1L);
            long seq = snapshot.events().getOrDefault(rid, List.of()).size() + 1L;
            RecoveryEvent event = new RecoveryEvent(rid, seq, "RECOVERY_STATE_TRANSITION", now, now, "RecoveryRegistry",
                    cid, current.interruptionRef(), digest, evidence);
            return ContinuityJournal.Decision.append(next, ContinuityJournal.recoveryFrame("T", next, event, cid, digest));
        });
    }

    public Optional<RecoveryRecord> getRecovery(String recoveryId) {
        return Optional.ofNullable(journal.snapshot().recoveries().get(recoveryId));
    }

    public List<RecoveryEvent> getRecoveryEvents(String recoveryId) {
        return journal.snapshot().events().getOrDefault(recoveryId, List.of());
    }

    public RecoveryStatus getRecoveryStatus(String workUnitId) {
        String work = required(workUnitId, "workUnitId");
        ContinuityJournal.Snapshot snapshot = journal.snapshot();
        String active = snapshot.activeRecoveryByWork().get(work);
        RecoveryRecord record = active == null ? latestForWork(snapshot, work) : snapshot.recoveries().get(active);
        if (record == null) return RecoveryStatus.unavailable(work);
        String visible = switch (record.state()) {
            case WAITING_DEPENDENCY -> "WAITING";
            case BLOCKED -> "BLOCKED";
            case MANUAL_DECISION -> "MANUAL_DECISION";
            case QUARANTINED -> "QUARANTINED";
            case RECOVERED, TERMINAL_FAILED, CANCELLED_RECONCILED -> "TERMINAL";
            default -> record.state().name();
        };
        String recoverability = record.state().terminal() ? "TERMINAL" : "RECOVERABLE";
        List<String> blockers = record.blockedReason() == null ? List.of() : List.of(record.blockedReason());
        return new RecoveryStatus(work, record.state(), visible, recoverability, "DURABLE_RECOVERY_STATE",
                "UNKNOWN", blockers, "AUTHORITATIVE_CURRENT", record.version());
    }

    private static RecoveryRecord latestForWork(ContinuityJournal.Snapshot snapshot, String work) {
        RecoveryRecord best = null;
        for (RecoveryRecord record : snapshot.recoveries().values()) {
            if (!record.workUnitId().equals(work)) continue;
            if (best == null || record.recoveryEpoch() > best.recoveryEpoch()) best = record;
        }
        return best;
    }

    Path journalPath() { return journal.file(); }

    private static Map<RecoveryState, EnumSet<RecoveryState>> transitions() {
        Map<RecoveryState, EnumSet<RecoveryState>> m = new EnumMap<>(RecoveryState.class);
        m.put(RecoveryState.DETECTED, set(RecoveryState.CLASSIFYING, RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED,
                RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.CLASSIFYING, set(RecoveryState.PLAN_READY, RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED,
                RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.PLAN_READY, set(RecoveryState.CLAIMED, RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED,
                RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.CLAIMED, set(RecoveryState.RECONCILING, RecoveryState.RESTORING, RecoveryState.RESUMING,
                RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED, RecoveryState.MANUAL_DECISION,
                RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.RECONCILING, set(RecoveryState.RESTORING, RecoveryState.RESUMING, RecoveryState.VERIFYING,
                RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED, RecoveryState.MANUAL_DECISION,
                RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.RESTORING, set(RecoveryState.RESUMING, RecoveryState.VERIFYING, RecoveryState.WAITING_DEPENDENCY,
                RecoveryState.BLOCKED, RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED,
                RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.RESUMING, set(RecoveryState.VERIFYING, RecoveryState.WAITING_DEPENDENCY, RecoveryState.BLOCKED,
                RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.VERIFYING, set(RecoveryState.RECOVERED, RecoveryState.BLOCKED, RecoveryState.MANUAL_DECISION,
                RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.WAITING_DEPENDENCY, set(RecoveryState.CLASSIFYING, RecoveryState.PLAN_READY, RecoveryState.BLOCKED,
                RecoveryState.MANUAL_DECISION, RecoveryState.QUARANTINED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.BLOCKED, set(RecoveryState.CLASSIFYING, RecoveryState.PLAN_READY, RecoveryState.MANUAL_DECISION,
                RecoveryState.QUARANTINED, RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.MANUAL_DECISION, set(RecoveryState.PLAN_READY, RecoveryState.BLOCKED, RecoveryState.QUARANTINED,
                RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.QUARANTINED, set(RecoveryState.MANUAL_DECISION, RecoveryState.BLOCKED,
                RecoveryState.TERMINAL_FAILED, RecoveryState.CANCELLED_RECONCILED));
        m.put(RecoveryState.RECOVERED, set());
        m.put(RecoveryState.TERMINAL_FAILED, set());
        m.put(RecoveryState.CANCELLED_RECONCILED, set());
        return Map.copyOf(m);
    }

    @SafeVarargs
    private static EnumSet<RecoveryState> set(RecoveryState... values) {
        if (values.length == 0) return EnumSet.noneOf(RecoveryState.class);
        return EnumSet.of(values[0], java.util.Arrays.copyOfRange(values, 1, values.length));
    }

    private static String recoveryId(String workUnitId, long epoch) {
        String digest = sha256(workUnitId + "|" + epoch);
        return "recovery-" + digest.substring(0, 24);
    }
    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static String required(String value, String name) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required");
        return value.trim();
    }

    public record OpenResult(RecoveryRecord record, boolean idempotentExisting) {}
    public record RecoveryStatus(String workUnitId, RecoveryState recoveryState, String userVisibleState,
                                 String recoverability, String progressBasis, String checkpointAge,
                                 List<String> blockers, String evidenceFreshness, long recordVersion) {
        static RecoveryStatus unavailable(String workUnitId) {
            return new RecoveryStatus(workUnitId, null, "UNAVAILABLE", "UNKNOWN", "UNAVAILABLE",
                    "UNKNOWN", List.of("NO_RECOVERY_RECORD"), "UNAVAILABLE", 0L);
        }
    }

    @FunctionalInterface
    public interface LocalFailureInjector { void beforeLocalCommit(int attempt); }
    public static final class TransientLocalTransactionException extends RuntimeException {
        public TransientLocalTransactionException(String message) { super(message); }
    }
    public static final class RecoveryConflictException extends RuntimeException {
        public RecoveryConflictException(String message) { super(message); }
    }
    public static final class InvalidRecoveryTransitionException extends RuntimeException {
        public InvalidRecoveryTransitionException(String message) { super(message); }
    }
    public static final class StaleRecoveryVersionException extends RuntimeException {
        private final long expected;
        private final long actual;
        public StaleRecoveryVersionException(long expected, long actual) {
            super("stale recovery version: expected=" + expected + " actual=" + actual);
            this.expected = expected; this.actual = actual;
        }
        public long expected() { return expected; }
        public long actual() { return actual; }
    }
}
