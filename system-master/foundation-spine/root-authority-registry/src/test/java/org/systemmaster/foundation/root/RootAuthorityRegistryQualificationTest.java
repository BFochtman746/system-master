package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class RootAuthorityRegistryQualificationTest {
    private static int tests;
    private static int commands;

    public static void main(String[] args) throws Exception {
        testBootstrapCurrentTopologyAndOwnership();
        testBootstrapRejectsCycle();
        testBootstrapRejectsActiveChildOfRetiredParent();
        testBootstrapRejectsAuthorityOwnedByRetiredSystem();
        testIdempotentCommandReplayAndConflict();
        testOptimisticRevisionRejectsStaleWriter();
        testAdmissionAndDerivedOwnerPath();
        testVersionPreconditions();
        testRetirementBlockedByDependenciesThenSucceeds();
        testTerminalRetirementCannotBeReused();
        testAuthorityReassignmentRequiresActiveOwners();
        testIntegrationEdgesRequireActiveDistinctEndpoints();
        testPersistenceSurvivesRestart();
        testCorruptionFailsClosed();
        testTwoRegistryInstancesCannotLostUpdate();
        testDeterministicSnapshotDigestAcrossInputOrder();
        testProductRootVersionIsIndependentOfSystemIdentity();
        testTopologyDepthIsBounded();
        testCanonicalIdentifiersRejectPathInjection();
        testRecentCommandJournalIsBounded();
        System.out.println("PASS RootAuthorityRegistryQualificationTest tests=" + tests + " commands=" + commands);
    }

    private static void testBootstrapCurrentTopologyAndOwnership() throws Exception {
        TestRig rig = rig(currentTopologyDefinition());
        RegistrySnapshot s = rig.registry.snapshot();
        check(s.revision() == 1, "bootstrap revision");
        check(s.productRoot().productId().equals("SYSTEM_MASTER"), "product root");
        check(s.activeSystems().stream().map(SystemRecord::systemId).sorted().toList()
                .equals(List.of("BOOK", "CORE", "DOCUMENTS", "LEARNING")), "active peer set");
        SystemRecord prose = s.system("PROSE").orElseThrow();
        check(prose.lifecycle() == Lifecycle.RETIRED_TERMINAL, "retired Prose baseline preserved");
        check(prose.ownerPath().equals("SYSTEM_MASTER/BOOK/PROSE"), "retired historical owner path preserved");
        check(s.ownerMap().get("CORE").equals("SYSTEM_MASTER/CORE"), "core owner path");
        check(s.ownerMap().get("BOOK").equals("SYSTEM_MASTER/BOOK"), "book owner path");
        check(s.events().size() == 1 && s.events().getFirst().operation() == Operation.BOOTSTRAP, "single migration bootstrap event");
        pass();
    }

    private static void testBootstrapRejectsCycle() throws Exception {
        BootstrapDefinition bad = new BootstrapDefinition(
                root(),
                List.of(
                        sys("A", "A", "B", Lifecycle.ACTIVE),
                        sys("B", "B", "A", Lifecycle.ACTIVE)),
                List.of(), List.of());
        Path dir = Files.createTempDirectory("root-reg-cycle");
        expectCode(() -> initializeUnchecked(dir.resolve("registry.bin"), bad), "BOOTSTRAP_HAS_UNKNOWN_OR_CYCLIC_PARENTS");
        pass();
    }

    private static void testBootstrapRejectsActiveChildOfRetiredParent() throws Exception {
        BootstrapDefinition bad = new BootstrapDefinition(
                root(),
                List.of(
                        sys("PARENT", "Parent", "SYSTEM_MASTER", Lifecycle.RETIRED_TERMINAL),
                        sys("CHILD", "Child", "PARENT", Lifecycle.ACTIVE)),
                List.of(), List.of());
        Path dir = Files.createTempDirectory("root-reg-parent");
        expectCode(() -> initializeUnchecked(dir.resolve("registry.bin"), bad), "ACTIVE_SYSTEM_HAS_INACTIVE_OR_UNKNOWN_PARENT");
        pass();
    }

    private static void testBootstrapRejectsAuthorityOwnedByRetiredSystem() throws Exception {
        BootstrapDefinition bad = new BootstrapDefinition(
                root(),
                List.of(sys("OLD", "Old", "SYSTEM_MASTER", Lifecycle.RETIRED_TERMINAL)),
                List.of(new BootstrapAuthority("AUTH", "Authority", "OLD", "v1", Lifecycle.ACTIVE)),
                List.of());
        Path dir = Files.createTempDirectory("root-reg-auth-owner");
        expectCode(() -> initializeUnchecked(dir.resolve("registry.bin"), bad), "ACTIVE_AUTHORITY_OWNED_BY_RETIRED_SYSTEM");
        pass();
    }

    private static void testIdempotentCommandReplayAndConflict() throws Exception {
        TestRig rig = rig(minimalDefinition());
        MutationMetadata m = meta("cmd-admit-A");
        var first = rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "branch/A", m);
        commands++;
        check(first.changed() && first.revision() == 2, "first mutation changes state");
        var replay = rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "branch/A", m);
        commands++;
        check(!replay.changed() && replay.revision() == 2, "same command replay is idempotent even with original expected revision");
        expectCode(() -> run(() -> rig.registry.admitSystem(2, "B", "System B", "SHARED", "SYSTEM_MASTER", "v1", "branch/B", m)),
                "COMMAND_ID_REUSE_CONFLICT");
        pass();
    }

    private static void testOptimisticRevisionRejectsStaleWriter() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "branch/A", meta("cmd-A"));
        commands++;
        expectCode(() -> run(() -> rig.registry.admitSystem(1, "B", "System B", "SHARED", "SYSTEM_MASTER", "v1", "branch/B", meta("cmd-B"))),
                "ROOT_REGISTRY_STALE_REVISION");
        pass();
    }

    private static void testAdmissionAndDerivedOwnerPath() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "PARENT", "Parent", "SHARED", "SYSTEM_MASTER", "v1", "parent", meta("p")); commands++;
        rig.registry.admitSystem(2, "CHILD", "Child", "CHILD", "PARENT", "v1", "child", meta("c")); commands++;
        check(rig.registry.snapshot().system("CHILD").orElseThrow().ownerPath().equals("SYSTEM_MASTER/PARENT/CHILD"), "nested owner path derived, not caller-controlled");
        expectCode(() -> run(() -> rig.registry.admitSystem(3, "ORPHAN", "Orphan", "CHILD", "MISSING", "v1", "x", meta("orphan"))), "UNKNOWN_SYSTEM:MISSING");
        pass();
    }

    private static void testVersionPreconditions() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        rig.registry.updateSystemVersion(2, "A", "v1", "v2", meta("a-v2")); commands++;
        check(rig.registry.snapshot().system("A").orElseThrow().versionPointer().equals("v2"), "system version updated");
        expectCode(() -> run(() -> rig.registry.updateSystemVersion(3, "A", "v1", "v3", meta("a-v3"))), "SYSTEM_VERSION_PRECONDITION_FAILED:A");
        expectCode(() -> run(() -> rig.registry.updateSystemVersion(3, "A", "v2", "v2", meta("a-noop"))), "NO_VERSION_CHANGE");
        pass();
    }

    private static void testRetirementBlockedByDependenciesThenSucceeds() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        rig.registry.admitSystem(2, "B", "System B", "CHILD", "A", "v1", "b", meta("b")); commands++;
        rig.registry.admitSystem(3, "C", "System C", "SHARED", "SYSTEM_MASTER", "v1", "c", meta("c")); commands++;
        rig.registry.admitAuthority(4, "AUTH-A", "Authority A", "A", "v1", meta("auth-a")); commands++;
        rig.registry.registerIntegrationEdge(5, "EDGE-A-C", "A", "C", "iface:v1", meta("edge")); commands++;
        expectCode(() -> run(() -> rig.registry.retireSystem(6, "A", meta("retire-a-1"))), "SYSTEM_RETIREMENT_BLOCKED_ACTIVE_CHILD:B");
        rig.registry.retireSystem(6, "B", meta("retire-b")); commands++;
        expectCode(() -> run(() -> rig.registry.retireSystem(7, "A", meta("retire-a-2"))), "SYSTEM_RETIREMENT_BLOCKED_ACTIVE_AUTHORITY:AUTH-A");
        rig.registry.retireAuthority(7, "AUTH-A", meta("retire-auth")); commands++;
        expectCode(() -> run(() -> rig.registry.retireSystem(8, "A", meta("retire-a-3"))), "SYSTEM_RETIREMENT_BLOCKED_ACTIVE_INTEGRATION_EDGE:EDGE-A-C");
        rig.registry.retireIntegrationEdge(8, "EDGE-A-C", meta("retire-edge")); commands++;
        rig.registry.retireSystem(9, "A", meta("retire-a-final")); commands++;
        check(rig.registry.snapshot().system("A").orElseThrow().lifecycle() == Lifecycle.RETIRED_TERMINAL, "retirement terminal state");
        pass();
    }

    private static void testTerminalRetirementCannotBeReused() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        rig.registry.retireSystem(2, "A", meta("retire-a")); commands++;
        expectCode(() -> run(() -> rig.registry.admitSystem(3, "A", "New A", "SHARED", "SYSTEM_MASTER", "v9", "new", meta("resurrect"))), "TERMINAL_SYSTEM_ID_REUSE_FORBIDDEN:A");
        pass();
    }

    private static void testAuthorityReassignmentRequiresActiveOwners() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        rig.registry.admitSystem(2, "B", "System B", "SHARED", "SYSTEM_MASTER", "v1", "b", meta("b")); commands++;
        rig.registry.admitAuthority(3, "AUTH", "Canonical Authority", "A", "v1", meta("auth")); commands++;
        rig.registry.reassignAuthority(4, "AUTH", "A", "B", meta("move")); commands++;
        check(rig.registry.snapshot().authority("AUTH").orElseThrow().ownerSystemId().equals("B"), "authority moved explicitly");
        expectCode(() -> run(() -> rig.registry.reassignAuthority(5, "AUTH", "A", "B", meta("bad-precondition"))), "AUTHORITY_OWNER_PRECONDITION_FAILED:AUTH");
        pass();
    }

    private static void testIntegrationEdgesRequireActiveDistinctEndpoints() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        rig.registry.admitSystem(2, "B", "System B", "SHARED", "SYSTEM_MASTER", "v1", "b", meta("b")); commands++;
        expectCode(() -> run(() -> rig.registry.registerIntegrationEdge(3, "SELF", "A", "A", "iface", meta("self"))), "INTEGRATION_EDGE_SELF_REFERENCE:SELF");
        rig.registry.registerIntegrationEdge(3, "A-B", "A", "B", "iface:v1", meta("ab")); commands++;
        rig.registry.updateIntegrationEdge(4, "A-B", "iface:v1", "iface:v2", meta("ab-v2")); commands++;
        check(rig.registry.snapshot().integrationEdge("A-B").orElseThrow().interfaceRef().equals("iface:v2"), "interface pointer updated");
        pass();
    }

    private static void testPersistenceSurvivesRestart() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        String digest = rig.registry.snapshotDigest();
        AuthorityRegistry reopened = AuthorityRegistry.open(new FileAuthorityRegistryStore(rig.path));
        check(reopened.snapshot().revision() == 2, "revision survived restart");
        check(reopened.snapshot().system("A").isPresent(), "system survived restart");
        check(reopened.snapshotDigest().equals(digest), "digest survived restart");
        pass();
    }

    private static void testCorruptionFailsClosed() throws Exception {
        TestRig rig = rig(minimalDefinition());
        byte[] bytes = Files.readAllBytes(rig.path);
        bytes[bytes.length / 2] ^= 0x55;
        Files.write(rig.path, bytes);
        expectIOException(() -> AuthorityRegistry.open(new FileAuthorityRegistryStore(rig.path)), "ROOT_REGISTRY_DIGEST_MISMATCH");
        pass();
    }

    private static void testTwoRegistryInstancesCannotLostUpdate() throws Exception {
        TestRig rig = rig(minimalDefinition());
        AuthorityRegistry other = AuthorityRegistry.open(new FileAuthorityRegistryStore(rig.path));
        rig.registry.admitSystem(1, "A", "System A", "SHARED", "SYSTEM_MASTER", "v1", "a", meta("a")); commands++;
        try {
            other.admitSystem(1, "B", "System B", "SHARED", "SYSTEM_MASTER", "v1", "b", meta("b"));
            throw new AssertionError("stale persisted writer accepted");
        } catch (FileAuthorityRegistryStore.StaleRegistryRevisionException expected) {
            check(expected.expectedRevision() == 1 && expected.actualRevision() == 2, "store stale revision details");
        }
        AuthorityRegistry refreshed = AuthorityRegistry.open(new FileAuthorityRegistryStore(rig.path));
        check(refreshed.snapshot().system("A").isPresent() && refreshed.snapshot().system("B").isEmpty(), "no lost update");
        pass();
    }

    private static void testDeterministicSnapshotDigestAcrossInputOrder() throws Exception {
        List<BootstrapSystem> systems = new ArrayList<>(currentTopologyDefinition().systems());
        List<BootstrapAuthority> authorities = new ArrayList<>(currentTopologyDefinition().authorities());
        List<BootstrapEdge> edges = new ArrayList<>(currentTopologyDefinition().integrationEdges());
        BootstrapDefinition first = new BootstrapDefinition(root(), systems, authorities, edges);
        Collections.reverse(systems);
        Collections.reverse(authorities);
        Collections.reverse(edges);
        BootstrapDefinition second = new BootstrapDefinition(root(), systems, authorities, edges);
        MutationMetadata sameMeta = new MutationMetadata("bootstrap", "migration:topology-005", "operator:test", "test", Instant.parse("2026-09-11T12:00:00Z"));
        Path d1 = Files.createTempDirectory("root-reg-digest-a");
        Path d2 = Files.createTempDirectory("root-reg-digest-b");
        AuthorityRegistry r1 = AuthorityRegistry.initialize(new FileAuthorityRegistryStore(d1.resolve("r.bin")), first, sameMeta);
        AuthorityRegistry r2 = AuthorityRegistry.initialize(new FileAuthorityRegistryStore(d2.resolve("r.bin")), second, sameMeta);
        check(r1.snapshotDigest().equals(r2.snapshotDigest()), "canonical digest independent of bootstrap input order");
        pass();
    }

    private static void testProductRootVersionIsIndependentOfSystemIdentity() throws Exception {
        TestRig rig = rig(minimalDefinition());
        rig.registry.updateProductRootVersion(1, "root:v1", "root:v2", meta("root-v2")); commands++;
        check(rig.registry.snapshot().productRoot().versionPointer().equals("root:v2"), "root version updated");
        check(rig.registry.snapshot().productRoot().productId().equals("SYSTEM_MASTER"), "root identity stable");
        pass();
    }


    private static void testTopologyDepthIsBounded() throws Exception {
        List<BootstrapSystem> rows = new ArrayList<>();
        int depth = RegistrySnapshot.MAX_HIERARCHY_DEPTH + 1;
        for (int i = depth - 1; i >= 0; i--) {
            String id = "D%03d".formatted(i);
            String parent = i == depth - 1 ? "SYSTEM_MASTER" : "D%03d".formatted(i + 1);
            rows.add(new BootstrapSystem(id, id, "DEEP", parent, "v", "c", Lifecycle.ACTIVE));
        }
        BootstrapDefinition bad = new BootstrapDefinition(root(), rows, List.of(), List.of());
        Path dir = Files.createTempDirectory("root-reg-depth");
        expectCode(() -> initializeUnchecked(dir.resolve("registry.bin"), bad), "TOPOLOGY_DEPTH_LIMIT_EXCEEDED");
        pass();
    }

    private static void testCanonicalIdentifiersRejectPathInjection() {
        try {
            new BootstrapSystem("A/B", "bad", "TEST", "SYSTEM_MASTER", "v", "c", Lifecycle.ACTIVE);
            throw new AssertionError("path-like system id accepted");
        } catch (IllegalArgumentException expected) {
            check(expected.getMessage().contains("canonical identifier"), "identifier error");
        }
        pass();
    }

    private static void testRecentCommandJournalIsBounded() throws Exception {
        MemoryStore store = new MemoryStore();
        AuthorityRegistry registry = AuthorityRegistry.initialize(store, minimalDefinition(),
                new MutationMetadata("bootstrap-journal", "decision:j", "actor:j", "journal test", Instant.EPOCH));
        long revision = 1;
        String current = "root:v1";
        int mutations = RegistrySnapshot.MAX_RECENT_COMMAND_EVENTS + 32;
        for (int i = 0; i < mutations; i++) {
            String next = "root:v" + (i + 2);
            registry.updateProductRootVersion(revision, current, next,
                    new MutationMetadata("journal-" + i, "decision:j", "actor:j", "journal mutation", Instant.EPOCH.plusSeconds(i + 1L)));
            revision++;
            current = next;
        }
        check(registry.snapshot().events().size() == RegistrySnapshot.MAX_RECENT_COMMAND_EVENTS, "recent command journal bounded");
        check(registry.snapshot().revision() == 1L + mutations, "revision remains monotonic after journal trimming");
        pass();
    }

    private static TestRig rig(BootstrapDefinition definition) throws Exception {
        Path dir = Files.createTempDirectory("root-registry-test");
        Path path = dir.resolve("registry.bin");
        AuthorityRegistry registry = AuthorityRegistry.initialize(new FileAuthorityRegistryStore(path), definition,
                new MutationMetadata("bootstrap", "migration:test", "operator:test", "qualification bootstrap", Instant.parse("2026-09-11T00:00:00Z")));
        return new TestRig(path, registry);
    }

    private static BootstrapDefinition minimalDefinition() {
        return new BootstrapDefinition(root(), List.of(), List.of(), List.of());
    }

    private static BootstrapDefinition currentTopologyDefinition() {
        return new BootstrapDefinition(
                root(),
                List.of(
                        sys("CORE", "SYSTEM MASTER CORE / FOUNDATION & SPINE", "SHARED_CORE_SYSTEM", "SYSTEM_MASTER", Lifecycle.ACTIVE),
                        sys("LEARNING", "LEARNING SYSTEM", "FIRST_CLASS_TOOL_SYSTEM", "SYSTEM_MASTER", Lifecycle.ACTIVE),
                        sys("BOOK", "BOOK SYSTEM", "FIRST_CLASS_TOOL_SYSTEM", "SYSTEM_MASTER", Lifecycle.ACTIVE),
                        sys("DOCUMENTS", "DOCUMENTS SYSTEM", "FIRST_CLASS_TOOL_SYSTEM", "SYSTEM_MASTER", Lifecycle.ACTIVE),
                        sys("PROSE", "PROSE SYSTEM", "HISTORICAL_RETIRED_SYSTEM", "BOOK", Lifecycle.RETIRED_TERMINAL)),
                List.of(
                        new BootstrapAuthority("ROOT-TOPOLOGY", "System topology authority", "CORE", "topology:005", Lifecycle.ACTIVE),
                        new BootstrapAuthority("BOOK-CANONICAL-STATE", "Book canonical-state authority", "BOOK", "book-control:011", Lifecycle.ACTIVE)),
                List.of(
                        new BootstrapEdge("CORE-BOOK-SHARED", "CORE", "BOOK", "interface:shared-spine:v1", Lifecycle.ACTIVE),
                        new BootstrapEdge("CORE-LEARNING-SHARED", "CORE", "LEARNING", "interface:shared-spine:v1", Lifecycle.ACTIVE)));
    }

    private static ProductRoot root() {
        return new ProductRoot("SYSTEM_MASTER", "SYSTEM MASTER", "root:v1");
    }

    private static BootstrapSystem sys(String id, String name, String parent, Lifecycle lifecycle) {
        return new BootstrapSystem(id, name, "TEST_SYSTEM", parent, "version:" + id, "control:" + id, lifecycle);
    }

    private static BootstrapSystem sys(String id, String name, String classification, String parent, Lifecycle lifecycle) {
        return new BootstrapSystem(id, name, classification, parent, "version:" + id, "control:" + id, lifecycle);
    }

    private static MutationMetadata meta(String commandId) {
        return new MutationMetadata(commandId, "decision:" + commandId, "actor:test", "qualification mutation", Instant.parse("2026-09-11T01:00:00Z").plusSeconds(commands + 1L));
    }

    private static void initializeUnchecked(Path path, BootstrapDefinition definition) {
        try {
            AuthorityRegistry.initialize(new FileAuthorityRegistryStore(path), definition, meta("bad-bootstrap"));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private static void run(ThrowingAction action) {
        try {
            action.run();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private static void expectCode(Runnable action, String prefix) {
        try {
            action.run();
            throw new AssertionError("expected failure " + prefix);
        } catch (IllegalStateException expected) {
            check(expected.getMessage().startsWith(prefix), "expected " + prefix + " but got " + expected.getMessage());
        }
    }

    private static void expectIOException(ThrowingAction action, String prefix) {
        try {
            action.run();
            throw new AssertionError("expected IOException " + prefix);
        } catch (IOException expected) {
            check(expected.getMessage().startsWith(prefix), "expected " + prefix + " but got " + expected.getMessage());
        }
    }

    private static void pass() { tests++; }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class MemoryStore implements AuthorityRegistryStore {
        private RegistrySnapshot snapshot;
        @Override public java.util.Optional<RegistrySnapshot> load() { return java.util.Optional.ofNullable(snapshot); }
        @Override public void save(long expectedCurrentRevision, RegistrySnapshot next) throws IOException {
            long actual = snapshot == null ? 0 : snapshot.revision();
            if (actual != expectedCurrentRevision) throw new FileAuthorityRegistryStore.StaleRegistryRevisionException(expectedCurrentRevision, actual);
            snapshot = next;
        }
    }

    private record TestRig(Path path, AuthorityRegistry registry) {}

    @FunctionalInterface
    private interface ThrowingAction { void run() throws IOException; }
}
