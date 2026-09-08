package org.systemmaster.learning;

import org.systemmaster.core.ExecutionGrantContracts.EligibilitySnapshot;
import org.systemmaster.core.ExecutionGrantContracts.ExecutionGrant;
import org.systemmaster.core.ExecutionGrantContracts.RequirementStanding;
import org.systemmaster.core.ExecutionGrantContracts.Standing;
import org.systemmaster.core.ExecutionGrantContracts.WindowStanding;
import org.systemmaster.core.ExecutionGrantIssuer;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class Impl017IntegrationQualification {
    private static final String PRINCIPAL = "SYSTEM_MASTER_LEARNING_RUNTIME";
    private static final long AUTH_EPOCH = 7L;
    private static int assertions = 0;

    public static void main(String[] args) throws Exception {
        Path repoRoot = Path.of(System.getenv().getOrDefault("GITHUB_WORKSPACE", ".")).toAbsolutePath().normalize();
        Path stateRoot = Files.createTempDirectory("system-master-learning-impl017-");
        ExecutionGrantIssuer issuer = new ExecutionGrantIssuer();
        CurrentSystemMasterLearningAuthorizer authorizer = new CurrentSystemMasterLearningAuthorizer(issuer);
        Instant evaluatedAt = Instant.parse("2026-09-08T03:50:00Z");
        Instant issuedAt = evaluatedAt.plusSeconds(1);
        Instant useAt = evaluatedAt.plusSeconds(2);

        EligibilitySnapshot snapshot = snapshot("LEARNING_EXECUTE", "learning-runtime-qual001", evaluatedAt);
        ExecutionGrant grant = issuer.issue(snapshot, issuedAt, Duration.ofMinutes(5));

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(request -> {
            bridgeCalls.incrementAndGet();
            return realInvoker.invoke(request);
        });

        var command = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL017-001",
                "impl017-a01",
                "LRN-IMPL017",
                Set.of("S-GIT-BRANCH-MERGE"),
                0L);

        var authorization = authorizer.authorize(grant, snapshot, PRINCIPAL, AUTH_EPOCH, useAt);
        check(LearningExecutionPort.PORT_VERSION.equals("LEARNING-EXECUTION-PORT-V1"), "stable port version");
        check(authorization.action().equals(LearningExecutionPort.ACTION), "shim maps stable action");
        check(authorization.targetRefs().equals(LearningExecutionPort.TARGETS), "shim maps stable target scope");

        var first = adapter.execute(authorization, PRINCIPAL, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "valid authorization reaches Learning bridge");
        check(first.responseJson().contains("\"qualified_learning_boundary\":\"LEARNING-LAB-QUAL-001\""),
                "response binds qualified Learning boundary");
        check(first.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""),
                "claimed downstream skill enters through diagnostic probe");
        check(first.responseJson().contains("\"skill_id\":\"S-GIT-STAGE-COMMIT\""),
                "hidden prerequisite probed before downstream skill");
        check(first.executionPortVersion().equals(LearningExecutionPort.PORT_VERSION), "receipt names stable execution port");
        check(bridgeCalls.get() == 1, "valid execution invokes bridge once");

        var replay = adapter.execute(authorization, PRINCIPAL, useAt.plusSeconds(1), command);
        check(first.responseJson().equals(replay.responseJson()), "exact command replay is byte-stable");
        check(first.responseDigest().equals(replay.responseDigest()), "exact command replay digest is stable");
        check(bridgeCalls.get() == 2, "explicit replay invokes bridge exactly once more");

        int callsBeforeDenials = bridgeCalls.get();
        expectDenied(() -> authorizer.authorize(grant, snapshot, "WRONG_PRINCIPAL", AUTH_EPOCH, useAt),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenials, "current shim principal mismatch never invokes bridge");

        expectDenied(() -> authorizer.authorize(grant, snapshot, PRINCIPAL, AUTH_EPOCH + 1, useAt),
                "AUTHORIZATION_REVOKED_OR_CHANGED");
        check(bridgeCalls.get() == callsBeforeDenials, "current shim revocation mismatch never invokes bridge");

        EligibilitySnapshot changedSnapshot = snapshot("LEARNING_EXECUTE", "learning-runtime-changed", evaluatedAt);
        expectDenied(() -> authorizer.authorize(grant, changedSnapshot, PRINCIPAL, AUTH_EPOCH, useAt),
                "SNAPSHOT_CHANGED");
        check(bridgeCalls.get() == callsBeforeDenials, "current shim changed snapshot never invokes bridge");

        EligibilitySnapshot wrongActionSnapshot = snapshot("OTHER_ACTION", "learning-runtime-qual001", evaluatedAt);
        ExecutionGrant wrongActionGrant = issuer.issue(wrongActionSnapshot, issuedAt, Duration.ofMinutes(5));
        expectDenied(() -> authorizer.authorize(wrongActionGrant, wrongActionSnapshot, PRINCIPAL, AUTH_EPOCH, useAt),
                "ACTION_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenials, "current shim wrong action never invokes bridge");

        expectDenied(() -> adapter.execute(authorization, "WRONG_PRINCIPAL", useAt, command), "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenials, "stable port principal check never invokes bridge");

        expectDenied(() -> adapter.execute(authorization, PRINCIPAL, authorization.expiresAt().plusSeconds(1), command),
                "AUTHORIZATION_EXPIRED");
        check(bridgeCalls.get() == callsBeforeDenials, "stable port expiry check never invokes bridge");

        System.out.println("IMPL017_STATUS=PASS");
        System.out.println("IMPL017_ASSERTIONS=" + assertions);
        System.out.println("IMPL017_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL017_FIRST_RESPONSE_DIGEST=" + first.responseDigest());
        System.out.println("IMPL017_ADAPTER_VERSION=" + first.adapterVersion());
        System.out.println("IMPL017_EXECUTION_PORT_VERSION=" + first.executionPortVersion());
        System.out.println("IMPL017_AUTH_SHIM_VERSION=" + CurrentSystemMasterLearningAuthorizer.SHIM_VERSION);
        System.out.println("IMPL017_FOUNDATION_COUPLING=SHIM_ONLY");
        System.out.println("IMPL017_NEXT_ACTION=DIAGNOSTIC_PROBE:S-GIT-STAGE-COMMIT");
    }

    private static EligibilitySnapshot snapshot(String action, String targetDigest, Instant evaluatedAt) {
        return new EligibilitySnapshot(
                "CHANGE-LEARNING-IMPL017",
                1L,
                targetDigest,
                1L,
                1L,
                "POLICY-LEARNING-INTEGRATION-V1",
                PRINCIPAL,
                action,
                LearningExecutionPort.TARGETS,
                Set.of(),
                List.of(),
                Map.of("LEARNING_QUAL_001", RequirementStanding.SATISFIED),
                WindowStanding.NOT_APPLICABLE,
                Standing.CURRENT,
                Standing.CURRENT,
                AUTH_EPOCH,
                "RECOVERY-ELIGIBLE-LEARNING-V1",
                evaluatedAt,
                null);
    }

    private static void expectDenied(ThrowingRunnable operation, String expectedReason) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected denial containing " + expectedReason);
        } catch (SecurityException expected) {
            check(expected.getMessage().contains(expectedReason),
                    "denial must contain " + expectedReason + " but was " + expected.getMessage());
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
