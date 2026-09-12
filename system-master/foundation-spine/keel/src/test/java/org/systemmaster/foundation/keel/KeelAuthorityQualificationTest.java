package org.systemmaster.foundation.keel;

import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ActionEnvelopeV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ConstraintDeclV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ConstraintHardness;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ContractGateReceiptV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ContractGateStanding;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.DelegationCeilingV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.GoalIdentityV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.GoalRevisionCandidateV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.GoalRevisionV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.GoalStanding;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.GovernedGoalRefV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.HumanControlRequirementV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.KeelException;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.KeelValidationReceiptV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ParentGoalRevisionRefV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.RefinementStanding;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.RequirementDeclV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.RequirementKind;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.ResourceCeilingV1;
import org.systemmaster.foundation.keel.KeelAuthorityRuntime.SuccessCriterionDeclV1;

public final class KeelAuthorityQualificationTest {
    private static final String OWNER = "SYS-FOUNDATION-KEEL";
    private static final String SUBJECT = "system-master.foundation.keel.goal-revision";
    private static final String VERSION = "1.0.0";
    private static final String CONTRACT_DIGEST = "a".repeat(64);
    private static final String GATE_DIGEST = "b".repeat(64);
    private static final String CANONICALIZER = "keel-canonical-v1";
    private static final AtomicInteger CASES = new AtomicInteger();

    private KeelAuthorityQualificationTest() {}

    public static void main(String[] args) throws Exception {
        identityRevisionPublicationCases();
        constraintCases();
        ceilingCases();
        ownershipEvidenceFenceCases();
        journalConcurrencyCases();
        workChainContractCases();
        if (CASES.get() != 56) throw new AssertionError("case denominator " + CASES.get());
        System.out.println("PASS FOUNDATION_KEEL cases=56");
    }

    private static void identityRevisionPublicationCases() throws Exception {
        Path dir = temp("identity");
        KeelAuthorityRuntime runtime = runtime(dir);
        GoalIdentityV1 identity = identity("goal-main");

        // 1 create goal identity
        GoalIdentityV1 created = runtime.createGoalIdentity("cmd-create", 0, identity);
        pass(created.equals(identity));

        // 2 exact create replay
        pass(runtime.createGoalIdentity("cmd-create", 0, identity).equals(identity) && runtime.registryRevision() == 1);

        // 3 conflicting identity reuse rejects
        expectCode("GOAL_IDENTITY_CONFLICT", () -> runtime.createGoalIdentity("cmd-create-conflict", 1,
                new GoalIdentityV1("goal-main", OWNER, "principal:other", "evidence:t0", "contract:keel")));
        pass(runtime.registryRevision() == 1);

        GoalRevisionCandidateV1 first = candidate("goal-main", 1, null, "root problem", hard100(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate());
        long beforePublish = runtime.registryRevision();

        // 4 publish first governed revision
        GoalRevisionV1 revision1 = runtime.publishGoalRevision("cmd-publish-1", beforePublish, first);
        pass(runtime.goalStanding("goal-main", 1) == GoalStanding.GOVERNED && revision1.revision() == 1);

        // 5 exact revision replay
        pass(runtime.publishGoalRevision("cmd-publish-1", beforePublish, first).equals(revision1)
                && runtime.registryRevision() == beforePublish + 1);

        // 6 same revision different digest rejects
        GoalRevisionCandidateV1 conflict = candidate("goal-main", 1, null, "changed problem", hard100(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate());
        expectAny(Set.of("REVISION_CONFLICT", "CONTENT_DIGEST_CONFLICT"),
                () -> runtime.publishGoalRevision("cmd-publish-conflict", runtime.registryRevision(), conflict));
        pass(runtime.registryRevision() == beforePublish + 1);

        ParentGoalRevisionRefV1 parent = ref(revision1);
        GoalRevisionCandidateV1 second = candidate("goal-main", 2, parent, "root problem refined", hard90(), baseRequirements(), baseSuccess(),
                narrowerDelegation(), narrowerResource(), List.of(), narrowerAction(), null, admittedGate());

        // 7 stale expected registry revision rejects without mutation
        long stableRevision = runtime.registryRevision();
        expectCode("KEEL_REGISTRY_REVISION_CONFLICT",
                () -> runtime.publishGoalRevision("cmd-stale", stableRevision - 1, second));
        pass(runtime.registryRevision() == stableRevision);

        // 8 rejected publication leaves canonical state/current pointer unchanged
        pass(runtime.governedGoalRef("goal-main").goalRevision() == 1 && runtime.goalRevision("goal-main", 2) == null);

        // 9 supersession preserves immutable history
        GoalRevisionV1 revision2 = runtime.publishGoalRevision("cmd-publish-2", stableRevision, second);
        pass(runtime.goalRevision("goal-main", 1).equals(revision1)
                && runtime.goalStanding("goal-main", 1) == GoalStanding.SUPERSEDED
                && runtime.governedGoalRef("goal-main").goalRevisionId().equals(revision2.goalRevisionId()));

        // 10 retired goal rejects new descendant publication
        runtime.retireGoal("cmd-retire", runtime.registryRevision(), "goal-main");
        GoalRevisionCandidateV1 third = candidate("goal-main", 3, ref(revision2), "third", hard80(), baseRequirements(), baseSuccess(),
                narrowerDelegation(), narrowerResource(), List.of(), narrowerAction(), null, admittedGate());
        expectCode("GOAL_RETIRED", () -> runtime.publishGoalRevision("cmd-after-retire", runtime.registryRevision(), third));
        pass(runtime.goalStanding("goal-main", 2) == GoalStanding.RETIRED);
    }

    private static void constraintCases() throws Exception {
        // 11 child preserves hard constraint
        Fixture f11 = fixture("c11", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionV1 c11 = f11.runtime.publishGoalRevision("child", f11.runtime.registryRevision(),
                f11.child(hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null));
        pass(c11.revision() == 2);

        // 12 child strengthens hard constraint
        Fixture f12 = fixture("c12", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f12.runtime.publishGoalRevision("child", f12.runtime.registryRevision(),
                f12.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 13 child removes hard constraint -> reject
        Fixture f13 = fixture("c13", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("HARD_CONSTRAINT_REMOVED", () -> f13.runtime.publishGoalRevision("child", f13.runtime.registryRevision(),
                f13.child(List.of(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f13.runtime.goalRevision(f13.goalId, 2) == null);

        // 14 child weakens hard constraint -> reject
        Fixture f14 = fixture("c14", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("HARD_CONSTRAINT_WEAKENED", () -> f14.runtime.publishGoalRevision("child", f14.runtime.registryRevision(),
                f14.child(hard110(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f14.runtime.goalRevision(f14.goalId, 2) == null);

        ConstraintDeclV1 softA = new ConstraintDeclV1("soft", ConstraintHardness.SOFT, "STYLE", "A", "EXACT", null, null);
        ConstraintDeclV1 softBDisposition = new ConstraintDeclV1("soft", ConstraintHardness.SOFT, "STYLE", "B", "EXACT", "parent:soft", "explicit tradeoff");
        ConstraintDeclV1 softBNoDisposition = new ConstraintDeclV1("soft", ConstraintHardness.SOFT, "STYLE", "B", "EXACT", "parent:soft", null);

        // 15 soft constraint preserved
        Fixture f15 = fixture("c15", List.of(softA), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f15.runtime.publishGoalRevision("child", f15.runtime.registryRevision(),
                f15.child(List.of(softA), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 16 changed soft constraint with explicit disposition passes
        Fixture f16 = fixture("c16", List.of(softA), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f16.runtime.publishGoalRevision("child", f16.runtime.registryRevision(),
                f16.child(List.of(softBDisposition), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 17 silently changed/dropped soft constraint rejects
        Fixture f17 = fixture("c17", List.of(softA), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("SOFT_CONSTRAINT_UNDISPOSITIONED", () -> f17.runtime.publishGoalRevision("child", f17.runtime.registryRevision(),
                f17.child(List.of(softBNoDisposition), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f17.runtime.goalRevision(f17.goalId, 2) == null);

        // 18 unknown comparator fails closed
        ConstraintDeclV1 unknown = new ConstraintDeclV1("unknown", ConstraintHardness.HARD, "CUSTOM", "x", "UNREGISTERED", null, null);
        Fixture f18 = fixture("c18", List.of(unknown), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("UNKNOWN_COMPARATOR", () -> f18.runtime.publishGoalRevision("child", f18.runtime.registryRevision(),
                f18.child(List.of(unknown), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f18.runtime.previewRefinement(f18.parentRef, f18.child(List.of(unknown), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null))
                == RefinementStanding.UNKNOWN);

        // 19 exact parent revision and digest are required
        Fixture f19 = fixture("c19", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        ParentGoalRevisionRefV1 wrong = new ParentGoalRevisionRefV1(f19.goalId, 1, f19.parentRef.goalRevisionId(), "f".repeat(64));
        GoalRevisionCandidateV1 badParent = candidate(f19.goalId, 2, wrong, "child", hard90(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate());
        expectCode("PARENT_DIGEST_MISMATCH", () -> f19.runtime.publishGoalRevision("child", f19.runtime.registryRevision(), badParent));
        pass(f19.runtime.goalRevision(f19.goalId, 2) == null);

        // 20 a moving/latest pointer cannot replace an exact parent ref
        Fixture f20 = fixture("c20", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionCandidateV1 noParent = candidate(f20.goalId, 2, null, "child", hard90(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate());
        expectCode("UNKNOWN_PARENT_REVISION", () -> f20.runtime.publishGoalRevision("child", f20.runtime.registryRevision(), noParent));
        pass(f20.runtime.goalRevision(f20.goalId, 2) == null);

        // 21 retired/unknown parent standing fails closed
        Path d21 = temp("c21");
        KeelAuthorityRuntime r21 = runtime(d21);
        r21.createGoalIdentity("p-id", 0, identity("parent-21"));
        GoalRevisionV1 p21 = r21.publishGoalRevision("p-rev", 1, candidate("parent-21", 1, null, "parent", hard100(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate()));
        r21.retireGoal("p-retire", 2, "parent-21");
        r21.createGoalIdentity("c-id", 3, identity("child-21"));
        GoalRevisionCandidateV1 child21 = candidate("child-21", 1, ref(p21), "child", hard90(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate());
        expectCode("PARENT_NOT_GOVERNED", () -> r21.publishGoalRevision("c-rev", 4, child21));
        pass(r21.goalRevision("child-21", 1) == null);

        // 22 inherited unknown/error state cannot be cleared by omission
        Fixture f22 = fixture("c22", List.of(unknown), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("HARD_CONSTRAINT_REMOVED", () -> f22.runtime.publishGoalRevision("child", f22.runtime.registryRevision(),
                f22.child(List.of(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f22.runtime.goalRevision(f22.goalId, 2) == null);
    }

    private static void ceilingCases() throws Exception {
        // 23 equal delegation ceiling passes
        Fixture f23 = fixture("d23", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f23.runtime.publishGoalRevision("child", f23.runtime.registryRevision(),
                f23.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 24 narrower delegation ceiling passes
        Fixture f24 = fixture("d24", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f24.runtime.publishGoalRevision("child", f24.runtime.registryRevision(),
                f24.child(hard90(), baseRequirements(), List.of(), narrowerDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 25 expanded delegation ceiling rejects
        Fixture f25 = fixture("d25", hard100(), baseRequirements(), List.of(), narrowerDelegation(), baseResource(), baseAction(), null);
        expectCode("DELEGATION_CEILING_EXPANDED", () -> f25.runtime.publishGoalRevision("child", f25.runtime.registryRevision(),
                f25.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f25.runtime.goalRevision(f25.goalId, 2) == null);

        // 26 Keel delegation ceiling contains no concrete grant/assignee/revocation standing
        pass(noRecordComponentContains(DelegationCeilingV1.class, Set.of("grant", "assignee", "revocation", "capabilitytoken")));

        // 27 equal resource ceiling passes
        Fixture f27 = fixture("r27", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f27.runtime.publishGoalRevision("child", f27.runtime.registryRevision(),
                f27.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 28 narrower resource ceiling passes
        Fixture f28 = fixture("r28", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f28.runtime.publishGoalRevision("child", f28.runtime.registryRevision(),
                f28.child(hard90(), baseRequirements(), List.of(), baseDelegation(), narrowerResource(), baseAction(), null)).revision() == 2);

        // 29 expanded resource ceiling rejects
        Fixture f29 = fixture("r29", hard100(), baseRequirements(), List.of(), baseDelegation(), narrowerResource(), baseAction(), null);
        expectCode("RESOURCE_CEILING_EXPANDED", () -> f29.runtime.publishGoalRevision("child", f29.runtime.registryRevision(),
                f29.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f29.runtime.goalRevision(f29.goalId, 2) == null);

        // 30 Keel resource ceiling contains no reservation/grant/accounting truth
        pass(noRecordComponentContains(ResourceCeilingV1.class, Set.of("reservation", "grant", "balance", "consumption", "lease")));

        // 31 narrower allowed actions pass
        Fixture f31 = fixture("a31", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f31.runtime.publishGoalRevision("child", f31.runtime.registryRevision(),
                f31.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), narrowerAction(), null)).revision() == 2);

        // 32 expanded allowed actions reject
        Fixture f32 = fixture("a32", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), narrowerAction(), null);
        expectCode("ALLOWED_ACTION_EXPANDED", () -> f32.runtime.publishGoalRevision("child", f32.runtime.registryRevision(),
                f32.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f32.runtime.goalRevision(f32.goalId, 2) == null);

        // 33 added forbidden action passes
        ActionEnvelopeV1 addedForbidden = new ActionEnvelopeV1(Set.of("READ"), Set.of("DELETE", "WRITE"), List.of("policy:action"));
        Fixture f33 = fixture("a33", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f33.runtime.publishGoalRevision("child", f33.runtime.registryRevision(),
                f33.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), addedForbidden, null)).revision() == 2);

        // 34 removed inherited forbidden action rejects
        Fixture f34 = fixture("a34", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        ActionEnvelopeV1 removedForbidden = new ActionEnvelopeV1(Set.of("READ"), Set.of(), List.of("policy:action"));
        expectCode("FORBIDDEN_ACTION_REMOVED", () -> f34.runtime.publishGoalRevision("child", f34.runtime.registryRevision(),
                f34.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), removedForbidden, null)));
        pass(f34.runtime.goalRevision(f34.goalId, 2) == null);

        // 35 forbidden dominates allowed
        ActionEnvelopeV1 overlap = new ActionEnvelopeV1(Set.of("WRITE"), Set.of("WRITE"), List.of("policy:action"));
        pass(!overlap.ceilingContains("WRITE"));

        // 36 weakened required HITL condition rejects
        HumanControlRequirementV1 strict = new HumanControlRequirementV1("human-high-risk", 50, true, "HUMAN_APPROVAL_RECEIPT", "policy:hitl");
        HumanControlRequirementV1 weak = new HumanControlRequirementV1("human-high-risk", 70, false, "HUMAN_APPROVAL_RECEIPT", "policy:hitl");
        Fixture f36 = fixture("h36", hard100(), baseRequirements(), List.of(strict), baseDelegation(), baseResource(), baseAction(), "evidence:valid");
        expectCode("HITL_REQUIREMENT_WEAKENED", () -> f36.runtime.publishGoalRevision("child", f36.runtime.registryRevision(),
                f36.child(hard90(), baseRequirements(), List.of(weak), baseDelegation(), baseResource(), baseAction(), "evidence:valid")));
        pass(f36.runtime.goalRevision(f36.goalId, 2) == null);
    }

    private static void ownershipEvidenceFenceCases() throws Exception {
        HumanControlRequirementV1 approval = new HumanControlRequirementV1("approval", 50, true, "HUMAN_APPROVAL_RECEIPT", "policy:approval");

        // 37 approval requirement without evidence receipt rejects governed publication
        Fixture f37 = fixture("e37", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("APPROVAL_EVIDENCE_REQUIRED", () -> f37.runtime.publishGoalRevision("child", f37.runtime.registryRevision(),
                f37.child(hard90(), baseRequirements(), List.of(approval), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f37.runtime.goalRevision(f37.goalId, 2) == null);

        // 38 approval receipt wrong candidate binding rejects
        Fixture f38 = fixture("e38", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("APPROVAL_RECEIPT_BINDING_MISMATCH", () -> f38.runtime.publishGoalRevision("child", f38.runtime.registryRevision(),
                f38.child(hard90(), baseRequirements(), List.of(approval), baseDelegation(), baseResource(), baseAction(), "evidence:wrong")));
        pass(f38.runtime.goalRevision(f38.goalId, 2) == null);

        // 39 receipt reference is preserved as opaque evidence, never fabricated human response
        Fixture f39 = fixture("e39", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionV1 r39 = f39.runtime.publishGoalRevision("child", f39.runtime.registryRevision(),
                f39.child(hard90(), baseRequirements(), List.of(approval), baseDelegation(), baseResource(), baseAction(), "evidence:valid"));
        pass("evidence:valid".equals(r39.approvedByEvidenceRef())
                && noRecordComponentContains(GoalRevisionV1.class, Set.of("humanresponse", "participantresponse")));

        // 40 success criterion declaration cannot mark itself satisfied
        pass(noRecordComponentContains(SuccessCriterionDeclV1.class, Set.of("satisfied", "passed", "completed")));

        RequirementDeclV1 bookOwner = new RequirementDeclV1("specialist", RequirementKind.MUST, "Book-specific result must satisfy owner-defined rule",
                "book:semantic-owner", List.of("BOOK_EVIDENCE"), null);
        RequirementDeclV1 sameBookOwner = new RequirementDeclV1("specialist", RequirementKind.MUST, "Book-specific result must satisfy owner-defined rule",
                "book:semantic-owner", List.of("BOOK_EVIDENCE"), "parent:specialist");
        RequirementDeclV1 rebound = new RequirementDeclV1("specialist", RequirementKind.MUST, "Book-specific result must satisfy owner-defined rule",
                "learning:semantic-owner", List.of("BOOK_EVIDENCE"), "parent:specialist");

        // 41 specialist requirement owner reference is preserved through refinement
        Fixture f41 = fixture("e41", hard100(), List.of(bookOwner), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f41.runtime.publishGoalRevision("child", f41.runtime.registryRevision(),
                f41.child(hard90(), List.of(sameBookOwner), List.of(), baseDelegation(), baseResource(), baseAction(), null)).revision() == 2);

        // 42 child cannot rebind specialist owner to Keel/another peer
        Fixture f42 = fixture("e42", hard100(), List.of(bookOwner), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        expectCode("SPECIALIST_OWNER_REBOUND", () -> f42.runtime.publishGoalRevision("child", f42.runtime.registryRevision(),
                f42.child(hard90(), List.of(rebound), List.of(), baseDelegation(), baseResource(), baseAction(), null)));
        pass(f42.runtime.goalRevision(f42.goalId, 2) == null);

        // 43 Keel validation receipt cannot grant Identity/Resource/Route/Placement/Runtime/Effect authority
        Fixture f43 = fixture("e43", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        KeelValidationReceiptV1 receipt = f43.runtime.validationReceipt(f43.goalId, 1);
        pass(receipt.refinementStanding() == RefinementStanding.VALID
                && noRecordComponentContains(KeelValidationReceiptV1.class,
                Set.of("grant", "reservation", "route", "placement", "lease", "job", "attempt", "effectpermission")));

        // 44 secret-like canonical field rejects before append
        Fixture f44 = fixture("e44", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        long before = f44.runtime.registryRevision();
        expectCode("SECRET_FIELD_FORBIDDEN", () -> candidate(f44.goalId, 2, f44.parentRef, "api_key=do-not-store", hard90(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate()));
        pass(f44.runtime.registryRevision() == before);
    }

    private static void journalConcurrencyCases() throws Exception {
        // 45 replay reconstructs exact current revision
        Path d45 = temp("j45");
        KeelAuthorityRuntime r45 = runtime(d45);
        r45.createGoalIdentity("id", 0, identity("goal-j45"));
        GoalRevisionV1 expected = r45.publishGoalRevision("rev", 1, candidate("goal-j45", 1, null, "root", hard100(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate()));
        KeelAuthorityRuntime reopened = runtime(d45);
        pass(reopened.goalRevision("goal-j45", 1).equals(expected)
                && reopened.governedGoalRef("goal-j45").goalRevisionId().equals(expected.goalRevisionId()));

        // 46 command replay same request returns same semantic result
        pass(reopened.publishGoalRevision("rev", 1, candidate("goal-j45", 1, null, "root", hard100(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, admittedGate())).equals(expected));

        // 47 command id with a different request conflicts
        Path d47 = temp("j47");
        KeelAuthorityRuntime r47 = runtime(d47);
        r47.createGoalIdentity("same-command", 0, identity("goal-j47"));
        expectCode("COMMAND_REPLAY_CONFLICT", () -> r47.createGoalIdentity("same-command", 0, identity("other-j47")));
        pass(r47.registryRevision() == 1);

        // 48 corrupt journal fails closed
        Path d48 = temp("j48");
        KeelAuthorityRuntime r48 = runtime(d48);
        r48.createGoalIdentity("id", 0, identity("goal-j48"));
        Files.writeString(d48.resolve("keel.journal"), "garbage\n", StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
        expectCode("KEEL_JOURNAL_CORRUPT", r48::registryRevision);
        pass(true);

        // 49 truncated journal fails closed
        Path d49 = temp("j49");
        KeelAuthorityRuntime r49 = runtime(d49);
        r49.createGoalIdentity("id", 0, identity("goal-j49"));
        byte[] b49 = Files.readAllBytes(d49.resolve("keel.journal"));
        Files.write(d49.resolve("keel.journal"), java.util.Arrays.copyOf(b49, b49.length - 1));
        expectCode("KEEL_JOURNAL_CORRUPT", r49::registryRevision);
        pass(true);

        // 50 hash-chain/event hash break fails closed
        Path d50 = temp("j50");
        KeelAuthorityRuntime r50 = runtime(d50);
        r50.createGoalIdentity("id", 0, identity("goal-j50"));
        String t50 = Files.readString(d50.resolve("keel.journal"), StandardCharsets.UTF_8);
        Files.writeString(d50.resolve("keel.journal"), t50.replace("CREATE_IDENTITY", "CREATE_IDENTITX"), StandardCharsets.UTF_8);
        expectCode("KEEL_JOURNAL_CORRUPT", r50::registryRevision);
        pass(true);

        // 51 concurrent same revision converges to one canonical revision
        Fixture f51 = fixture("j51", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionCandidateV1 same = f51.child(hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        long expectedRevision = f51.runtime.registryRevision();
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();
        runConcurrent(
                () -> publishCount(f51.runtime, "c51-a", expectedRevision, same, successes, conflicts),
                () -> publishCount(f51.runtime, "c51-b", expectedRevision, same, successes, conflicts));
        pass(successes.get() == 1 && conflicts.get() == 1 && f51.runtime.goalRevision(f51.goalId, 2) != null);

        // 52 concurrent conflicting payloads yield one canonical result plus conflict
        Fixture f52 = fixture("j52", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionCandidateV1 c52a = f52.childWithProblem("child-a", hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        GoalRevisionCandidateV1 c52b = f52.childWithProblem("child-b", hard90(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        long er52 = f52.runtime.registryRevision();
        AtomicInteger s52 = new AtomicInteger();
        AtomicInteger x52 = new AtomicInteger();
        runConcurrent(
                () -> publishCount(f52.runtime, "c52-a", er52, c52a, s52, x52),
                () -> publishCount(f52.runtime, "c52-b", er52, c52b, s52, x52));
        pass(s52.get() == 1 && x52.get() == 1 && f52.runtime.goalRevision(f52.goalId, 2) != null);
    }

    private static void workChainContractCases() throws Exception {
        // 53 publication requires exact admitted Keel contract gate
        Fixture f53 = fixture("w53", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        pass(f53.parent.contractGateReceiptDigest().equals(GATE_DIGEST));

        // 54 rejected/stale contract gate blocks publication without append
        Fixture f54 = fixture("w54", hard100(), baseRequirements(), List.of(), baseDelegation(), baseResource(), baseAction(), null);
        long before = f54.runtime.registryRevision();
        ContractGateReceiptV1 rejected = new ContractGateReceiptV1(SUBJECT, VERSION, CONTRACT_DIGEST, "c".repeat(64), ContractGateStanding.REJECTED, 1);
        GoalRevisionCandidateV1 bad = candidate(f54.goalId, 2, f54.parentRef, "child", hard90(), baseRequirements(), baseSuccess(),
                baseDelegation(), baseResource(), List.of(), baseAction(), null, rejected);
        expectCode("CONTRACT_GATE_STALE_OR_REJECTED", () -> f54.runtime.publishGoalRevision("bad-gate", before, bad));
        pass(f54.runtime.registryRevision() == before);

        // 55 GovernedGoalRef binds exact goal revision/digest and contains no Work/Plan/Job truth
        GovernedGoalRefV1 ref = f54.runtime.governedGoalRef(f54.goalId);
        pass(ref.goalRevisionId().equals(f54.parent.goalRevisionId())
                && ref.goalContentDigest().equals(f54.parent.contentDigest())
                && noRecordComponentContains(GovernedGoalRefV1.class, Set.of("workid", "plan", "job", "attempt", "route", "assignment")));

        // 56 no runtime API accepts historical donor PASS as changed-subject qualification
        pass(java.util.Arrays.stream(KeelAuthorityRuntime.class.getDeclaredMethods())
                .noneMatch(m -> m.getName().toLowerCase(java.util.Locale.ROOT).contains("historicalpass")
                        || m.getName().toLowerCase(java.util.Locale.ROOT).contains("donorpass")));
    }

    private static void publishCount(KeelAuthorityRuntime runtime, String commandId, long expected,
                                     GoalRevisionCandidateV1 candidate, AtomicInteger successes, AtomicInteger conflicts) {
        try {
            runtime.publishGoalRevision(commandId, expected, candidate);
            successes.incrementAndGet();
        } catch (KeelException e) {
            if (Set.of("KEEL_REGISTRY_REVISION_CONFLICT", "REVISION_CONFLICT", "CONTENT_DIGEST_CONFLICT").contains(e.code())) {
                conflicts.incrementAndGet();
            } else {
                throw e;
            }
        }
    }

    private static void runConcurrent(Runnable a, Runnable b) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Thread t1 = new Thread(() -> guarded(start, a, failure), "keel-q-a");
        Thread t2 = new Thread(() -> guarded(start, b, failure), "keel-q-b");
        t1.start(); t2.start(); start.countDown(); t1.join(); t2.join();
        if (failure.get() != null) throw new AssertionError(failure.get());
    }

    private static void guarded(CountDownLatch start, Runnable runnable, AtomicReference<Throwable> failure) {
        try {
            start.await();
            runnable.run();
        } catch (Throwable t) {
            failure.compareAndSet(null, t);
        }
    }

    private static boolean noRecordComponentContains(Class<?> type, Set<String> fragments) {
        for (RecordComponent component : type.getRecordComponents()) {
            String name = component.getName().toLowerCase(java.util.Locale.ROOT);
            for (String fragment : fragments) if (name.contains(fragment)) return false;
        }
        return true;
    }

    private static Fixture fixture(String suffix,
                                   List<ConstraintDeclV1> constraints,
                                   List<RequirementDeclV1> requirements,
                                   List<HumanControlRequirementV1> hitl,
                                   DelegationCeilingV1 delegation,
                                   ResourceCeilingV1 resource,
                                   ActionEnvelopeV1 action,
                                   String approvalRef) throws IOException {
        Path dir = temp(suffix);
        KeelAuthorityRuntime runtime = runtime(dir);
        String goalId = "goal-" + suffix;
        runtime.createGoalIdentity("identity", 0, identity(goalId));
        GoalRevisionV1 parent = runtime.publishGoalRevision("parent", 1,
                candidate(goalId, 1, null, "parent problem", constraints, requirements, baseSuccess(), delegation, resource, hitl, action, approvalRef, admittedGate()));
        return new Fixture(runtime, goalId, parent, ref(parent));
    }

    private record Fixture(KeelAuthorityRuntime runtime, String goalId, GoalRevisionV1 parent, ParentGoalRevisionRefV1 parentRef) {
        GoalRevisionCandidateV1 child(List<ConstraintDeclV1> constraints,
                                      List<RequirementDeclV1> requirements,
                                      List<HumanControlRequirementV1> hitl,
                                      DelegationCeilingV1 delegation,
                                      ResourceCeilingV1 resource,
                                      ActionEnvelopeV1 action,
                                      String approvalRef) {
            return childWithProblem("child problem", constraints, requirements, hitl, delegation, resource, action, approvalRef);
        }

        GoalRevisionCandidateV1 childWithProblem(String problem,
                                                 List<ConstraintDeclV1> constraints,
                                                 List<RequirementDeclV1> requirements,
                                                 List<HumanControlRequirementV1> hitl,
                                                 DelegationCeilingV1 delegation,
                                                 ResourceCeilingV1 resource,
                                                 ActionEnvelopeV1 action,
                                                 String approvalRef) {
            return candidate(goalId, 2, parentRef, problem, constraints, requirements, baseSuccess(), delegation, resource, hitl, action, approvalRef, admittedGate());
        }
    }

    private static KeelAuthorityRuntime runtime(Path dir) {
        return new KeelAuthorityRuntime(
                dir, OWNER, SUBJECT, VERSION, CONTRACT_DIGEST, CANONICALIZER,
                receipt -> receipt.standing() == ContractGateStanding.ADMITTED && GATE_DIGEST.equals(receipt.receiptDigest()),
                (evidenceRef, candidateDigest) -> "evidence:valid".equals(evidenceRef) && candidateDigest != null && candidateDigest.length() == 64);
    }

    private static ContractGateReceiptV1 admittedGate() {
        return new ContractGateReceiptV1(SUBJECT, VERSION, CONTRACT_DIGEST, GATE_DIGEST, ContractGateStanding.ADMITTED, 1);
    }

    private static GoalIdentityV1 identity(String goalId) {
        return new GoalIdentityV1(goalId, OWNER, "principal:test", "evidence:created", "contract:keel");
    }

    private static GoalRevisionCandidateV1 candidate(
            String goalId,
            long revision,
            ParentGoalRevisionRefV1 parent,
            String problem,
            List<ConstraintDeclV1> constraints,
            List<RequirementDeclV1> requirements,
            List<SuccessCriterionDeclV1> success,
            DelegationCeilingV1 delegation,
            ResourceCeilingV1 resource,
            List<HumanControlRequirementV1> hitl,
            ActionEnvelopeV1 action,
            String approvalRef,
            ContractGateReceiptV1 gate) {
        return new GoalRevisionCandidateV1(
                goalId, revision, parent, problem,
                List.of("preserve governed intent without authority expansion"),
                requirements, constraints, success, delegation, resource, hitl, action,
                List.of("artifact:opaque-reference"), approvalRef,
                List.of("evidence:lineage"), gate);
    }

    private static List<ConstraintDeclV1> hard100() {
        return List.of(new ConstraintDeclV1("budget-max", ConstraintHardness.HARD, "MAX_COST", "100", "MAX_NUMERIC", null, null));
    }

    private static List<ConstraintDeclV1> hard90() {
        return List.of(new ConstraintDeclV1("budget-max", ConstraintHardness.HARD, "MAX_COST", "90", "MAX_NUMERIC", "parent:budget-max", null));
    }

    private static List<ConstraintDeclV1> hard80() {
        return List.of(new ConstraintDeclV1("budget-max", ConstraintHardness.HARD, "MAX_COST", "80", "MAX_NUMERIC", "parent:budget-max", null));
    }

    private static List<ConstraintDeclV1> hard110() {
        return List.of(new ConstraintDeclV1("budget-max", ConstraintHardness.HARD, "MAX_COST", "110", "MAX_NUMERIC", "parent:budget-max", null));
    }

    private static List<RequirementDeclV1> baseRequirements() {
        return List.of(new RequirementDeclV1("must-preserve", RequirementKind.MUST,
                "preserve exact owner boundaries", null, List.of("TRACEABILITY_EVIDENCE"), null));
    }

    private static List<SuccessCriterionDeclV1> baseSuccess() {
        return List.of(new SuccessCriterionDeclV1("criterion", "all declared invariants remain true",
                "QUALIFICATION_EVIDENCE", "validator:keel", "all required cases pass"));
    }

    private static DelegationCeilingV1 baseDelegation() {
        return new DelegationCeilingV1(4, 60, Set.of("worker", "reviewer"), Set.of("local", "hosted"), Set.of("root-admin"));
    }

    private static DelegationCeilingV1 narrowerDelegation() {
        return new DelegationCeilingV1(3, 50, Set.of("worker"), Set.of("local"), Set.of("root-admin", "unbounded"));
    }

    private static ResourceCeilingV1 baseResource() {
        return new ResourceCeilingV1(1000, 1000, 10_000_000, 3_600_000, Set.of("cpu", "storage"), List.of("policy:resource"));
    }

    private static ResourceCeilingV1 narrowerResource() {
        return new ResourceCeilingV1(900, 900, 9_000_000, 3_000_000, Set.of("cpu"), List.of("policy:resource"));
    }

    private static ActionEnvelopeV1 baseAction() {
        return new ActionEnvelopeV1(Set.of("READ", "WRITE"), Set.of("DELETE"), List.of("policy:action"));
    }

    private static ActionEnvelopeV1 narrowerAction() {
        return new ActionEnvelopeV1(Set.of("READ"), Set.of("DELETE"), List.of("policy:action"));
    }

    private static ParentGoalRevisionRefV1 ref(GoalRevisionV1 value) {
        return new ParentGoalRevisionRefV1(value.goalId(), value.revision(), value.goalRevisionId(), value.contentDigest());
    }

    private static Path temp(String suffix) throws IOException {
        return Files.createTempDirectory("keel-q-" + suffix + "-");
    }

    private static void pass(boolean condition) {
        if (!condition) throw new AssertionError("case " + (CASES.get() + 1) + " failed");
        CASES.incrementAndGet();
    }

    private static void expectCode(String code, ThrowingRunnable runnable) {
        try {
            runnable.run();
            throw new AssertionError("expected " + code);
        } catch (KeelException e) {
            if (!code.equals(e.code())) throw new AssertionError("expected " + code + " got " + e.code(), e);
        } catch (Exception e) {
            throw new AssertionError("expected " + code + " got " + e, e);
        }
    }

    private static void expectAny(Set<String> codes, ThrowingRunnable runnable) {
        try {
            runnable.run();
            throw new AssertionError("expected one of " + codes);
        } catch (KeelException e) {
            if (!codes.contains(e.code())) throw new AssertionError("expected one of " + codes + " got " + e.code(), e);
        } catch (Exception e) {
            throw new AssertionError("expected one of " + codes + " got " + e, e);
        }
    }

    @FunctionalInterface
    private interface ThrowingRunnable { void run() throws Exception; }
}
