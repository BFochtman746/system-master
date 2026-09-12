package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.SystemAuthority.*;
import static org.systemmaster.foundation.root.SystemRootStore.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Crash-safe append-only journal adapter for the System Root authority.
 *
 * <p>Each committed frame contains the complete current authority state but only the new operation
 * receipt and event. Historical receipts/events are reconstructed by replaying frames. This keeps
 * each durable mutation independent of total event history while retaining exact audit/idempotency
 * history. A torn final frame is treated as uncommitted and removed before the next write; corruption
 * of any complete frame fails closed.</p>
 */
public final class FileSystemRootStore implements SystemRootStore {
    public static final String FORMAT = "SYSTEM_ROOT_JOURNAL_V2";
    private static final byte[] HEADER = (FORMAT + "\n").getBytes(StandardCharsets.UTF_8);
    private static final long MAX_JOURNAL_BYTES = 256L * 1024L * 1024L;
    private static final int MAX_FRAME_TEXT_BYTES = 8 * 1024 * 1024;
    private static final long AUTO_COMPACT_BYTES = 4L * 1024L * 1024L;

    @FunctionalInterface
    public interface FaultInjector {
        void beforeDurableAppend(Path journalPath, byte[] frameBytes) throws IOException;
    }

    private record CacheEntry(long size, FileTime modifiedTime, Object fileKey, long lastGoodOffset, RootSnapshot snapshot) {}
    private record ParsedJournal(RootSnapshot snapshot, long lastGoodOffset) {}
    private record FrameState(
            long revision,
            Map<String, SystemAuthority.Record> systems,
            Set<TopologyEdge> topology,
            Map<String, List<VersionPointer>> versionHistory,
            OperationReceipt receipt,
            Event event) {}

    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path dataPath;
    private final Path lockPath;
    private final FaultInjector faultInjector;
    private final Object localMutex;
    private volatile CacheEntry cache;

    public FileSystemRootStore(Path dataPath) throws IOException {
        this(dataPath, (path, frame) -> {});
    }

    public FileSystemRootStore(Path dataPath, FaultInjector faultInjector) throws IOException {
        this.dataPath = dataPath.toAbsolutePath().normalize();
        this.faultInjector = java.util.Objects.requireNonNull(faultInjector, "faultInjector");
        Path parent = this.dataPath.getParent();
        if (parent != null) Files.createDirectories(parent);
        this.lockPath = this.dataPath.resolveSibling(this.dataPath.getFileName() + ".lock");
        this.localMutex = JVM_LOCKS.computeIfAbsent(this.lockPath, ignored -> new Object());
    }

    @Override
    public RootSnapshot load() throws IOException {
        synchronized (localMutex) {
            try (FileChannel lockChannel = FileChannel.open(lockPath,
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock lock = lockChannel.lock()) {
                if (!lock.isValid()) throw new IOException("ROOT_STORE_LOCK_INVALID");
                return loadUnlocked().snapshot();
            }
        }
    }

    @Override
    public void save(long expectedStoreRevision, RootSnapshot next) throws IOException {
        if (expectedStoreRevision < 0) throw new IllegalArgumentException("expectedStoreRevision");
        if (next.storeRevision() != expectedStoreRevision + 1) {
            throw new IllegalArgumentException("next revision must equal expected + 1");
        }
        SystemRootRegistry.validateSnapshot(next);

        synchronized (localMutex) {
            try (FileChannel lockChannel = FileChannel.open(lockPath,
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock lock = lockChannel.lock()) {
                if (!lock.isValid()) throw new IOException("ROOT_STORE_LOCK_INVALID");
                ParsedJournal parsed = loadUnlocked();
                RootSnapshot current = parsed.snapshot();
                if (current.storeRevision() != expectedStoreRevision) {
                    throw new StaleStoreRevisionException(
                            "STALE_ROOT_STORE expected=" + expectedStoreRevision + " actual=" + current.storeRevision());
                }

                long currentSize = Files.exists(dataPath) ? Files.size(dataPath) : 0L;
                if (current.storeRevision() > 0 && currentSize > AUTO_COMPACT_BYTES
                        && parsed.lastGoodOffset() == currentSize) {
                    compactUnlocked(current);
                    parsed = new ParsedJournal(current, Files.size(dataPath));
                    currentSize = Files.size(dataPath);
                }

                byte[] frame = encodeFrame(next);
                faultInjector.beforeDurableAppend(dataPath, frame);

                long required = (currentSize == 0 ? HEADER.length : 0L) + frame.length;
                if (parsed.lastGoodOffset() < currentSize) {
                    required -= (currentSize - parsed.lastGoodOffset());
                    currentSize = parsed.lastGoodOffset();
                }
                if (currentSize + required > MAX_JOURNAL_BYTES) {
                    throw new IOException("SYSTEM_ROOT_JOURNAL_CAPACITY_EXCEEDED");
                }

                try (FileChannel channel = FileChannel.open(dataPath,
                        StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
                    if (channel.size() != parsed.lastGoodOffset()) {
                        channel.truncate(parsed.lastGoodOffset());
                    }
                    channel.position(channel.size());
                    if (channel.size() == 0) writeFully(channel, ByteBuffer.wrap(HEADER));
                    writeFully(channel, ByteBuffer.wrap(frame));
                    channel.force(true);
                }
                syncParentDirectory();
                cacheSnapshot(next, Files.size(dataPath));
            }
        }
    }

    /** Losslessly checkpoint the journal while preserving the complete audit/idempotency history. */
    public void compact() throws IOException {
        synchronized (localMutex) {
            try (FileChannel lockChannel = FileChannel.open(lockPath,
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock lock = lockChannel.lock()) {
                if (!lock.isValid()) throw new IOException("ROOT_STORE_LOCK_INVALID");
                ParsedJournal parsed = loadUnlocked();
                long size = Files.exists(dataPath) ? Files.size(dataPath) : 0L;
                if (parsed.lastGoodOffset() < size) {
                    try (FileChannel channel = FileChannel.open(dataPath, StandardOpenOption.WRITE)) {
                        channel.truncate(parsed.lastGoodOffset());
                        channel.force(true);
                    }
                }
                if (parsed.snapshot().storeRevision() > 0) compactUnlocked(parsed.snapshot());
            }
        }
    }

    private void compactUnlocked(RootSnapshot snapshot) throws IOException {
        byte[] checkpoint = encodeCheckpoint(snapshot);
        Path temp = dataPath.resolveSibling(dataPath.getFileName() + ".checkpoint-" + UUID.randomUUID());
        try {
            try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                writeFully(channel, ByteBuffer.wrap(HEADER));
                writeFully(channel, ByteBuffer.wrap(checkpoint));
                channel.force(true);
            }
            try {
                Files.move(temp, dataPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ex) {
                // Compaction is an optimization. Preserve the existing authoritative journal if the
                // platform cannot atomically replace it.
                return;
            }
            syncParentDirectory();
            cacheSnapshot(snapshot, Files.size(dataPath));
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private ParsedJournal loadUnlocked() throws IOException {
        if (!Files.exists(dataPath)) {
            cache = null;
            return new ParsedJournal(RootSnapshot.empty(), 0L);
        }
        long size = Files.size(dataPath);
        if (size > MAX_JOURNAL_BYTES) throw new CorruptRootStoreException("ROOT_JOURNAL_TOO_LARGE");
        BasicFileAttributes attrs = Files.readAttributes(dataPath, BasicFileAttributes.class);
        CacheEntry hit = cache;
        if (hit != null && hit.size() == size && hit.modifiedTime().equals(attrs.lastModifiedTime()) && java.util.Objects.equals(hit.fileKey(), attrs.fileKey())) {
            return new ParsedJournal(hit.snapshot(), hit.lastGoodOffset());
        }
        ParsedJournal parsed = parseJournal(Files.readAllBytes(dataPath));
        cache = new CacheEntry(size, attrs.lastModifiedTime(), attrs.fileKey(), parsed.lastGoodOffset(), parsed.snapshot());
        return parsed;
    }

    private ParsedJournal parseJournal(byte[] bytes) throws IOException {
        if (bytes.length == 0) return new ParsedJournal(RootSnapshot.empty(), 0L);
        int firstNewline = indexOf(bytes, (byte)'\n', 0);
        if (firstNewline < 0) {
            if (isPrefix(bytes, HEADER)) return new ParsedJournal(RootSnapshot.empty(), 0L);
            throw new CorruptRootStoreException("ROOT_JOURNAL_HEADER_TRUNCATED_OR_INVALID");
        }
        String header = new String(bytes, 0, firstNewline, StandardCharsets.UTF_8);
        if (!FORMAT.equals(header)) throw new CorruptRootStoreException("ROOT_JOURNAL_HEADER_INVALID");
        long lastGood = firstNewline + 1L;
        int offset = firstNewline + 1;

        Map<String, OperationReceipt> receipts = new LinkedHashMap<>();
        List<Event> events = new ArrayList<>();
        RootSnapshot current = RootSnapshot.empty();
        long expectedRevision = 1L;

        while (offset < bytes.length) {
            int newline = indexOf(bytes, (byte)'\n', offset);
            if (newline < 0) {
                // Recognized crash tail: incomplete bytes never became a committed frame.
                break;
            }
            int lineLength = newline - offset;
            if (lineLength == 0) throw new CorruptRootStoreException("EMPTY_ROOT_JOURNAL_FRAME");
            if (lineLength > MAX_FRAME_TEXT_BYTES) throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_TOO_LARGE");
            String line = new String(bytes, offset, lineLength, StandardCharsets.UTF_8);
            if (line.startsWith("CHECKPOINT\t")) {
                if (current.storeRevision() != 0 || !receipts.isEmpty() || !events.isEmpty()) {
                    throw new CorruptRootStoreException("CHECKPOINT_MUST_BE_FIRST_JOURNAL_RECORD");
                }
                RootSnapshot checkpoint = decodeCheckpointLine(line);
                current = checkpoint;
                receipts.putAll(checkpoint.operationReceipts());
                events.addAll(checkpoint.events());
                expectedRevision = checkpoint.storeRevision() + 1L;
                lastGood = newline + 1L;
                offset = newline + 1;
                continue;
            }
            FrameState frame = decodeFrameLine(line);
            if (frame.revision() != expectedRevision) {
                throw new CorruptRootStoreException("ROOT_JOURNAL_REVISION_GAP expected=" + expectedRevision
                        + " actual=" + frame.revision());
            }
            if (frame.event().sequence() != expectedRevision
                    || frame.receipt().resultingStoreRevision() != expectedRevision
                    || frame.receipt().eventSequence() != expectedRevision
                    || !frame.event().operationId().equals(frame.receipt().operationId())) {
                throw new CorruptRootStoreException("ROOT_JOURNAL_EVENT_RECEIPT_LINK_INVALID:" + expectedRevision);
            }
            OperationReceipt prior = receipts.putIfAbsent(frame.receipt().operationId(), frame.receipt());
            if (prior != null) throw new CorruptRootStoreException("DUPLICATE_OPERATION_ID_IN_JOURNAL:" + frame.receipt().operationId());
            events.add(frame.event());
            current = new RootSnapshot(frame.revision(), frame.systems(), frame.topology(), frame.versionHistory(), receipts, events);
            try {
                SystemRootRegistry.validateSnapshot(current);
            } catch (RuntimeException ex) {
                throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_STATE_INVALID:" + frame.revision(), ex);
            }
            expectedRevision++;
            lastGood = newline + 1L;
            offset = newline + 1;
        }
        return new ParsedJournal(current, lastGood);
    }

    private static byte[] encodeCheckpoint(RootSnapshot snapshot) throws IOException {
        byte[] plain = serialize(snapshot);
        byte[] compressed = gzip(plain);
        String line = "CHECKPOINT\t" + snapshot.storeRevision() + "\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString(compressed) + "\t"
                + sha256Bytes(plain) + "\n";
        byte[] bytes = line.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_FRAME_TEXT_BYTES) throw new IOException("ROOT_CHECKPOINT_TOO_LARGE");
        return bytes;
    }

    private static RootSnapshot decodeCheckpointLine(String line) throws IOException {
        String[] p = line.split("\t", -1);
        if (p.length != 4 || !"CHECKPOINT".equals(p[0])) throw new CorruptRootStoreException("ROOT_CHECKPOINT_MALFORMED");
        long revision;
        try { revision = Long.parseLong(p[1]); }
        catch (RuntimeException ex) { throw new CorruptRootStoreException("ROOT_CHECKPOINT_REVISION_INVALID", ex); }
        if (revision < 1 || !p[3].matches("[0-9a-f]{64}")) throw new CorruptRootStoreException("ROOT_CHECKPOINT_METADATA_INVALID");
        byte[] compressed;
        try { compressed = Base64.getUrlDecoder().decode(p[2]); }
        catch (IllegalArgumentException ex) { throw new CorruptRootStoreException("ROOT_CHECKPOINT_BASE64_INVALID", ex); }
        byte[] plain = gunzip(compressed);
        if (!sha256Bytes(plain).equals(p[3])) throw new CorruptRootStoreException("ROOT_CHECKPOINT_DIGEST_MISMATCH");
        RootSnapshot snapshot = parseCanonicalSnapshot(new String(plain, StandardCharsets.UTF_8));
        if (snapshot.storeRevision() != revision) throw new CorruptRootStoreException("ROOT_CHECKPOINT_REVISION_MISMATCH");
        return snapshot;
    }

    private static byte[] encodeFrame(RootSnapshot next) throws IOException {
        Event event = next.events().get(next.events().size() - 1);
        OperationReceipt receipt = next.operationReceipts().get(event.operationId());
        if (receipt == null) throw new IllegalArgumentException("last event has no receipt");
        String payload = serializeFramePayload(next, receipt, event);
        byte[] plain = payload.getBytes(StandardCharsets.UTF_8);
        byte[] compressed = gzip(plain);
        String line = "FRAME\t" + next.storeRevision() + "\t"
                + Base64.getUrlEncoder().withoutPadding().encodeToString(compressed) + "\t"
                + sha256Bytes(plain) + "\n";
        byte[] bytes = line.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_FRAME_TEXT_BYTES) throw new IOException("ROOT_JOURNAL_FRAME_TOO_LARGE");
        return bytes;
    }

    private static FrameState decodeFrameLine(String line) throws IOException {
        String[] p = line.split("\t", -1);
        if (p.length != 4 || !"FRAME".equals(p[0])) throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_MALFORMED");
        long revision;
        try { revision = Long.parseLong(p[1]); }
        catch (RuntimeException ex) { throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_REVISION_INVALID", ex); }
        if (revision < 1) throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_REVISION_INVALID");
        if (!p[3].matches("[0-9a-f]{64}")) throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_DIGEST_INVALID");
        byte[] compressed;
        try { compressed = Base64.getUrlDecoder().decode(p[2]); }
        catch (IllegalArgumentException ex) { throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_BASE64_INVALID", ex); }
        byte[] plain = gunzip(compressed);
        if (!sha256Bytes(plain).equals(p[3])) throw new CorruptRootStoreException("ROOT_JOURNAL_FRAME_DIGEST_MISMATCH");
        return parseFramePayload(new String(plain, StandardCharsets.UTF_8), revision);
    }

    private static String serializeFramePayload(RootSnapshot snapshot, OperationReceipt receipt, Event event) {
        StringBuilder body = new StringBuilder();
        body.append("STATE\t").append(snapshot.storeRevision()).append('\n');
        appendStateRows(body, snapshot);
        body.append("OP\t").append(enc(receipt.operationId())).append('\t')
                .append(receipt.requestDigest()).append('\t')
                .append(receipt.resultingStoreRevision()).append('\t')
                .append(receipt.eventSequence()).append('\t')
                .append(enc(receipt.resultRef())).append('\n');
        appendEvent(body, event);
        return body.toString();
    }

    private static FrameState parseFramePayload(String body, long outerRevision) throws IOException {
        try {
            String[] lines = body.split("\n", -1);
            if (lines.length < 4) throw new CorruptRootStoreException("ROOT_FRAME_TOO_SHORT");
            String[] state = lines[0].split("\t", -1);
            if (state.length != 2 || !"STATE".equals(state[0]) || Long.parseLong(state[1]) != outerRevision) {
                throw new CorruptRootStoreException("ROOT_FRAME_STATE_HEADER_INVALID");
            }

            record PendingSystem(
                    String systemId, String displayName, String canonicalQuestion, AuthorityKind kind, Lifecycle lifecycle,
                    long generation, int currentVersionIndex, AdmissionBasis basis, Instant declaredAt, Instant updatedAt,
                    String replacementSystemId, Set<String> truths, Set<String> negatives) {}

            Map<String, PendingSystem> pendingSystems = new LinkedHashMap<>();
            Map<String, List<VersionPointer>> versions = new LinkedHashMap<>();
            Set<TopologyEdge> edges = new LinkedHashSet<>();
            OperationReceipt receipt = null;
            Event event = null;

            for (int lineNo = 1; lineNo < lines.length; lineNo++) {
                String line = lines[lineNo];
                if (line.isEmpty()) continue;
                String[] p = line.split("\t", -1);
                switch (p[0]) {
                    case "SYSTEM" -> {
                        if (p.length != 16) throw new CorruptRootStoreException("SYSTEM_FIELD_COUNT");
                        AdmissionBasis basis = "-".equals(p[8]) ? null : new AdmissionBasis(dec(p[8]), dec(p[9]), dec(p[10]));
                        String replacement = "-".equals(p[13]) ? null : p[13];
                        Set<String> truths = p[14].isEmpty() ? Set.of() : Set.of(p[14].split(",", -1));
                        Set<String> negatives = decList(p[15]);
                        PendingSystem pending = new PendingSystem(
                                p[1], dec(p[2]), dec(p[3]), AuthorityKind.valueOf(p[4]), Lifecycle.valueOf(p[5]),
                                Long.parseLong(p[6]), Integer.parseInt(p[7]), basis,
                                Instant.parse(p[11]), Instant.parse(p[12]), replacement, truths, negatives);
                        if (pendingSystems.putIfAbsent(pending.systemId(), pending) != null) {
                            throw new CorruptRootStoreException("DUPLICATE_SYSTEM:" + pending.systemId());
                        }
                    }
                    case "VERSION" -> {
                        if (p.length != 7) throw new CorruptRootStoreException("VERSION_FIELD_COUNT");
                        int index = Integer.parseInt(p[2]);
                        List<VersionPointer> list = versions.computeIfAbsent(p[1], ignored -> new ArrayList<>());
                        if (index != list.size()) throw new CorruptRootStoreException("VERSION_SEQUENCE:" + p[1]);
                        list.add(new VersionPointer(dec(p[3]), p[4], dec(p[5]), p[6]));
                    }
                    case "EDGE" -> {
                        if (p.length != 5) throw new CorruptRootStoreException("EDGE_FIELD_COUNT");
                        TopologyEdge edge = new TopologyEdge(p[1], p[2], EdgeKind.valueOf(p[3]), dec(p[4]));
                        if (!edges.add(edge)) throw new CorruptRootStoreException("DUPLICATE_EDGE:" + edge.canonical());
                    }
                    case "OP" -> {
                        if (receipt != null || p.length != 6) throw new CorruptRootStoreException("OP_ROW_INVALID");
                        receipt = new OperationReceipt(dec(p[1]), p[2], Long.parseLong(p[3]), Long.parseLong(p[4]), dec(p[5]));
                    }
                    case "EVENT" -> {
                        if (event != null || p.length != 10) throw new CorruptRootStoreException("EVENT_ROW_INVALID");
                        event = new Event(Long.parseLong(p[1]), dec(p[2]), dec(p[3]), "-".equals(p[4]) ? null : p[4],
                                dec(p[5]), dec(p[6]), dec(p[7]), Instant.parse(p[8]), p[9]);
                    }
                    default -> throw new CorruptRootStoreException("UNKNOWN_ROOT_FRAME_ROW:" + p[0]);
                }
            }
            if (receipt == null || event == null) throw new CorruptRootStoreException("ROOT_FRAME_RECEIPT_OR_EVENT_MISSING");

            Map<String, SystemAuthority.Record> systems = new LinkedHashMap<>();
            for (PendingSystem p : pendingSystems.values()) {
                List<VersionPointer> history = versions.getOrDefault(p.systemId(), List.of());
                VersionPointer current = null;
                if (p.currentVersionIndex() >= 0) {
                    if (p.currentVersionIndex() >= history.size()) throw new CorruptRootStoreException("CURRENT_VERSION_INDEX:" + p.systemId());
                    current = history.get(p.currentVersionIndex());
                }
                Descriptor descriptor = new Descriptor(p.systemId(), p.displayName(), p.canonicalQuestion(), p.kind(), p.truths(), p.negatives());
                systems.put(p.systemId(), new SystemAuthority.Record(descriptor, p.lifecycle(), p.generation(), current, p.basis(),
                        p.declaredAt(), p.updatedAt(), p.replacementSystemId()));
            }
            for (String systemId : versions.keySet()) {
                if (!pendingSystems.containsKey(systemId)) throw new CorruptRootStoreException("ORPHAN_VERSION:" + systemId);
            }
            return new FrameState(outerRevision, Map.copyOf(systems), Set.copyOf(edges), immutableVersionHistory(versions), receipt, event);
        } catch (CorruptRootStoreException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new CorruptRootStoreException("ROOT_FRAME_PARSE_FAILED", ex);
        }
    }

    private static RootSnapshot parseCanonicalSnapshot(String body) throws IOException {
        try {
            String[] lines = body.split("\n", -1);
            if (lines.length < 2) throw new CorruptRootStoreException("ROOT_CHECKPOINT_PAYLOAD_TOO_SHORT");
            String[] header = lines[0].split("\t", -1);
            if (header.length != 3 || !"SNAPSHOT".equals(header[0])
                    || !"SYSTEM_ROOT_SNAPSHOT_V1".equals(header[1])) {
                throw new CorruptRootStoreException("ROOT_CHECKPOINT_PAYLOAD_HEADER_INVALID");
            }
            long revision = Long.parseLong(header[2]);

            record PendingSystem(
                    String systemId, String displayName, String canonicalQuestion, AuthorityKind kind, Lifecycle lifecycle,
                    long generation, int currentVersionIndex, AdmissionBasis basis, Instant declaredAt, Instant updatedAt,
                    String replacementSystemId, Set<String> truths, Set<String> negatives) {}

            Map<String, PendingSystem> pendingSystems = new LinkedHashMap<>();
            Map<String, List<VersionPointer>> versions = new LinkedHashMap<>();
            Set<TopologyEdge> edges = new LinkedHashSet<>();
            Map<String, OperationReceipt> receipts = new LinkedHashMap<>();
            List<Event> events = new ArrayList<>();

            for (int lineNo = 1; lineNo < lines.length; lineNo++) {
                String line = lines[lineNo];
                if (line.isEmpty()) continue;
                String[] p = line.split("\t", -1);
                switch (p[0]) {
                    case "SYSTEM" -> {
                        if (p.length != 16) throw new CorruptRootStoreException("CHECKPOINT_SYSTEM_FIELD_COUNT");
                        AdmissionBasis basis = "-".equals(p[8]) ? null : new AdmissionBasis(dec(p[8]), dec(p[9]), dec(p[10]));
                        String replacement = "-".equals(p[13]) ? null : p[13];
                        Set<String> truths = p[14].isEmpty() ? Set.of() : Set.of(p[14].split(",", -1));
                        Set<String> negatives = decList(p[15]);
                        PendingSystem pending = new PendingSystem(
                                p[1], dec(p[2]), dec(p[3]), AuthorityKind.valueOf(p[4]), Lifecycle.valueOf(p[5]),
                                Long.parseLong(p[6]), Integer.parseInt(p[7]), basis,
                                Instant.parse(p[11]), Instant.parse(p[12]), replacement, truths, negatives);
                        if (pendingSystems.putIfAbsent(pending.systemId(), pending) != null) {
                            throw new CorruptRootStoreException("CHECKPOINT_DUPLICATE_SYSTEM:" + pending.systemId());
                        }
                    }
                    case "VERSION" -> {
                        if (p.length != 7) throw new CorruptRootStoreException("CHECKPOINT_VERSION_FIELD_COUNT");
                        int index = Integer.parseInt(p[2]);
                        List<VersionPointer> list = versions.computeIfAbsent(p[1], ignored -> new ArrayList<>());
                        if (index != list.size()) throw new CorruptRootStoreException("CHECKPOINT_VERSION_SEQUENCE:" + p[1]);
                        list.add(new VersionPointer(dec(p[3]), p[4], dec(p[5]), p[6]));
                    }
                    case "EDGE" -> {
                        if (p.length != 5) throw new CorruptRootStoreException("CHECKPOINT_EDGE_FIELD_COUNT");
                        TopologyEdge edge = new TopologyEdge(p[1], p[2], EdgeKind.valueOf(p[3]), dec(p[4]));
                        if (!edges.add(edge)) throw new CorruptRootStoreException("CHECKPOINT_DUPLICATE_EDGE");
                    }
                    case "OP" -> {
                        if (p.length != 6) throw new CorruptRootStoreException("CHECKPOINT_OP_FIELD_COUNT");
                        OperationReceipt receipt = new OperationReceipt(dec(p[1]), p[2], Long.parseLong(p[3]), Long.parseLong(p[4]), dec(p[5]));
                        if (receipts.putIfAbsent(receipt.operationId(), receipt) != null) {
                            throw new CorruptRootStoreException("CHECKPOINT_DUPLICATE_OP:" + receipt.operationId());
                        }
                    }
                    case "EVENT" -> {
                        if (p.length != 10) throw new CorruptRootStoreException("CHECKPOINT_EVENT_FIELD_COUNT");
                        events.add(new Event(Long.parseLong(p[1]), dec(p[2]), dec(p[3]), "-".equals(p[4]) ? null : p[4],
                                dec(p[5]), dec(p[6]), dec(p[7]), Instant.parse(p[8]), p[9]));
                    }
                    default -> throw new CorruptRootStoreException("UNKNOWN_ROOT_CHECKPOINT_ROW:" + p[0]);
                }
            }

            Map<String, SystemAuthority.Record> systems = new LinkedHashMap<>();
            for (PendingSystem p : pendingSystems.values()) {
                List<VersionPointer> history = versions.getOrDefault(p.systemId(), List.of());
                VersionPointer current = null;
                if (p.currentVersionIndex() >= 0) {
                    if (p.currentVersionIndex() >= history.size()) throw new CorruptRootStoreException("CHECKPOINT_CURRENT_VERSION_INDEX:" + p.systemId());
                    current = history.get(p.currentVersionIndex());
                }
                Descriptor descriptor = new Descriptor(p.systemId(), p.displayName(), p.canonicalQuestion(), p.kind(), p.truths(), p.negatives());
                systems.put(p.systemId(), new SystemAuthority.Record(descriptor, p.lifecycle(), p.generation(), current, p.basis(),
                        p.declaredAt(), p.updatedAt(), p.replacementSystemId()));
            }
            for (String systemId : versions.keySet()) {
                if (!pendingSystems.containsKey(systemId)) throw new CorruptRootStoreException("CHECKPOINT_ORPHAN_VERSION:" + systemId);
            }
            RootSnapshot snapshot = new RootSnapshot(revision, systems, edges, immutableVersionHistory(versions), receipts, events);
            try { SystemRootRegistry.validateSnapshot(snapshot); }
            catch (RuntimeException ex) { throw new CorruptRootStoreException("ROOT_CHECKPOINT_STATE_INVALID", ex); }
            return snapshot;
        } catch (CorruptRootStoreException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new CorruptRootStoreException("ROOT_CHECKPOINT_PARSE_FAILED", ex);
        }
    }

    /** Canonical full snapshot bytes used for stable identity, not for journal persistence. */
    static byte[] serialize(RootSnapshot snapshot) {
        StringBuilder body = new StringBuilder();
        body.append("SNAPSHOT\tSYSTEM_ROOT_SNAPSHOT_V1\t").append(snapshot.storeRevision()).append('\n');
        appendStateRows(body, snapshot);
        new TreeMap<>(snapshot.operationReceipts()).values().forEach(receipt ->
                body.append("OP\t").append(enc(receipt.operationId())).append('\t')
                        .append(receipt.requestDigest()).append('\t')
                        .append(receipt.resultingStoreRevision()).append('\t')
                        .append(receipt.eventSequence()).append('\t')
                        .append(enc(receipt.resultRef())).append('\n'));
        snapshot.events().stream().sorted(Comparator.comparingLong(Event::sequence)).forEach(event -> appendEvent(body, event));
        return body.toString().getBytes(StandardCharsets.UTF_8);
    }

    private static void appendStateRows(StringBuilder body, RootSnapshot snapshot) {
        TreeMap<String, SystemAuthority.Record> systems = new TreeMap<>(snapshot.systems());
        for (var entry : systems.entrySet()) {
            String systemId = entry.getKey();
            SystemAuthority.Record r = entry.getValue();
            List<VersionPointer> versions = snapshot.versionHistory().getOrDefault(systemId, List.of());
            int currentVersionIndex = r.currentVersion() == null ? -1 : versions.lastIndexOf(r.currentVersion());
            if (r.currentVersion() != null && currentVersionIndex < 0) {
                throw new IllegalArgumentException("current version absent from history: " + systemId);
            }
            body.append("SYSTEM\t").append(systemId).append('\t')
                    .append(enc(r.descriptor().displayName())).append('\t')
                    .append(enc(r.descriptor().canonicalQuestion())).append('\t')
                    .append(r.descriptor().kind()).append('\t')
                    .append(r.lifecycle()).append('\t')
                    .append(r.generation()).append('\t')
                    .append(currentVersionIndex).append('\t')
                    .append(r.admissionBasis() == null ? "-" : enc(r.admissionBasis().authorizationRef())).append('\t')
                    .append(r.admissionBasis() == null ? "-" : enc(r.admissionBasis().qualificationRef())).append('\t')
                    .append(r.admissionBasis() == null ? "-" : enc(r.admissionBasis().releaseRef())).append('\t')
                    .append(r.declaredAt()).append('\t')
                    .append(r.updatedAt()).append('\t')
                    .append(r.replacementSystemId() == null ? "-" : r.replacementSystemId()).append('\t')
                    .append(String.join(",", new TreeSet<>(r.descriptor().ownedTruthKeys()))).append('\t')
                    .append(encList(r.descriptor().negativeOwnership())).append('\n');
            for (int i = 0; i < versions.size(); i++) {
                VersionPointer v = versions.get(i);
                body.append("VERSION\t").append(systemId).append('\t').append(i).append('\t')
                        .append(enc(v.implementationVersion())).append('\t')
                        .append(v.artifactDigest()).append('\t')
                        .append(enc(v.sourceRevision())).append('\t')
                        .append(v.contractSetDigest()).append('\n');
            }
        }
        new TreeSet<>(snapshot.topology()).forEach(edge ->
                body.append("EDGE\t").append(edge.fromSystemId()).append('\t')
                        .append(edge.toSystemId()).append('\t')
                        .append(edge.kind()).append('\t')
                        .append(enc(edge.purpose())).append('\n'));
    }

    private static void appendEvent(StringBuilder body, Event event) {
        body.append("EVENT\t").append(event.sequence()).append('\t')
                .append(enc(event.eventId())).append('\t')
                .append(enc(event.operationId())).append('\t')
                .append(event.systemId() == null ? "-" : event.systemId()).append('\t')
                .append(enc(event.eventType())).append('\t')
                .append(enc(event.actorRef())).append('\t')
                .append(enc(event.decisionRef())).append('\t')
                .append(event.occurredAt()).append('\t')
                .append(event.payloadDigest()).append('\n');
    }

    private static Map<String, List<VersionPointer>> immutableVersionHistory(Map<String, List<VersionPointer>> raw) {
        Map<String, List<VersionPointer>> out = new LinkedHashMap<>();
        raw.forEach((k, v) -> out.put(k, List.copyOf(v)));
        return Map.copyOf(out);
    }

    private static byte[] gzip(byte[] plain) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gz = new GZIPOutputStream(out)) { gz.write(plain); }
        return out.toByteArray();
    }

    private static byte[] gunzip(byte[] compressed) throws IOException {
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(compressed));
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            for (int n; (n = in.read(buffer)) >= 0;) {
                if (n == 0) continue;
                total += n;
                if (total > MAX_FRAME_TEXT_BYTES) throw new CorruptRootStoreException("ROOT_JOURNAL_DECOMPRESSED_FRAME_TOO_LARGE");
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        } catch (CorruptRootStoreException ex) {
            throw ex;
        } catch (IOException ex) {
            throw new CorruptRootStoreException("ROOT_JOURNAL_GZIP_INVALID", ex);
        }
    }

    private static int indexOf(byte[] bytes, byte needle, int from) {
        for (int i = from; i < bytes.length; i++) if (bytes[i] == needle) return i;
        return -1;
    }

    private static boolean isPrefix(byte[] candidate, byte[] full) {
        if (candidate.length > full.length) return false;
        for (int i = 0; i < candidate.length; i++) if (candidate[i] != full[i]) return false;
        return true;
    }

    private static void writeFully(FileChannel channel, ByteBuffer buffer) throws IOException {
        while (buffer.hasRemaining()) channel.write(buffer);
    }

    private void cacheSnapshot(RootSnapshot snapshot, long size) throws IOException {
        BasicFileAttributes attrs = Files.readAttributes(dataPath, BasicFileAttributes.class);
        cache = new CacheEntry(size, attrs.lastModifiedTime(), attrs.fileKey(), size, snapshot);
    }

    private void syncParentDirectory() {
        Path parent = dataPath.getParent();
        if (parent == null) return;
        try (FileChannel dir = FileChannel.open(parent, StandardOpenOption.READ)) {
            dir.force(true);
        } catch (IOException | UnsupportedOperationException ignored) {
            // The journal itself has already been fsynced. Directory fsync is best effort for platforms
            // that do not expose directory handles; startup replay still fails closed on missing/corrupt data.
        }
    }

    private static String enc(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String dec(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String encList(Set<String> values) {
        return values.stream().sorted().map(FileSystemRootStore::enc).reduce((a, b) -> a + "," + b).orElse("");
    }

    private static Set<String> decList(String value) {
        if (value.isEmpty()) return Set.of();
        TreeSet<String> out = new TreeSet<>();
        for (String part : value.split(",", -1)) {
            String decoded = dec(part);
            if (!out.add(decoded)) throw new IllegalArgumentException("duplicate negative ownership");
        }
        return Set.copyOf(out);
    }

    static String sha256Bytes(byte[] bytes) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
