package org.systemmaster.foundation.keel;

import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public final class KeelAuthorityRuntime {
    public enum RequirementKind { MUST, SHOULD, MAY }
    public enum ConstraintHardness { HARD, SOFT }
    public enum GoalStanding { GOVERNED, SUPERSEDED, RETIRED }
    public enum RefinementStanding { VALID, INVALID, UNKNOWN }
    public enum ContractGateStanding { CURRENT_ADMITTED, STALE, REJECTED }

    public record ContractGateReceipt(String subjectId, String subjectVersion, String subjectDigest, String receiptDigest) {
        public ContractGateReceipt {
            require(subjectId,"subjectId"); require(subjectVersion,"subjectVersion"); digest(subjectDigest,"subjectDigest"); digest(receiptDigest,"receiptDigest");
        }
    }
    public interface ContractGateAuthority { ContractGateStanding standing(ContractGateReceipt receipt); }
    public interface PrincipalRefAuthority { boolean known(String principalRef); }
    public interface ApprovalEvidenceAuthority { boolean valid(String evidenceRef, String exactCandidateDigest); }
    public interface ConstraintComparator {
        String type();
        boolean childNoWeaker(ConstraintDeclV1 parent, ConstraintDeclV1 child);
    }

    public static final class MaxLongComparator implements ConstraintComparator {
        private final String type;
        public MaxLongComparator(String type){this.type=require(type,"type");}
        @Override public String type(){return type;}
        @Override public boolean childNoWeaker(ConstraintDeclV1 p,ConstraintDeclV1 c){return parse(c.value())<=parse(p.value());}
        private static long parse(String v){try{return Long.parseLong(v);}catch(NumberFormatException e){throw new IllegalArgumentException("constraint_value",e);}}
    }
    public static final class MinLongComparator implements ConstraintComparator {
        private final String type;
        public MinLongComparator(String type){this.type=require(type,"type");}
        @Override public String type(){return type;}
        @Override public boolean childNoWeaker(ConstraintDeclV1 p,ConstraintDeclV1 c){return parse(c.value())>=parse(p.value());}
        private static long parse(String v){try{return Long.parseLong(v);}catch(NumberFormatException e){throw new IllegalArgumentException("constraint_value",e);}}
    }
    public static final class ExactComparator implements ConstraintComparator {
        private final String type;
        public ExactComparator(String type){this.type=require(type,"type");}
        @Override public String type(){return type;}
        @Override public boolean childNoWeaker(ConstraintDeclV1 p,ConstraintDeclV1 c){return p.value().equals(c.value());}
    }

    public record GoalIdentityV1(String goalId, String ownerSystemId, String createdByPrincipalRef,
                                 String createdAtEvidenceRef, ContractGateReceipt subjectContractRef) {
        public GoalIdentityV1 {
            require(goalId,"goalId"); require(ownerSystemId,"ownerSystemId"); require(createdByPrincipalRef,"createdByPrincipalRef");
            require(createdAtEvidenceRef,"createdAtEvidenceRef"); Objects.requireNonNull(subjectContractRef,"subjectContractRef");
            scan(goalId);scan(ownerSystemId);scan(createdByPrincipalRef);scan(createdAtEvidenceRef);
        }
    }
    public record RequirementDeclV1(String requirementId, RequirementKind kind, String declaration,
                                    String specialistOwnerRef, String requiredEvidenceClass, String inheritedFromRef) {
        public RequirementDeclV1 {
            require(requirementId,"requirementId"); Objects.requireNonNull(kind,"kind"); require(declaration,"declaration");
            opt(specialistOwnerRef); opt(requiredEvidenceClass); opt(inheritedFromRef); scan(requirementId);scan(declaration);scanNullable(specialistOwnerRef);scanNullable(requiredEvidenceClass);scanNullable(inheritedFromRef);
        }
    }
    public record ConstraintDeclV1(String constraintId, ConstraintHardness hardness, String constraintType,
                                   String value, String inheritedFromRef) {
        public ConstraintDeclV1 {
            require(constraintId,"constraintId"); Objects.requireNonNull(hardness,"hardness"); require(constraintType,"constraintType"); require(value,"value"); opt(inheritedFromRef);
            scan(constraintId);scan(constraintType);scan(value);scanNullable(inheritedFromRef);
        }
    }
    public record SuccessCriterionDeclV1(String criterionId, String predicateRef, String requiredEvidenceClass,
                                         String evaluatorRef, String thresholdRef) {
        public SuccessCriterionDeclV1 {
            require(criterionId,"criterionId");require(predicateRef,"predicateRef");require(requiredEvidenceClass,"requiredEvidenceClass");opt(evaluatorRef);opt(thresholdRef);
            scan(criterionId);scan(predicateRef);scan(requiredEvidenceClass);scanNullable(evaluatorRef);scanNullable(thresholdRef);
        }
    }
    public record DelegationCeilingV1(int maxDepth, int maxAutonomyRank, Set<String> permittedRoleClasses,
                                      Set<String> forbiddenDelegationClasses) {
        public DelegationCeilingV1 {
            if(maxDepth<0||maxDepth>64||maxAutonomyRank<0||maxAutonomyRank>100)throw new IllegalArgumentException("delegation_ceiling");
            permittedRoleClasses=orderedSet(permittedRoleClasses,64); forbiddenDelegationClasses=orderedSet(forbiddenDelegationClasses,64);
        }
    }
    public record ResourceCeilingV1(long maxCostMicros, long maxDurationSeconds, long maxStorageBytes,
                                    Set<String> allowedResourceClasses) {
        public ResourceCeilingV1 {
            if(maxCostMicros<0||maxDurationSeconds<0||maxStorageBytes<0)throw new IllegalArgumentException("resource_ceiling");
            allowedResourceClasses=orderedSet(allowedResourceClasses,64);
        }
    }
    public record HumanControlRequirementV1(String requirementId, int riskRank, String requiredEvidenceClass, boolean mandatory) {
        public HumanControlRequirementV1 {
            require(requirementId,"requirementId");if(riskRank<0||riskRank>100)throw new IllegalArgumentException("riskRank");require(requiredEvidenceClass,"requiredEvidenceClass");
            scan(requirementId);scan(requiredEvidenceClass);
        }
    }
    public record ActionEnvelopeV1(Set<String> allowedClasses, Set<String> forbiddenClasses) {
        public ActionEnvelopeV1 { allowedClasses=orderedSet(allowedClasses,128); forbiddenClasses=orderedSet(forbiddenClasses,128); }
        public boolean permitsAtKeelCeiling(String actionClass){return allowedClasses.contains(actionClass)&&!forbiddenClasses.contains(actionClass);}
    }
    public record ParentGoalRevisionRef(String goalId,int revision,String goalRevisionId,String contentDigest) {
        public ParentGoalRevisionRef {require(goalId,"goalId");if(revision<1)throw new IllegalArgumentException("revision");require(goalRevisionId,"goalRevisionId");digest(contentDigest,"contentDigest");}
    }
    public record RevisionCandidate(String goalId,int revision,ParentGoalRevisionRef parentRef,String problemStatement,
                                    List<String> desiredOutcomes,List<RequirementDeclV1> requirements,List<ConstraintDeclV1> constraints,
                                    Map<String,String> softConstraintDispositions,List<SuccessCriterionDeclV1> successCriteria,
                                    DelegationCeilingV1 delegationCeiling,ResourceCeilingV1 resourceCeiling,
                                    List<HumanControlRequirementV1> humanControlRequirements,ActionEnvelopeV1 actionEnvelope,
                                    List<String> references,boolean approvalRequired,String approvedByEvidenceRef,String canonicalizationId,
                                    ContractGateReceipt contractGateReceipt,List<String> lineageEvidenceRefs) {
        public RevisionCandidate {
            require(goalId,"goalId"); if(revision<1)throw new IllegalArgumentException("revision"); require(problemStatement,"problemStatement");
            desiredOutcomes=boundedStrings(desiredOutcomes,64,"desiredOutcomes"); requirements=boundedList(requirements,128,"requirements"); constraints=boundedList(constraints,128,"constraints");
            softConstraintDispositions=orderedMap(softConstraintDispositions,128); successCriteria=boundedList(successCriteria,128,"successCriteria");
            Objects.requireNonNull(delegationCeiling,"delegationCeiling");Objects.requireNonNull(resourceCeiling,"resourceCeiling");
            humanControlRequirements=boundedList(humanControlRequirements,64,"humanControlRequirements");Objects.requireNonNull(actionEnvelope,"actionEnvelope");
            references=boundedStrings(references,128,"references");opt(approvedByEvidenceRef);require(canonicalizationId,"canonicalizationId");Objects.requireNonNull(contractGateReceipt,"contractGateReceipt");
            lineageEvidenceRefs=boundedStrings(lineageEvidenceRefs,128,"lineageEvidenceRefs");
            scan(goalId);scan(problemStatement);scanNullable(approvedByEvidenceRef);scan(canonicalizationId);
        }
    }
    public record GoalRevisionV1(String goalId,int revision,String goalRevisionId,ParentGoalRevisionRef parentRef,String problemStatement,
                                 List<String> desiredOutcomes,List<RequirementDeclV1> requirements,List<ConstraintDeclV1> constraints,
                                 Map<String,String> softConstraintDispositions,List<SuccessCriterionDeclV1> successCriteria,
                                 DelegationCeilingV1 delegationCeiling,ResourceCeilingV1 resourceCeiling,
                                 List<HumanControlRequirementV1> humanControlRequirements,ActionEnvelopeV1 actionEnvelope,
                                 List<String> references,String approvedByEvidenceRef,String contentDigest,String canonicalizationId,
                                 ContractGateReceipt contractGateReceipt,List<String> lineageEvidenceRefs,long introducedRegistryRevision) {}
    public record KeelRefinementReceiptV1(String goalId,int revision,String goalRevisionId,String contentDigest,
                                          ParentGoalRevisionRef parentRef,String contractGateReceiptDigest,
                                          String validatorId,String validatorVersion,RefinementStanding standing,List<String> reasonCodes,
                                          String comparedEnvelopeDigest,long observedRegistryRevision,String receiptDigest) {
        public KeelRefinementReceiptV1 {reasonCodes=List.copyOf(reasonCodes);digest(receiptDigest,"receiptDigest");}
    }
    public record GovernedGoalRefV1(String goalId,int goalRevision,String goalRevisionId,String goalContentDigest,
                                    String keelValidationReceiptDigest,String contractSubjectId,String contractSubjectVersion,
                                    String contractSubjectDigest,ParentGoalRevisionRef parentGoalRevisionRef,long observedKeelRegistryRevision) {}
    public record PublicationResult(GoalRevisionV1 revision,KeelRefinementReceiptV1 validationReceipt,GovernedGoalRefV1 governedGoalRef) {}
    public record RetirementResult(String goalId,int retiredRevision,String reasonRef,long registryRevision) {}
    public record ExactSubjectEvidence(String subjectDigest, boolean currentExact) {
        public ExactSubjectEvidence {digest(subjectDigest,"subjectDigest");}
        public boolean qualifies(String expectedDigest){return currentExact&&subjectDigest.equals(expectedDigest);}
    }

    public static final class KeelException extends RuntimeException {
        private static final long serialVersionUID=1L; private final String code;
        public KeelException(String code){super(code);this.code=code;} public String code(){return code;}
    }

    private static final Map<Path,Object> JVM_LOCKS=new ConcurrentHashMap<>();
    private final Path journalPath,lockPath;
    private final PrincipalRefAuthority principals;
    private final ApprovalEvidenceAuthority approvals;
    private final ContractGateAuthority contracts;
    private final Map<String,ConstraintComparator> comparators;
    private final String expectedContractSubjectId,expectedContractVersion,expectedContractDigest;
    private final String validatorId,validatorVersion;

    public KeelAuthorityRuntime(Path dir,PrincipalRefAuthority principals,ApprovalEvidenceAuthority approvals,
                                ContractGateAuthority contracts,Collection<? extends ConstraintComparator> comparators,
                                String expectedContractSubjectId,String expectedContractVersion,String expectedContractDigest,
                                String validatorId,String validatorVersion){
        try{Files.createDirectories(dir);}catch(IOException e){throw new UncheckedIOException(e);}this.journalPath=dir.resolve("keel.journal");this.lockPath=dir.resolve("keel.lock");
        this.principals=Objects.requireNonNull(principals);this.approvals=Objects.requireNonNull(approvals);this.contracts=Objects.requireNonNull(contracts);
        Map<String,ConstraintComparator> m=new HashMap<>();for(ConstraintComparator c:comparators)m.put(c.type(),c);this.comparators=Map.copyOf(m);
        this.expectedContractSubjectId=require(expectedContractSubjectId,"expectedContractSubjectId");this.expectedContractVersion=require(expectedContractVersion,"expectedContractVersion");digest(expectedContractDigest,"expectedContractDigest");this.expectedContractDigest=expectedContractDigest;
        this.validatorId=require(validatorId,"validatorId");this.validatorVersion=require(validatorVersion,"validatorVersion");
    }

    public long registryRevision(){synchronized(jvmLock()){return load().revision;}}
    public GoalStanding standing(String goalId,int revision){synchronized(jvmLock()){return load().standings.get(key(goalId,revision));}}
    public GoalRevisionV1 currentRevision(String goalId){synchronized(jvmLock()){State s=load();Integer r=s.current.get(goalId);return r==null?null:s.revisions.get(goalId).get(r);}}

    public GoalIdentityV1 createGoalIdentity(String commandId,long expectedRevision,GoalIdentityV1 identity){
        require(commandId,"commandId");Objects.requireNonNull(identity);String rh=sha256("CREATE|"+encodeIdentity(identity));
        return mutate(commandId,rh,expectedRevision,s->{
            validateContractGate(identity.subjectContractRef());
            if(!principals.known(identity.createdByPrincipalRef()))throw ex("UNKNOWN_PRINCIPAL_REF");
            GoalIdentityV1 prior=s.identities.get(identity.goalId());if(prior!=null){if(prior.equals(identity))return Mutation.noop(prior);throw ex("GOAL_IDENTITY_CONFLICT");}
            return Mutation.event(identity,"IDENTITY",encodeIdentity(identity));
        },GoalIdentityV1.class);
    }

    public PublicationResult publishGoalRevision(String commandId,long expectedRevision,RevisionCandidate candidate){
        require(commandId,"commandId");Objects.requireNonNull(candidate);String candidateDigest=contentDigest(candidate);String rh=sha256("PUBLISH|"+candidateDigest);
        return mutate(commandId,rh,expectedRevision,s->{
            GoalIdentityV1 identity=s.identities.get(candidate.goalId());if(identity==null)throw ex("UNKNOWN_GOAL");if(s.retired.contains(candidate.goalId()))throw ex("GOAL_RETIRED");
            validateContractGate(candidate.contractGateReceipt());
            if(!candidate.contractGateReceipt().subjectId().equals(identity.subjectContractRef().subjectId()))throw ex("CONTRACT_GATE_STALE_OR_REJECTED");
            if(candidate.approvalRequired()){
                if(candidate.approvedByEvidenceRef()==null)throw ex("APPROVAL_EVIDENCE_REQUIRED");
                if(!approvals.valid(candidate.approvedByEvidenceRef(),candidateDigest))throw ex("APPROVAL_RECEIPT_BINDING_MISMATCH");
            }else if(candidate.approvedByEvidenceRef()!=null&&!approvals.valid(candidate.approvedByEvidenceRef(),candidateDigest))throw ex("APPROVAL_RECEIPT_BINDING_MISMATCH");
            validateUniqueIds(candidate);
            NavigableMap<Integer,GoalRevisionV1> revs=s.revisions.getOrDefault(candidate.goalId(),new TreeMap<>());
            GoalRevisionV1 same=revs.get(candidate.revision());
            if(same!=null){if(same.contentDigest().equals(candidateDigest))return Mutation.noop(publicationFromStored(s,same));throw ex("CONTENT_DIGEST_CONFLICT");}
            int expectedNext=revs.isEmpty()?1:revs.lastKey()+1;if(candidate.revision()!=expectedNext)throw ex("REVISION_CONFLICT");
            GoalRevisionV1 parent=null;
            if(candidate.revision()==1){if(candidate.parentRef()!=null)throw ex("UNKNOWN_PARENT_REVISION");}
            else{
                if(candidate.parentRef()==null)throw ex("UNKNOWN_PARENT_REVISION");
                parent=revs.get(candidate.parentRef().revision());if(parent==null)throw ex("UNKNOWN_PARENT_REVISION");
                verifyParentRef(candidate.parentRef(),parent);
                Integer cur=s.current.get(candidate.goalId());if(cur==null||cur!=parent.revision()||s.standings.get(key(candidate.goalId(),cur))!=GoalStanding.GOVERNED)throw ex("PARENT_NOT_GOVERNED");
            }
            Refinement evaluation=evaluateRefinement(parent,candidate);
            if(evaluation.standing==RefinementStanding.UNKNOWN)throw ex(evaluation.reasons.get(0));
            if(evaluation.standing==RefinementStanding.INVALID)throw ex(evaluation.reasons.get(0));
            long newReg=s.revision+1;String revisionId=sha256(candidate.goalId()+"|"+candidate.revision()+"|"+candidateDigest);
            GoalRevisionV1 rev=toRevision(candidate,candidateDigest,revisionId,newReg);
            KeelRefinementReceiptV1 receipt=receipt(rev,evaluation,newReg);
            GovernedGoalRefV1 ref=goalRef(rev,receipt,newReg);
            PublicationResult result=new PublicationResult(rev,receipt,ref);
            return Mutation.event(result,"REVISION",encodePublication(result));
        },PublicationResult.class);
    }

    public RetirementResult retireGoal(String commandId,long expectedRevision,String goalId,String reasonRef){
        require(commandId,"commandId");require(goalId,"goalId");require(reasonRef,"reasonRef");scan(reasonRef);String rh=sha256("RETIRE|"+goalId+"|"+reasonRef);
        return mutate(commandId,rh,expectedRevision,s->{
            if(!s.identities.containsKey(goalId))throw ex("UNKNOWN_GOAL");if(s.retired.contains(goalId)){Integer cr=s.current.get(goalId);int rr=cr==null?s.revisions.get(goalId).lastKey():cr;return Mutation.noop(new RetirementResult(goalId,rr,reasonRef,s.revision));}
            Integer cur=s.current.get(goalId);if(cur==null)throw ex("UNKNOWN_PARENT_REVISION");
            RetirementResult rr=new RetirementResult(goalId,cur,reasonRef,s.revision+1);return Mutation.event(rr,"RETIRE",enc(goalId,Integer.toString(cur),reasonRef,Long.toString(s.revision+1)));
        },RetirementResult.class);
    }

    public KeelRefinementReceiptV1 validateRefinement(RevisionCandidate candidate){
        Objects.requireNonNull(candidate);synchronized(jvmLock()){
            State s=load();GoalRevisionV1 parent=null;if(candidate.parentRef()!=null){var revs=s.revisions.get(candidate.goalId());if(revs!=null)parent=revs.get(candidate.parentRef().revision());}
            String candidateDigest=contentDigest(candidate);String revisionId=sha256(candidate.goalId()+"|"+candidate.revision()+"|"+candidateDigest);
            GoalRevisionV1 rev=toRevision(candidate,candidateDigest,revisionId,s.revision);
            Refinement ev;
            try{if(parent!=null)verifyParentRef(candidate.parentRef(),parent);ev=evaluateRefinement(parent,candidate);}catch(KeelException e){ev=new Refinement(RefinementStanding.INVALID,List.of(e.code()),envelopeDigest(candidate));}
            return receipt(rev,ev,s.revision);
        }
    }

    public static String contentDigest(RevisionCandidate c){return sha256(encodeCandidate(c));}
    public void corruptLastByteForTest(){synchronized(jvmLock()){try(RandomAccessFile f=new RandomAccessFile(journalPath.toFile(),"rw")){if(f.length()<2)throw new IllegalStateException();f.seek(f.length()-2);int b=f.read();f.seek(f.length()-2);f.write(b=='X'?'Y':'X');}catch(IOException e){throw new UncheckedIOException(e);}}}
    public void truncateLastByteForTest(){synchronized(jvmLock()){try{long n=Files.size(journalPath);try(FileChannel c=FileChannel.open(journalPath,StandardOpenOption.WRITE)){c.truncate(Math.max(0,n-1));}}catch(IOException e){throw new UncheckedIOException(e);}}}

    private void validateContractGate(ContractGateReceipt gate){
        if(!gate.subjectId().equals(expectedContractSubjectId)||!gate.subjectVersion().equals(expectedContractVersion)||!gate.subjectDigest().equals(expectedContractDigest))throw ex("CONTRACT_GATE_STALE_OR_REJECTED");
        ContractGateStanding st=contracts.standing(gate);if(st!=ContractGateStanding.CURRENT_ADMITTED)throw ex(st==ContractGateStanding.STALE?"CONTRACT_GATE_STALE_OR_REJECTED":"CONTRACT_GATE_MISSING");
    }
    private static void verifyParentRef(ParentGoalRevisionRef ref,GoalRevisionV1 parent){
        if(!ref.goalId().equals(parent.goalId())||ref.revision()!=parent.revision())throw ex("UNKNOWN_PARENT_REVISION");
        if(!ref.goalRevisionId().equals(parent.goalRevisionId())||!ref.contentDigest().equals(parent.contentDigest()))throw ex("PARENT_DIGEST_MISMATCH");
    }
    private void validateUniqueIds(RevisionCandidate c){
        unique(c.requirements().stream().map(RequirementDeclV1::requirementId).toList(),"requirementId");unique(c.constraints().stream().map(ConstraintDeclV1::constraintId).toList(),"constraintId");
        unique(c.successCriteria().stream().map(SuccessCriterionDeclV1::criterionId).toList(),"criterionId");unique(c.humanControlRequirements().stream().map(HumanControlRequirementV1::requirementId).toList(),"humanRequirementId");
    }
    private static void unique(List<String> ids,String n){if(new HashSet<>(ids).size()!=ids.size())throw new IllegalArgumentException("duplicate_"+n);}

    private Refinement evaluateRefinement(GoalRevisionV1 parent,RevisionCandidate child){
        List<String> reasons=new ArrayList<>();
        if(parent==null)return new Refinement(RefinementStanding.VALID,List.of("ROOT_GOAL"),envelopeDigest(child));
        Map<String,RequirementDeclV1> cr=byReq(child.requirements());
        for(RequirementDeclV1 pr:parent.requirements()){
            RequirementDeclV1 x=cr.get(pr.requirementId());
            if(pr.kind()==RequirementKind.MUST&&(x==null||!sameMandatoryRequirement(pr,x)))return bad("HARD_CONSTRAINT_REMOVED",child);
            if(pr.specialistOwnerRef()!=null&&(x==null||!Objects.equals(pr.specialistOwnerRef(),x.specialistOwnerRef())))return bad("SPECIALIST_OWNER_REBOUND",child);
        }
        Map<String,ConstraintDeclV1> cc=byConstraint(child.constraints());
        for(ConstraintDeclV1 pc:parent.constraints()){
            ConstraintDeclV1 x=cc.get(pc.constraintId());
            if(pc.hardness()==ConstraintHardness.HARD){
                if(x==null)return bad("HARD_CONSTRAINT_REMOVED",child);if(x.hardness()!=ConstraintHardness.HARD||!x.constraintType().equals(pc.constraintType()))return bad("HARD_CONSTRAINT_WEAKENED",child);
                ConstraintComparator comp=comparators.get(pc.constraintType());if(comp==null)return unknown("UNKNOWN_COMPARATOR",child);
                boolean ok;try{ok=comp.childNoWeaker(pc,x);}catch(RuntimeException e){return unknown("UNKNOWN_COMPARATOR",child);}if(!ok)return bad("HARD_CONSTRAINT_WEAKENED",child);
            }else if(x==null||!x.equals(pc)){
                String disp=child.softConstraintDispositions().get(pc.constraintId());if(disp==null||disp.isBlank())return bad("SOFT_CONSTRAINT_UNDISPOSITIONED",child);
            }
        }
        if(!delegationNoWider(parent.delegationCeiling(),child.delegationCeiling()))return bad("DELEGATION_CEILING_EXPANDED",child);
        if(!resourceNoWider(parent.resourceCeiling(),child.resourceCeiling()))return bad("RESOURCE_CEILING_EXPANDED",child);
        if(!parent.actionEnvelope().allowedClasses().containsAll(child.actionEnvelope().allowedClasses()))return bad("ALLOWED_ACTION_EXPANDED",child);
        if(!child.actionEnvelope().forbiddenClasses().containsAll(parent.actionEnvelope().forbiddenClasses()))return bad("FORBIDDEN_ACTION_REMOVED",child);
        if(!hitlNoWeaker(parent.humanControlRequirements(),child.humanControlRequirements()))return bad("HITL_REQUIREMENT_WEAKENED",child);
        return new Refinement(RefinementStanding.VALID,List.of("NON_EXPANDING_REFINEMENT"),envelopeDigest(child));
    }
    private static boolean sameMandatoryRequirement(RequirementDeclV1 a,RequirementDeclV1 b){return a.requirementId().equals(b.requirementId())&&a.kind()==b.kind()&&a.declaration().equals(b.declaration())&&Objects.equals(a.specialistOwnerRef(),b.specialistOwnerRef());}
    private static boolean delegationNoWider(DelegationCeilingV1 p,DelegationCeilingV1 c){return c.maxDepth()<=p.maxDepth()&&c.maxAutonomyRank()<=p.maxAutonomyRank()&&p.permittedRoleClasses().containsAll(c.permittedRoleClasses())&&c.forbiddenDelegationClasses().containsAll(p.forbiddenDelegationClasses());}
    private static boolean resourceNoWider(ResourceCeilingV1 p,ResourceCeilingV1 c){return c.maxCostMicros()<=p.maxCostMicros()&&c.maxDurationSeconds()<=p.maxDurationSeconds()&&c.maxStorageBytes()<=p.maxStorageBytes()&&p.allowedResourceClasses().containsAll(c.allowedResourceClasses());}
    private static boolean hitlNoWeaker(List<HumanControlRequirementV1> parent,List<HumanControlRequirementV1> child){Map<String,HumanControlRequirementV1> cm=new HashMap<>();for(var x:child)cm.put(x.requirementId(),x);for(var p:parent)if(p.mandatory()){var c=cm.get(p.requirementId());if(c==null||!c.mandatory()||c.riskRank()<p.riskRank()||!c.requiredEvidenceClass().equals(p.requiredEvidenceClass()))return false;}return true;}
    private static Map<String,RequirementDeclV1> byReq(List<RequirementDeclV1> l){Map<String,RequirementDeclV1> m=new HashMap<>();for(var x:l)m.put(x.requirementId(),x);return m;}
    private static Map<String,ConstraintDeclV1> byConstraint(List<ConstraintDeclV1> l){Map<String,ConstraintDeclV1> m=new HashMap<>();for(var x:l)m.put(x.constraintId(),x);return m;}
    private static Refinement bad(String code,RevisionCandidate c){return new Refinement(RefinementStanding.INVALID,List.of(code),envelopeDigest(c));}
    private static Refinement unknown(String code,RevisionCandidate c){return new Refinement(RefinementStanding.UNKNOWN,List.of(code),envelopeDigest(c));}
    private record Refinement(RefinementStanding standing,List<String> reasons,String envelopeDigest){}

    private GoalRevisionV1 toRevision(RevisionCandidate c,String digest,String revisionId,long reg){return new GoalRevisionV1(c.goalId(),c.revision(),revisionId,c.parentRef(),c.problemStatement(),c.desiredOutcomes(),c.requirements(),c.constraints(),c.softConstraintDispositions(),c.successCriteria(),c.delegationCeiling(),c.resourceCeiling(),c.humanControlRequirements(),c.actionEnvelope(),c.references(),c.approvedByEvidenceRef(),digest,c.canonicalizationId(),c.contractGateReceipt(),c.lineageEvidenceRefs(),reg);}
    private KeelRefinementReceiptV1 receipt(GoalRevisionV1 r,Refinement ev,long reg){String rd=sha256(r.goalId()+"|"+r.revision()+"|"+r.goalRevisionId()+"|"+r.contentDigest()+"|"+(r.parentRef()==null?"":encodeParent(r.parentRef()))+"|"+r.contractGateReceipt().receiptDigest()+"|"+validatorId+"|"+validatorVersion+"|"+ev.standing+"|"+String.join(",",ev.reasons)+"|"+ev.envelopeDigest+"|"+reg);return new KeelRefinementReceiptV1(r.goalId(),r.revision(),r.goalRevisionId(),r.contentDigest(),r.parentRef(),r.contractGateReceipt().receiptDigest(),validatorId,validatorVersion,ev.standing,ev.reasons,ev.envelopeDigest,reg,rd);}
    private static GovernedGoalRefV1 goalRef(GoalRevisionV1 r,KeelRefinementReceiptV1 vr,long reg){return new GovernedGoalRefV1(r.goalId(),r.revision(),r.goalRevisionId(),r.contentDigest(),vr.receiptDigest(),r.contractGateReceipt().subjectId(),r.contractGateReceipt().subjectVersion(),r.contractGateReceipt().subjectDigest(),r.parentRef(),reg);}
    private PublicationResult publicationFromStored(State s,GoalRevisionV1 r){Refinement ev=new Refinement(RefinementStanding.VALID,List.of("REPLAY"),envelopeDigest(r));KeelRefinementReceiptV1 vr=receipt(r,ev,r.introducedRegistryRevision());return new PublicationResult(r,vr,goalRef(r,vr,r.introducedRegistryRevision()));}

    private Object jvmLock(){return JVM_LOCKS.computeIfAbsent(lockPath.toAbsolutePath().normalize(),p->new Object());}
    private interface Mutator {Mutation<?> apply(State s);}
    private record Mutation<T>(T result,String type,String payload,boolean noop){static <T> Mutation<T> event(T r,String t,String p){return new Mutation<>(r,t,p,false);}static <T> Mutation<T> noop(T r){return new Mutation<>(r,null,null,true);}}
    private <T> T mutate(String commandId,String requestHash,long expectedRevision,Mutator mutator,Class<T> type){
        synchronized(jvmLock()){
            try(FileChannel lc=FileChannel.open(lockPath,StandardOpenOption.CREATE,StandardOpenOption.WRITE);FileLock ignored=lc.lock()){
                State s=load();CommandMemo memo=s.commands.get(commandId);if(memo!=null){if(!memo.requestHash.equals(requestHash))throw ex("COMMAND_REPLAY_CONFLICT");return type.cast(memo.result);}if(expectedRevision>=0&&expectedRevision!=s.revision)throw ex("KEEL_REGISTRY_REVISION_CONFLICT");
                Mutation<?> m=mutator.apply(s);if(m.noop)return type.cast(m.result);append(s.revision+1,s.lastHash,commandId,requestHash,m.type+"\t"+m.payload);State after=load();CommandMemo cm=after.commands.get(commandId);if(cm==null)throw new IllegalStateException("command_memo_missing");return type.cast(cm.result);
            }catch(IOException e){throw new UncheckedIOException(e);}
        }
    }
    private void append(long seq,String prev,String commandId,String requestHash,String event) throws IOException {String body=seq+"|"+prev+"|"+b64(commandId)+"|"+requestHash+"|"+b64(event);String hash=sha256(body);String line=body+"|"+hash+"\n";try(FileChannel ch=FileChannel.open(journalPath,StandardOpenOption.CREATE,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){ch.write(StandardCharsets.UTF_8.encode(line));ch.force(true);}}
    private State load(){State s=new State();if(!Files.exists(journalPath))return s;try{byte[] bytes=Files.readAllBytes(journalPath);if(bytes.length==0)return s;if(bytes[bytes.length-1]!='\n')throw ex("KEEL_JOURNAL_CORRUPT");String text=new String(bytes,StandardCharsets.UTF_8);String[] lines=text.substring(0,text.length()-1).split("\\n",-1);long expected=1;String prev="0".repeat(64);for(String line:lines){String[] p=line.split("\\|",6);if(p.length!=6)throw ex("KEEL_JOURNAL_CORRUPT");long seq;try{seq=Long.parseLong(p[0]);}catch(NumberFormatException e){throw ex("KEEL_JOURNAL_CORRUPT");}if(seq!=expected||!p[1].equals(prev))throw ex("KEEL_JOURNAL_CORRUPT");String body=String.join("|",Arrays.copyOf(p,5));if(!sha256(body).equals(p[5]))throw ex("KEEL_JOURNAL_CORRUPT");String command=ub64(p[2]),requestHash=p[3],event=ub64(p[4]);Object result=applyEvent(s,event,seq);s.commands.put(command,new CommandMemo(requestHash,result));s.revision=seq;s.lastHash=p[5];expected++;prev=p[5];}return s;}catch(IOException|IllegalArgumentException e){if(e instanceof KeelException ke)throw ke;throw ex("KEEL_JOURNAL_CORRUPT");}}
    private Object applyEvent(State s,String event,long seq){String[] o=event.split("\\t",2);if(o.length!=2)throw ex("KEEL_JOURNAL_CORRUPT");switch(o[0]){
        case "IDENTITY"->{GoalIdentityV1 x=decodeIdentity(o[1]);s.identities.put(x.goalId(),x);return x;}
        case "REVISION"->{PublicationResult r=decodePublication(o[1]);GoalRevisionV1 x=r.revision();s.revisions.computeIfAbsent(x.goalId(),k->new TreeMap<>());Integer old=s.current.get(x.goalId());if(old!=null)s.standings.put(key(x.goalId(),old),GoalStanding.SUPERSEDED);s.revisions.get(x.goalId()).put(x.revision(),x);s.standings.put(key(x.goalId(),x.revision()),GoalStanding.GOVERNED);s.current.put(x.goalId(),x.revision());return r;}
        case "RETIRE"->{String[] p=dec(o[1],4);String g=p[0];int r=Integer.parseInt(p[1]);RetirementResult rr=new RetirementResult(g,r,p[2],Long.parseLong(p[3]));s.retired.add(g);s.standings.put(key(g,r),GoalStanding.RETIRED);return rr;}
        default->throw ex("KEEL_JOURNAL_CORRUPT");}}
    private record CommandMemo(String requestHash,Object result){}
    private static final class State {long revision;String lastHash="0".repeat(64);final Map<String,GoalIdentityV1> identities=new HashMap<>();final Map<String,NavigableMap<Integer,GoalRevisionV1>> revisions=new HashMap<>();final Map<String,Integer> current=new HashMap<>();final Map<String,GoalStanding> standings=new HashMap<>();final Set<String> retired=new HashSet<>();final Map<String,CommandMemo> commands=new HashMap<>();}

    private static String envelopeDigest(RevisionCandidate c){return sha256(encodeDelegation(c.delegationCeiling())+"|"+encodeResource(c.resourceCeiling())+"|"+encodeAction(c.actionEnvelope())+"|"+encodeHitl(c.humanControlRequirements())+"|"+encodeConstraints(c.constraints()));}
    private static String envelopeDigest(GoalRevisionV1 r){return sha256(encodeDelegation(r.delegationCeiling())+"|"+encodeResource(r.resourceCeiling())+"|"+encodeAction(r.actionEnvelope())+"|"+encodeHitl(r.humanControlRequirements())+"|"+encodeConstraints(r.constraints()));}
    private static String encodeCandidate(RevisionCandidate c){return enc(c.goalId(),Integer.toString(c.revision()),c.parentRef()==null?"":encodeParent(c.parentRef()),c.problemStatement(),list(c.desiredOutcomes()),encodeRequirements(c.requirements()),encodeConstraints(c.constraints()),map(c.softConstraintDispositions()),encodeCriteria(c.successCriteria()),encodeDelegation(c.delegationCeiling()),encodeResource(c.resourceCeiling()),encodeHitl(c.humanControlRequirements()),encodeAction(c.actionEnvelope()),list(c.references()),Boolean.toString(c.approvalRequired()),nz(c.approvedByEvidenceRef()),c.canonicalizationId(),encodeGate(c.contractGateReceipt()),list(c.lineageEvidenceRefs()));}
    private static String encodeIdentity(GoalIdentityV1 x){return enc(x.goalId(),x.ownerSystemId(),x.createdByPrincipalRef(),x.createdAtEvidenceRef(),encodeGate(x.subjectContractRef()));}
    private static GoalIdentityV1 decodeIdentity(String s){String[] p=dec(s,5);return new GoalIdentityV1(p[0],p[1],p[2],p[3],decodeGate(p[4]));}
    private static String encodePublication(PublicationResult r){return enc(encodeRevision(r.revision()),encodeReceipt(r.validationReceipt()),encodeGoalRef(r.governedGoalRef()));}
    private static PublicationResult decodePublication(String s){String[] p=dec(s,3);return new PublicationResult(decodeRevision(p[0]),decodeReceipt(p[1]),decodeGoalRef(p[2]));}
    private static String encodeRevision(GoalRevisionV1 r){return enc(r.goalId(),Integer.toString(r.revision()),r.goalRevisionId(),r.parentRef()==null?"":encodeParent(r.parentRef()),r.problemStatement(),list(r.desiredOutcomes()),encodeRequirements(r.requirements()),encodeConstraints(r.constraints()),map(r.softConstraintDispositions()),encodeCriteria(r.successCriteria()),encodeDelegation(r.delegationCeiling()),encodeResource(r.resourceCeiling()),encodeHitl(r.humanControlRequirements()),encodeAction(r.actionEnvelope()),list(r.references()),nz(r.approvedByEvidenceRef()),r.contentDigest(),r.canonicalizationId(),encodeGate(r.contractGateReceipt()),list(r.lineageEvidenceRefs()),Long.toString(r.introducedRegistryRevision()));}
    private static GoalRevisionV1 decodeRevision(String s){String[] p=dec(s,21);return new GoalRevisionV1(p[0],Integer.parseInt(p[1]),p[2],p[3].isEmpty()?null:decodeParent(p[3]),p[4],strings(p[5]),decodeRequirements(p[6]),decodeConstraints(p[7]),strMap(p[8]),decodeCriteria(p[9]),decodeDelegation(p[10]),decodeResource(p[11]),decodeHitl(p[12]),decodeAction(p[13]),strings(p[14]),emptyNull(p[15]),p[16],p[17],decodeGate(p[18]),strings(p[19]),Long.parseLong(p[20]));}
    private static String encodeReceipt(KeelRefinementReceiptV1 r){return enc(r.goalId(),Integer.toString(r.revision()),r.goalRevisionId(),r.contentDigest(),r.parentRef()==null?"":encodeParent(r.parentRef()),r.contractGateReceiptDigest(),r.validatorId(),r.validatorVersion(),r.standing().name(),list(r.reasonCodes()),r.comparedEnvelopeDigest(),Long.toString(r.observedRegistryRevision()),r.receiptDigest());}
    private static KeelRefinementReceiptV1 decodeReceipt(String s){String[] p=dec(s,13);return new KeelRefinementReceiptV1(p[0],Integer.parseInt(p[1]),p[2],p[3],p[4].isEmpty()?null:decodeParent(p[4]),p[5],p[6],p[7],RefinementStanding.valueOf(p[8]),strings(p[9]),p[10],Long.parseLong(p[11]),p[12]);}
    private static String encodeGoalRef(GovernedGoalRefV1 r){return enc(r.goalId(),Integer.toString(r.goalRevision()),r.goalRevisionId(),r.goalContentDigest(),r.keelValidationReceiptDigest(),r.contractSubjectId(),r.contractSubjectVersion(),r.contractSubjectDigest(),r.parentGoalRevisionRef()==null?"":encodeParent(r.parentGoalRevisionRef()),Long.toString(r.observedKeelRegistryRevision()));}
    private static GovernedGoalRefV1 decodeGoalRef(String s){String[] p=dec(s,10);return new GovernedGoalRefV1(p[0],Integer.parseInt(p[1]),p[2],p[3],p[4],p[5],p[6],p[7],p[8].isEmpty()?null:decodeParent(p[8]),Long.parseLong(p[9]));}
    private static String encodeParent(ParentGoalRevisionRef p){return enc(p.goalId(),Integer.toString(p.revision()),p.goalRevisionId(),p.contentDigest());}
    private static ParentGoalRevisionRef decodeParent(String s){String[] p=dec(s,4);return new ParentGoalRevisionRef(p[0],Integer.parseInt(p[1]),p[2],p[3]);}
    private static String encodeGate(ContractGateReceipt g){return enc(g.subjectId(),g.subjectVersion(),g.subjectDigest(),g.receiptDigest());}
    private static ContractGateReceipt decodeGate(String s){String[] p=dec(s,4);return new ContractGateReceipt(p[0],p[1],p[2],p[3]);}
    private static String encodeRequirements(List<RequirementDeclV1> l){List<String> x=new ArrayList<>();for(var r:l)x.add(enc(r.requirementId(),r.kind().name(),r.declaration(),nz(r.specialistOwnerRef()),nz(r.requiredEvidenceClass()),nz(r.inheritedFromRef())));return list(x);}
    private static List<RequirementDeclV1> decodeRequirements(String s){List<RequirementDeclV1> out=new ArrayList<>();for(String z:strings(s)){String[]p=dec(z,6);out.add(new RequirementDeclV1(p[0],RequirementKind.valueOf(p[1]),p[2],emptyNull(p[3]),emptyNull(p[4]),emptyNull(p[5])));}return List.copyOf(out);}
    private static String encodeConstraints(List<ConstraintDeclV1> l){List<String>x=new ArrayList<>();for(var r:l)x.add(enc(r.constraintId(),r.hardness().name(),r.constraintType(),r.value(),nz(r.inheritedFromRef())));return list(x);}
    private static List<ConstraintDeclV1> decodeConstraints(String s){List<ConstraintDeclV1>o=new ArrayList<>();for(String z:strings(s)){String[]p=dec(z,5);o.add(new ConstraintDeclV1(p[0],ConstraintHardness.valueOf(p[1]),p[2],p[3],emptyNull(p[4])));}return List.copyOf(o);}
    private static String encodeCriteria(List<SuccessCriterionDeclV1> l){List<String>x=new ArrayList<>();for(var r:l)x.add(enc(r.criterionId(),r.predicateRef(),r.requiredEvidenceClass(),nz(r.evaluatorRef()),nz(r.thresholdRef())));return list(x);}
    private static List<SuccessCriterionDeclV1> decodeCriteria(String s){List<SuccessCriterionDeclV1>o=new ArrayList<>();for(String z:strings(s)){String[]p=dec(z,5);o.add(new SuccessCriterionDeclV1(p[0],p[1],p[2],emptyNull(p[3]),emptyNull(p[4])));}return List.copyOf(o);}
    private static String encodeDelegation(DelegationCeilingV1 d){return enc(Integer.toString(d.maxDepth()),Integer.toString(d.maxAutonomyRank()),set(d.permittedRoleClasses()),set(d.forbiddenDelegationClasses()));}
    private static DelegationCeilingV1 decodeDelegation(String s){String[]p=dec(s,4);return new DelegationCeilingV1(Integer.parseInt(p[0]),Integer.parseInt(p[1]),strSet(p[2]),strSet(p[3]));}
    private static String encodeResource(ResourceCeilingV1 r){return enc(Long.toString(r.maxCostMicros()),Long.toString(r.maxDurationSeconds()),Long.toString(r.maxStorageBytes()),set(r.allowedResourceClasses()));}
    private static ResourceCeilingV1 decodeResource(String s){String[]p=dec(s,4);return new ResourceCeilingV1(Long.parseLong(p[0]),Long.parseLong(p[1]),Long.parseLong(p[2]),strSet(p[3]));}
    private static String encodeHitl(List<HumanControlRequirementV1> l){List<String>x=new ArrayList<>();for(var h:l)x.add(enc(h.requirementId(),Integer.toString(h.riskRank()),h.requiredEvidenceClass(),Boolean.toString(h.mandatory())));return list(x);}
    private static List<HumanControlRequirementV1> decodeHitl(String s){List<HumanControlRequirementV1>o=new ArrayList<>();for(String z:strings(s)){String[]p=dec(z,4);o.add(new HumanControlRequirementV1(p[0],Integer.parseInt(p[1]),p[2],Boolean.parseBoolean(p[3])));}return List.copyOf(o);}
    private static String encodeAction(ActionEnvelopeV1 a){return enc(set(a.allowedClasses()),set(a.forbiddenClasses()));}
    private static ActionEnvelopeV1 decodeAction(String s){String[]p=dec(s,2);return new ActionEnvelopeV1(strSet(p[0]),strSet(p[1]));}
    private static String key(String g,int r){return g+"@"+r;}
    private static String nz(String s){return s==null?"":s;}private static String emptyNull(String s){return s.isEmpty()?null:s;}
    private static String enc(String...v){List<String>x=new ArrayList<>();for(String s:v)x.add(b64(s));return String.join(".",x);}private static String[] dec(String s,int n){String[]p=s.split("\\.",-1);if(p.length!=n)throw ex("KEEL_JOURNAL_CORRUPT");for(int i=0;i<p.length;i++)p[i]=ub64(p[i]);return p;}
    private static String list(Collection<String> v){List<String>x=new ArrayList<>();for(String s:v)x.add(b64(s));return String.join(",",x);}private static List<String> strings(String s){if(s.isEmpty())return List.of();List<String>o=new ArrayList<>();for(String z:s.split(",",-1))o.add(ub64(z));return List.copyOf(o);}private static String set(Set<String>s){return list(s);}private static Set<String> strSet(String s){return Collections.unmodifiableSet(new LinkedHashSet<>(strings(s)));}
    private static String map(Map<String,String> m){List<String>x=new ArrayList<>();for(var e:m.entrySet())x.add(b64(e.getKey())+":"+b64(e.getValue()));return String.join(",",x);}private static Map<String,String> strMap(String s){if(s.isEmpty())return Map.of();Map<String,String>m=new LinkedHashMap<>();for(String z:s.split(",",-1)){String[]p=z.split(":",2);if(p.length!=2)throw ex("KEEL_JOURNAL_CORRUPT");m.put(ub64(p[0]),ub64(p[1]));}return Collections.unmodifiableMap(m);}
    private static String b64(String s){return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));}private static String ub64(String s){return new String(Base64.getUrlDecoder().decode(s),StandardCharsets.UTF_8);}
    private static <T> List<T> boundedList(List<T> l,int max,String n){Objects.requireNonNull(l,n);if(l.size()>max)throw new IllegalArgumentException(n+"_too_large");return List.copyOf(l);}private static List<String> boundedStrings(List<String> l,int max,String n){List<String>x=boundedList(l,max,n);for(String s:x){require(s,n);scan(s);}return x;}
    private static Set<String> orderedSet(Set<String> s,int max){Objects.requireNonNull(s);if(s.size()>max)throw new IllegalArgumentException("set_too_large");List<String>x=new ArrayList<>(s);Collections.sort(x);LinkedHashSet<String>o=new LinkedHashSet<>();for(String v:x){require(v,"set_value");scan(v);o.add(v);}return Collections.unmodifiableSet(o);}private static Map<String,String> orderedMap(Map<String,String> m,int max){Objects.requireNonNull(m);if(m.size()>max)throw new IllegalArgumentException("map_too_large");TreeMap<String,String>t=new TreeMap<>();for(var e:m.entrySet()){require(e.getKey(),"map_key");require(e.getValue(),"map_value");scan(e.getKey());scan(e.getValue());t.put(e.getKey(),e.getValue());}return Collections.unmodifiableMap(t);}
    private static void opt(String s){if(s!=null)require(s,"optional");}private static String require(String s,String n){if(s==null||s.isBlank()||s.length()>4096)throw new IllegalArgumentException(n);for(int i=0;i<s.length();i++)if(s.charAt(i)<0x20)throw new IllegalArgumentException(n+"_control");return s;}private static void digest(String s,String n){require(s,n);if(!s.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(n+"_sha256");}
    private static void scanNullable(String s){if(s!=null)scan(s);}private static void scan(String s){String x=s.toLowerCase(Locale.ROOT);if(x.startsWith("sk-")||x.contains("password=")||x.contains("bearer ")||x.contains("-----begin private key-----"))throw ex("SECRET_FIELD_FORBIDDEN");}
    public static String sha256(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static KeelException ex(String code){return new KeelException(code);}
}
