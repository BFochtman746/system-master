package org.systemmaster.core;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.Channels;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** PLATFORM-008 production admission surface over content-addressed bytes. */
public final class GovernedArtifactGateway {
    private final Path contentRoot;
    private final Path quarantineRoot;
    private final ArtifactIntakePolicy policy;
    private final Platform008Repository repository;
    private final Clock clock;
    private final ArtifactMediaDetector mediaDetector = new ArtifactMediaDetector();
    private final PackageSafetyInspector packageInspector = new PackageSafetyInspector();

    public GovernedArtifactGateway(Path root, ArtifactIntakePolicy policy, Platform008Repository repository, Clock clock) throws IOException {
        Path normalized = Objects.requireNonNull(root).toAbsolutePath().normalize();
        this.contentRoot = normalized.resolve("content");
        this.quarantineRoot = normalized.resolve("quarantine");
        this.policy = Objects.requireNonNull(policy);
        this.repository = Objects.requireNonNull(repository);
        this.clock = Objects.requireNonNull(clock);
        Files.createDirectories(contentRoot);
        Files.createDirectories(quarantineRoot);
    }

    public ArtifactIntakeReceipt ingest(ArtifactIntakeRequest request, InputStream input) throws Exception {
        Objects.requireNonNull(request); Objects.requireNonNull(input);
        if (!policy.allowedDeclaredMediaTypes().isEmpty() && !policy.allowedDeclaredMediaTypes().contains(request.declaredMediaType())) {
            throw new SecurityException("declared media type not admitted");
        }
        Path tmp = Files.createTempFile(contentRoot.getParent(), ".platform008-", ".incoming");
        MessageDigest md = sha256(); long size = 0L;
        try {
            try (FileChannel channel = FileChannel.open(tmp, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING);
                 OutputStream out = Channels.newOutputStream(channel)) {
                byte[] buffer = new byte[64 * 1024]; int n;
                while ((n = input.read(buffer)) != -1) {
                    size = Math.addExact(size, n);
                    if (size > policy.maxBytes()) throw new IOException("PLATFORM008_BOUNDED_TRANSFER_LIMIT");
                    md.update(buffer, 0, n); out.write(buffer, 0, n);
                }
                out.flush(); channel.force(true);
            }
            String digest = HexFormat.of().formatHex(md.digest());
            String detected = mediaDetector.detect(tmp);
            String failure = admissionFailure(request, tmp, digest, size, detected);
            boolean verified = failure == null;
            Path destination = (verified ? contentRoot : quarantineRoot).resolve(digest).normalize();
            assertChild(destination, verified ? contentRoot : quarantineRoot);
            moveDeduplicated(tmp, destination, digest, size);
            ArtifactIntakeReceipt receipt = new ArtifactIntakeReceipt(
                    request.intakeId(), request.artifactId(), digest, "sha256:" + digest, size,
                    request.declaredMediaType(), detected, verified ? "VERIFIED" : "QUARANTINED",
                    verified ? "ADMISSION_PASS" : failure, request.producerRef(), request.parentArtifactRefs(), request.sourceRefs(), Instant.now(clock));
            repository.recordReceipt(receipt);
            return receipt;
        } catch (Exception e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
    }

    public long maxBytes() { return policy.maxBytes(); }

    public byte[] readVerified(String digest, long maxBytes) throws IOException {
        if (digest == null || !digest.matches("[0-9a-f]{64}")) throw new IllegalArgumentException("digest");
        long limit = Math.min(policy.maxBytes(), maxBytes);
        if (limit < 1) throw new IllegalArgumentException("maxBytes");
        try { if (!repository.hasVerifiedDigest(digest)) throw new IOException("artifact lacks durable VERIFIED receipt"); }
        catch (IOException e) { throw e; } catch (Exception e) { throw new IOException("artifact receipt lookup failed", e); }
        Path p = contentRoot.resolve(digest).normalize(); assertChild(p, contentRoot);
        long size = Files.size(p); if (size > limit) throw new IOException("artifact exceeds read limit");
        byte[] bytes = Files.readAllBytes(p);
        if (!HexFormat.of().formatHex(sha256().digest(bytes)).equals(digest)) throw new IOException("artifact digest mismatch");
        return bytes;
    }

    private String admissionFailure(ArtifactIntakeRequest request, Path tmp, String digest, long size, String detected) throws IOException {
        if (request.expectedSizeBytes() != null && request.expectedSizeBytes() != size) return "EXPECTED_SIZE_MISMATCH";
        if (request.expectedSha256() != null && !request.expectedSha256().equals(digest)) return "EXPECTED_DIGEST_MISMATCH";
        if (isExecutable(detected)) return "EXECUTABLE_CONTENT_BLOCKED";
        if (!mediaCompatible(request.declaredMediaType(), detected)) return "MEDIA_TYPE_MISMATCH";
        if ("application/zip".equals(detected)) {
            PackageSafetyInspector.Result result = packageInspector.inspectZip(tmp, policy);
            if (!result.safe()) return result.reason();
        }
        return null;
    }

    static boolean mediaCompatible(String declared, String detected) {
        if (declared == null || detected == null) return false;
        String d = declared.toLowerCase(java.util.Locale.ROOT).split(";", 2)[0].trim();
        String a = detected.toLowerCase(java.util.Locale.ROOT).trim();
        if (d.equals(a)) return true;
        if ((d.equals("text/markdown") || d.equals("text/x-markdown")) && a.equals("text/plain")) return true;
        if (d.equals("application/rtf") && a.equals("text/rtf")) return true;
        return false;
    }

    private static boolean isExecutable(String detected) { return "application/vnd.microsoft.portable-executable".equals(detected) || "application/x-elf".equals(detected); }

    private static void moveDeduplicated(Path tmp, Path destination, String digest, long size) throws IOException {
        if (Files.exists(destination)) { verify(destination, digest, size); Files.deleteIfExists(tmp); return; }
        try { Files.move(tmp, destination, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException e) { Files.move(tmp, destination); }
        catch (java.nio.file.FileAlreadyExistsException e) { verify(destination, digest, size); Files.deleteIfExists(tmp); }
        verify(destination, digest, size);
    }

    private static void verify(Path p, String digest, long size) throws IOException {
        if (Files.size(p) != size) throw new IOException("content-address collision size mismatch");
        MessageDigest md = sha256(); try (InputStream in = Files.newInputStream(p)) { byte[] b = new byte[64*1024]; int n; while ((n=in.read(b))!=-1) md.update(b,0,n); }
        if (!HexFormat.of().formatHex(md.digest()).equals(digest)) throw new IOException("content-address collision digest mismatch");
    }
    private static void assertChild(Path p, Path root) throws IOException { if (!p.getParent().equals(root)) throw new IOException("path escape"); }
    private static MessageDigest sha256() { try { return MessageDigest.getInstance("SHA-256"); } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); } }
}
