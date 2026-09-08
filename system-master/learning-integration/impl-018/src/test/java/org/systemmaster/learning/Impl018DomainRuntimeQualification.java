package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Impl018DomainRuntimeQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl018-");
        Instant authorizedAt = Instant.parse("2026-09-08T04:00:00Z");
        Instant useAt = authorizedAt.plusSeconds(1);
        AuthorizedExecution authorization = new AuthorizedExecution(
                "AUTH-IMPL018-001",
                PRINCIPAL,
                LearningExecutionPort.ACTION,
                LearningExecutionPort.TARGETS,
                7L,
                authorizedAt,
                authorizedAt.plusSeconds(600),
                "PROOF-IMPL018-001");

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        });

        var gitCommand = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL018-GIT",
                "impl018-git",
                "LRN-IMPL018",
                "git-feature-branch-workflow",
                Set.of("S-GIT-BRANCH-MERGE"),
                0L);
        var git = adapter.execute(authorization, PRINCIPAL, useAt, gitCommand);
        check(git.responseJson().contains("\"domain_key\":\"git-feature-branch-workflow\""),
                "generic command must reach Git domain");
        check(git.responseJson().contains("\"skill_id\":\"S-GIT-STAGE-COMMIT\""),
                "Git downstream claim must probe hidden prerequisite");
        check(git.responseJson().contains("\"runtime_binding_version\":\"LEARNING-DOMAIN-RUNTIME-BINDING-V1\""),
                "runtime binding version must be explicit");

        var fractionCommand = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL018-FRAC",
                "impl018-frac",
                "LRN-IMPL018",
                "fractions-unlike-denominators",
                Set.of("S-FRAC-ADD-SUB"),
                0L);
        var fraction = adapter.execute(authorization, PRINCIPAL, useAt, fractionCommand);
        check(fraction.responseJson().contains("\"domain_key\":\"fractions-unlike-denominators\""),
                "same adapter must reach fraction domain");
        check(fraction.responseJson().contains("\"skill_id\":\"S-FRAC-EQUIV-LCD\""),
                "fraction downstream claim must probe hidden prerequisite");
        check(fraction.responseJson().contains("\"S-FRAC-ADD-SUB\""),
                "fraction course skill set must be returned");
        check(LearningExecutionPort.PORT_VERSION.equals(fraction.executionPortVersion()),
                "stable execution port remains V1");
        check(LearningCapabilityAdapter.ADAPTER_VERSION.equals(fraction.adapterVersion()),
                "domain-general adapter version must bind result");

        var fractionReplay = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), fractionCommand);
        check(fraction.responseJson().equals(fractionReplay.responseJson()),
                "exact fraction command replay must be byte stable");
        check(fraction.responseDigest().equals(fractionReplay.responseDigest()),
                "exact fraction replay digest must be stable");

        int callsBeforeAuthDenial = bridgeCalls.get();
        expectSecurity(() -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, fractionCommand),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeAuthDenial,
                "authorization denial must happen before Python bridge invocation");

        var crossDomainSkill = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL018-CROSS",
                "impl018-cross",
                "LRN-IMPL018",
                "fractions-unlike-denominators",
                Set.of("S-GIT-BRANCH-MERGE"),
                0L);
        expectBridgeFailure(() -> adapter.execute(authorization, PRINCIPAL, useAt, crossDomainSkill),
                "CLAIMED_SKILL_OUTSIDE_COURSE:S-GIT-BRANCH-MERGE");

        var unknownDomain = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL018-UNKNOWN",
                "impl018-unknown",
                "LRN-IMPL018",
                "unknown-domain",
                Set.of(),
                0L);
        expectBridgeFailure(() -> adapter.execute(authorization, PRINCIPAL, useAt, unknownDomain),
                "UNSUPPORTED_DOMAIN");

        System.out.println("IMPL018_STATUS=PASS");
        System.out.println("IMPL018_ASSERTIONS=" + assertions);
        System.out.println("IMPL018_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL018_PORT_VERSION=" + LearningExecutionPort.PORT_VERSION);
        System.out.println("IMPL018_ADAPTER_VERSION=" + LearningCapabilityAdapter.ADAPTER_VERSION);
        System.out.println("IMPL018_DOMAINS=git-feature-branch-workflow,fractions-unlike-denominators");
        System.out.println("IMPL018_FOUNDATION_PACKAGE_DEPENDENCY=NONE");
    }

    private static void expectSecurity(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected security denial containing " + expected);
        } catch (SecurityException failure) {
            check(failure.getMessage().contains(expected), "security denial must contain " + expected);
        }
    }

    private static void expectBridgeFailure(ThrowingRunnable operation, String expected) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected bridge failure containing " + expected);
        } catch (IllegalStateException failure) {
            check(failure.getMessage().contains(expected), "bridge failure must contain " + expected + " but was " + failure.getMessage());
        }
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
