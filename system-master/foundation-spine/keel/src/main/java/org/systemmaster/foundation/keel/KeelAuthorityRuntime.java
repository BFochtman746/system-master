package org.systemmaster.foundation.keel;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Hosted-portable reference authority for the System Master Intent / Keel boundary.
 *
 * <p>The runtime deliberately owns only governed intent. Concrete identity grants,
 * resource grants/accounting, work/project state, plans, routing/placement, runtime
 * leases/jobs/attempts, effects, human-response truth and specialist-domain truth are
 * represented only by opaque references where the design lock permits them.</p>
 */
public final class KeelAuthorityRuntime {
    public enum GoalStanding { GOVERNED, SUPERSEDED, RETIRED }
    public enum RequirementKind { MUST, SHOULD, MAY }
    public enum ConstraintHardness { HARD, SOFT }
    public enum ContractGateStanding { ADMITTED, MIGRATION_REQUIRED, REJECTED }
    public enum RefinementStanding { VALID, INVALID, UNKNOWN }

    public record ContractGateReceiptV1(
            String subjectId,
            String version,
            String contractDigest,
            String receiptDigest,
            ContractGateStanding standing,
            long observedRegistryRevision) {
        public ContractGateReceiptV1 {
            subjectId = token(subjectId, "subjectId");
            version = token(version, "version");
            contractDigest = digest(contractDigest, "contractDigest");
            receiptDigest = digest(receiptDigest, "receiptDigest");
            Objects.requireNonNull(standing, "standing");
            if (observedRegistryRevision < 0) throw new IllegalArgumentException("observedRegistryRevision");
        }
    }

    public record GoalIdentityV1(
            String goalId,
            String ownerSystemId,
            String createdByPrincipalRef,
            String createdAtEvidenceRef,
            String subjectContractRef) {
        public GoalIdentityV1 {
            goalId = token(goalId, "goalId");
            ownerSystemId = token(ownerSystemId, "ownerSystemId");
            createdByPrincipalRef = ref(createdByPrincipalRef, "createdByPrincipalRef");
            createdAtEvidenceRef = ref(createdAtEvidenceRef, "createdAtEvidenceRef");
            subjectContractRef = ref(subjectContractRef, "subjectContractRef");
        }
    }

    public record ParentGoalRevisionRefV1(
            String goalId,
            long revision,
            String goalRevisionId,
            String contentDigest) {
        public ParentGoalRevisionRefV1 {
            goalId = token(goalId, "goalId");
            if (revision < 1) throw new IllegalArgumentException("revision");
            goalRevisionId = digest(goalRevisionId, "goalRevisionId");
            contentDigest = digest(contentDigest, "contentDigest");
        }
    }

    public record RequirementDeclV1(
            String requirementId,
            RequirementKind kind,
            String declaration,
            String specialistOwnerRef,
            List<String> requiredEvidenceClasses,
            String inheritedFromRef) {
        public RequirementDeclV1 {
            requirementId = token(requirementId, "requirementId");
            Objects.requireNonNull(kind, "kind");
            declaration = text(declaration, "declaration", 4096);
            specialistOwnerRef = nullableRef(specialistOwnerRef, "specialistOwnerRef");
            requiredEvidenceClasses = refs(requiredEvidenceClasses, "requiredEvidenceClasses", 32);
            inheritedFromRef = nullableRef(inheritedFromRef, "inheritedFromRef");
        }
    }

    public record ConstraintDeclV1(
            String constraintId,
            ConstraintHardness hardness,
            String constraintType,
            String canonicalValue,
            String refinementComparator,
            String inheritedFromRef,
            String dispositionReason) {
        public ConstraintDeclV1 {
            constraintId = token(constraintId, "constraintId");
            Objects.requireNonNull(hardness, "hardness");
            constraintType = token(constraintType, "constraintType");
            canonicalValue = text(canonicalValue, "canonicalValue", 2048);
            refinementComparator = token(refinementComparator, "refinementComparator");
            inheritedFromRef = nullableRef(inheritedFromRef, "inheritedFromRef");
            dispositionReason = nullableText(dispositionReason, "dispositionReason", 2048);
            if ("TIME_BOUND_REF".equals(constraintType) && !canonicalValue.startsWith("ref:")) {
                throw new IllegalArgumentException("TIME_BOUND_REQUIRES_OPAQUE_REF");
            }
        }
    }

    public record SuccessCriterionDeclV1(
            String criterionId,
            String declaration,
            String requiredEvidenceClass,
            String evaluatorRef,
            String thresholdDeclaration) {
        public SuccessCriterionDeclV1 {
            criterionId = token(criterionId, "criterionId");
            declaration = text(declaration, "declaration", 4096);
            requiredEvidenceClass = token(requiredEvidenceClass, "requiredEvidenceClass");
            evaluatorRef = nullableRef(evaluatorRef, "evaluatorRef");
            thresholdDeclaration = nullableText(thresholdDeclaration, "thresholdDeclaration", 1024);
        }
    }

    public record DelegationCeilingV1(
            int maxDelegationDepth,
            int maxRiskClass,
            Set<String> allowedDescendantRoles,
            Set<String> allowedTargetClasses,
            Set<String> forbiddenDelegationClasses) {
        public DelegationCeilingV1 {
            if (maxDelegationDepth < 0 || maxDelegationDepth > 64) throw new IllegalArgumentException("maxDelegationDepth");
            if (maxRiskClass < 0 || maxRiskClass > 100) throw new IllegalArgumentException("maxRiskClass");
            allowedDescendantRoles = tokens(allowedDescendantRoles, "allowedDescendantRoles", 128);
            allowedTargetClasses = tokens(allowedTargetClasses, "allowedTargetClasses", 128);
            forbiddenDelegationClasses = tokens(forbiddenDelegationClasses, "forbiddenDelegationClasses", 128);
        }
    }

    public record ResourceCeilingV1(
            long maxCostUnits,
            long maxComputeUnits,
            long maxStorageBytes,
            long maxDurationMillis,
            Set<String> allowedResourceClasses,
            List<String> policyRefs) {
        public ResourceCeilingV1 {
            if (maxCostUnits < 0 || maxComputeUnits < 0 || maxStorageBytes < 0 || maxDurationMillis < 0) {
                throw new IllegalArgumentException("negative resource ceiling");
            }
            allowedResourceClasses = tokens(allowedResourceClasses, "allowedResourceClasses", 128);
            policyRefs = refs(policyRefs, "policyRefs", 64);
        }
    }

    public record HumanControlRequirementV1(
            String requirementId,
            int triggerRiskClass,
            boolean approvalRequired,
            String requiredEvidenceClass,
            String policyRef) {
        public HumanControlRequirementV1 {
            requirementId = token(requirementId, "requirementId");
            if (triggerRiskClass < 0 || triggerRiskClass > 100) throw new IllegalArgumentException("triggerRiskClass");
            requiredEvidenceClass = token(requiredEvidenceClass, "requiredEvidenceClass");
            policyRef = nullableRef(policyRef, "policyRef");
        }
    }

    public record ActionEnvelopeV1(
            Set<String> allowedActionClasses,
            Set<String> forbiddenActionClasses,
            List<String> policyRefs) {
        public ActionEnvelopeV1 {
            allowedActionClasses = tokens(allowedActionClasses, "allowedActionClasses", 256);
            forbiddenActionClasses = tokens(forbiddenActionClasses, "forbiddenActionClasses", 256);
            policyRefs = refs(policyRefs, "policyRefs", 64);
        }

        public boolean ceilingContains(String actionClass) {
            String value = token(actionClass, "actionClass");
            return allowedActionClasses.contains(value) && !forbiddenActionClasses.contains(value);
        }
    }

    public record GoalRevisionCandidateV1(
            String goalId,
            long revision,
            ParentGoalRevisionRefV1 parentGoalRevisionRef,
            String problemStatement,
            List<String> desiredOutcomes,
            List<RequirementDeclV1> requirements,
            List<ConstraintDeclV1> constraints,
            List<SuccessCriterionDeclV1> successCriteria,
            DelegationCeilingV1 delegationCeiling,
            ResourceCeilingV1 resourceCeiling,
            List<HumanControlRequirementV1> humanControlRequirements,
            ActionEnvelopeV1 actionEnvelope,
            List<String> references,
            String approvedByEvidenceRef,
            List<String> lineageEvidenceRefs,
            ContractGateReceiptV1 contractGateReceipt) {
        public GoalRevisionCandidateV1 {
            goalId = token(goalId, "goalId");
            if (revision < 1) throw new IllegalArgumentException("revision");
            problemStatement = text(problemStatement, "problemStatement", 8192);
            desiredOutcomes = texts(desiredOutcomes, "desiredOutcomes", 128, 4096);
            requirements = immutable(requirements, "requirements", 512);
            constraints = immutable(constraints, "constraints", 512);
            successCriteria = immutable(successCriteria, "successCriteria", 256);
            Objects.requireNonNull(delegationCeiling, "delegationCeiling");
            Objects.requireNonNull(resourceCeiling, "resourceCeiling");
            humanControlRequirements = immutable(humanControlRequirements, "humanControlRequirements", 128);
            Objects.requireNonNull(actionEnvelope, "actionEnvelope");
            references = refs(references, "references", 256);
            approvedByEvidenceRef = nullableRef(approvedByEvidenceRef, "approvedByEvidenceRef");
            lineageEvidenceRefs = refs(lineageEvidenceRefs, "lineageEvidenceRefs", 256);
            Objects.requireNonNull(contractGateReceipt, "contractGateReceipt");
            unique(requirements.stream().map(RequirementDeclV1::requirementId).toList(), "DUPLICATE_REQUIREMENT_ID");
            unique(constraints.stream().map(ConstraintDeclV1::constraintId).toList(), "DUPLICATE_CONSTRAINT_ID");
            unique(successCriteria.stream().map(SuccessCriterionDeclV1::criterionId).toList(), "DUPLICATE_SUCCESS_CRITERION_ID");
            unique(humanControlRequirements.stream().map(HumanControlRequirementV1::requirementId).toList(), "DUPLICATE_HITL_REQUIREMENT_ID");
        }
    }

    public record GoalRevisionV1(
            String goalId,
            long revision,
            String goalRevisionId,
            ParentGoalRevisionRefV1 parentGoalRevisionRef,
            String problemStatement,
            List<String> desiredOutcomes,
            List<RequirementDeclV1> requirements,
            List<ConstraintDeclV1> constraints,
            List<SuccessCriterionDeclV1> successCriteria,
            DelegationCeilingV1 delegationCeiling,
            ResourceCeilingV1 resourceCeiling,
            List<HumanControlRequirementV1> humanControlRequirements,
            ActionEnvelopeV1 actionEnvelope,
            List<String> references,
            String approvedByEvidenceRef,
            String contentDigest,
            String canonicalizationId,
            String contractGateReceiptDigest,
            List<String> lineageEvidenceRefs,
            long publishedRegistryRevision) {
        public GoalRevisionV1 {
            goalId = token(goalId, "goalId");
            if (revision < 1) throw new IllegalArgumentException("revision");
            goalRevisionId = digest(goalRevisionId, "goalRevisionId");
            problemStatement = text(problemStatement, "problemStatement", 8192);
            desiredOutcomes = List.copyOf(desiredOutcomes);
            requirements = List.copyOf(requirements);
            constraints = List.copyOf(constraints);
            successCriteria = List.copyOf(successCriteria);
            humanControlRequirements = List.copyOf(humanControlRequirements);
            references = List.copyOf(references);
            approvedByEvidenceRef = nullableRef(approvedByEvidenceRef, "approvedByEvidenceRef");
            contentDigest = digest(contentDigest, "contentDigest");
            canonicalizationId = token(canonicalizationId, "canonicalizationId");
            contractGateReceiptDigest = digest(contractGateReceiptDigest, "contractGateReceiptDigest");
            lineageEvidenceRefs = List.copyOf(lineageEvidenceRefs);
            if (publishedRegistryRevision < 1) throw new IllegalArgumentException("publishedRegistryRevision");
        }
    }

    public record KeelValidationReceiptV1(
            String goalId,
            long revision,
            String goalRevisionId,
            String contentDigest,
            ParentGoalRevisionRefV1 parentGoalRevisionRef,
            String contractGateReceiptDigest,
            String validatorId,
            String validatorVersion,
            RefinementStanding refinementStanding,
            List<String> reasonCodes,
            List<String> comparedDigestSet,
            long observedKeelRegistryRevision,
            String receiptDigest) {
        public KeelValidationReceiptV1 {
            goalId = token(goalId, "goalId");
            if (revision < 1) throw new IllegalArgumentException("revision");
            goalRevisionId = digest(goalRevisionId, "goalRevisionId");
            contentDigest = digest(contentDigest, "contentDigest");
            contractGateReceiptDigest = digest(contractGateReceiptDigest, "contractGateReceiptDigest");
            validatorId = token(validatorId, "validatorId");
            validatorVersion = token(validatorVersion, "validatorVersion");
            Objects.requireNonNull(refinementStanding, "refinementStanding");
            reasonCodes = List.copyOf(reasonCodes);
            comparedDigestSet = List.copyOf(comparedDigestSet);
            if (observedKeelRegistryRevision < 1) throw new IllegalArgumentException("observedKeelRegistryRevision");
            receiptDigest = digest(receiptDigest, "receiptDigest");
        }
    }

    public record GovernedGoalRefV1(
            String goalId,
            long goalRevision,
            String goalRevisionId,
            String goalContentDigest,
            String keelValidationReceiptDigest,
            String keelContractSubject,
            String keelContractVersion,
            String keelContractDigest,
            ParentGoalRevisionRefV1 parentGoalRevisionRef,
            long observedKeelRegistryRevision) {
        public GovernedGoalRefV1 {
            goalId = token(goalId, "goalId");
            if (goalRevision < 1) throw new IllegalArgumentException("goalRevision");
            goalRevisionId = digest(goalRevisionId, "goalRevisionId");
            goalContentDigest = digest(goalContentDigest, "goalContentDigest");
            keelValidationReceiptDigest = digest(keelValidationReceiptDigest, "keelValidationReceiptDigest");
            keelContractSubject = token(keelContractSubject, "keelContractSubject");
            keelContractVersion = token(keelContractVersion, "keelContractVersion");
            keelContractDigest = digest(keelContractDigest, "keelContractDigest");
            if (observedKeelRegistryRevision < 1) throw new IllegalArgumentException("observedKeelRegistryRevision");
        }
    }

    public record GoalLifecycleReceiptV1(
            String goalId,
            long revision,
            GoalStanding standing,
            long observedKeelRegistryRevision) {
        public GoalLifecycleReceiptV1 {
            goalId = token(goalId, "goalId");
            if (revision < 1) throw new IllegalArgumentException("revision");
            Objects.requireNonNull(standing, "standing");
            if (observedKeelRegistryRevision < 1) throw new IllegalArgumentException("observedKeelRegistryRevision");
        }
    }

    public interface ContractGateAuthority {
        boolean currentlyAdmitted(ContractGateReceiptV1 receipt);
    }

    public interface ApprovalEvidenceAuthority {
        boolean validForCandidate(String evidenceRef, String candidateContentDigest);
    }

    public static final class KeelException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final String code;
        public KeelException(String code) {
            super(code);
            this.code = code;
        }
        public String code() { return code; }
    }

    private static final String GENESIS_HASH = "0".repeat(64);
    private static final String VALIDATOR_ID = "system-master-keel-refinement";
    private static final String VALIDATOR_VERSION = "1.0.0";
    private static final Map<Path, Object> JVM_LOCKS = new ConcurrentHashMap<>();

    private final Path journalPath;
    private final Path lockPath;
    private final String keelOwnerSystemId;
    private final String keelContractSubject;
    private final String keelContractVersion;
    private final String keelContractDigest;
    private final String canonicalizationId;
    private final ContractGateAuthority contractGateAuthority;
    private final ApprovalEvidenceAuthority approvalEvidenceAuthority;

    public KeelAuthorityRuntime(
            Path directory,
            String keelOwnerSystemId,
            String keelContractSubject,
            String keelContractVersion,
            String keelContractDigest,
            String canonicalizationId,
            ContractGateAuthority contractGateAuthority,
            ApprovalEvidenceAuthority approvalEvidenceAuthority) {
        Objects.requireNonNull(directory, "directory");
        try {
            Files.createDirectories(directory);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        this.journalPath = directory.resolve("keel.journal");
        this.lockPath = directory.resolve("keel.lock");
        this.keelOwnerSystemId = token(keelOwnerSystemId, "keelOwnerSystemId");
        this.keelContractSubject = token(keelContractSubject, "keelContractSubject");
        this.keelContractVersion = token(keelContractVersion, "keelContractVersion");
        this.keelContractDigest = digest(keelContractDigest, "keelContractDigest");
        this.canonicalizationId = token(canonicalizationId, "canonicalizationId");
        this.contractGateAuthority = Objects.requireNonNull(contractGateAuthority, "contractGateAuthority");
        this.approvalEvidenceAuthority = Objects.requireNonNull(approvalEvidenceAuthority, "approvalEvidenceAuthority");
    }

    public long registryRevision() {
        return withLock(() -> load().revision);
    }

    public GoalIdentityV1 createGoalIdentity(String commandId, long expectedRegistryRevision, GoalIdentityV1 identity) {
        Objects.requireNonNull(identity, "identity");
        String cmd = token(commandId, "commandId");
        String requestHash = sha256("CREATE_IDENTITY|" + encodeIdentity(identity));
        return withLock(() -> {
            State state = load();
            CommandRecord priorCommand = replay(state, cmd, requestHash);
            if (priorCommand != null) return identityResult(state, priorCommand.resultKey);
            expectRevision(state, expectedRegistryRevision);
            if (!keelOwnerSystemId.equals(identity.ownerSystemId())) throw ex("GOAL_IDENTITY_CONFLICT");
            GoalIdentityV1 prior = state.identities.get(identity.goalId());
            if (prior != null) {
                if (prior.equals(identity)) return prior;
                throw ex("GOAL_IDENTITY_CONFLICT");
            }
            append(state, cmd, requestHash, "CREATE_IDENTITY", encodeIdentity(identity), "identity:" + identity.goalId());
            return identity;
        });
    }

    public GoalRevisionV1 publishGoalRevision(
            String commandId,
            long expectedRegistryRevision,
            GoalRevisionCandidateV1 candidate) {
        Objects.requireNonNull(candidate, "candidate");
        String cmd = token(commandId, "commandId");
        String candidateCanonical = canonicalCandidate(candidate);
        String candidateDigest = sha256(candidateCanonical);
        String requestHash = sha256("PUBLISH_REVISION|" + candidateCanonical);
        return withLock(() -> {
            State state = load();
            CommandRecord priorCommand = replay(state, cmd, requestHash);
            if (priorCommand != null) return revisionResult(state, priorCommand.resultKey);
            expectRevision(state, expectedRegistryRevision);
            GoalIdentityV1 identity = state.identities.get(candidate.goalId());
            if (identity == null) throw ex("UNKNOWN_GOAL");
            if (state.retiredGoals.contains(candidate.goalId())) throw ex("GOAL_RETIRED");
            validateContractGate(candidate.contractGateReceipt());

            NavigableMap<Long, GoalRevisionV1> versions = state.revisions.getOrDefault(candidate.goalId(), new TreeMap<>());
            long expectedGoalRevision = versions.isEmpty() ? 1L : versions.lastKey() + 1L;
            if (candidate.revision() != expectedGoalRevision) {
                GoalRevisionV1 same = versions.get(candidate.revision());
                if (same != null && same.contentDigest().equals(candidateDigest)) return same;
                throw ex("REVISION_CONFLICT");
            }

            ParentGoalRevisionRefV1 parentRef = candidate.parentGoalRevisionRef();
            GoalRevisionV1 parent = null;
            if (parentRef != null) {
                parent = exactRevision(state, parentRef);
                GoalStanding parentStanding = state.standing.get(revisionKey(parent.goalId(), parent.revision()));
                if (parentStanding == null || parentStanding == GoalStanding.RETIRED) throw ex("PARENT_NOT_GOVERNED");
                validateRefinement(parent, candidate);
            } else if (candidate.revision() > 1) {
                throw ex("UNKNOWN_PARENT_REVISION");
            }

            boolean approvalRequired = candidate.humanControlRequirements().stream()
                    .anyMatch(HumanControlRequirementV1::approvalRequired);
            if (approvalRequired) {
                if (candidate.approvedByEvidenceRef() == null) throw ex("APPROVAL_EVIDENCE_REQUIRED");
                if (!approvalEvidenceAuthority.validForCandidate(candidate.approvedByEvidenceRef(), candidateDigest)) {
                    throw ex("APPROVAL_RECEIPT_BINDING_MISMATCH");
                }
            }

            long publishedRegistryRevision = state.revision + 1L;
            String goalRevisionId = sha256("GOAL_REVISION|" + candidate.goalId() + "|" + candidate.revision() + "|" + candidateDigest);
            GoalRevisionV1 revision = new GoalRevisionV1(
                    candidate.goalId(),
                    candidate.revision(),
                    goalRevisionId,
                    parentRef,
                    candidate.problemStatement(),
                    candidate.desiredOutcomes(),
                    candidate.requirements(),
                    candidate.constraints(),
                    candidate.successCriteria(),
                    candidate.delegationCeiling(),
                    candidate.resourceCeiling(),
                    candidate.humanControlRequirements(),
                    candidate.actionEnvelope(),
                    candidate.references(),
                    candidate.approvedByEvidenceRef(),
                    candidateDigest,
                    canonicalizationId,
                    candidate.contractGateReceipt().receiptDigest(),
                    candidate.lineageEvidenceRefs(),
                    publishedRegistryRevision);
            append(state, cmd, requestHash, "PUBLISH_REVISION", encodeRevision(revision), "revision:" + revision.goalId() + ":" + revision.revision());
            return revision;
        });
    }

    public GoalLifecycleReceiptV1 supersedeGoalRevision(
            String commandId,
            long expectedRegistryRevision,
            String goalId,
            long revision) {
        String cmd = token(commandId, "commandId");
        String goal = token(goalId, "goalId");
        if (revision < 1) throw new IllegalArgumentException("revision");
        String requestHash = sha256("SUPERSEDE|" + goal + "|" + revision);
        return withLock(() -> {
            State state = load();
            CommandRecord priorCommand = replay(state, cmd, requestHash);
            if (priorCommand != null) return lifecycleResult(state, priorCommand.resultKey);
            expectRevision(state, expectedRegistryRevision);
            GoalRevisionV1 target = revision(state, goal, revision);
            if (target == null) throw ex("UNKNOWN_PARENT_REVISION");
            String key = revisionKey(goal, revision);
            GoalStanding prior = state.standing.get(key);
            if (prior == GoalStanding.RETIRED) throw ex("GOAL_RETIRED");
            append(state, cmd, requestHash, "SUPERSEDE", fields(goal, Long.toString(revision)), "lifecycle:" + goal + ":" + revision + ":SUPERSEDED");
            return new GoalLifecycleReceiptV1(goal, revision, GoalStanding.SUPERSEDED, state.revision + 1L);
        });
    }

    public GoalLifecycleReceiptV1 retireGoal(String commandId, long expectedRegistryRevision, String goalId) {
        String cmd = token(commandId, "commandId");
        String goal = token(goalId, "goalId");
        String requestHash = sha256("RETIRE|" + goal);
        return withLock(() -> {
            State state = load();
            CommandRecord priorCommand = replay(state, cmd, requestHash);
            if (priorCommand != null) return lifecycleResult(state, priorCommand.resultKey);
            expectRevision(state, expectedRegistryRevision);
            if (!state.identities.containsKey(goal)) throw ex("UNKNOWN_GOAL");
            Long current = state.currentRevision.get(goal);
            if (current == null) {
                NavigableMap<Long, GoalRevisionV1> versions = state.revisions.get(goal);
                if (versions == null || versions.isEmpty()) throw ex("UNKNOWN_PARENT_REVISION");
                current = versions.lastKey();
            }
            append(state, cmd, requestHash, "RETIRE", fields(goal, Long.toString(current)), "lifecycle:" + goal + ":" + current + ":RETIRED");
            return new GoalLifecycleReceiptV1(goal, current, GoalStanding.RETIRED, state.revision + 1L);
        });
    }

    public GoalIdentityV1 goalIdentity(String goalId) {
        String goal = token(goalId, "goalId");
        return withLock(() -> load().identities.get(goal));
    }

    public GoalRevisionV1 goalRevision(String goalId, long revision) {
        String goal = token(goalId, "goalId");
        if (revision < 1) throw new IllegalArgumentException("revision");
        return withLock(() -> revision(load(), goal, revision));
    }

    public GoalStanding goalStanding(String goalId, long revision) {
        String goal = token(goalId, "goalId");
        if (revision < 1) throw new IllegalArgumentException("revision");
        return withLock(() -> load().standing.get(revisionKey(goal, revision)));
    }

    public KeelValidationReceiptV1 validationReceipt(String goalId, long revision) {
        String goal = token(goalId, "goalId");
        if (revision < 1) throw new IllegalArgumentException("revision");
        return withLock(() -> {
            State state = load();
            GoalRevisionV1 value = revision(state, goal, revision);
            if (value == null) throw ex("UNKNOWN_PARENT_REVISION");
            return validationReceiptFor(value);
        });
    }

    public GovernedGoalRefV1 governedGoalRef(String goalId) {
        String goal = token(goalId, "goalId");
        return withLock(() -> {
            State state = load();
            Long current = state.currentRevision.get(goal);
            if (current == null) throw ex(state.retiredGoals.contains(goal) ? "GOAL_RETIRED" : "UNKNOWN_GOAL");
            GoalRevisionV1 value = revision(state, goal, current);
            if (value == null || state.standing.get(revisionKey(goal, current)) != GoalStanding.GOVERNED) {
                throw ex("PARENT_NOT_GOVERNED");
            }
            KeelValidationReceiptV1 receipt = validationReceiptFor(value);
            return new GovernedGoalRefV1(
                    value.goalId(),
                    value.revision(),
                    value.goalRevisionId(),
                    value.contentDigest(),
                    receipt.receiptDigest(),
                    keelContractSubject,
                    keelContractVersion,
                    keelContractDigest,
                    value.parentGoalRevisionRef(),
                    state.revision);
        });
    }

    public RefinementStanding previewRefinement(ParentGoalRevisionRefV1 parentRef, GoalRevisionCandidateV1 child) {
        Objects.requireNonNull(parentRef, "parentRef");
        Objects.requireNonNull(child, "child");
        return withLock(() -> {
            State state = load();
            GoalRevisionV1 parent;
            try {
                parent = exactRevision(state, parentRef);
                validateRefinement(parent, child);
                return RefinementStanding.VALID;
            } catch (KeelException e) {
                if ("UNKNOWN_COMPARATOR".equals(e.code())) return RefinementStanding.UNKNOWN;
                return RefinementStanding.INVALID;
            }
        });
    }

    private void validateContractGate(ContractGateReceiptV1 gate) {
        if (!keelContractSubject.equals(gate.subjectId())
                || !keelContractVersion.equals(gate.version())
                || !keelContractDigest.equals(gate.contractDigest())) {
            throw ex("CONTRACT_GATE_STALE_OR_REJECTED");
        }
        if (gate.standing() != ContractGateStanding.ADMITTED) throw ex("CONTRACT_GATE_STALE_OR_REJECTED");
        if (!contractGateAuthority.currentlyAdmitted(gate)) throw ex("CONTRACT_GATE_STALE_OR_REJECTED");
    }

    private void validateRefinement(GoalRevisionV1 parent, GoalRevisionCandidateV1 child) {
        Map<String, RequirementDeclV1> childRequirements = indexRequirements(child.requirements());
        for (RequirementDeclV1 inherited : parent.requirements()) {
            RequirementDeclV1 candidate = childRequirements.get(inherited.requirementId());
            if (inherited.kind() == RequirementKind.MUST && candidate == null) throw ex("HARD_CONSTRAINT_REMOVED");
            if (candidate != null) {
                if (!Objects.equals(inherited.specialistOwnerRef(), candidate.specialistOwnerRef())) throw ex("SPECIALIST_OWNER_REBOUND");
                if (inherited.kind() == RequirementKind.MUST && !inherited.declaration().equals(candidate.declaration())) {
                    throw ex("HARD_CONSTRAINT_WEAKENED");
                }
            }
        }

        Map<String, ConstraintDeclV1> childConstraints = indexConstraints(child.constraints());
        for (ConstraintDeclV1 inherited : parent.constraints()) {
            ConstraintDeclV1 candidate = childConstraints.get(inherited.constraintId());
            if (candidate == null) {
                throw ex(inherited.hardness() == ConstraintHardness.HARD
                        ? "HARD_CONSTRAINT_REMOVED"
                        : "SOFT_CONSTRAINT_UNDISPOSITIONED");
            }
            if (!inherited.constraintType().equals(candidate.constraintType())
                    || !inherited.refinementComparator().equals(candidate.refinementComparator())) {
                if (inherited.hardness() == ConstraintHardness.HARD) throw ex("HARD_CONSTRAINT_WEAKENED");
                if (candidate.dispositionReason() == null) throw ex("SOFT_CONSTRAINT_UNDISPOSITIONED");
                continue;
            }
            if (inherited.hardness() == ConstraintHardness.SOFT
                    && !inherited.canonicalValue().equals(candidate.canonicalValue())) {
                if (candidate.dispositionReason() == null) throw ex("SOFT_CONSTRAINT_UNDISPOSITIONED");
                continue;
            }
            if (!constraintEqualOrStronger(inherited, candidate)) {
                throw ex("HARD_CONSTRAINT_WEAKENED");
            }
        }

        DelegationCeilingV1 pd = parent.delegationCeiling();
        DelegationCeilingV1 cd = child.delegationCeiling();
        if (cd.maxDelegationDepth() > pd.maxDelegationDepth()
                || cd.maxRiskClass() > pd.maxRiskClass()
                || !pd.allowedDescendantRoles().containsAll(cd.allowedDescendantRoles())
                || !pd.allowedTargetClasses().containsAll(cd.allowedTargetClasses())
                || !cd.forbiddenDelegationClasses().containsAll(pd.forbiddenDelegationClasses())) {
            throw ex("DELEGATION_CEILING_EXPANDED");
        }

        ResourceCeilingV1 pr = parent.resourceCeiling();
        ResourceCeilingV1 cr = child.resourceCeiling();
        if (cr.maxCostUnits() > pr.maxCostUnits()
                || cr.maxComputeUnits() > pr.maxComputeUnits()
                || cr.maxStorageBytes() > pr.maxStorageBytes()
                || cr.maxDurationMillis() > pr.maxDurationMillis()
                || !pr.allowedResourceClasses().containsAll(cr.allowedResourceClasses())) {
            throw ex("RESOURCE_CEILING_EXPANDED");
        }

        ActionEnvelopeV1 pa = parent.actionEnvelope();
        ActionEnvelopeV1 ca = child.actionEnvelope();
        if (!pa.allowedActionClasses().containsAll(ca.allowedActionClasses())) throw ex("ALLOWED_ACTION_EXPANDED");
        if (!ca.forbiddenActionClasses().containsAll(pa.forbiddenActionClasses())) throw ex("FORBIDDEN_ACTION_REMOVED");

        Map<String, HumanControlRequirementV1> childHitl = indexHitl(child.humanControlRequirements());
        for (HumanControlRequirementV1 inherited : parent.humanControlRequirements()) {
            HumanControlRequirementV1 candidate = childHitl.get(inherited.requirementId());
            if (candidate == null) throw ex("HITL_REQUIREMENT_WEAKENED");
            if (candidate.triggerRiskClass() > inherited.triggerRiskClass()) throw ex("HITL_REQUIREMENT_WEAKENED");
            if (inherited.approvalRequired() && !candidate.approvalRequired()) throw ex("HITL_REQUIREMENT_WEAKENED");
            if (!inherited.requiredEvidenceClass().equals(candidate.requiredEvidenceClass())) throw ex("HITL_REQUIREMENT_WEAKENED");
        }
    }

    private static boolean constraintEqualOrStronger(ConstraintDeclV1 parent, ConstraintDeclV1 child) {
        return switch (parent.refinementComparator()) {
            case "EXACT" -> parent.canonicalValue().equals(child.canonicalValue());
            case "MAX_NUMERIC" -> parseLong(child.canonicalValue()) <= parseLong(parent.canonicalValue());
            case "MIN_NUMERIC" -> parseLong(child.canonicalValue()) >= parseLong(parent.canonicalValue());
            default -> throw ex("UNKNOWN_COMPARATOR");
        };
    }

    private KeelValidationReceiptV1 validationReceiptFor(GoalRevisionV1 value) {
        List<String> compared = new ArrayList<>();
        compared.add(value.contentDigest());
        if (value.parentGoalRevisionRef() != null) compared.add(value.parentGoalRevisionRef().contentDigest());
        compared.add(sha256(encodeDelegation(value.delegationCeiling())));
        compared.add(sha256(encodeResource(value.resourceCeiling())));
        compared.add(sha256(encodeAction(value.actionEnvelope())));
        Collections.sort(compared);
        String canonical = fields(
                value.goalId(), Long.toString(value.revision()), value.goalRevisionId(), value.contentDigest(),
                value.parentGoalRevisionRef() == null ? null : encodeParent(value.parentGoalRevisionRef()),
                value.contractGateReceiptDigest(), VALIDATOR_ID, VALIDATOR_VERSION, RefinementStanding.VALID.name(),
                packStrings(List.of()), packStrings(compared), Long.toString(value.publishedRegistryRevision()));
        String receiptDigest = sha256(canonical);
        return new KeelValidationReceiptV1(
                value.goalId(), value.revision(), value.goalRevisionId(), value.contentDigest(),
                value.parentGoalRevisionRef(), value.contractGateReceiptDigest(), VALIDATOR_ID, VALIDATOR_VERSION,
                RefinementStanding.VALID, List.of(), compared, value.publishedRegistryRevision(), receiptDigest);
    }

    private GoalRevisionV1 exactRevision(State state, ParentGoalRevisionRefV1 refValue) {
        GoalRevisionV1 value = revision(state, refValue.goalId(), refValue.revision());
        if (value == null) throw ex("UNKNOWN_PARENT_REVISION");
        if (!value.goalRevisionId().equals(refValue.goalRevisionId())) throw ex("PARENT_DIGEST_MISMATCH");
        if (!value.contentDigest().equals(refValue.contentDigest())) throw ex("PARENT_DIGEST_MISMATCH");
        return value;
    }

    private static GoalRevisionV1 revision(State state, String goalId, long revision) {
        NavigableMap<Long, GoalRevisionV1> versions = state.revisions.get(goalId);
        return versions == null ? null : versions.get(revision);
    }

    private static Map<String, RequirementDeclV1> indexRequirements(Collection<RequirementDeclV1> values) {
        Map<String, RequirementDeclV1> result = new HashMap<>();
        for (RequirementDeclV1 value : values) result.put(value.requirementId(), value);
        return result;
    }

    private static Map<String, ConstraintDeclV1> indexConstraints(Collection<ConstraintDeclV1> values) {
        Map<String, ConstraintDeclV1> result = new HashMap<>();
        for (ConstraintDeclV1 value : values) result.put(value.constraintId(), value);
        return result;
    }

    private static Map<String, HumanControlRequirementV1> indexHitl(Collection<HumanControlRequirementV1> values) {
        Map<String, HumanControlRequirementV1> result = new HashMap<>();
        for (HumanControlRequirementV1 value : values) result.put(value.requirementId(), value);
        return result;
    }

    private static long parseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            throw ex("UNKNOWN_COMPARATOR");
        }
    }

    private void expectRevision(State state, long expected) {
        if (expected < 0 || state.revision != expected) throw ex("KEEL_REGISTRY_REVISION_CONFLICT");
    }

    private static CommandRecord replay(State state, String commandId, String requestHash) {
        CommandRecord prior = state.commands.get(commandId);
        if (prior == null) return null;
        if (!prior.requestHash.equals(requestHash)) throw ex("COMMAND_REPLAY_CONFLICT");
        return prior;
    }

    private static GoalIdentityV1 identityResult(State state, String resultKey) {
        String[] parts = resultKey.split(":", -1);
        if (parts.length != 2 || !"identity".equals(parts[0])) throw ex("KEEL_JOURNAL_CORRUPT");
        GoalIdentityV1 value = state.identities.get(parts[1]);
        if (value == null) throw ex("KEEL_JOURNAL_CORRUPT");
        return value;
    }

    private static GoalRevisionV1 revisionResult(State state, String resultKey) {
        String[] parts = resultKey.split(":", -1);
        if (parts.length != 3 || !"revision".equals(parts[0])) throw ex("KEEL_JOURNAL_CORRUPT");
        long revision;
        try { revision = Long.parseLong(parts[2]); } catch (NumberFormatException e) { throw ex("KEEL_JOURNAL_CORRUPT"); }
        GoalRevisionV1 value = revision(state, parts[1], revision);
        if (value == null) throw ex("KEEL_JOURNAL_CORRUPT");
        return value;
    }

    private static GoalLifecycleReceiptV1 lifecycleResult(State state, String resultKey) {
        String[] parts = resultKey.split(":", -1);
        if (parts.length != 4 || !"lifecycle".equals(parts[0])) throw ex("KEEL_JOURNAL_CORRUPT");
        long revision;
        GoalStanding standing;
        try {
            revision = Long.parseLong(parts[2]);
            standing = GoalStanding.valueOf(parts[3]);
        } catch (IllegalArgumentException e) {
            throw ex("KEEL_JOURNAL_CORRUPT");
        }
        return new GoalLifecycleReceiptV1(parts[1], revision, standing, state.revision);
    }

    private void append(State state, String commandId, String requestHash, String type, String payload, String resultKey) {
        long revision = state.revision + 1L;
        String prevHash = state.lastHash;
        String body = revision + "\t" + field(commandId) + "\t" + requestHash + "\t" + type + "\t"
                + field(payload) + "\t" + prevHash + "\t" + field(resultKey);
        String eventHash = sha256(body);
        byte[] bytes = (body + "\t" + eventHash + "\n").getBytes(StandardCharsets.UTF_8);
        try (FileChannel channel = FileChannel.open(journalPath,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND)) {
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) channel.write(buffer);
            channel.force(true);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private State load() {
        State state = new State();
        if (!Files.exists(journalPath)) return state;
        byte[] bytes;
        try {
            bytes = Files.readAllBytes(journalPath);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (bytes.length == 0) return state;
        if (bytes[bytes.length - 1] != (byte) '\n') throw ex("KEEL_JOURNAL_CORRUPT");
        String text = new String(bytes, StandardCharsets.UTF_8);
        String[] lines = text.split("\n", -1);
        String expectedPrev = GENESIS_HASH;
        long expectedRevision = 1L;
        for (int i = 0; i < lines.length - 1; i++) {
            String line = lines[i];
            String[] parts = line.split("\t", -1);
            if (parts.length != 8) throw ex("KEEL_JOURNAL_CORRUPT");
            long revision;
            try { revision = Long.parseLong(parts[0]); } catch (NumberFormatException e) { throw ex("KEEL_JOURNAL_CORRUPT"); }
            if (revision != expectedRevision) throw ex("KEEL_JOURNAL_CORRUPT");
            String commandId = unfield(parts[1]);
            String requestHash = requireDigest(parts[2]);
            String type = token(parts[3], "eventType");
            String payload = unfield(parts[4]);
            String prevHash = requireDigest(parts[5]);
            String resultKey = unfield(parts[6]);
            String eventHash = requireDigest(parts[7]);
            if (!expectedPrev.equals(prevHash)) throw ex("KEEL_JOURNAL_CORRUPT");
            String body = String.join("\t", parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]);
            if (!sha256(body).equals(eventHash)) throw ex("KEEL_JOURNAL_CORRUPT");
            apply(state, type, payload);
            if (state.commands.put(commandId, new CommandRecord(requestHash, resultKey, revision)) != null) {
                throw ex("KEEL_JOURNAL_CORRUPT");
            }
            state.revision = revision;
            state.lastHash = eventHash;
            expectedPrev = eventHash;
            expectedRevision++;
        }
        return state;
    }

    private static void apply(State state, String type, String payload) {
        switch (type) {
            case "CREATE_IDENTITY" -> {
                GoalIdentityV1 value = decodeIdentity(payload);
                if (state.identities.putIfAbsent(value.goalId(), value) != null) throw ex("KEEL_JOURNAL_CORRUPT");
            }
            case "PUBLISH_REVISION" -> {
                GoalRevisionV1 value = decodeRevision(payload);
                NavigableMap<Long, GoalRevisionV1> versions = state.revisions.computeIfAbsent(value.goalId(), ignored -> new TreeMap<>());
                if (versions.putIfAbsent(value.revision(), value) != null) throw ex("KEEL_JOURNAL_CORRUPT");
                Long current = state.currentRevision.get(value.goalId());
                if (current != null) state.standing.put(revisionKey(value.goalId(), current), GoalStanding.SUPERSEDED);
                state.standing.put(revisionKey(value.goalId(), value.revision()), GoalStanding.GOVERNED);
                state.currentRevision.put(value.goalId(), value.revision());
            }
            case "SUPERSEDE" -> {
                String[] values = unfields(payload, 2);
                long revision;
                try { revision = Long.parseLong(values[1]); } catch (NumberFormatException e) { throw ex("KEEL_JOURNAL_CORRUPT"); }
                String key = revisionKey(values[0], revision);
                if (!state.standing.containsKey(key)) throw ex("KEEL_JOURNAL_CORRUPT");
                state.standing.put(key, GoalStanding.SUPERSEDED);
                if (Objects.equals(state.currentRevision.get(values[0]), revision)) state.currentRevision.remove(values[0]);
            }
            case "RETIRE" -> {
                String[] values = unfields(payload, 2);
                long revision;
                try { revision = Long.parseLong(values[1]); } catch (NumberFormatException e) { throw ex("KEEL_JOURNAL_CORRUPT"); }
                String key = revisionKey(values[0], revision);
                if (!state.standing.containsKey(key)) throw ex("KEEL_JOURNAL_CORRUPT");
                state.standing.put(key, GoalStanding.RETIRED);
                state.currentRevision.remove(values[0]);
                state.retiredGoals.add(values[0]);
            }
            default -> throw ex("KEEL_JOURNAL_CORRUPT");
        }
    }

    private <T> T withLock(CheckedSupplier<T> supplier) {
        Object lock = JVM_LOCKS.computeIfAbsent(lockPath.toAbsolutePath().normalize(), ignored -> new Object());
        synchronized (lock) {
            try (FileChannel channel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock ignored = channel.lock()) {
                return supplier.get();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    @FunctionalInterface
    private interface CheckedSupplier<T> { T get(); }

    private static final class CommandRecord {
        final String requestHash;
        final String resultKey;
        final long registryRevision;
        CommandRecord(String requestHash, String resultKey, long registryRevision) {
            this.requestHash = requestHash;
            this.resultKey = resultKey;
            this.registryRevision = registryRevision;
        }
    }

    private static final class State {
        long revision;
        String lastHash = GENESIS_HASH;
        final Map<String, GoalIdentityV1> identities = new HashMap<>();
        final Map<String, NavigableMap<Long, GoalRevisionV1>> revisions = new HashMap<>();
        final Map<String, GoalStanding> standing = new HashMap<>();
        final Map<String, Long> currentRevision = new HashMap<>();
        final Set<String> retiredGoals = new LinkedHashSet<>();
        final Map<String, CommandRecord> commands = new HashMap<>();
    }

    private static String canonicalCandidate(GoalRevisionCandidateV1 value) {
        return fields(
                value.goalId(), Long.toString(value.revision()),
                value.parentGoalRevisionRef() == null ? null : encodeParent(value.parentGoalRevisionRef()),
                value.problemStatement(), packStrings(value.desiredOutcomes()),
                packObjects(value.requirements(), KeelAuthorityRuntime::encodeRequirement),
                packObjects(value.constraints(), KeelAuthorityRuntime::encodeConstraint),
                packObjects(value.successCriteria(), KeelAuthorityRuntime::encodeSuccess),
                encodeDelegation(value.delegationCeiling()), encodeResource(value.resourceCeiling()),
                packObjects(value.humanControlRequirements(), KeelAuthorityRuntime::encodeHitl),
                encodeAction(value.actionEnvelope()), packStrings(value.references()), value.approvedByEvidenceRef(),
                packStrings(value.lineageEvidenceRefs()), encodeContractGate(value.contractGateReceipt()));
    }

    private static String encodeRevision(GoalRevisionV1 value) {
        return fields(
                value.goalId(), Long.toString(value.revision()), value.goalRevisionId(),
                value.parentGoalRevisionRef() == null ? null : encodeParent(value.parentGoalRevisionRef()),
                value.problemStatement(), packStrings(value.desiredOutcomes()),
                packObjects(value.requirements(), KeelAuthorityRuntime::encodeRequirement),
                packObjects(value.constraints(), KeelAuthorityRuntime::encodeConstraint),
                packObjects(value.successCriteria(), KeelAuthorityRuntime::encodeSuccess),
                encodeDelegation(value.delegationCeiling()), encodeResource(value.resourceCeiling()),
                packObjects(value.humanControlRequirements(), KeelAuthorityRuntime::encodeHitl),
                encodeAction(value.actionEnvelope()), packStrings(value.references()), value.approvedByEvidenceRef(),
                value.contentDigest(), value.canonicalizationId(), value.contractGateReceiptDigest(),
                packStrings(value.lineageEvidenceRefs()), Long.toString(value.publishedRegistryRevision()));
    }

    private static GoalRevisionV1 decodeRevision(String encoded) {
        String[] v = unfields(encoded, 20);
        return new GoalRevisionV1(
                v[0], parsePositive(v[1]), v[2], v[3] == null ? null : decodeParent(v[3]), v[4],
                unpackStrings(v[5]), unpackObjects(v[6], KeelAuthorityRuntime::decodeRequirement),
                unpackObjects(v[7], KeelAuthorityRuntime::decodeConstraint),
                unpackObjects(v[8], KeelAuthorityRuntime::decodeSuccess), decodeDelegation(v[9]), decodeResource(v[10]),
                unpackObjects(v[11], KeelAuthorityRuntime::decodeHitl), decodeAction(v[12]), unpackStrings(v[13]), v[14],
                v[15], v[16], v[17], unpackStrings(v[18]), parsePositive(v[19]));
    }

    private static String encodeIdentity(GoalIdentityV1 value) {
        return fields(value.goalId(), value.ownerSystemId(), value.createdByPrincipalRef(), value.createdAtEvidenceRef(), value.subjectContractRef());
    }

    private static GoalIdentityV1 decodeIdentity(String encoded) {
        String[] v = unfields(encoded, 5);
        return new GoalIdentityV1(v[0], v[1], v[2], v[3], v[4]);
    }

    private static String encodeParent(ParentGoalRevisionRefV1 value) {
        return fields(value.goalId(), Long.toString(value.revision()), value.goalRevisionId(), value.contentDigest());
    }

    private static ParentGoalRevisionRefV1 decodeParent(String encoded) {
        String[] v = unfields(encoded, 4);
        return new ParentGoalRevisionRefV1(v[0], parsePositive(v[1]), v[2], v[3]);
    }

    private static String encodeRequirement(RequirementDeclV1 value) {
        return fields(value.requirementId(), value.kind().name(), value.declaration(), value.specialistOwnerRef(),
                packStrings(value.requiredEvidenceClasses()), value.inheritedFromRef());
    }

    private static RequirementDeclV1 decodeRequirement(String encoded) {
        String[] v = unfields(encoded, 6);
        return new RequirementDeclV1(v[0], RequirementKind.valueOf(v[1]), v[2], v[3], unpackStrings(v[4]), v[5]);
    }

    private static String encodeConstraint(ConstraintDeclV1 value) {
        return fields(value.constraintId(), value.hardness().name(), value.constraintType(), value.canonicalValue(),
                value.refinementComparator(), value.inheritedFromRef(), value.dispositionReason());
    }

    private static ConstraintDeclV1 decodeConstraint(String encoded) {
        String[] v = unfields(encoded, 7);
        return new ConstraintDeclV1(v[0], ConstraintHardness.valueOf(v[1]), v[2], v[3], v[4], v[5], v[6]);
    }

    private static String encodeSuccess(SuccessCriterionDeclV1 value) {
        return fields(value.criterionId(), value.declaration(), value.requiredEvidenceClass(), value.evaluatorRef(), value.thresholdDeclaration());
    }

    private static SuccessCriterionDeclV1 decodeSuccess(String encoded) {
        String[] v = unfields(encoded, 5);
        return new SuccessCriterionDeclV1(v[0], v[1], v[2], v[3], v[4]);
    }

    private static String encodeDelegation(DelegationCeilingV1 value) {
        return fields(Integer.toString(value.maxDelegationDepth()), Integer.toString(value.maxRiskClass()),
                packStrings(sorted(value.allowedDescendantRoles())), packStrings(sorted(value.allowedTargetClasses())),
                packStrings(sorted(value.forbiddenDelegationClasses())));
    }

    private static DelegationCeilingV1 decodeDelegation(String encoded) {
        String[] v = unfields(encoded, 5);
        return new DelegationCeilingV1(Integer.parseInt(v[0]), Integer.parseInt(v[1]),
                Set.copyOf(unpackStrings(v[2])), Set.copyOf(unpackStrings(v[3])), Set.copyOf(unpackStrings(v[4])));
    }

    private static String encodeResource(ResourceCeilingV1 value) {
        return fields(Long.toString(value.maxCostUnits()), Long.toString(value.maxComputeUnits()),
                Long.toString(value.maxStorageBytes()), Long.toString(value.maxDurationMillis()),
                packStrings(sorted(value.allowedResourceClasses())), packStrings(value.policyRefs()));
    }

    private static ResourceCeilingV1 decodeResource(String encoded) {
        String[] v = unfields(encoded, 6);
        return new ResourceCeilingV1(Long.parseLong(v[0]), Long.parseLong(v[1]), Long.parseLong(v[2]), Long.parseLong(v[3]),
                Set.copyOf(unpackStrings(v[4])), unpackStrings(v[5]));
    }

    private static String encodeHitl(HumanControlRequirementV1 value) {
        return fields(value.requirementId(), Integer.toString(value.triggerRiskClass()), Boolean.toString(value.approvalRequired()),
                value.requiredEvidenceClass(), value.policyRef());
    }

    private static HumanControlRequirementV1 decodeHitl(String encoded) {
        String[] v = unfields(encoded, 5);
        return new HumanControlRequirementV1(v[0], Integer.parseInt(v[1]), Boolean.parseBoolean(v[2]), v[3], v[4]);
    }

    private static String encodeAction(ActionEnvelopeV1 value) {
        return fields(packStrings(sorted(value.allowedActionClasses())), packStrings(sorted(value.forbiddenActionClasses())), packStrings(value.policyRefs()));
    }

    private static ActionEnvelopeV1 decodeAction(String encoded) {
        String[] v = unfields(encoded, 3);
        return new ActionEnvelopeV1(Set.copyOf(unpackStrings(v[0])), Set.copyOf(unpackStrings(v[1])), unpackStrings(v[2]));
    }

    private static String encodeContractGate(ContractGateReceiptV1 value) {
        return fields(value.subjectId(), value.version(), value.contractDigest(), value.receiptDigest(), value.standing().name(), Long.toString(value.observedRegistryRevision()));
    }

    private static String fields(String... values) {
        List<String> encoded = new ArrayList<>(values.length);
        for (String value : values) encoded.add(field(value));
        return String.join("|", encoded);
    }

    private static String[] unfields(String encoded, int expected) {
        String[] raw = encoded.split("\\|", -1);
        if (raw.length != expected) throw ex("KEEL_JOURNAL_CORRUPT");
        String[] values = new String[raw.length];
        for (int i = 0; i < raw.length; i++) values[i] = unfield(raw[i]);
        return values;
    }

    private static String field(String value) {
        if (value == null) return "~";
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }

    private static String unfield(String value) {
        if ("~".equals(value)) return null;
        try {
            return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw ex("KEEL_JOURNAL_CORRUPT");
        }
    }

    private static String packStrings(Collection<String> values) {
        if (values.isEmpty()) return "";
        List<String> encoded = new ArrayList<>(values.size());
        for (String value : values) encoded.add(field(Objects.requireNonNull(value, "collection value")));
        return String.join(",", encoded);
    }

    private static List<String> unpackStrings(String packed) {
        if (packed == null || packed.isEmpty()) return List.of();
        String[] values = packed.split(",", -1);
        List<String> result = new ArrayList<>(values.length);
        for (String value : values) result.add(Objects.requireNonNull(unfield(value), "decoded value"));
        return List.copyOf(result);
    }

    private interface Encoder<T> { String encode(T value); }
    private interface Decoder<T> { T decode(String value); }

    private static <T> String packObjects(Collection<T> values, Encoder<T> encoder) {
        List<String> encoded = new ArrayList<>(values.size());
        for (T value : values) encoded.add(encoder.encode(value));
        return packStrings(encoded);
    }

    private static <T> List<T> unpackObjects(String packed, Decoder<T> decoder) {
        List<String> values = unpackStrings(packed);
        List<T> result = new ArrayList<>(values.size());
        for (String value : values) result.add(decoder.decode(value));
        return List.copyOf(result);
    }

    private static List<String> sorted(Collection<String> values) {
        List<String> result = new ArrayList<>(values);
        result.sort(Comparator.naturalOrder());
        return result;
    }

    private static String revisionKey(String goalId, long revision) {
        return goalId + "#" + revision;
    }

    private static long parsePositive(String value) {
        try {
            long result = Long.parseLong(value);
            if (result < 1) throw new NumberFormatException("non-positive");
            return result;
        } catch (NumberFormatException e) {
            throw ex("KEEL_JOURNAL_CORRUPT");
        }
    }

    private static KeelException ex(String code) { return new KeelException(code); }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte b : bytes) result.append(String.format("%02x", b & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String requireDigest(String value) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw ex("KEEL_JOURNAL_CORRUPT");
        return value;
    }

    private static String digest(String value, String fieldName) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(fieldName);
        return value;
    }

    private static String token(String value, String fieldName) {
        if (value == null || value.isBlank() || value.length() > 256 || value.indexOf('\n') >= 0 || value.indexOf('\t') >= 0) {
            throw new IllegalArgumentException(fieldName);
        }
        rejectSecret(value);
        return value;
    }

    private static String text(String value, String fieldName, int max) {
        if (value == null || value.isBlank() || value.length() > max) throw new IllegalArgumentException(fieldName);
        rejectSecret(value);
        return value;
    }

    private static String nullableText(String value, String fieldName, int max) {
        return value == null ? null : text(value, fieldName, max);
    }

    private static String ref(String value, String fieldName) {
        if (value == null || value.isBlank() || value.length() > 1024) throw new IllegalArgumentException(fieldName);
        rejectSecret(value);
        return value;
    }

    private static String nullableRef(String value, String fieldName) {
        return value == null ? null : ref(value, fieldName);
    }

    private static List<String> refs(Collection<String> values, String fieldName, int maxItems) {
        Objects.requireNonNull(values, fieldName);
        if (values.size() > maxItems) throw new IllegalArgumentException(fieldName);
        List<String> result = new ArrayList<>(values.size());
        for (String value : values) result.add(ref(value, fieldName));
        return List.copyOf(result);
    }

    private static List<String> texts(Collection<String> values, String fieldName, int maxItems, int maxLength) {
        Objects.requireNonNull(values, fieldName);
        if (values.size() > maxItems) throw new IllegalArgumentException(fieldName);
        List<String> result = new ArrayList<>(values.size());
        for (String value : values) result.add(text(value, fieldName, maxLength));
        return List.copyOf(result);
    }

    private static Set<String> tokens(Collection<String> values, String fieldName, int maxItems) {
        Objects.requireNonNull(values, fieldName);
        if (values.size() > maxItems) throw new IllegalArgumentException(fieldName);
        LinkedHashSet<String> result = new LinkedHashSet<>();
        for (String value : values) result.add(token(value, fieldName));
        return Collections.unmodifiableSet(result);
    }

    private static <T> List<T> immutable(Collection<T> values, String fieldName, int maxItems) {
        Objects.requireNonNull(values, fieldName);
        if (values.size() > maxItems) throw new IllegalArgumentException(fieldName);
        List<T> result = new ArrayList<>(values.size());
        for (T value : values) result.add(Objects.requireNonNull(value, fieldName));
        return List.copyOf(result);
    }

    private static void unique(Collection<String> values, String code) {
        Set<String> seen = new LinkedHashSet<>();
        for (String value : values) if (!seen.add(value)) throw new IllegalArgumentException(code);
    }

    private static void rejectSecret(String value) {
        String lower = value.toLowerCase(java.util.Locale.ROOT);
        if (lower.contains("-----begin private key-----")
                || lower.contains("bearer ")
                || lower.contains("api_key=")
                || lower.contains("apikey=")
                || lower.contains("password=")
                || lower.contains("client_secret=")
                || lower.contains("secret_key=")) {
            throw ex("SECRET_FIELD_FORBIDDEN");
        }
    }
}
