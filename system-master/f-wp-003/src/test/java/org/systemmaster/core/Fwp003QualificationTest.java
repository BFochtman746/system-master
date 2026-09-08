package org.systemmaster.core;

import java.time.Instant;
import java.util.List;
import java.util.Set;

public final class Fwp003QualificationTest {
    private static int tests = 0;
    private static final Instant NOW = Instant.parse("2026-09-08T00:00:00Z");

    public static void main(String[] args) {
        ChangeRegistry.ChangeRevision rev = revision(1, "SOFTWARE", "AUTH:BOOKS");
        ChangeRegistry.ChangeRecord rec = record(rev, "UNASSESSED");
        AuthorityResolver resolver = new AuthorityResolver();
        ImpactAssessmentService impact = new ImpactAssessmentService(java.time.Clock.fixed(NOW, java.time.ZoneOffset.UTC));
        ChangePolicyEngine engine = new ChangePolicyEngine();
        ChangePolicyEngine.PolicyDefinition policy = ChangePolicyEngine.PolicyDefinition.standard("POLICY-1", 1);

        check(resolver.resolve(rev, Set.of("AUTH:BOOKS")).resolved(), "authority resolves current owner");
        check(!resolver.resolve(rev, Set.of("AUTH:OTHER")).resolved(), "unknown authority fails closed");

        ImpactAssessmentService.Assessment low = impact.recordAssessment(rec, rev, lowInput(), contracts(), "assessor");
        check(low.complete(), "complete low assessment");
        check(low.changeContentDigest().equals(rev.contentDigest()), "assessment binds exact revision digest");
        check(low.targetDigest().equals(rev.targetDigest()), "assessment binds exact target digest");

        ChangePolicyEngine.ClassificationDecision lowDecision = engine.classify(rec, rev,
                ChangePolicyEngine.ChangeType.SOFTWARE, low, resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy);
        check(lowDecision.standing() == ChangePolicyEngine.Standing.CLASSIFIED, "low change classified");
        check(lowDecision.riskClass() == ChangePolicyEngine.RiskClass.LOW, "low risk derived");

        check(engine.classify(rec, rev, ChangePolicyEngine.ChangeType.UNCLASSIFIED, low,
                resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy).standing()
                == ChangePolicyEngine.Standing.ASSESSMENT_REQUIRED, "change type required");
        check(engine.classify(rec, rev, ChangePolicyEngine.ChangeType.SOFTWARE, low,
                resolver.resolve(rev, Set.of("AUTH:OTHER")), policy).standing()
                == ChangePolicyEngine.Standing.FAIL_CLOSED, "unresolved semantic authority fails closed");
        check(engine.classify(rec, rev, ChangePolicyEngine.ChangeType.SOFTWARE, low,
                resolver.resolve(rev, Set.of("AUTH:BOOKS")), null).standing()
                == ChangePolicyEngine.Standing.ASSESSMENT_REQUIRED, "policy unavailable blocks classification");

        ImpactAssessmentService.Assessment noEvidence = impact.recordAssessment(rec, rev,
                new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Magnitude.NONE,
                        false,false,false,false,false, ImpactAssessmentService.Compatibility.COMPATIBLE,
                        ImpactAssessmentService.Magnitude.NONE, ImpactAssessmentService.Magnitude.NONE,
                        ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Reversibility.REVERSIBLE, List.of()),
                contracts(), "assessor");
        check(!noEvidence.complete() && noEvidence.gaps().contains("ASSESSMENT_EVIDENCE_MISSING"), "missing evidence explicit");

        ImpactAssessmentService.Assessment privacyUnknown = impact.recordAssessment(rec, rev, securityInput(),
                contracts(GovernanceContracts.Standing.UNKNOWN, GovernanceContracts.Standing.CURRENT,
                        GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT), "assessor");
        check(!privacyUnknown.complete() && privacyUnknown.gaps().contains("021N_PRIVACY_UNKNOWN"), "021N unknown blocks material privacy impact");

        ImpactAssessmentService.Assessment securityUnknown = impact.recordAssessment(rec, rev, securityInput(),
                contracts(GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.UNKNOWN,
                        GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT), "assessor");
        check(!securityUnknown.complete() && securityUnknown.gaps().contains("021Q_RUNTIME_SECURITY_UNKNOWN"), "021Q unknown blocks trust-boundary impact");

        ImpactAssessmentService.Assessment providerUnknown = impact.recordAssessment(rec, rev, providerInput(),
                contracts(GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT,
                        GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.UNKNOWN), "assessor");
        check(!providerUnknown.complete() && providerUnknown.gaps().contains("021Y_PROVIDER_GOVERNANCE_UNKNOWN"), "021Y provider unknown explicit");

        ImpactAssessmentService.Assessment stateUnknown = impact.recordAssessment(rec, rev, stateInput(),
                contracts(GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT,
                        GovernanceContracts.Standing.UNKNOWN, GovernanceContracts.Standing.CURRENT), "assessor");
        check(!stateUnknown.complete() && stateUnknown.gaps().contains("021K_STATE_CONSISTENCY_UNKNOWN"), "021K state standing unknown explicit");

        ImpactAssessmentService.Assessment securityRestricted = impact.recordAssessment(rec, rev, securityInput(),
                contracts(GovernanceContracts.Standing.RESTRICTED, GovernanceContracts.Standing.RESTRICTED,
                        GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT), "assessor");
        ChangePolicyEngine.ClassificationDecision secDecision = engine.classify(rec, rev, ChangePolicyEngine.ChangeType.SECURITY,
                securityRestricted, resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy);
        check(secDecision.standing() == ChangePolicyEngine.Standing.CLASSIFIED, "evaluated restrictions remain classifiable");
        check(secDecision.riskClass().ordinal() >= ChangePolicyEngine.RiskClass.HIGH.ordinal(), "security/privacy restrictions raise risk");
        check(secDecision.reasonCodes().contains("021N_RESTRICTION_PRESENT") && secDecision.reasonCodes().contains("021Q_RESTRICTION_PRESENT"),
                "security privacy restriction reason codes preserved");

        ImpactAssessmentService.Assessment providerRestricted = impact.recordAssessment(rec, rev, providerInput(),
                contracts(GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT,
                        GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.RESTRICTED), "assessor");
        ChangePolicyEngine.ClassificationDecision providerDecision = engine.classify(rec, rev, ChangePolicyEngine.ChangeType.PROVIDER,
                providerRestricted, resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy);
        check(providerDecision.reasonCodes().contains("021Y_PROVIDER_RESTRICTION_PRESENT"), "provider restriction preserved");

        ImpactAssessmentService.Assessment high = impact.recordAssessment(rec, rev, highInput(), contracts(), "assessor");
        ChangePolicyEngine.ClassificationDecision highDecision = engine.classify(rec, rev, ChangePolicyEngine.ChangeType.SOFTWARE,
                high, resolver.resolve(rev, Set.of("AUTH:BOOKS")), policy);
        check(highDecision.riskClass().ordinal() > lowDecision.riskClass().ordinal(), "risk increases with impact");

        ChangePolicyEngine.ApprovalPolicySnapshot lowPolicy = engine.evaluateApprovalPolicy(lowDecision, policy);
        ChangePolicyEngine.ApprovalPolicySnapshot highPolicy = engine.evaluateApprovalPolicy(highDecision, policy);
        check(highPolicy.requiredRoles().size() > lowPolicy.requiredRoles().size(), "approval policy is risk tiered");
        check(highPolicy.policyDigest().equals(policy.digest()), "approval snapshot binds exact policy digest");

        ChangeRegistry.ChangeRevision rev2 = revision(2, "SOFTWARE", "AUTH:BOOKS");
        ChangeRegistry.ChangeRecord rec2 = record(rev2, "UNASSESSED");
        check(engine.classify(rec2, rev2, ChangePolicyEngine.ChangeType.SOFTWARE, low,
                resolver.resolve(rev2, Set.of("AUTH:BOOKS")), policy).standing()
                == ChangePolicyEngine.Standing.FAIL_CLOSED, "stale assessment cannot classify newer revision");

        boolean staleRejected = false;
        try { impact.recordAssessment(rec2, rev, lowInput(), contracts(), "assessor"); }
        catch (IllegalArgumentException e) { staleRejected = e.getMessage().contains("STALE_REVISION_BINDING"); }
        check(staleRejected, "impact service rejects stale revision binding");

        ChangePolicyEngine.PolicyDefinition samePolicy = ChangePolicyEngine.PolicyDefinition.standard("POLICY-1", 1);
        check(policy.digest().equals(samePolicy.digest()), "policy digest deterministic");

        System.out.println("PASS F-WP-003 tests=" + tests + " requirements=5");
    }

    private static ChangeRegistry.ChangeRevision revision(long revision, String type, String owner) {
        String content = "digest-" + revision;
        return new ChangeRegistry.ChangeRevision("change-1", revision, revision - 1, "title", type, owner,
                "selector", List.of("target-a"), "target-digest", "intent", "rationale", content, "author", NOW);
    }

    private static ChangeRegistry.ChangeRecord record(ChangeRegistry.ChangeRevision v, String risk) {
        return new ChangeRegistry.ChangeRecord(v.changeId(), v.revision(), v.title(), v.changeType(), risk,
                v.semanticOwnerRef(), "ASSESSING", "creator", NOW, NOW, v.contentDigest(), v.targetDigest());
    }

    private static GovernanceContracts.Snapshot contracts() {
        return contracts(GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT,
                GovernanceContracts.Standing.CURRENT, GovernanceContracts.Standing.CURRENT);
    }

    private static GovernanceContracts.Snapshot contracts(GovernanceContracts.Standing n, GovernanceContracts.Standing q,
            GovernanceContracts.Standing k, GovernanceContracts.Standing y) {
        return new GovernanceContracts.Snapshot("021N:privacy", n, "021Q:security", q, "021K:state", k,
                "021Y:provider", y, "PLATFORM-006:route", NOW);
    }

    private static ImpactAssessmentService.Input lowInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Magnitude.NONE,
                false,false,false,false,false, ImpactAssessmentService.Compatibility.COMPATIBLE,
                ImpactAssessmentService.Magnitude.NONE, ImpactAssessmentService.Magnitude.NONE,
                ImpactAssessmentService.Magnitude.LOW, ImpactAssessmentService.Reversibility.REVERSIBLE, List.of("e1"));
    }

    private static ImpactAssessmentService.Input securityInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Magnitude.LOW,
                true,true,false,false,true, ImpactAssessmentService.Compatibility.COMPATIBLE,
                ImpactAssessmentService.Magnitude.NONE, ImpactAssessmentService.Magnitude.LOW,
                ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Reversibility.CONDITIONAL, List.of("e-sec"));
    }

    private static ImpactAssessmentService.Input providerInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Magnitude.MODERATE,
                false,false,false,false,false, ImpactAssessmentService.Compatibility.COMPATIBLE,
                ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Magnitude.NONE,
                ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Reversibility.CONDITIONAL, List.of("e-provider"));
    }

    private static ImpactAssessmentService.Input stateInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Magnitude.MODERATE,
                false,false,false,false,false, ImpactAssessmentService.Compatibility.COMPATIBLE,
                ImpactAssessmentService.Magnitude.NONE, ImpactAssessmentService.Magnitude.MODERATE,
                ImpactAssessmentService.Magnitude.MODERATE, ImpactAssessmentService.Reversibility.CONDITIONAL, List.of("e-state"));
    }

    private static ImpactAssessmentService.Input highInput() {
        return new ImpactAssessmentService.Input(ImpactAssessmentService.Magnitude.HIGH, ImpactAssessmentService.Magnitude.HIGH,
                true,true,true,true,true, ImpactAssessmentService.Compatibility.BREAKING,
                ImpactAssessmentService.Magnitude.HIGH, ImpactAssessmentService.Magnitude.HIGH,
                ImpactAssessmentService.Magnitude.HIGH, ImpactAssessmentService.Reversibility.IRREVERSIBLE, List.of("e-high"));
    }

    private static void check(boolean value, String message) {
        tests++;
        if (!value) throw new AssertionError("FAIL " + tests + ": " + message);
    }
}
