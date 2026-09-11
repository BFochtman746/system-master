package org.systemmaster.tools.document.spine;

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

/** File-backed append-only stage journal with forced writes for restart-safe resume. */
public final class FileDocumentSpineCheckpointStore implements DocumentSpineCheckpointStore {
    private final Path root;

    public FileDocumentSpineCheckpointStore(Path root) throws IOException {
        this.root = Objects.requireNonNull(root, "root").toAbsolutePath().normalize();
        Files.createDirectories(this.root);
    }

    @Override
    public synchronized void record(DocumentSpineStageReceipt receipt) throws IOException {
        Objects.requireNonNull(receipt, "receipt");
        Path journal = journal(receipt.jobId());
        String line = encode(receipt) + System.lineSeparator();
        try (FileChannel channel = FileChannel.open(
                journal,
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
    }

    @Override
    public synchronized Optional<DocumentSpineStageReceipt> latest(String jobId, DocumentSpineStage stage) throws IOException {
        Objects.requireNonNull(stage, "stage");
        DocumentSpineStageReceipt found = null;
        for (DocumentSpineStageReceipt receipt : receipts(jobId)) {
            if (receipt.stage() == stage) {
                found = receipt;
            }
        }
        return Optional.ofNullable(found);
    }

    @Override
    public synchronized List<DocumentSpineStageReceipt> receipts(String jobId) throws IOException {
        Path journal = journal(jobId);
        if (!Files.isRegularFile(journal)) {
            return List.of();
        }
        ArrayList<DocumentSpineStageReceipt> out = new ArrayList<>();
        for (String line : Files.readAllLines(journal, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) {
                out.add(decode(line));
            }
        }
        out.sort(Comparator.comparing(DocumentSpineStageReceipt::completedAt)
                .thenComparingInt(receipt -> receipt.stage().order()));
        return List.copyOf(out);
    }

    private Path journal(String jobId) {
        if (jobId == null || !jobId.matches("[0-9a-f-]{36}")) {
            throw new IllegalArgumentException("canonical job id required");
        }
        Path path = root.resolve(jobId + ".journal").normalize();
        if (!path.getParent().equals(root)) {
            throw new IllegalArgumentException("unsafe job id");
        }
        return path;
    }

    private static String encode(DocumentSpineStageReceipt receipt) {
        return String.join("\t",
                receipt.schema(),
                receipt.jobId(),
                receipt.stage().name(),
                receipt.status().name(),
                nullText(receipt.inputSha256()),
                nullText(receipt.outputSha256()),
                receipt.idempotencyKey(),
                receipt.completedAt().toString(),
                list(receipt.evidence()),
                list(receipt.diagnostics()));
    }

    private static DocumentSpineStageReceipt decode(String line) {
        String[] fields = line.split("\t", -1);
        if (fields.length != 10) {
            throw new IllegalArgumentException("invalid stage journal line");
        }
        return new DocumentSpineStageReceipt(
                fields[0],
                fields[1],
                DocumentSpineStage.valueOf(fields[2]),
                DocumentSpineStageReceipt.Status.valueOf(fields[3]),
                emptyToNull(fields[4]),
                emptyToNull(fields[5]),
                fields[6],
                Instant.parse(fields[7]),
                parseList(fields[8]),
                parseList(fields[9]));
    }

    private static String list(List<String> values) {
        return values.stream().map(FileDocumentSpineCheckpointStore::b64).reduce((a, b) -> a + "," + b).orElse("");
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

    private static String nullText(String value) {
        return value == null ? "" : value;
    }

    private static String emptyToNull(String value) {
        return value.isEmpty() ? null : value;
    }
}
