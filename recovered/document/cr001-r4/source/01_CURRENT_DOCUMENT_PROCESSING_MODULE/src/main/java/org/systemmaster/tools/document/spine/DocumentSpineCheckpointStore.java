package org.systemmaster.tools.document.spine;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/** Durable append-only checkpoint authority for long-running document jobs. */
public interface DocumentSpineCheckpointStore {
    void record(DocumentSpineStageReceipt receipt) throws IOException;

    Optional<DocumentSpineStageReceipt> latest(String jobId, DocumentSpineStage stage) throws IOException;

    List<DocumentSpineStageReceipt> receipts(String jobId) throws IOException;
}
