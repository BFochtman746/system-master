package org.systemmaster.tools.document.spine;

import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.FinalDocumentProofPolicy;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Durable append-only version ledger with idempotent deterministic commits. */
public final class FileDocumentSpineVersionStore implements DocumentSpineVersionStore {
    private final Path ledger;

    public FileDocumentSpineVersionStore(Path root) throws IOException {
        Path normalized = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
        Files.createDirectories(normalized);
        this.ledger = normalized.resolve("document-spine-versions.tsv");
    }

    @Override
    public synchronized DocumentSpineVersionReceipt commit(DocumentSpineVersionReceipt receipt) throws IOException {
        Objects.requireNonNull(receipt, "receipt");
        Optional<DocumentSpineVersionReceipt> byId = byVersionId(receipt.versionId());
        if (byId.isPresent()) {
            if (byId.get().equals(receipt)) {
                return byId.get();
            }
            throw new IllegalStateException("version id collision");
        }
        Optional<DocumentSpineVersionReceipt> byJob = byJobId(receipt.jobId());
        if (byJob.isPresent()) {
            if (byJob.get().resultSha256().equals(receipt.resultSha256())
                    && byJob.get().operationIntentDigest().equals(receipt.operationIntentDigest())) {
                return byJob.get();
            }
            throw new IllegalStateException("job already committed a different version");
        }
        String line = encode(receipt) + System.lineSeparator();
        try (FileChannel channel = FileChannel.open(
                ledger,
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE,
                StandardOpenOption.APPEND);
             FileLock lock = channel.lock()) {
            if (!lock.isValid()) {
                throw new IOException("unable to acquire durable ledger lock");
            }
            channel.write(ByteBuffer.wrap(line.getBytes(StandardCharsets.UTF_8)));
            channel.force(true);
        }
        return receipt;
    }

    @Override
    public synchronized Optional<DocumentSpineVersionReceipt> byVersionId(String versionId) throws IOException {
        return all().stream().filter(receipt -> receipt.versionId().equals(versionId)).findFirst();
    }

    @Override
    public synchronized Optional<DocumentSpineVersionReceipt> byJobId(String jobId) throws IOException {
        return all().stream().filter(receipt -> receipt.jobId().equals(jobId)).findFirst();
    }

    @Override
    public synchronized List<DocumentSpineVersionReceipt> all() throws IOException {
        if (!Files.isRegularFile(ledger)) {
            return List.of();
        }
        ArrayList<DocumentSpineVersionReceipt> out = new ArrayList<>();
        for (String line : Files.readAllLines(ledger, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) {
                out.add(decode(line));
            }
        }
        out.sort(Comparator.comparing(DocumentSpineVersionReceipt::createdAt));
        return List.copyOf(out);
    }

    private static String encode(DocumentSpineVersionReceipt receipt) {
        return String.join("\t",
                receipt.versionId(),
                receipt.jobId(),
                receipt.projectId(),
                b64(receipt.sourceArtifactId()),
                b64(receipt.resultArtifactId()),
                receipt.format().name(),
                receipt.sourceSha256(),
                receipt.resultSha256(),
                receipt.operationIntentDigest(),
                receipt.proofState().name(),
                list(receipt.capabilityIds()),
                list(receipt.evidence()),
                receipt.createdAt().toString());
    }

    private static DocumentSpineVersionReceipt decode(String line) {
        String[] fields = line.split("\t", -1);
        if (fields.length != 13) {
            throw new IllegalArgumentException("invalid version ledger line");
        }
        return new DocumentSpineVersionReceipt(
                fields[0],
                fields[1],
                fields[2],
                unb64(fields[3]),
                unb64(fields[4]),
                DocumentFormat.valueOf(fields[5]),
                fields[6],
                fields[7],
                fields[8],
                FinalDocumentProofPolicy.State.valueOf(fields[9]),
                parseList(fields[10]),
                parseList(fields[11]),
                Instant.parse(fields[12]));
    }

    private static String list(List<String> values) {
        return values.stream().map(FileDocumentSpineVersionStore::b64).reduce((a, b) -> a + "," + b).orElse("");
    }

    private static List<String> parseList(String value) {
        if (value.isEmpty()) {
            return List.of();
        }
        ArrayList<String> out = new ArrayList<>();
        for (String item : value.split(",", -1)) {
            out.add(unb64(item));
        }
        return List.copyOf(out);
    }

    private static String b64(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(
                Objects.requireNonNullElse(value, "").getBytes(StandardCharsets.UTF_8));
    }

    private static String unb64(String value) {
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }
}
