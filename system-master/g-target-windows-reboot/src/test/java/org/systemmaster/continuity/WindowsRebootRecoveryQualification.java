package org.systemmaster.continuity;

import org.systemmaster.continuity.ContinuityQualificationLedger.Evidence;
import org.systemmaster.continuity.ContinuityQualificationLedger.EvidenceClass;
import org.systemmaster.continuity.ContinuityQualificationLedger.RequirementMapping;
import org.systemmaster.continuity.ContinuityQualificationLedger.Standing;
import org.systemmaster.continuity.RecoveryRecord.RecoveryState;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Properties;

public final class WindowsRebootRecoveryQualification {
    private static int assertions = 0;

    private static void ok(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }

    private static void eq(Object expected, Object actual, String message) {
        assertions++;
        if (!java.util.Objects.equals(expected, actual)) {
            throw new AssertionError(message + " expected=" + expected + " actual=" + actual);
        }
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 5) throw new IllegalArgumentException("mode persistentDir qualificationId commit runId required");
        String mode = args[0];
        Path root = Path.of(args[1]);
        String qualificationId = args[2];
        String commit = args[3];
        String runId = args[4];
        Files.createDirectories(root);
        if (mode.equals("ARM")) arm(root, qualificationId, commit, runId);
        else if (mode.equals("VERIFY")) verify(root, qualificationId, commit, runId);
        else throw new IllegalArgumentException("unsupported mode " + mode);
    }

    private static void arm(Path root, String qualificationId, String commit, String runId) throws Exception {
        Path registryRoot = root.resolve("registry");
        DurableWorkIdentityRegistry identities = new DurableWorkIdentityRegistry(registryRoot);
        RecoveryRegistry registry = new RecoveryRegistry(registryRoot);
        String workUnitId = "windows-reboot-" + qualificationId.toLowerCase();
        String interruptionRef = "target-windows-reboot:" + qualificationId;

        DurableWorkIdentityRegistry.RegistrationResult registration = identities.registerDurableWorkIdentity(
                "task-" + qualificationId,
                "workflow-continuity-recovery",
                "stage-target-windows-reboot",
                workUnitId,
                null,
                "intent:" + commit,
                "021G",
                "QUALIFICATION");
        ok(registration == DurableWorkIdentityRegistry.RegistrationResult.CREATED ||
                registration == DurableWorkIdentityRegistry.RegistrationResult.IDEMPOTENT_EXISTING,
                "durable identity registered");

        RecoveryRegistry.OpenResult opened = registry.openRecovery(workUnitId, 1L, interruptionRef);
        RecoveryRecord record = opened.record();
        if (record.state() == RecoveryState.DETECTED) {
            record = registry.transitionRecovery(
                    record.recoveryId(), record.version(), RecoveryState.DETECTED, RecoveryState.WAITING_DEPENDENCY,
                    "TARGET_WINDOWS_REBOOT_ARMED", List.of("qualification:" + qualificationId),
                    "arm-wait:" + qualificationId);
        }

        RecoveryRegistry.RecoveryStatus status = registry.getRecoveryStatus(workUnitId);
        eq(RecoveryState.WAITING_DEPENDENCY, status.recoveryState(), "armed recovery state");
        eq("WAITING", status.userVisibleState(), "armed visible state");
        ok(status.recordVersion() >= 2L, "armed record version durable");
        ok(registry.getRecovery(record.recoveryId()).isPresent(), "armed recovery queryable");
        ok(registry.getRecoveryEvents(record.recoveryId()).size() >= 2, "armed recovery events durable");

        Properties p = new Properties();
        p.setProperty("qualification_id", qualificationId);
        p.setProperty("arm_commit", commit);
        p.setProperty("arm_run_id", runId);
        p.setProperty("work_unit_id", workUnitId);
        p.setProperty("recovery_id", record.recoveryId());
        p.setProperty("recovery_state", status.recoveryState().name());
        p.setProperty("record_version", Long.toString(status.recordVersion()));
        p.setProperty("event_count", Integer.toString(registry.getRecoveryEvents(record.recoveryId()).size()));
        p.setProperty("journal_path", registry.journalPath().toAbsolutePath().toString());
        p.setProperty("armed_at_utc", Instant.now().toString());
        try (OutputStream out = Files.newOutputStream(root.resolve("java-arm.properties"))) {
            p.store(out, "System Master target Windows reboot qualification arm state");
        }
        System.out.println("PASS TARGET-WINDOWS-REBOOT-ARM assertions=" + assertions + " recovery=" + record.recoveryId());
    }

    private static void verify(Path root, String qualificationId, String verificationCommit, String runId) throws Exception {
        Properties arm = new Properties();
        try (InputStream in = Files.newInputStream(root.resolve("java-arm.properties"))) {
            arm.load(in);
        }
        eq(qualificationId, arm.getProperty("qualification_id"), "qualification identity unchanged");
        String workUnitId = arm.getProperty("work_unit_id");
        String recoveryId = arm.getProperty("recovery_id");
        long armedVersion = Long.parseLong(arm.getProperty("record_version"));

        RecoveryRegistry registry = new RecoveryRegistry(root.resolve("registry"));
        RecoveryRegistry.RecoveryStatus before = registry.getRecoveryStatus(workUnitId);
        eq(RecoveryState.WAITING_DEPENDENCY, before.recoveryState(), "recovery state survived Windows reboot");
        eq(armedVersion, before.recordVersion(), "authoritative recovery version survived Windows reboot");
        ok(registry.getRecovery(recoveryId).isPresent(), "recovery record survived Windows reboot");
        ok(registry.getRecoveryEvents(recoveryId).size() >= 2, "recovery history survived Windows reboot");

        RecoveryRecord resumed = registry.transitionRecovery(
                recoveryId, before.recordVersion(), RecoveryState.WAITING_DEPENDENCY, RecoveryState.CLASSIFYING,
                "TARGET_WINDOWS_REBOOT_VERIFIED", List.of("post-reboot-run:" + runId),
                "post-reboot-resume:" + qualificationId);
        eq(RecoveryState.CLASSIFYING, resumed.state(), "recovery remains operable after reboot");
        RecoveryRegistry.RecoveryStatus after = registry.getRecoveryStatus(workUnitId);
        eq(RecoveryState.CLASSIFYING, after.recoveryState(), "post-reboot state authoritative");
        ok(after.recordVersion() > armedVersion, "post-reboot transition advanced version");

        ContinuityQualificationLedger ledger = new ContinuityQualificationLedger();
        ledger.registerMapping(new RequirementMapping("G-RQ-004", "G-WP-002", "PROCESS_KILL+TARGET_WINDOWS_REBOOT", true));
        ledger.registerMapping(new RequirementMapping("G-RQ-072", "G-WP-015", "TARGET_WINDOWS_REBOOT+IOS_CLIENT_SUSPEND_RESUME", true));
        String sourceRef = "a01-windows-reboot-run:" + runId;
        String subjectDigest = arm.getProperty("arm_commit");
        ledger.recordEvidence(new Evidence("winreboot-g-rq-004-" + runId, "G-RQ-004", EvidenceClass.TARGET_WINDOWS_REBOOT,
                Standing.PASS, sourceRef, subjectDigest, Instant.now()));
        ledger.recordEvidence(new Evidence("winreboot-g-rq-072-" + runId, "G-RQ-072", EvidenceClass.TARGET_WINDOWS_REBOOT,
                Standing.PASS, sourceRef, subjectDigest, Instant.now()));
        ok(ledger.view("G-RQ-004").implementationSatisfied(), "G-RQ-004 satisfied by genuine Windows reboot evidence");
        eq(Standing.PASS, ledger.view("G-RQ-072").standings().get(EvidenceClass.TARGET_WINDOWS_REBOOT),
                "G-RQ-072 Windows reboot evidence passed");
        eq(Standing.NOT_STARTED, ledger.view("G-RQ-072").standings().get(EvidenceClass.TARGET_IOS_CLIENT_SUSPEND_RESUME),
                "G-RQ-072 iOS evidence remains not started");
        ok(!ledger.view("G-RQ-072").implementationSatisfied(), "G-RQ-072 remains incomplete until iOS evidence passes");

        Properties p = new Properties();
        p.setProperty("qualification_id", qualificationId);
        p.setProperty("arm_commit", arm.getProperty("arm_commit"));
        p.setProperty("verification_commit", verificationCommit);
        p.setProperty("arm_run_id", arm.getProperty("arm_run_id"));
        p.setProperty("verification_run_id", runId);
        p.setProperty("work_unit_id", workUnitId);
        p.setProperty("recovery_id", recoveryId);
        p.setProperty("pre_verify_state", before.recoveryState().name());
        p.setProperty("pre_verify_version", Long.toString(before.recordVersion()));
        p.setProperty("post_verify_state", after.recoveryState().name());
        p.setProperty("post_verify_version", Long.toString(after.recordVersion()));
        p.setProperty("g_rq_004_target_windows_reboot", "PASS");
        p.setProperty("g_rq_072_target_windows_reboot", "PASS");
        p.setProperty("g_rq_072_target_ios_suspend_resume", "NOT_STARTED");
        p.setProperty("g_rq_072_implementation_satisfied", "false");
        p.setProperty("verified_at_utc", Instant.now().toString());
        try (OutputStream out = Files.newOutputStream(root.resolve("java-verify.properties"))) {
            p.store(out, "System Master target Windows reboot qualification verification state");
        }
        System.out.println("PASS TARGET-WINDOWS-REBOOT-VERIFY assertions=" + assertions +
                " windows_evidence_requirements=2 g_rq_004=PASS g_rq_072_windows=PASS g_rq_072_ios=NOT_STARTED");
    }
}
