package org.systemmaster.tools.docx;

import org.systemmaster.core.ArtifactIntakeReceipt;
import org.systemmaster.core.ArtifactIntakeRequest;
import org.systemmaster.core.GovernedArtifactGateway;
import org.systemmaster.core.UuidV7;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Headless MOD-DOCX-001 facade. All bytes enter and leave through PLATFORM-008. */
final class DocxToolService {
    public static final String DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final String PRODUCER = "MOD-DOCX-001";
    private static final String PROVENANCE = "toolvault://MOD-DOCX-001/MODULE-DOCX-RU-001D";

    public record Version(String artifactId, String digest, String logicalRef, long sizeBytes, String mediaType) {}
    public record Inspection(Version version, DocxPackageEngine.Inspection packageInspection) {}
    public record EditReceipt(Version source, Version result, int replacements, String sourceSemanticDigest, String resultSemanticDigest) {}

    private final GovernedArtifactGateway artifacts;
    private final Clock clock;
    private final DocxPackageEngine engine;

    public DocxToolService(GovernedArtifactGateway artifacts, Clock clock) {
        this(artifacts, clock, new DocxPackageEngine());
    }

    DocxToolService(GovernedArtifactGateway artifacts, Clock clock, DocxPackageEngine engine) {
        this.artifacts = Objects.requireNonNull(artifacts, "artifacts");
        this.clock = Objects.requireNonNull(clock, "clock");
        this.engine = Objects.requireNonNull(engine, "engine");
    }

    public Inspection ingestAndInspect(String artifactId, InputStream input) throws Exception {
        ArtifactIntakeReceipt receipt = ingest(artifactId, input, List.of(), List.of(PROVENANCE));
        Version version = version(receipt);
        return new Inspection(version, engine.inspect(artifacts.readVerified(version.digest(), artifacts.maxBytes())));
    }

    public Inspection inspect(Version version) throws IOException {
        requireVersion(version);
        return new Inspection(version, engine.inspect(artifacts.readVerified(version.digest(), artifacts.maxBytes())));
    }

    public EditReceipt replaceText(Version source, String outputArtifactId, String search, String replacement) throws Exception {
        requireVersion(source);
        byte[] sourceBytes = artifacts.readVerified(source.digest(), artifacts.maxBytes());
        DocxPackageEngine.Mutation mutation = engine.replaceText(sourceBytes, search, replacement);
        ArtifactIntakeReceipt admitted = ingest(
                outputArtifactId,
                new ByteArrayInputStream(mutation.bytes()),
                List.of(source.logicalRef()),
                List.of(PROVENANCE, "edit-plan:replace-text-v1")
        );
        Version result = version(admitted);
        return new EditReceipt(source, result, mutation.replacements(), mutation.sourceSemanticDigest(), mutation.resultSemanticDigest());
    }

    private ArtifactIntakeReceipt ingest(String artifactId, InputStream input, List<String> parents, List<String> sources) throws Exception {
        Objects.requireNonNull(input, "input");
        ArtifactIntakeRequest request = new ArtifactIntakeRequest(
                UuidV7.create().toString(),
                requireArtifactId(artifactId),
                PRODUCER,
                DOCX_MEDIA_TYPE,
                null,
                null,
                parents,
                sources,
                Instant.now(clock)
        );
        ArtifactIntakeReceipt receipt = artifacts.ingest(request, input);
        if (!"VERIFIED".equals(receipt.disposition())) throw new IOException("DOCX admission rejected: " + receipt.reason());
        return receipt;
    }

    private static Version version(ArtifactIntakeReceipt receipt) {
        return new Version(receipt.artifactId(), receipt.digest(), receipt.logicalRef(), receipt.sizeBytes(), receipt.detectedMediaType());
    }

    private static void requireVersion(Version version) {
        Objects.requireNonNull(version, "version");
        if (version.digest() == null || !version.digest().matches("[0-9a-f]{64}")) throw new IllegalArgumentException("version digest");
        if (!Objects.equals(version.logicalRef(), "sha256:" + version.digest())) throw new IllegalArgumentException("version logicalRef");
    }

    private static String requireArtifactId(String id) {
        if (id == null || !id.matches("[A-Za-z0-9._-]{1,128}")) throw new IllegalArgumentException("unsafe artifact id");
        return id;
    }
}
