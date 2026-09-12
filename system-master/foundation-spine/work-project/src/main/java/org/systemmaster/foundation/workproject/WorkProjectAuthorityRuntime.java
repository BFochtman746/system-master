package org.systemmaster.foundation.workproject;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;

/** Fresh Foundation Work & Project authority. */
public final class WorkProjectAuthorityRuntime {
    public static final String STORE_VERSION = "FOUNDATION-WORK-PROJECT-1";
    public static final String CONTRACT_ID = "FOUNDATION-WORK-PROJECT";
    public static final String CONTRACT_VERSION = "1";

    public enum WorkLifecycle { OPEN, ACTIVE, PAUSED, BLOCKED, CLOSING, CLOSED }
    public enum ProjectLifecycle { OPEN, ACTIVE, PAUSED, CLOSED }
    public enum MilestoneStanding { OPEN, BLOCKED, SATISFIED, UNKNOWN }
    public enum ManagementKind { RISK, ISSUE, CHANGE }
    public enum AssociationKind { PLAN, PLAN_STEP, JOB, ATTEMPT, ARTIFACT, EVIDENCE, INCIDENT, RECOVERY_EPISODE, SUCCESSOR_WORK }
    public enum ClosureDisposition { SATISFIED, CANCELLED, SUPERSEDED, ABANDONED, UNSATISFIED_TERMINAL }
    public enum Freshness { CURRENT, STALE, UNKNOWN, DEGRADED }

    public record ParentGoalRevisionRef(String goalId, int revision, String goalRevisionId, String contentDigest) {
        public ParentGoalRevisionRef { text(goalId,"goalId"); if(revision<1) throw new IllegalArgumentException("revision"); text(goalRevisionId,"goalRevisionId"); digest(contentDigest,"contentDigest"); }
    }
    public record GovernedGoalRefV1(String goalId,int goalRevision,String goalRevisionId,String goalContentDigest,
                                    String keelValidationReceiptDigest,String contractSubjectId,String contractSubjectVersion,
                                    String contractSubjectDigest,ParentGoalRevisionRef parentGoalRevisionRef,long observedKeelRegistryRevision) {
        public GovernedGoalRefV1 {
            text(goalId,"goalId"); if(goalRevision<1) throw new IllegalArgumentException("goalRevision"); text(goalRevisionId,"goalRevisionId");
            digest(goalContentDigest,"goalContentDigest"); digest(keelValidationReceiptDigest,"keelValidationReceiptDigest");
            text(contractSubjectId,"contractSubjectId"); text(contractSubjectVersion,"contractSubjectVersion"); digest(contractSubjectDigest,"contractSubjectDigest");
            if(observedKeelRegistryRevision<1) throw new IllegalArgumentException("observedKeelRegistryRevision");
        }
    }
    public record CommandMetaV1(String commandId,String idempotencyKey,String principalRef,Long expectedEntityRevision,
                                String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,String commandPayloadDigest) {
        public CommandMetaV1 {
            text(commandId,"commandId"); text(idempotencyKey,"idempotencyKey"); text(principalRef,"principalRef");
            if(expectedEntityRevision!=null && expectedEntityRevision<1) throw new IllegalArgumentException("expectedEntityRevision");
            text(contractSubjectId,"contractSubjectId"); text(contractSubjectVersion,"contractSubjectVersion"); digest(contractSubjectDigest,"contractSubjectDigest"); digest(commandPayloadDigest,"commandPayloadDigest");
        }
    }
    public record WorkRecordV1(String workId,long entityRevision,String projectId,String parentWorkId,GovernedGoalRefV1 activeGovernedGoalRef,
                               WorkLifecycle lifecycle,String createdByPrincipalRef,Instant createdAt,Instant updatedAt,long registryRevision,String latestEventDigest) {}
    public record ProjectRecordV1(String projectId,long entityRevision,String parentProjectId,String title,ProjectLifecycle lifecycle,
                                  String createdByPrincipalRef,Instant createdAt,Instant updatedAt,long registryRevision,String latestEventDigest) {}
    public record GoalBindingV1(String workId,long bindingRevision,GovernedGoalRefV1 governedGoalRef,String priorBindingDigest,String reasonRef,
                                String boundByPrincipalRef,Instant boundAt,String bindingDigest) {}
    public record MilestoneRecordV1(String milestoneId,String workId,String projectId,String title,long weightUnits,MilestoneStanding standing,
                                    String standingBasisRef,Instant createdAt,Instant updatedAt,long entityRevision) {}
    public record ManagementRecordV1(String recordId,String workId,String projectId,ManagementKind kind,String title,String standing,String ownerRef,
                                     String sourceRef,Instant createdAt,Instant updatedAt,long entityRevision) {}
    public record ProjectMemoryRefV1(String refId,String workId,String projectId,String memoryRef,String memoryOwnerAuthority,String purposeRef,Instant addedAt) {}
    public record WorkAssociationV1(String associationId,String workId,AssociationKind kind,String externalRef,String externalOwnerAuthority,
                                    String externalVersionOrDigest,Instant createdAt) {}
    public record ClosureBasisV1(String workId,ClosureDisposition disposition,String authorityRef,String decisionOrReceiptRef,String subjectDigest,Instant recordedAt) {
        public ClosureBasisV1 { text(workId,"workId"); Objects.requireNonNull(disposition,"disposition"); text(authorityRef,"authorityRef"); text(decisionOrReceiptRef,"decisionOrReceiptRef"); if(subjectDigest!=null) digest(subjectDigest,"subjectDigest"); Objects.requireNonNull(recordedAt,"recordedAt"); }
    }
    public record WorkPlanningRefV1(String workId,long workEntityRevision,GovernedGoalRefV1 governedGoalRef,String projectId,String parentWorkId,
                                    WorkLifecycle lifecycle,List<String> blockerRefs,long registryRevision,String canonicalDigest) {
        public WorkPlanningRefV1 { blockerRefs=List.copyOf(blockerRefs); digest(canonicalDigest,"canonicalDigest"); }
    }
    public record ProgressProjection(String ownerId,Freshness freshness,Long authoritativeRevision,Instant projectedAt,Long completedWeight,Long totalWeight,Integer percent) {}
    public record TimelineEvent(long sequence,String eventId,String entityKind,String entityId,String eventType,String actor,Instant occurredAt,
                                String previousEventDigest,String payloadDigest,String eventDigest,long registryRevision) {}
    public record IdempotencyReceipt(String idempotencyKey,String commandDigest,String principalRef,String contractSubjectId,String contractSubjectVersion,String contractSubjectDigest,String resultType,String resultPayload,String resultDigest,long registryRevision) {}

    @FunctionalInterface public interface KeelRefValidator { boolean isCurrentExact(GovernedGoalRefV1 ref); }
    @FunctionalInterface public interface ContractValidator { boolean isCompatible(String subjectId,String subjectVersion,String subjectDigest); }
    @FunctionalInterface public interface ClosureBasisValidator { boolean isValid(ClosureBasisV1 basis, GovernedGoalRefV1 activeGoal); }
    @FunctionalInterface public interface FaultInjector { void afterPrepared(Path preparedFile) throws IOException; }

    public static final class CorruptStoreException extends IllegalStateException { private static final long serialVersionUID=1L; public CorruptStoreException(String m){super(m);} public CorruptStoreException(String m,Throwable c){super(m,c);} }
    public static final class StaleRevisionException extends IllegalStateException { private static final long serialVersionUID=1L; public StaleRevisionException(String m){super(m);} }
    public static final class IdempotencyConflictException extends IllegalStateException { private static final long serialVersionUID=1L; public IdempotencyConflictException(String m){super(m);} }

    private final Path logPath;
    private final Clock clock;
    private final KeelRefValidator keelValidator;
    private final ContractValidator contractValidator;
    private final ClosureBasisValidator closureValidator;
    private final FaultInjector faultInjector;
    private final Object mutex=new Object();

    private long registryRevision=0;
    private String lastFrameDigest="GENESIS";
    private final Map<String,WorkRecordV1> works=new LinkedHashMap<>();
    private final Map<String,ProjectRecordV1> projects=new LinkedHashMap<>();
    private final Map<String,List<GoalBindingV1>> goalBindings=new LinkedHashMap<>();
    private final Map<String,MilestoneRecordV1> milestones=new LinkedHashMap<>();
    private final Map<String,ManagementRecordV1> management=new LinkedHashMap<>();
    private final Map<String,ProjectMemoryRefV1> memories=new LinkedHashMap<>();
    private final Map<String,WorkAssociationV1> associations=new LinkedHashMap<>();
    private final Map<String,List<TimelineEvent>> workTimeline=new LinkedHashMap<>();
    private final Map<String,List<TimelineEvent>> projectTimeline=new LinkedHashMap<>();
    private final Map<String,IdempotencyReceipt> idempotency=new LinkedHashMap<>();

    public WorkProjectAuthorityRuntime(Path logPath,Clock clock,KeelRefValidator keelValidator,ContractValidator contractValidator,
                                       ClosureBasisValidator closureValidator,FaultInjector faultInjector) throws IOException {
        this.logPath=Objects.requireNonNull(logPath,"logPath").toAbsolutePath(); this.clock=Objects.requireNonNull(clock,"clock");
        this.keelValidator=Objects.requireNonNull(keelValidator,"keelValidator"); this.contractValidator=Objects.requireNonNull(contractValidator,"contractValidator");
        this.closureValidator=Objects.requireNonNull(closureValidator,"closureValidator"); this.faultInjector=Objects.requireNonNull(faultInjector,"faultInjector");
        Path parent=this.logPath.getParent(); if(parent!=null) Files.createDirectories(parent); if(Files.exists(this.logPath)) replay();
    }

    public static String payloadDigest(String operation,String... fields){StringBuilder b=new StringBuilder(operation);for(String f:fields)b.append('|').append(f==null?"<null>":f);return sha256(b.toString());}
    public static String goalRefDigest(GovernedGoalRefV1 r){return sha256(canonicalGoal(r));}

    public ProjectRecordV1 createProject(CommandMetaV1 meta,String projectId,String parentProjectId,String title) throws IOException {
        synchronized(mutex){
            String computed=payloadDigest("CreateProject",projectId,parentProjectId,title); validateMeta(meta,computed,null);
            IdempotencyReceipt prior=idempotency.get(meta.idempotencyKey()); if(prior!=null)return replayResult(prior,meta,computed,"PROJECT",WorkProjectAuthorityRuntime::decodeProject);
            text(projectId,"projectId"); text(title,"title"); if(projects.containsKey(projectId))throw new IllegalArgumentException("PROJECT_ID_ALREADY_EXISTS");
            if(parentProjectId!=null){requireProject(parentProjectId); ensureProjectAcyclic(projectId,parentProjectId);}
            Instant now=clock.instant(); long next=registryRevision+1; String ev=eventDigest("PROJECT",projectId,"PROJECT_CREATED",meta.principalRef(),now,null,computed,next);
            ProjectRecordV1 p=new ProjectRecordV1(projectId,1,parentProjectId,title,ProjectLifecycle.OPEN,meta.principalRef(),now,now,next,ev);
            return commit(meta,computed,"PROJECT",encodeProject(p),()->{projects.put(projectId,p);registryRevision=next;addProjectEvent(projectId,"PROJECT_CREATED",meta.principalRef(),computed,now,ev,next);return p;});
        }
    }

    public WorkRecordV1 createWork(CommandMetaV1 meta,String workId,String projectId,String parentWorkId,GovernedGoalRefV1 goalRef,String reasonRef) throws IOException {
        synchronized(mutex){
            String computed=payloadDigest("CreateWork",workId,projectId,parentWorkId,goalRefDigest(goalRef),reasonRef); validateMeta(meta,computed,null);
            IdempotencyReceipt prior=idempotency.get(meta.idempotencyKey()); if(prior!=null)return replayResult(prior,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);
            text(workId,"workId"); text(reasonRef,"reasonRef"); if(works.containsKey(workId))throw new IllegalArgumentException("WORK_ID_ALREADY_EXISTS");
            validateGoal(goalRef); if(projectId!=null)requireProject(projectId); if(parentWorkId!=null){WorkRecordV1 parent=requireWork(parentWorkId);ensureWorkAcyclic(workId,parentWorkId);validateGoalLineage(parent,goalRef);}
            Instant now=clock.instant(); long next=registryRevision+1; String bind=goalBindingDigest(workId,1,goalRef,null,reasonRef,meta.principalRef(),now);
            String ev=eventDigest("WORK",workId,"WORK_CREATED",meta.principalRef(),now,null,computed,next);
            WorkRecordV1 w=new WorkRecordV1(workId,1,projectId,parentWorkId,goalRef,WorkLifecycle.OPEN,meta.principalRef(),now,now,next,ev);
            GoalBindingV1 g=new GoalBindingV1(workId,1,goalRef,null,reasonRef,meta.principalRef(),now,bind);
            return commit(meta,computed,"WORK",encodeWork(w),()->{works.put(workId,w);goalBindings.put(workId,new ArrayList<>(List.of(g)));registryRevision=next;addWorkEvent(workId,"WORK_CREATED",meta.principalRef(),computed,now,ev,next);return w;});
        }
    }

    public WorkRecordV1 rebindWorkGoal(CommandMetaV1 meta,String workId,GovernedGoalRefV1 goalRef,String reasonRef) throws IOException {
        synchronized(mutex){
            WorkRecordV1 priorWork=requireWork(workId); String computed=payloadDigest("RebindWorkGoal",workId,goalRefDigest(goalRef),reasonRef); validateMeta(meta,computed,priorWork.entityRevision());
            IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey()); if(idem!=null)return replayResult(idem,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);
            validateGoal(goalRef); GovernedGoalRefV1 old=priorWork.activeGovernedGoalRef(); if(!old.goalId().equals(goalRef.goalId()))throw new IllegalArgumentException("CROSS_GOAL_REBIND");
            if(goalRef.goalRevision()<=old.goalRevision())throw new IllegalArgumentException("GOAL_REVISION_NOT_STRICTLY_HIGHER");
            if(priorWork.parentWorkId()!=null)validateGoalLineage(requireWork(priorWork.parentWorkId()),goalRef);
            Instant now=clock.instant(); long next=registryRevision+1; long er=priorWork.entityRevision()+1; List<GoalBindingV1> list=goalBindings.get(workId); GoalBindingV1 oldBind=list.get(list.size()-1);
            String bind=goalBindingDigest(workId,oldBind.bindingRevision()+1,goalRef,oldBind.bindingDigest(),reasonRef,meta.principalRef(),now);
            String ev=eventDigest("WORK",workId,"GOAL_REBOUND",meta.principalRef(),now,lastEvent(workTimeline,workId),computed,next);
            WorkRecordV1 w=new WorkRecordV1(workId,er,priorWork.projectId(),priorWork.parentWorkId(),goalRef,priorWork.lifecycle(),priorWork.createdByPrincipalRef(),priorWork.createdAt(),now,next,ev);
            GoalBindingV1 g=new GoalBindingV1(workId,oldBind.bindingRevision()+1,goalRef,oldBind.bindingDigest(),reasonRef,meta.principalRef(),now,bind);
            return commit(meta,computed,"WORK",encodeWork(w),()->{works.put(workId,w);list.add(g);registryRevision=next;addWorkEvent(workId,"GOAL_REBOUND",meta.principalRef(),computed,now,ev,next);return w;});
        }
    }

    public WorkRecordV1 assignWorkToProject(CommandMetaV1 meta,String workId,String projectId) throws IOException {
        synchronized(mutex){WorkRecordV1 old=requireWork(workId);String computed=payloadDigest("AssignWorkToProject",workId,projectId);validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);if(projectId!=null)requireProject(projectId);return mutateWork(meta,computed,old,"WORK_PROJECT_ASSIGNED",old.parentWorkId(),projectId,old.activeGovernedGoalRef(),old.lifecycle());}
    }

    public WorkRecordV1 reparentWork(CommandMetaV1 meta,String workId,String parentWorkId) throws IOException {
        synchronized(mutex){WorkRecordV1 old=requireWork(workId);String computed=payloadDigest("ReparentWork",workId,parentWorkId);validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);if(parentWorkId!=null){WorkRecordV1 parent=requireWork(parentWorkId);ensureWorkAcyclic(workId,parentWorkId);validateGoalLineage(parent,old.activeGovernedGoalRef());}return mutateWork(meta,computed,old,"WORK_REPARENTED",parentWorkId,old.projectId(),old.activeGovernedGoalRef(),old.lifecycle());}
    }

    public ProjectRecordV1 reparentProject(CommandMetaV1 meta,String projectId,String parentProjectId) throws IOException {
        synchronized(mutex){ProjectRecordV1 old=requireProject(projectId);String computed=payloadDigest("ReparentProject",projectId,parentProjectId);validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"PROJECT",WorkProjectAuthorityRuntime::decodeProject);if(parentProjectId!=null){requireProject(parentProjectId);ensureProjectAcyclic(projectId,parentProjectId);}Instant now=clock.instant();long next=registryRevision+1;String ev=eventDigest("PROJECT",projectId,"PROJECT_REPARENTED",meta.principalRef(),now,lastEvent(projectTimeline,projectId),computed,next);ProjectRecordV1 p=new ProjectRecordV1(projectId,old.entityRevision()+1,parentProjectId,old.title(),old.lifecycle(),old.createdByPrincipalRef(),old.createdAt(),now,next,ev);return commit(meta,computed,"PROJECT",encodeProject(p),()->{projects.put(projectId,p);registryRevision=next;addProjectEvent(projectId,"PROJECT_REPARENTED",meta.principalRef(),computed,now,ev,next);return p;});}
    }

    public WorkRecordV1 transitionWork(CommandMetaV1 meta,String workId,WorkLifecycle nextState) throws IOException {
        synchronized(mutex){WorkRecordV1 old=requireWork(workId);String computed=payloadDigest("TransitionWork",workId,nextState.name());validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);if(!legal(old.lifecycle(),nextState))throw new IllegalArgumentException("ILLEGAL_WORK_TRANSITION:"+old.lifecycle()+"->"+nextState);if(nextState==WorkLifecycle.CLOSED)throw new IllegalArgumentException("CLOSED_REQUIRES_CLOSE_WORK");return mutateWork(meta,computed,old,"WORK_LIFECYCLE_"+nextState,old.parentWorkId(),old.projectId(),old.activeGovernedGoalRef(),nextState);}
    }

    public ProjectRecordV1 transitionProject(CommandMetaV1 meta,String projectId,ProjectLifecycle nextState,boolean governedOverride) throws IOException {
        synchronized(mutex){ProjectRecordV1 old=requireProject(projectId);String computed=payloadDigest("TransitionProject",projectId,nextState.name(),Boolean.toString(governedOverride));validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"PROJECT",WorkProjectAuthorityRuntime::decodeProject);if(!legal(old.lifecycle(),nextState))throw new IllegalArgumentException("ILLEGAL_PROJECT_TRANSITION:"+old.lifecycle()+"->"+nextState);if(nextState==ProjectLifecycle.CLOSED&&!governedOverride&&hasOpenChildren(projectId))throw new IllegalStateException("PROJECT_HAS_OPEN_CHILDREN");Instant now=clock.instant();long next=registryRevision+1;String ev=eventDigest("PROJECT",projectId,"PROJECT_LIFECYCLE_"+nextState,meta.principalRef(),now,lastEvent(projectTimeline,projectId),computed,next);ProjectRecordV1 p=new ProjectRecordV1(projectId,old.entityRevision()+1,old.parentProjectId(),old.title(),nextState,old.createdByPrincipalRef(),old.createdAt(),now,next,ev);return commit(meta,computed,"PROJECT",encodeProject(p),()->{projects.put(projectId,p);registryRevision=next;addProjectEvent(projectId,"PROJECT_LIFECYCLE_"+nextState,meta.principalRef(),computed,now,ev,next);return p;});}
    }

    public MilestoneRecordV1 upsertMilestone(CommandMetaV1 meta,String milestoneId,String workId,String projectId,String title,long weightUnits,MilestoneStanding standing,String standingBasisRef) throws IOException {
        synchronized(mutex){if((workId==null)==(projectId==null))throw new IllegalArgumentException("EXACTLY_ONE_MILESTONE_OWNER_REQUIRED");if(workId!=null)requireWork(workId);else requireProject(projectId);if(weightUnits<1)throw new IllegalArgumentException("weightUnits");if(standing==MilestoneStanding.SATISFIED&&blank(standingBasisRef))throw new IllegalArgumentException("SATISFIED_REQUIRES_BASIS");MilestoneRecordV1 old=milestones.get(milestoneId);Long expected=old==null?null:old.entityRevision();String computed=payloadDigest("UpsertMilestone",milestoneId,workId,projectId,title,Long.toString(weightUnits),standing.name(),standingBasisRef);validateMeta(meta,computed,expected);IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"MILESTONE",WorkProjectAuthorityRuntime::decodeMilestone);if(old!=null&&(!Objects.equals(old.workId(),workId)||!Objects.equals(old.projectId(),projectId)))throw new IllegalArgumentException("MILESTONE_OWNER_IMMUTABLE");Instant now=clock.instant();long next=registryRevision+1;MilestoneRecordV1 m=new MilestoneRecordV1(milestoneId,workId,projectId,text(title,"title"),weightUnits,standing,standingBasisRef,old==null?now:old.createdAt(),now,old==null?1:old.entityRevision()+1);return commit(meta,computed,"MILESTONE",encodeMilestone(m),()->{milestones.put(milestoneId,m);registryRevision=next;appendOwnerEvent(workId,projectId,"MILESTONE_UPSERTED",meta.principalRef(),computed,now,next);return m;});}
    }

    public ManagementRecordV1 recordManagement(CommandMetaV1 meta,String recordId,String workId,String projectId,ManagementKind kind,String title,String standing,String ownerRef,String sourceRef) throws IOException {
        synchronized(mutex){if((workId==null)==(projectId==null))throw new IllegalArgumentException("EXACTLY_ONE_MANAGEMENT_OWNER_REQUIRED");if(workId!=null)requireWork(workId);else requireProject(projectId);ManagementRecordV1 old=management.get(recordId);Long expected=old==null?null:old.entityRevision();String computed=payloadDigest("RecordManagement",recordId,workId,projectId,kind.name(),title,standing,ownerRef,sourceRef);validateMeta(meta,computed,expected);IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"MANAGEMENT",WorkProjectAuthorityRuntime::decodeManagement);if(old!=null&&(!Objects.equals(old.workId(),workId)||!Objects.equals(old.projectId(),projectId)||old.kind()!=kind))throw new IllegalArgumentException("MANAGEMENT_IDENTITY_IMMUTABLE");Instant now=clock.instant();long next=registryRevision+1;ManagementRecordV1 m=new ManagementRecordV1(text(recordId,"recordId"),workId,projectId,Objects.requireNonNull(kind,"kind"),text(title,"title"),text(standing,"standing"),text(ownerRef,"ownerRef"),sourceRef,old==null?now:old.createdAt(),now,old==null?1:old.entityRevision()+1);return commit(meta,computed,"MANAGEMENT",encodeManagement(m),()->{management.put(recordId,m);registryRevision=next;appendOwnerEvent(workId,projectId,"MANAGEMENT_"+kind,meta.principalRef(),computed,now,next);return m;});}
    }

    public ProjectMemoryRefV1 addProjectMemoryRef(CommandMetaV1 meta,String refId,String workId,String projectId,String memoryRef,String memoryOwnerAuthority,String purposeRef) throws IOException {
        synchronized(mutex){if((workId==null)==(projectId==null))throw new IllegalArgumentException("EXACTLY_ONE_MEMORY_OWNER_REQUIRED");if(workId!=null)requireWork(workId);else requireProject(projectId);String computed=payloadDigest("AddProjectMemoryRef",refId,workId,projectId,memoryRef,memoryOwnerAuthority,purposeRef);validateMeta(meta,computed,null);IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"MEMORY",WorkProjectAuthorityRuntime::decodeMemory);if(memories.containsKey(refId))throw new IllegalArgumentException("MEMORY_REF_ID_EXISTS");Instant now=clock.instant();long next=registryRevision+1;ProjectMemoryRefV1 m=new ProjectMemoryRefV1(text(refId,"refId"),workId,projectId,text(memoryRef,"memoryRef"),text(memoryOwnerAuthority,"memoryOwnerAuthority"),text(purposeRef,"purposeRef"),now);return commit(meta,computed,"MEMORY",encodeMemory(m),()->{memories.put(refId,m);registryRevision=next;appendOwnerEvent(workId,projectId,"MEMORY_REF_ADDED",meta.principalRef(),computed,now,next);return m;});}
    }

    public WorkAssociationV1 associateExternal(CommandMetaV1 meta,String associationId,String workId,AssociationKind kind,String externalRef,String externalOwnerAuthority,String externalVersionOrDigest) throws IOException {
        synchronized(mutex){requireWork(workId);String computed=payloadDigest("AssociateExternalRef",associationId,workId,kind.name(),externalRef,externalOwnerAuthority,externalVersionOrDigest);validateMeta(meta,computed,null);IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"ASSOCIATION",WorkProjectAuthorityRuntime::decodeAssociation);if(associations.containsKey(associationId))throw new IllegalArgumentException("ASSOCIATION_ID_EXISTS");Instant now=clock.instant();long next=registryRevision+1;WorkAssociationV1 a=new WorkAssociationV1(text(associationId,"associationId"),workId,Objects.requireNonNull(kind,"kind"),text(externalRef,"externalRef"),text(externalOwnerAuthority,"externalOwnerAuthority"),externalVersionOrDigest,now);return commit(meta,computed,"ASSOCIATION",encodeAssociation(a),()->{associations.put(associationId,a);registryRevision=next;appendOwnerEvent(workId,null,"ASSOCIATED_"+kind,meta.principalRef(),computed,now,next);return a;});}
    }

    public WorkRecordV1 closeWork(CommandMetaV1 meta,String workId,ClosureBasisV1 basis) throws IOException {
        synchronized(mutex){WorkRecordV1 old=requireWork(workId);String computed=payloadDigest("CloseWork",workId,encodeClosureBasis(basis));validateMeta(meta,computed,old.entityRevision());IdempotencyReceipt idem=idempotency.get(meta.idempotencyKey());if(idem!=null)return replayResult(idem,meta,computed,"WORK",WorkProjectAuthorityRuntime::decodeWork);if(old.lifecycle()!=WorkLifecycle.CLOSING)throw new IllegalStateException("WORK_NOT_CLOSING");if(!workId.equals(basis.workId()))throw new IllegalArgumentException("CLOSURE_WORK_MISMATCH");if(!closureValidator.isValid(basis,old.activeGovernedGoalRef()))throw new IllegalStateException("CLOSURE_BASIS_NOT_VALID");return mutateWork(meta,computed,old,"WORK_CLOSED_"+basis.disposition(),old.parentWorkId(),old.projectId(),old.activeGovernedGoalRef(),WorkLifecycle.CLOSED);}
    }

    public WorkRecordV1 getWork(String workId){synchronized(mutex){return requireWork(workId);}}
    public ProjectRecordV1 getProject(String projectId){synchronized(mutex){return requireProject(projectId);}}
    public GoalBindingV1 getActiveGoalBinding(String workId){synchronized(mutex){List<GoalBindingV1> x=goalBindings.get(workId);if(x==null||x.isEmpty())throw new IllegalArgumentException("UNKNOWN_WORK:"+workId);return x.get(x.size()-1);}}
    public List<TimelineEvent> getWorkTimeline(String workId){synchronized(mutex){requireWork(workId);return List.copyOf(workTimeline.getOrDefault(workId,List.of()));}}
    public List<TimelineEvent> getProjectTimeline(String projectId){synchronized(mutex){requireProject(projectId);return List.copyOf(projectTimeline.getOrDefault(projectId,List.of()));}}
    public List<WorkRecordV1> listChildWork(String parentWorkId){synchronized(mutex){requireWork(parentWorkId);return works.values().stream().filter(w->Objects.equals(parentWorkId,w.parentWorkId())).sorted(Comparator.comparing(WorkRecordV1::workId)).toList();}}
    public List<WorkRecordV1> listProjectWork(String projectId){synchronized(mutex){requireProject(projectId);return works.values().stream().filter(w->Objects.equals(projectId,w.projectId())).sorted(Comparator.comparing(WorkRecordV1::workId)).toList();}}
    public List<ProjectRecordV1> listChildProjects(String parentProjectId){synchronized(mutex){requireProject(parentProjectId);return projects.values().stream().filter(p->Objects.equals(parentProjectId,p.parentProjectId())).sorted(Comparator.comparing(ProjectRecordV1::projectId)).toList();}}
    public List<ManagementRecordV1> listManagement(String ownerId,ManagementKind kind){synchronized(mutex){return management.values().stream().filter(m->kind==m.kind()&&(Objects.equals(ownerId,m.workId())||Objects.equals(ownerId,m.projectId()))).sorted(Comparator.comparing(ManagementRecordV1::recordId)).toList();}}
    public List<WorkAssociationV1> listAssociations(String workId,AssociationKind kind){synchronized(mutex){requireWork(workId);return associations.values().stream().filter(a->workId.equals(a.workId())&&kind==a.kind()).sorted(Comparator.comparing(WorkAssociationV1::associationId)).toList();}}

    public ProgressProjection getProgress(String ownerId,Freshness freshness,Long latestKnownRegistryRevision,boolean authoritativeStoreAvailable){
        synchronized(mutex){Objects.requireNonNull(freshness,"freshness");boolean exists=works.containsKey(ownerId)||projects.containsKey(ownerId);if(!exists)throw new IllegalArgumentException("UNKNOWN_OWNER:"+ownerId);Freshness f=!authoritativeStoreAvailable?Freshness.DEGRADED:(latestKnownRegistryRevision==null?Freshness.UNKNOWN:(latestKnownRegistryRevision==registryRevision?freshness:Freshness.STALE));List<MilestoneRecordV1> ms=milestones.values().stream().filter(m->Objects.equals(ownerId,m.workId())||Objects.equals(ownerId,m.projectId())).toList();Instant now=clock.instant();if(ms.isEmpty())return new ProgressProjection(ownerId,f,authoritativeStoreAvailable?registryRevision:null,now,null,null,null);long total=ms.stream().mapToLong(MilestoneRecordV1::weightUnits).sum();long done=ms.stream().filter(m->m.standing()==MilestoneStanding.SATISFIED).mapToLong(MilestoneRecordV1::weightUnits).sum();int percent=(int)((done*100L)/total);return new ProgressProjection(ownerId,f,authoritativeStoreAvailable?registryRevision:null,now,done,total,percent);}
    }

    public WorkPlanningRefV1 planningRef(String workId){synchronized(mutex){WorkRecordV1 w=requireWork(workId);List<String> blockers=management.values().stream().filter(m->m.kind()==ManagementKind.ISSUE&&"BLOCKING".equals(m.standing())&&(Objects.equals(workId,m.workId())||Objects.equals(w.projectId(),m.projectId()))).map(ManagementRecordV1::recordId).sorted().toList();String d=sha256(workId+"|"+w.entityRevision()+"|"+goalRefDigest(w.activeGovernedGoalRef())+"|"+nv(w.projectId())+"|"+nv(w.parentWorkId())+"|"+w.lifecycle()+"|"+String.join(",",blockers)+"|"+registryRevision);return new WorkPlanningRefV1(workId,w.entityRevision(),w.activeGovernedGoalRef(),w.projectId(),w.parentWorkId(),w.lifecycle(),blockers,registryRevision,d);}}
    public long registryRevision(){synchronized(mutex){return registryRevision;}}
    public int workCount(){synchronized(mutex){return works.size();}}
    public int projectCount(){synchronized(mutex){return projects.size();}}

    private WorkRecordV1 mutateWork(CommandMetaV1 meta,String computed,WorkRecordV1 old,String eventType,String parentWorkId,String projectId,GovernedGoalRefV1 goal,WorkLifecycle lifecycle) throws IOException {
        Instant now=clock.instant();long next=registryRevision+1;String ev=eventDigest("WORK",old.workId(),eventType,meta.principalRef(),now,lastEvent(workTimeline,old.workId()),computed,next);WorkRecordV1 w=new WorkRecordV1(old.workId(),old.entityRevision()+1,projectId,parentWorkId,goal,lifecycle,old.createdByPrincipalRef(),old.createdAt(),now,next,ev);return commit(meta,computed,"WORK",encodeWork(w),()->{works.put(old.workId(),w);registryRevision=next;addWorkEvent(old.workId(),eventType,meta.principalRef(),computed,now,ev,next);return w;});
    }

    private void appendOwnerEvent(String workId,String projectId,String eventType,String actor,String payload,Instant now,long next){if(workId!=null){String prev=lastEvent(workTimeline,workId);String ev=eventDigest("WORK",workId,eventType,actor,now,prev,payload,next);addWorkEvent(workId,eventType,actor,payload,now,ev,next);}else{String prev=lastEvent(projectTimeline,projectId);String ev=eventDigest("PROJECT",projectId,eventType,actor,now,prev,payload,next);addProjectEvent(projectId,eventType,actor,payload,now,ev,next);}}
    private void addWorkEvent(String id,String type,String actor,String payload,Instant at,String eventDigest,long rev){addEvent(workTimeline,"WORK",id,type,actor,payload,at,eventDigest,rev);}
    private void addProjectEvent(String id,String type,String actor,String payload,Instant at,String eventDigest,long rev){addEvent(projectTimeline,"PROJECT",id,type,actor,payload,at,eventDigest,rev);}
    private void addEvent(Map<String,List<TimelineEvent>> map,String kind,String id,String type,String actor,String payload,Instant at,String digest,long rev){List<TimelineEvent> list=map.computeIfAbsent(id,k->new ArrayList<>());String prev=list.isEmpty()?null:list.get(list.size()-1).eventDigest();long seq=list.size()+1L;String expected=eventDigest(kind,id,type,actor,at,prev,payload,rev);if(!expected.equals(digest))throw new IllegalStateException("EVENT_DIGEST_INTERNAL_MISMATCH");list.add(new TimelineEvent(seq,sha256(kind+"|"+id+"|"+seq+"|"+digest),kind,id,type,actor,at,prev,payload,digest,rev));}
    private static String lastEvent(Map<String,List<TimelineEvent>> map,String id){List<TimelineEvent> l=map.get(id);return l==null||l.isEmpty()?null:l.get(l.size()-1).eventDigest();}

    private <T> T commit(CommandMetaV1 meta,String commandDigest,String resultType,String resultPayload,Supplier<T> apply) throws IOException {
        String before=snapshotBase64(); long beforeRev=registryRevision; String beforeFrame=lastFrameDigest;
        try{
            T result=apply.get(); IdempotencyReceipt receipt=new IdempotencyReceipt(meta.idempotencyKey(),commandDigest,meta.principalRef(),meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest(),resultType,resultPayload,sha256(resultType+"|"+resultPayload),registryRevision);idempotency.put(meta.idempotencyKey(),receipt);
            String snapshot=snapshotBase64(); String frameDigest=sha256(STORE_VERSION+"|"+registryRevision+"|"+lastFrameDigest+"|"+snapshot);String line=STORE_VERSION+"\t"+registryRevision+"\t"+lastFrameDigest+"\t"+snapshot+"\t"+frameDigest+"\n";byte[] prior=Files.exists(logPath)?Files.readAllBytes(logPath):new byte[0];byte[] add=line.getBytes(StandardCharsets.UTF_8);byte[] next=new byte[prior.length+add.length];System.arraycopy(prior,0,next,0,prior.length);System.arraycopy(add,0,next,prior.length,add.length);Path temp=logPath.resolveSibling(logPath.getFileName()+".prepared-"+UUID.randomUUID());try{try(FileChannel ch=FileChannel.open(temp,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE)){ch.write(ByteBuffer.wrap(next));ch.force(true);}faultInjector.afterPrepared(temp);try{Files.move(temp,logPath,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}catch(AtomicMoveNotSupportedException ex){throw new IOException("ATOMIC_REPLACE_NOT_SUPPORTED",ex);}lastFrameDigest=frameDigest;}finally{Files.deleteIfExists(temp);}return result;
        }catch(IOException|RuntimeException e){loadSnapshotBase64(before);registryRevision=beforeRev;lastFrameDigest=beforeFrame;throw e;}
    }

    private static <T> T replayResult(IdempotencyReceipt r,CommandMetaV1 meta,String commandDigest,String expectedType,Decoder<T> decoder){if(!r.commandDigest().equals(commandDigest)||!r.principalRef().equals(meta.principalRef())||!r.contractSubjectId().equals(meta.contractSubjectId())||!r.contractSubjectVersion().equals(meta.contractSubjectVersion())||!r.contractSubjectDigest().equals(meta.contractSubjectDigest()))throw new IdempotencyConflictException("IDEMPOTENCY_CONFLICT");if(!r.resultType().equals(expectedType))throw new CorruptStoreException("IDEMPOTENCY_RESULT_TYPE_MISMATCH");if(!sha256(r.resultType()+"|"+r.resultPayload()).equals(r.resultDigest()))throw new CorruptStoreException("IDEMPOTENCY_RESULT_DIGEST_MISMATCH");return decoder.decode(r.resultPayload());}
    @FunctionalInterface private interface Decoder<T>{T decode(String x);}

    private void validateMeta(CommandMetaV1 meta,String computed,Long expected){Objects.requireNonNull(meta,"meta");if(!contractValidator.isCompatible(meta.contractSubjectId(),meta.contractSubjectVersion(),meta.contractSubjectDigest()))throw new IllegalArgumentException("CONTRACT_INCOMPATIBLE");if(!computed.equals(meta.commandPayloadDigest()))throw new IllegalArgumentException("COMMAND_PAYLOAD_DIGEST_MISMATCH");IdempotencyReceipt prior=idempotency.get(meta.idempotencyKey());if(prior!=null){if(!prior.commandDigest().equals(computed)||!prior.principalRef().equals(meta.principalRef())||!prior.contractSubjectId().equals(meta.contractSubjectId())||!prior.contractSubjectVersion().equals(meta.contractSubjectVersion())||!prior.contractSubjectDigest().equals(meta.contractSubjectDigest()))throw new IdempotencyConflictException("IDEMPOTENCY_CONFLICT");return;}if(expected==null){if(meta.expectedEntityRevision()!=null)throw new StaleRevisionException("UNEXPECTED_ENTITY_REVISION");}else if(!Objects.equals(expected,meta.expectedEntityRevision()))throw new StaleRevisionException("STALE_EXPECTED_REVISION expected="+meta.expectedEntityRevision()+" actual="+expected);}
    private void validateGoal(GovernedGoalRefV1 g){Objects.requireNonNull(g,"governedGoalRef");if(!keelValidator.isCurrentExact(g))throw new IllegalArgumentException("KEEL_REF_NOT_CURRENT_EXACT");}
    private void validateGoalLineage(WorkRecordV1 parent,GovernedGoalRefV1 child){ParentGoalRevisionRef p=child.parentGoalRevisionRef();if(p==null)return;GovernedGoalRefV1 pg=parent.activeGovernedGoalRef();if(!p.goalId().equals(pg.goalId())||p.revision()!=pg.goalRevision()||!p.goalRevisionId().equals(pg.goalRevisionId())||!p.contentDigest().equals(pg.goalContentDigest()))throw new IllegalArgumentException("PARENT_GOAL_LINEAGE_MISMATCH");}
    private WorkRecordV1 requireWork(String id){WorkRecordV1 w=works.get(id);if(w==null)throw new IllegalArgumentException("UNKNOWN_WORK:"+id);return w;}
    private ProjectRecordV1 requireProject(String id){ProjectRecordV1 p=projects.get(id);if(p==null)throw new IllegalArgumentException("UNKNOWN_PROJECT:"+id);return p;}
    private void ensureWorkAcyclic(String workId,String parentId){if(workId.equals(parentId))throw new IllegalArgumentException("WORK_SELF_PARENT");String cursor=parentId;Set<String> seen=new HashSet<>();while(cursor!=null){if(!seen.add(cursor)||workId.equals(cursor))throw new IllegalArgumentException("WORK_HIERARCHY_CYCLE");WorkRecordV1 w=works.get(cursor);cursor=w==null?null:w.parentWorkId();}}
    private void ensureProjectAcyclic(String id,String parentId){if(id.equals(parentId))throw new IllegalArgumentException("PROJECT_SELF_PARENT");String cursor=parentId;Set<String> seen=new HashSet<>();while(cursor!=null){if(!seen.add(cursor)||id.equals(cursor))throw new IllegalArgumentException("PROJECT_HIERARCHY_CYCLE");ProjectRecordV1 p=projects.get(cursor);cursor=p==null?null:p.parentProjectId();}}
    private boolean hasOpenChildren(String projectId){for(WorkRecordV1 w:works.values())if(Objects.equals(projectId,w.projectId())&&w.lifecycle()!=WorkLifecycle.CLOSED)return true;for(ProjectRecordV1 p:projects.values())if(Objects.equals(projectId,p.parentProjectId())&&p.lifecycle()!=ProjectLifecycle.CLOSED)return true;return false;}
    private static boolean legal(WorkLifecycle a,WorkLifecycle b){return switch(a){case OPEN->Set.of(WorkLifecycle.ACTIVE,WorkLifecycle.PAUSED,WorkLifecycle.BLOCKED,WorkLifecycle.CLOSING).contains(b);case ACTIVE->Set.of(WorkLifecycle.PAUSED,WorkLifecycle.BLOCKED,WorkLifecycle.CLOSING).contains(b);case PAUSED->Set.of(WorkLifecycle.ACTIVE,WorkLifecycle.BLOCKED,WorkLifecycle.CLOSING).contains(b);case BLOCKED->Set.of(WorkLifecycle.ACTIVE,WorkLifecycle.PAUSED,WorkLifecycle.CLOSING).contains(b);case CLOSING->Set.of(WorkLifecycle.CLOSED,WorkLifecycle.ACTIVE,WorkLifecycle.BLOCKED).contains(b);case CLOSED->false;};}
    private static boolean legal(ProjectLifecycle a,ProjectLifecycle b){return switch(a){case OPEN->Set.of(ProjectLifecycle.ACTIVE,ProjectLifecycle.PAUSED,ProjectLifecycle.CLOSED).contains(b);case ACTIVE->Set.of(ProjectLifecycle.PAUSED,ProjectLifecycle.CLOSED).contains(b);case PAUSED->Set.of(ProjectLifecycle.ACTIVE,ProjectLifecycle.CLOSED).contains(b);case CLOSED->false;};}

    private void replay() throws IOException {
        byte[] raw=Files.readAllBytes(logPath);if(raw.length==0)return;String text=new String(raw,StandardCharsets.UTF_8);if(!text.endsWith("\n"))throw new CorruptStoreException("TRUNCATED_TRANSACTION_FRAME");String prev="GENESIS";long expected=1;String[] lines=text.split("\n",-1);for(int i=0;i<lines.length-1;i++){String[] p=lines[i].split("\t",-1);if(p.length!=5||!STORE_VERSION.equals(p[0]))throw new CorruptStoreException("MALFORMED_FRAME line="+(i+1));long rev;try{rev=Long.parseLong(p[1]);}catch(NumberFormatException e){throw new CorruptStoreException("INVALID_REGISTRY_REVISION",e);}if(rev!=expected)throw new CorruptStoreException("REGISTRY_REVISION_GAP");if(!prev.equals(p[2]))throw new CorruptStoreException("FRAME_PARENT_DIGEST_MISMATCH");String calculated=sha256(STORE_VERSION+"|"+rev+"|"+p[2]+"|"+p[3]);if(!calculated.equals(p[4]))throw new CorruptStoreException("FRAME_DIGEST_MISMATCH");loadSnapshotBase64(p[3]);if(registryRevision!=rev)throw new CorruptStoreException("SNAPSHOT_REVISION_MISMATCH");validateStateIntegrity();prev=p[4];expected++;}lastFrameDigest=prev;
    }

    private String snapshotBase64(){try{ByteArrayOutputStream bout=new ByteArrayOutputStream();try(DataOutputStream out=new DataOutputStream(bout)){s(out,"WP-SNAPSHOT-1");out.writeLong(registryRevision);writeMap(out,works,WorkProjectAuthorityRuntime::writeWork);writeMap(out,projects,WorkProjectAuthorityRuntime::writeProject);writeListMap(out,goalBindings,WorkProjectAuthorityRuntime::writeGoalBinding);writeMap(out,milestones,WorkProjectAuthorityRuntime::writeMilestone);writeMap(out,management,WorkProjectAuthorityRuntime::writeManagement);writeMap(out,memories,WorkProjectAuthorityRuntime::writeMemory);writeMap(out,associations,WorkProjectAuthorityRuntime::writeAssociation);writeListMap(out,workTimeline,WorkProjectAuthorityRuntime::writeTimeline);writeListMap(out,projectTimeline,WorkProjectAuthorityRuntime::writeTimeline);writeMap(out,idempotency,WorkProjectAuthorityRuntime::writeIdempotency);}return Base64.getEncoder().encodeToString(bout.toByteArray());}catch(IOException e){throw new UncheckedIOException(e);}}
    private void loadSnapshotBase64(String b64){try{byte[] bytes=Base64.getDecoder().decode(b64);try(DataInputStream in=new DataInputStream(new ByteArrayInputStream(bytes))){if(!"WP-SNAPSHOT-1".equals(s(in)))throw new CorruptStoreException("SNAPSHOT_VERSION");registryRevision=in.readLong();works.clear();readMap(in,works,WorkProjectAuthorityRuntime::readWork);projects.clear();readMap(in,projects,WorkProjectAuthorityRuntime::readProject);goalBindings.clear();readListMap(in,goalBindings,WorkProjectAuthorityRuntime::readGoalBinding);milestones.clear();readMap(in,milestones,WorkProjectAuthorityRuntime::readMilestone);management.clear();readMap(in,management,WorkProjectAuthorityRuntime::readManagement);memories.clear();readMap(in,memories,WorkProjectAuthorityRuntime::readMemory);associations.clear();readMap(in,associations,WorkProjectAuthorityRuntime::readAssociation);workTimeline.clear();readListMap(in,workTimeline,WorkProjectAuthorityRuntime::readTimeline);projectTimeline.clear();readListMap(in,projectTimeline,WorkProjectAuthorityRuntime::readTimeline);idempotency.clear();readMap(in,idempotency,WorkProjectAuthorityRuntime::readIdempotency);if(in.available()!=0)throw new CorruptStoreException("SNAPSHOT_TRAILING_BYTES");}}catch(IllegalArgumentException|IOException e){if(e instanceof CorruptStoreException c)throw c;throw new CorruptStoreException("SNAPSHOT_DECODE_FAILED",e);}}

    private void validateStateIntegrity(){for(Map.Entry<String,WorkRecordV1> e:works.entrySet()){if(!e.getKey().equals(e.getValue().workId()))throw new CorruptStoreException("WORK_KEY_MISMATCH");List<GoalBindingV1> gs=goalBindings.get(e.getKey());if(gs==null||gs.isEmpty())throw new CorruptStoreException("MISSING_GOAL_BINDING");GoalBindingV1 g=gs.get(gs.size()-1);if(!goalRefDigest(g.governedGoalRef()).equals(goalRefDigest(e.getValue().activeGovernedGoalRef())))throw new CorruptStoreException("WORK_GOAL_BINDING_MISMATCH");validateTimelineChain(workTimeline.getOrDefault(e.getKey(),List.of()),"WORK",e.getKey());}for(Map.Entry<String,ProjectRecordV1> e:projects.entrySet()){if(!e.getKey().equals(e.getValue().projectId()))throw new CorruptStoreException("PROJECT_KEY_MISMATCH");validateTimelineChain(projectTimeline.getOrDefault(e.getKey(),List.of()),"PROJECT",e.getKey());}for(IdempotencyReceipt r:idempotency.values())if(!sha256(r.resultType()+"|"+r.resultPayload()).equals(r.resultDigest()))throw new CorruptStoreException("IDEMPOTENCY_RESULT_DIGEST_MISMATCH");}
    private static void validateTimelineChain(List<TimelineEvent> list,String kind,String id){String prev=null;long seq=1;for(TimelineEvent e:list){if(e.sequence()!=seq||!kind.equals(e.entityKind())||!id.equals(e.entityId())||!Objects.equals(prev,e.previousEventDigest()))throw new CorruptStoreException("TIMELINE_CHAIN_MISMATCH");String expected=eventDigest(kind,id,e.eventType(),e.actor(),e.occurredAt(),prev,e.payloadDigest(),e.registryRevision());if(!expected.equals(e.eventDigest()))throw new CorruptStoreException("TIMELINE_EVENT_DIGEST_MISMATCH");prev=e.eventDigest();seq++;}}

    @FunctionalInterface private interface Writer<T>{void write(DataOutputStream out,T value)throws IOException;}
    @FunctionalInterface private interface Reader<T>{T read(DataInputStream in)throws IOException;}
    private static <T> void writeMap(DataOutputStream out,Map<String,T> map,Writer<T> w)throws IOException{List<String> keys=new ArrayList<>(map.keySet());Collections.sort(keys);out.writeInt(keys.size());for(String k:keys){s(out,k);w.write(out,map.get(k));}}
    private static <T> void readMap(DataInputStream in,Map<String,T> map,Reader<T> r)throws IOException{int n=count(in);for(int i=0;i<n;i++){String k=s(in);T v=r.read(in);if(map.put(k,v)!=null)throw new CorruptStoreException("DUPLICATE_SNAPSHOT_KEY");}}
    private static <T> void writeListMap(DataOutputStream out,Map<String,List<T>> map,Writer<T> w)throws IOException{List<String> keys=new ArrayList<>(map.keySet());Collections.sort(keys);out.writeInt(keys.size());for(String k:keys){s(out,k);List<T> list=map.get(k);out.writeInt(list.size());for(T v:list)w.write(out,v);}}
    private static <T> void readListMap(DataInputStream in,Map<String,List<T>> map,Reader<T> r)throws IOException{int n=count(in);for(int i=0;i<n;i++){String k=s(in);int m=count(in);List<T> list=new ArrayList<>();for(int j=0;j<m;j++)list.add(r.read(in));if(map.put(k,list)!=null)throw new CorruptStoreException("DUPLICATE_SNAPSHOT_LIST_KEY");}}
    private static int count(DataInputStream in)throws IOException{int n=in.readInt();if(n<0||n>1_000_000)throw new CorruptStoreException("INVALID_COUNT");return n;}
    private static void s(DataOutputStream out,String x)throws IOException{if(x==null){out.writeInt(-1);return;}byte[] b=x.getBytes(StandardCharsets.UTF_8);if(b.length>1_000_000)throw new IllegalArgumentException("STRING_TOO_LARGE");out.writeInt(b.length);out.write(b);}
    private static String s(DataInputStream in)throws IOException{int n=in.readInt();if(n==-1)return null;if(n<0||n>1_000_000)throw new CorruptStoreException("INVALID_STRING_LENGTH");byte[] b=in.readNBytes(n);if(b.length!=n)throw new EOFException();return new String(b,StandardCharsets.UTF_8);}
    private static void instant(DataOutputStream out,Instant i)throws IOException{s(out,i.toString());} private static Instant instant(DataInputStream in)throws IOException{return Instant.parse(s(in));}
    private static void goal(DataOutputStream out,GovernedGoalRefV1 g)throws IOException{s(out,g.goalId());out.writeInt(g.goalRevision());s(out,g.goalRevisionId());s(out,g.goalContentDigest());s(out,g.keelValidationReceiptDigest());s(out,g.contractSubjectId());s(out,g.contractSubjectVersion());s(out,g.contractSubjectDigest());out.writeBoolean(g.parentGoalRevisionRef()!=null);if(g.parentGoalRevisionRef()!=null){ParentGoalRevisionRef p=g.parentGoalRevisionRef();s(out,p.goalId());out.writeInt(p.revision());s(out,p.goalRevisionId());s(out,p.contentDigest());}out.writeLong(g.observedKeelRegistryRevision());}
    private static GovernedGoalRefV1 goal(DataInputStream in)throws IOException{String id=s(in);int r=in.readInt();String rid=s(in),cd=s(in),vd=s(in),csid=s(in),csv=s(in),csd=s(in);ParentGoalRevisionRef p=null;if(in.readBoolean())p=new ParentGoalRevisionRef(s(in),in.readInt(),s(in),s(in));long rr=in.readLong();return new GovernedGoalRefV1(id,r,rid,cd,vd,csid,csv,csd,p,rr);}
    private static void writeWork(DataOutputStream o,WorkRecordV1 w)throws IOException{s(o,w.workId());o.writeLong(w.entityRevision());s(o,w.projectId());s(o,w.parentWorkId());goal(o,w.activeGovernedGoalRef());s(o,w.lifecycle().name());s(o,w.createdByPrincipalRef());instant(o,w.createdAt());instant(o,w.updatedAt());o.writeLong(w.registryRevision());s(o,w.latestEventDigest());}
    private static WorkRecordV1 readWork(DataInputStream i)throws IOException{return new WorkRecordV1(s(i),i.readLong(),s(i),s(i),goal(i),WorkLifecycle.valueOf(s(i)),s(i),instant(i),instant(i),i.readLong(),s(i));}
    private static void writeProject(DataOutputStream o,ProjectRecordV1 p)throws IOException{s(o,p.projectId());o.writeLong(p.entityRevision());s(o,p.parentProjectId());s(o,p.title());s(o,p.lifecycle().name());s(o,p.createdByPrincipalRef());instant(o,p.createdAt());instant(o,p.updatedAt());o.writeLong(p.registryRevision());s(o,p.latestEventDigest());}
    private static ProjectRecordV1 readProject(DataInputStream i)throws IOException{return new ProjectRecordV1(s(i),i.readLong(),s(i),s(i),ProjectLifecycle.valueOf(s(i)),s(i),instant(i),instant(i),i.readLong(),s(i));}
    private static void writeGoalBinding(DataOutputStream o,GoalBindingV1 g)throws IOException{s(o,g.workId());o.writeLong(g.bindingRevision());goal(o,g.governedGoalRef());s(o,g.priorBindingDigest());s(o,g.reasonRef());s(o,g.boundByPrincipalRef());instant(o,g.boundAt());s(o,g.bindingDigest());}
    private static GoalBindingV1 readGoalBinding(DataInputStream i)throws IOException{return new GoalBindingV1(s(i),i.readLong(),goal(i),s(i),s(i),s(i),instant(i),s(i));}
    private static void writeMilestone(DataOutputStream o,MilestoneRecordV1 m)throws IOException{s(o,m.milestoneId());s(o,m.workId());s(o,m.projectId());s(o,m.title());o.writeLong(m.weightUnits());s(o,m.standing().name());s(o,m.standingBasisRef());instant(o,m.createdAt());instant(o,m.updatedAt());o.writeLong(m.entityRevision());}
    private static MilestoneRecordV1 readMilestone(DataInputStream i)throws IOException{return new MilestoneRecordV1(s(i),s(i),s(i),s(i),i.readLong(),MilestoneStanding.valueOf(s(i)),s(i),instant(i),instant(i),i.readLong());}
    private static void writeManagement(DataOutputStream o,ManagementRecordV1 m)throws IOException{s(o,m.recordId());s(o,m.workId());s(o,m.projectId());s(o,m.kind().name());s(o,m.title());s(o,m.standing());s(o,m.ownerRef());s(o,m.sourceRef());instant(o,m.createdAt());instant(o,m.updatedAt());o.writeLong(m.entityRevision());}
    private static ManagementRecordV1 readManagement(DataInputStream i)throws IOException{return new ManagementRecordV1(s(i),s(i),s(i),ManagementKind.valueOf(s(i)),s(i),s(i),s(i),s(i),instant(i),instant(i),i.readLong());}
    private static void writeMemory(DataOutputStream o,ProjectMemoryRefV1 m)throws IOException{s(o,m.refId());s(o,m.workId());s(o,m.projectId());s(o,m.memoryRef());s(o,m.memoryOwnerAuthority());s(o,m.purposeRef());instant(o,m.addedAt());}
    private static ProjectMemoryRefV1 readMemory(DataInputStream i)throws IOException{return new ProjectMemoryRefV1(s(i),s(i),s(i),s(i),s(i),s(i),instant(i));}
    private static void writeAssociation(DataOutputStream o,WorkAssociationV1 a)throws IOException{s(o,a.associationId());s(o,a.workId());s(o,a.kind().name());s(o,a.externalRef());s(o,a.externalOwnerAuthority());s(o,a.externalVersionOrDigest());instant(o,a.createdAt());}
    private static WorkAssociationV1 readAssociation(DataInputStream i)throws IOException{return new WorkAssociationV1(s(i),s(i),AssociationKind.valueOf(s(i)),s(i),s(i),s(i),instant(i));}
    private static void writeTimeline(DataOutputStream o,TimelineEvent e)throws IOException{o.writeLong(e.sequence());s(o,e.eventId());s(o,e.entityKind());s(o,e.entityId());s(o,e.eventType());s(o,e.actor());instant(o,e.occurredAt());s(o,e.previousEventDigest());s(o,e.payloadDigest());s(o,e.eventDigest());o.writeLong(e.registryRevision());}
    private static TimelineEvent readTimeline(DataInputStream i)throws IOException{return new TimelineEvent(i.readLong(),s(i),s(i),s(i),s(i),s(i),instant(i),s(i),s(i),s(i),i.readLong());}
    private static void writeIdempotency(DataOutputStream o,IdempotencyReceipt r)throws IOException{s(o,r.idempotencyKey());s(o,r.commandDigest());s(o,r.principalRef());s(o,r.contractSubjectId());s(o,r.contractSubjectVersion());s(o,r.contractSubjectDigest());s(o,r.resultType());s(o,r.resultPayload());s(o,r.resultDigest());o.writeLong(r.registryRevision());}
    private static IdempotencyReceipt readIdempotency(DataInputStream i)throws IOException{return new IdempotencyReceipt(s(i),s(i),s(i),s(i),s(i),s(i),s(i),s(i),s(i),i.readLong());}

    private static String encodeWork(WorkRecordV1 w){return encode(out->writeWork(out,w));}
    private static WorkRecordV1 decodeWork(String x){return decode(x,WorkProjectAuthorityRuntime::readWork);}
    private static String encodeProject(ProjectRecordV1 p){return encode(out->writeProject(out,p));}
    private static ProjectRecordV1 decodeProject(String x){return decode(x,WorkProjectAuthorityRuntime::readProject);}
    private static String encodeMilestone(MilestoneRecordV1 m){return encode(out->writeMilestone(out,m));}
    private static MilestoneRecordV1 decodeMilestone(String x){return decode(x,WorkProjectAuthorityRuntime::readMilestone);}
    private static String encodeManagement(ManagementRecordV1 m){return encode(out->writeManagement(out,m));}
    private static ManagementRecordV1 decodeManagement(String x){return decode(x,WorkProjectAuthorityRuntime::readManagement);}
    private static String encodeMemory(ProjectMemoryRefV1 m){return encode(out->writeMemory(out,m));}
    private static ProjectMemoryRefV1 decodeMemory(String x){return decode(x,WorkProjectAuthorityRuntime::readMemory);}
    private static String encodeAssociation(WorkAssociationV1 a){return encode(out->writeAssociation(out,a));}
    private static WorkAssociationV1 decodeAssociation(String x){return decode(x,WorkProjectAuthorityRuntime::readAssociation);}
    private static String encodeClosureBasis(ClosureBasisV1 b){return b.workId()+"|"+b.disposition()+"|"+b.authorityRef()+"|"+b.decisionOrReceiptRef()+"|"+nv(b.subjectDigest())+"|"+b.recordedAt();}
    @FunctionalInterface private interface OutWriter{void write(DataOutputStream o)throws IOException;}
    private static String encode(OutWriter w){try{ByteArrayOutputStream b=new ByteArrayOutputStream();try(DataOutputStream o=new DataOutputStream(b)){w.write(o);}return Base64.getEncoder().encodeToString(b.toByteArray());}catch(IOException e){throw new UncheckedIOException(e);}}
    private static <T>T decode(String x,Reader<T> r){try(DataInputStream i=new DataInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(x)))){T v=r.read(i);if(i.available()!=0)throw new CorruptStoreException("RESULT_TRAILING_BYTES");return v;}catch(IOException|IllegalArgumentException e){throw new CorruptStoreException("RESULT_DECODE_FAILED",e);}}

    private static String canonicalGoal(GovernedGoalRefV1 g){ParentGoalRevisionRef p=g.parentGoalRevisionRef();return g.goalId()+"|"+g.goalRevision()+"|"+g.goalRevisionId()+"|"+g.goalContentDigest()+"|"+g.keelValidationReceiptDigest()+"|"+g.contractSubjectId()+"|"+g.contractSubjectVersion()+"|"+g.contractSubjectDigest()+"|"+(p==null?"<null>":p.goalId()+":"+p.revision()+":"+p.goalRevisionId()+":"+p.contentDigest())+"|"+g.observedKeelRegistryRevision();}
    private static String goalBindingDigest(String workId,long rev,GovernedGoalRefV1 g,String prior,String reason,String actor,Instant at){return sha256(workId+"|"+rev+"|"+goalRefDigest(g)+"|"+nv(prior)+"|"+reason+"|"+actor+"|"+at);}
    private static String eventDigest(String kind,String id,String type,String actor,Instant at,String prev,String payload,long rev){return sha256(kind+"|"+id+"|"+type+"|"+actor+"|"+at+"|"+nv(prev)+"|"+payload+"|"+rev);}
    private static String nv(String x){return x==null?"<null>":x;}
    private static boolean blank(String x){return x==null||x.isBlank();}
    private static String text(String x,String name){if(blank(x)||x.length()>4096)throw new IllegalArgumentException(name);return x;}
    private static void digest(String x,String name){if(x==null||!x.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(name);}
    public static String sha256(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}