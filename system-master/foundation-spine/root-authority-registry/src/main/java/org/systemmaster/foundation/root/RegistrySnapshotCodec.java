package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

final class RegistrySnapshotCodec {
    static final byte[] MAGIC = "SMROOT01".getBytes(StandardCharsets.US_ASCII);
    static final int FORMAT_VERSION = 1;
    static final int DIGEST_BYTES = 32;

    private RegistrySnapshotCodec() {}

    static byte[] encode(RegistrySnapshot snapshot) throws IOException {
        byte[] payload = encodePayload(snapshot);
        byte[] digest = sha256(payload);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(payload.length + 64);
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.write(MAGIC);
            out.writeInt(FORMAT_VERSION);
            out.writeInt(payload.length);
            out.write(payload);
            out.write(digest);
        }
        return bytes.toByteArray();
    }

    static RegistrySnapshot decode(byte[] bytes) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(bytes))) {
            byte[] magic = in.readNBytes(MAGIC.length);
            if (!MessageDigest.isEqual(magic, MAGIC)) throw new IOException("ROOT_REGISTRY_BAD_MAGIC");
            int version = in.readInt();
            if (version != FORMAT_VERSION) throw new IOException("ROOT_REGISTRY_UNSUPPORTED_FORMAT:" + version);
            int payloadLength = in.readInt();
            if (payloadLength < 1 || payloadLength > 128 * 1024 * 1024) throw new IOException("ROOT_REGISTRY_INVALID_PAYLOAD_LENGTH:" + payloadLength);
            byte[] payload = in.readNBytes(payloadLength);
            if (payload.length != payloadLength) throw new EOFException("ROOT_REGISTRY_TRUNCATED_PAYLOAD");
            byte[] expectedDigest = in.readNBytes(DIGEST_BYTES);
            if (expectedDigest.length != DIGEST_BYTES) throw new EOFException("ROOT_REGISTRY_MISSING_DIGEST");
            if (in.read() != -1) throw new IOException("ROOT_REGISTRY_TRAILING_BYTES");
            byte[] actualDigest = sha256(payload);
            if (!MessageDigest.isEqual(expectedDigest, actualDigest)) throw new IOException("ROOT_REGISTRY_DIGEST_MISMATCH");
            return decodePayload(payload);
        }
    }

    static String digestHex(RegistrySnapshot snapshot) {
        try {
            byte[] payload = encodePayload(snapshot);
            return hex(sha256(payload));
        } catch (IOException e) {
            throw new IllegalStateException("snapshot encoding failed", e);
        }
    }

    private static byte[] encodePayload(RegistrySnapshot snapshot) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream out = new DataOutputStream(bytes)) {
            out.writeLong(snapshot.revision());
            writeString(out, snapshot.productRoot().productId());
            writeString(out, snapshot.productRoot().canonicalName());
            writeString(out, snapshot.productRoot().versionPointer());

            Map<String, SystemRecord> systems = new TreeMap<>(snapshot.systems());
            out.writeInt(systems.size());
            for (SystemRecord system : systems.values()) {
                writeString(out, system.systemId());
                writeString(out, system.canonicalName());
                writeString(out, system.classification());
                writeString(out, system.parentId());
                writeString(out, system.ownerPath());
                writeString(out, system.versionPointer());
                writeString(out, system.controlRef());
                writeString(out, system.lifecycle().name());
                out.writeLong(system.admittedRevision());
                writeNullableLong(out, system.retiredRevision());
            }

            Map<String, AuthorityRecord> authorities = new TreeMap<>(snapshot.authorities());
            out.writeInt(authorities.size());
            for (AuthorityRecord authority : authorities.values()) {
                writeString(out, authority.authorityId());
                writeString(out, authority.canonicalName());
                writeString(out, authority.ownerSystemId());
                writeString(out, authority.versionPointer());
                writeString(out, authority.lifecycle().name());
                out.writeLong(authority.admittedRevision());
                writeNullableLong(out, authority.retiredRevision());
            }

            Map<String, IntegrationEdge> edges = new TreeMap<>(snapshot.integrationEdges());
            out.writeInt(edges.size());
            for (IntegrationEdge edge : edges.values()) {
                writeString(out, edge.edgeId());
                writeString(out, edge.producerSystemId());
                writeString(out, edge.consumerSystemId());
                writeString(out, edge.interfaceRef());
                writeString(out, edge.lifecycle().name());
                out.writeLong(edge.admittedRevision());
                writeNullableLong(out, edge.retiredRevision());
            }

            out.writeInt(snapshot.events().size());
            for (ChangeEvent event : snapshot.events()) {
                out.writeLong(event.revision());
                writeString(out, event.commandId());
                writeString(out, event.commandFingerprint());
                writeString(out, event.operation().name());
                writeString(out, event.subjectType().name());
                writeString(out, event.subjectId());
                writeString(out, event.decisionRef());
                writeString(out, event.actorRef());
                writeString(out, event.reason());
                writeString(out, event.occurredAt().toString());
            }
        }
        return bytes.toByteArray();
    }

    private static RegistrySnapshot decodePayload(byte[] payload) throws IOException {
        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(payload))) {
            long revision = in.readLong();
            ProductRoot root = new ProductRoot(readString(in), readString(in), readString(in));

            int systemCount = readCount(in, "systems");
            Map<String, SystemRecord> systems = new LinkedHashMap<>();
            for (int i = 0; i < systemCount; i++) {
                SystemRecord system = new SystemRecord(
                        readString(in), readString(in), readString(in), readString(in), readString(in),
                        readString(in), readString(in), Lifecycle.valueOf(readString(in)), in.readLong(), readNullableLong(in));
                if (systems.putIfAbsent(system.systemId(), system) != null) throw new IOException("DUPLICATE_SYSTEM_ID_IN_SNAPSHOT:" + system.systemId());
            }

            int authorityCount = readCount(in, "authorities");
            Map<String, AuthorityRecord> authorities = new LinkedHashMap<>();
            for (int i = 0; i < authorityCount; i++) {
                AuthorityRecord authority = new AuthorityRecord(
                        readString(in), readString(in), readString(in), readString(in), Lifecycle.valueOf(readString(in)),
                        in.readLong(), readNullableLong(in));
                if (authorities.putIfAbsent(authority.authorityId(), authority) != null) throw new IOException("DUPLICATE_AUTHORITY_ID_IN_SNAPSHOT:" + authority.authorityId());
            }

            int edgeCount = readCount(in, "integrationEdges");
            Map<String, IntegrationEdge> edges = new LinkedHashMap<>();
            for (int i = 0; i < edgeCount; i++) {
                IntegrationEdge edge = new IntegrationEdge(
                        readString(in), readString(in), readString(in), readString(in), Lifecycle.valueOf(readString(in)),
                        in.readLong(), readNullableLong(in));
                if (edges.putIfAbsent(edge.edgeId(), edge) != null) throw new IOException("DUPLICATE_EDGE_ID_IN_SNAPSHOT:" + edge.edgeId());
            }

            int eventCount = readCount(in, "events");
            List<ChangeEvent> events = new ArrayList<>(eventCount);
            for (int i = 0; i < eventCount; i++) {
                events.add(new ChangeEvent(
                        in.readLong(), readString(in), readString(in), Operation.valueOf(readString(in)),
                        SubjectType.valueOf(readString(in)), readString(in), readString(in), readString(in), readString(in),
                        Instant.parse(readString(in))));
            }
            if (in.read() != -1) throw new IOException("ROOT_REGISTRY_PAYLOAD_TRAILING_BYTES");
            try {
                return new RegistrySnapshot(revision, root, systems, authorities, edges, events);
            } catch (RuntimeException e) {
                throw new IOException("ROOT_REGISTRY_INVARIANT_FAILURE:" + e.getMessage(), e);
            }
        }
    }

    private static int readCount(DataInputStream in, String label) throws IOException {
        int count = in.readInt();
        if (count < 0 || count > 1_000_000) throw new IOException("ROOT_REGISTRY_INVALID_COUNT:" + label + ":" + count);
        return count;
    }

    private static void writeString(DataOutputStream out, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > 16 * 1024 * 1024) throw new IOException("ROOT_REGISTRY_STRING_TOO_LARGE");
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static String readString(DataInputStream in) throws IOException {
        int length = in.readInt();
        if (length < 0 || length > 16 * 1024 * 1024) throw new IOException("ROOT_REGISTRY_INVALID_STRING_LENGTH:" + length);
        byte[] bytes = in.readNBytes(length);
        if (bytes.length != length) throw new EOFException("ROOT_REGISTRY_TRUNCATED_STRING");
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static void writeNullableLong(DataOutputStream out, Long value) throws IOException {
        out.writeBoolean(value != null);
        if (value != null) out.writeLong(value);
    }

    private static Long readNullableLong(DataInputStream in) throws IOException {
        return in.readBoolean() ? in.readLong() : null;
    }

    private static byte[] sha256(byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) result.append(String.format("%02x", b));
        return result.toString();
    }
}
