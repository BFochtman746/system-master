package org.systemmaster.learning.binding;

import java.util.List;
import java.util.Objects;

import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InterfaceType;
import org.systemmaster.learning.binding.InboundBindingContracts.RegistrationSink;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Exact frozen 001C local bindings for I032 and I056-I062. */
public final class MasteryEvidenceAssessmentInboundHandlers {
    public static final String OWNER_PATH = "SYSTEM_MASTER/LEARNING";
    public static final String LEARNING_BINDING = "C18 LEARNING";
    public static final String CURRICULUM_BINDING = "C07 CURRICULUM";
    public static final String LRN_QUERY_PORT = "LRN-QRY-PORT-001";
    public static final String LRN_COMMAND_PORT = "LRN-CMD-PORT-001";
    public static final String CUR_COMMAND_PORT = "CUR-CMD-PORT-001";

    public static final RouteDescriptor I032 = new RouteDescriptor(
            "I032", InterfaceType.QUERY, "GetEvidencePackageForQualification", OWNER_PATH,
            LEARNING_BINDING, LRN_QUERY_PORT, "QualificationEvidenceService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I032", "QO-IF-I032",
            List.of("skill_refs", "purpose", "recipient_scope", "as_of"),
            List.of("InsufficientEvidence", "OverrideNotPermitted", "DependencyUnavailable"), false,
            "Read snapshot plus authorization/admissibility decision; no qualification outcome; zero writes/outbox");

    public static final RouteDescriptor I056 = new RouteDescriptor(
            "I056", InterfaceType.COMMAND, "SelectMasteryEvidenceProfile", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "MasteryEngine",
            "MASTER_CORE_ROUTE_MANIFEST_001::I056", "QO-IF-I056",
            List.of("skill_id", "expected_version", "evidence_profile_version", "client_operation_id"),
            List.of("VersionConflict", "InvalidEvidenceProfile"), true,
            "Expected-version update; generic evidence remains outside Learning mutation authority");

    public static final RouteDescriptor I057 = new RouteDescriptor(
            "I057", InterfaceType.COMMAND, "RecordExternalEvidenceCandidate", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "LearningEvidenceAdmissionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I057", "QO-IF-I057",
            List.of("candidate_id", "skill_ref", "external_evidence_refs", "provenance", "intended_use", "client_operation_id"),
            List.of("DuplicateOperationConflict", "EvidenceUnavailable"), true,
            "Candidate identity is stable; recording a candidate does not change mastery");

    public static final RouteDescriptor I058 = new RouteDescriptor(
            "I058", InterfaceType.COMMAND, "AdmitExternalEvidenceCandidate", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "LearningEvidenceAdmissionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I058", "QO-IF-I058",
            List.of("candidate_id", "decision_policy_version", "criterion_mappings", "admissibility_conditions", "client_operation_id"),
            List.of("EvidenceInadmissible", "VersionConflict"), true,
            "Candidate-version controlled admission; canonical external bytes remain external");

    public static final RouteDescriptor I059 = new RouteDescriptor(
            "I059", InterfaceType.COMMAND, "RejectExternalEvidenceCandidate", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "LearningEvidenceAdmissionService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I059", "QO-IF-I059",
            List.of("candidate_id", "reason_codes", "client_operation_id"),
            List.of("VersionConflict"), true,
            "Candidate-version controlled auditable rejection; source evidence is not deleted");

    public static final RouteDescriptor I060 = new RouteDescriptor(
            "I060", InterfaceType.COMMAND, "RequestMasteryReprojection", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "MasteryEngine",
            "MASTER_CORE_ROUTE_MANIFEST_001::I060", "QO-IF-I060",
            List.of("skill_refs", "reason", "policy_version", "client_operation_id"),
            List.of("MasteryPolicyMismatch", "DependencyUnavailable"), true,
            "Version-pinned deterministic reprojection request; generic long-job mechanics remain CORE-owned");

    public static final RouteDescriptor I061 = new RouteDescriptor(
            "I061", InterfaceType.COMMAND, "ChallengeMasteryProjection", OWNER_PATH,
            LEARNING_BINDING, LRN_COMMAND_PORT, "MasteryEngine",
            "MASTER_CORE_ROUTE_MANIFEST_001::I061", "QO-IF-I061",
            List.of("projection_id", "challenged_element", "user_reason", "client_operation_id"),
            List.of("ValidationError"), true,
            "Projection is immutable; challenge creates reviewable state and does not directly edit evidence");

    public static final RouteDescriptor I062 = new RouteDescriptor(
            "I062", InterfaceType.COMMAND, "CreateAssessmentBlueprint", OWNER_PATH,
            CURRICULUM_BINDING, CUR_COMMAND_PORT, "AssessmentBlueprintService",
            "MASTER_CORE_ROUTE_MANIFEST_001::I062", "QO-IF-I062",
            List.of("curriculum_version", "blueprint_spec", "client_operation_id"),
            List.of("ValidationError"), true,
            "Versioned Curriculum command creating a DRAFT AssessmentBlueprint");

    private MasteryEvidenceAssessmentInboundHandlers() {}

    public record GetEvidencePackageForQualificationQuery(Object skillRefs, Object purpose, Object recipientScope, Object asOf) {
        public GetEvidencePackageForQualificationQuery {
            skillRefs = required(skillRefs, "skill_refs"); purpose = required(purpose, "purpose");
            recipientScope = required(recipientScope, "recipient_scope"); asOf = required(asOf, "as_of");
        }
    }
    public record SelectMasteryEvidenceProfileCommand(Object skillId, Object expectedVersion, Object evidenceProfileVersion, Object clientOperationId) {
        public SelectMasteryEvidenceProfileCommand {
            skillId = required(skillId, "skill_id"); expectedVersion = required(expectedVersion, "expected_version");
            evidenceProfileVersion = required(evidenceProfileVersion, "evidence_profile_version"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record RecordExternalEvidenceCandidateCommand(Object candidateId, Object skillRef, Object externalEvidenceRefs, Object provenance, Object intendedUse, Object clientOperationId) {
        public RecordExternalEvidenceCandidateCommand {
            candidateId = required(candidateId, "candidate_id"); skillRef = required(skillRef, "skill_ref");
            externalEvidenceRefs = required(externalEvidenceRefs, "external_evidence_refs"); provenance = required(provenance, "provenance");
            intendedUse = required(intendedUse, "intended_use"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record AdmitExternalEvidenceCandidateCommand(Object candidateId, Object decisionPolicyVersion, Object criterionMappings, Object admissibilityConditions, Object clientOperationId) {
        public AdmitExternalEvidenceCandidateCommand {
            candidateId = required(candidateId, "candidate_id"); decisionPolicyVersion = required(decisionPolicyVersion, "decision_policy_version");
            criterionMappings = required(criterionMappings, "criterion_mappings"); admissibilityConditions = required(admissibilityConditions, "admissibility_conditions");
            clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record RejectExternalEvidenceCandidateCommand(Object candidateId, Object reasonCodes, Object clientOperationId) {
        public RejectExternalEvidenceCandidateCommand {
            candidateId = required(candidateId, "candidate_id"); reasonCodes = required(reasonCodes, "reason_codes"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record RequestMasteryReprojectionCommand(Object skillRefs, Object reason, Object policyVersion, Object clientOperationId) {
        public RequestMasteryReprojectionCommand {
            skillRefs = required(skillRefs, "skill_refs"); reason = required(reason, "reason"); policyVersion = required(policyVersion, "policy_version"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record ChallengeMasteryProjectionCommand(Object projectionId, Object challengedElement, Object userReason, Object clientOperationId) {
        public ChallengeMasteryProjectionCommand {
            projectionId = required(projectionId, "projection_id"); challengedElement = required(challengedElement, "challenged_element");
            userReason = required(userReason, "user_reason"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }
    public record CreateAssessmentBlueprintCommand(Object curriculumVersion, Object blueprintSpec, Object clientOperationId) {
        public CreateAssessmentBlueprintCommand {
            curriculumVersion = required(curriculumVersion, "curriculum_version"); blueprintSpec = required(blueprintSpec, "blueprint_spec"); clientOperationId = required(clientOperationId, "client_operation_id");
        }
    }

    public interface QualificationEvidencePort { Object getEvidencePackageForQualification(GetEvidencePackageForQualificationQuery query) throws Exception; }
    public interface MasteryEnginePort {
        Object selectMasteryEvidenceProfile(SelectMasteryEvidenceProfileCommand command) throws Exception;
        Object requestMasteryReprojection(RequestMasteryReprojectionCommand command) throws Exception;
        Object challengeMasteryProjection(ChallengeMasteryProjectionCommand command) throws Exception;
    }
    public interface LearningEvidenceAdmissionPort {
        Object recordExternalEvidenceCandidate(RecordExternalEvidenceCandidateCommand command) throws Exception;
        Object admitExternalEvidenceCandidate(AdmitExternalEvidenceCandidateCommand command) throws Exception;
        Object rejectExternalEvidenceCandidate(RejectExternalEvidenceCandidateCommand command) throws Exception;
    }
    public interface AssessmentBlueprintPort { Object createAssessmentBlueprint(CreateAssessmentBlueprintCommand command) throws Exception; }

    public static void registerAll(RegistrationSink sink, QualificationEvidencePort qualificationEvidence,
            MasteryEnginePort masteryEngine, LearningEvidenceAdmissionPort evidenceAdmission,
            AssessmentBlueprintPort assessmentBlueprint) {
        Objects.requireNonNull(sink, "sink"); Objects.requireNonNull(qualificationEvidence, "qualificationEvidence");
        Objects.requireNonNull(masteryEngine, "masteryEngine"); Objects.requireNonNull(evidenceAdmission, "evidenceAdmission");
        Objects.requireNonNull(assessmentBlueprint, "assessmentBlueprint");
        sink.register(I032, e -> qualificationEvidence.getEvidencePackageForQualification(payload(e, I032, GetEvidencePackageForQualificationQuery.class)));
        sink.register(I056, e -> masteryEngine.selectMasteryEvidenceProfile(payload(e, I056, SelectMasteryEvidenceProfileCommand.class)));
        sink.register(I057, e -> evidenceAdmission.recordExternalEvidenceCandidate(payload(e, I057, RecordExternalEvidenceCandidateCommand.class)));
        sink.register(I058, e -> evidenceAdmission.admitExternalEvidenceCandidate(payload(e, I058, AdmitExternalEvidenceCandidateCommand.class)));
        sink.register(I059, e -> evidenceAdmission.rejectExternalEvidenceCandidate(payload(e, I059, RejectExternalEvidenceCandidateCommand.class)));
        sink.register(I060, e -> masteryEngine.requestMasteryReprojection(payload(e, I060, RequestMasteryReprojectionCommand.class)));
        sink.register(I061, e -> masteryEngine.challengeMasteryProjection(payload(e, I061, ChallengeMasteryProjectionCommand.class)));
        sink.register(I062, e -> assessmentBlueprint.createAssessmentBlueprint(payload(e, I062, CreateAssessmentBlueprintCommand.class)));
    }

    private static <T> T payload(InboundEnvelope envelope, RouteDescriptor descriptor, Class<T> type) throws Exception {
        return InboundBindingContracts.requirePayload(envelope, descriptor, type);
    }
    private static <T> T required(T value, String name) { return InboundBindingContracts.requiredField(value, name); }
}
