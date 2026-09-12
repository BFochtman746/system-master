package org.systemmaster.tools.document.spine;

import org.systemmaster.core.UuidV7;
import org.systemmaster.tools.document.DocumentFormat;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

/** Durable job identity and immutable routing intent for one spine execution. */
public record DocumentSpineJob(
        String jobId,
        String projectId,
        String sourceArtifactId,
        String resultArtifactId,
        String sourceFileName,
        String declaredMediaType,
        DocumentSpineMode mode,
        DocumentFormat requestedTargetFormat,
        DocumentSpinePublicationClass publicationClass,
        Set<String> capabilityIds,
        String producerRef,
        String author,
        Instant createdAt) {

    public DocumentSpineJob {
        jobId = UuidV7.requireCanonical(jobId, "jobId");
        projectId = UuidV7.requireCanonical(projectId, "projectId");
        sourceArtifactId = text(sourceArtifactId, "sourceArtifactId", 512);
        resultArtifactId = text(resultArtifactId, "resultArtifactId", 512);
        sourceFileName = text(sourceFileName, "sourceFileName", 512);
        declaredMediaType = text(declaredMediaType, "declaredMediaType", 256).toLowerCase(java.util.Locale.ROOT);
        Objects.requireNonNull(mode, "mode");
        Objects.requireNonNull(requestedTargetFormat, "requestedTargetFormat");
        Objects.requireNonNull(publicationClass, "publicationClass");
        capabilityIds = Set.copyOf(Objects.requireNonNullElse(capabilityIds, Set.of()));
        if (capabilityIds.isEmpty() || capabilityIds.stream().anyMatch(id -> id == null || !id.startsWith("UDM-"))) {
            throw new IllegalArgumentException("atomic capability ids required");
        }
        producerRef = text(producerRef, "producerRef", 512);
        author = text(author, "author", 256);
        Objects.requireNonNull(createdAt, "createdAt");
    }

    public String identityMaterial() {
        return String.join("|",
                jobId,
                projectId,
                sourceArtifactId,
                resultArtifactId,
                sourceFileName,
                declaredMediaType,
                mode.name(),
                requestedTargetFormat.name(),
                publicationClass.name(),
                capabilityIds.stream().sorted().reduce((a, b) -> a + ";" + b).orElse(""),
                producerRef,
                author,
                createdAt.toString());
    }

    private static String text(String value, String name, int max) {
        if (value == null || value.isBlank() || value.length() > max) {
            throw new IllegalArgumentException(name + " required");
        }
        return value;
    }
}
