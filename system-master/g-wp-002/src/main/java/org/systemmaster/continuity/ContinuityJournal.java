package org.systemmaster.continuity;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

final class ContinuityJournal {
    private static final int MAGIC = 0x47575032; // GWP2
    private static final int MAX_FRAME = 4 * 1024 * 1024;
    private static final Map<Path, ReentrantLock> PROCESS_LOCKS = new ConcurrentHashMap<>();

    private final Path file;
    private final ReentrantLock processLock;

    ContinuityJournal(Path directory) {
        try {
            Files.createDirectories(Objects.requireNonNull(directory, "directory"));
        } catch (IOException e) {
            throw new StoreException("cannot create store directory", e);
        }
        this.file = directory.toAbsolutePath().normalize().resolve("continuity.journal");
        this.processLock = PROCESS_LOCKS.computeIfAbsent(file, ignored -> new ReentrantLock(true));
    }

    Path file() { return file; }

    Snapshot snapshot() {
        processLock.lock();
        try (FileChannel channel = FileChannel.open(file,
                StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
             FileLock ignored = channel.lock()) {
            return readLocked(channel);
        } catch (IOException e) {
            throw new StoreException("cannot read continuity journal", e);
        } finally {
            processLock.unlock();
        }
    }

    <T> T transact(Transaction<T> transaction) {
        processLock.lock();
        try (FileChannel channel = FileChannel.open(file,
                StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
             FileLock ignored = channel.lock()) {
            Snapshot snapshot = readLocked(channel);
            Decision<T> decision = transaction.apply(snapshot);
            if (decision.payload() != null) {
                appendLocked(channel, decision.payload());
            }
            return decision.result();
        } catch (IOException e) {
            throw new StoreException("continuity journal transaction failed", e);
        } finally {
            processLock.unlock();
        }
    }

    private Snapshot readLocked(FileChannel channel) throws IOException {
        long sizeLong = channel.size();
        if (sizeLong > Integer.MAX_VALUE) throw new CorruptJournalException("journal too large");
        byte[] all = new byte[(int) sizeLong];
        ByteBuffer target = ByteBuffer.wrap(all);
        channel.position(0);
        while (target.hasRemaining()) {
            int n = channel.read(target);
            if (n < 0) break;
        }
        State state = new State();
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(all))) {
            int consumed = 0;
            while (consumed < all.length) {
                if (all.length - consumed < 8 + 32) throw new CorruptJournalException("truncated frame header");
                int magic = in.readInt(); consumed += 4;
                if (magic != MAGIC) throw new CorruptJournalException("bad frame magic");
                int len = in.readInt(); consumed += 4;
                if (len < 1 || len > MAX_FRAME) throw new CorruptJournalException("invalid frame length");
                if (all.length - consumed < 32 + len) throw new CorruptJournalException("truncated frame payload");
                byte[] expectedHash = in.readNBytes(32); consumed += 32;
                byte[] payloadBytes = in.readNBytes(len); consumed += len;
                if (!MessageDigest.isEqual(expectedHash, sha256Bytes(payloadBytes))) {
                    throw new CorruptJournalException("frame checksum mismatch");
                }
                applyFrame(state, new String(payloadBytes, StandardCharsets.UTF_8));
            }
        }
        return state.freeze();
    }

    private void appendLocked(FileChannel channel, String payload) throws IOException {
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 1 || bytes.length > MAX_FRAME) throw new StoreException("invalid payload size");
        ByteBuffer frame = ByteBuffer.allocate(8 + 32 + bytes.length);
        frame.putInt(MAGIC).putInt(bytes.length).put(sha256Bytes(bytes)).put(bytes).flip();
        channel.position(channel.size());
        while (frame.hasRemaining()) channel.write(frame);
        channel.force(true);
    }

    private static void applyFrame(State state, String payload) {
        String[] p = payload.split("\\|", -1);
        if (p.length < 2) throw new CorruptJournalException("empty frame");
        switch (p[0]) {
            case "I" -> applyIdentity(state, p);
            case "O" -> applyRecovery(state, p, true);
            case "T" -> applyRecovery(state, p, false);
            default -> throw new CorruptJournalException("unknown frame type: " + p[0]);
        }
    }

    private static void applyIdentity(State state, String[] p) {
        if (p.length != 10) throw new CorruptJournalException("identity field count");
        DurableWorkIdentity identity = new DurableWorkIdentity(
                dec(p[2]), dec(p[3]), dec(p[4]), dec(p[1]), nullable(p[5]), dec(p[6]), dec(p[7]),
                Instant.ofEpochMilli(Long.parseLong(p[8])), dec(p[9]));
        DurableWorkIdentity prior = state.identities.putIfAbsent(identity.workUnitId(), identity);
        if (prior != null && !prior.equals(identity)) throw new CorruptJournalException("identity mutation detected");
    }

    private static void applyRecovery(State state, String[] p, boolean opening) {
        if (p.length != 27) throw new CorruptJournalException("recovery frame field count");
        int i = 1;
        RecoveryRecord r = new RecoveryRecord(
                dec(p[i++]), dec(p[i++]), Long.parseLong(p[i++]), Long.parseLong(p[i++]),
                RecoveryRecord.RecoveryState.valueOf(p[i++]), dec(p[i++]), nullable(p[i++]), nullable(p[i++]),
                nullable(p[i++]), nullable(p[i++]), RecoveryRecord.ExternalEffectUncertainty.valueOf(p[i++]),
                nullable(p[i++]), Instant.ofEpochMilli(Long.parseLong(p[i++])), Instant.ofEpochMilli(Long.parseLong(p[i++])),
                Long.parseLong(p[i++]));
        RecoveryEvent e = new RecoveryEvent(
                r.recoveryId(), Long.parseLong(p[i++]), dec(p[i++]), Instant.ofEpochMilli(Long.parseLong(p[i++])),
                Instant.ofEpochMilli(Long.parseLong(p[i++])), dec(p[i++]), nullable(p[i++]), nullable(p[i++]),
                dec(p[i++]), decList(p[i++]));
        String commandId = dec(p[i++]);
        String commandDigest = dec(p[i]);

        RecoveryRecord prior = state.recoveries.get(r.recoveryId());
        List<RecoveryEvent> priorEvents = state.events.computeIfAbsent(r.recoveryId(), ignored -> new ArrayList<>());
        if (opening) {
            if (prior != null || r.version() != 1 || e.eventSeq() != 1) throw new CorruptJournalException("invalid recovery open");
        } else {
            if (prior == null) throw new CorruptJournalException("transition without recovery");
            if (r.version() != prior.version() + 1) throw new CorruptJournalException("nonmonotonic recovery version");
            long expectedSeq = priorEvents.size() + 1L;
            if (e.eventSeq() != expectedSeq) throw new CorruptJournalException("nonmonotonic event sequence");
        }
        CommandReceipt old = state.commands.putIfAbsent(commandId, new CommandReceipt(commandDigest, r.recoveryId(), r.version()));
        if (old != null && !old.digest().equals(commandDigest)) throw new CorruptJournalException("command id digest collision");
        state.recoveries.put(r.recoveryId(), r);
        priorEvents.add(e);
        state.maxEpoch.merge(r.workUnitId(), r.recoveryEpoch(), Math::max);
        if (r.state().terminal()) state.activeRecoveryByWork.remove(r.workUnitId());
        else state.activeRecoveryByWork.put(r.workUnitId(), r.recoveryId());
    }

    static String identityFrame(DurableWorkIdentity i) {
        return String.join("|", "I", enc(i.workUnitId()), enc(i.taskId()), enc(i.workflowId()), enc(i.stageId()),
                encNullable(i.parentWorkUnitId()), enc(i.intentDigest()), enc(i.semanticOwnerRef()),
                Long.toString(i.createdAt().toEpochMilli()), enc(i.classification()));
    }

    static String recoveryFrame(String type, RecoveryRecord r, RecoveryEvent e, String commandId, String commandDigest) {
        return String.join("|", type,
                enc(r.recoveryId()), enc(r.workUnitId()), Long.toString(r.expectedWorkVersion()), Long.toString(r.recoveryEpoch()),
                r.state().name(), enc(r.interruptionRef()), encNullable(r.classificationRef()), encNullable(r.recoveryPlanRef()),
                encNullable(r.currentClaimRef()), encNullable(r.checkpointRef()), r.externalEffectUncertainty().name(),
                encNullable(r.blockedReason()), Long.toString(r.createdAt().toEpochMilli()), Long.toString(r.updatedAt().toEpochMilli()),
                Long.toString(r.version()), Long.toString(e.eventSeq()), enc(e.eventType()), Long.toString(e.eventTime().toEpochMilli()),
                Long.toString(e.recordedAt().toEpochMilli()), enc(e.actorRef()), encNullable(e.causationRef()),
                encNullable(e.correlationRef()), enc(e.payloadDigest()), encList(e.evidenceRefs()), enc(commandId), enc(commandDigest));
    }

    static String digest(String value) {
        return hex(sha256Bytes(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static byte[] sha256Bytes(byte[] bytes) {
        try { return MessageDigest.getInstance("SHA-256").digest(bytes); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    private static String enc(String value) {
        if (value == null) throw new IllegalArgumentException("cannot encode null");
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
    private static String encNullable(String value) { return value == null ? "~" : enc(value); }
    private static String dec(String value) {
        if (value.equals("~")) throw new CorruptJournalException("required value encoded null");
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }
    private static String nullable(String value) { return value.equals("~") ? null : dec(value); }
    private static String encList(List<String> values) { return enc(String.join("\u001e", values)); }
    private static List<String> decList(String value) {
        String decoded = dec(value);
        if (decoded.isEmpty()) return List.of();
        return List.of(decoded.split("\u001e", -1));
    }

    interface Transaction<T> { Decision<T> apply(Snapshot snapshot); }
    record Decision<T>(T result, String payload) {
        static <T> Decision<T> readOnly(T result) { return new Decision<>(result, null); }
        static <T> Decision<T> append(T result, String payload) { return new Decision<>(result, payload); }
    }
    record CommandReceipt(String digest, String recoveryId, long resultingVersion) {}

    static final class Snapshot {
        private final Map<String, DurableWorkIdentity> identities;
        private final Map<String, RecoveryRecord> recoveries;
        private final Map<String, List<RecoveryEvent>> events;
        private final Map<String, String> activeRecoveryByWork;
        private final Map<String, Long> maxEpoch;
        private final Map<String, CommandReceipt> commands;

        Snapshot(Map<String, DurableWorkIdentity> identities, Map<String, RecoveryRecord> recoveries,
                 Map<String, List<RecoveryEvent>> events, Map<String, String> activeRecoveryByWork,
                 Map<String, Long> maxEpoch, Map<String, CommandReceipt> commands) {
            this.identities = identities; this.recoveries = recoveries; this.events = events;
            this.activeRecoveryByWork = activeRecoveryByWork; this.maxEpoch = maxEpoch; this.commands = commands;
        }
        Map<String, DurableWorkIdentity> identities() { return identities; }
        Map<String, RecoveryRecord> recoveries() { return recoveries; }
        Map<String, List<RecoveryEvent>> events() { return events; }
        Map<String, String> activeRecoveryByWork() { return activeRecoveryByWork; }
        Map<String, Long> maxEpoch() { return maxEpoch; }
        Map<String, CommandReceipt> commands() { return commands; }
    }

    private static final class State {
        final Map<String, DurableWorkIdentity> identities = new LinkedHashMap<>();
        final Map<String, RecoveryRecord> recoveries = new LinkedHashMap<>();
        final Map<String, List<RecoveryEvent>> events = new HashMap<>();
        final Map<String, String> activeRecoveryByWork = new HashMap<>();
        final Map<String, Long> maxEpoch = new HashMap<>();
        final Map<String, CommandReceipt> commands = new HashMap<>();
        Snapshot freeze() {
            Map<String, List<RecoveryEvent>> frozenEvents = new HashMap<>();
            events.forEach((k,v) -> frozenEvents.put(k, List.copyOf(v)));
            return new Snapshot(Collections.unmodifiableMap(new LinkedHashMap<>(identities)),
                    Collections.unmodifiableMap(new LinkedHashMap<>(recoveries)), Collections.unmodifiableMap(frozenEvents),
                    Collections.unmodifiableMap(new HashMap<>(activeRecoveryByWork)), Collections.unmodifiableMap(new HashMap<>(maxEpoch)),
                    Collections.unmodifiableMap(new HashMap<>(commands)));
        }
    }

    static class StoreException extends RuntimeException {
        StoreException(String message) { super(message); }
        StoreException(String message, Throwable cause) { super(message, cause); }
    }
    static final class CorruptJournalException extends StoreException {
        CorruptJournalException(String message) { super(message); }
    }
}
