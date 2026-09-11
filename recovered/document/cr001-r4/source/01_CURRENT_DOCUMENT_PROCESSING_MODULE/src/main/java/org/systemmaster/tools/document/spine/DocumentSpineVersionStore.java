package org.systemmaster.tools.document.spine;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/** Immutable version/lineage authority for the document spine. */
public interface DocumentSpineVersionStore {
    DocumentSpineVersionReceipt commit(DocumentSpineVersionReceipt receipt) throws IOException;

    Optional<DocumentSpineVersionReceipt> byVersionId(String versionId) throws IOException;

    Optional<DocumentSpineVersionReceipt> byJobId(String jobId) throws IOException;

    List<DocumentSpineVersionReceipt> all() throws IOException;
}
