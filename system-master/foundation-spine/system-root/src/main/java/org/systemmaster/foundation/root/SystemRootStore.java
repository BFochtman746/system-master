package org.systemmaster.foundation.root;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import static org.systemmaster.foundation.root.SystemAuthority.Event;
import static org.systemmaster.foundation.root.SystemAuthority.OperationReceipt;
import static org.systemmaster.foundation.root.SystemAuthority.Record;
import static org.systemmaster.foundation.root.SystemAuthority.TopologyEdge;
import static org.systemmaster.foundation.root.SystemAuthority.VersionPointer;

/** Durable persistence boundary for the System Root. */
public interface SystemRootStore {
    RootSnapshot load() throws IOException;

    /** Compare-and-swap the complete authoritative snapshot. */
    void save(long expectedStoreRevision, RootSnapshot next) throws IOException;

    final class StaleStoreRevisionException extends IOException {
        private static final long serialVersionUID = 1L;
        public StaleStoreRevisionException(String message) { super(message); }
    }

    final class CorruptRootStoreException extends IOException {
        private static final long serialVersionUID = 1L;
        public CorruptRootStoreException(String message) { super(message); }
        public CorruptRootStoreException(String message, Throwable cause) { super(message, cause); }
    }

    record RootSnapshot(
            long storeRevision,
            Map<String, Record> systems,
            Set<TopologyEdge> topology,
            Map<String, List<VersionPointer>> versionHistory,
            Map<String, OperationReceipt> operationReceipts,
            List<Event> events) {
        public RootSnapshot {
            if (storeRevision < 0) throw new IllegalArgumentException("storeRevision");
            systems = Map.copyOf(Objects.requireNonNull(systems, "systems"));
            topology = Set.copyOf(Objects.requireNonNull(topology, "topology"));
            Objects.requireNonNull(versionHistory, "versionHistory");
            versionHistory = versionHistory.entrySet().stream().collect(
                    java.util.stream.Collectors.toUnmodifiableMap(
                            Map.Entry::getKey,
                            entry -> List.copyOf(entry.getValue())));
            operationReceipts = Map.copyOf(Objects.requireNonNull(operationReceipts, "operationReceipts"));
            events = List.copyOf(Objects.requireNonNull(events, "events"));
        }

        public static RootSnapshot empty() {
            return new RootSnapshot(0, Map.of(), Set.of(), Map.of(), Map.of(), List.of());
        }
    }
}
