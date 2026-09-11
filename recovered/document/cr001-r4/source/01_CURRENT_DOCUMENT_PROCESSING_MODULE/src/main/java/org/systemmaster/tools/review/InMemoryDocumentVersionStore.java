package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;
import org.systemmaster.tools.document.CanonicalDocumentGraphProjector;
import org.systemmaster.tools.document.DocumentFormat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Local append-only version DAG with optimistic branch-head preconditions. */
public final class InMemoryDocumentVersionStore {
    private final CanonicalDocumentGraphProjector projector = new CanonicalDocumentGraphProjector();
    private final LinkedHashMap<String,DocumentVersionSnapshot> versions = new LinkedHashMap<>();
    private final LinkedHashMap<String,String> heads = new LinkedHashMap<>();

    public DocumentVersionSnapshot initialize(DocumentFormat format, byte[] artifact, String branch, String author, Instant at, String message) throws IOException {
        if (!versions.isEmpty()) throw new IllegalStateException("version store already initialized");
        DocumentVersionSnapshot snapshot = build(format, artifact, List.of(), branch, author, at, message);
        versions.put(snapshot.versionId(), snapshot); heads.put(branch, snapshot.versionId()); return snapshot;
    }

    public void createBranch(String branch, String fromVersionId) {
        requireBranch(branch); requireVersion(fromVersionId);
        if (heads.putIfAbsent(branch, fromVersionId) != null) throw new IllegalArgumentException("branch already exists");
    }

    public DocumentVersionSnapshot commit(String branch, String expectedHeadVersionId, byte[] artifact, String author, Instant at, String message) throws IOException {
        String actual = requireHead(branch);
        if (!actual.equals(expectedHeadVersionId)) throw new IllegalStateException("branch head precondition mismatch");
        DocumentVersionSnapshot parent = requireVersion(actual);
        DocumentVersionSnapshot next = build(parent.format(), artifact, List.of(actual), branch, author, at, message);
        versions.put(next.versionId(), next); heads.put(branch, next.versionId()); return next;
    }

    public DocumentVersionSnapshot mergeCommit(String branch, String expectedHeadVersionId, String secondParentVersionId, byte[] artifact,
                                               String author, Instant at, String message) throws IOException {
        String actual = requireHead(branch);
        if (!actual.equals(expectedHeadVersionId)) throw new IllegalStateException("branch head precondition mismatch");
        DocumentVersionSnapshot first = requireVersion(actual); DocumentVersionSnapshot second = requireVersion(secondParentVersionId);
        if (first.format() != second.format()) throw new IllegalArgumentException("merge format mismatch");
        DocumentVersionSnapshot next = build(first.format(), artifact, List.of(actual, secondParentVersionId), branch, author, at, message);
        versions.put(next.versionId(), next); heads.put(branch, next.versionId()); return next;
    }

    /** Non-destructive rollback: commit the exact bytes of an earlier version as a new descendant of current HEAD. */
    public DocumentVersionSnapshot rollback(String branch, String expectedHeadVersionId, String restoreVersionId, String author, Instant at, String reason) throws IOException {
        DocumentVersionSnapshot restore = requireVersion(restoreVersionId);
        return commit(branch, expectedHeadVersionId, restore.artifactBytes(), author, at, "ROLLBACK_TO:" + restoreVersionId + " " + Objects.requireNonNullElse(reason, ""));
    }

    public DocumentVersionSnapshot requireVersion(String versionId) {
        DocumentVersionSnapshot v = versions.get(versionId);
        if (v == null) throw new IllegalArgumentException("version not found: " + versionId);
        return v;
    }
    public String requireHead(String branch) { String v = heads.get(branch); if (v == null) throw new IllegalArgumentException("branch not found: " + branch); return v; }
    public Map<String,String> heads() { return Map.copyOf(heads); }
    public List<DocumentVersionSnapshot> versions() { return List.copyOf(versions.values()); }

    private DocumentVersionSnapshot build(DocumentFormat format, byte[] artifact, List<String> parents, String branch, String author, Instant at, String message) throws IOException {
        requireBranch(branch); Objects.requireNonNull(at, "at");
        CanonicalDocumentGraph graph = projector.project(format, artifact);
        String seed = graph.sourceSha256() + "|" + graph.semanticDigest() + "|" + String.join(",", parents) + "|" + branch + "|" + author + "|" + at + "|" + message;
        String id = "ver-" + ReviewDigests.sha256(seed.getBytes(StandardCharsets.UTF_8)).substring(0, 20);
        return new DocumentVersionSnapshot(id, format, graph.sourceSha256(), graph.semanticDigest(), parents, branch, author, at, message, artifact);
    }
    private static void requireBranch(String branch) { if (branch == null || !branch.matches("[A-Za-z0-9._/-]{1,128}") || branch.contains("..")) throw new IllegalArgumentException("invalid branch"); }
}
