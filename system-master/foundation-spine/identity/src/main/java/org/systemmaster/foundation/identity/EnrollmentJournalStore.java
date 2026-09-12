package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.EnrollmentContracts.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

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
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Portable durable reference adapter for O-WP-002 mechanics; not production persistence authority. */
public final class EnrollmentJournalStore {
    private static final String HEADER = "SYSTEM_MASTER_IDENTITY_OWP002_V1\n";
    private static final byte[] HEADER_BYTES = HEADER.getBytes(StandardCharsets.US_ASCII);
    private static final long MAX_BYTES = 256L * 1024L * 1024L;
    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path path;
    private final Object jvmLock;

    public EnrollmentJournalStore(Path path) {
        this.path = Objects.requireNonNull(path, "path").toAbsolutePath().normalize();
        this.jvmLock = JVM_LOCKS.computeIfAbsent(this.path, ignored -> new Object());
    }

    public Path path() { return path; }

    public Snapshot load() throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel ch = FileChannel.open(path, StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = ch.lock()) {
                if (ch.size() == 0) return new State().snapshot();
                return replay(ch).snapshot();
            }
        }
    }

    public IdentityEnrollmentRecord existingCommandEnrollment(String commandId, String semanticFingerprint) throws IOException {
        Snapshot snapshot = load();
        Seen seen = snapshot.seen().get(requireId("commandId", commandId));
        if (seen == null) return null;
        if (!constantTimeEquals(seen.fingerprint(), semanticFingerprint)) {
            throw new IdentityException(ErrorCode.CONFLICT, "same commandId with different semantic request");
        }
        if (seen.enrollmentId() == null) return null;
        IdentityEnrollmentRecord enrollment = snapshot.enrollments().get(seen.enrollmentId());
        if (enrollment == null) throw corrupt("idempotency entry references missing enrollment");
        return enrollment;
    }

    ProfileMutationResult publish(Publish command) throws IOException {
        ApplyResult result = transact(command);
        IdentityProofingProfile profile = result.profile;
        return new ProfileMutationResult(result.journalRevision, result.changed, profile);
    }

    EnrollmentMutationResult begin(Begin command) throws IOException {
        ApplyResult result = transact(command);
        return new EnrollmentMutationResult(result.journalRevision, result.changed, result.enrollment);
    }

    EnrollmentMutationResult complete(Complete command) throws IOException {
        ApplyResult result = transact(command);
        return new EnrollmentMutationResult(result.journalRevision, result.changed, result.enrollment);
    }

    public long sizeBytes() throws IOException { return Files.exists(path) ? Files.size(path) : 0; }

    private ApplyResult transact(Command command) throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel ch = FileChannel.open(path, StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = ch.lock()) {
                if (ch.size() == 0) {
                    writeFully(ch, ByteBuffer.wrap(HEADER_BYTES), 0);
                    ch.force(true);
                }
                State state = replay(ch);
                ApplyResult result = state.apply(command);
                if (!result.changed) return result;
                byte[] payload = encode(command);
                String encoded = Base64.getEncoder().encodeToString(payload);
                String material = state.journalRevision + "|" + encoded;
                String line = material + "|" + sha256(material.getBytes(StandardCharsets.US_ASCII)) + "\n";
                byte[] bytes = line.getBytes(StandardCharsets.US_ASCII);
                if (ch.size() + bytes.length > MAX_BYTES) throw new IdentityException(ErrorCode.UNAVAILABLE, "enrollment journal size ceiling exceeded");
                writeFully(ch, ByteBuffer.wrap(bytes), ch.size());
                ch.force(true);
                return result;
            }
        }
    }

    private State replay(FileChannel ch) throws IOException {
        byte[] bytes = readAll(ch);
        if (bytes.length < HEADER_BYTES.length) throw corrupt("truncated enrollment journal header");
        String text = new String(bytes, StandardCharsets.US_ASCII);
        if (!text.startsWith(HEADER)) throw corrupt("invalid enrollment journal header");
        if (!text.endsWith("\n")) throw corrupt("truncated enrollment journal frame");
        State state = new State();
        String body = text.substring(HEADER.length());
        if (body.isEmpty()) return state;
        String[] lines = body.split("\n", -1);
        long expected = 1;
        for (int i = 0; i < lines.length - 1; i++) {
            String line = lines[i];
            int p1 = line.indexOf('|');
            int p2 = line.lastIndexOf('|');
            if (p1 <= 0 || p2 <= p1) throw corrupt("invalid enrollment journal frame");
            long revision;
            try { revision = Long.parseLong(line.substring(0, p1)); }
            catch (NumberFormatException e) { throw corrupt("invalid enrollment journal revision"); }
            if (revision != expected) throw corrupt("enrollment journal revision gap");
            String material = line.substring(0, p2);
            if (!constantTimeEquals(line.substring(p2 + 1), sha256(material.getBytes(StandardCharsets.US_ASCII)))) {
                throw corrupt("enrollment journal digest mismatch");
            }
            byte[] payload;
            try { payload = Base64.getDecoder().decode(line.substring(p1 + 1, p2)); }
            catch (IllegalArgumentException e) { throw corrupt("invalid enrollment payload encoding"); }
            ApplyResult result = state.apply(decode(payload));
            if (!result.changed || result.journalRevision != revision) throw corrupt("invalid enrollment replay result");
            expected++;
        }
        return state;
    }

    private void ensureParent() throws IOException {
        Path parent = path.getParent();
        if (parent != null) Files.createDirectories(parent);
    }

    public record Seen(String fingerprint, long journalRevision, String enrollmentId, String profileRef) {}

    public record Snapshot(long journalRevision,
                           Map<String, IdentityProofingProfile> profiles,
                           Map<String, Long> latestProfileVersion,
                           Map<String, IdentityEnrollmentRecord> enrollments,
                           Map<String, Seen> seen) {
        public Snapshot {
            profiles = Map.copyOf(profiles);
            latestProfileVersion = Map.copyOf(latestProfileVersion);
            enrollments = Map.copyOf(enrollments);
            seen = Map.copyOf(seen);
        }
    }

    sealed interface Command permits Publish, Begin, Complete {
        MutationContext context();
        Instant appliedAt();
        String fingerprintMaterial();
    }

    record Publish(PublishIdentityProofingProfileRequest request, Instant appliedAt) implements Command {
        Publish(PublishIdentityProofingProfileRequest request) { this(request, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonicalPublish(request); }
    }

    record Begin(BeginIdentityEnrollmentRequest request, String principalKind, Instant appliedAt) implements Command {
        Begin(BeginIdentityEnrollmentRequest request, String principalKind) { this(request, principalKind, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonicalBegin(request, principalKind); }
    }

    record Complete(CompleteIdentityEnrollmentRequest request, ValidationResult validation, Instant appliedAt) implements Command {
        Complete(CompleteIdentityEnrollmentRequest request, ValidationResult validation) { this(request, validation, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonicalCompleteRequest(request); }
    }

    static String fingerprintCompleteRequest(CompleteIdentityEnrollmentRequest request) {
        return sha256(canonicalCompleteRequest(request).getBytes(StandardCharsets.UTF_8));
    }

    private record ApplyResult(long journalRevision, boolean changed, IdentityProofingProfile profile, IdentityEnrollmentRecord enrollment) {}

    private static final class State {
        long journalRevision;
        final Map<String, IdentityProofingProfile> profiles = new LinkedHashMap<>();
        final Map<String, Long> latestProfileVersion = new LinkedHashMap<>();
        final Map<String, IdentityEnrollmentRecord> enrollments = new LinkedHashMap<>();
        final Map<String, Seen> seen = new HashMap<>();

        Snapshot snapshot() { return new Snapshot(journalRevision, profiles, latestProfileVersion, enrollments, seen); }

        ApplyResult apply(Command command) {
            String fingerprint = sha256(command.fingerprintMaterial().getBytes(StandardCharsets.UTF_8));
            String commandId = command.context().commandId();
            Seen prior = seen.get(commandId);
            if (prior != null) {
                if (!constantTimeEquals(prior.fingerprint, fingerprint)) throw new IdentityException(ErrorCode.CONFLICT, "same commandId with different semantic request");
                IdentityProofingProfile profile = prior.profileRef == null ? null : profiles.get(prior.profileRef);
                IdentityEnrollmentRecord enrollment = prior.enrollmentId == null ? null : enrollments.get(prior.enrollmentId);
                return new ApplyResult(prior.journalRevision, false, profile, enrollment);
            }

            IdentityProofingProfile profile = null;
            IdentityEnrollmentRecord enrollment = null;
            if (command instanceof Publish c) profile = applyPublish(c.request);
            else if (command instanceof Begin c) enrollment = applyBegin(c.request, c.principalKind, c.appliedAt);
            else if (command instanceof Complete c) enrollment = applyComplete(c.request, c.validation);
            else throw new IllegalStateException("unsupported enrollment command");

            journalRevision++;
            seen.put(commandId, new Seen(fingerprint, journalRevision,
                    enrollment == null ? null : enrollment.enrollmentId(), profile == null ? null : profile.ref()));
            return new ApplyResult(journalRevision, true, profile, enrollment);
        }

        private IdentityProofingProfile applyPublish(PublishIdentityProofingProfileRequest r) {
            Objects.requireNonNull(r.context(), "context");
            String id = requireId("profileId", r.profileId());
            long current = latestProfileVersion.getOrDefault(id, 0L);
            if (r.expectedPreviousVersion() != current) throw new IdentityException(ErrorCode.STALE_BASE, "proofing profile version changed");
            long version = current + 1;
            IdentityProofingProfile profile = new IdentityProofingProfile(id, version, r.applicability(), r.requiredAssurance(),
                    r.allowedPrincipalKinds(), r.allowedMethods(), r.evidenceRequirements(), r.standing());
            profiles.put(profile.ref(), profile);
            latestProfileVersion.put(id, version);
            return profile;
        }

        private IdentityEnrollmentRecord applyBegin(BeginIdentityEnrollmentRequest r, String principalKind, Instant appliedAt) {
            if (enrollments.containsKey(r.enrollmentId())) throw new IdentityException(ErrorCode.CONFLICT, "enrollmentId already exists");
            String profileRef = requireId("profileId", r.profileId()) + "@" + r.profileVersion();
            IdentityProofingProfile profile = profiles.get(profileRef);
            if (profile == null) throw new IdentityException(ErrorCode.NOT_FOUND, "proofing profile not found");
            if (profile.standing() != ProfileStanding.ACTIVE) throw new IdentityException(ErrorCode.REVOKED, "proofing profile not active");
            long latest = latestProfileVersion.getOrDefault(profile.profileId(), 0L);
            if (profile.version() != latest) throw new IdentityException(ErrorCode.STALE_BASE, "proofing profile is not current");
            if (!profile.allowedPrincipalKinds().contains(token("principalKind", principalKind))) {
                throw new IdentityException(ErrorCode.DENIED, "principal kind not admitted by proofing profile");
            }
            IdentityEnrollmentRecord enrollment = new IdentityEnrollmentRecord(r.enrollmentId(), r.principalId(), profile.ref(),
                    List.of(), "UNASSESSED", EnrollmentDecision.PENDING, appliedAt, EnrollmentStanding.OPEN);
            enrollments.put(enrollment.enrollmentId(), enrollment);
            return enrollment;
        }

        private IdentityEnrollmentRecord applyComplete(CompleteIdentityEnrollmentRequest r, ValidationResult validation) {
            IdentityEnrollmentRecord current = enrollments.get(requireId("enrollmentId", r.enrollmentId()));
            if (current == null) throw new IdentityException(ErrorCode.NOT_FOUND, "enrollment not found");
            if (current.standing() != EnrollmentStanding.OPEN || current.decision() != EnrollmentDecision.PENDING) {
                throw new IdentityException(ErrorCode.CONFLICT, "enrollment already completed");
            }
            IdentityProofingProfile profile = profiles.get(current.profileRef());
            if (profile == null) throw corrupt("enrollment references missing profile");
            if (profile.standing() != ProfileStanding.ACTIVE) throw new IdentityException(ErrorCode.REVOKED, "proofing profile not active at completion");
            long latest = latestProfileVersion.getOrDefault(profile.profileId(), 0L);
            if (profile.version() != latest) throw new IdentityException(ErrorCode.STALE_BASE, "proofing profile superseded before completion");

            String method = token("selectedMethod", r.selectedMethod());
            String asserted = token("assertedAssurance", r.assertedAssurance());
            EnrollmentDecision decision;
            EnrollmentStanding standing;
            String assurance;
            List<String> evidence;

            if (profile.applicability() == ProfileApplicability.HUMAN_SELF_ASSERTED_ALLOWED) {
                if (!"SELF_ASSERTED".equals(asserted)) throw new IdentityException(ErrorCode.DENIED, "self-asserted profile cannot create proofed assurance");
                if (!r.evidenceRefs().isEmpty()) throw new IdentityException(ErrorCode.INVALID_ARGUMENT, "self-asserted path does not accept proofing evidence payloads");
                decision = EnrollmentDecision.SELF_ASSERTED;
                standing = EnrollmentStanding.COMPLETED;
                assurance = "SELF_ASSERTED";
                evidence = List.of();
            } else {
                if (!profile.allowedMethods().contains(method)) throw new IdentityException(ErrorCode.DENIED, "selected method not allowed by profile");
                if (r.evidenceRefs().isEmpty() || validation.evidenceReceiptRefs().isEmpty()) {
                    throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "required proofing/attestation evidence receipt missing");
                }
                assurance = validation.validatedAssurance();
                if (!assurance.equals(asserted)) throw new IdentityException(ErrorCode.CONFLICT, "asserted assurance differs from validated assurance");
                if (validation.outcome() == ValidationOutcome.PASS && !assurance.equals(profile.requiredAssurance())) {
                    throw new IdentityException(ErrorCode.DENIED, "validated assurance does not exactly satisfy required assurance");
                }
                decision = switch (validation.outcome()) {
                    case PASS -> profile.applicability() == ProfileApplicability.HUMAN_PROOFING_REQUIRED ? EnrollmentDecision.VERIFIED : EnrollmentDecision.ATTESTED;
                    case REJECT -> EnrollmentDecision.REJECTED;
                    case QUARANTINE -> EnrollmentDecision.QUARANTINED;
                    case UNKNOWN -> EnrollmentDecision.UNKNOWN;
                };
                standing = switch (validation.outcome()) {
                    case PASS -> EnrollmentStanding.COMPLETED;
                    case REJECT -> EnrollmentStanding.REJECTED;
                    case QUARANTINE -> EnrollmentStanding.QUARANTINED;
                    case UNKNOWN -> EnrollmentStanding.UNKNOWN;
                };
                evidence = mergeRefs(r.evidenceRefs(), validation.evidenceReceiptRefs());
            }
            IdentityEnrollmentRecord completed = new IdentityEnrollmentRecord(current.enrollmentId(), current.principalId(), current.profileRef(),
                    evidence, assurance, decision, current.createdAt(), standing);
            enrollments.put(completed.enrollmentId(), completed);
            return completed;
        }
    }

    private static String canonicalPublish(PublishIdentityProofingProfileRequest r) {
        return String.join("|", "PUBLISH", context(r.context()), r.profileId(), Long.toString(r.expectedPreviousVersion()),
                r.applicability().name(), token("requiredAssurance", r.requiredAssurance()), canonicalSet(r.allowedPrincipalKinds()),
                canonicalTokens(r.allowedMethods()), canonicalTokens(r.evidenceRequirements()), r.standing().name());
    }

    private static String canonicalBegin(BeginIdentityEnrollmentRequest r, String principalKind) {
        return String.join("|", "BEGIN", context(r.context()), r.enrollmentId(), r.principalId(), r.profileId(), Long.toString(r.profileVersion()), token("principalKind", principalKind));
    }

    private static String canonicalCompleteRequest(CompleteIdentityEnrollmentRequest r) {
        return String.join("|", "COMPLETE", context(r.context()), r.enrollmentId(), token("selectedMethod", r.selectedMethod()),
                token("assertedAssurance", r.assertedAssurance()), canonicalRefs(r.evidenceRefs()));
    }

    private static String context(MutationContext c) { return c.actorPrincipalRef() + ":" + canonicalRefs(c.authorityEvidenceRefs()); }
    private static String canonicalSet(Set<String> values) { List<String> out = new ArrayList<>(values); out.replaceAll(v -> token("set", v)); out.sort(String::compareTo); return String.join(",", out); }
    private static String canonicalTokens(List<String> values) { List<String> out = new ArrayList<>(values == null ? List.of() : values); out.replaceAll(v -> token("token", v)); out.sort(String::compareTo); return String.join(",", out); }
    private static String canonicalRefs(List<String> values) { List<String> out = new ArrayList<>(values == null ? List.of() : values); out.sort(String::compareTo); return String.join(",", out); }

    private static List<String> mergeRefs(List<String> a, List<String> b) {
        LinkedHashSet<String> out = new LinkedHashSet<>(a == null ? List.of() : a);
        out.addAll(b == null ? List.of() : b);
        return List.copyOf(out);
    }

    private static byte[] encode(Command command) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            if (command instanceof Publish c) {
                out.writeByte(1); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.profileId()); out.writeLong(c.request.expectedPreviousVersion());
                writeString(out, c.request.applicability().name()); writeString(out, c.request.requiredAssurance()); writeSet(out, c.request.allowedPrincipalKinds());
                writeList(out, c.request.allowedMethods()); writeList(out, c.request.evidenceRequirements()); writeString(out, c.request.standing().name());
            } else if (command instanceof Begin c) {
                out.writeByte(2); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.enrollmentId()); writeString(out, c.request.principalId());
                writeString(out, c.request.profileId()); out.writeLong(c.request.profileVersion()); writeString(out, c.principalKind);
            } else if (command instanceof Complete c) {
                out.writeByte(3); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.enrollmentId()); writeString(out, c.request.selectedMethod());
                writeString(out, c.request.assertedAssurance()); writeList(out, c.request.evidenceRefs()); writeString(out, c.validation.outcome().name()); writeString(out, c.validation.validatedAssurance()); writeList(out, c.validation.evidenceReceiptRefs());
            } else throw new IOException("unsupported enrollment command");
        }
        return bytes.toByteArray();
    }

    private static Command decode(byte[] payload) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(payload))) {
            int type = in.readUnsignedByte(); Instant appliedAt = readInstant(in); MutationContext ctx = readContext(in);
            Command command = switch (type) {
                case 1 -> new Publish(new PublishIdentityProofingProfileRequest(ctx, readString(in), in.readLong(), ProfileApplicability.valueOf(readString(in)), readString(in), readSet(in), readList(in), readList(in), ProfileStanding.valueOf(readString(in))), appliedAt);
                case 2 -> new Begin(new BeginIdentityEnrollmentRequest(ctx, readString(in), readString(in), readString(in), in.readLong()), readString(in), appliedAt);
                case 3 -> new Complete(new CompleteIdentityEnrollmentRequest(ctx, readString(in), readString(in), readString(in), readList(in)), new ValidationResult(ValidationOutcome.valueOf(readString(in)), readString(in), readList(in)), appliedAt);
                default -> throw new IOException("unsupported enrollment command type");
            };
            if (in.read() != -1) throw new IOException("trailing enrollment command bytes");
            return command;
        } catch (EOFException | IllegalArgumentException e) { throw new IOException("invalid enrollment command payload", e); }
    }

    private static byte[] readAll(FileChannel ch) throws IOException {
        long size = ch.size(); if (size > MAX_BYTES || size > Integer.MAX_VALUE) throw corrupt("enrollment journal too large");
        ByteBuffer b = ByteBuffer.allocate((int) size); long offset = 0;
        while (b.hasRemaining()) { int n = ch.read(b, offset); if (n < 0) break; if (n == 0) continue; offset += n; }
        if (b.hasRemaining()) throw corrupt("short enrollment journal read"); return b.array();
    }
    private static void writeFully(FileChannel ch, ByteBuffer b, long offset) throws IOException { long p=offset; while(b.hasRemaining()){int n=ch.write(b,p);if(n<=0)throw new IOException("short enrollment journal write");p+=n;} }
    private static IdentityException corrupt(String message) { return new IdentityException(ErrorCode.CORRUPT_STATE, message); }
    private static String sha256(byte[] value) { try { byte[] d=MessageDigest.getInstance("SHA-256").digest(value); StringBuilder s=new StringBuilder(64); for(byte x:d)s.append(String.format("%02x",x)); return s.toString(); } catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);} }
    private static boolean constantTimeEquals(String a,String b){return MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII),b.getBytes(StandardCharsets.US_ASCII));}

    private static void writeContext(DataOutputStream out,MutationContext c)throws IOException{writeString(out,c.commandId());writeString(out,c.actorPrincipalRef());writeList(out,c.authorityEvidenceRefs());}
    private static MutationContext readContext(DataInputStream in)throws IOException{return new MutationContext(readString(in),readString(in),readList(in));}
    private static void writeString(DataOutputStream out,String v)throws IOException{byte[] b=Objects.requireNonNull(v).getBytes(StandardCharsets.UTF_8);if(b.length>65535)throw new IOException("string too large");out.writeInt(b.length);out.write(b);}
    private static String readString(DataInputStream in)throws IOException{int n=in.readInt();if(n<0||n>65535)throw new IOException("string length invalid");byte[] b=in.readNBytes(n);if(b.length!=n)throw new EOFException();return new String(b,StandardCharsets.UTF_8);}
    private static void writeInstant(DataOutputStream out,Instant v)throws IOException{writeString(out,v.toString());}
    private static Instant readInstant(DataInputStream in)throws IOException{return Instant.parse(readString(in));}
    private static void writeList(DataOutputStream out,List<String> values)throws IOException{List<String> v=values==null?List.of():values;if(v.size()>1024)throw new IOException("list too large");out.writeInt(v.size());for(String s:v)writeString(out,s);}
    private static List<String> readList(DataInputStream in)throws IOException{int n=in.readInt();if(n<0||n>1024)throw new IOException("list length invalid");List<String> v=new ArrayList<>(n);for(int i=0;i<n;i++)v.add(readString(in));return List.copyOf(v);}
    private static void writeSet(DataOutputStream out,Set<String> values)throws IOException{List<String> v=new ArrayList<>(values);v.sort(String::compareTo);writeList(out,v);}
    private static Set<String> readSet(DataInputStream in)throws IOException{return Set.copyOf(readList(in));}
}
