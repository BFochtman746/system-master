package org.systemmaster.foundation.keel;

import static org.systemmaster.foundation.keel.KeelAuthorityRuntime.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Keel authority qualification test.
 *
 * Covers KeelAuthorityRuntime, which shipped with zero test coverage — the only
 * foundation-spine module with none (see SYSTEM-MAP.md and STANDARDS.md S-02).
 *
 * Exercises real behaviour, not construction: the non-expanding refinement
 * algebra (every reason code the evaluator can emit), the contract/principal
 * authority gates, command idempotency and replay conflict, optimistic
 * revision concurrency, hash-chained journal tamper detection, and retirement.
 *
 * No arguments. Run:
 *   java -cp target/classes org.systemmaster.foundation.keel.KeelAuthorityQualificationTest
 */
public final class KeelAuthorityQualificationTest {

    private static final String SUBJECT_ID = "KEEL-GOAL-CONTRACT";
    private static final String SUBJECT_VERSION = "1.0";
    private static final String SUBJECT_DIGEST = hex('a');
    private static final String RECEIPT_DIGEST = hex('b');
    private static final String PRINCIPAL = "principal:architect";

    private static int checks = 0;
    private static int cases = 0;

    public static void main(String[] args) throws Exception {
        rootGoalIsGoverned();
        nonExpandingRefinementAccepted();
        unknownPrincipalRejected();
        staleContractGateRejected();
        commandIdempotentReplay();
        commandReplayConflict();
        registryRevisionConflict();
        hardConstraintWeakenedRejected();
        hardConstraintRemovedRejected();
        delegationCeilingExpansionRejected();
        resourceCeilingExpansionRejected();
        allowedActionExpansionRejected();
        forbiddenActionRemovalRejected();
        hitlWeakeningRejected();
        softConstraintUndispositionedRejected();
        unknownComparatorIsUnknownNotValid();
        approvalEvidenceRequired();
        approvalBindingMismatchRejected();
        revisionSequenceEnforced();
        validateRefinementDoesNotMutate();
        retirementIsTerminalAndIdempotent();
        journalTamperDetected();
        journalTruncationDetected();

        System.out.printf("PASS FOUNDATION_KEEL_QUALIFICATION cases=%d checks=%d%n", cases, checks);
    }

    // ---------- cases ----------

    private static void rootGoalIsGoverned() throws Exception {
        var k = fresh();
        identity(k, "g-root");
        var result = k.publishGoalRevision("cmd-1", -1, candidate("g-root", 1, null).build());
        check(result.validationReceipt().standing() == RefinementStanding.VALID, "root goal must validate");
        check(result.validationReceipt().reasonCodes().contains("ROOT_GOAL"), "root goal reason code");
        check(k.standing("g-root", 1) == GoalStanding.GOVERNED, "root revision must be GOVERNED");
        check(k.currentRevision("g-root").revision() == 1, "current revision must be 1");
        check(result.governedGoalRef().goalContentDigest().equals(result.revision().contentDigest()),
                "governed ref must bind the exact content digest");
        done();
    }

    private static void nonExpandingRefinementAccepted() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        // tighten: latency ceiling 1000 -> 500 (MaxLong: child must be <= parent)
        var child = candidate("g", 2, parentOf(r1))
                .constraint(new ConstraintDeclV1("k-lat", ConstraintHardness.HARD, "max_latency_ms", "500", null))
                .build();
        var r2 = k.publishGoalRevision("c2", -1, child);
        check(r2.validationReceipt().standing() == RefinementStanding.VALID, "tightening must be a valid refinement");
        check(r2.validationReceipt().reasonCodes().contains("NON_EXPANDING_REFINEMENT"), "refinement reason code");
        check(k.standing("g", 1) == GoalStanding.SUPERSEDED, "parent must become SUPERSEDED");
        check(k.standing("g", 2) == GoalStanding.GOVERNED, "child must become GOVERNED");
        done();
    }

    private static void unknownPrincipalRejected() throws Exception {
        var k = new KeelAuthorityRuntime(tmp(), ref -> false, (e, d) -> true,
                r -> ContractGateStanding.CURRENT_ADMITTED, comparators(),
                SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, "keel-validator", "1.0");
        expect("UNKNOWN_PRINCIPAL_REF", () -> identity(k, "g"));
        done();
    }

    private static void staleContractGateRejected() throws Exception {
        var k = new KeelAuthorityRuntime(tmp(), ref -> true, (e, d) -> true,
                r -> ContractGateStanding.STALE, comparators(),
                SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, "keel-validator", "1.0");
        expect("CONTRACT_GATE_STALE_OR_REJECTED", () -> identity(k, "g"));

        // wrong subject digest is refused before the authority is even consulted
        var k2 = fresh();
        var wrongGate = new ContractGateReceipt(SUBJECT_ID, SUBJECT_VERSION, hex('c'), RECEIPT_DIGEST);
        expect("CONTRACT_GATE_STALE_OR_REJECTED", () -> k2.createGoalIdentity("cmd", -1,
                new GoalIdentityV1("g", "CORE", PRINCIPAL, "ref:created", wrongGate)));
        done();
    }

    private static void commandIdempotentReplay() throws Exception {
        var k = fresh();
        identity(k, "g");
        var cand = candidate("g", 1, null).build();
        var first = k.publishGoalRevision("same-cmd", -1, cand);
        long revAfterFirst = k.registryRevision();
        var replay = k.publishGoalRevision("same-cmd", -1, cand);
        check(replay.revision().contentDigest().equals(first.revision().contentDigest()),
                "replay must return the memoized result");
        check(k.registryRevision() == revAfterFirst, "replay must not advance the registry revision");
        done();
    }

    private static void commandReplayConflict() throws Exception {
        var k = fresh();
        identity(k, "g");
        k.publishGoalRevision("dup", -1, candidate("g", 1, null).build());
        var different = candidate("g", 1, null).problem("a materially different problem statement").build();
        expect("COMMAND_REPLAY_CONFLICT", () -> k.publishGoalRevision("dup", -1, different));
        done();
    }

    private static void registryRevisionConflict() throws Exception {
        var k = fresh();
        identity(k, "g");
        long actual = k.registryRevision();
        expect("KEEL_REGISTRY_REVISION_CONFLICT",
                () -> k.publishGoalRevision("c", actual + 7, candidate("g", 1, null).build()));
        done();
    }

    private static void hardConstraintWeakenedRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        // loosen: 1000 -> 2000 violates MaxLong non-weakening
        var child = candidate("g", 2, parentOf(r1))
                .constraint(new ConstraintDeclV1("k-lat", ConstraintHardness.HARD, "max_latency_ms", "2000", null))
                .build();
        expect("HARD_CONSTRAINT_WEAKENED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void hardConstraintRemovedRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1)).clearConstraints().build();
        expect("HARD_CONSTRAINT_REMOVED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void delegationCeilingExpansionRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1))
                .delegation(new DelegationCeilingV1(9, 10, set("ROLE_A"), set("CLASS_X")))
                .build();
        expect("DELEGATION_CEILING_EXPANDED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void resourceCeilingExpansionRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1))
                .resource(new ResourceCeilingV1(9_000_000L, 3600L, 1_048_576L, set("CPU")))
                .build();
        expect("RESOURCE_CEILING_EXPANDED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void allowedActionExpansionRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1))
                .actions(new ActionEnvelopeV1(set("READ", "WRITE", "DEPLOY"), set("DELETE")))
                .build();
        expect("ALLOWED_ACTION_EXPANDED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void forbiddenActionRemovalRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1))
                .actions(new ActionEnvelopeV1(set("READ"), set()))
                .build();
        expect("FORBIDDEN_ACTION_REMOVED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void hitlWeakeningRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var child = candidate("g", 2, parentOf(r1))
                .hitl(new HumanControlRequirementV1("h-approve", 50, "EVIDENCE_HUMAN_APPROVAL", false))
                .build();
        expect("HITL_REQUIREMENT_WEAKENED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void softConstraintUndispositionedRejected() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        // drop the soft constraint without recording a disposition for it
        var child = candidate("g", 2, parentOf(r1)).clearSoft().build();
        expect("SOFT_CONSTRAINT_UNDISPOSITIONED", () -> k.publishGoalRevision("c2", -1, child));

        // same drop, but dispositioned -> accepted
        var k2 = fresh();
        identity(k2, "g");
        var p = k2.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var ok = candidate("g", 2, parentOf(p)).clearSoft()
                .disposition("k-soft", "ACCEPTED_TRADEOFF: superseded by k-lat")
                .build();
        var r2 = k2.publishGoalRevision("c2", -1, ok);
        check(r2.validationReceipt().standing() == RefinementStanding.VALID,
                "dispositioned soft-constraint change must be valid");
        done();
    }

    private static void unknownComparatorIsUnknownNotValid() throws Exception {
        // registry has no comparator for "custom_dimension": must be UNKNOWN, never silently VALID
        var k = new KeelAuthorityRuntime(tmp(), ref -> true, (e, d) -> true,
                r -> ContractGateStanding.CURRENT_ADMITTED, List.of(new MaxLongComparator("max_latency_ms")),
                SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, "keel-validator", "1.0");
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null)
                .constraint(new ConstraintDeclV1("k-x", ConstraintHardness.HARD, "custom_dimension", "7", null))
                .build());
        var child = candidate("g", 2, parentOf(r1))
                .constraint(new ConstraintDeclV1("k-x", ConstraintHardness.HARD, "custom_dimension", "7", null))
                .build();
        expect("UNKNOWN_COMPARATOR", () -> k.publishGoalRevision("c2", -1, child));

        var receipt = k.validateRefinement(child);
        check(receipt.standing() == RefinementStanding.UNKNOWN, "unknown comparator must yield UNKNOWN standing");
        done();
    }

    private static void approvalEvidenceRequired() throws Exception {
        var k = fresh();
        identity(k, "g");
        var cand = candidate("g", 1, null).approvalRequired(true).approvedBy(null).build();
        expect("APPROVAL_EVIDENCE_REQUIRED", () -> k.publishGoalRevision("c", -1, cand));
        done();
    }

    private static void approvalBindingMismatchRejected() throws Exception {
        // approval authority refuses the exact candidate digest binding
        var k = new KeelAuthorityRuntime(tmp(), ref -> true, (e, d) -> false,
                r -> ContractGateStanding.CURRENT_ADMITTED, comparators(),
                SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, "keel-validator", "1.0");
        identity(k, "g");
        var cand = candidate("g", 1, null).approvalRequired(true).approvedBy("ref:approval-1").build();
        expect("APPROVAL_RECEIPT_BINDING_MISMATCH", () -> k.publishGoalRevision("c", -1, cand));
        done();
    }

    private static void revisionSequenceEnforced() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        // skipping revision 2 must be refused
        var skipped = candidate("g", 3, parentOf(r1)).build();
        expect("REVISION_CONFLICT", () -> k.publishGoalRevision("c3", -1, skipped));

        // publishing against an unknown goal must be refused
        var orphan = candidate("nope", 1, null).build();
        expect("UNKNOWN_GOAL", () -> k.publishGoalRevision("c4", -1, orphan));
        done();
    }

    private static void validateRefinementDoesNotMutate() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        long before = k.registryRevision();
        var receipt = k.validateRefinement(candidate("g", 2, parentOf(r1)).build());
        check(receipt.standing() == RefinementStanding.VALID, "dry-run validation must report VALID");
        check(k.registryRevision() == before, "validateRefinement must not advance the registry");
        check(k.currentRevision("g").revision() == 1, "validateRefinement must not publish");
        done();
    }

    private static void retirementIsTerminalAndIdempotent() throws Exception {
        var k = fresh();
        identity(k, "g");
        var r1 = k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        var retired = k.retireGoal("r1", -1, "g", "ref:retire-reason");
        check(retired.retiredRevision() == 1, "retirement must name the current revision");
        check(k.standing("g", 1) == GoalStanding.RETIRED, "revision must be RETIRED");

        long after = k.registryRevision();
        var again = k.retireGoal("r2", -1, "g", "ref:retire-reason");
        check(again.retiredRevision() == 1, "second retirement must be idempotent");
        check(k.registryRevision() == after, "idempotent retirement must not advance the registry");

        var child = candidate("g", 2, parentOf(r1)).build();
        expect("GOAL_RETIRED", () -> k.publishGoalRevision("c2", -1, child));
        done();
    }

    private static void journalTamperDetected() throws Exception {
        var dir = tmp();
        var k = runtimeAt(dir);
        identity(k, "g");
        k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        k.corruptLastByteForTest();
        expect("KEEL_JOURNAL_CORRUPT", () -> runtimeAt(dir).registryRevision());
        done();
    }

    private static void journalTruncationDetected() throws Exception {
        var dir = tmp();
        var k = runtimeAt(dir);
        identity(k, "g");
        k.publishGoalRevision("c1", -1, candidate("g", 1, null).build());
        k.truncateLastByteForTest();
        expect("KEEL_JOURNAL_CORRUPT", () -> runtimeAt(dir).registryRevision());
        done();
    }

    // ---------- harness ----------

    private static void check(boolean condition, String what) {
        checks++;
        if (!condition) throw new AssertionError("FAILED: " + what);
    }

    private static void done() { cases++; }

    private static void expect(String code, ThrowingRunnable body) {
        checks++;
        try {
            body.run();
        } catch (KeelException e) {
            if (!code.equals(e.code())) {
                throw new AssertionError("expected code " + code + " but got " + e.code());
            }
            return;
        } catch (Exception e) {
            throw new AssertionError("expected KeelException " + code + " but got " + e);
        }
        throw new AssertionError("expected KeelException " + code + " but nothing was thrown");
    }

    private interface ThrowingRunnable { void run() throws Exception; }

    private static Path tmp() throws Exception {
        return Files.createTempDirectory("keel-qual-");
    }

    private static KeelAuthorityRuntime runtimeAt(Path dir) {
        return new KeelAuthorityRuntime(dir, ref -> true, (e, d) -> true,
                r -> ContractGateStanding.CURRENT_ADMITTED, comparators(),
                SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, "keel-validator", "1.0");
    }

    private static KeelAuthorityRuntime fresh() throws Exception {
        return runtimeAt(tmp());
    }

    private static List<ConstraintComparator> comparators() {
        return List.of(new MaxLongComparator("max_latency_ms"),
                new MinLongComparator("min_reviewers"),
                new ExactComparator("region"));
    }

    private static GoalIdentityV1 identity(KeelAuthorityRuntime k, String goalId) {
        return k.createGoalIdentity("id-" + goalId, -1,
                new GoalIdentityV1(goalId, "CORE", PRINCIPAL, "ref:created", gate()));
    }

    private static ContractGateReceipt gate() {
        return new ContractGateReceipt(SUBJECT_ID, SUBJECT_VERSION, SUBJECT_DIGEST, RECEIPT_DIGEST);
    }

    private static ParentGoalRevisionRef parentOf(PublicationResult r) {
        return new ParentGoalRevisionRef(r.revision().goalId(), r.revision().revision(),
                r.revision().goalRevisionId(), r.revision().contentDigest());
    }

    private static Set<String> set(String... values) {
        return new LinkedHashSet<>(List.of(values));
    }

    private static String hex(char c) {
        return String.valueOf(c).repeat(64);
    }

    /** Builder producing a baseline candidate whose ceilings a child may tighten but not widen. */
    private static Builder candidate(String goalId, int revision, ParentGoalRevisionRef parent) {
        return new Builder(goalId, revision, parent);
    }

    private static final class Builder {
        private final String goalId;
        private final int revision;
        private final ParentGoalRevisionRef parent;
        private String problem = "govern the system core end to end";
        private final List<ConstraintDeclV1> constraints = new ArrayList<>();
        private final Map<String, String> dispositions = new java.util.LinkedHashMap<>();
        private DelegationCeilingV1 delegation = new DelegationCeilingV1(4, 5, set("ROLE_A", "ROLE_B"), set("CLASS_X"));
        private ResourceCeilingV1 resource = new ResourceCeilingV1(1_000_000L, 600L, 1_048_576L, set("CPU", "IO"));
        private ActionEnvelopeV1 actions = new ActionEnvelopeV1(set("READ", "WRITE"), set("DELETE"));
        private HumanControlRequirementV1 hitl =
                new HumanControlRequirementV1("h-approve", 50, "EVIDENCE_HUMAN_APPROVAL", true);
        private boolean approvalRequired = false;
        private String approvedBy = null;
        private boolean keepSoft = true;
        private boolean keepConstraints = true;

        Builder(String goalId, int revision, ParentGoalRevisionRef parent) {
            this.goalId = goalId;
            this.revision = revision;
            this.parent = parent;
            constraints.add(new ConstraintDeclV1("k-lat", ConstraintHardness.HARD, "max_latency_ms", "1000", null));
            constraints.add(new ConstraintDeclV1("k-soft", ConstraintHardness.SOFT, "region", "us-east", null));
        }

        Builder problem(String p) { this.problem = p; return this; }
        Builder delegation(DelegationCeilingV1 d) { this.delegation = d; return this; }
        Builder resource(ResourceCeilingV1 r) { this.resource = r; return this; }
        Builder actions(ActionEnvelopeV1 a) { this.actions = a; return this; }
        Builder hitl(HumanControlRequirementV1 h) { this.hitl = h; return this; }
        Builder approvalRequired(boolean b) { this.approvalRequired = b; return this; }
        Builder approvedBy(String ref) { this.approvedBy = ref; return this; }
        Builder clearSoft() { this.keepSoft = false; return this; }
        Builder clearConstraints() { this.keepConstraints = false; return this; }
        Builder disposition(String id, String text) { this.dispositions.put(id, text); return this; }

        Builder constraint(ConstraintDeclV1 c) {
            constraints.removeIf(existing -> existing.constraintId().equals(c.constraintId()));
            constraints.add(c);
            return this;
        }

        RevisionCandidate build() {
            List<ConstraintDeclV1> effective = new ArrayList<>();
            if (keepConstraints) {
                for (ConstraintDeclV1 c : constraints) {
                    if (!keepSoft && c.hardness() == ConstraintHardness.SOFT) continue;
                    effective.add(c);
                }
            }
            return new RevisionCandidate(
                    goalId,
                    revision,
                    parent,
                    problem,
                    List.of("core builds and passes its tests"),
                    List.of(new RequirementDeclV1("r-build", RequirementKind.MUST,
                            "the consolidated core must compile and pass qualification",
                            "owner:core", "EVIDENCE_BUILD_LOG", null)),
                    List.copyOf(effective),
                    Map.copyOf(dispositions),
                    List.of(new SuccessCriterionDeclV1("s-green", "predicate:all_tests_pass",
                            "EVIDENCE_TEST_REPORT", null, null)),
                    delegation,
                    resource,
                    List.of(hitl),
                    actions,
                    List.of("ref:SYSTEM-MAP"),
                    approvalRequired,
                    approvedBy,
                    "canonical:v1",
                    gate(),
                    List.of("ref:lineage-1"));
        }
    }
}
