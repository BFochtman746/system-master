package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.SystemAuthority.*;
import static org.systemmaster.foundation.root.SystemRootStore.RootSnapshot;
import static org.systemmaster.foundation.root.SystemRootGuards.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Canonical runtime authority for Foundation & Spine system identity, truth ownership, current
 * implementation pointers, admission lifecycle, and static integration topology.
 */
public final class SystemRootRegistry {
    public static final String ROOT_SYSTEM_ID = "system-root";

    public record MutationResult(RootSnapshot snapshot, OperationReceipt receipt, boolean replayed) {}

    public static final class AuthorityConflictException extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        public AuthorityConflictException(String message) { super(message); }
    }

    public static final class StaleAuthorityGenerationException extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        public StaleAuthorityGenerationException(String message) { super(message); }
    }

    public static final class IllegalLifecycleTransitionException extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        public IllegalLifecycleTransitionException(String message) { super(message); }
    }

    public static final class OperationIdConflictException extends IllegalStateException {
        private static final long serialVersionUID = 1L;
        public OperationIdConflictException(String message) { super(message); }
    }

    public static final class MutationAuthorizationException extends SecurityException {
        private static final long serialVersionUID = 1L;
        public MutationAuthorizationException(String message) { super(message); }
    }

    public static final class AdmissionVerificationException extends SecurityException {
        private static final long serialVersionUID = 1L;
        public AdmissionVerificationException(String message) { super(message); }
    }

    private final SystemRootStore store;
    private final MutationAuthorizer mutationAuthorizer;
    private final AdmissionVerifier admissionVerifier;
    private final Clock clock;

    public SystemRootRegistry(
            SystemRootStore store,
            MutationAuthorizer mutationAuthorizer,
            AdmissionVerifier admissionVerifier) {
        this(store, mutationAuthorizer, admissionVerifier, Clock.systemUTC());
    }

    public SystemRootRegistry(
            SystemRootStore store,
            MutationAuthorizer mutationAuthorizer,
            AdmissionVerifier admissionVerifier,
            Clock clock) {
        this.store = Objects.requireNonNull(store, "store");
        this.mutationAuthorizer = Objects.requireNonNull(mutationAuthorizer, "mutationAuthorizer");
        this.admissionVerifier = Objects.requireNonNull(admissionVerifier, "admissionVerifier");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    public RootSnapshot snapshot() throws IOException {
        RootSnapshot snapshot = store.load();
        validateSnapshot(snapshot);
        return snapshot;
    }

    public Optional<SystemAuthority.Record> findSystem(String systemId) throws IOException {
        return Optional.ofNullable(snapshot().systems().get(SystemAuthority.systemId(systemId)));
    }

    public Optional<String> authorityForTruth(String truthKey) throws IOException {
        String key = SystemAuthority.text(truthKey, "truthKey").toLowerCase();
        return snapshot().systems().values().stream()
                .filter(record -> record.lifecycle() != Lifecycle.RETIRED)
                .filter(record -> record.descriptor().ownedTruthKeys().contains(key))
                .map(record -> record.descriptor().systemId())
                .findFirst();
    }

    public MutationResult bootstrap(
            List<Descriptor> descriptors,
            VersionPointer rootVersion,
            AdmissionBasis rootBasis,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        Objects.requireNonNull(descriptors, "descriptors");
        Objects.requireNonNull(rootVersion, "rootVersion");
        Objects.requireNonNull(rootBasis, "rootBasis");
        List<String> descriptorCanonicals = descriptors.stream()
                .sorted(Comparator.comparing(Descriptor::systemId))
                .map(Descriptor::canonical).toList();
        String canonical = SystemAuthority.canonicalTuple("BOOTSTRAP",
                SystemAuthority.canonicalList(descriptorCanonicals), rootVersion.canonical(), rootBasis.canonical());
        return commit(MutationAction.BOOTSTRAP, operationId, canonical, ROOT_SYSTEM_ID, "ROOT_BOOTSTRAPPED", actorRef, decisionRef, state -> {
            if (!state.systems.isEmpty() || state.base.storeRevision() != 0) {
                throw new AuthorityConflictException("ROOT_ALREADY_BOOTSTRAPPED");
            }
            Descriptor rootDescriptor = descriptors.stream().filter(d -> d.systemId().equals(ROOT_SYSTEM_ID)).findFirst()
                    .orElseThrow(() -> new AuthorityConflictException("SYSTEM_ROOT_DESCRIPTOR_REQUIRED"));
            if (!admissionVerifier.admissible(new AdmissionRequest(
                    ROOT_SYSTEM_ID, rootDescriptor, rootVersion, rootBasis, actorRef, decisionRef, true, state.base))) {
                throw new AdmissionVerificationException("ROOT_BOOTSTRAP_ADMISSION_REJECTED");
            }
            Instant now = state.now;
            for (Descriptor descriptor : descriptors) {
                if (state.systems.containsKey(descriptor.systemId())) {
                    throw new AuthorityConflictException("DUPLICATE_SYSTEM_ID:" + descriptor.systemId());
                }
                assertTruthKeysAvailable(state.systems, descriptor, null);
                Lifecycle lifecycle = descriptor.systemId().equals(ROOT_SYSTEM_ID) ? Lifecycle.ADMITTED : Lifecycle.DECLARED;
                VersionPointer current = descriptor.systemId().equals(ROOT_SYSTEM_ID) ? rootVersion : null;
                AdmissionBasis basis = descriptor.systemId().equals(ROOT_SYSTEM_ID) ? rootBasis : null;
                state.systems.put(descriptor.systemId(), new SystemAuthority.Record(
                        descriptor, lifecycle, 1L, current, basis, now, now, null));
                if (current != null) state.versionHistory.put(descriptor.systemId(), new ArrayList<>(List.of(current)));
            }
            if (!state.systems.containsKey(ROOT_SYSTEM_ID)) {
                throw new AuthorityConflictException("SYSTEM_ROOT_DESCRIPTOR_REQUIRED");
            }
            return "system-root@bootstrap";
        });
    }

    public MutationResult declare(
            Descriptor descriptor,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        Objects.requireNonNull(descriptor, "descriptor");
        String canonical = SystemAuthority.canonicalTuple("DECLARE", descriptor.canonical());
        return commit(MutationAction.DECLARE_SYSTEM, operationId, canonical, descriptor.systemId(), "SYSTEM_DECLARED", actorRef, decisionRef, state -> {
            if (state.systems.containsKey(descriptor.systemId())) {
                throw new AuthorityConflictException("SYSTEM_ID_ALREADY_EXISTS:" + descriptor.systemId());
            }
            assertTruthKeysAvailable(state.systems, descriptor, null);
            Instant now = state.now;
            state.systems.put(descriptor.systemId(), new SystemAuthority.Record(
                    descriptor, Lifecycle.DECLARED, 1L, null, null, now, now, null));
            return descriptor.systemId();
        });
    }

    public MutationResult reviseDescriptor(
            String systemId,
            long expectedGeneration,
            Descriptor updated,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String id = SystemAuthority.systemId(systemId);
        Objects.requireNonNull(updated, "updated");
        if (!id.equals(updated.systemId())) throw new IllegalArgumentException("descriptor systemId cannot change");
        String canonical = SystemAuthority.canonicalTuple("REVISE_DESCRIPTOR", id, Long.toString(expectedGeneration), updated.canonical());
        return commit(MutationAction.REVISE_DESCRIPTOR, operationId, canonical, id, "SYSTEM_DESCRIPTOR_REVISED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, id);
            requireGeneration(prior, expectedGeneration);
            if (prior.lifecycle() == Lifecycle.RETIRED) throw new IllegalLifecycleTransitionException("RETIRED_SYSTEM_IMMUTABLE:" + id);
            assertTruthKeysAvailable(state.systems, updated, id);
            state.systems.put(id, new SystemAuthority.Record(
                    updated, prior.lifecycle(), prior.generation() + 1, prior.currentVersion(), prior.admissionBasis(),
                    prior.declaredAt(), state.now, prior.replacementSystemId()));
            return id + "@g" + (prior.generation() + 1);
        });
    }

    /** Initial admission or promotion of a new exact implementation version. */
    public MutationResult admitVersion(
            String systemId,
            long expectedGeneration,
            VersionPointer version,
            AdmissionBasis basis,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String id = SystemAuthority.systemId(systemId);
        Objects.requireNonNull(version, "version");
        Objects.requireNonNull(basis, "basis");
        String canonical = SystemAuthority.canonicalTuple("ADMIT_VERSION", id, Long.toString(expectedGeneration), version.canonical(), basis.canonical());
        return commit(MutationAction.ADMIT_VERSION, operationId, canonical, id, "SYSTEM_VERSION_ADMITTED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, id);
            requireGeneration(prior, expectedGeneration);
            if (prior.lifecycle() == Lifecycle.RETIRED || prior.lifecycle() == Lifecycle.DRAINING) {
                throw new IllegalLifecycleTransitionException("VERSION_ADMISSION_NOT_ALLOWED_FROM:" + prior.lifecycle());
            }
            if (version.equals(prior.currentVersion())) {
                throw new AuthorityConflictException("VERSION_ALREADY_CURRENT:" + id);
            }
            if (!admissionVerifier.admissible(new AdmissionRequest(
                    id, prior.descriptor(), version, basis, actorRef, decisionRef, false, state.base))) {
                throw new AdmissionVerificationException("SYSTEM_VERSION_ADMISSION_REJECTED:" + id);
            }
            state.versionHistory.computeIfAbsent(id, ignored -> new ArrayList<>()).add(version);
            state.systems.put(id, new SystemAuthority.Record(
                    prior.descriptor(), Lifecycle.ADMITTED, prior.generation() + 1, version, basis,
                    prior.declaredAt(), state.now, null));
            return id + "@" + version.implementationVersion();
        });
    }

    public MutationResult beginDrain(
            String systemId,
            long expectedGeneration,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String id = SystemAuthority.systemId(systemId);
        if (ROOT_SYSTEM_ID.equals(id)) throw new IllegalLifecycleTransitionException("SYSTEM_ROOT_IDENTITY_CANNOT_DRAIN");
        String canonical = SystemAuthority.canonicalTuple("BEGIN_DRAIN", id, Long.toString(expectedGeneration));
        return commit(MutationAction.BEGIN_DRAIN, operationId, canonical, id, "SYSTEM_DRAIN_STARTED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, id);
            requireGeneration(prior, expectedGeneration);
            if (prior.lifecycle() != Lifecycle.ADMITTED) {
                throw new IllegalLifecycleTransitionException("DRAIN_REQUIRES_ADMITTED:" + id + ":" + prior.lifecycle());
            }
            state.systems.put(id, new SystemAuthority.Record(
                    prior.descriptor(), Lifecycle.DRAINING, prior.generation() + 1, prior.currentVersion(), prior.admissionBasis(),
                    prior.declaredAt(), state.now, null));
            return id + "@draining";
        });
    }

    public MutationResult resumeFromDrain(
            String systemId,
            long expectedGeneration,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String id = SystemAuthority.systemId(systemId);
        String canonical = SystemAuthority.canonicalTuple("RESUME_DRAIN", id, Long.toString(expectedGeneration));
        return commit(MutationAction.RESUME_DRAIN, operationId, canonical, id, "SYSTEM_DRAIN_CANCELLED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, id);
            requireGeneration(prior, expectedGeneration);
            if (prior.lifecycle() != Lifecycle.DRAINING) {
                throw new IllegalLifecycleTransitionException("RESUME_REQUIRES_DRAINING:" + id + ":" + prior.lifecycle());
            }
            if (!admissionVerifier.admissible(new AdmissionRequest(
                    id, prior.descriptor(), prior.currentVersion(), prior.admissionBasis(), actorRef, decisionRef, false, state.base))) {
                throw new AdmissionVerificationException("SYSTEM_RESUME_ADMISSION_REJECTED:" + id);
            }
            state.systems.put(id, new SystemAuthority.Record(
                    prior.descriptor(), Lifecycle.ADMITTED, prior.generation() + 1, prior.currentVersion(), prior.admissionBasis(),
                    prior.declaredAt(), state.now, null));
            return id + "@admitted";
        });
    }

    public MutationResult retire(
            String systemId,
            long expectedGeneration,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String id = SystemAuthority.systemId(systemId);
        if (ROOT_SYSTEM_ID.equals(id)) throw new IllegalLifecycleTransitionException("SYSTEM_ROOT_IDENTITY_CANNOT_RETIRE");
        String canonical = SystemAuthority.canonicalTuple("RETIRE", id, Long.toString(expectedGeneration));
        return commit(MutationAction.RETIRE_SYSTEM, operationId, canonical, id, "SYSTEM_RETIRED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, id);
            requireGeneration(prior, expectedGeneration);
            if (prior.lifecycle() != Lifecycle.DRAINING) {
                throw new IllegalLifecycleTransitionException("RETIRE_REQUIRES_DRAINING:" + id + ":" + prior.lifecycle());
            }
            state.systems.put(id, new SystemAuthority.Record(
                    prior.descriptor(), Lifecycle.RETIRED, prior.generation() + 1, prior.currentVersion(), prior.admissionBasis(),
                    prior.declaredAt(), state.now, null));
            state.topology.removeIf(edge -> edge.fromSystemId().equals(id) || edge.toSystemId().equals(id));
            return id + "@retired";
        });
    }

    /** Atomic ownership handoff. Topology is intentionally not inferred or rewired. */
    public MutationResult replaceAuthority(
            String oldSystemId,
            long expectedOldGeneration,
            Descriptor replacement,
            VersionPointer replacementVersion,
            AdmissionBasis replacementBasis,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        String oldId = SystemAuthority.systemId(oldSystemId);
        Objects.requireNonNull(replacement, "replacement");
        Objects.requireNonNull(replacementVersion, "replacementVersion");
        Objects.requireNonNull(replacementBasis, "replacementBasis");
        if (ROOT_SYSTEM_ID.equals(oldId)) throw new IllegalLifecycleTransitionException("SYSTEM_ROOT_IDENTITY_CANNOT_BE_REPLACED");
        String canonical = SystemAuthority.canonicalTuple("REPLACE", oldId, Long.toString(expectedOldGeneration),
                replacement.canonical(), replacementVersion.canonical(), replacementBasis.canonical());
        return commit(MutationAction.REPLACE_AUTHORITY, operationId, canonical, oldId, "SYSTEM_AUTHORITY_REPLACED", actorRef, decisionRef, state -> {
            SystemAuthority.Record prior = requireSystem(state, oldId);
            requireGeneration(prior, expectedOldGeneration);
            if (prior.lifecycle() != Lifecycle.DRAINING) {
                throw new IllegalLifecycleTransitionException("REPLACE_REQUIRES_DRAINING:" + oldId);
            }
            if (state.systems.containsKey(replacement.systemId())) {
                throw new AuthorityConflictException("REPLACEMENT_SYSTEM_ID_EXISTS:" + replacement.systemId());
            }
            assertTruthKeysAvailable(state.systems, replacement, oldId);
            if (!admissionVerifier.admissible(new AdmissionRequest(
                    replacement.systemId(), replacement, replacementVersion, replacementBasis, actorRef, decisionRef, false, state.base))) {
                throw new AdmissionVerificationException("REPLACEMENT_ADMISSION_REJECTED:" + replacement.systemId());
            }
            Instant now = state.now;
            state.systems.put(oldId, new SystemAuthority.Record(
                    prior.descriptor(), Lifecycle.RETIRED, prior.generation() + 1, prior.currentVersion(), prior.admissionBasis(),
                    prior.declaredAt(), now, replacement.systemId()));
            state.systems.put(replacement.systemId(), new SystemAuthority.Record(
                    replacement, Lifecycle.ADMITTED, 1L, replacementVersion, replacementBasis, now, now, null));
            state.versionHistory.put(replacement.systemId(), new ArrayList<>(List.of(replacementVersion)));
            state.topology.removeIf(edge -> edge.fromSystemId().equals(oldId) || edge.toSystemId().equals(oldId));
            return oldId + "->" + replacement.systemId();
        });
    }

    public MutationResult putTopologyEdge(
            TopologyEdge edge,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        Objects.requireNonNull(edge, "edge");
        String canonical = SystemAuthority.canonicalTuple("PUT_EDGE", edge.canonical());
        return commit(MutationAction.PUT_TOPOLOGY_EDGE, operationId, canonical, edge.fromSystemId(), "TOPOLOGY_EDGE_PUT", actorRef, decisionRef, state -> {
            SystemAuthority.Record from = requireSystem(state, edge.fromSystemId());
            SystemAuthority.Record to = requireSystem(state, edge.toSystemId());
            if (from.lifecycle() == Lifecycle.RETIRED || to.lifecycle() == Lifecycle.RETIRED) {
                throw new AuthorityConflictException("TOPOLOGY_ENDPOINT_RETIRED");
            }
            if (!state.topology.add(edge)) throw new AuthorityConflictException("TOPOLOGY_EDGE_ALREADY_EXISTS");
            return edge.fromSystemId() + "->" + edge.toSystemId();
        });
    }

    public MutationResult removeTopologyEdge(
            TopologyEdge edge,
            String actorRef,
            String decisionRef,
            String operationId) throws IOException {
        Objects.requireNonNull(edge, "edge");
        String canonical = SystemAuthority.canonicalTuple("REMOVE_EDGE", edge.canonical());
        return commit(MutationAction.REMOVE_TOPOLOGY_EDGE, operationId, canonical, edge.fromSystemId(), "TOPOLOGY_EDGE_REMOVED", actorRef, decisionRef, state -> {
            if (!state.topology.remove(edge)) throw new NoSuchElementException("UNKNOWN_TOPOLOGY_EDGE");
            return edge.fromSystemId() + "-x->" + edge.toSystemId();
        });
    }

    public String snapshotDigest() throws IOException {
        RootSnapshot snapshot = snapshot();
        return FileSystemRootStore.sha256Bytes(FileSystemRootStore.serialize(snapshot));
    }

    @FunctionalInterface
    private interface Mutation {
        String apply(MutableState state) throws IOException;
    }

    private MutationResult commit(
            MutationAction action,
            String operationId,
            String requestCanonical,
            String systemId,
            String eventType,
            String actorRef,
            String decisionRef,
            Mutation mutation) throws IOException {
        Objects.requireNonNull(action, "action");
        String opId = SystemAuthority.operationId(operationId);
        String actor = SystemAuthority.text(actorRef, "actorRef");
        String decision = SystemAuthority.text(decisionRef, "decisionRef");
        String requestDigest = digest(SystemAuthority.canonicalTuple(
                "AUTHORIZED_REQUEST", requestCanonical, actor, decision));

        for (int attempt = 0; attempt < 4; attempt++) {
            RootSnapshot base = store.load();
            validateSnapshot(base);
            OperationReceipt existing = base.operationReceipts().get(opId);
            if (existing != null) {
                if (!existing.requestDigest().equals(requestDigest)) {
                    throw new OperationIdConflictException("OPERATION_ID_REUSED_WITH_DIFFERENT_REQUEST:" + opId);
                }
                return new MutationResult(base, existing, true);
            }
            if (!mutationAuthorizer.authorized(new MutationContext(
                    action, systemId, actor, decision, requestCanonical, requestDigest, base))) {
                throw new MutationAuthorizationException("MUTATION_NOT_AUTHORIZED:" + action + ":" + systemId);
            }
            Instant now = clock.instant();
            if (!base.events().isEmpty() && now.isBefore(base.events().get(base.events().size() - 1).occurredAt())) {
                throw new AuthorityConflictException("CLOCK_REGRESSION");
            }

            MutableState state = new MutableState(base, now);
            String resultRef = mutation.apply(state);
            if (base.storeRevision() == Long.MAX_VALUE) throw new AuthorityConflictException("ROOT_STORE_REVISION_EXHAUSTED");
            long newRevision = base.storeRevision() + 1;
            long eventSequence = base.events().size() + 1L;
            Event event = new Event(eventSequence, UUID.randomUUID().toString(), opId, systemId, eventType,
                    actor, decision, now, requestDigest);
            state.events.add(event);
            OperationReceipt receipt = new OperationReceipt(opId, requestDigest, newRevision, eventSequence, resultRef);
            state.operationReceipts.put(opId, receipt);
            RootSnapshot next = state.toSnapshot(newRevision);
            validateSnapshot(next);
            try {
                store.save(base.storeRevision(), next);
                return new MutationResult(next, receipt, false);
            } catch (SystemRootStore.StaleStoreRevisionException stale) {
                if (attempt == 3) throw stale;
            }
        }
        throw new IllegalStateException("unreachable");
    }

    private static SystemAuthority.Record requireSystem(MutableState state, String systemId) {
        SystemAuthority.Record record = state.systems.get(systemId);
        if (record == null) throw new NoSuchElementException("UNKNOWN_SYSTEM:" + systemId);
        return record;
    }

    private static void requireGeneration(SystemAuthority.Record record, long expectedGeneration) {
        if (record.generation() != expectedGeneration) {
            throw new StaleAuthorityGenerationException("STALE_AUTHORITY_GENERATION expected=" + expectedGeneration
                    + " actual=" + record.generation() + " system=" + record.descriptor().systemId());
        }
    }

    private static void assertTruthKeysAvailable(
            Map<String, SystemAuthority.Record> systems,
            Descriptor candidate,
            String allowedOverlapSystemId) {
        for (SystemAuthority.Record existing : systems.values()) {
            if (existing.lifecycle() == Lifecycle.RETIRED) continue;
            String existingId = existing.descriptor().systemId();
            if (existingId.equals(candidate.systemId())) continue;
            if (allowedOverlapSystemId != null && existingId.equals(allowedOverlapSystemId)) continue;
            Set<String> overlap = new TreeSet<>(existing.descriptor().ownedTruthKeys());
            overlap.retainAll(candidate.ownedTruthKeys());
            if (!overlap.isEmpty()) {
                throw new AuthorityConflictException("TRUTH_OWNER_COLLISION:" + overlap + ":" + existingId
                        + ":" + candidate.systemId());
            }
        }
    }

    public static void validateSnapshot(RootSnapshot snapshot) {
        Objects.requireNonNull(snapshot, "snapshot");
        if (snapshot.events().size() != snapshot.storeRevision()) {
            throw new AuthorityConflictException("EVENT_REVISION_MISMATCH events=" + snapshot.events().size()
                    + " revision=" + snapshot.storeRevision());
        }
        long expectedSequence = 1L;
        for (Event event : snapshot.events()) {
            if (event.sequence() != expectedSequence++) throw new AuthorityConflictException("EVENT_SEQUENCE_GAP");
            OperationReceipt receipt = snapshot.operationReceipts().get(event.operationId());
            if (receipt == null || receipt.eventSequence() != event.sequence()) {
                throw new AuthorityConflictException("EVENT_RECEIPT_LINK_MISSING:" + event.operationId());
            }
        }
        if (snapshot.operationReceipts().size() != snapshot.events().size()) {
            throw new AuthorityConflictException("OPERATION_EVENT_COUNT_MISMATCH");
        }

        Map<String, String> truthOwners = new TreeMap<>();
        for (var entry : snapshot.systems().entrySet()) {
            String id = entry.getKey();
            SystemAuthority.Record record = entry.getValue();
            if (!id.equals(record.descriptor().systemId())) throw new AuthorityConflictException("SYSTEM_MAP_KEY_MISMATCH:" + id);
            List<VersionPointer> history = snapshot.versionHistory().getOrDefault(id, List.of());
            if (record.currentVersion() != null && (history.isEmpty() || !history.get(history.size() - 1).equals(record.currentVersion()))) {
                throw new AuthorityConflictException("CURRENT_VERSION_NOT_HISTORY_TAIL:" + id);
            }
            if (record.lifecycle() == Lifecycle.DECLARED && record.admissionBasis() != null) {
                throw new AuthorityConflictException("DECLARED_HAS_ADMISSION_BASIS:" + id);
            }
            if ((record.lifecycle() == Lifecycle.ADMITTED || record.lifecycle() == Lifecycle.DRAINING)
                    && record.currentVersion() == null) {
                throw new AuthorityConflictException("ACTIVE_SYSTEM_WITHOUT_VERSION:" + id);
            }
            if (record.lifecycle() != Lifecycle.RETIRED) {
                for (String truth : record.descriptor().ownedTruthKeys()) {
                    String prior = truthOwners.putIfAbsent(truth, id);
                    if (prior != null && !prior.equals(id)) {
                        throw new AuthorityConflictException("TRUTH_OWNER_COLLISION:" + truth + ":" + prior + ":" + id);
                    }
                }
            }
        }
        for (String id : snapshot.versionHistory().keySet()) {
            if (!snapshot.systems().containsKey(id)) throw new AuthorityConflictException("ORPHAN_VERSION_HISTORY:" + id);
        }
        for (TopologyEdge edge : snapshot.topology()) {
            SystemAuthority.Record from = snapshot.systems().get(edge.fromSystemId());
            SystemAuthority.Record to = snapshot.systems().get(edge.toSystemId());
            if (from == null || to == null) throw new AuthorityConflictException("TOPOLOGY_UNKNOWN_ENDPOINT:" + edge.canonical());
            if (from.lifecycle() == Lifecycle.RETIRED || to.lifecycle() == Lifecycle.RETIRED) {
                throw new AuthorityConflictException("TOPOLOGY_RETIRED_ENDPOINT:" + edge.canonical());
            }
        }
        if (!snapshot.systems().isEmpty()) {
            SystemAuthority.Record root = snapshot.systems().get(ROOT_SYSTEM_ID);
            if (root == null) throw new AuthorityConflictException("SYSTEM_ROOT_MISSING");
            if (root.lifecycle() != Lifecycle.ADMITTED) throw new AuthorityConflictException("SYSTEM_ROOT_NOT_ADMITTED");
        }
    }

    private static String digest(String canonical) {
        return FileSystemRootStore.sha256Bytes(canonical.getBytes(StandardCharsets.UTF_8));
    }

    private static final class MutableState {
        final RootSnapshot base;
        final Instant now;
        final Map<String, SystemAuthority.Record> systems;
        final Set<TopologyEdge> topology;
        final Map<String, List<VersionPointer>> versionHistory;
        final Map<String, OperationReceipt> operationReceipts;
        final List<Event> events;

        MutableState(RootSnapshot base, Instant now) {
            this.base = base;
            this.now = now;
            this.systems = new LinkedHashMap<>(base.systems());
            this.topology = new LinkedHashSet<>(base.topology());
            this.versionHistory = new LinkedHashMap<>();
            base.versionHistory().forEach((key, value) -> this.versionHistory.put(key, new ArrayList<>(value)));
            this.operationReceipts = new LinkedHashMap<>(base.operationReceipts());
            this.events = new ArrayList<>(base.events());
        }

        RootSnapshot toSnapshot(long revision) {
            return new RootSnapshot(revision, systems, topology, versionHistory, operationReceipts, events);
        }
    }
}
