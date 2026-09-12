package org.systemmaster.foundation.root;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.Optional;
import java.util.UUID;

public final class FileAuthorityRegistryStore implements AuthorityRegistryStore {
    private final Path snapshotPath;
    private final Path lockPath;

    public FileAuthorityRegistryStore(Path snapshotPath) {
        this.snapshotPath = snapshotPath.toAbsolutePath().normalize();
        this.lockPath = this.snapshotPath.resolveSibling(this.snapshotPath.getFileName() + ".lock");
    }

    @Override
    public Optional<RegistrySnapshot> load() throws IOException {
        if (!Files.exists(snapshotPath)) return Optional.empty();
        return Optional.of(RegistrySnapshotCodec.decode(Files.readAllBytes(snapshotPath)));
    }

    @Override
    public void save(long expectedCurrentRevision, RegistrySnapshot next) throws IOException {
        Path parent = snapshotPath.getParent();
        if (parent != null) Files.createDirectories(parent);
        try (FileChannel lockChannel = FileChannel.open(lockPath,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE);
             FileLock lock = lockChannel.lock()) {
            if (!lock.isValid()) throw new IOException("ROOT_REGISTRY_FILE_LOCK_INVALID");
            long actualRevision = 0;
            if (Files.exists(snapshotPath)) {
                RegistrySnapshot current = RegistrySnapshotCodec.decode(Files.readAllBytes(snapshotPath));
                actualRevision = current.revision();
            }
            if (actualRevision != expectedCurrentRevision) {
                throw new StaleRegistryRevisionException(expectedCurrentRevision, actualRevision);
            }
            if (next.revision() != expectedCurrentRevision + 1 && expectedCurrentRevision != 0) {
                throw new IOException("ROOT_REGISTRY_NON_SEQUENTIAL_REVISION:" + expectedCurrentRevision + "->" + next.revision());
            }
            if (expectedCurrentRevision == 0 && next.revision() != 1) {
                throw new IOException("ROOT_REGISTRY_BOOTSTRAP_MUST_BE_REVISION_1");
            }

            byte[] encoded = RegistrySnapshotCodec.encode(next);
            Path temp = snapshotPath.resolveSibling(snapshotPath.getFileName() + ".tmp-" + UUID.randomUUID());
            try {
                try (FileChannel output = FileChannel.open(temp,
                        StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                    ByteBuffer buffer = ByteBuffer.wrap(encoded);
                    while (buffer.hasRemaining()) output.write(buffer);
                    output.force(true);
                }
                try {
                    Files.move(temp, snapshotPath, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                    Files.move(temp, snapshotPath, StandardCopyOption.REPLACE_EXISTING);
                }
                forceDirectory(parent);
            } finally {
                Files.deleteIfExists(temp);
            }
        }
    }

    private static void forceDirectory(Path parent) {
        if (parent == null) return;
        try (FileChannel channel = FileChannel.open(parent, StandardOpenOption.READ)) {
            channel.force(true);
        } catch (Exception ignored) {
            // Some filesystems do not support directory fsync. The snapshot itself was fsynced first.
        }
    }

    public static final class StaleRegistryRevisionException extends IOException {
        private static final long serialVersionUID = 1L;
        private final long expectedRevision;
        private final long actualRevision;

        public StaleRegistryRevisionException(long expectedRevision, long actualRevision) {
            super("ROOT_REGISTRY_STALE_REVISION:expected=" + expectedRevision + ":actual=" + actualRevision);
            this.expectedRevision = expectedRevision;
            this.actualRevision = actualRevision;
        }

        public long expectedRevision() { return expectedRevision; }
        public long actualRevision() { return actualRevision; }
    }
}
