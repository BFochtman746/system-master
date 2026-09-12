package org.systemmaster.foundation.workproject;

import static org.systemmaster.foundation.workproject.WorkProjectAuthorityRuntime.*;

import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;

public final class WorkProjectAuthorityQualificationTest {
    private static int cases=0;
    private static final Instant NOW=Instant.parse("2026-09-12T12:00:00Z");
    private static final Clock CLOCK=Clock.fixed(NOW, ZoneOffset.UTC);
    private static final String CMD_CONTRACT_ID="WORK-PROJECT-COMMANDS";
    private static final String CMD_CONTRACT_VERSION="1";
    private static final String CMD_CONTRACT_DIGEST=sha256("work-project-command-contract-v1");
    private static final String KEEL_CONTRACT_ID="FOUNDATION-KEEL";
    private static final String KEEL_CONTRACT_VERSION="1";
    private static final String KEEL_CONTRACT_DIGEST=sha256("foundation-keel-contract-v1");

    private interface Throwing { void run() throws Exception; }

    public static void main(String[] args) throws Exception {
        Path root=Files.createTempDirectory("work-project-qualification-");
        WorkProjectAuthorityRuntime r=runtime(root.resolve("authority.log"));

        GovernedGoalRefV1 gA1=goal("goal-A",1,null);
        GovernedGoalRefV1 gA2=goal("goal-A",2,null);
        GovernedGoalRefV1 gB1=goal("goal-B",1,null);

        // A. Identity and creation — 8
        WorkRecordV1 wA=createWork(r,"wA",null,null,gA1,"create",null,"k01");
        ok(wA.workId().equals("wA")&&wA.lifecycle()==WorkLifecycle.OPEN,"01 standalone Work exact ref");
        ProjectRecordV1 pA=createProject(r,"pA",null,"Project A",null,"k02");
        ok(pA.projectId().equals("pA"),"02 create Project");
        WorkRecordV1 wP=createWork(r,"wP","pA",null,goal("goal-P",1,null),"create",null,"k03");
        ok("pA".equals(wP.projectId()),"03 Work inside Project");
        expect(IllegalArgumentException.class,()->createWork(r,"wA",null,null,gA1,"dup",null,"k04"),"04 duplicate Work identity fails");
        expect(IllegalArgumentException.class,()->createProject(r,"pA",null,"dup",null,"k05"),"05 duplicate Project identity fails");
        expect(IllegalArgumentException.class,()->createWork(r," ",null,null,gA1,"bad",null,"k06"),"06 malformed Work identity fails");
        expect(IllegalArgumentException.class,()->createProject(r," ",null,"bad",null,"k07"),"07 malformed Project identity fails");
        ok(wA.createdByPrincipalRef().equals("principal-user")&&wA.createdAt().equals(NOW)&&wA.registryRevision()>0,"08 actor/time/registry preserved");

        // B. Keel binding and revision discipline — 10
        GoalBindingV1 bind=r.getActiveGoalBinding("wA");
        ok(bind.governedGoalRef().equals(gA1),"09 exact Keel ref persists field-for-field");
        GovernedGoalRefV1 malformedStanding=new GovernedGoalRefV1("invalid-goal",1,"rev",sha256("x"),sha256("receipt"),KEEL_CONTRACT_ID,KEEL_CONTRACT_VERSION,KEEL_CONTRACT_DIGEST,null,1);
        expect(IllegalArgumentException.class,()->createWork(r,"badGoal",null,null,malformedStanding,"bad",null,"k10"),"10 invalid Keel ref zero mutation");
        long beforeRebindRev=r.getWork("wA").entityRevision();
        WorkRecordV1 rebound=rebind(r,"wA",gA2,"approved revision",beforeRebindRev,"k11");
        ok(rebound.activeGovernedGoalRef().equals(gA2),"11 higher same-goal rebind passes");
        expect(IllegalArgumentException.class,()->rebind(r,"wA",gA2,"equal",rebound.entityRevision(),"k12"),"12 equal revision fails");
        expect(IllegalArgumentException.class,()->rebind(r,"wA",gA1,"lower",rebound.entityRevision(),"k13"),"13 lower revision fails");
        expect(IllegalArgumentException.class,()->rebind(r,"wA",gB1,"cross",rebound.entityRevision(),"k14"),"14 cross-goal rebind fails");
        GovernedGoalRefV1 badDigest=new GovernedGoalRefV1("goal-C",1,"goal-C-rev-1",sha256("substituted"),receiptDigest("goal-C",1),KEEL_CONTRACT_ID,KEEL_CONTRACT_VERSION,KEEL_CONTRACT_DIGEST,null,1);
        expect(IllegalArgumentException.class,()->createWork(r,"badDigest",null,null,badDigest,"bad",null,"k15"),"15 goal digest substitution fails");
        GovernedGoalRefV1 badContract=new GovernedGoalRefV1("goal-C",1,"goal-C-rev-1",contentDigest("goal-C",1),receiptDigest("goal-C",1),KEEL_CONTRACT_ID,KEEL_CONTRACT_VERSION,sha256("wrong-contract"),null,1);
        expect(IllegalArgumentException.class,()->createWork(r,"badContract",null,null,badContract,"bad",null,"k16"),"16 contract digest substitution fails");
        WorkRecordV1 parent=createWork(r,"parent",null,null,goal("goal-parent",1,null),"parent",null,"k17a");
        ParentGoalRevisionRef wrongParent=new ParentGoalRevisionRef("goal-other",1,"goal-other-rev-1",contentDigest("goal-other",1));
        GovernedGoalRefV1 childWrong=goal("goal-child",1,wrongParent);
        expect(IllegalArgumentException.class,()->createWork(r,"childWrong",null,"parent",childWrong,"child",null,"k17"),"17 child goal lineage mismatch fails");
        Set<String> workComponents=Arrays.stream(WorkRecordV1.class.getRecordComponents()).map(RecordComponent::getName).collect(java.util.stream.Collectors.toSet());
        ok(!workComponents.contains("desiredOutcomes")&&!workComponents.contains("constraints")&&!workComponents.contains("successCriteria"),"18 no mutable goal-copy authority");

        // C. Hierarchy and membership — 8
        WorkRecordV1 assigned=assign(r,"wA","pA",r.getWork("wA").entityRevision(),"k19");
        ok("pA".equals(assigned.projectId()),"19 assign Work to Project");
        createProject(r,"pB",null,"Project B",null,"k20a");
        WorkRecordV1 moved=assign(r,"wA","pB",assigned.entityRevision(),"k20");
        ok("pB".equals(moved.projectId()),"20 move Work between Projects");
        WorkRecordV1 child=createWork(r,"child",null,"parent",goal("goal-child-ok",1,new ParentGoalRevisionRef(parent.activeGovernedGoalRef().goalId(),parent.activeGovernedGoalRef().goalRevision(),parent.activeGovernedGoalRef().goalRevisionId(),parent.activeGovernedGoalRef().goalContentDigest())),"child",null,"k21");
        ok("parent".equals(child.parentWorkId()),"21 parent Work link passes");
        expect(IllegalArgumentException.class,()->reparentWork(r,"parent","parent",r.getWork("parent").entityRevision(),"k22"),"22 Work self-parent fails");
        expect(IllegalArgumentException.class,()->reparentWork(r,"parent","child",r.getWork("parent").entityRevision(),"k23"),"23 Work cycle fails");
        createProject(r,"pChild","pA","Child Project",null,"k24");
        ok("pA".equals(r.getProject("pChild").parentProjectId()),"24 Project parent link passes");
        expect(IllegalArgumentException.class,()->reparentProject(r,"pA","pA",r.getProject("pA").entityRevision(),"k25"),"25 Project self-parent fails");
        expect(IllegalArgumentException.class,()->reparentProject(r,"pA","pChild",r.getProject("pA").entityRevision(),"k26"),"26 Project cycle fails");

        // D. Lifecycle and closure — 10
        WorkRecordV1 active=transitionWork(r,"wP",WorkLifecycle.ACTIVE,r.getWork("wP").entityRevision(),"k27");
        ok(active.lifecycle()==WorkLifecycle.ACTIVE,"27 valid Work transition");
        expect(IllegalArgumentException.class,()->transitionWork(r,"wP",WorkLifecycle.OPEN,active.entityRevision(),"k28"),"28 invalid Work transition");
        ProjectRecordV1 pActive=transitionProject(r,"pB",ProjectLifecycle.ACTIVE,false,r.getProject("pB").entityRevision(),"k29");
        ok(pActive.lifecycle()==ProjectLifecycle.ACTIVE,"29 valid Project transition");
        expect(IllegalArgumentException.class,()->transitionProject(r,"pB",ProjectLifecycle.OPEN,false,pActive.entityRevision(),"k30"),"30 invalid Project transition");
        WorkRecordV1 closing=transitionWork(r,"wP",WorkLifecycle.CLOSING,active.entityRevision(),"k31a");
        ClosureBasisV1 validClose=new ClosureBasisV1("wP",ClosureDisposition.SATISFIED,"ASSURANCE","decision-wP",sha256("subject-wP"),NOW);
        WorkRecordV1 closed=close(r,"wP",validClose,closing.entityRevision(),"k31");
        ok(closed.lifecycle()==WorkLifecycle.CLOSED,"31 close with assurance basis");
        WorkRecordV1 attemptWork=createWork(r,"attemptWork",null,null,goal("goal-attempt",1,null),"create",null,"k32a");
        associate(r,"a-attempt","attemptWork",AssociationKind.ATTEMPT,"attempt-1","DURABLE_RUNTIME","v1","k32b");
        ok(r.getWork("attemptWork").lifecycle()!=WorkLifecycle.CLOSED,"32 attempt success association cannot close Work");
        expect(IllegalArgumentException.class,()->new ClosureBasisV1("attemptWork",ClosureDisposition.SATISFIED,"ASSURANCE"," ",sha256("x"),NOW),"33 satisfied close without decision ref fails");
        WorkRecordV1 cancelWork=createWork(r,"cancelWork",null,null,goal("goal-cancel",1,null),"create",null,"k34a");
        WorkRecordV1 cancelClosing=transitionWork(r,"cancelWork",WorkLifecycle.CLOSING,cancelWork.entityRevision(),"k34b");
        ClosureBasisV1 badCancel=new ClosureBasisV1("cancelWork",ClosureDisposition.CANCELLED,"ASSURANCE","decision-cancel",sha256("x"),NOW);
        expect(IllegalStateException.class,()->close(r,"cancelWork",badCancel,cancelClosing.entityRevision(),"k34"),"34 cancelled close without Keel basis fails");
        expect(IllegalArgumentException.class,()->transitionWork(r,"wP",WorkLifecycle.ACTIVE,closed.entityRevision(),"k35"),"35 CLOSED Work cannot reopen");
        createProject(r,"pClose",null,"Close Parent",null,"k36a");
        createWork(r,"pCloseWork","pClose",null,goal("goal-close-child",1,null),"create",null,"k36b");
        expect(IllegalStateException.class,()->transitionProject(r,"pClose",ProjectLifecycle.CLOSED,false,r.getProject("pClose").entityRevision(),"k36"),"36 Project close blocks active children");

        // E. Milestones/progress/management — 8
        WorkRecordV1 progressWork=createWork(r,"progressWork",null,null,goal("goal-progress",1,null),"create",null,"k37a");
        ProgressProjection none=r.getProgress("progressWork",Freshness.CURRENT,r.registryRevision(),true);
        ok(none.percent()==null&&none.totalWeight()==null,"37 no milestones => UNKNOWN percentage");
        upsertMilestone(r,"m1","progressWork",null,"M1",3,MilestoneStanding.SATISFIED,"evidence-m1",null,"k38a");
        upsertMilestone(r,"m2","progressWork",null,"M2",1,MilestoneStanding.OPEN,null,null,"k38b");
        ProgressProjection p75=r.getProgress("progressWork",Freshness.CURRENT,r.registryRevision(),true);
        ok(p75.percent()==75&&p75.completedWeight()==3&&p75.totalWeight()==4,"38 weighted progress deterministic");
        upsertMilestone(r,"m2","progressWork",null,"M2",1,MilestoneStanding.BLOCKED,null,1L,"k39a");
        ok(r.getProgress("progressWork",Freshness.CURRENT,r.registryRevision(),true).percent()==75,"39 blocked contributes zero");
        upsertMilestone(r,"m2","progressWork",null,"M2",1,MilestoneStanding.UNKNOWN,null,2L,"k40a");
        ok(r.getProgress("progressWork",Freshness.CURRENT,r.registryRevision(),true).percent()==75,"40 unknown does not fabricate completion");
        expect(IllegalArgumentException.class,()->upsertMilestone(r,"m3","progressWork",null,"M3",1,MilestoneStanding.SATISFIED,null,null,"k41"),"41 SATISFIED without basis fails");
        upsertMilestone(r,"m2","progressWork",null,"M2",1,MilestoneStanding.SATISFIED,"evidence-m2",3L,"k42a");
        ok(r.getProgress("progressWork",Freshness.CURRENT,r.registryRevision(),true).percent()==100&&r.getWork("progressWork").lifecycle()!=WorkLifecycle.CLOSED,"42 100 percent does not auto-close");
        String beforeGoal=goalRefDigest(r.getWork("progressWork").activeGovernedGoalRef());
        recordManagement(r,"chg1","progressWork",null,ManagementKind.CHANGE,"Change note","OPEN","owner",null,null,"k43a");
        ok(beforeGoal.equals(goalRefDigest(r.getWork("progressWork").activeGovernedGoalRef())),"43 management CHANGE cannot mutate goal");
        ProjectMemoryRefV1 mem=addMemory(r,"mem1","progressWork",null,"memory://canonical/123","MEMORY_AUTHORITY","project-purpose","k44a");
        ok(mem.memoryRef().equals("memory://canonical/123")&&mem.memoryOwnerAuthority().equals("MEMORY_AUTHORITY"),"44 memory is reference only");

        // F. Idempotency/concurrency/durability — 12
        Path idemDir=Files.createTempDirectory(root,"idem-"); WorkProjectAuthorityRuntime ir=runtime(idemDir.resolve("authority.log"));
        CommandMetaV1 idemMeta=meta("k45",null,"CreateProject","idemP",null,"Idem Project");
        ProjectRecordV1 idemOne=ir.createProject(idemMeta,"idemP",null,"Idem Project"); long idemRev=ir.registryRevision();
        ProjectRecordV1 idemTwo=ir.createProject(idemMeta,"idemP",null,"Idem Project");
        ok(idemOne.equals(idemTwo)&&ir.registryRevision()==idemRev,"45 same key + digest exact replay");
        CommandMetaV1 conflict=meta("k45",null,"CreateProject","idemP",null,"Different");
        expect(IdempotencyConflictException.class,()->ir.createProject(conflict,"idemP",null,"Different"),"46 same key different digest fails");
        WorkProjectAuthorityRuntime ir2=runtime(idemDir.resolve("authority.log")); ProjectRecordV1 idemThree=ir2.createProject(idemMeta,"idemP",null,"Idem Project");
        ok(idemThree.equals(idemOne)&&ir2.registryRevision()==idemRev,"47 idempotency survives restart");
        WorkRecordV1 stale=createWork(ir2,"staleW",null,null,goal("goal-stale",1,null),"create",null,"k48a");
        expect(StaleRevisionException.class,()->transitionWork(ir2,"staleW",WorkLifecycle.ACTIVE,stale.entityRevision()+1,"k48"),"48 stale entity revision fails");
        long beforeEntity=ir2.getWork("staleW").entityRevision(); WorkRecordV1 afterEntity=transitionWork(ir2,"staleW",WorkLifecycle.ACTIVE,beforeEntity,"k49");
        ok(afterEntity.entityRevision()==beforeEntity+1,"49 entity revision increments once");
        long regA=ir2.registryRevision(); createProject(ir2,"regP",null,"Reg",null,"k50a");
        ok(ir2.registryRevision()==regA+1,"50 registry revision monotonic");
        Path failLog=root.resolve("fault.log"); WorkProjectAuthorityRuntime fault=new WorkProjectAuthorityRuntime(failLog,CLOCK,WorkProjectAuthorityQualificationTest::validGoal,WorkProjectAuthorityQualificationTest::validContract,WorkProjectAuthorityQualificationTest::validClosure,p->{throw new IOException("injected-before-move");});
        expect(IOException.class,()->createProject(fault,"faultP",null,"Fault",null,"k51"),"51 crash before durable commit no accepted mutation");
        ok(fault.projectCount()==0&&!Files.exists(failLog),"51b crash rollback state"); cases--; // fold support assertion into case 51
        Path durableLog=root.resolve("durable.log"); WorkProjectAuthorityRuntime durable=runtime(durableLog); ProjectRecordV1 durableP=createProject(durable,"durableP",null,"Durable",null,"k52a"); WorkProjectAuthorityRuntime durable2=runtime(durableLog);
        ok(durable2.getProject("durableP").equals(durableP),"52 crash/restart after durable commit replays once");
        Path corruptBase=root.resolve("corrupt-base.log"); WorkProjectAuthorityRuntime cr=runtime(corruptBase); createProject(cr,"c1",null,"C1",null,"k53a"); createProject(cr,"c2",null,"C2",null,"k53b");
        Path truncated=root.resolve("truncated.log"); byte[] base=Files.readAllBytes(corruptBase); Files.write(truncated,Arrays.copyOf(base,base.length-1));
        expect(CorruptStoreException.class,()->runtime(truncated),"53 truncated journal fails closed");
        Path tampered=root.resolve("tampered.log"); String baseText=Files.readString(corruptBase); int firstTab=baseText.indexOf('\t'); int secondTab=baseText.indexOf('\t',firstTab+1); int thirdTab=baseText.indexOf('\t',secondTab+1); int fourthTab=baseText.indexOf('\t',thirdTab+1); char oldChar=baseText.charAt(thirdTab+1); char newChar=oldChar=='A'?'B':'A'; String tamperedText=baseText.substring(0,thirdTab+1)+newChar+baseText.substring(thirdTab+2); Files.writeString(tampered,tamperedText);
        expect(CorruptStoreException.class,()->runtime(tampered),"54 tampered payload fails closed");
        Path reordered=root.resolve("reordered.log"); String[] ls=baseText.split("\n"); Files.writeString(reordered,ls[1]+"\n"+ls[0]+"\n");
        expect(CorruptStoreException.class,()->runtime(reordered),"55 reorder/parent discontinuity fails closed");
        Path gap=root.resolve("gap.log"); String[] parts=ls[1].split("\t",-1); parts[1]="3"; String changed=String.join("\t",parts); Files.writeString(gap,ls[0]+"\n"+changed+"\n");
        expect(CorruptStoreException.class,()->runtime(gap),"56 registry revision gap fails closed");

        // G. Boundaries/projections/handoff — 8
        WorkRecordV1 boundary=createWork(r,"boundaryW",null,null,goal("goal-boundary",1,null),"create",null,"k57a");
        WorkAssociationV1 planAssoc=associate(r,"assoc-plan","boundaryW",AssociationKind.PLAN,"plan-1","PLANNING","digest-plan","k57");
        ok(planAssoc.externalOwnerAuthority().equals("PLANNING")&&r.getWork("boundaryW").activeGovernedGoalRef().equals(boundary.activeGovernedGoalRef()),"57 association does not import external truth");
        ok(planAssoc.workId().equals("boundaryW"),"58 exact workId survives Plan association");
        WorkAssociationV1 jobAssoc=associate(r,"assoc-job","boundaryW",AssociationKind.JOB,"job-1","DURABLE_RUNTIME","digest-job","k59a"); WorkAssociationV1 attemptAssoc=associate(r,"assoc-attempt2","boundaryW",AssociationKind.ATTEMPT,"attempt-2","DURABLE_RUNTIME","digest-attempt","k59b");
        ok(jobAssoc.workId().equals("boundaryW")&&attemptAssoc.workId().equals("boundaryW"),"59 exact workId survives Job/Attempt association");
        WorkAssociationV1 art=associate(r,"assoc-art","boundaryW",AssociationKind.ARTIFACT,"artifact-1","ARTIFACT_GATEWAY","digest-art","k60a"); WorkAssociationV1 ev=associate(r,"assoc-evidence","boundaryW",AssociationKind.EVIDENCE,"evidence-1","EVIDENCE","digest-ev","k60b");
        ok(art.workId().equals("boundaryW")&&ev.workId().equals("boundaryW"),"60 exact workId survives Artifact/Evidence association");
        ProgressProjection current=r.getProgress("boundaryW",Freshness.CURRENT,r.registryRevision(),true);
        ok(current.freshness()==Freshness.CURRENT,"61 CURRENT projection when caught up");
        ProgressProjection degraded=r.getProgress("boundaryW",Freshness.CURRENT,r.registryRevision(),false);
        ok(degraded.freshness()==Freshness.DEGRADED&&degraded.percent()==null,"62 degraded projection cannot claim completion");
        WorkPlanningRefV1 planning=r.planningRef("boundaryW");
        ok(planning.workId().equals("boundaryW")&&planning.workEntityRevision()==r.getWork("boundaryW").entityRevision()&&planning.governedGoalRef().equals(r.getWork("boundaryW").activeGovernedGoalRef()),"63 planning handoff exact Work + goal");
        Set<String> publicMethods=Arrays.stream(WorkProjectAuthorityRuntime.class.getDeclaredMethods()).filter(m->java.lang.reflect.Modifier.isPublic(m.getModifiers())).map(m->m.getName().toLowerCase()).collect(java.util.stream.Collectors.toSet());
        ok(publicMethods.stream().noneMatch(n->n.startsWith("authorizeeffect")||n.startsWith("route")||n.startsWith("grantresource")||n.startsWith("executeattempt")||n.startsWith("authorizerecovery")),"64 no route/resource/attempt/effect/recovery authorization API");

        if(cases!=64) throw new AssertionError("case count "+cases+" != 64");
        System.out.println("PASS FOUNDATION_WORK_PROJECT cases=64");
    }

    private static WorkProjectAuthorityRuntime runtime(Path p) throws IOException { return new WorkProjectAuthorityRuntime(p,CLOCK,WorkProjectAuthorityQualificationTest::validGoal,WorkProjectAuthorityQualificationTest::validContract,WorkProjectAuthorityQualificationTest::validClosure,x->{}); }
    private static boolean validContract(String id,String version,String digest){return CMD_CONTRACT_ID.equals(id)&&CMD_CONTRACT_VERSION.equals(version)&&CMD_CONTRACT_DIGEST.equals(digest);}
    private static boolean validGoal(GovernedGoalRefV1 g){return !g.goalId().startsWith("invalid-")&&g.goalRevisionId().equals(g.goalId()+"-rev-"+g.goalRevision())&&g.goalContentDigest().equals(contentDigest(g.goalId(),g.goalRevision()))&&g.keelValidationReceiptDigest().equals(receiptDigest(g.goalId(),g.goalRevision()))&&KEEL_CONTRACT_ID.equals(g.contractSubjectId())&&KEEL_CONTRACT_VERSION.equals(g.contractSubjectVersion())&&KEEL_CONTRACT_DIGEST.equals(g.contractSubjectDigest());}
    private static boolean validClosure(ClosureBasisV1 b,GovernedGoalRefV1 g){return switch(b.disposition()){case SATISFIED -> b.authorityRef().equals("ASSURANCE")&&b.decisionOrReceiptRef().startsWith("decision-");case CANCELLED,SUPERSEDED -> b.authorityRef().equals("KEEL")&&b.decisionOrReceiptRef().startsWith("keel-");case ABANDONED -> b.authorityRef().equals("USER_CONTROL");case UNSATISFIED_TERMINAL -> b.authorityRef().equals("ASSURANCE")&&b.decisionOrReceiptRef().startsWith("decision-");};}
    private static GovernedGoalRefV1 goal(String id,int rev,ParentGoalRevisionRef parent){return new GovernedGoalRefV1(id,rev,id+"-rev-"+rev,contentDigest(id,rev),receiptDigest(id,rev),KEEL_CONTRACT_ID,KEEL_CONTRACT_VERSION,KEEL_CONTRACT_DIGEST,parent,rev);}
    private static String contentDigest(String id,int rev){return sha256("goal-content|"+id+"|"+rev);}
    private static String receiptDigest(String id,int rev){return sha256("keel-receipt|"+id+"|"+rev);}
    private static CommandMetaV1 meta(String key,Long expected,String operation,String...fields){return new CommandMetaV1("cmd-"+key,key,"principal-user",expected,CMD_CONTRACT_ID,CMD_CONTRACT_VERSION,CMD_CONTRACT_DIGEST,payloadDigest(operation,fields));}

    private static ProjectRecordV1 createProject(WorkProjectAuthorityRuntime r,String id,String parent,String title,Long expected,String key)throws IOException{return r.createProject(meta(key,expected,"CreateProject",id,parent,title),id,parent,title);}
    private static WorkRecordV1 createWork(WorkProjectAuthorityRuntime r,String id,String project,String parent,GovernedGoalRefV1 g,String reason,Long expected,String key)throws IOException{return r.createWork(meta(key,expected,"CreateWork",id,project,parent,goalRefDigest(g),reason),id,project,parent,g,reason);}
    private static WorkRecordV1 rebind(WorkProjectAuthorityRuntime r,String id,GovernedGoalRefV1 g,String reason,long expected,String key)throws IOException{return r.rebindWorkGoal(meta(key,expected,"RebindWorkGoal",id,goalRefDigest(g),reason),id,g,reason);}
    private static WorkRecordV1 assign(WorkProjectAuthorityRuntime r,String id,String project,long expected,String key)throws IOException{return r.assignWorkToProject(meta(key,expected,"AssignWorkToProject",id,project),id,project);}
    private static WorkRecordV1 reparentWork(WorkProjectAuthorityRuntime r,String id,String parent,long expected,String key)throws IOException{return r.reparentWork(meta(key,expected,"ReparentWork",id,parent),id,parent);}
    private static ProjectRecordV1 reparentProject(WorkProjectAuthorityRuntime r,String id,String parent,long expected,String key)throws IOException{return r.reparentProject(meta(key,expected,"ReparentProject",id,parent),id,parent);}
    private static WorkRecordV1 transitionWork(WorkProjectAuthorityRuntime r,String id,WorkLifecycle state,long expected,String key)throws IOException{return r.transitionWork(meta(key,expected,"TransitionWork",id,state.name()),id,state);}
    private static ProjectRecordV1 transitionProject(WorkProjectAuthorityRuntime r,String id,ProjectLifecycle state,boolean override,long expected,String key)throws IOException{return r.transitionProject(meta(key,expected,"TransitionProject",id,state.name(),Boolean.toString(override)),id,state,override);}
    private static MilestoneRecordV1 upsertMilestone(WorkProjectAuthorityRuntime r,String id,String work,String project,String title,long weight,MilestoneStanding standing,String basis,Long expected,String key)throws IOException{return r.upsertMilestone(meta(key,expected,"UpsertMilestone",id,work,project,title,Long.toString(weight),standing.name(),basis),id,work,project,title,weight,standing,basis);}
    private static ManagementRecordV1 recordManagement(WorkProjectAuthorityRuntime r,String id,String work,String project,ManagementKind kind,String title,String standing,String owner,String source,Long expected,String key)throws IOException{return r.recordManagement(meta(key,expected,"RecordManagement",id,work,project,kind.name(),title,standing,owner,source),id,work,project,kind,title,standing,owner,source);}
    private static ProjectMemoryRefV1 addMemory(WorkProjectAuthorityRuntime r,String id,String work,String project,String memory,String authority,String purpose,String key)throws IOException{return r.addProjectMemoryRef(meta(key,null,"AddProjectMemoryRef",id,work,project,memory,authority,purpose),id,work,project,memory,authority,purpose);}
    private static WorkAssociationV1 associate(WorkProjectAuthorityRuntime r,String id,String work,AssociationKind kind,String ref,String owner,String version,String key)throws IOException{return r.associateExternal(meta(key,null,"AssociateExternalRef",id,work,kind.name(),ref,owner,version),id,work,kind,ref,owner,version);}
    private static WorkRecordV1 close(WorkProjectAuthorityRuntime r,String id,ClosureBasisV1 b,long expected,String key)throws IOException{return r.closeWork(meta(key,expected,"CloseWork",id,encodeClosureForTest(b)),id,b);}
    private static String encodeClosureForTest(ClosureBasisV1 b){return b.workId()+"|"+b.disposition()+"|"+b.authorityRef()+"|"+b.decisionOrReceiptRef()+"|"+(b.subjectDigest()==null?"<null>":b.subjectDigest())+"|"+b.recordedAt();}

    private static void ok(boolean value,String label){cases++;if(!value)throw new AssertionError("FAIL "+label);}
    private static void expect(Class<? extends Throwable> type,Throwing f,String label)throws Exception{cases++;try{f.run();throw new AssertionError("FAIL "+label+" expected "+type.getSimpleName());}catch(Throwable t){if(t instanceof AssertionError a)throw a;if(!type.isInstance(t))throw new AssertionError("FAIL "+label+" got "+t,t);}}
}
