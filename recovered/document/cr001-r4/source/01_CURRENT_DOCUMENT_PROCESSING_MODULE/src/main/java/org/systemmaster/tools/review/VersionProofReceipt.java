package org.systemmaster.tools.review;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Deterministic proof receipt for an immutable version node and its parent lineage. */
public record VersionProofReceipt(
        String schemaVersion,
        String versionId,
        String artifactSha256,
        String semanticDigest,
        List<String> parentVersionIds,
        String branch,
        String author,
        Instant createdAt,
        String proofDigest) {

    public static final String SCHEMA_V1 = "VERSION-PROOF-1";

    public VersionProofReceipt {
        if (!SCHEMA_V1.equals(schemaVersion)) throw new IllegalArgumentException("unsupported version proof schema");
        if (versionId == null || !versionId.matches("ver-[0-9a-f]{20}")) throw new IllegalArgumentException("invalid version id");
        requireSha(artifactSha256, "artifact"); requireSha(semanticDigest, "semantic");
        parentVersionIds = List.copyOf(Objects.requireNonNullElse(parentVersionIds, List.of()));
        if (branch == null || branch.isBlank() || author == null || author.isBlank()) throw new IllegalArgumentException("branch and author required");
        Objects.requireNonNull(createdAt, "createdAt"); requireSha(proofDigest, "proof");
        if (!proofDigest.equals(compute(versionId, artifactSha256, semanticDigest, parentVersionIds, branch, author, createdAt))) throw new IllegalArgumentException("version proof digest mismatch");
    }

    public static VersionProofReceipt from(DocumentVersionSnapshot snapshot) {
        Objects.requireNonNull(snapshot, "snapshot");
        String proof = compute(snapshot.versionId(), snapshot.artifactSha256(), snapshot.semanticDigest(), snapshot.parentVersionIds(), snapshot.branch(), snapshot.author(), snapshot.createdAt());
        return new VersionProofReceipt(SCHEMA_V1, snapshot.versionId(), snapshot.artifactSha256(), snapshot.semanticDigest(), snapshot.parentVersionIds(), snapshot.branch(), snapshot.author(), snapshot.createdAt(), proof);
    }

    public boolean verifies(DocumentVersionSnapshot snapshot) {
        return snapshot != null && versionId.equals(snapshot.versionId()) && artifactSha256.equals(snapshot.artifactSha256()) && semanticDigest.equals(snapshot.semanticDigest())
                && parentVersionIds.equals(snapshot.parentVersionIds()) && branch.equals(snapshot.branch()) && author.equals(snapshot.author()) && createdAt.equals(snapshot.createdAt());
    }

    private static String compute(String versionId,String artifact,String semantic,List<String>parents,String branch,String author,Instant at){String c=SCHEMA_V1+"|"+versionId+"|"+artifact+"|"+semantic+"|"+String.join(",",parents)+"|"+branch+"|"+author+"|"+at;return ReviewDigests.sha256(c.getBytes(StandardCharsets.UTF_8));}
    private static void requireSha(String v,String n){if(v==null||!v.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(n+" sha256 required");}
}
