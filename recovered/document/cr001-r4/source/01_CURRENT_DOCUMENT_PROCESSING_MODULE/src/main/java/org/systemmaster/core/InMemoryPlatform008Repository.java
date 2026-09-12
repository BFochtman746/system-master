package org.systemmaster.core;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

public final class InMemoryPlatform008Repository implements Platform008Repository {
    private final Map<String,ArtifactIntakeReceipt> receipts = new ConcurrentHashMap<>();
    private final Map<String,ArtifactTransferSession> transfers = new ConcurrentHashMap<>();
    @Override public void recordReceipt(ArtifactIntakeReceipt r) { if (receipts.putIfAbsent(r.intakeId(), r) != null) throw new IllegalStateException("duplicate intakeId"); }
    @Override public void createTransfer(ArtifactTransferSession s) { if (transfers.putIfAbsent(s.transferId(), s) != null) throw new IllegalStateException("duplicate transferId"); }
    @Override public void updateTransfer(ArtifactTransferSession s) { transfers.compute(s.transferId(), (k, prior) -> { if (prior == null) throw new IllegalStateException("unknown transfer"); if (s.receivedBytes() < prior.receivedBytes()) throw new IllegalStateException("transfer offset regression"); return s; }); }
    @Override public Optional<ArtifactTransferSession> transfer(String id) { return Optional.ofNullable(transfers.get(id)); }
    @Override public boolean hasVerifiedDigest(String digest) { return receipts.values().stream().anyMatch(r -> r.digest().equals(digest) && r.disposition().equals("VERIFIED")); }
    public Optional<ArtifactIntakeReceipt> receipt(String id) { return Optional.ofNullable(receipts.get(id)); }
}
