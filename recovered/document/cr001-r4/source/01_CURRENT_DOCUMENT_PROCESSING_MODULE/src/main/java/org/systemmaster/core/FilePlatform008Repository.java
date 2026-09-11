package org.systemmaster.core;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;

/**
 * File-backed PLATFORM-008 metadata repository used by durable document jobs.
 * Content bytes remain owned by {@link GovernedArtifactGateway}; this repository persists
 * the receipts required to prove that a content-addressed object is admissible after restart.
 */
public final class FilePlatform008Repository implements Platform008Repository {
    private final Path receiptRoot;
    private final Path transferRoot;

    public FilePlatform008Repository(Path root) throws IOException {
        Path normalized = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
        this.receiptRoot = normalized.resolve("receipts");
        this.transferRoot = normalized.resolve("transfers");
        Files.createDirectories(receiptRoot);
        Files.createDirectories(transferRoot);
    }

    @Override
    public synchronized void recordReceipt(ArtifactIntakeReceipt receipt) throws IOException {
        Objects.requireNonNull(receipt, "receipt");
        Path destination = receiptPath(receipt.intakeId());
        if (Files.exists(destination)) {
            ArtifactIntakeReceipt existing = readReceipt(destination);
            if (sameReceiptIdentity(existing, receipt)) {
                return;
            }
            throw new IllegalStateException("duplicate intakeId with different receipt: " + receipt.intakeId());
        }
        Properties properties = new Properties();
        properties.setProperty("intakeId", encode(receipt.intakeId()));
        properties.setProperty("artifactId", encode(receipt.artifactId()));
        properties.setProperty("digest", receipt.digest());
        properties.setProperty("logicalRef", receipt.logicalRef());
        properties.setProperty("sizeBytes", Long.toString(receipt.sizeBytes()));
        properties.setProperty("declaredMediaType", receipt.declaredMediaType());
        properties.setProperty("detectedMediaType", receipt.detectedMediaType());
        properties.setProperty("disposition", receipt.disposition());
        properties.setProperty("reason", encode(receipt.reason()));
        properties.setProperty("producerRef", encode(receipt.producerRef()));
        writeList(properties, "parent", receipt.parentArtifactRefs());
        writeList(properties, "source", receipt.sourceRefs());
        properties.setProperty("completedAt", receipt.completedAt().toString());
        writeNewProperties(destination, properties);
    }

    @Override
    public synchronized void createTransfer(ArtifactTransferSession session) throws IOException {
        Objects.requireNonNull(session, "session");
        Path destination = transferPath(session.transferId());
        if (Files.exists(destination)) {
            throw new IllegalStateException("duplicate transferId: " + session.transferId());
        }
        writeNewProperties(destination, transferProperties(session));
    }

    @Override
    public synchronized void updateTransfer(ArtifactTransferSession session) throws IOException {
        Objects.requireNonNull(session, "session");
        Path destination = transferPath(session.transferId());
        if (!Files.isRegularFile(destination)) {
            throw new IllegalStateException("unknown transfer: " + session.transferId());
        }
        ArtifactTransferSession prior = readTransfer(destination);
        if (session.receivedBytes() < prior.receivedBytes()) {
            throw new IllegalStateException("transfer offset regression");
        }
        replaceProperties(destination, transferProperties(session));
    }

    @Override
    public synchronized Optional<ArtifactTransferSession> transfer(String transferId) throws IOException {
        Path path = transferPath(transferId);
        return Files.isRegularFile(path) ? Optional.of(readTransfer(path)) : Optional.empty();
    }

    @Override
    public synchronized boolean hasVerifiedDigest(String digest) throws IOException {
        requireSha(digest);
        try (var paths = Files.list(receiptRoot)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                ArtifactIntakeReceipt receipt = readReceipt(path);
                if (digest.equals(receipt.digest()) && "VERIFIED".equals(receipt.disposition())) {
                    return true;
                }
            }
        }
        return false;
    }

    public synchronized Optional<ArtifactIntakeReceipt> receipt(String intakeId) throws IOException {
        Path path = receiptPath(intakeId);
        return Files.isRegularFile(path) ? Optional.of(readReceipt(path)) : Optional.empty();
    }

    private Path receiptPath(String intakeId) {
        return receiptRoot.resolve(key(intakeId) + ".properties");
    }

    private Path transferPath(String transferId) {
        return transferRoot.resolve(key(transferId) + ".properties");
    }

    private static boolean sameReceiptIdentity(ArtifactIntakeReceipt left, ArtifactIntakeReceipt right) {
        return left.intakeId().equals(right.intakeId())
                && left.artifactId().equals(right.artifactId())
                && left.digest().equals(right.digest())
                && left.logicalRef().equals(right.logicalRef())
                && left.sizeBytes() == right.sizeBytes()
                && left.declaredMediaType().equals(right.declaredMediaType())
                && left.detectedMediaType().equals(right.detectedMediaType())
                && left.disposition().equals(right.disposition())
                && left.reason().equals(right.reason())
                && left.producerRef().equals(right.producerRef())
                && left.parentArtifactRefs().equals(right.parentArtifactRefs())
                && left.sourceRefs().equals(right.sourceRefs());
    }

    private static String key(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("id required");
        }
        return sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private static ArtifactIntakeReceipt readReceipt(Path path) throws IOException {
        Properties p = readProperties(path);
        return new ArtifactIntakeReceipt(
                decode(p.getProperty("intakeId")),
                decode(p.getProperty("artifactId")),
                required(p, "digest"),
                required(p, "logicalRef"),
                Long.parseLong(required(p, "sizeBytes")),
                required(p, "declaredMediaType"),
                required(p, "detectedMediaType"),
                required(p, "disposition"),
                decode(p.getProperty("reason")),
                decode(p.getProperty("producerRef")),
                readList(p, "parent"),
                readList(p, "source"),
                Instant.parse(required(p, "completedAt")));
    }

    private static Properties transferProperties(ArtifactTransferSession session) {
        Properties p = new Properties();
        p.setProperty("transferId", encode(session.transferId()));
        p.setProperty("artifactId", encode(session.artifactId()));
        p.setProperty("producerRef", encode(session.producerRef()));
        p.setProperty("declaredMediaType", session.declaredMediaType());
        p.setProperty("expectedSizeBytes", Long.toString(session.expectedSizeBytes()));
        p.setProperty("expectedSha256", Objects.requireNonNullElse(session.expectedSha256(), ""));
        p.setProperty("receivedBytes", Long.toString(session.receivedBytes()));
        p.setProperty("state", session.state());
        p.setProperty("createdAt", session.createdAt().toString());
        p.setProperty("updatedAt", session.updatedAt().toString());
        return p;
    }

    private static ArtifactTransferSession readTransfer(Path path) throws IOException {
        Properties p = readProperties(path);
        String expectedSha = required(p, "expectedSha256");
        return new ArtifactTransferSession(
                decode(p.getProperty("transferId")),
                decode(p.getProperty("artifactId")),
                decode(p.getProperty("producerRef")),
                required(p, "declaredMediaType"),
                Long.parseLong(required(p, "expectedSizeBytes")),
                expectedSha.isEmpty() ? null : expectedSha,
                Long.parseLong(required(p, "receivedBytes")),
                required(p, "state"),
                Instant.parse(required(p, "createdAt")),
                Instant.parse(required(p, "updatedAt")));
    }

    private static void writeList(Properties properties, String prefix, List<String> values) {
        properties.setProperty(prefix + ".count", Integer.toString(values.size()));
        for (int i = 0; i < values.size(); i++) {
            properties.setProperty(prefix + "." + i, encode(values.get(i)));
        }
    }

    private static List<String> readList(Properties properties, String prefix) {
        int count = Integer.parseInt(required(properties, prefix + ".count"));
        ArrayList<String> values = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            values.add(decode(required(properties, prefix + "." + i)));
        }
        return List.copyOf(values);
    }

    private static String encode(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                Objects.requireNonNullElse(value, "").getBytes(StandardCharsets.UTF_8));
    }

    private static String decode(String value) {
        if (value == null) {
            throw new IllegalArgumentException("encoded value required");
        }
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static Properties readProperties(Path path) throws IOException {
        Properties p = new Properties();
        try (InputStream in = Files.newInputStream(path)) {
            p.load(in);
        }
        return p;
    }

    private static void writeNewProperties(Path destination, Properties properties) throws IOException {
        Path tmp = Files.createTempFile(destination.getParent(), ".platform008-repo-", ".tmp");
        try {
            try (OutputStream out = Files.newOutputStream(tmp)) {
                properties.store(out, "SYSTEM_MASTER_PLATFORM_008");
            }
            try {
                Files.move(tmp, destination, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(tmp, destination);
            }
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(tmp);
            throw exception;
        }
    }

    private static void replaceProperties(Path destination, Properties properties) throws IOException {
        Path tmp = Files.createTempFile(destination.getParent(), ".platform008-repo-", ".tmp");
        try {
            try (OutputStream out = Files.newOutputStream(tmp)) {
                properties.store(out, "SYSTEM_MASTER_PLATFORM_008");
            }
            try {
                Files.move(tmp, destination, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(tmp, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(tmp);
            throw exception;
        }
    }

    private static String required(Properties p, String key) {
        String value = p.getProperty(key);
        if (value == null) {
            throw new IllegalArgumentException("missing repository property: " + key);
        }
        return value;
    }

    private static String sha256(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void requireSha(String value) {
        if (value == null || !value.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("sha256 required");
        }
    }
}
