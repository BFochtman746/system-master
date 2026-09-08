package org.systemmaster.core;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;

public final class Fwp004QualificationTest {
    private static int tests = 0;
    private static final Instant NOW = Instant.parse("2026-09-08T12:00:00Z");

    public static void main(String[] args) {
        ChangeRegistry.ChangeRevision rev = revision(1);
        ChangeRegistry.ChangeRecord rec = record(rev);
        ChangePolicyEngine engine = new ChangePolicyEngine();
        ChangePolicyEngine.PolicyDefinition policy = ChangePolicyEngine.PolicyDefinition.standard("POLICY-1", 1);
        ImpactAssessmentService impact = new ImpactAssessmentService(java.time.Clock.fixed(NOW, java.time.ZoneOffset.UTC));
        AuthorityResolver resolver = new AuthorityResolver();
        ImpactAssessmentService.Assessment lowAssessment = impact.recordAssessment(rec, rev, lowInput(), contracts(), "assessor");
        ChangePolicyEngine.ClassificationDecision low = engine.classify(rec, rev, ChangePolicyEngine.ChangeType.SOFTWARE,
                lowAssessment, resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy);

        StandardChangeCatalog catalog = new StandardChangeCatalog();
        StandardChangeCatalog.StandardChangeModel model = standardModel();
        check(model.version() == 3, "standard model is versioned");
        check(model.digest().length() == 64, "standard model is content bound");
        check(catalog.evaluate(model, rec, rev, low, Set.of("PRE:BACKUP", "PRE:HEALTH"), NOW).standing()
                == StandardChangeCatalog.Standing.MATCHED_STANDARD, "bounded low risk standard match");

        ChangePolicyEngine.ClassificationDecision high = new ChangePolicyEngine.ClassificationDecision(
                low.changeId(), low.revision(), low.contentDigest(), low.targetDigest(), low.changeType(),
                ChangePolicyEngine.RiskClass.HIGH, ChangePolicyEngine.Standing.CLASSIFIED,
                low.policyId(), low.policyVersion(), low.policyDigest(), low.assessmentDigest(), List.of("RISK_DERIVED:HIGH"));
        check(catalog.evaluate(model, rec, rev, high, Set.of("PRE:BACKUP", "PRE:HEALTH"), NOW).standing()
                == StandardChangeCatalog.Standing.NORMAL_ASSESSMENT_REQUIRED, "high risk cannot use standard path");

        ChangePolicyEngine.ClassificationDecision wrongType = new ChangePolicyEngine.ClassificationDecision(
                low.changeId(), low.revision(), low.contentDigest(), low.targetDigest(), ChangePolicyEngine.ChangeType.DATA,
                low.riskClass(), low.standing(), low.policyId(), low.policyVersion(), low.policyDigest(), low.assessmentDigest(), List.of());
        check(catalog.evaluate(model, rec, rev, wrongType, Set.of("PRE:BACKUP", "PRE:HEALTH"), NOW).reasons()
                .contains("CHANGE_TYPE_CONSTRAINT_MISMATCH"), "standard type constraint exact");

        StandardChangeCatalog.StandardChangeModel wrongOwner = new StandardChangeCatalog.StandardChangeModel(
                "STD-2", 1, ChangePolicyEngine.ChangeType.SOFTWARE, "AUTH:OTHER", Set.of("target-a"),
                Set.of("PRE:BACKUP"), NOW.minusSeconds(3600), NOW.plusSeconds(7200), NOW.plusSeconds(3600), null);
        check(catalog.evaluate(wrongOwner, rec, rev, low, Set.of("PRE:BACKUP"), NOW).reasons()
                .contains("SEMANTIC_OWNER_CONSTRAINT_MISMATCH"), "standard semantic owner exact");

        StandardChangeCatalog.StandardChangeModel wrongTarget = new StandardChangeCatalog.StandardChangeModel(
                "STD-3", 1, ChangePolicyEngine.ChangeType.SOFTWARE, "AUTH:BOOKS", Set.of("target-b"),
                Set.of("PRE:BACKUP"), NOW.minusSeconds(3600), NOW.plusSeconds(7200), NOW.plusSeconds(3600), null);
        check(catalog.evaluate(wrongTarget, rec, rev, low, Set.of("PRE:BACKUP"), NOW).reasons()
                .contains("TARGET_SET_CONSTRAINT_MISMATCH"), "standard target set exact");
        check(catalog.evaluate(model, rec, rev, low, Set.of("PRE:BACKUP"), NOW).reasons()
                .contains("STANDARD_PREREQUISITE_MISSING"), "standard prerequisites current");
        check(catalog.evaluate(model, rec, rev, low, Set.of("PRE:BACKUP", "PRE:HEALTH"), NOW.plusSeconds(4000)).standing()
                == StandardChangeCatalog.Standing.EXPIRED_OR_REVIEW_REQUIRED, "standard review expiry enforced");
        boolean modelDigestRejected = false;
        try { new StandardChangeCatalog.StandardChangeModel("STD-X", 1, ChangePolicyEngine.ChangeType.SOFTWARE,
                "AUTH:BOOKS", Set.of("target-a"), Set.of(), NOW.minusSeconds(1), NOW.plusSeconds(100),
                NOW.plusSeconds(50), "bad"); }
        catch (IllegalArgumentException e) { modelDigestRejected = e.getMessage().contains("DIGEST"); }
        check(modelDigestRejected, "tampered standard model rejected");

        RecoveryPlanRegistry recovery = new RecoveryPlanRegistry();
        RecoveryPlanRegistry.RollbackTarget eligible = new RecoveryPlanRegistry.RollbackTarget(
                "SOFTWARE_ARTIFACT", "sha256:abc123", "schema:v5", RecoveryPlanRegistry.TargetStanding.CURRENT_ELIGIBLE);
        List<RecoveryPlanRegistry.IrreversibleStepMarker> markers = List.of(
                new RecoveryPlanRegistry.IrreversibleStepMarker("step-migrate", true, "schema migration commits irreversible data transform"));
        RecoveryPlanRegistry.RecoveryPlan rollback = recovery.bind("REC-1", 2, rec, rev,
                RecoveryPlanRegistry.Strategy.ROLLBACK, "return to exact prior artifact", eligible, markers,
                List.of("verify:health"), NOW);
        check(rollback.strategy() == RecoveryPlanRegistry.Strategy.ROLLBACK, "recovery strategy explicit");
        check(rollback.version() == 2, "recovery plan versioned");
        check(rollback.changeContentDigest().equals(rev.contentDigest()), "recovery plan binds exact revision digest");
        check(rollback.targetDigest().equals(rev.targetDigest()), "recovery plan binds exact target digest");
        check(rollback.rollbackTarget().immutableIdentity().equals("sha256:abc123"), "rollback target immutable identity exact");
        check(rollback.rollbackTarget().compatibilityIdentity().equals("schema:v5"), "rollback compatibility identity exact");
        boolean missingTargetRejected = false;
        try { recovery.bind("REC-X", 1, rec, rev, RecoveryPlanRegistry.Strategy.ROLLBACK, "r", null, List.of(), List.of(), NOW); }
        catch (IllegalArgumentException e) { missingTargetRejected = e.getMessage().contains("ROLLBACK_TARGET_REQUIRED"); }
        check(missingTargetRejected, "rollback strategy requires exact target");
        boolean noReturnRationaleRejected = false;
        try { recovery.bind("REC-X2", 1, rec, rev, RecoveryPlanRegistry.Strategy.NO_AUTOMATIC_RETURN, "", null, List.of(), List.of(), NOW); }
        catch (IllegalArgumentException e) { noReturnRationaleRejected = e.getMessage().contains("RATIONALE"); }
        check(noReturnRationaleRejected, "no automatic return requires rationale");
        check(recovery.hasExplicitPointOfNoReturn(rollback), "point of no return explicit");
        check(recovery.rollbackStanding(rollback, Set.of()) == RecoveryPlanRegistry.RollbackStanding.ALLOWED,
                "rollback allowed before point of no return");
        check(recovery.rollbackStanding(rollback, Set.of("step-migrate")) == RecoveryPlanRegistry.RollbackStanding.POINT_OF_NO_RETURN_CROSSED,
                "crossed point prohibits automatic rollback");
        RecoveryPlanRegistry.RecoveryPlan unknownTarget = recovery.bind("REC-U", 1, rec, rev,
                RecoveryPlanRegistry.Strategy.ROLLBACK, "r", new RecoveryPlanRegistry.RollbackTarget(
                        "SOFTWARE_ARTIFACT", "sha256:def", "schema:v5", RecoveryPlanRegistry.TargetStanding.UNKNOWN),
                List.of(), List.of(), NOW);
        check(recovery.rollbackStanding(unknownTarget, Set.of()) == RecoveryPlanRegistry.RollbackStanding.TARGET_BLOCKED,
                "unknown rollback target blocked");
        RecoveryPlanRegistry.RecoveryPlan ineligibleTarget = recovery.bind("REC-I", 1, rec, rev,
                RecoveryPlanRegistry.Strategy.ROLLBACK, "r", new RecoveryPlanRegistry.RollbackTarget(
                        "SOFTWARE_ARTIFACT", "sha256:ghi", "schema:v5", RecoveryPlanRegistry.TargetStanding.INELIGIBLE),
                List.of(), List.of(), NOW);
        check(recovery.rollbackStanding(ineligibleTarget, Set.of()) == RecoveryPlanRegistry.RollbackStanding.TARGET_BLOCKED,
                "ineligible rollback target blocked");
        boolean staleRecoveryRejected = false;
        try { recovery.bind("REC-S", 1, record(revision(2)), rev, RecoveryPlanRegistry.Strategy.NOT_APPLICABLE,
                "no state change", null, List.of(), List.of(), NOW); }
        catch (IllegalArgumentException e) { staleRecoveryRejected = e.getMessage().contains("STALE_REVISION_BINDING"); }
        check(staleRecoveryRejected, "recovery plan rejects stale change revision");

        MaintenanceWindowService windows = new MaintenanceWindowService();
        MaintenanceWindowService.MaintenanceWindow window = new MaintenanceWindowService.MaintenanceWindow(
                "WIN-1", 4, ZoneId.of("America/New_York"), NOW.minusSeconds(600), NOW.plusSeconds(600),
                Set.of("target-a"), Set.of("DEPLOY", "MIGRATE"), "AUTH:EMERGENCY", null);
        check(window.timezone().equals(ZoneId.of("America/New_York")), "maintenance timezone first class");
        check(window.version() == 4 && window.digest().length() == 64, "maintenance window versioned and content bound");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-a"), NOW, null).standing()
                == MaintenanceWindowService.Standing.OPEN, "inside maintenance window open");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-a"), NOW.minusSeconds(700), null).standing()
                == MaintenanceWindowService.Standing.WAIT_OUTSIDE_WINDOW, "before window waits");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-a"), NOW.plusSeconds(700), null).standing()
                == MaintenanceWindowService.Standing.WAIT_OUTSIDE_WINDOW, "after window waits");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-a"), NOW.plusSeconds(700), "AUTH:EMERGENCY").standing()
                == MaintenanceWindowService.Standing.OVERRIDE_ACCEPTED, "explicit override authority accepted");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-a"), NOW.plusSeconds(700), "AUTH:OTHER").standing()
                == MaintenanceWindowService.Standing.OVERRIDE_REJECTED, "wrong override authority rejected");
        check(windows.evaluate(window, "READ", Set.of("target-a"), NOW, null).standing()
                == MaintenanceWindowService.Standing.NOT_APPLICABLE, "unlisted action not covered by window");
        check(windows.evaluate(window, "DEPLOY", Set.of("target-b"), NOW, null).standing()
                == MaintenanceWindowService.Standing.NOT_APPLICABLE, "unlisted target not covered by window");

        VerificationPlanService verification = new VerificationPlanService();
        List<VerificationPlanService.Criterion> criteria = List.of(
                new VerificationPlanService.Criterion("C1", "health endpoint reports healthy", "DOMAIN_HEALTH", "predicate:health-v1"),
                new VerificationPlanService.Criterion("C2", "error rate remains bounded", "021T_METRIC", "predicate:error-rate-v2"));
        VerificationPlanService.VerificationPlan verify = verification.bind("VER-1", 3, rec, rev, criteria, NOW.minusSeconds(60));
        check(verify.criteria().size() == 2, "success criteria predeclared");
        check(verify.version() == 3, "verification plan versioned");
        check(verify.changeContentDigest().equals(rev.contentDigest()), "verification plan binds exact revision digest");
        check(verify.targetDigest().equals(rev.targetDigest()), "verification plan binds exact target digest");
        check(verification.isCurrentFor(verify, rec, rev), "verification plan current for exact subject");
        check(!verification.isCurrentFor(verify, record(revision(2)), revision(2)), "verification plan stale after material revision");
        boolean emptyCriteriaRejected = false;
        try { verification.bind("VER-X", 1, rec, rev, List.of(), NOW); }
        catch (IllegalArgumentException e) { emptyCriteriaRejected = e.getMessage().contains("SUCCESS_CRITERIA_REQUIRED"); }
        check(emptyCriteriaRejected, "material verification requires planned criteria");
        boolean duplicateCriteriaRejected = false;
        try { verification.bind("VER-D", 1, rec, rev, List.of(
                new VerificationPlanService.Criterion("C1", "a", "E", "P1"),
                new VerificationPlanService.Criterion("C1", "b", "E", "P2")), NOW); }
        catch (IllegalArgumentException e) { duplicateCriteriaRejected = e.getMessage().contains("DUPLICATE_CRITERION_ID"); }
        check(duplicateCriteriaRejected, "verification criterion identities unique");

        System.out.println("PASS F-WP-004 tests=" + tests + " requirements=6");
    }

    private static StandardChangeCatalog.StandardChangeModel standardModel() {
        return new StandardChangeCatalog.StandardChangeModel("STD-1", 3, ChangePolicyEngine.ChangeType.SOFTWARE,
                "AUTH:BOOKS", Set.of("target-a"), Set.of("PRE:BACKUP", "PRE:HEALTH"),
                NOW.minusSeconds(3600), NOW.plusSeconds(7200), NOW.plusSeconds(3600), null);
    }
    private static ChangeRegistry.ChangeRevision revision(long n) {
        return new ChangeRegistry.ChangeRevision("change-1", n, n - 1, "title", "SOFTWARE", "AUTH:BOOKS",
                "selector", List.of("target-a"), "target-digest-" + n, "intent", "rationale", "digest-" + n, "author", NOW);
    }
    private static ChangeRegistry.ChangeRecord record(ChangeRegistry.ChangeRevision v) {
        return new ChangeRegistry.ChangeRecord(v.changeId(), v.revision(), v.title(), v.changeType(), "UNASSESSED",
                v.semanticOwnerRef(), "ASSESSING", "creator", NOW, NOW, v.contentDigest(), v.targetDigest());
    }
    private static GovernanceContracts.Snapshot contracts() {
        return new GovernanceContracts.Snapshot("021N:n", GovernanceContracts.Standing.CURRENT,
                "021Q:q", GovernanceContracts.Standing.CURRENT, "021K:k", GovernanceContracts.Standing.CURRENT,
                "021Y:y", GovernanceContracts.Standing.CURRENT, "PLATFORM-006:route", NOW);
    }
    private static ImpactAssessmentService.Input lowInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Magnitude.NONE,
                false,false,false,false,false, ImpactAssessmentService.Compatibility.COMPATIBLE,
                ImpactAssessmentService.Magnitude.NONE, ImpactAssessmentService.Magnitude.NONE,
                ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Reversibility.REVERSIBLE, List.of("e1"));
    }
    private static void check(boolean value, String message) {
        tests++;
        if (!value) throw new AssertionError("FAIL " + tests + ": " + message);
    }
}
