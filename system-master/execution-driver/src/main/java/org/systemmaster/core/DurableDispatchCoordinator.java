package org.systemmaster.core;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Crash-safe production dispatch state machine.
 *
 * <p>The durable chain is strictly:
 * READY -> CLAIMED -> DISPATCH_PREPARED -> DISPATCHED -> DONE/FAILED.
 * Only the process that wins the CLAIMED -> DISPATCH_PREPARED CAS may POST. A process
 * that merely observes DISPATCH_PREPARED after a restart may only reconcile the exact
 * dispatch id; it can never redispatch.
 */
public final class DurableDispatchCoordinator {

    public static final int SCHEMA_VERSION = 1;
    private static final int MAX_CAS_RETRIES = 8;

    public enum State { READY, CLAIMED, DISPATCH_PREPARED, DISPATCHED, DONE, FAILED }

    /** Persistent, flat JSON record. Revision/CAS metadata lives in Versioned, not here. */
    public record ClaimRecord(
            int schemaVersion,
            String claimId,
            String payloadDigest,
            State state,
            int attempts,
            long epoch,
            String fenceToken,
            String consumerRef,
            String dispatchId,
            Instant claimedAt,
            Instant preparedAt,
            Instant dispatchedAt,
            Long runId,
            String runStatus,
            String runConclusion,
            String terminalReason,
            String lastError,
            Instant updatedAt) {

        public ClaimRecord {
            if (schemaVersion != SCHEMA_VERSION) throw new IllegalStateException("STATE_SCHEMA_UNSUPPORTED");
            requireText(claimId, "CLAIM_ID");
            requireText(payloadDigest, "PAYLOAD_DIGEST");
            Objects.requireNonNull(state, "state");
            Objects.requireNonNull(updatedAt, "updatedAt");
            if (attempts < 0) throw new IllegalStateException("STATE_INVALID_ATTEMPTS");
            if (epoch < 0) throw new IllegalStateException("STATE_INVALID_EPOCH");

            if (state == State.READY) {
                if (attempts != 0 || epoch != 0) throw new IllegalStateException("STATE_READY_HAS_AUTHORITY");
                if (dispatchId != null) throw new IllegalStateException("STATE_READY_HAS_DISPATCH_ID");
            } else {
                if (attempts < 1 || epoch < 1) throw new IllegalStateException("STATE_ACTIVE_MISSING_EPOCH");
                requireText(fenceToken, "FENCE_TOKEN");
                requireText(consumerRef, "CONSUMER_REF");
                Objects.requireNonNull(claimedAt, "claimedAt");
            }

            if (state == State.DISPATCH_PREPARED || state == State.DISPATCHED
                    || state == State.DONE || state == State.FAILED) {
                requireText(dispatchId, "DISPATCH_ID");
                Objects.requireNonNull(preparedAt, "preparedAt");
            }
            if (state == State.DISPATCHED || state == State.DONE || state == State.FAILED) {
                Objects.requireNonNull(dispatchedAt, "dispatchedAt");
            }
            if (state == State.DONE || state == State.FAILED) {
                if (runId == null || runId < 1) throw new IllegalStateException("STATE_TERMINAL_MISSING_RUN_ID");
                if (!"completed".equals(runStatus)) throw new IllegalStateException("STATE_TERMINAL_NOT_COMPLETED");
                requireText(runConclusion, "RUN_CONCLUSION");
                requireText(terminalReason, "TERMINAL_REASON");
            }
        }

        public static ClaimRecord ready(String claimId, String payloadDigest, Instant now) {
            return new ClaimRecord(SCHEMA_VERSION, claimId, payloadDigest, State.READY,
                    0, 0, null, null, null, null, null, null,
                    null, null, null, null, null, now);
        }

        ClaimRecord claimed(String consumer, String fence, Instant now) {
            requireTransition(state, State.CLAIMED);
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, State.CLAIMED,
                    attempts + 1, epoch + 1, fence, consumer, null, now, null, null,
                    null, null, null, null, null, now);
        }

        ClaimRecord prepared(String id, Instant now) {
            requireTransition(state, State.DISPATCH_PREPARED);
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, State.DISPATCH_PREPARED,
                    attempts, epoch, fenceToken, consumerRef, id, claimedAt, now, null,
                    null, null, null, null, null, now);
        }

        ClaimRecord dispatched(Instant now) {
            if (state != State.DISPATCH_PREPARED) throw new IllegalStateException("STATE_INVALID_TRANSITION");
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, State.DISPATCHED,
                    attempts, epoch, fenceToken, consumerRef, dispatchId, claimedAt, preparedAt, now,
                    runId, runStatus, runConclusion, null, null, now);
        }

        ClaimRecord withRunId(long id, Instant now) {
            if (state != State.DISPATCHED) throw new IllegalStateException("STATE_RUN_ID_REQUIRES_DISPATCHED");
            if (id < 1) throw new IllegalArgumentException("INVALID_RUN_ID");
            if (runId != null && runId.longValue() != id) throw new IllegalStateException("STATE_RUN_ID_MISMATCH");
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, state,
                    attempts, epoch, fenceToken, consumerRef, dispatchId, claimedAt, preparedAt, dispatchedAt,
                    id, runStatus, runConclusion, terminalReason, lastError, now);
        }

        ClaimRecord terminal(State terminal, long id, String conclusion, String reason, Instant now) {
            if (state != State.DISPATCHED) throw new IllegalStateException("STATE_TERMINAL_REQUIRES_DISPATCHED");
            if (terminal != State.DONE && terminal != State.FAILED) {
                throw new IllegalArgumentException("INVALID_TERMINAL_STATE");
            }
            requireText(conclusion, "RUN_CONCLUSION");
            requireText(reason, "TERMINAL_REASON");
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, terminal,
                    attempts, epoch, fenceToken, consumerRef, dispatchId, claimedAt, preparedAt, dispatchedAt,
                    id, "completed", conclusion, reason, null, now);
        }

        ClaimRecord withError(String error, Instant now) {
            requireText(error, "LAST_ERROR");
            if (state == State.DONE || state == State.FAILED) return this;
            return new ClaimRecord(schemaVersion, claimId, payloadDigest, state,
                    attempts, epoch, fenceToken, consumerRef, dispatchId, claimedAt, preparedAt, dispatchedAt,
                    runId, runStatus, runConclusion, terminalReason, error, now);
        }

        public String toJson() {
            return "{\n"
                    + kv("schema_version", Integer.toString(schemaVersion), false) + ",\n"
                    + kv("claim_id", claimId, true) + ",\n"
                    + kv("payload_digest", payloadDigest, true) + ",\n"
                    + kv("state", state.name(), true) + ",\n"
                    + kv("attempts", Integer.toString(attempts), false) + ",\n"
                    + kv("epoch", Long.toString(epoch), false) + ",\n"
                    + nullable("fence_token", fenceToken) + ",\n"
                    + nullable("consumer_ref", consumerRef) + ",\n"
                    + nullable("dispatch_id", dispatchId) + ",\n"
                    + nullable("claimed_at", text(claimedAt)) + ",\n"
                    + nullable("prepared_at", text(preparedAt)) + ",\n"
                    + nullable("dispatched_at", text(dispatchedAt)) + ",\n"
                    + (runId == null ? "  \"run_id\":null" : kv("run_id", Long.toString(runId), false)) + ",\n"
                    + nullable("run_status", runStatus) + ",\n"
                    + nullable("run_conclusion", runConclusion) + ",\n"
                    + nullable("terminal_reason", terminalReason) + ",\n"
                    + nullable("last_error", lastError) + ",\n"
                    + kv("updated_at", updatedAt.toString(), true) + "\n}\n";
        }

        public static ClaimRecord fromJson(String json) {
            if (json == null || json.isBlank()) throw new IllegalStateException("STATE_CORRUPT_EMPTY");
            try {
                int schema = Integer.parseInt(requiredRaw(json, "schema_version"));
                String id = requiredString(json, "claim_id");
                String payload = requiredString(json, "payload_digest");
                State state = State.valueOf(requiredString(json, "state"));
                int attempts = Integer.parseInt(requiredRaw(json, "attempts"));
                long epoch = Long.parseLong(requiredRaw(json, "epoch"));
                String fence = optionalString(json, "fence_token");
                String consumer = optionalString(json, "consumer_ref");
                String dispatch = optionalString(json, "dispatch_id");
                Instant claimed = instant(optionalString(json, "claimed_at"));
                Instant prepared = instant(optionalString(json, "prepared_at"));
                Instant dispatched = instant(optionalString(json, "dispatched_at"));
                String runRaw = optionalRaw(json, "run_id");
                Long run = runRaw == null ? null : Long.valueOf(runRaw);
                String status = optionalString(json, "run_status");
                String conclusion = optionalString(json, "run_conclusion");
                String terminal = optionalString(json, "terminal_reason");
                String error = optionalString(json, "last_error");
                Instant updated = Instant.parse(requiredString(json, "updated_at"));
                ClaimRecord parsed = new ClaimRecord(schema, id, payload, state, attempts, epoch, fence,
                        consumer, dispatch, claimed, prepared, dispatched, run, status,
                        conclusion, terminal, error, updated);
                if (!json.equals(parsed.toJson())) {
                    throw new IllegalStateException("STATE_CORRUPT_NON_CANONICAL");
                }
                return parsed;
            } catch (IllegalStateException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalStateException("STATE_CORRUPT", e);
            }
        }

        private static Instant instant(String value) {
            return value == null ? null : Instant.parse(value);
        }

        private static void requireTransition(State from, State to) {
            boolean ok = (from == State.READY && to == State.CLAIMED)
                    || (from == State.CLAIMED && to == State.DISPATCH_PREPARED);
            if (!ok) throw new IllegalStateException("STATE_INVALID_TRANSITION");
        }
    }

    public record Versioned(ClaimRecord record, String revision) {
        public Versioned {
            Objects.requireNonNull(record, "record");
            requireText(revision, "REVISION");
        }
    }

    public interface Store {
        Versioned load(String claimId) throws Exception;
        Versioned save(String expectedRevision, ClaimRecord next) throws Exception;
    }

    public static final class CasConflictException extends Exception {
        public CasConflictException(String message) { super(message); }
    }

    public interface Dispatch {
        void preflight() throws Exception;
        String newDispatchId();
        String post(String claimId, String payloadDigest, String dispatchId) throws Exception;
    }

    public enum DiscoveryStatus { FOUND, NOT_FOUND }

    public record Discovery(DiscoveryStatus status, long runId) {
        public Discovery {
            Objects.requireNonNull(status, "status");
            if (status == DiscoveryStatus.FOUND && runId < 1) {
                throw new IllegalArgumentException("INVALID_RUN_ID");
            }
            if (status == DiscoveryStatus.NOT_FOUND && runId != 0) {
                throw new IllegalArgumentException("NOT_FOUND_HAS_RUN_ID");
            }
        }
        public static Discovery found(long runId) { return new Discovery(DiscoveryStatus.FOUND, runId); }
        public static Discovery notFound() { return new Discovery(DiscoveryStatus.NOT_FOUND, 0); }
    }

    public record Completion(long runId, String status, String conclusion, String evidenceDigest) {
        public Completion {
            if (runId < 1) throw new IllegalArgumentException("INVALID_RUN_ID");
            requireText(status, "RUN_STATUS");
            requireText(conclusion, "RUN_CONCLUSION");
            requireText(evidenceDigest, "EVIDENCE_DIGEST");
        }
    }

    public interface Reconciler {
        Discovery discover(String claimId, String dispatchId) throws Exception;
        Completion await(String claimId, String dispatchId, long runId) throws Exception;
    }

    public interface Clock { Instant now(); }
    public interface FenceSource { String next(); }

    public record DriveResult(String claimId, State state, String disposition, boolean needsAttention) { }

    private final Store store;
    private final Dispatch dispatch;
    private final Reconciler reconciler;
    private final Clock clock;
    private final FenceSource fences;
    private final String consumerRef;

    public DurableDispatchCoordinator(Store store, Dispatch dispatch, Reconciler reconciler,
            Clock clock, String consumerRef) {
        this(store, dispatch, reconciler, clock, () -> UUID.randomUUID().toString(), consumerRef);
    }

    public DurableDispatchCoordinator(Store store, Dispatch dispatch, Reconciler reconciler,
            Clock clock, FenceSource fences, String consumerRef) {
        this.store = Objects.requireNonNull(store, "store");
        this.dispatch = Objects.requireNonNull(dispatch, "dispatch");
        this.reconciler = Objects.requireNonNull(reconciler, "reconciler");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.fences = Objects.requireNonNull(fences, "fences");
        requireText(consumerRef, "CONSUMER_REF");
        this.consumerRef = consumerRef;
    }

    /** Drives exactly one claim until it reaches a safe wait point or terminal state. */
    public DriveResult drive(String claimId, String payloadDigest) throws Exception {
        requireText(claimId, "CLAIM_ID");
        requireText(payloadDigest, "PAYLOAD_DIGEST");

        Versioned current = loadOrCreateReady(claimId, payloadDigest);
        for (int retry = 0; retry < MAX_CAS_RETRIES; retry++) {
            ClaimRecord r = current.record();
            if (!payloadDigest.equals(r.payloadDigest())) {
                throw new IllegalStateException("STATE_PAYLOAD_DIGEST_MISMATCH");
            }

            switch (r.state()) {
                case READY -> {
                    ClaimRecord next = r.claimed(consumerRef, fence(), clock.now());
                    current = casOrReload(current, next);
                }
                case CLAIMED -> {
                    dispatch.preflight();
                    String dispatchId = dispatch.newDispatchId();
                    requireText(dispatchId, "DISPATCH_ID");
                    ClaimRecord prepared = r.prepared(dispatchId, clock.now());
                    Versioned won;
                    try {
                        won = store.save(current.revision(), prepared);
                    } catch (CasConflictException conflict) {
                        current = requireLoaded(claimId);
                        continue;
                    }

                    try {
                        dispatch.post(claimId, payloadDigest, dispatchId);
                    } catch (Exception ambiguousOrRejected) {
                        safeRecordError(won, error(ambiguousOrRejected));
                        return new DriveResult(claimId, State.DISPATCH_PREPARED,
                                "PREPARED_UNCERTAIN_NO_REDISPATCH", true);
                    }

                    ClaimRecord dispatched = won.record().dispatched(clock.now());
                    try {
                        current = store.save(won.revision(), dispatched);
                    } catch (CasConflictException conflict) {
                        current = requireLoaded(claimId);
                    }
                }
                case DISPATCH_PREPARED -> {
                    Discovery d;
                    try {
                        d = reconciler.discover(claimId, r.dispatchId());
                    } catch (Exception failure) {
                        safeRecordError(current, error(failure));
                        return new DriveResult(claimId, State.DISPATCH_PREPARED,
                                "PREPARED_RECONCILIATION_BLOCKED", true);
                    }
                    if (d.status() == DiscoveryStatus.NOT_FOUND) {
                        safeRecordError(current, "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW");
                        return new DriveResult(claimId, State.DISPATCH_PREPARED,
                                "PREPARED_UNCERTAIN_NO_REDISPATCH", true);
                    }
                    ClaimRecord dispatched = r.dispatched(clock.now()).withRunId(d.runId(), clock.now());
                    current = casOrReload(current, dispatched);
                }
                case DISPATCHED -> {
                    if (r.runId() == null) {
                        Discovery d;
                        try {
                            d = reconciler.discover(claimId, r.dispatchId());
                        } catch (Exception failure) {
                            safeRecordError(current, error(failure));
                            return new DriveResult(claimId, State.DISPATCHED,
                                    "DISPATCHED_RECONCILIATION_BLOCKED", true);
                        }
                        if (d.status() == DiscoveryStatus.NOT_FOUND) {
                            safeRecordError(current, "DISPATCH_RUN_NOT_FOUND_WITHIN_WINDOW");
                            return new DriveResult(claimId, State.DISPATCHED,
                                    "DISPATCHED_AWAITING_RUN_VISIBILITY", false);
                        }
                        current = casOrReload(current, r.withRunId(d.runId(), clock.now()));
                        continue;
                    }

                    Completion c;
                    try {
                        c = reconciler.await(claimId, r.dispatchId(), r.runId());
                    } catch (Exception failure) {
                        safeRecordError(current, error(failure));
                        return new DriveResult(claimId, State.DISPATCHED,
                                "DISPATCHED_AWAITING_COMPLETION", true);
                    }
                    if (c.runId() != r.runId()) throw new IllegalStateException("COMPLETION_RUN_ID_MISMATCH");
                    if (!"completed".equals(c.status())) throw new IllegalStateException("COMPLETION_NOT_TERMINAL");
                    State terminal = "success".equals(c.conclusion()) ? State.DONE : State.FAILED;
                    String reason = (terminal == State.DONE
                            ? "COMPLETED"
                            : "RUN_NON_SUCCESS:" + c.conclusion())
                            + " EVIDENCE=" + c.evidenceDigest();
                    ClaimRecord done = r.terminal(terminal, c.runId(), c.conclusion(), reason, clock.now());
                    current = casOrReload(current, done);
                }
                case DONE -> {
                    return new DriveResult(claimId, State.DONE, "TERMINAL_NO_READMISSION", false);
                }
                case FAILED -> {
                    return new DriveResult(claimId, State.FAILED, "TERMINAL_NO_READMISSION", true);
                }
            }
        }
        throw new IllegalStateException("STATE_CAS_RETRY_EXHAUSTED");
    }

    private Versioned loadOrCreateReady(String claimId, String payloadDigest) throws Exception {
        Versioned loaded = store.load(claimId);
        if (loaded != null) return loaded;
        ClaimRecord ready = ClaimRecord.ready(claimId, payloadDigest, clock.now());
        try {
            return store.save(null, ready);
        } catch (CasConflictException conflict) {
            return requireLoaded(claimId);
        }
    }

    private Versioned casOrReload(Versioned current, ClaimRecord next) throws Exception {
        try {
            return store.save(current.revision(), next);
        } catch (CasConflictException conflict) {
            return requireLoaded(next.claimId());
        }
    }

    private Versioned requireLoaded(String claimId) throws Exception {
        Versioned loaded = store.load(claimId);
        if (loaded == null) throw new IllegalStateException("STATE_DISAPPEARED");
        return loaded;
    }

    private void safeRecordError(Versioned current, String message) {
        try {
            store.save(current.revision(), current.record().withError(message, clock.now()));
        } catch (Exception ignored) {
        }
    }

    private String fence() {
        String value = fences.next();
        requireText(value, "FENCE_TOKEN");
        return value;
    }

    private static String error(Exception failure) {
        return failure.getClass().getSimpleName() + ":" + String.valueOf(failure.getMessage());
    }

    private static String kv(String key, String value, boolean quoted) {
        return "  \"" + key + "\":" + (quoted ? "\"" + esc(value) + "\"" : value);
    }

    private static String nullable(String key, String value) {
        return value == null ? "  \"" + key + "\":null" : kv(key, value, true);
    }

    private static String text(Instant value) { return value == null ? null : value.toString(); }

    private static final Pattern FIELD = Pattern.compile(
            "\\\"([^\\\"]+)\\\"\\s*:\\s*(null|\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"|-?[0-9]+)");

    private static String requiredString(String json, String key) {
        String value = optionalString(json, key);
        if (value == null) throw new IllegalStateException("STATE_CORRUPT_MISSING_" + key.toUpperCase());
        return value;
    }

    private static String optionalString(String json, String key) {
        Matcher m = field(json, key);
        if (m == null || "null".equals(m.group(2))) return null;
        if (m.group(3) == null) throw new IllegalStateException("STATE_CORRUPT_TYPE_" + key.toUpperCase());
        return unesc(m.group(3));
    }

    private static String requiredRaw(String json, String key) {
        String value = optionalRaw(json, key);
        if (value == null) throw new IllegalStateException("STATE_CORRUPT_MISSING_" + key.toUpperCase());
        return value;
    }

    private static String optionalRaw(String json, String key) {
        Matcher m = field(json, key);
        if (m == null || "null".equals(m.group(2))) return null;
        if (m.group(3) != null) throw new IllegalStateException("STATE_CORRUPT_TYPE_" + key.toUpperCase());
        return m.group(2);
    }

    private static Matcher field(String json, String key) {
        Matcher m = FIELD.matcher(json);
        while (m.find()) if (key.equals(m.group(1))) return m;
        return null;
    }

    private static String esc(String value) {
        StringBuilder out = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.toString();
    }

    private static String unesc(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c != '\\') { out.append(c); continue; }
            if (++i >= value.length()) throw new IllegalStateException("STATE_CORRUPT_ESCAPE");
            char e = value.charAt(i);
            switch (e) {
                case '"', '\\', '/' -> out.append(e);
                case 'b' -> out.append('\b');
                case 'f' -> out.append('\f');
                case 'n' -> out.append('\n');
                case 'r' -> out.append('\r');
                case 't' -> out.append('\t');
                case 'u' -> {
                    if (i + 4 >= value.length()) throw new IllegalStateException("STATE_CORRUPT_ESCAPE");
                    try { out.append((char) Integer.parseInt(value.substring(i + 1, i + 5), 16)); }
                    catch (NumberFormatException e2) { throw new IllegalStateException("STATE_CORRUPT_ESCAPE", e2); }
                    i += 4;
                }
                default -> throw new IllegalStateException("STATE_CORRUPT_ESCAPE");
            }
        }
        return out.toString();
    }

    private static void requireText(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("MISSING_" + code);
    }
}
