package org.systemmaster.core;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * F-WP-002 authoritative change store.
 *
 * <p>The durable authority is a sequence of checksummed transaction frames. Each frame contains
 * the new ChangeRecord, immutable ChangeRevision/target snapshot, and the corresponding append-only
 * ChangeEvent. A mutation is committed by writing a complete replacement log to a sibling temp file,
 * forcing it to storage, and atomically replacing the authoritative log. In-memory indexes are only
 * rebuildable projections of that log.</p>
 */
public final class ChangeRegistry {
    public static final String STORE_VERSION = "FWP002-TX1";

    public record ChangeRecord(
            String changeId,
            long currentRevision,
            String title,
            String changeType,
            String riskClass,
            String semanticOwnerRef,
            String lifecycleState,
            String createdByPrincipalRef,
            Instant createdAt,
            Instant updatedAt,
            String currentRevisionDigest,
            String targetDigest) {}

    public record ChangeRevision(
            String changeId,
            long revision,
            long expectedBaseRevision,
            String title,
            String changeType,
            String semanticOwnerRef,
            String scopeSelector,
            List<String> resolvedTargetIdentities,
            String targetDigest,
            String intent,
            String rationale,
            String contentDigest,
            String authoredBy,
            Instant authoredAt) {
        public ChangeRevision {
            resolvedTargetIdentities = List.copyOf(resolvedTargetIdentities);
        }
    }

    public record ChangeEvent(
            String eventId,
            String changeId,
            long revision,
            String eventType,
            String actor,
            Instant occurredAt,
            String previousState,
            String nextState,
            String payloadDigest) {}

    public record CommitResult(ChangeRecord record, ChangeRevision revision, ChangeEvent event) {}

    @FunctionalInterface
    public interface FaultInjector {
        void afterPrepared(Path preparedFile) throws IOException;
    }

    public static final class StaleRevisionException extends IllegalStateException {
        public StaleRevisionException(String message) { super(message); }
    }

    public static final class DuplicateContentException extends IllegalStateException {
        public DuplicateContentException(String message) { super(message); }
    }

    public static final class CorruptStoreException extends IllegalStateException {
        public CorruptStoreException(String message) { super(message); }
        public CorruptStoreException(String message, Throwable cause) { super(message, cause); }
    }

    private static final String SEP = "\u001f";
    private static final String LIST_SEP = "\u001e";

    private final Path logPath;
    private final Clock clock;
    private final FaultInjector faultInjector;
    private final Object mutex = new Object();

    private final Map<String, ChangeRecord> current = new LinkedHashMap<>();
    private final Map<String, NavigableMap<Long, ChangeRevision>> revisions = new LinkedHashMap<>();
    private final Map<String, List<ChangeEvent>> timeline = new LinkedHashMap<>();
    private final Map<String, Set<String>> changesByTarget = new HashMap<>();
    private final Map<String, Set<String>> changesByLifecycle = new HashMap<>();
    private final Map<String, Set<String>> contentDigestsByChange = new HashMap<>();

    public ChangeRegistry(Path logPath) throws IOException {
        this(logPath, Clock.systemUTC(), prepared -> {});
    }

    public ChangeRegistry(Path logPath, Clock clock, FaultInjector faultInjector) throws IOException {
        this.logPath = Objects.requireNonNull(logPath, "logPath").toAbsolutePath();
        this.clock = Objects.requireNonNull(clock, "clock");
        this.faultInjector = Objects.requireNonNull(faultInjector, "faultInjector");
        Path parent = this.logPath.getParent();
        if (parent != null) Files.createDirectories(parent);
        if (Files.exists(this.logPath)) replay();
    }

    public CommitResult createChange(
            String title,
            String typeCandidate,
            String semanticOwnerRef,
            String intent,
            String rationale,
            String scopeSelector,
            List<String> resolvedTargets,
            String principalRef) throws IOException {
        return createChangeWithId(UUID.randomUUID().toString(), title, typeCandidate, semanticOwnerRef,
                intent, rationale, scopeSelector, resolvedTargets, principalRef);
    }

    CommitResult createChangeWithId(
            String changeId,
            String title,
            String typeCandidate,
            String semanticOwnerRef,
            String intent,
            String rationale,
            String scopeSelector,
            List<String> resolvedTargets,
            String principalRef) throws IOException {
        synchronized (mutex) {
            requireText(changeId, "changeId");
            if (current.containsKey(changeId)) {
                throw new IllegalArgumentException("CHANGE_ID_ALREADY_EXISTS:" + changeId);
            }
            Instant now = clock.instant();
            long revisionNo = 1L;
            List<String> targets = canonicalTargets(resolvedTargets);
            String targetDigest = targetDigest(targets);
            String changeType = normalize(typeCandidate, "UNCLASSIFIED");
            String contentDigest = revisionDigest(changeId, revisionNo, title, changeType,
                    semanticOwnerRef, scopeSelector, targets, intent, rationale);
            ChangeRevision revision = new ChangeRevision(changeId, revisionNo, 0L,
                    requireText(title, "title"), changeType, requireText(semanticOwnerRef, "semanticOwnerRef"),
                    normalize(scopeSelector, ""), targets, targetDigest, normalize(intent, ""),
                    normalize(rationale, ""), contentDigest, requireText(principalRef, "principalRef"), now);
            ChangeRecord record = new ChangeRecord(changeId, revisionNo, title, changeType, "UNASSESSED",
                    semanticOwnerRef, "DRAFT", principalRef, now, now, contentDigest, targetDigest);
            ChangeEvent event = new ChangeEvent(UUID.randomUUID().toString(), changeId, revisionNo,
                    "CHANGE_CREATED", principalRef, now, null, "DRAFT", contentDigest);
            commitFrame(record, revision, event);
            return new CommitResult(record, revision, event);
        }
    }

    public CommitResult reviseChange(
            String changeId,
            long expectedRevision,
            String title,
            String typeCandidate,
            String semanticOwnerRef,
            String intent,
            String rationale,
            String scopeSelector,
            List<String> resolvedTargets,
            String principalRef) throws IOException {
        synchronized (mutex) {
            ChangeRecord prior = requireCurrent(changeId);
            if (prior.currentRevision() != expectedRevision) {
                throw new StaleRevisionException("STALE_EXPECTED_REVISION expected=" + expectedRevision
                        + " actual=" + prior.currentRevision());
            }
            long revisionNo = expectedRevision + 1L;
            Instant now = clock.instant();
            List<String> targets = canonicalTargets(resolvedTargets);
            String targetDigest = targetDigest(targets);
            String changeType = normalize(typeCandidate, prior.changeType());
            String contentDigest = revisionDigest(changeId, revisionNo, title, changeType,
                    semanticOwnerRef, scopeSelector, targets, intent, rationale);
            if (contentDigestsByChange.getOrDefault(changeId, Set.of()).contains(contentDigest)) {
                throw new DuplicateContentException("DUPLICATE_CONTENT_DIGEST:" + contentDigest);
            }
            ChangeRevision revision = new ChangeRevision(changeId, revisionNo, expectedRevision,
                    requireText(title, "title"), changeType, requireText(semanticOwnerRef, "semanticOwnerRef"),
                    normalize(scopeSelector, ""), targets, targetDigest, normalize(intent, ""),
                    normalize(rationale, ""), contentDigest, requireText(principalRef, "principalRef"), now);
            ChangeRecord record = new ChangeRecord(changeId, revisionNo, title, changeType, prior.riskClass(),
                    semanticOwnerRef, prior.lifecycleState(), prior.createdByPrincipalRef(), prior.createdAt(),
                    now, contentDigest, targetDigest);
            ChangeEvent event = new ChangeEvent(UUID.randomUUID().toString(), changeId, revisionNo,
                    "CHANGE_REVISED", principalRef, now, prior.lifecycleState(), prior.lifecycleState(), contentDigest);
            commitFrame(record, revision, event);
            return new CommitResult(record, revision, event);
        }
    }

    public ChangeRecord getChange(String changeId) {
        synchronized (mutex) {
            return requireCurrent(changeId);
        }
    }

    public ChangeRevision getRevision(String changeId, long revision) {
        synchronized (mutex) {
            NavigableMap<Long, ChangeRevision> map = revisions.get(changeId);
            if (map == null || !map.containsKey(revision)) {
                throw new IllegalArgumentException("UNKNOWN_CHANGE_REVISION:" + changeId + ":" + revision);
            }
            return map.get(revision);
        }
    }

    public List<ChangeEvent> getTimeline(String changeId) {
        synchronized (mutex) {
            return List.copyOf(timeline.getOrDefault(changeId, List.of()));
        }
    }

    public Set<String> listChangesByTarget(String targetRef) {
        synchronized (mutex) {
            return Set.copyOf(changesByTarget.getOrDefault(targetRef, Set.of()));
        }
    }

    public Set<String> listChangesByLifecycle(String lifecycleState) {
        synchronized (mutex) {
            return Set.copyOf(changesByLifecycle.getOrDefault(lifecycleState, Set.of()));
        }
    }

    public int changeCount() {
        synchronized (mutex) {
            return current.size();
        }
    }

    private ChangeRecord requireCurrent(String changeId) {
        ChangeRecord record = current.get(changeId);
        if (record == null) throw new IllegalArgumentException("UNKNOWN_CHANGE:" + changeId);
        return record;
    }

    private void commitFrame(ChangeRecord record, ChangeRevision revision, ChangeEvent event) throws IOException {
        validateFrameAgainstCurrent(record, revision, event, false);
        byte[] prior = Files.exists(logPath) ? Files.readAllBytes(logPath) : new byte[0];
        String payload = encodePayload(record, revision, event);
        String frame = STORE_VERSION + "\t" + b64(payload) + "\t" + sha256(payload) + "\n";
        byte[] next = new byte[prior.length + frame.getBytes(StandardCharsets.UTF_8).length];
        System.arraycopy(prior, 0, next, 0, prior.length);
        System.arraycopy(frame.getBytes(StandardCharsets.UTF_8), 0, next, prior.length,
                frame.getBytes(StandardCharsets.UTF_8).length);

        Path temp = logPath.resolveSibling(logPath.getFileName() + ".prepared-" + UUID.randomUUID());
        try {
            try (FileChannel channel = FileChannel.open(temp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                channel.write(ByteBuffer.wrap(next));
                channel.force(true);
            }
            faultInjector.afterPrepared(temp);
            try {
                Files.move(temp, logPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            } catch (AtomicMoveNotSupportedException ex) {
                throw new IOException("ATOMIC_REPLACE_NOT_SUPPORTED:" + logPath, ex);
            }
            applyFrame(record, revision, event);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private void replay() throws IOException {
        byte[] raw = Files.readAllBytes(logPath);
        if (raw.length == 0) return;
        String text = new String(raw, StandardCharsets.UTF_8);
        if (!text.endsWith("\n")) throw new CorruptStoreException("TRUNCATED_TRANSACTION_FRAME");
        String[] lines = text.split("\n", -1);
        for (int i = 0; i < lines.length - 1; i++) {
            String line = lines[i];
            String[] parts = line.split("\t", -1);
            if (parts.length != 3 || !STORE_VERSION.equals(parts[0])) {
                throw new CorruptStoreException("MALFORMED_TRANSACTION_FRAME line=" + (i + 1));
            }
            String payload;
            try {
                payload = new String(Base64.getDecoder().decode(parts[1]), StandardCharsets.UTF_8);
            } catch (IllegalArgumentException ex) {
                throw new CorruptStoreException("INVALID_FRAME_BASE64 line=" + (i + 1), ex);
            }
            if (!sha256(payload).equals(parts[2])) {
                throw new CorruptStoreException("TRANSACTION_CHECKSUM_MISMATCH line=" + (i + 1));
            }
            Decoded decoded = decodePayload(payload);
            validateFrameAgainstCurrent(decoded.record, decoded.revision, decoded.event, true);
            applyFrame(decoded.record, decoded.revision, decoded.event);
        }
    }

    private void validateFrameAgainstCurrent(ChangeRecord record, ChangeRevision revision, ChangeEvent event, boolean replay) {
        if (!record.changeId().equals(revision.changeId()) || !record.changeId().equals(event.changeId())) {
            throw new CorruptStoreException("FRAME_CHANGE_ID_MISMATCH");
        }
        if (record.currentRevision() != revision.revision() || event.revision() != revision.revision()) {
            throw new CorruptStoreException("FRAME_REVISION_MISMATCH");
        }
        if (!record.currentRevisionDigest().equals(revision.contentDigest())
                || !event.payloadDigest().equals(revision.contentDigest())) {
            throw new CorruptStoreException("FRAME_DIGEST_LINK_MISMATCH");
        }
        if (!revision.targetDigest().equals(targetDigest(revision.resolvedTargetIdentities()))) {
            throw new CorruptStoreException("TARGET_DIGEST_MISMATCH");
        }
        String recomputed = revisionDigest(revision.changeId(), revision.revision(), revision.title(),
                revision.changeType(), revision.semanticOwnerRef(), revision.scopeSelector(),
                revision.resolvedTargetIdentities(), revision.intent(), revision.rationale());
        if (!recomputed.equals(revision.contentDigest())) {
            throw new CorruptStoreException("CONTENT_DIGEST_MISMATCH");
        }
        ChangeRecord prior = current.get(record.changeId());
        if (prior == null) {
            if (revision.revision() != 1L || revision.expectedBaseRevision() != 0L) {
                throw new CorruptStoreException("FIRST_REVISION_NOT_ONE");
            }
        } else {
            if (revision.revision() != prior.currentRevision() + 1L
                    || revision.expectedBaseRevision() != prior.currentRevision()) {
                throw replay
                        ? new CorruptStoreException("REVISION_SEQUENCE_GAP")
                        : new StaleRevisionException("STALE_OR_NON_MONOTONIC_REVISION");
            }
        }
        if (contentDigestsByChange.getOrDefault(record.changeId(), Set.of()).contains(revision.contentDigest())) {
            throw new DuplicateContentException("DUPLICATE_CONTENT_DIGEST:" + revision.contentDigest());
        }
    }

    private void applyFrame(ChangeRecord record, ChangeRevision revision, ChangeEvent event) {
        ChangeRecord prior = current.put(record.changeId(), record);
        revisions.computeIfAbsent(record.changeId(), k -> new TreeMap<>()).put(revision.revision(), revision);
        timeline.computeIfAbsent(record.changeId(), k -> new ArrayList<>()).add(event);
        contentDigestsByChange.computeIfAbsent(record.changeId(), k -> new HashSet<>()).add(revision.contentDigest());
        if (prior != null) {
            changesByLifecycle.getOrDefault(prior.lifecycleState(), Set.of()).remove(record.changeId());
            ChangeRevision priorRevision = revisions.get(record.changeId()).get(prior.currentRevision());
            if (priorRevision != null) {
                for (String target : priorRevision.resolvedTargetIdentities()) {
                    Set<String> ids = changesByTarget.get(target);
                    if (ids != null) ids.remove(record.changeId());
                }
            }
        }
        changesByLifecycle.computeIfAbsent(record.lifecycleState(), k -> new LinkedHashSet<>()).add(record.changeId());
        for (String target : revision.resolvedTargetIdentities()) {
            changesByTarget.computeIfAbsent(target, k -> new LinkedHashSet<>()).add(record.changeId());
        }
    }

    private record Decoded(ChangeRecord record, ChangeRevision revision, ChangeEvent event) {}

    private static String encodePayload(ChangeRecord r, ChangeRevision v, ChangeEvent e) {
        List<String> fields = List.of(
                r.changeId(), Long.toString(r.currentRevision()), r.title(), r.changeType(), r.riskClass(),
                r.semanticOwnerRef(), r.lifecycleState(), r.createdByPrincipalRef(), r.createdAt().toString(),
                r.updatedAt().toString(), r.currentRevisionDigest(), r.targetDigest(),
                v.changeId(), Long.toString(v.revision()), Long.toString(v.expectedBaseRevision()), v.title(),
                v.changeType(), v.semanticOwnerRef(), v.scopeSelector(), String.join(LIST_SEP, v.resolvedTargetIdentities()),
                v.targetDigest(), v.intent(), v.rationale(), v.contentDigest(), v.authoredBy(), v.authoredAt().toString(),
                e.eventId(), e.changeId(), Long.toString(e.revision()), e.eventType(), e.actor(), e.occurredAt().toString(),
                nullable(e.previousState()), e.nextState(), e.payloadDigest());
        List<String> encoded = new ArrayList<>(fields.size());
        for (String field : fields) encoded.add(b64(field));
        return String.join(SEP, encoded);
    }

    private static Decoded decodePayload(String payload) {
        String[] encoded = payload.split(SEP, -1);
        if (encoded.length != 35) throw new CorruptStoreException("PAYLOAD_FIELD_COUNT:" + encoded.length);
        String[] f = new String[encoded.length];
        try {
            for (int i = 0; i < encoded.length; i++) f[i] = unb64(encoded[i]);
            ChangeRecord r = new ChangeRecord(f[0], Long.parseLong(f[1]), f[2], f[3], f[4], f[5], f[6], f[7],
                    Instant.parse(f[8]), Instant.parse(f[9]), f[10], f[11]);
            List<String> targets = f[19].isEmpty() ? List.of() : List.of(f[19].split(LIST_SEP, -1));
            ChangeRevision v = new ChangeRevision(f[12], Long.parseLong(f[13]), Long.parseLong(f[14]), f[15], f[16],
                    f[17], f[18], targets, f[20], f[21], f[22], f[23], f[24], Instant.parse(f[25]));
            ChangeEvent e = new ChangeEvent(f[26], f[27], Long.parseLong(f[28]), f[29], f[30], Instant.parse(f[31]),
                    denull(f[32]), f[33], f[34]);
            return new Decoded(r, v, e);
        } catch (RuntimeException ex) {
            if (ex instanceof CorruptStoreException c) throw c;
            throw new CorruptStoreException("PAYLOAD_DECODE_FAILED", ex);
        }
    }

    private static List<String> canonicalTargets(List<String> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        ArrayList<String> copy = new ArrayList<>();
        for (String target : raw) copy.add(requireText(target, "target"));
        copy.sort(Comparator.naturalOrder());
        for (int i = 1; i < copy.size(); i++) {
            if (copy.get(i - 1).equals(copy.get(i))) {
                throw new IllegalArgumentException("DUPLICATE_TARGET:" + copy.get(i));
            }
        }
        return List.copyOf(copy);
    }

    public static String targetDigest(List<String> targets) {
        StringBuilder sb = new StringBuilder("TARGETS-V1");
        for (String target : canonicalTargets(targets)) {
            sb.append('|').append(target.length()).append(':').append(target);
        }
        return sha256(sb.toString());
    }

    private static String revisionDigest(String changeId, long revision, String title, String changeType,
            String semanticOwnerRef, String scopeSelector, List<String> targets, String intent, String rationale) {
        String canonical = "REVISION-V1"
                + "|change=" + changeId
                + "|revision=" + revision
                + "|title=" + requireText(title, "title")
                + "|type=" + normalize(changeType, "UNCLASSIFIED")
                + "|owner=" + requireText(semanticOwnerRef, "semanticOwnerRef")
                + "|selector=" + normalize(scopeSelector, "")
                + "|targets=" + targetDigest(targets)
                + "|intent=" + normalize(intent, "")
                + "|rationale=" + normalize(rationale, "");
        return sha256(canonical);
    }

    private static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return java.util.HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static String b64(String value) {
        return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String unb64(String value) {
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String requireText(String value, String name) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:" + name);
        return value;
    }

    private static String normalize(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private static String nullable(String value) { return value == null ? "<NULL>" : value; }
    private static String denull(String value) { return "<NULL>".equals(value) ? null : value; }
}
