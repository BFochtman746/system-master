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
        Instant evaluatedAt = Instant.parse("2026-09-08T03:50:00Z");
        Instant issuedAt = evaluatedAt.plusSeconds(1);
        Instant useAt = evaluatedAt.plusSeconds(2);

        EligibilitySnapshot snapshot = snapshot("LEARNING_EXECUTE", "learning-runtime-qual001", evaluatedAt);
        ExecutionGrant grant = issuer.issue(snapshot, issuedAt, Duration.ofMinutes(5));

        AtomicInteger bridgeCalls = new AtomicInteger();
        LearningCapabilityAdapter.PythonBridgeInvoker realInvoker =
                new LearningCapabilityAdapter.PythonBridgeInvoker(repoRoot, stateRoot);
        LearningCapabilityAdapter adapter = new LearningCapabilityAdapter(
                issuer,
                request -> {
                    bridgeCalls.incrementAndGet();
                    return realInvoker.invoke(request);
                });

        var command = new LearningCapabilityAdapter.LearningCommand(
                "REQ-IMPL017-001",
                "impl017-a01",
                "LRN-IMPL017",
                Set.of("S-GIT-BRANCH-MERGE"),
                0L);

        var first = adapter.execute(grant, snapshot, PRINCIPAL, AUTH_EPOCH, useAt, command);
        check(first.responseJson().contains("\"status\":\"PASS\""), "valid grant must reach Learning bridge");
        check(first.responseJson().contains("\"qualified_learning_boundary\":\"LEARNING-LAB-QUAL-001\""),
                "response must bind qualified Learning boundary");
        check(first.responseJson().contains("\"action_type\":\"DIAGNOSTIC_PROBE\""),
                "claimed downstream skill must enter through diagnostic probe");
        check(first.responseJson().contains("\"skill_id\":\"S-GIT-STAGE-COMMIT\""),
                "hidden prerequisite must be probed before downstream skill");
        check(bridgeCalls.get() == 1, "valid execution invokes bridge once");

        var replay = adapter.execute(grant, snapshot, PRINCIPAL, AUTH_EPOCH, useAt.plusSeconds(1), command);
        check(first.responseJson().equals(replay.responseJson()), "exact command replay must be byte-stable");
        check(first.responseDigest().equals(replay.responseDigest()), "exact command replay digest must be stable");
        check(bridgeCalls.get() == 2, "explicit replay invokes bridge exactly once more");

        int callsBeforeDenials = bridgeCalls.get();
        expectDenied(() -> adapter.execute(grant, snapshot, "WRONG_PRINCIPAL", AUTH_EPOCH, useAt, command),
                "PRINCIPAL_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenials, "principal mismatch must not invoke bridge");

        expectDenied(() -> adapter.execute(grant, snapshot, PRINCIPAL, AUTH_EPOCH + 1, useAt, command),
                "AUTHORIZATION_REVOKED_OR_CHANGED");
        check(bridgeCalls.get() == callsBeforeDenials, "revocation epoch mismatch must not invoke bridge");

        expectDenied(() -> adapter.execute(grant, snapshot, PRINCIPAL, AUTH_EPOCH,
                        grant.expiresAt().plusSeconds(1), command),
                "GRANT_EXPIRED");
        check(bridgeCalls.get() == callsBeforeDenials, "expired grant must not invoke bridge");

        EligibilitySnapshot changedSnapshot = snapshot("LEARNING_EXECUTE", "learning-runtime-changed", evaluatedAt);
        expectDenied(() -> adapter.execute(grant, changedSnapshot, PRINCIPAL, AUTH_EPOCH, useAt, command),
                "SNAPSHOT_CHANGED");
        check(bridgeCalls.get() == callsBeforeDenials, "changed snapshot must not invoke bridge");

        EligibilitySnapshot wrongActionSnapshot = snapshot("OTHER_ACTION", "learning-runtime-qual001", evaluatedAt);
        ExecutionGrant wrongActionGrant = issuer.issue(wrongActionSnapshot, issuedAt, Duration.ofMinutes(5));
        expectDenied(() -> adapter.execute(wrongActionGrant, wrongActionSnapshot, PRINCIPAL, AUTH_EPOCH, useAt, command),
                "ACTION_MISMATCH");
        check(bridgeCalls.get() == callsBeforeDenials, "wrong action grant must not invoke bridge");

        System.out.println("IMPL017_STATUS=PASS");
        System.out.println("IMPL017_ASSERTIONS=" + assertions);
        System.out.println("IMPL017_BRIDGE_CALLS=" + bridgeCalls.get());
        System.out.println("IMPL017_FIRST_RESPONSE_DIGEST=" + first.responseDigest());
        System.out.println("IMPL017_ADAPTER_VERSION=" + first.adapterVersion());
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
                LearningCapabilityAdapter.TARGETS,
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
