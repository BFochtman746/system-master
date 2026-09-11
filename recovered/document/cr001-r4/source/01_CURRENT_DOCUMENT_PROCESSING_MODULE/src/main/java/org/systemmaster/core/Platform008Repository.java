package org.systemmaster.core;

import java.util.Optional;

public interface Platform008Repository {
    void recordReceipt(ArtifactIntakeReceipt receipt) throws Exception;
    void createTransfer(ArtifactTransferSession session) throws Exception;
    void updateTransfer(ArtifactTransferSession session) throws Exception;
    Optional<ArtifactTransferSession> transfer(String transferId) throws Exception;
    boolean hasVerifiedDigest(String digest) throws Exception;
}
