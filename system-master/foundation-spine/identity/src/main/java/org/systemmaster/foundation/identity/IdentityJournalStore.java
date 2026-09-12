package org.systemmaster.foundation.identity;

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
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Portable reference persistence adapter for O-WP-001 qualification.
 *
 * It is deliberately classified as a persistence adapter, not System Master's
 * production physical-persistence authority. The semantic owner remains the
 * Identity boundary and a future admitted Canonical Data adapter may replace
 * this transport without changing O-WP-001 semantics.
 */
public final class IdentityJournalStore {
    private static final String HEADER = "SYSTEM_MASTER_IDENTITY_OWP001_V1\n";
    private static final byte[] HEADER_BYTES = HEADER.getBytes(StandardCharsets.US_ASCII);
    private static final long MAX_BYTES = 256L * 1024L * 1024L;
    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path path;
    private final Object jvmLock;

    public IdentityJournalStore(Path path) {
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

    MutationResult transact(Command command) throws IOException {
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
                if (!result.changed) return new MutationResult(state.journalRevision, false, result.principal);

                byte[] payload = encode(command);
                String encoded = Base64.getEncoder().encodeToString(payload);
                String material = state.journalRevision + "|" + encoded;
                String line = material + "|" + sha256(material.getBytes(StandardCharsets.US_ASCII)) + "\n";
                byte[] bytes = line.getBytes(StandardCharsets.US_ASCII);
                if (ch.size() + bytes.length > MAX_BYTES) {
                    throw new IdentityException(ErrorCode.UNAVAILABLE, "identity journal size ceiling exceeded");
                }
                writeFully(ch, ByteBuffer.wrap(bytes), ch.size());
                ch.force(true);
                return new MutationResult(state.journalRevision, true, result.principal);
            }
        }
    }

    public long sizeBytes() throws IOException { return Files.exists(path) ? Files.size(path) : 0; }

    private State replay(FileChannel ch) throws IOException {
        byte[] bytes = readAll(ch);
        if (bytes.length < HEADER_BYTES.length) throw corrupt("truncated journal header");
        String text = new String(bytes, StandardCharsets.US_ASCII);
        if (!text.startsWith(HEADER)) throw corrupt("invalid journal header");
        if (!text.endsWith("\n")) throw corrupt("truncated journal frame");
        State state = new State();
        String body = text.substring(HEADER.length());
        if (body.isEmpty()) return state;
        String[] lines = body.split("\n", -1);
        long expectedJournalRevision = 1;
        for (int i = 0; i < lines.length - 1; i++) {
            String line = lines[i];
            int p1 = line.indexOf('|');
            int p2 = line.lastIndexOf('|');
            if (p1 <= 0 || p2 <= p1) throw corrupt("invalid journal frame");
            long frameRevision;
            try { frameRevision = Long.parseLong(line.substring(0, p1)); }
            catch (NumberFormatException e) { throw corrupt("invalid journal revision"); }
            if (frameRevision != expectedJournalRevision) throw corrupt("journal revision gap");
            String material = line.substring(0, p2);
            if (!constantTimeEquals(line.substring(p2 + 1), sha256(material.getBytes(StandardCharsets.US_ASCII)))) {
                throw corrupt("journal frame digest mismatch");
            }
            byte[] payload;
            try { payload = Base64.getDecoder().decode(line.substring(p1 + 1, p2)); }
            catch (IllegalArgumentException e) { throw corrupt("invalid journal payload encoding"); }
            ApplyResult result = state.apply(decode(payload));
            if (!result.changed) throw corrupt("persisted duplicate/non-changing command");
            if (state.journalRevision != frameRevision) throw corrupt("replay revision mismatch");
            expectedJournalRevision++;
        }
        return state;
    }

    private void ensureParent() throws IOException {
        Path parent = path.getParent();
        if (parent != null) Files.createDirectories(parent);
    }

    private static byte[] readAll(FileChannel ch) throws IOException {
        long size = ch.size();
        if (size > MAX_BYTES || size > Integer.MAX_VALUE) throw corrupt("journal too large");
        ByteBuffer buf = ByteBuffer.allocate((int) size);
        long offset = 0;
        while (buf.hasRemaining()) {
            int n = ch.read(buf, offset);
            if (n < 0) break;
            if (n == 0) continue;
            offset += n;
        }
        if (buf.hasRemaining()) throw corrupt("short journal read");
        return buf.array();
    }

    private static void writeFully(FileChannel ch, ByteBuffer buf, long offset) throws IOException {
        long pos = offset;
        while (buf.hasRemaining()) {
            int n = ch.write(buf, pos);
            if (n <= 0) throw new IOException("short journal write");
            pos += n;
        }
    }

    private static IdentityException corrupt(String message) {
        return new IdentityException(ErrorCode.CORRUPT_STATE, message);
    }

    private static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }

    private static String sha256(byte[] value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    public record Snapshot(long journalRevision, Map<String, Principal> principals,
                           Map<String, List<PrincipalRevision>> histories,
                           Map<String, PrincipalAlias> aliases) {
        public Snapshot {
            principals = Map.copyOf(principals);
            Map<String, List<PrincipalRevision>> safe = new HashMap<>();
            histories.forEach((k, v) -> safe.put(k, List.copyOf(v)));
            histories = Map.copyOf(safe);
            aliases = Map.copyOf(aliases);
        }
    }

    sealed interface Command permits Register, Revise, Alias, Standing {
        MutationContext context();
        String fingerprintMaterial();
    }
    record Register(RegisterPrincipalRequest request, Instant appliedAt) implements Command {
        Register(RegisterPrincipalRequest request) { this(request, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonical(request); }
    }
    record Revise(RevisePrincipalRequest request, Instant appliedAt) implements Command {
        Revise(RevisePrincipalRequest request) { this(request, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonical(request); }
    }
    record Alias(RegisterPrincipalAliasRequest request, Instant appliedAt) implements Command {
        Alias(RegisterPrincipalAliasRequest request) { this(request, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonical(request); }
    }
    record Standing(ChangePrincipalStandingRequest request, Instant appliedAt) implements Command {
        Standing(ChangePrincipalStandingRequest request) { this(request, Instant.now()); }
        public MutationContext context() { return request.context(); }
        public String fingerprintMaterial() { return canonical(request); }
    }

    private static String canonical(Object request) {
        if (request instanceof RegisterPrincipalRequest r) {
            return String.join("|", "REGISTER", canonicalContext(r.context()), r.principalId(), r.kind().value(),
                    r.initialStatus().name(), canonicalMap(r.displayMetadata()), canonicalList(r.authorityRefs()), canonicalList(r.evidenceRefs()));
        }
        if (request instanceof RevisePrincipalRequest r) {
            return String.join("|", "REVISE", canonicalContext(r.context()), r.principalId(), Long.toString(r.expectedRevision()),
                    canonicalMap(r.displayMetadata()), r.reason(), canonicalList(r.evidenceRefs()));
        }
        if (request instanceof RegisterPrincipalAliasRequest r) {
            return String.join("|", "ALIAS", canonicalContext(r.context()), r.aliasId(), r.principalId(),
                    Long.toString(r.expectedPrincipalRevision()), r.aliasType(), r.valueDigestOrRef(), r.issuerOrNamespace(),
                    r.validFrom().toString(), r.validTo() == null ? "" : r.validTo().toString());
        }
        if (request instanceof ChangePrincipalStandingRequest r) {
            return String.join("|", "STANDING", canonicalContext(r.context()), r.principalId(), Long.toString(r.expectedRevision()),
                    r.newStatus().name(), r.reason(), r.supersededByPrincipalId() == null ? "" : r.supersededByPrincipalId(),
                    r.adjudicationRef() == null ? "" : r.adjudicationRef(), canonicalList(r.evidenceRefs()));
        }
        throw new IllegalArgumentException("unsupported canonical request");
    }

    private static String canonicalContext(MutationContext context) {
        return context.actorPrincipalRef() + ":" + canonicalList(context.authorityEvidenceRefs());
    }

    private static String canonicalList(List<String> values) {
        List<String> safe = new ArrayList<>(values == null ? List.of() : values);
        safe.sort(String::compareTo);
        return String.join(",", safe);
    }

    private static String canonicalMap(Map<String, String> values) {
        List<Map.Entry<String, String>> entries = new ArrayList<>((values == null ? Map.<String, String>of() : values).entrySet());
        entries.sort(Map.Entry.comparingByKey());
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, String> entry : entries) {
            if (!out.isEmpty()) out.append(',');
            out.append(entry.getKey()).append('=').append(entry.getValue());
        }
        return out.toString();
    }

    private record Seen(String fingerprint, long journalRevision, String principalId) {}
    private record ApplyResult(boolean changed, Principal principal) {}

    private static final class State {
        long journalRevision;
        final Map<String, Principal> principals = new LinkedHashMap<>();
        final Map<String, List<PrincipalRevision>> histories = new LinkedHashMap<>();
        final Map<String, PrincipalAlias> aliases = new LinkedHashMap<>();
        final Map<String, String> aliasIndex = new HashMap<>();
        final Map<String, Seen> seen = new HashMap<>();

        Snapshot snapshot() { return new Snapshot(journalRevision, principals, histories, aliases); }

        ApplyResult apply(Command command) {
            String commandId = command.context().commandId();
            String fingerprint = sha256(command.fingerprintMaterial().getBytes(StandardCharsets.UTF_8));
            Seen prior = seen.get(commandId);
            if (prior != null) {
                if (!constantTimeEquals(prior.fingerprint, fingerprint)) {
                    throw new IdentityException(ErrorCode.CONFLICT, "same commandId with different semantic request");
                }
                Principal principal = principals.get(prior.principalId);
                if (principal == null) throw corrupt("idempotency entry references missing principal");
                return new ApplyResult(false, principal);
            }

            Principal principal;
            if (command instanceof Register c) principal = applyRegister(c.request, c.appliedAt);
            else if (command instanceof Revise c) principal = applyRevise(c.request, c.appliedAt);
            else if (command instanceof Alias c) principal = applyAlias(c.request, c.appliedAt);
            else if (command instanceof Standing c) principal = applyStanding(c.request, c.appliedAt);
            else throw new IllegalStateException("unsupported command");

            journalRevision++;
            seen.put(commandId, new Seen(fingerprint, journalRevision, principal.principalId()));
            return new ApplyResult(true, principal);
        }

        private Principal applyRegister(RegisterPrincipalRequest r, Instant appliedAt) {
            Objects.requireNonNull(r.context(), "context");
            String id = requireId("principalId", r.principalId());
            if (principals.containsKey(id)) throw new IdentityException(ErrorCode.CONFLICT, "principal already exists");
            PrincipalStatus status = Objects.requireNonNull(r.initialStatus(), "initialStatus");
            if (status != PrincipalStatus.CANDIDATE) {
                throw new IdentityException(ErrorCode.INVALID_ARGUMENT, "O-WP-001 registration starts at CANDIDATE; later standing requires explicit evidence");
            }
            if (immutableRefs(r.authorityRefs()).isEmpty() || immutableRefs(r.evidenceRefs()).isEmpty()) {
                throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "registration requires explicit authority and evidence references");
            }
            Instant now = appliedAt;
            Principal principal = new Principal(id, Objects.requireNonNull(r.kind(), "kind"), status, now, 1,
                    r.authorityRefs(), r.evidenceRefs());
            PrincipalRevision revision = new PrincipalRevision(id, 1, r.displayMetadata(), status, null, now,
                    "REGISTERED", r.evidenceRefs());
            principals.put(id, principal);
            histories.put(id, new ArrayList<>(List.of(revision)));
            return principal;
        }

        private Principal applyRevise(RevisePrincipalRequest r, Instant appliedAt) {
            Principal current = requireCurrent(r.principalId(), r.expectedRevision());
            if (immutableRefs(r.evidenceRefs()).isEmpty()) {
                throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "principal revision requires evidence reference");
            }
            if (current.status() == PrincipalStatus.RETIRED) throw new IdentityException(ErrorCode.REVOKED, "retired principal is terminal");
            long next = current.currentRevision() + 1;
            Instant now = appliedAt;
            Principal updated = new Principal(current.principalId(), current.kind(), current.status(), current.createdAt(), next,
                    current.authorityRefs(), mergeRefs(current.evidenceRefs(), r.evidenceRefs()));
            PrincipalRevision revision = new PrincipalRevision(current.principalId(), next, r.displayMetadata(), current.status(),
                    current.currentRevision(), now, requireBounded("reason", r.reason(), 512), r.evidenceRefs());
            principals.put(current.principalId(), updated);
            histories.get(current.principalId()).add(revision);
            return updated;
        }

        private Principal applyAlias(RegisterPrincipalAliasRequest r, Instant appliedAt) {
            Principal current = requireCurrent(r.principalId(), r.expectedPrincipalRevision());
            if (current.status() == PrincipalStatus.RETIRED || current.status() == PrincipalStatus.DISABLED) {
                throw new IdentityException(ErrorCode.REVOKED, "principal standing does not permit alias registration");
            }
            PrincipalAlias alias = new PrincipalAlias(r.aliasId(), current.principalId(), r.aliasType(), r.valueDigestOrRef(),
                    r.issuerOrNamespace(), r.validFrom(), r.validTo(), AliasStanding.ACTIVE);
            if (aliases.containsKey(alias.aliasId())) throw new IdentityException(ErrorCode.CONFLICT, "aliasId already exists");
            String owner = aliasIndex.get(alias.collisionKey());
            if (owner != null && !owner.equals(current.principalId())) {
                throw new IdentityException(ErrorCode.AMBIGUOUS, "alias collides with a different principal; explicit adjudication required");
            }
            if (owner != null) throw new IdentityException(ErrorCode.CONFLICT, "alias already bound to this principal");
            aliases.put(alias.aliasId(), alias);
            aliasIndex.put(alias.collisionKey(), current.principalId());
            long next = current.currentRevision() + 1;
            Instant now = appliedAt;
            Principal updated = new Principal(current.principalId(), current.kind(), current.status(), current.createdAt(), next,
                    current.authorityRefs(), current.evidenceRefs());
            PrincipalRevision prior = histories.get(current.principalId()).get(histories.get(current.principalId()).size() - 1);
            PrincipalRevision revision = new PrincipalRevision(current.principalId(), next, prior.displayMetadata(), current.status(),
                    current.currentRevision(), now, "ALIAS_REGISTERED:" + alias.aliasId(), List.of());
            principals.put(current.principalId(), updated);
            histories.get(current.principalId()).add(revision);
            return updated;
        }

        private Principal applyStanding(ChangePrincipalStandingRequest r, Instant appliedAt) {
            Principal current = requireCurrent(r.principalId(), r.expectedRevision());
            if (immutableRefs(r.evidenceRefs()).isEmpty()) {
                throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "standing change requires explicit evidence reference");
            }
            PrincipalStatus target = Objects.requireNonNull(r.newStatus(), "newStatus");
            if (!transitionAllowed(current.status(), target)) {
                throw new IdentityException(ErrorCode.CONFLICT, "illegal principal standing transition");
            }
            String reason = requireBounded("reason", r.reason(), 512);
            if (r.supersededByPrincipalId() != null) {
                if (target != PrincipalStatus.RETIRED) throw new IdentityException(ErrorCode.INVALID_ARGUMENT, "merge/supersession requires RETIRED target");
                String replacement = requireId("supersededByPrincipalId", r.supersededByPrincipalId());
                if (replacement.equals(current.principalId())) throw new IdentityException(ErrorCode.INVALID_ARGUMENT, "principal cannot supersede itself");
                if (!principals.containsKey(replacement)) throw new IdentityException(ErrorCode.NOT_FOUND, "superseding principal not found");
                if (r.adjudicationRef() == null || r.adjudicationRef().isBlank()) {
                    throw new IdentityException(ErrorCode.DENIED, "explicit adjudication reference required for merge/supersession");
                }
                reason = reason + "|MERGED_INTO:" + replacement + "|ADJUDICATION:" + requireBounded("adjudicationRef", r.adjudicationRef(), 512);
            }
            long next = current.currentRevision() + 1;
            Instant now = appliedAt;
            Principal updated = new Principal(current.principalId(), current.kind(), target, current.createdAt(), next,
                    current.authorityRefs(), mergeRefs(current.evidenceRefs(), r.evidenceRefs()));
            PrincipalRevision prior = histories.get(current.principalId()).get(histories.get(current.principalId()).size() - 1);
            PrincipalRevision revision = new PrincipalRevision(current.principalId(), next, prior.displayMetadata(), target,
                    current.currentRevision(), now, reason, r.evidenceRefs());
            principals.put(current.principalId(), updated);
            histories.get(current.principalId()).add(revision);
            return updated;
        }

        private Principal requireCurrent(String id, long expected) {
            Principal p = principals.get(requireId("principalId", id));
            if (p == null) throw new IdentityException(ErrorCode.NOT_FOUND, "principal not found");
            if (p.currentRevision() != expected) throw new IdentityException(ErrorCode.STALE_BASE, "principal revision changed");
            return p;
        }

        private static List<String> mergeRefs(List<String> a, List<String> b) {
            List<String> out = new ArrayList<>(a);
            for (String x : immutableRefs(b)) if (!out.contains(x)) out.add(x);
            return List.copyOf(out);
        }

        private static boolean transitionAllowed(PrincipalStatus from, PrincipalStatus to) {
            if (from == to || from == PrincipalStatus.RETIRED) return false;
            return switch (from) {
                case CANDIDATE -> to == PrincipalStatus.ENROLLED || to == PrincipalStatus.QUARANTINED || to == PrincipalStatus.RETIRED;
                case ENROLLED -> to == PrincipalStatus.ACTIVE || to == PrincipalStatus.SUSPENDED || to == PrincipalStatus.DISABLED || to == PrincipalStatus.QUARANTINED || to == PrincipalStatus.RETIRED;
                case ACTIVE -> to == PrincipalStatus.SUSPENDED || to == PrincipalStatus.DISABLED || to == PrincipalStatus.QUARANTINED || to == PrincipalStatus.RETIRED;
                case SUSPENDED -> to == PrincipalStatus.ACTIVE || to == PrincipalStatus.DISABLED || to == PrincipalStatus.QUARANTINED || to == PrincipalStatus.RETIRED;
                case DISABLED -> to == PrincipalStatus.ACTIVE || to == PrincipalStatus.QUARANTINED || to == PrincipalStatus.RETIRED;
                case QUARANTINED -> to == PrincipalStatus.SUSPENDED || to == PrincipalStatus.DISABLED || to == PrincipalStatus.ACTIVE || to == PrincipalStatus.RETIRED;
                case RETIRED -> false;
            };
        }
    }

    private static byte[] encode(Command command) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            if (command instanceof Register c) {
                out.writeByte(1); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.principalId());
                writeString(out, c.request.kind().value()); writeString(out, c.request.initialStatus().name());
                writeMap(out, c.request.displayMetadata()); writeList(out, c.request.authorityRefs()); writeList(out, c.request.evidenceRefs());
            } else if (command instanceof Revise c) {
                out.writeByte(2); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.principalId());
                out.writeLong(c.request.expectedRevision()); writeMap(out, c.request.displayMetadata()); writeString(out, c.request.reason()); writeList(out, c.request.evidenceRefs());
            } else if (command instanceof Alias c) {
                out.writeByte(3); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.aliasId()); writeString(out, c.request.principalId());
                out.writeLong(c.request.expectedPrincipalRevision()); writeString(out, c.request.aliasType()); writeString(out, c.request.valueDigestOrRef());
                writeString(out, c.request.issuerOrNamespace()); writeInstant(out, c.request.validFrom()); writeNullableInstant(out, c.request.validTo());
            } else if (command instanceof Standing c) {
                out.writeByte(4); writeInstant(out, c.appliedAt); writeContext(out, c.request.context()); writeString(out, c.request.principalId()); out.writeLong(c.request.expectedRevision());
                writeString(out, c.request.newStatus().name()); writeString(out, c.request.reason()); writeNullableString(out, c.request.supersededByPrincipalId());
                writeNullableString(out, c.request.adjudicationRef()); writeList(out, c.request.evidenceRefs());
            } else throw new IOException("unsupported command");
        }
        return bytes.toByteArray();
    }

    private static Command decode(byte[] payload) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(payload))) {
            int type = in.readUnsignedByte();
            Instant appliedAt = readInstant(in);
            MutationContext ctx = readContext(in);
            Command out = switch (type) {
                case 1 -> new Register(new RegisterPrincipalRequest(ctx, readString(in), new PrincipalKind(readString(in)),
                        PrincipalStatus.valueOf(readString(in)), readMap(in), readList(in), readList(in)), appliedAt);
                case 2 -> new Revise(new RevisePrincipalRequest(ctx, readString(in), in.readLong(), readMap(in), readString(in), readList(in)), appliedAt);
                case 3 -> new Alias(new RegisterPrincipalAliasRequest(ctx, readString(in), readString(in), in.readLong(), readString(in), readString(in), readString(in), readInstant(in), readNullableInstant(in)), appliedAt);
                case 4 -> new Standing(new ChangePrincipalStandingRequest(ctx, readString(in), in.readLong(), PrincipalStatus.valueOf(readString(in)), readString(in), readNullableString(in), readNullableString(in), readList(in)), appliedAt);
                default -> throw new IOException("unsupported command type");
            };
            if (in.read() != -1) throw new IOException("trailing command bytes");
            return out;
        } catch (EOFException | IllegalArgumentException e) {
            throw new IOException("invalid command payload", e);
        }
    }

    private static void writeContext(DataOutputStream out, MutationContext ctx) throws IOException { writeString(out, ctx.commandId()); writeString(out, ctx.actorPrincipalRef()); writeList(out, ctx.authorityEvidenceRefs()); }
    private static MutationContext readContext(DataInputStream in) throws IOException { return new MutationContext(readString(in), readString(in), readList(in)); }
    private static void writeString(DataOutputStream out, String v) throws IOException { byte[] b = Objects.requireNonNull(v).getBytes(StandardCharsets.UTF_8); if (b.length > 65535) throw new IOException("string too large"); out.writeInt(b.length); out.write(b); }
    private static String readString(DataInputStream in) throws IOException { int n=in.readInt(); if(n<0||n>65535) throw new IOException("string length invalid"); return new String(in.readNBytes(n), StandardCharsets.UTF_8); }
    private static void writeNullableString(DataOutputStream out, String v) throws IOException { out.writeBoolean(v!=null); if(v!=null) writeString(out,v); }
    private static String readNullableString(DataInputStream in) throws IOException { return in.readBoolean()?readString(in):null; }
    private static void writeInstant(DataOutputStream out, Instant v) throws IOException { writeString(out, Objects.requireNonNull(v).toString()); }
    private static Instant readInstant(DataInputStream in) throws IOException { return Instant.parse(readString(in)); }
    private static void writeNullableInstant(DataOutputStream out, Instant v) throws IOException { out.writeBoolean(v!=null); if(v!=null)writeInstant(out,v); }
    private static Instant readNullableInstant(DataInputStream in) throws IOException { return in.readBoolean()?readInstant(in):null; }
    private static void writeList(DataOutputStream out, List<String> values) throws IOException { List<String> v=values==null?List.of():values; if(v.size()>1024)throw new IOException("list too large"); out.writeInt(v.size()); for(String s:v)writeString(out,s); }
    private static List<String> readList(DataInputStream in) throws IOException { int n=in.readInt(); if(n<0||n>1024)throw new IOException("list length invalid"); List<String> v=new ArrayList<>(n); for(int i=0;i<n;i++)v.add(readString(in)); return List.copyOf(v); }
    private static void writeMap(DataOutputStream out, Map<String,String> values) throws IOException { Map<String,String> v=values==null?Map.of():values; if(v.size()>256)throw new IOException("map too large"); List<Map.Entry<String,String>> e=new ArrayList<>(v.entrySet()); e.sort(Map.Entry.comparingByKey()); out.writeInt(e.size()); for(var x:e){writeString(out,x.getKey());writeString(out,x.getValue());} }
    private static Map<String,String> readMap(DataInputStream in) throws IOException { int n=in.readInt(); if(n<0||n>256)throw new IOException("map length invalid"); Map<String,String> m=new LinkedHashMap<>(); for(int i=0;i<n;i++)m.put(readString(in),readString(in)); return Map.copyOf(m); }
}
