package org.systemmaster.foundation.root;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

public final class AuthorityRegistryQualificationTest {
    private static int tests;

    public static void main(String[] args) throws Exception {
        testExactFreshBootstrap();
        testQueriesAndImmutableSnapshots();
        testMissingParentRejected();
        testDuplicateIdentityOwnerAndAliasRejected();
        testRevisionAndIdempotencySemantics();
        testPointerLifecycle();
        testRetirementIsExplicitAndTerminal();
        testActiveChildrenBlockParentRetirement();
        testJournalReplayAndIdempotentPersistence();
        testCorruptJournalFailsClosed();
        testTruncatedJournalFailsClosed();
        testConcurrentWritersLoseNoCommittedUpdate();
        testCommandCodecRoundTrip();
        System.out.println("PASS FOUNDATION_SYSTEM_ROOT tests=" + tests);
    }

    private static void testExactFreshBootstrap() {
        AuthorityRegistry registry = FoundationAuthorityBootstrap.createRegistry();
        AuthorityRegistry.Snapshot snapshot = registry.snapshot();
        check(snapshot.revision() == 28, "bootstrap revision");
        check(snapshot.authorities().size() == 28, "bootstrap authority count");
        check(snapshot.active().size() == 28, "all bootstrap authorities active");
        check(snapshot.retired().isEmpty(), "no bootstrap authority retired");
        check(snapshot.authorities().keySet().equals(FoundationAuthorityBootstrap.expectedAuthorityIds()), "exact bootstrap ids");
        check(snapshot.childrenOf(FoundationAuthorityBootstrap.PRODUCT_BINDING_ID).size() == 27, "root child count");
        long systems = snapshot.authorities().values().stream()
                .filter(a -> a.kind() == AuthorityRegistry.AuthorityKind.SHARED_SYSTEM).count();
        long overlays = snapshot.authorities().values().stream()
                .filter(a -> a.kind() == AuthorityRegistry.AuthorityKind.FEDERATED_OVERLAY).count();
        check(systems == 26, "26 shared systems");
        check(overlays == 1, "one federated overlay");
        AuthorityRegistry.AuthorityRecord product = snapshot.authorities().get(FoundationAuthorityBootstrap.PRODUCT_BINDING_ID);
        check(product.currentPointers().get("product_authority").equals("governance/CURRENT-AUTHORITY.json"), "product authority boundary");
        check(product.currentPointers().get("core_control").equals("system-master/control-v2"), "core control boundary");
        pass();
    }

    private static void testQueriesAndImmutableSnapshots() {
        AuthorityRegistry.Snapshot snapshot = FoundationAuthorityBootstrap.createRegistry().snapshot();
        check(snapshot.resolve("Keel").orElseThrow().authorityId().equals("INTENT_KEEL"), "alias lookup");
        check(snapshot.resolve("intent_keel").orElseThrow().authorityId().equals("INTENT_KEEL"), "id lookup normalized");
        check(snapshot.owner("SYSTEM_MASTER/CORE/INTENT_KEEL").orElseThrow().authorityId().equals("INTENT_KEEL"), "owner lookup");
        expectUnsupported(() -> snapshot.authorities().clear());
        expectUnsupported(() -> snapshot.aliasIndex().clear());
        pass();
    }

    private static void testMissingParentRejected() {
        AuthorityRegistry registry = new AuthorityRegistry();
        expectCode(() -> registry.apply(new AuthorityRegistry.AdmitAuthority(
                "missing-parent", 0, "CHILD_AUTH", "Child", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD_AUTH", "NO_SUCH_PARENT", Set.of(), Map.of(), "decision")),
                "PARENT_AUTHORITY_MISSING");
        pass();
    }

    private static void testDuplicateIdentityOwnerAndAliasRejected() {
        AuthorityRegistry registry = minimalRegistry();
        registry.apply(new AuthorityRegistry.AdmitAuthority(
                "child-one", 1, "CHILD_ONE", "Child One", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD_ONE", "SYSTEM_MASTER_CORE", Set.of("One"), Map.of(), "decision"));
        expectCode(() -> registry.apply(new AuthorityRegistry.AdmitAuthority(
                "dup-id", 2, "CHILD_ONE", "Again", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD_TWO", "SYSTEM_MASTER_CORE", Set.of(), Map.of(), "decision")),
                "AUTHORITY_ALREADY_EXISTS");
        expectCode(() -> registry.apply(new AuthorityRegistry.AdmitAuthority(
                "dup-owner", 2, "CHILD_TWO", "Child Two", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD_ONE", "SYSTEM_MASTER_CORE", Set.of(), Map.of(), "decision")),
                "OWNER_ALREADY_BOUND");
        expectCode(() -> registry.apply(new AuthorityRegistry.AdmitAuthority(
                "dup-alias", 2, "CHILD_TWO", "Child Two", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD_TWO", "SYSTEM_MASTER_CORE", Set.of("one"), Map.of(), "decision")),
                "ALIAS_ALREADY_BOUND_TO_OTHER_AUTHORITY");
        pass();
    }

    private static void testRevisionAndIdempotencySemantics() {
        AuthorityRegistry registry = minimalRegistry();
        AuthorityRegistry.AddAlias command = new AuthorityRegistry.AddAlias("same-command", 1, "SYSTEM_MASTER_CORE", "Root Alias");
        AuthorityRegistry.ApplyResult first = registry.apply(command);
        check(first.changed() && first.snapshot().revision() == 2, "first command changes state");
        AuthorityRegistry.ApplyResult duplicate = registry.apply(command);
        check(!duplicate.changed() && duplicate.snapshot().revision() == 2, "exact duplicate is idempotent");
        expectCode(() -> registry.apply(new AuthorityRegistry.AddAlias(
                "same-command", 2, "SYSTEM_MASTER_CORE", "Different Alias")), "COMMAND_IDENTITY_COLLISION");
        expectCode(() -> registry.apply(new AuthorityRegistry.AddAlias(
                "stale-command", 1, "SYSTEM_MASTER_CORE", "Stale")), "REVISION_CONFLICT");
        pass();
    }

    private static void testPointerLifecycle() {
        AuthorityRegistry registry = minimalRegistry();
        registry.apply(new AuthorityRegistry.AdvancePointer(
                "pointer-1", 1, "SYSTEM_MASTER_CORE", "architecture", "v2"));
        check(registry.snapshot().resolve("SYSTEM_MASTER_CORE").orElseThrow().currentPointers().get("architecture").equals("v2"), "pointer advanced");
        expectCode(() -> registry.apply(new AuthorityRegistry.AdvancePointer(
                "pointer-same", 2, "SYSTEM_MASTER_CORE", "architecture", "v2")), "POINTER_ALREADY_CURRENT");
        pass();
    }

    private static void testRetirementIsExplicitAndTerminal() {
        AuthorityRegistry registry = minimalRegistry();
        registry.apply(new AuthorityRegistry.AdmitAuthority(
                "leaf-admit", 1, "LEAF", "Leaf", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/LEAF", "SYSTEM_MASTER_CORE", Set.of("Leaf Alias"), Map.of("architecture", "v1"), "decision"));
        registry.apply(new AuthorityRegistry.RetireAuthority("leaf-retire", 2, "LEAF", "retirement-decision"));
        AuthorityRegistry.AuthorityRecord retired = registry.snapshot().authorities().get("LEAF");
        check(retired.lifecycle() == AuthorityRegistry.Lifecycle.RETIRED, "leaf retired");
        check(retired.retiredRevision() == 3L, "retirement revision recorded");
        check(registry.snapshot().resolve("Leaf Alias").orElseThrow().lifecycle() == AuthorityRegistry.Lifecycle.RETIRED, "retired alias resolves historically");
        expectCode(() -> registry.apply(new AuthorityRegistry.AdvancePointer(
                "mutate-retired", 3, "LEAF", "architecture", "v2")), "AUTHORITY_RETIRED");
        expectCode(() -> registry.apply(new AuthorityRegistry.AdmitAuthority(
                "reactivate", 3, "LEAF", "Leaf Again", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/LEAF2", "SYSTEM_MASTER_CORE", Set.of(), Map.of(), "decision")),
                "AUTHORITY_ALREADY_EXISTS");
        pass();
    }

    private static void testActiveChildrenBlockParentRetirement() {
        AuthorityRegistry registry = minimalRegistry();
        registry.apply(new AuthorityRegistry.AdmitAuthority(
                "child", 1, "CHILD", "Child", AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/CHILD", "SYSTEM_MASTER_CORE", Set.of(), Map.of(), "decision"));
        expectCode(() -> registry.apply(new AuthorityRegistry.RetireAuthority(
                "retire-root", 2, "SYSTEM_MASTER_CORE", "decision")), "ACTIVE_CHILDREN_PREVENT_RETIREMENT");
        pass();
    }

    private static void testJournalReplayAndIdempotentPersistence() throws Exception {
        Path dir = Files.createTempDirectory("authority-journal-replay-");
        Path file = dir.resolve("authority.journal");
        AuthorityJournal journal = new AuthorityJournal(file);
        AuthorityRegistry.Snapshot first = FoundationAuthorityBootstrap.bootstrap(journal);
        long size = journal.sizeBytes();
        AuthorityRegistry.Snapshot second = FoundationAuthorityBootstrap.bootstrap(journal);
        check(second.revision() == first.revision(), "repeated bootstrap idempotent");
        check(journal.sizeBytes() == size, "idempotent bootstrap does not append");
        AuthorityRegistry.Snapshot replayed = new AuthorityJournal(file).load();
        check(replayed.authorities().equals(first.authorities()), "replay reconstructs exact authorities");
        check(replayed.aliasIndex().equals(first.aliasIndex()), "replay reconstructs exact aliases");
        pass();
    }

    private static void testCorruptJournalFailsClosed() throws Exception {
        Path dir = Files.createTempDirectory("authority-journal-corrupt-");
        Path source = dir.resolve("good.journal");
        FoundationAuthorityBootstrap.bootstrap(new AuthorityJournal(source));
        byte[] bytes = Files.readAllBytes(source);
        int index = bytes.length - 2;
        bytes[index] = bytes[index] == 'a' ? (byte) 'b' : (byte) 'a';
        Path corrupt = dir.resolve("corrupt.journal");
        Files.write(corrupt, bytes);
        expectCode(() -> uncheckedLoad(new AuthorityJournal(corrupt)), "JOURNAL_DIGEST_MISMATCH");
        pass();
    }

    private static void testTruncatedJournalFailsClosed() throws Exception {
        Path dir = Files.createTempDirectory("authority-journal-truncated-");
        Path source = dir.resolve("good.journal");
        FoundationAuthorityBootstrap.bootstrap(new AuthorityJournal(source));
        byte[] bytes = Files.readAllBytes(source);
        Path truncated = dir.resolve("truncated.journal");
        Files.write(truncated, java.util.Arrays.copyOf(bytes, bytes.length - 1));
        expectCode(() -> uncheckedLoad(new AuthorityJournal(truncated)), "JOURNAL_TRUNCATED_FRAME");
        pass();
    }

    private static void testConcurrentWritersLoseNoCommittedUpdate() throws Exception {
        Path dir = Files.createTempDirectory("authority-journal-concurrent-");
        AuthorityJournal journal = new AuthorityJournal(dir.resolve("authority.journal"));
        FoundationAuthorityBootstrap.bootstrap(journal);
        int writers = 12;
        CountDownLatch start = new CountDownLatch(1);
        List<Thread> threads = new ArrayList<>();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        for (int i = 0; i < writers; i++) {
            final int n = i;
            Thread thread = new Thread(() -> {
                try {
                    start.await();
                    for (int attempt = 0; attempt < 100; attempt++) {
                        long revision = journal.load().revision();
                        try {
                            journal.transact(new AuthorityRegistry.AddAlias(
                                    "concurrent-alias-" + n, revision, "SYSTEM_ROOT", "Concurrent Root " + n));
                            return;
                        } catch (IllegalStateException e) {
                            if (!e.getMessage().startsWith("REVISION_CONFLICT")) throw e;
                        }
                    }
                    throw new AssertionError("concurrent writer exhausted retries " + n);
                } catch (Throwable t) {
                    failure.compareAndSet(null, t);
                }
            }, "root-writer-" + i);
            threads.add(thread);
            thread.start();
        }
        start.countDown();
        for (Thread thread : threads) thread.join();
        if (failure.get() != null) throw new AssertionError("concurrent writer failed", failure.get());
        AuthorityRegistry.Snapshot snapshot = journal.load();
        check(snapshot.revision() == 28 + writers, "all concurrent commits represented");
        for (int i = 0; i < writers; i++) {
            check(snapshot.resolve("Concurrent Root " + i).orElseThrow().authorityId().equals("SYSTEM_ROOT"), "concurrent alias " + i);
        }
        pass();
    }

    private static void testCommandCodecRoundTrip() {
        List<AuthorityRegistry.Command> commands = List.of(
                new AuthorityRegistry.AdmitAuthority("c1", 0, "ROOT_A", "Root A",
                        AuthorityRegistry.AuthorityKind.PRODUCT_ROOT_BINDING, "SYSTEM_MASTER/ROOT_A", null,
                        Set.of("Alias A"), Map.of("architecture", "v1"), "decision"),
                new AuthorityRegistry.AdvancePointer("c2", 1, "ROOT_A", "architecture", "v2"),
                new AuthorityRegistry.AddAlias("c3", 1, "ROOT_A", "Alias B"),
                new AuthorityRegistry.RetireAuthority("c4", 1, "ROOT_A", "decision"));
        for (AuthorityRegistry.Command command : commands) {
            AuthorityRegistry.Command decoded = AuthorityJournal.decode(AuthorityJournal.encode(command));
            check(decoded.equals(command), "codec equality " + command.getClass().getSimpleName());
            check(AuthorityRegistry.commandFingerprint(decoded).equals(AuthorityRegistry.commandFingerprint(command)), "codec fingerprint");
        }
        pass();
    }

    private static AuthorityRegistry minimalRegistry() {
        AuthorityRegistry registry = new AuthorityRegistry();
        registry.apply(new AuthorityRegistry.AdmitAuthority(
                "root", 0, "SYSTEM_MASTER_CORE", "Core", AuthorityRegistry.AuthorityKind.PRODUCT_ROOT_BINDING,
                "SYSTEM_MASTER/CORE", null, Set.of("Core"), Map.of("architecture", "v1"), "decision"));
        return registry;
    }

    private static void uncheckedLoad(AuthorityJournal journal) {
        try {
            journal.load();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private static void expectCode(Runnable action, String code) {
        try {
            action.run();
            throw new AssertionError("expected error " + code);
        } catch (IllegalStateException expected) {
            check(expected.getMessage() != null && expected.getMessage().startsWith(code),
                    "expected " + code + " but got " + expected.getMessage());
        }
    }

    private static void expectUnsupported(Runnable action) {
        try {
            action.run();
            throw new AssertionError("expected immutable collection");
        } catch (UnsupportedOperationException expected) {
            // expected
        }
    }

    private static void pass() {
        tests++;
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
