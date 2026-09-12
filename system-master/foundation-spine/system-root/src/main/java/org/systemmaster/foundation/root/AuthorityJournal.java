package org.systemmaster.foundation.root;

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
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Durable append-only journal for AuthorityRegistry.
 *
 * Each mutation is protected by an OS file lock, optimistic expected revision,
 * an idempotent command identity in the registry, and a SHA-256 frame digest.
 * A partial/truncated/corrupt frame fails closed during replay.
 */
public final class AuthorityJournal {
    private static final String HEADER = "SYSTEM_MASTER_AUTHORITY_JOURNAL_V1\n";
    private static final byte[] HEADER_BYTES = HEADER.getBytes(StandardCharsets.US_ASCII);
    private static final long MAX_JOURNAL_BYTES = 256L * 1024L * 1024L;
    private static final ConcurrentHashMap<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path path;
    private final Object jvmLock;

    public AuthorityJournal(Path path) {
        this.path = path.toAbsolutePath().normalize();
        this.jvmLock = JVM_LOCKS.computeIfAbsent(this.path, ignored -> new Object());
    }

    public Path path() {
        return path;
    }

    public AuthorityRegistry.Snapshot load() throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                if (channel.size() == 0) return new AuthorityRegistry().snapshot();
                return replay(channel).snapshot();
            }
        }
    }

    public AuthorityRegistry.ApplyResult transact(AuthorityRegistry.Command command) throws IOException {
        synchronized (jvmLock) {
            ensureParent();
            try (FileChannel channel = FileChannel.open(path,
                    StandardOpenOption.CREATE, StandardOpenOption.READ, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                if (channel.size() == 0) {
                    writeFully(channel, ByteBuffer.wrap(HEADER_BYTES), 0);
                    channel.force(true);
                }
                AuthorityRegistry registry = replay(channel);
                AuthorityRegistry.ApplyResult result = registry.apply(command);
                if (!result.changed()) return result;

                String encoded = Base64.getEncoder().encodeToString(encode(command));
                String material = result.appliedRevision() + "|" + encoded;
                String line = material + "|" + sha256(material.getBytes(StandardCharsets.US_ASCII)) + "\n";
                byte[] bytes = line.getBytes(StandardCharsets.US_ASCII);
                long offset = channel.size();
                writeFully(channel, ByteBuffer.wrap(bytes), offset);
                channel.force(true);
                return result;
            }
        }
    }

    public long sizeBytes() throws IOException {
        return Files.exists(path) ? Files.size(path) : 0L;
    }

    private AuthorityRegistry replay(FileChannel channel) throws IOException {
        byte[] bytes = readAll(channel);
        if (bytes.length < HEADER_BYTES.length) throw new IllegalStateException("JOURNAL_TRUNCATED_HEADER");
        String text = new String(bytes, StandardCharsets.US_ASCII);
        if (!text.startsWith(HEADER)) throw new IllegalStateException("JOURNAL_HEADER_INVALID");
        if (!text.endsWith("\n")) throw new IllegalStateException("JOURNAL_TRUNCATED_FRAME");

        AuthorityRegistry registry = new AuthorityRegistry();
        String body = text.substring(HEADER.length());
        if (body.isEmpty()) return registry;
        String[] lines = body.split("\n", -1);
        long expectedRevision = 1L;
        for (int i = 0; i < lines.length - 1; i++) {
            String line = lines[i];
            if (line.isEmpty()) throw new IllegalStateException("JOURNAL_EMPTY_FRAME:" + (i + 1));
            String[] parts = line.split("\\|", -1);
            if (parts.length != 3) throw new IllegalStateException("JOURNAL_FRAME_SHAPE_INVALID:" + (i + 1));
            long revision;
            try {
                revision = Long.parseLong(parts[0]);
            } catch (NumberFormatException e) {
                throw new IllegalStateException("JOURNAL_REVISION_INVALID:" + (i + 1), e);
            }
            if (revision != expectedRevision) {
                throw new IllegalStateException("JOURNAL_REVISION_SEQUENCE_INVALID:expected="
                        + expectedRevision + ":actual=" + revision);
            }
            String material = parts[0] + "|" + parts[1];
            String expectedDigest = sha256(material.getBytes(StandardCharsets.US_ASCII));
            if (!constantTimeEquals(expectedDigest, parts[2])) {
                throw new IllegalStateException("JOURNAL_DIGEST_MISMATCH:revision=" + revision);
            }
            byte[] payload;
            try {
                payload = Base64.getDecoder().decode(parts[1]);
            } catch (IllegalArgumentException e) {
                throw new IllegalStateException("JOURNAL_PAYLOAD_BASE64_INVALID:revision=" + revision, e);
            }
            AuthorityRegistry.Command command = decode(payload);
            registry.replay(command, revision);
            expectedRevision++;
        }
        registry.validateState();
        return registry;
    }

    private byte[] readAll(FileChannel channel) throws IOException {
        long size = channel.size();
        if (size > MAX_JOURNAL_BYTES) throw new IllegalStateException("JOURNAL_TOO_LARGE:" + size);
        if (size > Integer.MAX_VALUE) throw new IllegalStateException("JOURNAL_SIZE_UNSUPPORTED:" + size);
        ByteBuffer buffer = ByteBuffer.allocate((int) size);
        long position = 0;
        while (buffer.hasRemaining()) {
            int read = channel.read(buffer, position);
            if (read < 0) break;
            if (read == 0) continue;
            position += read;
        }
        if (buffer.position() != size) throw new IllegalStateException("JOURNAL_SHORT_READ");
        return buffer.array();
    }

    private static void writeFully(FileChannel channel, ByteBuffer buffer, long start) throws IOException {
        long position = start;
        while (buffer.hasRemaining()) {
            int wrote = channel.write(buffer, position);
            if (wrote <= 0) throw new IOException("journal write made no progress");
            position += wrote;
        }
    }

    private void ensureParent() throws IOException {
        Path parent = path.getParent();
        if (parent != null) Files.createDirectories(parent);
    }

    static byte[] encode(AuthorityRegistry.Command command) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream out = new DataOutputStream(bytes)) {
                if (command instanceof AuthorityRegistry.AdmitAuthority c) {
                    out.writeUTF("ADMIT");
                    writeCommon(out, c);
                    out.writeUTF(c.authorityId());
                    out.writeUTF(c.canonicalName());
                    out.writeUTF(c.kind().name());
                    out.writeUTF(c.ownerPath());
                    writeNullable(out, c.parentAuthorityId());
                    writeSet(out, c.aliases());
                    writeMap(out, c.initialPointers());
                    out.writeUTF(c.admissionAuthorityRef());
                } else if (command instanceof AuthorityRegistry.AdvancePointer c) {
                    out.writeUTF("POINTER");
                    writeCommon(out, c);
                    out.writeUTF(c.authorityId());
                    out.writeUTF(c.pointerName());
                    out.writeUTF(c.pointerValue());
                } else if (command instanceof AuthorityRegistry.AddAlias c) {
                    out.writeUTF("ALIAS");
                    writeCommon(out, c);
                    out.writeUTF(c.authorityId());
                    out.writeUTF(c.alias());
                } else if (command instanceof AuthorityRegistry.RetireAuthority c) {
                    out.writeUTF("RETIRE");
                    writeCommon(out, c);
                    out.writeUTF(c.authorityId());
                    out.writeUTF(c.retirementAuthorityRef());
                } else {
                    throw new IllegalArgumentException("unsupported command: " + command.getClass());
                }
            }
            return bytes.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException("unexpected memory encoding failure", e);
        }
    }

    static AuthorityRegistry.Command decode(byte[] bytes) {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes))) {
            String type = in.readUTF();
            String commandId = in.readUTF();
            long expectedRevision = in.readLong();
            AuthorityRegistry.Command result = switch (type) {
                case "ADMIT" -> new AuthorityRegistry.AdmitAuthority(
                        commandId, expectedRevision, in.readUTF(), in.readUTF(),
                        AuthorityRegistry.AuthorityKind.valueOf(in.readUTF()), in.readUTF(), readNullable(in),
                        readSet(in), readMap(in), in.readUTF());
                case "POINTER" -> new AuthorityRegistry.AdvancePointer(
                        commandId, expectedRevision, in.readUTF(), in.readUTF(), in.readUTF());
                case "ALIAS" -> new AuthorityRegistry.AddAlias(
                        commandId, expectedRevision, in.readUTF(), in.readUTF());
                case "RETIRE" -> new AuthorityRegistry.RetireAuthority(
                        commandId, expectedRevision, in.readUTF(), in.readUTF());
                default -> throw new IllegalStateException("JOURNAL_COMMAND_TYPE_UNKNOWN:" + type);
            };
            if (in.available() != 0) throw new IllegalStateException("JOURNAL_COMMAND_TRAILING_BYTES:" + type);
            return result;
        } catch (EOFException e) {
            throw new IllegalStateException("JOURNAL_COMMAND_TRUNCATED", e);
        } catch (IOException | IllegalArgumentException e) {
            throw new IllegalStateException("JOURNAL_COMMAND_INVALID", e);
        }
    }

    private static void writeCommon(DataOutputStream out, AuthorityRegistry.Command command) throws IOException {
        out.writeUTF(command.commandId());
        out.writeLong(command.expectedRevision());
    }

    private static void writeNullable(DataOutputStream out, String value) throws IOException {
        out.writeBoolean(value != null);
        if (value != null) out.writeUTF(value);
    }

    private static String readNullable(DataInputStream in) throws IOException {
        return in.readBoolean() ? in.readUTF() : null;
    }

    private static void writeSet(DataOutputStream out, Set<String> values) throws IOException {
        List<String> sorted = values.stream().sorted().toList();
        out.writeInt(sorted.size());
        for (String value : sorted) out.writeUTF(value);
    }

    private static Set<String> readSet(DataInputStream in) throws IOException {
        int size = checkedCount(in.readInt(), "set");
        List<String> values = new ArrayList<>(size);
        for (int i = 0; i < size; i++) values.add(in.readUTF());
        return Set.copyOf(values);
    }

    private static void writeMap(DataOutputStream out, Map<String, String> values) throws IOException {
        List<Map.Entry<String, String>> sorted = values.entrySet().stream()
                .sorted(Map.Entry.comparingByKey()).toList();
        out.writeInt(sorted.size());
        for (Map.Entry<String, String> entry : sorted) {
            out.writeUTF(entry.getKey());
            out.writeUTF(entry.getValue());
        }
    }

    private static Map<String, String> readMap(DataInputStream in) throws IOException {
        int size = checkedCount(in.readInt(), "map");
        java.util.LinkedHashMap<String, String> values = new java.util.LinkedHashMap<>();
        for (int i = 0; i < size; i++) {
            String key = in.readUTF();
            String value = in.readUTF();
            if (values.putIfAbsent(key, value) != null) throw new IllegalStateException("JOURNAL_MAP_DUPLICATE_KEY:" + key);
        }
        return Map.copyOf(values);
    }

    private static int checkedCount(int value, String kind) {
        if (value < 0 || value > 100_000) throw new IllegalStateException("JOURNAL_" + kind.toUpperCase() + "_COUNT_INVALID:" + value);
        return value;
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder out = new StringBuilder(digest.length * 2);
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static boolean constantTimeEquals(String expected, String actual) {
        byte[] a = expected.getBytes(StandardCharsets.US_ASCII);
        byte[] b = actual.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(a, b);
    }
}
