package org.systemmaster.continuity;

import java.nio.file.Path;
import java.time.Instant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

public final class DurableWorkIdentityRegistry {
    private final ContinuityJournal journal;

    public DurableWorkIdentityRegistry(Path storeDirectory) {
        this.journal = new ContinuityJournal(storeDirectory);
    }

    public RegistrationResult registerDurableWorkIdentity(
            String taskId, String workflowId, String stageId, String workUnitId,
            String intentDigest, String semanticOwnerRef) {
        return registerDurableWorkIdentity(taskId, workflowId, stageId, workUnitId, null,
                intentDigest, semanticOwnerRef, "UNCLASSIFIED");
    }

    public RegistrationResult registerDurableWorkIdentity(
            String taskId, String workflowId, String stageId, String workUnitId, String parentWorkUnitId,
            String intentDigest, String semanticOwnerRef, String classification) {
        Instant createdAt = Instant.now();
        return journal.transact(snapshot -> {
            DurableWorkIdentity candidate = new DurableWorkIdentity(taskId, workflowId, stageId, workUnitId,
                    parentWorkUnitId, intentDigest, semanticOwnerRef, createdAt, classification);
            DurableWorkIdentity existing = snapshot.identities().get(candidate.workUnitId());
            if (existing != null) {
                if (semanticallySame(existing, candidate)) return ContinuityJournal.Decision.readOnly(RegistrationResult.IDEMPOTENT_EXISTING);
                throw new IdentityConflictException("same work_unit_id has different semantic identity: " + workUnitId);
            }
            validateParentLineage(snapshot, candidate);
            return ContinuityJournal.Decision.append(RegistrationResult.CREATED, ContinuityJournal.identityFrame(candidate));
        });
    }

    public Optional<DurableWorkIdentity> get(String workUnitId) {
        return Optional.ofNullable(journal.snapshot().identities().get(workUnitId));
    }

    public long size() { return journal.snapshot().identities().size(); }

    Path journalPath() { return journal.file(); }

    private static boolean semanticallySame(DurableWorkIdentity a, DurableWorkIdentity b) {
        return a.taskId().equals(b.taskId()) && a.workflowId().equals(b.workflowId()) && a.stageId().equals(b.stageId())
                && a.workUnitId().equals(b.workUnitId()) && java.util.Objects.equals(a.parentWorkUnitId(), b.parentWorkUnitId())
                && a.intentDigest().equals(b.intentDigest()) && a.semanticOwnerRef().equals(b.semanticOwnerRef())
                && a.classification().equals(b.classification());
    }

    private static void validateParentLineage(ContinuityJournal.Snapshot snapshot, DurableWorkIdentity candidate) {
        if (candidate.parentWorkUnitId() == null) return;
        DurableWorkIdentity parent = snapshot.identities().get(candidate.parentWorkUnitId());
        if (parent == null) throw new InvalidLineageException("parent work unit is missing: " + candidate.parentWorkUnitId());
        if (!parent.taskId().equals(candidate.taskId()) || !parent.workflowId().equals(candidate.workflowId())) {
            throw new InvalidLineageException("parent must remain in the same task/workflow lineage");
        }
        Set<String> seen = new HashSet<>();
        String cursor = parent.workUnitId();
        while (cursor != null) {
            if (!seen.add(cursor)) throw new InvalidLineageException("existing lineage cycle detected");
            if (cursor.equals(candidate.workUnitId())) throw new InvalidLineageException("lineage cycle would be created");
            DurableWorkIdentity current = snapshot.identities().get(cursor);
            cursor = current == null ? null : current.parentWorkUnitId();
        }
    }

    public enum RegistrationResult { CREATED, IDEMPOTENT_EXISTING }

    public static final class IdentityConflictException extends RuntimeException {
        public IdentityConflictException(String message) { super(message); }
    }
    public static final class InvalidLineageException extends RuntimeException {
        public InvalidLineageException(String message) { super(message); }
    }
}
