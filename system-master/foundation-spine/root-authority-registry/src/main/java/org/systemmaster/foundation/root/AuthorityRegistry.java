package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class AuthorityRegistry {
    public record MutationResult(long revision, boolean changed, ChangeEvent event, String snapshotDigest) {}

    private final AuthorityRegistryStore store;
    private RegistrySnapshot snapshot;

    private AuthorityRegistry(AuthorityRegistryStore store, RegistrySnapshot snapshot) {
        this.store = Objects.requireNonNull(store, "store");
        this.snapshot = Objects.requireNonNull(snapshot, "snapshot");
    }

    public static AuthorityRegistry initialize(
            AuthorityRegistryStore store,
            BootstrapDefinition definition,
            MutationMetadata metadata) throws IOException {
        Objects.requireNonNull(store, "store");
        Objects.requireNonNull(definition, "definition");
        Objects.requireNonNull(metadata, "metadata");
        if (store.load().isPresent()) throw new IllegalStateException("ROOT_REGISTRY_ALREADY_INITIALIZED");
        String fingerprint = fingerprintBootstrap(definition);
        ChangeEvent event = event(1, metadata, fingerprint, Operation.BOOTSTRAP, SubjectType.PRODUCT_ROOT,
                definition.productRoot().productId());
        RegistrySnapshot initial = RegistrySnapshot.bootstrap(definition, event);
        store.save(0, initial);
        return new AuthorityRegistry(store, initial);
    }

    public static AuthorityRegistry open(AuthorityRegistryStore store) throws IOException {
        Objects.requireNonNull(store, "store");
        RegistrySnapshot loaded = store.load().orElseThrow(() -> new IllegalStateException("ROOT_REGISTRY_NOT_INITIALIZED"));
        return new AuthorityRegistry(store, loaded);
    }

    public synchronized RegistrySnapshot snapshot() {
        return snapshot;
    }

    public synchronized String snapshotDigest() {
        return RegistrySnapshotCodec.digestHex(snapshot);
    }

    public synchronized MutationResult updateProductRootVersion(
            long expectedRevision,
            String expectedCurrentVersion,
            String newVersion,
            MutationMetadata metadata) throws IOException {
        String next = required(newVersion, "newVersion");
        String fingerprint = fingerprint(Operation.UPDATE_PRODUCT_ROOT_VERSION, snapshot.productRoot().productId(),
                required(expectedCurrentVersion, "expectedCurrentVersion"), next);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        if (!snapshot.productRoot().versionPointer().equals(expectedCurrentVersion)) {
            fail("PRODUCT_ROOT_VERSION_PRECONDITION_FAILED");
        }
        if (next.equals(expectedCurrentVersion)) fail("NO_VERSION_CHANGE");
        long revision = snapshot.revision() + 1;
        ProductRoot root = new ProductRoot(snapshot.productRoot().productId(), snapshot.productRoot().canonicalName(), next);
        return commit(revision, root, snapshot.systems(), snapshot.authorities(), snapshot.integrationEdges(), metadata,
                fingerprint, Operation.UPDATE_PRODUCT_ROOT_VERSION, SubjectType.PRODUCT_ROOT, root.productId());
    }

    public synchronized MutationResult admitSystem(
            long expectedRevision,
            String systemId,
            String canonicalName,
            String classification,
            String parentId,
            String versionPointer,
            String controlRef,
            MutationMetadata metadata) throws IOException {
        systemId = RegistryModels.identifier(systemId, "systemId");
        canonicalName = required(canonicalName, "canonicalName");
        classification = required(classification, "classification");
        parentId = RegistryModels.identifier(parentId, "parentId");
        versionPointer = required(versionPointer, "versionPointer");
        controlRef = required(controlRef, "controlRef");
        String fingerprint = fingerprint(Operation.ADMIT_SYSTEM, systemId, canonicalName, classification, parentId, versionPointer, controlRef);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        if (snapshot.systems().size() >= RegistrySnapshot.MAX_SYSTEMS) fail("SYSTEM_LIMIT_EXCEEDED:" + snapshot.systems().size());
        SystemRecord existing = snapshot.systems().get(systemId);
        if (existing != null) {
            if (existing.lifecycle() == Lifecycle.RETIRED_TERMINAL) fail("TERMINAL_SYSTEM_ID_REUSE_FORBIDDEN:" + systemId);
            fail("SYSTEM_ID_ALREADY_EXISTS:" + systemId);
        }
        if (systemId.equals(snapshot.productRoot().productId())) fail("SYSTEM_ID_COLLIDES_WITH_PRODUCT_ROOT:" + systemId);
        String ownerPath = ownerPathFor(parentId, systemId);
        requireDepthWithinLimit(parentId, systemId);
        long revision = snapshot.revision() + 1;
        SystemRecord record = new SystemRecord(systemId, canonicalName, classification, parentId, ownerPath,
                versionPointer, controlRef, Lifecycle.ACTIVE, revision, null);
        Map<String, SystemRecord> systems = copy(snapshot.systems());
        systems.put(systemId, record);
        return commit(revision, snapshot.productRoot(), systems, snapshot.authorities(), snapshot.integrationEdges(), metadata,
                fingerprint, Operation.ADMIT_SYSTEM, SubjectType.SYSTEM, systemId);
    }

    public synchronized MutationResult updateSystemVersion(
            long expectedRevision,
            String systemId,
            String expectedCurrentVersion,
            String newVersion,
            MutationMetadata metadata) throws IOException {
        systemId = RegistryModels.identifier(systemId, "systemId");
        expectedCurrentVersion = required(expectedCurrentVersion, "expectedCurrentVersion");
        newVersion = required(newVersion, "newVersion");
        String fingerprint = fingerprint(Operation.UPDATE_SYSTEM_VERSION, systemId, expectedCurrentVersion, newVersion);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        SystemRecord current = requireActiveSystem(systemId);
        if (!current.versionPointer().equals(expectedCurrentVersion)) fail("SYSTEM_VERSION_PRECONDITION_FAILED:" + systemId);
        if (expectedCurrentVersion.equals(newVersion)) fail("NO_VERSION_CHANGE");
        long revision = snapshot.revision() + 1;
        Map<String, SystemRecord> systems = copy(snapshot.systems());
        systems.put(systemId, current.withVersion(newVersion));
        return commit(revision, snapshot.productRoot(), systems, snapshot.authorities(), snapshot.integrationEdges(), metadata,
                fingerprint, Operation.UPDATE_SYSTEM_VERSION, SubjectType.SYSTEM, systemId);
    }

    public synchronized MutationResult retireSystem(
            long expectedRevision,
            String systemId,
            MutationMetadata metadata) throws IOException {
        systemId = RegistryModels.identifier(systemId, "systemId");
        String fingerprint = fingerprint(Operation.RETIRE_SYSTEM, systemId);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        SystemRecord current = requireActiveSystem(systemId);
        for (SystemRecord child : snapshot.systems().values()) {
            if (child.lifecycle() == Lifecycle.ACTIVE && child.parentId().equals(systemId)) fail("SYSTEM_RETIREMENT_BLOCKED_ACTIVE_CHILD:" + child.systemId());
        }
        for (AuthorityRecord authority : snapshot.authorities().values()) {
            if (authority.lifecycle() == Lifecycle.ACTIVE && authority.ownerSystemId().equals(systemId)) fail("SYSTEM_RETIREMENT_BLOCKED_ACTIVE_AUTHORITY:" + authority.authorityId());
        }
        for (IntegrationEdge edge : snapshot.integrationEdges().values()) {
            if (edge.lifecycle() == Lifecycle.ACTIVE &&
                    (edge.producerSystemId().equals(systemId) || edge.consumerSystemId().equals(systemId))) {
                fail("SYSTEM_RETIREMENT_BLOCKED_ACTIVE_INTEGRATION_EDGE:" + edge.edgeId());
            }
        }
        long revision = snapshot.revision() + 1;
        Map<String, SystemRecord> systems = copy(snapshot.systems());
        systems.put(systemId, current.retired(revision));
        return commit(revision, snapshot.productRoot(), systems, snapshot.authorities(), snapshot.integrationEdges(), metadata,
                fingerprint, Operation.RETIRE_SYSTEM, SubjectType.SYSTEM, systemId);
    }

    public synchronized MutationResult admitAuthority(
            long expectedRevision,
            String authorityId,
            String canonicalName,
            String ownerSystemId,
            String versionPointer,
            MutationMetadata metadata) throws IOException {
        authorityId = RegistryModels.identifier(authorityId, "authorityId");
        canonicalName = required(canonicalName, "canonicalName");
        ownerSystemId = RegistryModels.identifier(ownerSystemId, "ownerSystemId");
        versionPointer = required(versionPointer, "versionPointer");
        String fingerprint = fingerprint(Operation.ADMIT_AUTHORITY, authorityId, canonicalName, ownerSystemId, versionPointer);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        if (snapshot.authorities().size() >= RegistrySnapshot.MAX_AUTHORITIES) fail("AUTHORITY_LIMIT_EXCEEDED:" + snapshot.authorities().size());
        AuthorityRecord existing = snapshot.authorities().get(authorityId);
        if (existing != null) {
            if (existing.lifecycle() == Lifecycle.RETIRED_TERMINAL) fail("TERMINAL_AUTHORITY_ID_REUSE_FORBIDDEN:" + authorityId);
            fail("AUTHORITY_ID_ALREADY_EXISTS:" + authorityId);
        }
        requireActiveSystem(ownerSystemId);
        long revision = snapshot.revision() + 1;
        Map<String, AuthorityRecord> authorities = copy(snapshot.authorities());
        authorities.put(authorityId, new AuthorityRecord(authorityId, canonicalName, ownerSystemId, versionPointer,
                Lifecycle.ACTIVE, revision, null));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), authorities, snapshot.integrationEdges(), metadata,
                fingerprint, Operation.ADMIT_AUTHORITY, SubjectType.AUTHORITY, authorityId);
    }

    public synchronized MutationResult reassignAuthority(
            long expectedRevision,
            String authorityId,
            String expectedOwnerSystemId,
            String newOwnerSystemId,
            MutationMetadata metadata) throws IOException {
        authorityId = RegistryModels.identifier(authorityId, "authorityId");
        expectedOwnerSystemId = RegistryModels.identifier(expectedOwnerSystemId, "expectedOwnerSystemId");
        newOwnerSystemId = RegistryModels.identifier(newOwnerSystemId, "newOwnerSystemId");
        String fingerprint = fingerprint(Operation.REASSIGN_AUTHORITY, authorityId, expectedOwnerSystemId, newOwnerSystemId);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        AuthorityRecord current = requireActiveAuthority(authorityId);
        if (!current.ownerSystemId().equals(expectedOwnerSystemId)) fail("AUTHORITY_OWNER_PRECONDITION_FAILED:" + authorityId);
        if (expectedOwnerSystemId.equals(newOwnerSystemId)) fail("NO_OWNER_CHANGE");
        requireActiveSystem(newOwnerSystemId);
        long revision = snapshot.revision() + 1;
        Map<String, AuthorityRecord> authorities = copy(snapshot.authorities());
        authorities.put(authorityId, current.reassign(newOwnerSystemId));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), authorities, snapshot.integrationEdges(), metadata,
                fingerprint, Operation.REASSIGN_AUTHORITY, SubjectType.AUTHORITY, authorityId);
    }

    public synchronized MutationResult updateAuthorityVersion(
            long expectedRevision,
            String authorityId,
            String expectedCurrentVersion,
            String newVersion,
            MutationMetadata metadata) throws IOException {
        authorityId = RegistryModels.identifier(authorityId, "authorityId");
        expectedCurrentVersion = required(expectedCurrentVersion, "expectedCurrentVersion");
        newVersion = required(newVersion, "newVersion");
        String fingerprint = fingerprint(Operation.UPDATE_AUTHORITY_VERSION, authorityId, expectedCurrentVersion, newVersion);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        AuthorityRecord current = requireActiveAuthority(authorityId);
        if (!current.versionPointer().equals(expectedCurrentVersion)) fail("AUTHORITY_VERSION_PRECONDITION_FAILED:" + authorityId);
        if (expectedCurrentVersion.equals(newVersion)) fail("NO_VERSION_CHANGE");
        long revision = snapshot.revision() + 1;
        Map<String, AuthorityRecord> authorities = copy(snapshot.authorities());
        authorities.put(authorityId, current.withVersion(newVersion));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), authorities, snapshot.integrationEdges(), metadata,
                fingerprint, Operation.UPDATE_AUTHORITY_VERSION, SubjectType.AUTHORITY, authorityId);
    }

    public synchronized MutationResult retireAuthority(
            long expectedRevision,
            String authorityId,
            MutationMetadata metadata) throws IOException {
        authorityId = RegistryModels.identifier(authorityId, "authorityId");
        String fingerprint = fingerprint(Operation.RETIRE_AUTHORITY, authorityId);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        AuthorityRecord current = requireActiveAuthority(authorityId);
        long revision = snapshot.revision() + 1;
        Map<String, AuthorityRecord> authorities = copy(snapshot.authorities());
        authorities.put(authorityId, current.retired(revision));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), authorities, snapshot.integrationEdges(), metadata,
                fingerprint, Operation.RETIRE_AUTHORITY, SubjectType.AUTHORITY, authorityId);
    }

    public synchronized MutationResult registerIntegrationEdge(
            long expectedRevision,
            String edgeId,
            String producerSystemId,
            String consumerSystemId,
            String interfaceRef,
            MutationMetadata metadata) throws IOException {
        edgeId = RegistryModels.identifier(edgeId, "edgeId");
        producerSystemId = RegistryModels.identifier(producerSystemId, "producerSystemId");
        consumerSystemId = RegistryModels.identifier(consumerSystemId, "consumerSystemId");
        interfaceRef = required(interfaceRef, "interfaceRef");
        String fingerprint = fingerprint(Operation.REGISTER_INTEGRATION_EDGE, edgeId, producerSystemId, consumerSystemId, interfaceRef);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        if (snapshot.integrationEdges().size() >= RegistrySnapshot.MAX_INTEGRATION_EDGES) fail("INTEGRATION_EDGE_LIMIT_EXCEEDED:" + snapshot.integrationEdges().size());
        IntegrationEdge existing = snapshot.integrationEdges().get(edgeId);
        if (existing != null) {
            if (existing.lifecycle() == Lifecycle.RETIRED_TERMINAL) fail("TERMINAL_INTEGRATION_EDGE_ID_REUSE_FORBIDDEN:" + edgeId);
            fail("INTEGRATION_EDGE_ID_ALREADY_EXISTS:" + edgeId);
        }
        requireActiveSystem(producerSystemId);
        requireActiveSystem(consumerSystemId);
        if (producerSystemId.equals(consumerSystemId)) fail("INTEGRATION_EDGE_SELF_REFERENCE:" + edgeId);
        long revision = snapshot.revision() + 1;
        Map<String, IntegrationEdge> edges = copy(snapshot.integrationEdges());
        edges.put(edgeId, new IntegrationEdge(edgeId, producerSystemId, consumerSystemId, interfaceRef,
                Lifecycle.ACTIVE, revision, null));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), snapshot.authorities(), edges, metadata,
                fingerprint, Operation.REGISTER_INTEGRATION_EDGE, SubjectType.INTEGRATION_EDGE, edgeId);
    }

    public synchronized MutationResult updateIntegrationEdge(
            long expectedRevision,
            String edgeId,
            String expectedInterfaceRef,
            String newInterfaceRef,
            MutationMetadata metadata) throws IOException {
        edgeId = RegistryModels.identifier(edgeId, "edgeId");
        expectedInterfaceRef = required(expectedInterfaceRef, "expectedInterfaceRef");
        newInterfaceRef = required(newInterfaceRef, "newInterfaceRef");
        String fingerprint = fingerprint(Operation.UPDATE_INTEGRATION_EDGE, edgeId, expectedInterfaceRef, newInterfaceRef);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        IntegrationEdge current = requireActiveEdge(edgeId);
        if (!current.interfaceRef().equals(expectedInterfaceRef)) fail("INTEGRATION_EDGE_VERSION_PRECONDITION_FAILED:" + edgeId);
        if (expectedInterfaceRef.equals(newInterfaceRef)) fail("NO_INTERFACE_CHANGE");
        long revision = snapshot.revision() + 1;
        Map<String, IntegrationEdge> edges = copy(snapshot.integrationEdges());
        edges.put(edgeId, current.withInterfaceRef(newInterfaceRef));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), snapshot.authorities(), edges, metadata,
                fingerprint, Operation.UPDATE_INTEGRATION_EDGE, SubjectType.INTEGRATION_EDGE, edgeId);
    }

    public synchronized MutationResult retireIntegrationEdge(
            long expectedRevision,
            String edgeId,
            MutationMetadata metadata) throws IOException {
        edgeId = RegistryModels.identifier(edgeId, "edgeId");
        String fingerprint = fingerprint(Operation.RETIRE_INTEGRATION_EDGE, edgeId);
        MutationResult replay = replayIfPresent(metadata, fingerprint);
        if (replay != null) return replay;
        requireRevision(expectedRevision);
        IntegrationEdge current = requireActiveEdge(edgeId);
        long revision = snapshot.revision() + 1;
        Map<String, IntegrationEdge> edges = copy(snapshot.integrationEdges());
        edges.put(edgeId, current.retired(revision));
        return commit(revision, snapshot.productRoot(), snapshot.systems(), snapshot.authorities(), edges, metadata,
                fingerprint, Operation.RETIRE_INTEGRATION_EDGE, SubjectType.INTEGRATION_EDGE, edgeId);
    }

    private MutationResult commit(
            long revision,
            ProductRoot root,
            Map<String, SystemRecord> systems,
            Map<String, AuthorityRecord> authorities,
            Map<String, IntegrationEdge> edges,
            MutationMetadata metadata,
            String fingerprint,
            Operation operation,
            SubjectType subjectType,
            String subjectId) throws IOException {
        ChangeEvent event = event(revision, metadata, fingerprint, operation, subjectType, subjectId);
        RegistrySnapshot next = snapshot.with(revision, root, systems, authorities, edges, event);
        store.save(snapshot.revision(), next);
        snapshot = next;
        return new MutationResult(revision, true, event, RegistrySnapshotCodec.digestHex(next));
    }

    private MutationResult replayIfPresent(MutationMetadata metadata, String fingerprint) {
        Objects.requireNonNull(metadata, "metadata");
        return snapshot.eventForCommand(metadata.commandId()).map(existing -> {
            if (!existing.commandFingerprint().equals(fingerprint)) {
                throw new IllegalStateException("COMMAND_ID_REUSE_CONFLICT:" + metadata.commandId());
            }
            return new MutationResult(snapshot.revision(), false, existing, RegistrySnapshotCodec.digestHex(snapshot));
        }).orElse(null);
    }

    private void requireRevision(long expectedRevision) {
        if (expectedRevision != snapshot.revision()) {
            fail("ROOT_REGISTRY_STALE_REVISION:expected=" + expectedRevision + ":actual=" + snapshot.revision());
        }
    }

    private SystemRecord requireActiveSystem(String systemId) {
        SystemRecord system = snapshot.systems().get(systemId);
        if (system == null) fail("UNKNOWN_SYSTEM:" + systemId);
        if (system.lifecycle() != Lifecycle.ACTIVE) fail("SYSTEM_NOT_ACTIVE:" + systemId);
        return system;
    }

    private AuthorityRecord requireActiveAuthority(String authorityId) {
        AuthorityRecord authority = snapshot.authorities().get(authorityId);
        if (authority == null) fail("UNKNOWN_AUTHORITY:" + authorityId);
        if (authority.lifecycle() != Lifecycle.ACTIVE) fail("AUTHORITY_NOT_ACTIVE:" + authorityId);
        return authority;
    }

    private IntegrationEdge requireActiveEdge(String edgeId) {
        IntegrationEdge edge = snapshot.integrationEdges().get(edgeId);
        if (edge == null) fail("UNKNOWN_INTEGRATION_EDGE:" + edgeId);
        if (edge.lifecycle() != Lifecycle.ACTIVE) fail("INTEGRATION_EDGE_NOT_ACTIVE:" + edgeId);
        return edge;
    }

    private void requireDepthWithinLimit(String parentId, String systemId) {
        int depth = 1;
        String cursor = parentId;
        while (!cursor.equals(snapshot.productRoot().productId())) {
            SystemRecord parent = snapshot.systems().get(cursor);
            if (parent == null) fail("UNKNOWN_SYSTEM:" + cursor);
            depth++;
            if (depth > RegistrySnapshot.MAX_HIERARCHY_DEPTH) fail("TOPOLOGY_DEPTH_LIMIT_EXCEEDED:" + systemId);
            cursor = parent.parentId();
        }
    }

    private String ownerPathFor(String parentId, String systemId) {
        if (parentId.equals(snapshot.productRoot().productId())) return snapshot.productRoot().productId() + "/" + systemId;
        SystemRecord parent = requireActiveSystem(parentId);
        return parent.ownerPath() + "/" + systemId;
    }

    private static ChangeEvent event(
            long revision,
            MutationMetadata metadata,
            String fingerprint,
            Operation operation,
            SubjectType subjectType,
            String subjectId) {
        return new ChangeEvent(revision, metadata.commandId(), fingerprint, operation, subjectType, subjectId,
                metadata.decisionRef(), metadata.actorRef(), metadata.reason(), metadata.occurredAt());
    }

    private static String fingerprintBootstrap(BootstrapDefinition definition) {
        List<String> fields = new ArrayList<>();
        fields.add(definition.productRoot().productId());
        fields.add(definition.productRoot().canonicalName());
        fields.add(definition.productRoot().versionPointer());
        definition.systems().stream().sorted(java.util.Comparator.comparing(BootstrapSystem::systemId)).forEach(s -> {
            fields.add("S"); fields.add(s.systemId()); fields.add(s.canonicalName()); fields.add(s.classification());
            fields.add(s.parentId()); fields.add(s.versionPointer()); fields.add(s.controlRef()); fields.add(s.lifecycle().name());
        });
        definition.authorities().stream().sorted(java.util.Comparator.comparing(BootstrapAuthority::authorityId)).forEach(a -> {
            fields.add("A"); fields.add(a.authorityId()); fields.add(a.canonicalName()); fields.add(a.ownerSystemId()); fields.add(a.versionPointer()); fields.add(a.lifecycle().name());
        });
        definition.integrationEdges().stream().sorted(java.util.Comparator.comparing(BootstrapEdge::edgeId)).forEach(e -> {
            fields.add("E"); fields.add(e.edgeId()); fields.add(e.producerSystemId()); fields.add(e.consumerSystemId()); fields.add(e.interfaceRef()); fields.add(e.lifecycle().name());
        });
        return fingerprint(Operation.BOOTSTRAP, fields.toArray(String[]::new));
    }

    private static String fingerprint(Operation operation, String... fields) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            update(digest, operation.name());
            for (String field : fields) update(digest, field);
            byte[] bytes = digest.digest();
            StringBuilder hex = new StringBuilder(64);
            for (byte b : bytes) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void update(MessageDigest digest, String value) {
        byte[] bytes = required(value, "fingerprintField").getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(4).putInt(bytes.length).array());
        digest.update(bytes);
    }

    private static <K, V> Map<K, V> copy(Map<K, V> source) {
        return new LinkedHashMap<>(source);
    }

    private static String required(String value, String field) {
        return RegistryModels.required(value, field);
    }

    private static void fail(String code) {
        throw new IllegalStateException(code);
    }
}
