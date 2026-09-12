package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import static org.systemmaster.foundation.identity.ProofingContracts.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
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
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * O-WP-002 append-only proofing/enrollment journal.
 *
 * Portable reference persistence only: exact production persistence is not claimed.
 */
public final class ProofingJournalStore {
    private static final byte[] HEADER = "SYSTEM_MASTER_PROOFING_JOURNAL_V1\n".getBytes(StandardCharsets.US_ASCII);
    private static final int DIGEST_BYTES = 32;
    private static final int MAX_FRAME_BYTES = 1024 * 1024;
    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path path;
    private final Object jvmLock;

    public ProofingJournalStore(Path path) {
        this.path = path.toAbsolutePath().normalize();
        this.jvmLock = JVM_LOCKS.computeIfAbsent(this.path, ignored -> new Object());
    }

    public Path path() { return path; }

    public record Snapshot(
            long journalRevision,
            Map<ProfileRef, IdentityProofingProfile> profiles,
            Map<String, Long> latestProfileVersions,
            Map<String, IdentityEnrollmentRecord> enrollments) {}

    public Snapshot load() throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                State state = replay(channel);
                return state.snapshot();
            }
        }
    }

    public ProfileMutationResult publish(PublishIdentityProofingProfileRequest request) throws IOException {
        byte[] event = encodePublish(request);
        return mutate(request.context().commandId(), event, state -> applyPublish(state, request, true));
    }

    public EnrollmentMutationResult begin(BeginIdentityEnrollmentRequest request) throws IOException {
        byte[] event = encodeBegin(request);
        return mutateEnrollment(request.context().commandId(), request.enrollmentId(), event,
                state -> applyBegin(state, request, true));
    }

    public EnrollmentMutationResult complete(CompleteIdentityEnrollmentRequest request) throws IOException {
        byte[] event = encodeComplete(request);
        return mutateEnrollment(request.context().commandId(), request.enrollmentId(), event,
                state -> applyComplete(state, request, true));
    }

    public IdentityProofingProfile getProfile(ProfileRef ref) throws IOException {
        IdentityProofingProfile profile = load().profiles().get(ref);
        if (profile == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
        return profile;
    }

    public IdentityProofingProfile getLatestProfile(String profileId) throws IOException {
        String id = requireId("profileId", profileId);
        Snapshot snapshot = load();
        Long version = snapshot.latestProfileVersions().get(id);
        if (version == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
        return snapshot.profiles().get(new ProfileRef(id, version));
    }

    public IdentityEnrollmentRecord getEnrollment(String enrollmentId) throws IOException {
        IdentityEnrollmentRecord record = load().enrollments().get(requireId("enrollmentId", enrollmentId));
        if (record == null) throw new IdentityException(ErrorCode.NOT_FOUND, "enrollment not found");
        return record;
    }

    private ProfileMutationResult mutate(String commandId, byte[] event, ProfileOperation operation) throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                initialize(channel);
                State state = replay(channel);
                String fingerprint = hex(sha256(event));
                String prior = state.commandFingerprints.get(commandId);
                if (prior != null) {
                    if (!prior.equals(fingerprint)) throw new IdentityException(ErrorCode.CONFLICT, "command id reused with changed semantic bytes");
                    String key = state.commandResults.get(commandId);
                    String[] parts = key.split("#", 2);
                    IdentityProofingProfile profile = state.profiles.get(new ProfileRef(parts[0], Long.parseLong(parts[1])));
                    return new ProfileMutationResult(state.revision, false, profile);
                }
                IdentityProofingProfile profile = operation.apply(state);
                append(channel, state.revision + 1, event);
                return new ProfileMutationResult(state.revision + 1, true, profile);
            }
        }
    }

    private EnrollmentMutationResult mutateEnrollment(String commandId, String enrollmentId, byte[] event,
            EnrollmentOperation operation) throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                initialize(channel);
                State state = replay(channel);
                String fingerprint = hex(sha256(event));
                String prior = state.commandFingerprints.get(commandId);
                if (prior != null) {
                    if (!prior.equals(fingerprint)) throw new IdentityException(ErrorCode.CONFLICT, "command id reused with changed semantic bytes");
                    return new EnrollmentMutationResult(state.revision, false, state.enrollments.get(enrollmentId));
                }
                IdentityEnrollmentRecord record = operation.apply(state);
                append(channel, state.revision + 1, event);
                return new EnrollmentMutationResult(state.revision + 1, true, record);
            }
        }
    }

    private IdentityProofingProfile applyPublish(State state, PublishIdentityProofingProfileRequest request, boolean validate) {
        IdentityProofingProfile profile = request.profile();
        long latest = state.latestProfileVersions.getOrDefault(profile.profileId(), 0L);
        if (validate) {
            if (latest != request.expectedLatestVersion()) throw new IdentityException(ErrorCode.STALE_BASE, "profile latest version changed");
            if (profile.version() != latest + 1) throw new IdentityException(ErrorCode.CONFLICT, "profile version must advance by exactly one");
            if (state.profiles.containsKey(profile.ref())) throw new IdentityException(ErrorCode.CONFLICT, "profile version already exists");
        }
        state.profiles.put(profile.ref(), profile);
        state.latestProfileVersions.put(profile.profileId(), profile.version());
        state.commandFingerprints.put(request.context().commandId(), hex(sha256Unchecked(encodePublishUnchecked(request))));
        state.commandResults.put(request.context().commandId(), profile.profileId() + "#" + profile.version());
        return profile;
    }

    private IdentityEnrollmentRecord applyBegin(State state, BeginIdentityEnrollmentRequest request, boolean validate) {
        IdentityProofingProfile profile = state.profiles.get(request.profileRef());
        if (profile == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
        if (validate) {
            if (profile.standing() != ProofingProfileStanding.ACTIVE) throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "proofing profile not active");
            if (!profile.allowsKind(request.principalKind())) throw new IdentityException(ErrorCode.DENIED, "principal kind not permitted by proofing profile");
            if (state.enrollments.containsKey(request.enrollmentId())) throw new IdentityException(ErrorCode.CONFLICT, "enrollment id already exists");
        }
        IdentityEnrollmentRecord record = new IdentityEnrollmentRecord(
                request.enrollmentId(), request.principalId(), request.principalKind(), request.profileRef(), List.of(), 0,
                EnrollmentDecision.PENDING, EnrollmentStanding.STARTED, request.createdAt(), null);
        state.enrollments.put(record.enrollmentId(), record);
        state.commandFingerprints.put(request.context().commandId(), hex(sha256Unchecked(encodeBeginUnchecked(request))));
        state.commandResults.put(request.context().commandId(), record.enrollmentId());
        return record;
    }

    private IdentityEnrollmentRecord applyComplete(State state, CompleteIdentityEnrollmentRequest request, boolean validate) {
        IdentityEnrollmentRecord current = state.enrollments.get(request.enrollmentId());
        if (current == null) throw new IdentityException(ErrorCode.NOT_FOUND, "enrollment not found");
        if (validate && current.standing() != EnrollmentStanding.STARTED) {
            throw new IdentityException(ErrorCode.CONFLICT, "enrollment already terminal");
        }
        IdentityProofingProfile profile = state.profiles.get(current.profileRef());
        if (profile == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "enrollment profile missing");
        if (validate) validateCompletion(profile, request);
        IdentityEnrollmentRecord completed = new IdentityEnrollmentRecord(
                current.enrollmentId(), current.principalId(), current.principalKind(), current.profileRef(),
                request.proofingEvidenceRefs(), request.assertedAssurance(), request.decision(), request.standing(),
                current.createdAt(), request.completedAt());
        state.enrollments.put(completed.enrollmentId(), completed);
        state.commandFingerprints.put(request.context().commandId(), hex(sha256Unchecked(encodeCompleteUnchecked(request))));
        state.commandResults.put(request.context().commandId(), completed.enrollmentId());
        return completed;
    }

    private static void validateCompletion(IdentityProofingProfile profile, CompleteIdentityEnrollmentRequest request) {
        if (request.standing() == EnrollmentStanding.VERIFIED) {
            if (profile.applicability() == ProofingApplicability.REQUIRED) {
                if (request.decision() != EnrollmentDecision.PASSED) throw new IdentityException(ErrorCode.DENIED, "required proofing must pass explicitly");
                if (request.proofingEvidenceRefs().isEmpty()) throw new IdentityException(ErrorCode.DENIED, "required proofing lacks evidence references");
                if (request.assertedAssurance() < profile.requiredAssurance()) throw new IdentityException(ErrorCode.DENIED, "asserted assurance below required assurance");
            } else if (request.decision() == EnrollmentDecision.NOT_REQUIRED) {
                if (request.assertedAssurance() != 0 || !request.proofingEvidenceRefs().isEmpty()) {
                    throw new IdentityException(ErrorCode.DENIED, "not-required completion cannot manufacture assurance/evidence");
                }
            } else if (request.decision() == EnrollmentDecision.PASSED && request.proofingEvidenceRefs().isEmpty()) {
                throw new IdentityException(ErrorCode.DENIED, "verified proofing pass requires evidence references");
            }
        }
    }

    private void initialize(FileChannel channel) throws IOException {
        if (channel.size() == 0) {
            writeFully(channel, ByteBuffer.wrap(HEADER), 0);
            channel.force(true);
        }
    }

    private State replay(FileChannel channel) throws IOException {
        if (channel.size() == 0) return new State();
        byte[] bytes = readAll(channel);
        if (bytes.length < HEADER.length) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal truncated header");
        for (int i = 0; i < HEADER.length; i++) if (bytes[i] != HEADER[i]) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal header invalid");
        State state = new State();
        int offset = HEADER.length;
        while (offset < bytes.length) {
            if (bytes.length - offset < 4) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal truncated frame length");
            int length = ByteBuffer.wrap(bytes, offset, 4).getInt(); offset += 4;
            if (length < 9 || length > MAX_FRAME_BYTES) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal frame length invalid");
            if (bytes.length - offset < length + DIGEST_BYTES) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal truncated frame");
            byte[] payload = java.util.Arrays.copyOfRange(bytes, offset, offset + length); offset += length;
            byte[] digest = java.util.Arrays.copyOfRange(bytes, offset, offset + DIGEST_BYTES); offset += DIGEST_BYTES;
            if (!MessageDigest.isEqual(digest, sha256(payload))) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal digest mismatch");
            ByteBuffer payloadBuffer = ByteBuffer.wrap(payload);
            long revision = payloadBuffer.getLong();
            if (revision != state.revision + 1) throw new IdentityException(ErrorCode.CORRUPT_STATE, "proofing journal revision gap");
            byte[] event = new byte[payloadBuffer.remaining()]; payloadBuffer.get(event);
            replayEvent(state, event);
            state.revision = revision;
        }
        return state;
    }

    private void replayEvent(State state, byte[] event) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(event))) {
            int type = in.readUnsignedByte();
            if (type == 1) applyPublish(state, readPublish(in), false);
            else if (type == 2) applyBegin(state, readBegin(in), false);
            else if (type == 3) applyComplete(state, readComplete(in), false);
            else throw new IdentityException(ErrorCode.CORRUPT_STATE, "unknown proofing journal event type");
            if (in.available() != 0) throw new IdentityException(ErrorCode.CORRUPT_STATE, "trailing proofing journal event bytes");
        } catch (EOFException error) {
            throw new IdentityException(ErrorCode.CORRUPT_STATE, "truncated proofing journal event");
        }
    }

    private void append(FileChannel channel, long revision, byte[] event) throws IOException {
        ByteBuffer payload = ByteBuffer.allocate(8 + event.length);
        payload.putLong(revision).put(event);
        byte[] bytes = payload.array();
        ByteBuffer frame = ByteBuffer.allocate(4 + bytes.length + DIGEST_BYTES);
        frame.putInt(bytes.length).put(bytes).put(sha256(bytes)).flip();
        writeFully(channel, frame, channel.size());
        channel.force(true);
    }

    private static byte[] encodePublish(PublishIdentityProofingProfileRequest request) throws IOException { return encodePublishUnchecked(request); }
    private static byte[] encodePublishUnchecked(PublishIdentityProofingProfileRequest request) {
        return encode(out -> {
            out.writeByte(1); writeContext(out, request.context()); writeProfile(out, request.profile()); out.writeLong(request.expectedLatestVersion());
        });
    }
    private static byte[] encodeBegin(BeginIdentityEnrollmentRequest request) throws IOException { return encodeBeginUnchecked(request); }
    private static byte[] encodeBeginUnchecked(BeginIdentityEnrollmentRequest request) {
        return encode(out -> {
            out.writeByte(2); writeContext(out, request.context()); writeString(out, request.enrollmentId()); writeString(out, request.principalId());
            writeProfileRef(out, request.profileRef()); writeString(out, request.principalKind()); writeInstant(out, request.createdAt());
        });
    }
    private static byte[] encodeComplete(CompleteIdentityEnrollmentRequest request) throws IOException { return encodeCompleteUnchecked(request); }
    private static byte[] encodeCompleteUnchecked(CompleteIdentityEnrollmentRequest request) {
        return encode(out -> {
            out.writeByte(3); writeContext(out, request.context()); writeString(out, request.enrollmentId()); writeList(out, request.proofingEvidenceRefs());
            out.writeInt(request.assertedAssurance()); writeString(out, request.decision().name()); writeString(out, request.standing().name()); writeInstant(out, request.completedAt());
        });
    }

    private static PublishIdentityProofingProfileRequest readPublish(DataInputStream in) throws IOException {
        return new PublishIdentityProofingProfileRequest(readContext(in), readProfile(in), in.readLong());
    }
    private static BeginIdentityEnrollmentRequest readBegin(DataInputStream in) throws IOException {
        return new BeginIdentityEnrollmentRequest(readContext(in), readString(in), readString(in), readProfileRef(in), readString(in), readInstant(in));
    }
    private static CompleteIdentityEnrollmentRequest readComplete(DataInputStream in) throws IOException {
        return new CompleteIdentityEnrollmentRequest(readContext(in), readString(in), readList(in), in.readInt(),
                EnrollmentDecision.valueOf(readString(in)), EnrollmentStanding.valueOf(readString(in)), readInstant(in));
    }

    private static void writeContext(DataOutputStream out, MutationContext context) throws IOException {
        writeString(out, context.commandId()); writeString(out, context.actorPrincipalRef()); writeList(out, context.authorityEvidenceRefs());
    }
    private static MutationContext readContext(DataInputStream in) throws IOException { return new MutationContext(readString(in), readString(in), readList(in)); }
    private static void writeProfile(DataOutputStream out, IdentityProofingProfile profile) throws IOException {
        writeString(out, profile.profileId()); out.writeLong(profile.version()); writeList(out, new ArrayList<>(new java.util.TreeSet<>(profile.principalKinds())));
        writeString(out, profile.applicability().name()); out.writeInt(profile.requiredAssurance()); writeList(out, profile.allowedMethods());
        writeList(out, profile.evidenceRequirements()); writeString(out, profile.standing().name()); writeInstant(out, profile.publishedAt());
    }
    private static IdentityProofingProfile readProfile(DataInputStream in) throws IOException {
        return new IdentityProofingProfile(readString(in), in.readLong(), Set.copyOf(readList(in)), ProofingApplicability.valueOf(readString(in)),
                in.readInt(), readList(in), readList(in), ProofingProfileStanding.valueOf(readString(in)), readInstant(in));
    }
    private static void writeProfileRef(DataOutputStream out, ProfileRef ref) throws IOException { writeString(out, ref.profileId()); out.writeLong(ref.version()); }
    private static ProfileRef readProfileRef(DataInputStream in) throws IOException { return new ProfileRef(readString(in), in.readLong()); }
    private static void writeInstant(DataOutputStream out, Instant instant) throws IOException { out.writeLong(instant.getEpochSecond()); out.writeInt(instant.getNano()); }
    private static Instant readInstant(DataInputStream in) throws IOException { return Instant.ofEpochSecond(in.readLong(), in.readInt()); }
    private static void writeString(DataOutputStream out, String value) throws IOException { out.writeUTF(value); }
    private static String readString(DataInputStream in) throws IOException { return in.readUTF(); }
    private static void writeList(DataOutputStream out, List<String> values) throws IOException { out.writeInt(values.size()); for (String value : values) writeString(out, value); }
    private static List<String> readList(DataInputStream in) throws IOException { int n = in.readInt(); if (n < 0 || n > 4096) throw new IdentityException(ErrorCode.CORRUPT_STATE, "invalid list size"); List<String> out = new ArrayList<>(n); for (int i=0;i<n;i++) out.add(readString(in)); return List.copyOf(out); }

    private interface Encoder { void write(DataOutputStream out) throws IOException; }
    private static byte[] encode(Encoder encoder) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream out = new DataOutputStream(bytes)) { encoder.write(out); }
            return bytes.toByteArray();
        } catch (IOException error) { throw new IllegalStateException("in-memory encode failed", error); }
    }

    private void ensureParent() throws IOException { Path parent = path.getParent(); if (parent != null) Files.createDirectories(parent); }
    private static byte[] readAll(FileChannel channel) throws IOException {
        if (channel.size() > Integer.MAX_VALUE) throw new IOException("proofing journal too large");
        ByteBuffer buffer = ByteBuffer.allocate((int) channel.size()); long position = 0;
        while (buffer.hasRemaining()) { int n = channel.read(buffer, position); if (n < 0) break; position += n; }
        return buffer.array();
    }
    private static void writeFully(FileChannel channel, ByteBuffer buffer, long position) throws IOException { while (buffer.hasRemaining()) position += channel.write(buffer, position); }
    private static byte[] sha256(byte[] bytes) { try { return MessageDigest.getInstance("SHA-256").digest(bytes); } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); } }
    private static byte[] sha256Unchecked(byte[] bytes) { return sha256(bytes); }
    private static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(bytes.length * 2); for (byte b : bytes) out.append(String.format("%02x", b)); return out.toString(); }

    private interface ProfileOperation { IdentityProofingProfile apply(State state); }
    private interface EnrollmentOperation { IdentityEnrollmentRecord apply(State state); }

    private static final class State {
        long revision;
        final Map<ProfileRef, IdentityProofingProfile> profiles = new LinkedHashMap<>();
        final Map<String, Long> latestProfileVersions = new HashMap<>();
        final Map<String, IdentityEnrollmentRecord> enrollments = new LinkedHashMap<>();
        final Map<String, String> commandFingerprints = new HashMap<>();
        final Map<String, String> commandResults = new HashMap<>();
        Snapshot snapshot() { return new Snapshot(revision, Map.copyOf(profiles), Map.copyOf(latestProfileVersions), Map.copyOf(enrollments)); }
    }
}
