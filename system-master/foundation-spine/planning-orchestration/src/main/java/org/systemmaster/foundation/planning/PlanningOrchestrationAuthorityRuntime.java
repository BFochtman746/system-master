package org.systemmaster.foundation.planning;

import org.systemmaster.foundation.workproject.WorkProjectAuthorityRuntime;
import org.systemmaster.foundation.workproject.WorkProjectAuthorityRuntime.WorkPlanningRefV1;

import java.io.*;
import java.math.BigDecimal;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

/** Fresh Foundation Planning & Orchestration authority. */
public final class PlanningOrchestrationAuthorityRuntime {
    public static final String STORE_VERSION = "FOUNDATION-PLANNING-ORCHESTRATION-1";
    public static final String CONTRACT_ID = "FOUNDATION-PLANNING-ORCHESTRATION";
    public static final String CONTRACT_VERSION = "1";
    public static final int MAX_STEPS = 1024;
    public static final int MAX_EDGES = 8192;
    public static final int MAX_DAG_DEPTH = 64;
    public static final int MAX_DIRECT_PREDECESSORS = 64;
    public static final int MAX_DIRECT_SUCCESSORS = 64;
    public static final int MAX_READY_WIDTH = 64;
    public static final int MAX_PLAN_REVISIONS = 256;
    public static final int MAX_PREDICATE_NODES = 128;
    public static final int MAX_PREDICATE_DEPTH = 16;

    public enum PlanStanding { DRAFT, ACTIVE, BLOCKED, REPLAN_REQUIRED, COMPLETION_READY, SUPERSEDED, CANCELLED }
    public enum StepKind { EXECUTION, HUMAN_WAIT, CONDITION, JOIN }
    public enum CompletionRole { REQUIRED, OPTIONAL, CONDITIONAL }
    public enum StepStanding { NOT_READY, READY, WAITING_EXTERNAL, SATISFIED, FAILED, SKIPPED, BLOCKED, UNKNOWN }
    public enum EdgeGate { ON_SATISFIED, ON_FAILED, ON_SKIPPED, ON_CONDITION_TRUE, ON_CONDITION_FALSE, ON_TERMINAL }
    public enum JoinKind { ALL, ANY, AT_LEAST_N }
    public enum ConditionResult { TRUE, FALSE, UNKNOWN, INVALID }
    public enum GateStanding { VALID, INVALID, UNKNOWN }
    public enum BasisKind { OWNER_COMPLETION, POLICY_DECISION, HUMAN_DECISION, RUNTIME_EXIT, TELEMETRY }
    public enum AssociationKind { POLICY_DECISION, ADMISSION, ROUTE, RESOURCE_GRANT, ASSIGNMENT, JOB, ATTEMPT, EFFECT, ARTIFACT, EVIDENCE, COMPLETION_BASIS, RECOVERY_EPISODE }
    public enum Freshness { CURRENT, STALE, UNKNOWN, DEGRADED }

    public record BoundGoalRef(String goalId,int goalRevision,String goalRevisionId,String goalContentDigest,String keelValidationReceiptDigest,
                               String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,String parentGoalRevisionRef,
                               long observedKeelRegistryRevision) implements Serializable {
        private static final long serialVersionUID=1L;
    }
    public record BoundWorkRef(String workId,long workEntityRevision,BoundGoalRef governedGoalRef,String projectId,String parentWorkId,
                              String lifecycle,List<String> blockerRefs,long workRegistryRevision,String canonicalDigest) implements Serializable {
        private static final long serialVersionUID=1L;
        public BoundWorkRef { blockerRefs=List.copyOf(blockerRefs); }
    }
    public record ResourceDemand(String dimension,String amountOrRange,String unit,String hardness) implements Serializable {
        private static final long serialVersionUID=1L;
        public ResourceDemand { text(dimension,"dimension"); text(amountOrRange,"amountOrRange"); text(unit,"unit"); text(hardness,"hardness"); }
    }
    public record StepRequirements(List<String> capabilityContractClassRefs,List<ResourceDemand> resourceDemand,List<String> policyDecisionClassRefs,
                                   List<String> dataLocalityIsolationRefs,List<String> specialistInterfaceRefs,List<String> inheritedKeelConstraintRefs) implements Serializable {
        private static final long serialVersionUID=1L;
        public StepRequirements {
            capabilityContractClassRefs=cleanList(capabilityContractClassRefs,"capabilityContractClassRefs");
            resourceDemand=List.copyOf(Objects.requireNonNull(resourceDemand,"resourceDemand"));
            policyDecisionClassRefs=cleanList(policyDecisionClassRefs,"policyDecisionClassRefs");
            dataLocalityIsolationRefs=cleanList(dataLocalityIsolationRefs,"dataLocalityIsolationRefs");
            specialistInterfaceRefs=cleanList(specialistInterfaceRefs,"specialistInterfaceRefs");
            inheritedKeelConstraintRefs=cleanList(inheritedKeelConstraintRefs,"inheritedKeelConstraintRefs");
        }
        public String digest(){return sha256(canonicalRequirements(this));}
    }
    public record PredicateNode(String operator,String literal,String refKey,List<PredicateNode> children) implements Serializable {
        private static final long serialVersionUID=1L;
        public PredicateNode { text(operator,"operator"); children=List.copyOf(children==null?List.of():children); }
        public static PredicateNode constant(String value){return new PredicateNode("CONST",value,null,List.of());}
        public static PredicateNode ref(String key){return new PredicateNode("REF",null,key,List.of());}
        public static PredicateNode op(String op,PredicateNode...children){return new PredicateNode(op,null,null,List.of(children));}
    }
    public record ConditionSpec(String conditionId,String languageVersion,PredicateNode expression) implements Serializable {
        private static final long serialVersionUID=1L;
        public ConditionSpec { text(conditionId,"conditionId"); text(languageVersion,"languageVersion"); Objects.requireNonNull(expression,"expression"); }
        public String digest(){return sha256(conditionId+"|"+languageVersion+"|"+canonicalPredicate(expression));}
    }
    public record HumanWaitSpec(String requirementRef,String ownerAuthority,String requiredSubjectDigest,List<String> acceptedStandingClasses) implements Serializable {
        private static final long serialVersionUID=1L;
        public HumanWaitSpec { text(requirementRef,"requirementRef"); text(ownerAuthority,"ownerAuthority"); digest(requiredSubjectDigest,"requiredSubjectDigest"); acceptedStandingClasses=cleanList(acceptedStandingClasses,"acceptedStandingClasses"); }
        public String digest(){return sha256(requirementRef+"|"+ownerAuthority+"|"+requiredSubjectDigest+"|"+String.join(",",acceptedStandingClasses));}
    }
    public record StepSpec(String stepId,int stepRevision,StepKind kind,CompletionRole completionRole,StepRequirements requirements,
                           ConditionSpec conditionSpec,HumanWaitSpec humanWaitSpec,String completionPredicateRef) implements Serializable {
        private static final long serialVersionUID=1L;
        public StepSpec {
            text(stepId,"stepId"); if(stepRevision<1)throw new IllegalArgumentException("stepRevision"); Objects.requireNonNull(kind,"kind"); Objects.requireNonNull(completionRole,"completionRole"); Objects.requireNonNull(requirements,"requirements");
            if(kind==StepKind.CONDITION && conditionSpec==null)throw new IllegalArgumentException("CONDITION_SPEC_REQUIRED");
            if(kind!=StepKind.CONDITION && conditionSpec!=null)throw new IllegalArgumentException("CONDITION_SPEC_FORBIDDEN");
            if(kind==StepKind.HUMAN_WAIT && humanWaitSpec==null)throw new IllegalArgumentException("HUMAN_WAIT_SPEC_REQUIRED");
            if(kind!=StepKind.HUMAN_WAIT && humanWaitSpec!=null)throw new IllegalArgumentException("HUMAN_WAIT_SPEC_FORBIDDEN");
            if(completionPredicateRef!=null)text(completionPredicateRef,"completionPredicateRef");
        }
        public String digest(){return sha256(canonicalStep(this));}
    }
    public record EdgeSpec(String edgeId,String fromStepId,String toStepId,EdgeGate gate) implements Serializable {
        private static final long serialVersionUID=1L;
        public EdgeSpec { text(edgeId,"edgeId"); text(fromStepId,"fromStepId"); text(toStepId,"toStepId"); Objects.requireNonNull(gate,"gate"); }
        public String digest(){return sha256(edgeId+"|"+fromStepId+"|"+toStepId+"|"+gate);}
    }
    public record JoinSpec(JoinKind kind,int atLeastN) implements Serializable {
        private static final long serialVersionUID=1L;
        public JoinSpec { Objects.requireNonNull(kind,"kind"); if(kind==JoinKind.AT_LEAST_N&&atLeastN<1)throw new IllegalArgumentException("atLeastN"); if(kind!=JoinKind.AT_LEAST_N&&atLeastN!=0)throw new IllegalArgumentException("atLeastN only with AT_LEAST_N"); }
    }
    public record PlanCandidate(List<StepSpec> steps,List<EdgeSpec> edges,Map<String,JoinSpec> joins,String completionPredicateRef,String partialSuccessPolicyRef) implements Serializable {
        private static final long serialVersionUID=1L;
        public PlanCandidate {
            steps=List.copyOf(Objects.requireNonNull(steps,"steps")); edges=List.copyOf(Objects.requireNonNull(edges,"edges")); joins=Map.copyOf(Objects.requireNonNull(joins,"joins"));
            text(completionPredicateRef,"completionPredicateRef"); if(partialSuccessPolicyRef!=null)text(partialSuccessPolicyRef,"partialSuccessPolicyRef");
        }
        public String digest(){return sha256(canonicalCandidate(this));}
    }
    public record PlanIdentity(String planId,String workId,String createdByPrincipalRef,Instant createdAt,String contractSubjectId,
                               String contractSubjectVersion,String contractSubjectDigest,String identityDigest) implements Serializable {
        private static final long serialVersionUID=1L;
    }
    public record PlanRevisionSpec(String planId,int planRevision,String planRevisionId,String parentPlanRevisionRef,BoundWorkRef workRef,
                                   PlanCandidate candidate,String planContentDigest,long publishedRegistryRevision,Instant createdAt) implements Serializable {
        private static final long serialVersionUID=1L;
    }
    public record StepState(StepStanding standing,String basisDigest,String conditionReceiptDigest,long stateRevision) implements Serializable {
        private static final long serialVersionUID=1L;
    }
    public record ExternalBasis(BasisKind kind,String ownerAuthority,String externalRef,String subjectDigest,String standing,Instant observedAt) implements Serializable {
        private static final long serialVersionUID=1L;
        public ExternalBasis { Objects.requireNonNull(kind,"kind"); text(ownerAuthority,"ownerAuthority"); text(externalRef,"externalRef"); digest(subjectDigest,"subjectDigest"); text(standing,"standing"); Objects.requireNonNull(observedAt,"observedAt"); }
        public String digest(){return sha256(kind+"|"+ownerAuthority+"|"+externalRef+"|"+subjectDigest+"|"+standing+"|"+observedAt);}
    }
    public record BoundValue(String ownerAuthority,String externalRef,String versionOrDigest,String canonicalValue) implements Serializable {
        private static final long serialVersionUID=1L;
        public BoundValue { text(ownerAuthority,"ownerAuthority"); text(externalRef,"externalRef"); text(versionOrDigest,"versionOrDigest"); Objects.requireNonNull(canonicalValue,"canonicalValue"); }
        public String digest(){return sha256(ownerAuthority+"|"+externalRef+"|"+versionOrDigest+"|"+canonicalValue);}
    }
    public record ConditionReceipt(String conditionId,String planRevisionId,String stepId,String evaluatorVersion,Map<String,String> inputDigests,
                                   ConditionResult result,List<String> reasonCodes,Instant evaluatedAt,String receiptDigest) implements Serializable {
        private static final long serialVersionUID=1L;
        public ConditionReceipt { inputDigests=Map.copyOf(inputDigests); reasonCodes=List.copyOf(reasonCodes); }
    }
    public record StepAssociation(String associationId,String stepId,AssociationKind kind,String ownerAuthority,String externalRef,String versionOrDigest,Instant recordedAt) implements Serializable {
        private static final long serialVersionUID=1L;
        public StepAssociation { text(associationId,"associationId"); text(stepId,"stepId"); Objects.requireNonNull(kind,"kind"); text(ownerAuthority,"ownerAuthority"); text(externalRef,"externalRef"); if(versionOrDigest!=null)text(versionOrDigest,"versionOrDigest"); Objects.requireNonNull(recordedAt,"recordedAt"); }
    }
    public record PlanningCheckpoint(String planRevisionId,String planContentDigest,long checkpointSequence,long planningRegistryRevision,
                                     Map<String,StepState> stepStates,Map<String,String> conditionReceiptDigests,List<String> outstandingWaitRefs,
                                     String priorCheckpointDigest,Instant createdAt,String checkpointDigest) implements Serializable {
        private static final long serialVersionUID=1L;
        public PlanningCheckpoint { stepStates=Map.copyOf(stepStates); conditionReceiptDigests=Map.copyOf(conditionReceiptDigests); outstandingWaitRefs=List.copyOf(outstandingWaitRefs); }
    }
    public record CommandMeta(String commandId,String idempotencyKey,String principalRef,Long expectedOrchestrationRevision,
                              String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,String requestPayloadDigest) {
        public CommandMeta { text(commandId,"commandId"); text(idempotencyKey,"idempotencyKey"); text(principalRef,"principalRef"); if(expectedOrchestrationRevision!=null&&expectedOrchestrationRevision<1)throw new IllegalArgumentException("expectedOrchestrationRevision"); text(contractSubjectId,"contractSubjectId"); text(contractSubjectVersion,"contractSubjectVersion"); digest(contractSubjectDigest,"contractSubjectDigest"); digest(requestPayloadDigest,"requestPayloadDigest"); }
    }
    public record PlanRevisionView(String planId,int planRevision,String planRevisionId,String workId,PlanStanding standing,long orchestrationRevision,
                                   long planningRegistryRevision,String planContentDigest,Map<String,StepState> stepStates) {}
    public record PlanRef(String planId,int planRevision,String planRevisionId,String workId,String goalRevisionId,String goalContentDigest,
                          String workPlanningRefDigest,String planContentDigest,String graphDigest,PlanStanding standing,long planningRegistryRevision,String canonicalDigest) {}
    public record PlanStepRef(String planRefDigest,String stepId,int stepRevision,String stepContentDigest,String requirementsDigest,
                              StepStanding readinessStanding,String readinessReceiptDigest,String canonicalDigest) {}
    public record ReadinessHandoff(String workPlanningRefDigest,BoundGoalRef governedGoalRef,PlanRef planRef,PlanStepRef planStepRef,
                                   StepRequirements requirements,String requirementsDigest,String readinessReceiptDigest,long planningRegistryRevision,
                                   String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,String canonicalDigest) {}
    public record Projection<T>(T value,Freshness freshness,long authoritativeRegistryRevision,Instant projectedAt) {}

    @FunctionalInterface public interface WorkRefValidator { boolean isCurrentExact(BoundWorkRef ref); }
    @FunctionalInterface public interface ContractValidator { boolean isCompatible(String subjectId,String subjectVersion,String subjectDigest); }
    @FunctionalInterface public interface GoalConstraintGate { GateStanding validate(BoundWorkRef workRef,PlanCandidate candidate); }
    @FunctionalInterface public interface FaultInjector { void beforeAppend() throws IOException; }

    public static final class CorruptStoreException extends IllegalStateException { private static final long serialVersionUID=1L; public CorruptStoreException(String m){super(m);} public CorruptStoreException(String m,Throwable c){super(m,c);} }
    public static final class StaleRevisionException extends IllegalStateException { private static final long serialVersionUID=1L; public StaleRevisionException(String m){super(m);} }
    public static final class IdempotencyConflictException extends IllegalStateException { private static final long serialVersionUID=1L; public IdempotencyConflictException(String m){super(m);} }

    private static final class PlanRuntime implements Serializable {
        private static final long serialVersionUID=1L;
        PlanRevisionSpec spec; PlanStanding standing; long orchestrationRevision;
        LinkedHashMap<String,StepState> stepStates=new LinkedHashMap<>();
        LinkedHashMap<String,ConditionReceipt> conditionReceipts=new LinkedHashMap<>();
        LinkedHashMap<String,List<StepAssociation>> associations=new LinkedHashMap<>();
        PlanningCheckpoint checkpoint;
        PlanRuntime(PlanRevisionSpec spec){this.spec=spec;this.standing=PlanStanding.DRAFT;this.orchestrationRevision=1;for(StepSpec s:spec.candidate().steps())stepStates.put(s.stepId(),new StepState(StepStanding.NOT_READY,null,null,1));}
    }
    private record PlanKey(String planId,int revision) implements Serializable { private static final long serialVersionUID=1L; }
    private record IdempotencyReceipt(String requestDigest,String principalRef,String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,
                                      String resultKind,String planId,int planRevision,String stepId,String resultDigest) implements Serializable { private static final long serialVersionUID=1L; }
    private static final class State implements Serializable {
        private static final long serialVersionUID=1L;
        long registryRevision=0; long frameSequence=0; String lastFrameDigest="GENESIS";
        LinkedHashMap<String,PlanIdentity> identities=new LinkedHashMap<>();
        LinkedHashMap<String,TreeMap<Integer,PlanRuntime>> plans=new LinkedHashMap<>();
        LinkedHashMap<String,PlanKey> currentByWork=new LinkedHashMap<>();
        LinkedHashMap<String,IdempotencyReceipt> idempotency=new LinkedHashMap<>();
    }

    private final Path logPath;
    private final Clock clock;
    private final WorkRefValidator workRefValidator;
    private final ContractValidator contractValidator;
    private final GoalConstraintGate goalConstraintGate;
    private final FaultInjector faultInjector;
    private final Object mutex=new Object();
    private State state=new State();

    public PlanningOrchestrationAuthorityRuntime(Path logPath,Clock clock,WorkRefValidator workRefValidator,ContractValidator contractValidator,
                                                 GoalConstraintGate goalConstraintGate,FaultInjector faultInjector) throws IOException {
        this.logPath=Objects.requireNonNull(logPath,"logPath").toAbsolutePath(); this.clock=Objects.requireNonNull(clock,"clock");
        this.workRefValidator=Objects.requireNonNull(workRefValidator,"workRefValidator"); this.contractValidator=Objects.requireNonNull(contractValidator,"contractValidator");
        this.goalConstraintGate=Objects.requireNonNull(goalConstraintGate,"goalConstraintGate"); this.faultInjector=Objects.requireNonNull(faultInjector,"faultInjector");
        Path p=this.logPath.getParent(); if(p!=null)Files.createDirectories(p); if(Files.exists(this.logPath)&&Files.size(this.logPath)>0)replay();
    }

    public static String payloadDigest(String operation,String...fields){StringBuilder b=new StringBuilder(operation);for(String f:fields)b.append('|').append(f==null?"<null>":f);return sha256(b.toString());}

    public PlanRevisionView createPlan(CommandMeta meta,WorkPlanningRefV1 workRef,String planId,PlanCandidate candidate) throws IOException {
        synchronized(mutex){
            BoundWorkRef bound=bindWorkRef(workRef); String candidateDigest=candidate.digest(); String request=payloadDigest("CreatePlan",bound.canonicalDigest(),planId,candidateDigest); validateMeta(meta,request,null);
            IdempotencyReceipt prior=checkReplay(meta,request,"PLAN"); if(prior!=null)return view(prior.planId(),prior.planRevision());
            text(planId,"planId"); if(state.identities.containsKey(planId))throw new IllegalArgumentException("PLAN_IDENTITY_CONFLICT"); validateStructure(candidate);
            State next=copy(state); long reg=state.registryRevision+1; Instant now=clock.instant(); String identityDigest=sha256(planId+"|"+bound.workId()+"|"+meta.principalRef()+"|"+now+"|"+meta.contractSubjectId()+"|"+meta.contractSubjectVersion()+"|"+meta.contractSubjectDigest());
            PlanIdentity identity=new PlanIdentity(planId,bound.workId(),meta.principalRef(),now,meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),identityDigest);
            PlanRevisionSpec spec=makeSpec(planId,1,null,bound,candidate,reg,now); PlanRuntime runtime=new PlanRuntime(spec);
            next.identities.put(planId,identity); next.plans.put(planId,new TreeMap<>()); next.plans.get(planId).put(1,runtime); next.registryRevision=reg;
            IdempotencyReceipt receipt=new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,1,null,sha256("PLAN|"+planId+"|1|"+spec.planContentDigest())); next.idempotency.put(meta.idempotencyKey(),receipt);
            persist(next); state=next; return view(planId,1);
        }
    }

    public PlanRevisionView createPlanRevision(CommandMeta meta,String planId,int parentRevision,WorkPlanningRefV1 workRef,PlanCandidate candidate) throws IOException {
        synchronized(mutex){
            PlanRuntime parent=requirePlan(planId,parentRevision); BoundWorkRef bound=bindWorkRef(workRef); String request=payloadDigest("CreatePlanRevision",planId,Integer.toString(parentRevision),bound.canonicalDigest(),candidate.digest()); validateMeta(meta,request,parent.orchestrationRevision);
            IdempotencyReceipt prior=checkReplay(meta,request,"PLAN"); if(prior!=null)return view(prior.planId(),prior.planRevision());
            if(parentRevision!=latestRevision(planId))throw new IllegalArgumentException("PLAN_REVISION_CONFLICT"); TreeMap<Integer,PlanRuntime> versions=state.plans.get(planId); if(versions.size()>=MAX_PLAN_REVISIONS)throw new IllegalArgumentException("PLAN_LIMIT_EXCEEDED");
            PlanIdentity id=state.identities.get(planId); if(!id.workId().equals(bound.workId()))throw new IllegalArgumentException("CROSS_WORK_PLAN_REBIND");
            BoundGoalRef oldGoal=parent.spec.workRef().governedGoalRef(),newGoal=bound.governedGoalRef(); if(!oldGoal.goalId().equals(newGoal.goalId()))throw new IllegalArgumentException("CROSS_GOAL_PLAN_REBIND"); if(newGoal.goalRevision()<oldGoal.goalRevision())throw new IllegalArgumentException("GOAL_REVISION_STALE");
            validateStructure(candidate); State next=copy(state); long reg=state.registryRevision+1; int rev=parentRevision+1; Instant now=clock.instant(); PlanRevisionSpec spec=makeSpec(planId,rev,parent.spec.planRevisionId(),bound,candidate,reg,now); next.plans.get(planId).put(rev,new PlanRuntime(spec)); next.registryRevision=reg;
            IdempotencyReceipt receipt=new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,rev,null,sha256("PLAN|"+planId+"|"+rev+"|"+spec.planContentDigest())); next.idempotency.put(meta.idempotencyKey(),receipt);
            persist(next);state=next;return view(planId,rev);
        }
    }

    public PlanRevisionView activatePlanRevision(CommandMeta meta,String planId,int revision) throws IOException {
        synchronized(mutex){
            PlanRuntime existing=requirePlan(planId,revision); String request=payloadDigest("ActivatePlanRevision",planId,Integer.toString(revision),existing.spec.planContentDigest()); validateMeta(meta,request,existing.orchestrationRevision); IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());
            if(existing.standing!=PlanStanding.DRAFT)throw new IllegalStateException("PLAN_NOT_DRAFT"); BoundWorkRef ref=existing.spec.workRef(); validateActionableWork(ref); if(!workRefValidator.isCurrentExact(ref))throw new IllegalStateException("WORK_REVISION_STALE"); GateStanding gate=goalConstraintGate.validate(ref,existing.spec.candidate()); if(gate==GateStanding.UNKNOWN)throw new IllegalStateException("UNKNOWN_REFINEMENT_COMPARATOR"); if(gate!=GateStanding.VALID)throw new IllegalStateException("HARD_REQUIREMENT_WIDENED");
            PlanKey current=state.currentByWork.get(ref.workId()); if(current!=null && !current.planId().equals(planId))throw new IllegalStateException("PLAN_CURRENT_POINTER_CONFLICT");
            if(current!=null && revision!=current.revision()+1)throw new IllegalStateException("PLAN_REVISION_CONFLICT");
            State next=copy(state); PlanRuntime target=next.plans.get(planId).get(revision); if(current!=null){PlanRuntime old=next.plans.get(current.planId()).get(current.revision());if(!isActionable(old.standing))throw new IllegalStateException("PLAN_CURRENT_POINTER_CONFLICT");old.standing=PlanStanding.SUPERSEDED;old.orchestrationRevision++;}
            target.standing=PlanStanding.ACTIVE;target.orchestrationRevision++;computeReadiness(target);next.currentByWork.put(ref.workId(),new PlanKey(planId,revision));next.registryRevision=state.registryRevision+1;
            IdempotencyReceipt receipt=new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,null,sha256("ACTIVATE|"+planId+"|"+revision+"|"+target.orchestrationRevision));next.idempotency.put(meta.idempotencyKey(),receipt);
            persist(next);state=next;return view(planId,revision);
        }
    }

    public ConditionReceipt recordConditionEvaluation(CommandMeta meta,String planId,int revision,String stepId,Map<String,BoundValue> inputs) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);StepSpec step=requireStep(p,stepId);if(step.kind()!=StepKind.CONDITION)throw new IllegalArgumentException("STEP_NOT_CONDITION");String inputDigest=canonicalInputs(inputs);String request=payloadDigest("RecordConditionEvaluation",planId,Integer.toString(revision),stepId,step.conditionSpec().digest(),inputDigest);validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"CONDITION");if(prior!=null)return requirePlan(prior.planId(),prior.planRevision()).conditionReceipts.get(prior.stepId());
            if(p.standing!=PlanStanding.ACTIVE)throw new IllegalStateException("PLAN_NOT_ACTIVE");if(p.stepStates.get(stepId).standing()!=StepStanding.READY)throw new IllegalStateException("STEP_NOT_READY");
            Eval eval=evaluate(step.conditionSpec(),inputs);Instant now=clock.instant();LinkedHashMap<String,String> digests=new LinkedHashMap<>();inputs.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->digests.put(e.getKey(),e.getValue().digest()));String receiptDigest=sha256(step.conditionSpec().digest()+"|"+inputDigest+"|"+eval.result+"|"+String.join(",",eval.reasons)+"|"+now);ConditionReceipt receipt=new ConditionReceipt(step.conditionSpec().conditionId(),p.spec.planRevisionId(),stepId,"SM_PREDICATE_V1",digests,eval.result,eval.reasons,now,receiptDigest);
            State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);q.conditionReceipts.put(stepId,receipt);StepState old=q.stepStates.get(stepId);StepStanding s=(eval.result==ConditionResult.TRUE||eval.result==ConditionResult.FALSE)?StepStanding.SATISFIED:StepStanding.UNKNOWN;q.stepStates.put(stepId,new StepState(s,receiptDigest,receiptDigest,old.stateRevision()+1));q.orchestrationRevision++;computeReadiness(q);next.registryRevision=state.registryRevision+1;IdempotencyReceipt ir=new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"CONDITION",planId,revision,stepId,receiptDigest);next.idempotency.put(meta.idempotencyKey(),ir);persist(next);state=next;return receipt;
        }
    }

    public PlanRevisionView recordHumanWaitBasis(CommandMeta meta,String planId,int revision,String stepId,ExternalBasis basis) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);StepSpec step=requireStep(p,stepId);if(step.kind()!=StepKind.HUMAN_WAIT)throw new IllegalArgumentException("STEP_NOT_HUMAN_WAIT");String request=payloadDigest("RecordHumanWaitBasis",planId,Integer.toString(revision),stepId,basis.digest());validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());HumanWaitSpec wait=step.humanWaitSpec();if(basis.kind()!=BasisKind.HUMAN_DECISION||!wait.ownerAuthority().equals(basis.ownerAuthority())||!wait.requiredSubjectDigest().equals(basis.subjectDigest())||!wait.acceptedStandingClasses().contains(basis.standing()))throw new IllegalArgumentException("HUMAN_BASIS_MISSING_OR_MISMATCHED");
            State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);StepState old=q.stepStates.get(stepId);q.stepStates.put(stepId,new StepState(StepStanding.SATISFIED,basis.digest(),null,old.stateRevision()+1));q.orchestrationRevision++;computeReadiness(q);next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,stepId,basis.digest()));persist(next);state=next;return view(planId,revision);
        }
    }

    public PlanRevisionView recordStepBasis(CommandMeta meta,String planId,int revision,String stepId,ExternalBasis basis,StepStanding desired) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);StepSpec step=requireStep(p,stepId);if(step.kind()!=StepKind.EXECUTION)throw new IllegalArgumentException("STEP_NOT_EXECUTION");if(desired!=StepStanding.SATISFIED&&desired!=StepStanding.FAILED&&desired!=StepStanding.SKIPPED&&desired!=StepStanding.UNKNOWN)throw new IllegalArgumentException("INVALID_STEP_BASIS_STANDING");if(basis.kind()==BasisKind.RUNTIME_EXIT||basis.kind()==BasisKind.TELEMETRY)throw new IllegalArgumentException("COMPLETION_BASIS_MISSING");String request=payloadDigest("RecordStepBasis",planId,Integer.toString(revision),stepId,basis.digest(),desired.name());validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());if(!isActionable(p.standing)&&p.standing!=PlanStanding.COMPLETION_READY)throw new IllegalStateException("PLAN_NOT_ACTIONABLE");
            State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);StepState old=q.stepStates.get(stepId);q.stepStates.put(stepId,new StepState(desired,basis.digest(),null,old.stateRevision()+1));q.orchestrationRevision++;computeReadiness(q);next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,stepId,basis.digest()));persist(next);state=next;return view(planId,revision);
        }
    }

    public PlanRevisionView recordStepAssociation(CommandMeta meta,String planId,int revision,String stepId,StepAssociation association) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);requireStep(p,stepId);if(!association.stepId().equals(stepId))throw new IllegalArgumentException("ASSOCIATION_STEP_MISMATCH");String request=payloadDigest("RecordStepAssociation",planId,Integer.toString(revision),stepId,association.associationId(),association.kind().name(),association.ownerAuthority(),association.externalRef(),association.versionOrDigest());validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);q.associations.computeIfAbsent(stepId,k->new ArrayList<>()).add(association);StepState old=q.stepStates.get(stepId);if(old.standing()==StepStanding.READY)q.stepStates.put(stepId,new StepState(StepStanding.WAITING_EXTERNAL,old.basisDigest(),old.conditionReceiptDigest(),old.stateRevision()+1));q.orchestrationRevision++;next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,stepId,sha256(association.associationId())));persist(next);state=next;return view(planId,revision);
        }
    }

    public PlanRevisionView markPlanBlocked(CommandMeta meta,String planId,int revision,String blockerRef) throws IOException {return changePlanStanding(meta,"MarkPlanBlocked",planId,revision,PlanStanding.BLOCKED,blockerRef);}
    public PlanRevisionView markPlanReplanRequired(CommandMeta meta,String planId,int revision,String reasonRef) throws IOException {return changePlanStanding(meta,"MarkPlanReplanRequired",planId,revision,PlanStanding.REPLAN_REQUIRED,reasonRef);}
    public PlanRevisionView cancelPlanRevision(CommandMeta meta,String planId,int revision,String reasonRef) throws IOException {return changePlanStanding(meta,"CancelPlanRevision",planId,revision,PlanStanding.CANCELLED,reasonRef);}

    public PlanRevisionView evaluatePlanCompletion(CommandMeta meta,String planId,int revision) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);String request=payloadDigest("EvaluatePlanCompletion",planId,Integer.toString(revision),p.spec.candidate().completionPredicateRef(),digestStepStates(p.stepStates));validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());if(p.standing!=PlanStanding.ACTIVE&&p.standing!=PlanStanding.BLOCKED)throw new IllegalStateException("PLAN_NOT_ACTIONABLE");
            if(!completionReady(p))throw new IllegalStateException("REQUIRED_STEP_UNKNOWN_OR_FAILED");State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);q.standing=PlanStanding.COMPLETION_READY;q.orchestrationRevision++;next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,null,sha256("COMPLETION_READY|"+planId+"|"+revision)));persist(next);state=next;return view(planId,revision);
        }
    }

    public PlanningCheckpoint recordPlanningCheckpoint(CommandMeta meta,String planId,int revision) throws IOException {
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);String request=payloadDigest("RecordPlanningCheckpoint",planId,Integer.toString(revision),Long.toString(p.orchestrationRevision),digestStepStates(p.stepStates));validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"CHECKPOINT");if(prior!=null)return requirePlan(prior.planId(),prior.planRevision()).checkpoint;
            long seq=p.checkpoint==null?1:p.checkpoint.checkpointSequence()+1;String priorDigest=p.checkpoint==null?null:p.checkpoint.checkpointDigest();LinkedHashMap<String,String> cond=new LinkedHashMap<>();p.conditionReceipts.forEach((k,v)->cond.put(k,v.receiptDigest()));List<String> waits=p.stepStates.entrySet().stream().filter(e->e.getValue().standing()==StepStanding.WAITING_EXTERNAL).map(Map.Entry::getKey).sorted().toList();Instant now=clock.instant();String d=sha256(p.spec.planRevisionId()+"|"+p.spec.planContentDigest()+"|"+seq+"|"+state.registryRevision+"|"+digestStepStates(p.stepStates)+"|"+String.join(",",waits)+"|"+nv(priorDigest)+"|"+now);PlanningCheckpoint cp=new PlanningCheckpoint(p.spec.planRevisionId(),p.spec.planContentDigest(),seq,state.registryRevision,p.stepStates,cond,waits,priorDigest,now,d);
            State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);q.checkpoint=cp;q.orchestrationRevision++;next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"CHECKPOINT",planId,revision,null,d));persist(next);state=next;return cp;
        }
    }

    public boolean validateCheckpoint(String planId,int revision,PlanningCheckpoint checkpoint){synchronized(mutex){PlanRuntime p=requirePlan(planId,revision);return checkpoint!=null&&p.spec.planRevisionId().equals(checkpoint.planRevisionId())&&p.spec.planContentDigest().equals(checkpoint.planContentDigest());}}

    public ReadinessHandoff readinessHandoff(String planId,int revision,String stepId){
        synchronized(mutex){
            PlanRuntime p=requirePlan(planId,revision);if(p.standing!=PlanStanding.ACTIVE)throw new IllegalStateException("STALE_PLAN_HANDOFF");PlanKey current=state.currentByWork.get(p.spec.workRef().workId());if(current==null||!current.planId().equals(planId)||current.revision()!=revision)throw new IllegalStateException("STALE_PLAN_HANDOFF");if(!workRefValidator.isCurrentExact(p.spec.workRef()))throw new IllegalStateException("WORK_REVISION_STALE");StepSpec s=requireStep(p,stepId);StepState ss=p.stepStates.get(stepId);if(ss.standing()!=StepStanding.READY)throw new IllegalStateException("STEP_NOT_READY");
            PlanRef pr=planRef(p);String ready=sha256(pr.canonicalDigest()+"|"+stepId+"|"+s.stepRevision()+"|"+ss.stateRevision()+"|"+state.registryRevision);String stepCanonical=sha256(pr.canonicalDigest()+"|"+stepId+"|"+s.stepRevision()+"|"+s.digest()+"|"+s.requirements().digest()+"|"+ready);PlanStepRef sr=new PlanStepRef(pr.canonicalDigest(),stepId,s.stepRevision(),s.digest(),s.requirements().digest(),ss.standing(),ready,stepCanonical);String h=sha256(p.spec.workRef().canonicalDigest()+"|"+goalDigest(p.spec.workRef().governedGoalRef())+"|"+pr.canonicalDigest()+"|"+sr.canonicalDigest()+"|"+s.requirements().digest()+"|"+ready+"|"+state.registryRevision+"|"+CONTRACT_ID+"|"+CONTRACT_VERSION+"|"+p.spec.planContentDigest());return new ReadinessHandoff(p.spec.workRef().canonicalDigest(),p.spec.workRef().governedGoalRef(),pr,sr,s.requirements(),s.requirements().digest(),ready,state.registryRevision,CONTRACT_ID,CONTRACT_VERSION,p.spec.planContentDigest(),h);
        }
    }

    public PlanRevisionView getPlan(String planId,int revision){synchronized(mutex){return view(planId,revision);}}
    public PlanRevisionView getCurrentPlanForWork(String workId){synchronized(mutex){PlanKey k=state.currentByWork.get(workId);return k==null?null:view(k.planId(),k.revision());}}
    public StepState getStepReadiness(String planId,int revision,String stepId){synchronized(mutex){return requirePlan(planId,revision).stepStates.get(stepId);}}
    public List<String> listReadySteps(String planId,int revision){synchronized(mutex){return requirePlan(planId,revision).stepStates.entrySet().stream().filter(e->e.getValue().standing()==StepStanding.READY).map(Map.Entry::getKey).sorted().toList();}}
    public List<StepAssociation> listStepAssociations(String planId,int revision,String stepId){synchronized(mutex){return List.copyOf(requirePlan(planId,revision).associations.getOrDefault(stepId,List.of()));}}
    public PlanningCheckpoint getPlanningCheckpoint(String planId,int revision){synchronized(mutex){return requirePlan(planId,revision).checkpoint;}}
    public long registryRevision(){synchronized(mutex){return state.registryRevision;}}
    public int planIdentityCount(){synchronized(mutex){return state.identities.size();}}

    private PlanRevisionView changePlanStanding(CommandMeta meta,String op,String planId,int revision,PlanStanding target,String reasonRef) throws IOException {
        synchronized(mutex){PlanRuntime p=requirePlan(planId,revision);text(reasonRef,"reasonRef");String request=payloadDigest(op,planId,Integer.toString(revision),target.name(),reasonRef);validateMeta(meta,request,p.orchestrationRevision);IdempotencyReceipt prior=checkReplay(meta,request,"PLAN");if(prior!=null)return view(prior.planId(),prior.planRevision());validateStandingTransition(p.standing,target);State next=copy(state);PlanRuntime q=next.plans.get(planId).get(revision);q.standing=target;q.orchestrationRevision++;if(target==PlanStanding.CANCELLED){PlanKey k=next.currentByWork.get(q.spec.workRef().workId());if(k!=null&&k.planId().equals(planId)&&k.revision()==revision)next.currentByWork.remove(q.spec.workRef().workId());}next.registryRevision=state.registryRevision+1;next.idempotency.put(meta.idempotencyKey(),new IdempotencyReceipt(request,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),"PLAN",planId,revision,null,sha256(op+"|"+reasonRef)));persist(next);state=next;return view(planId,revision);}
    }

    private void validateStandingTransition(PlanStanding from,PlanStanding to){boolean ok=switch(from){case DRAFT->to==PlanStanding.CANCELLED;case ACTIVE->EnumSet.of(PlanStanding.BLOCKED,PlanStanding.REPLAN_REQUIRED,PlanStanding.COMPLETION_READY,PlanStanding.CANCELLED,PlanStanding.SUPERSEDED).contains(to);case BLOCKED->EnumSet.of(PlanStanding.ACTIVE,PlanStanding.REPLAN_REQUIRED,PlanStanding.CANCELLED,PlanStanding.SUPERSEDED).contains(to);case REPLAN_REQUIRED->EnumSet.of(PlanStanding.SUPERSEDED,PlanStanding.CANCELLED).contains(to);case COMPLETION_READY->EnumSet.of(PlanStanding.REPLAN_REQUIRED,PlanStanding.SUPERSEDED,PlanStanding.CANCELLED).contains(to);case SUPERSEDED,CANCELLED->false;};if(!ok)throw new IllegalStateException("ILLEGAL_PLAN_TRANSITION:"+from+"->"+to);}

    private PlanRevisionSpec makeSpec(String planId,int rev,String parent,BoundWorkRef work,PlanCandidate c,long registry,Instant now){String content=sha256(planId+"|"+rev+"|"+nv(parent)+"|"+work.canonicalDigest()+"|"+c.digest());String id=sha256("PLAN-REVISION|"+content);return new PlanRevisionSpec(planId,rev,id,parent,work,c,content,registry,now);}

    private BoundWorkRef bindWorkRef(WorkPlanningRefV1 ref){Objects.requireNonNull(ref,"workRef");String goalDigest=WorkProjectAuthorityRuntime.goalRefDigest(ref.governedGoalRef());String computed=sha256(ref.workId()+"|"+ref.workEntityRevision()+"|"+goalDigest+"|"+nv(ref.projectId())+"|"+nv(ref.parentWorkId())+"|"+ref.lifecycle()+"|"+String.join(",",ref.blockerRefs())+"|"+ref.registryRevision());if(!computed.equals(ref.canonicalDigest()))throw new IllegalArgumentException("WORK_REF_DIGEST_MISMATCH");WorkProjectAuthorityRuntime.GovernedGoalRefV1 g=ref.governedGoalRef();String parent=g.parentGoalRevisionRef()==null?null:g.parentGoalRevisionRef().goalId()+":"+g.parentGoalRevisionRef().revision()+":"+g.parentGoalRevisionRef().goalRevisionId()+":"+g.parentGoalRevisionRef().contentDigest();BoundGoalRef bg=new BoundGoalRef(g.goalId(),g.goalRevision(),g.goalRevisionId(),g.goalContentDigest(),g.keelValidationReceiptDigest(),g.contractSubjectId(),g.contractSubjectVersion(),g.contractSubjectDigest(),parent,g.observedKeelRegistryRevision());return new BoundWorkRef(ref.workId(),ref.workEntityRevision(),bg,ref.projectId(),ref.parentWorkId(),ref.lifecycle().name(),ref.blockerRefs(),ref.registryRevision(),ref.canonicalDigest());}

    private void validateActionableWork(BoundWorkRef ref){if("CLOSING".equals(ref.lifecycle())||"CLOSED".equals(ref.lifecycle()))throw new IllegalStateException("WORK_NOT_ACTIONABLE");}

    private void validateMeta(CommandMeta meta,String computed,Long expected){Objects.requireNonNull(meta,"meta");if(!computed.equals(meta.requestPayloadDigest()))throw new IllegalArgumentException("REQUEST_PAYLOAD_DIGEST_MISMATCH");if(!contractValidator.isCompatible(meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest()))throw new IllegalStateException("CONTRACT_INCOMPATIBLE");if(expected!=null&&!Objects.equals(expected,meta.expectedOrchestrationRevision()))throw new StaleRevisionException("ORCHESTRATION_REVISION_CONFLICT expected="+expected+" supplied="+meta.expectedOrchestrationRevision());}

    private IdempotencyReceipt checkReplay(CommandMeta meta,String request,String kind){IdempotencyReceipt prior=state.idempotency.get(meta.idempotencyKey());if(prior==null)return null;if(!prior.requestDigest().equals(request)||!prior.principalRef().equals(meta.principalRef())||!prior.contractSubjectId().equals(meta.contractSubjectId())||!prior.contractSubjectVersion().equals(meta.contractSubjectVersion())||!prior.contractSubjectDigest().equals(meta.contractSubjectDigest()))throw new IdempotencyConflictException("IDEMPOTENCY_CONFLICT");if(!prior.resultKind().equals(kind))throw new IdempotencyConflictException("IDEMPOTENCY_RESULT_KIND_CONFLICT");return prior;}

    private PlanRuntime requirePlan(String planId,int revision){TreeMap<Integer,PlanRuntime> versions=state.plans.get(planId);if(versions==null||!versions.containsKey(revision))throw new IllegalArgumentException("UNKNOWN_PLAN_REVISION");return versions.get(revision);}
    private int latestRevision(String planId){TreeMap<Integer,PlanRuntime> v=state.plans.get(planId);if(v==null||v.isEmpty())throw new IllegalArgumentException("UNKNOWN_PLAN");return v.lastKey();}
    private StepSpec requireStep(PlanRuntime p,String stepId){return p.spec.candidate().steps().stream().filter(s->s.stepId().equals(stepId)).findFirst().orElseThrow(()->new IllegalArgumentException("UNKNOWN_STEP:"+stepId));}

    private PlanRevisionView view(String planId,int revision){PlanRuntime p=requirePlan(planId,revision);return new PlanRevisionView(planId,revision,p.spec.planRevisionId(),p.spec.workRef().workId(),p.standing,p.orchestrationRevision,state.registryRevision,p.spec.planContentDigest(),Map.copyOf(p.stepStates));}

    private void validateStructure(PlanCandidate c){
        if(c.steps().isEmpty())throw new IllegalArgumentException("PLAN_REQUIRES_STEP");if(c.steps().size()>MAX_STEPS||c.edges().size()>MAX_EDGES)throw new IllegalArgumentException("PLAN_LIMIT_EXCEEDED");LinkedHashMap<String,StepSpec> steps=new LinkedHashMap<>();for(StepSpec s:c.steps()){if(steps.putIfAbsent(s.stepId(),s)!=null)throw new IllegalArgumentException("STEP_IDENTITY_CONFLICT");if(s.conditionSpec()!=null)validatePredicate(s.conditionSpec());}
        HashSet<String> edgeIds=new HashSet<>();HashMap<String,Integer> in=new HashMap<>(),out=new HashMap<>();HashMap<String,List<String>> adj=new HashMap<>();for(String id:steps.keySet())adj.put(id,new ArrayList<>());for(EdgeSpec e:c.edges()){if(!edgeIds.add(e.edgeId()))throw new IllegalArgumentException("EDGE_IDENTITY_CONFLICT");if(e.fromStepId().equals(e.toStepId()))throw new IllegalArgumentException("DAG_SELF_EDGE");if(!steps.containsKey(e.fromStepId())||!steps.containsKey(e.toStepId()))throw new IllegalArgumentException("MISSING_STEP_DEPENDENCY");out.merge(e.fromStepId(),1,Integer::sum);in.merge(e.toStepId(),1,Integer::sum);if(out.get(e.fromStepId())>MAX_DIRECT_SUCCESSORS||in.get(e.toStepId())>MAX_DIRECT_PREDECESSORS)throw new IllegalArgumentException("FAN_IN_OUT_EXCEEDED");adj.get(e.fromStepId()).add(e.toStepId());}
        for(Map.Entry<String,Integer> e:in.entrySet())if(e.getValue()>1&&!c.joins().containsKey(e.getKey()))throw new IllegalArgumentException("JOIN_REQUIRED:"+e.getKey());for(Map.Entry<String,JoinSpec> e:c.joins().entrySet()){if(!steps.containsKey(e.getKey()))throw new IllegalArgumentException("JOIN_UNKNOWN_STEP");int count=in.getOrDefault(e.getKey(),0);if(count<2)throw new IllegalArgumentException("JOIN_INVALID");JoinSpec j=e.getValue();if(j.kind()==JoinKind.AT_LEAST_N&&(j.atLeastN()<1||j.atLeastN()>count))throw new IllegalArgumentException("JOIN_INVALID");}
        int depth=dagDepth(adj,in);if(depth>MAX_DAG_DEPTH)throw new IllegalArgumentException("DAG_DEPTH_EXCEEDED");
    }

    private static int dagDepth(Map<String,List<String>> adj,Map<String,Integer> in){HashMap<String,Integer> deg=new HashMap<>();for(String n:adj.keySet())deg.put(n,in.getOrDefault(n,0));ArrayDeque<String> q=new ArrayDeque<>();HashMap<String,Integer> depth=new HashMap<>();for(String n:adj.keySet())if(deg.get(n)==0){q.add(n);depth.put(n,1);}int visited=0,max=0;while(!q.isEmpty()){String n=q.remove();visited++;max=Math.max(max,depth.get(n));for(String m:adj.get(n)){depth.put(m,Math.max(depth.getOrDefault(m,1),depth.get(n)+1));deg.put(m,deg.get(m)-1);if(deg.get(m)==0)q.add(m);}}if(visited!=adj.size())throw new IllegalArgumentException("DAG_CYCLE");return max;}

    private static void validatePredicate(ConditionSpec spec){if(!"SM_PREDICATE_V1".equals(spec.languageVersion()))throw new IllegalArgumentException("CONDITION_INVALID");int[] count={0};validatePredicateNode(spec.expression(),1,count);if(count[0]>MAX_PREDICATE_NODES)throw new IllegalArgumentException("CONDITION_INVALID");}
    private static void validatePredicateNode(PredicateNode n,int depth,int[] count){if(depth>MAX_PREDICATE_DEPTH)throw new IllegalArgumentException("CONDITION_INVALID");count[0]++;Set<String> ops=Set.of("CONST","REF","EQ","NE","LT","LTE","GT","GTE","IN","EXISTS","NOT","ALL","ANY");if(!ops.contains(n.operator()))throw new IllegalArgumentException("CONDITION_INVALID");if("REF".equals(n.operator()))text(n.refKey(),"refKey");if("CONST".equals(n.operator())&&n.literal()==null)throw new IllegalArgumentException("CONDITION_INVALID");for(PredicateNode c:n.children())validatePredicateNode(c,depth+1,count);}

    private void computeReadiness(PlanRuntime p){if(p.standing!=PlanStanding.ACTIVE)return;Map<String,List<EdgeSpec>> incoming=new HashMap<>();for(StepSpec s:p.spec.candidate().steps())incoming.put(s.stepId(),new ArrayList<>());for(EdgeSpec e:p.spec.candidate().edges())incoming.get(e.toStepId()).add(e);boolean changed;int guard=0;do{changed=false;if(++guard>MAX_STEPS+2)throw new IllegalStateException("READINESS_NONCONVERGENCE");for(StepSpec step:p.spec.candidate().steps()){StepState st=p.stepStates.get(step.stepId());if(EnumSet.of(StepStanding.SATISFIED,StepStanding.FAILED,StepStanding.SKIPPED,StepStanding.WAITING_EXTERNAL,StepStanding.UNKNOWN).contains(st.standing()))continue;DependencyEval dep=dependencies(p,step,incoming.get(step.stepId()));if(dep.ready){StepStanding target=switch(step.kind()){case EXECUTION,CONDITION->StepStanding.READY;case HUMAN_WAIT->StepStanding.WAITING_EXTERNAL;case JOIN->StepStanding.SATISFIED;};if(st.standing()!=target){p.stepStates.put(step.stepId(),new StepState(target,st.basisDigest(),st.conditionReceiptDigest(),st.stateRevision()+1));changed=true;}}else if(dep.impossible&&step.completionRole()==CompletionRole.CONDITIONAL&&st.standing()!=StepStanding.SKIPPED){p.stepStates.put(step.stepId(),new StepState(StepStanding.SKIPPED,"CONDITION_BRANCH_NOT_SELECTED",st.conditionReceiptDigest(),st.stateRevision()+1));changed=true;}}}while(changed);long ready=p.stepStates.values().stream().filter(s->s.standing()==StepStanding.READY).count();if(ready>MAX_READY_WIDTH)throw new IllegalArgumentException("PARALLEL_READINESS_EXCEEDED");}

    private record DependencyEval(boolean ready,boolean impossible) {}
    private DependencyEval dependencies(PlanRuntime p,StepSpec step,List<EdgeSpec> edges){if(edges.isEmpty())return new DependencyEval(true,false);int yes=0,no=0,unknown=0;for(EdgeSpec e:edges){int v=edgeGate(p,e);if(v>0)yes++;else if(v<0)no++;else unknown++;}JoinSpec join=p.spec.candidate().joins().get(step.stepId());JoinKind kind=join==null?JoinKind.ALL:join.kind();int need=switch(kind){case ALL->edges.size();case ANY->1;case AT_LEAST_N->join.atLeastN();};boolean ready=yes>=need;boolean impossible=yes+unknown<need;return new DependencyEval(ready,impossible);}
    private int edgeGate(PlanRuntime p,EdgeSpec e){StepState src=p.stepStates.get(e.fromStepId());return switch(e.gate()){case ON_SATISFIED->tri(src.standing()==StepStanding.SATISFIED,isTerminal(src.standing()));case ON_FAILED->tri(src.standing()==StepStanding.FAILED,isTerminal(src.standing()));case ON_SKIPPED->tri(src.standing()==StepStanding.SKIPPED,isTerminal(src.standing()));case ON_TERMINAL->isTerminal(src.standing())?1:0;case ON_CONDITION_TRUE,ON_CONDITION_FALSE->{ConditionReceipt r=p.conditionReceipts.get(e.fromStepId());if(r==null||r.result()==ConditionResult.UNKNOWN)yield 0;if(r.result()==ConditionResult.INVALID)yield -1;boolean match=(e.gate()==EdgeGate.ON_CONDITION_TRUE&&r.result()==ConditionResult.TRUE)||(e.gate()==EdgeGate.ON_CONDITION_FALSE&&r.result()==ConditionResult.FALSE);yield match?1:-1;}};}
    private static int tri(boolean yes,boolean sourceTerminal){return yes?1:(sourceTerminal?-1:0);}
    private static boolean isTerminal(StepStanding s){return s==StepStanding.SATISFIED||s==StepStanding.FAILED||s==StepStanding.SKIPPED;}

    private boolean completionReady(PlanRuntime p){for(StepSpec s:p.spec.candidate().steps()){StepStanding st=p.stepStates.get(s.stepId()).standing();if(s.completionRole()==CompletionRole.REQUIRED){if(st==StepStanding.SATISFIED)continue;if((st==StepStanding.FAILED||st==StepStanding.SKIPPED)&&p.spec.candidate().partialSuccessPolicyRef()!=null)continue;return false;}if(s.completionRole()==CompletionRole.CONDITIONAL&&st!=StepStanding.SKIPPED&&st!=StepStanding.SATISFIED){if((st==StepStanding.FAILED)&&p.spec.candidate().partialSuccessPolicyRef()!=null)continue;return false;}if(st==StepStanding.UNKNOWN||st==StepStanding.WAITING_EXTERNAL||st==StepStanding.READY)return false;}return true;}

    private record Eval(ConditionResult result,List<String> reasons) {}
    private static Eval evaluate(ConditionSpec spec,Map<String,BoundValue> inputs){if(!"SM_PREDICATE_V1".equals(spec.languageVersion()))return new Eval(ConditionResult.INVALID,List.of("UNKNOWN_EVALUATOR"));try{Object v=evalNode(spec.expression(),inputs);if(v==Unknown.INSTANCE)return new Eval(ConditionResult.UNKNOWN,List.of("UNKNOWN_INPUT"));if(!(v instanceof Boolean b))return new Eval(ConditionResult.INVALID,List.of("NON_BOOLEAN_ROOT"));return new Eval(b?ConditionResult.TRUE:ConditionResult.FALSE,List.of());}catch(IllegalArgumentException e){return new Eval(ConditionResult.INVALID,List.of(e.getMessage()==null?"INVALID":e.getMessage()));}}
    private enum Unknown { INSTANCE }
    private static Object evalNode(PredicateNode n,Map<String,BoundValue> inputs){return switch(n.operator()){case "CONST"->parseLiteral(n.literal());case "REF"->{BoundValue v=inputs.get(n.refKey());yield v==null?Unknown.INSTANCE:parseLiteral(v.canonicalValue());}case "NOT"->{needChildren(n,1);Object a=evalNode(n.children().get(0),inputs);yield a==Unknown.INSTANCE?Unknown.INSTANCE:!asBoolean(a);}case "ALL"->{boolean anyUnknown=false;for(PredicateNode c:n.children()){Object v=evalNode(c,inputs);if(v==Unknown.INSTANCE){anyUnknown=true;continue;}if(!asBoolean(v))yield false;}yield anyUnknown?Unknown.INSTANCE:true;}case "ANY"->{boolean anyUnknown=false;for(PredicateNode c:n.children()){Object v=evalNode(c,inputs);if(v==Unknown.INSTANCE){anyUnknown=true;continue;}if(asBoolean(v))yield true;}yield anyUnknown?Unknown.INSTANCE:false;}case "EXISTS"->{needChildren(n,1);yield evalNode(n.children().get(0),inputs)!=Unknown.INSTANCE;}case "EQ","NE","LT","LTE","GT","GTE","IN"->{needChildren(n,2);Object a=evalNode(n.children().get(0),inputs),b=evalNode(n.children().get(1),inputs);if(a==Unknown.INSTANCE||b==Unknown.INSTANCE)yield Unknown.INSTANCE;yield compare(n.operator(),a,b);}default->throw new IllegalArgumentException("UNKNOWN_OPERATOR");};}
    private static void needChildren(PredicateNode n,int count){if(n.children().size()!=count)throw new IllegalArgumentException("ARITY");}
    private static Object parseLiteral(String s){if(s==null)return null;if("true".equalsIgnoreCase(s))return Boolean.TRUE;if("false".equalsIgnoreCase(s))return Boolean.FALSE;try{return new BigDecimal(s);}catch(NumberFormatException ignored){return s;}}
    private static boolean asBoolean(Object v){if(v instanceof Boolean b)return b;throw new IllegalArgumentException("BOOLEAN_REQUIRED");}
    private static boolean compare(String op,Object a,Object b){if("IN".equals(op))return String.valueOf(b).split(",",-1).length>0&&Arrays.asList(String.valueOf(b).split(",",-1)).contains(String.valueOf(a));int c;if(a instanceof BigDecimal aa&&b instanceof BigDecimal bb)c=aa.compareTo(bb);else c=String.valueOf(a).compareTo(String.valueOf(b));return switch(op){case "EQ"->c==0;case "NE"->c!=0;case "LT"->c<0;case "LTE"->c<=0;case "GT"->c>0;case "GTE"->c>=0;default->false;};}

    private PlanRef planRef(PlanRuntime p){String graph=graphDigest(p.spec.candidate());String canonical=sha256(p.spec.planId()+"|"+p.spec.planRevision()+"|"+p.spec.planRevisionId()+"|"+p.spec.workRef().workId()+"|"+p.spec.workRef().governedGoalRef().goalRevisionId()+"|"+p.spec.workRef().governedGoalRef().goalContentDigest()+"|"+p.spec.workRef().canonicalDigest()+"|"+p.spec.planContentDigest()+"|"+graph+"|"+p.standing+"|"+state.registryRevision);return new PlanRef(p.spec.planId(),p.spec.planRevision(),p.spec.planRevisionId(),p.spec.workRef().workId(),p.spec.workRef().governedGoalRef().goalRevisionId(),p.spec.workRef().governedGoalRef().goalContentDigest(),p.spec.workRef().canonicalDigest(),p.spec.planContentDigest(),graph,p.standing,state.registryRevision,canonical);}

    private void persist(State next) throws IOException {faultInjector.beforeAppend();byte[] bytes=serialize(next);String payload=Base64.getEncoder().encodeToString(bytes);long seq=state.frameSequence+1;String prev=state.lastFrameDigest;String fd=sha256(STORE_VERSION+"|"+seq+"|"+prev+"|"+payload);String line=STORE_VERSION+"|"+seq+"|"+prev+"|"+payload+"|"+fd+"\n";try(FileChannel ch=FileChannel.open(logPath,StandardOpenOption.CREATE,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){ch.write(StandardCharsets.UTF_8.encode(line));ch.force(true);}next.frameSequence=seq;next.lastFrameDigest=fd;}

    private void replay() throws IOException {List<String> lines=Files.readAllLines(logPath,StandardCharsets.UTF_8);String prev="GENESIS";long seq=0;State latest=null;for(String line:lines){if(line.isBlank())continue;String[] p=line.split("\\|",5);if(p.length!=5||!STORE_VERSION.equals(p[0]))throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");long s;try{s=Long.parseLong(p[1]);}catch(NumberFormatException e){throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT",e);}if(s!=seq+1||!prev.equals(p[2]))throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");String expected=sha256(STORE_VERSION+"|"+s+"|"+p[2]+"|"+p[3]);if(!expected.equals(p[4]))throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");byte[] decoded;try{decoded=Base64.getDecoder().decode(p[3]);}catch(IllegalArgumentException e){throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT",e);}latest=deserialize(decoded);seq=s;prev=p[4];}if(latest==null)throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");if(latest.frameSequence!=seq||!latest.lastFrameDigest.equals(prev))throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");state=latest;}

    private static byte[] serialize(State s) throws IOException {ByteArrayOutputStream b=new ByteArrayOutputStream();try(ObjectOutputStream o=new ObjectOutputStream(b)){o.writeObject(s);}return b.toByteArray();}
    private static State deserialize(byte[] bytes){try(ObjectInputStream o=new ObjectInputStream(new ByteArrayInputStream(bytes))){o.setObjectInputFilter(ObjectInputFilter.Config.createFilter("org.systemmaster.foundation.planning.*;java.base/*;!*"));Object v=o.readObject();if(!(v instanceof State s))throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT");return s;}catch(IOException|ClassNotFoundException e){throw new CorruptStoreException("PLANNING_JOURNAL_CORRUPT",e);}}
    private static State copy(State s){try{return deserialize(serialize(s));}catch(IOException e){throw new IllegalStateException(e);}}

    private static boolean isActionable(PlanStanding s){return s==PlanStanding.ACTIVE||s==PlanStanding.BLOCKED||s==PlanStanding.REPLAN_REQUIRED||s==PlanStanding.COMPLETION_READY;}
    private static String graphDigest(PlanCandidate c){List<String> vals=new ArrayList<>();c.steps().stream().sorted(Comparator.comparing(StepSpec::stepId)).forEach(s->vals.add("S:"+s.digest()));c.edges().stream().sorted(Comparator.comparing(EdgeSpec::edgeId)).forEach(e->vals.add("E:"+e.digest()));c.joins().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->vals.add("J:"+e.getKey()+":"+e.getValue().kind()+":"+e.getValue().atLeastN()));return sha256(String.join("|",vals));}
    private static String canonicalCandidate(PlanCandidate c){return graphDigest(c)+"|"+c.completionPredicateRef()+"|"+nv(c.partialSuccessPolicyRef());}
    private static String canonicalStep(StepSpec s){return s.stepId()+"|"+s.stepRevision()+"|"+s.kind()+"|"+s.completionRole()+"|"+s.requirements().digest()+"|"+(s.conditionSpec()==null?"-":s.conditionSpec().digest())+"|"+(s.humanWaitSpec()==null?"-":s.humanWaitSpec().digest())+"|"+nv(s.completionPredicateRef());}
    private static String canonicalRequirements(StepRequirements r){List<String> d=r.resourceDemand().stream().map(x->x.dimension()+":"+x.amountOrRange()+":"+x.unit()+":"+x.hardness()).sorted().toList();return String.join(",",r.capabilityContractClassRefs())+"|"+String.join(",",d)+"|"+String.join(",",r.policyDecisionClassRefs())+"|"+String.join(",",r.dataLocalityIsolationRefs())+"|"+String.join(",",r.specialistInterfaceRefs())+"|"+String.join(",",r.inheritedKeelConstraintRefs());}
    private static String canonicalPredicate(PredicateNode n){List<String> c=n.children().stream().map(PlanningOrchestrationAuthorityRuntime::canonicalPredicate).toList();return n.operator()+"("+nv(n.literal())+","+nv(n.refKey())+","+String.join(",",c)+")";}
    private static String canonicalInputs(Map<String,BoundValue> m){return m.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e->e.getKey()+":"+e.getValue().digest()).reduce((a,b)->a+"|"+b).orElse("");}
    private static String goalDigest(BoundGoalRef g){return sha256(g.goalId()+"|"+g.goalRevision()+"|"+g.goalRevisionId()+"|"+g.goalContentDigest()+"|"+g.keelValidationReceiptDigest()+"|"+g.contractSubjectId()+"|"+g.contractSubjectVersion()+"|"+g.contractSubjectDigest()+"|"+nv(g.parentGoalRevisionRef())+"|"+g.observedKeelRegistryRevision());}
    private static String digestStepStates(Map<String,StepState> m){return sha256(m.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e->e.getKey()+":"+e.getValue().standing()+":"+nv(e.getValue().basisDigest())+":"+nv(e.getValue().conditionReceiptDigest())+":"+e.getValue().stateRevision()).reduce((a,b)->a+"|"+b).orElse(""));}

    private static List<String> cleanList(List<String> in,String name){Objects.requireNonNull(in,name);ArrayList<String> out=new ArrayList<>();for(String v:in){text(v,name);out.add(v);}return List.copyOf(out);}
    private static String nv(String s){return s==null?"<null>":s;}
    private static void text(String s,String name){if(s==null||s.isBlank())throw new IllegalArgumentException(name);if(s.length()>4096)throw new IllegalArgumentException(name+" too long");}
    private static void digest(String s,String name){text(s,name);if(!s.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(name+" must be lowercase sha256");}
    public static String sha256(String value){try{MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] d=md.digest(value.getBytes(StandardCharsets.UTF_8));StringBuilder b=new StringBuilder(64);for(byte x:d)b.append(String.format(Locale.ROOT,"%02x",x));return b.toString();}catch(Exception e){throw new IllegalStateException(e);}}
}
