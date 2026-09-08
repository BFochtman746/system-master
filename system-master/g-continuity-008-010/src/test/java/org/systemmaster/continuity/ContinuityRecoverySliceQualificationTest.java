package org.systemmaster.continuity;

import java.nio.file.*;
import java.time.Instant;
import java.util.*;

public final class ContinuityRecoverySliceQualificationTest {
    static int n=0;
    static final Instant T=Instant.parse("2026-09-08T21:10:00Z");
    public static void main(String[] args)throws Exception{
        testHandoff();
        testSignals();
        testCompatibilityMigrationHistory();
        System.out.println("ASSERTIONS="+n);
        System.out.println("PASS CONTINUITY-REPLACEMENT-SIGNALS-COMPAT requirements=13");
    }

    static void testHandoff()throws Exception{
        Path d=Files.createTempDirectory("handoff-");
        final HandoffCoordinator.RecoverySnapshot[] rs={new HandoffCoordinator.RecoverySnapshot(4,"state-d4","fence-4")};
        HandoffCoordinator.RecoveryAuthority recovery=w->rs[0];
        HandoffCoordinator.ActorAuthority actors=new HandoffCoordinator.ActorAuthority(){
            public boolean mayRecord(String a,String w,long e,Instant t){return a.equals("worker-A")&&e==rs[0].recoveryEpoch();}
            public boolean mayAdopt(String a,String w,long e,String target,Instant t){return a.equals("worker-B")&&target.equals("role-recovery")&&e==rs[0].recoveryEpoch();}
        };
        var c=new HandoffCoordinator(d,recovery,actors);
        var h=c.recordHandoff("work-1","worker-A","role-recovery","state-d4","cp-9",List.of("effect-1"),List.of("signal-1"),List.of("blocker-1"),T);
        e("work-1",h.workUnitId()); e(4L,h.recoveryEpoch()); e("worker-A",h.fromActorRef()); e("role-recovery",h.toRoleOrActorRef());
        e("state-d4",h.stateDigest()); e("cp-9",h.checkpointRef()); e(List.of("effect-1"),h.unresolvedEffectRefs()); e(List.of("signal-1"),h.pendingSignalRefs()); e(List.of("blocker-1"),h.blockerRefs());
        e(HandoffRecord.AdoptionState.PENDING,h.adoptionState()); t(h.handoffDigest().matches("[0-9a-f]{64}")); t(h.handoffId().startsWith("handoff-")); e(1L,h.version());
        var same=c.recordHandoff("work-1","worker-A","role-recovery","state-d4","cp-9",List.of("effect-1"),List.of("signal-1"),List.of("blocker-1"),T.plusSeconds(1));
        e(h.handoffId(),same.handoffId()); e(1L,same.version());
        var st=c.getHandoffState("work-1"); e(HandoffState.Freshness.CURRENT,st.freshness()); e(3,st.unresolvedObligations().size()); e(h.handoffId(),st.current().handoffId());
        var denied=c.adoptHandoff(h.handoffId(),"worker-X",4,T.plusSeconds(2)); e(HandoffRecord.AdoptionState.BLOCKED,denied.adoptionState());
        var blocked=c.getHandoffState("work-1").current(); e(HandoffRecord.AdoptionState.BLOCKED,blocked.adoptionState()); e(2L,blocked.version());
        var h2=c.recordHandoff("work-1","worker-A","role-recovery","state-d4","cp-10",List.of("effect-1"),List.of("signal-1"),List.of("blocker-1"),T.plusSeconds(3));
        var adopted=c.adoptHandoff(h2.handoffId(),"worker-B",4,T.plusSeconds(4)); e(HandoffRecord.AdoptionState.ADOPTED,adopted.adoptionState()); e("worker-B",adopted.adoptedByActorRef()); e(T.plusSeconds(4),adopted.adoptedAt());
        var idem=c.adoptHandoff(h2.handoffId(),"worker-B",4,T.plusSeconds(5)); e(adopted.version(),idem.version()); e(adopted.handoffDigest(),idem.handoffDigest());
        var c2=new HandoffCoordinator(d,recovery,actors); var afterRestart=c2.getHandoffState("work-1"); e(HandoffRecord.AdoptionState.ADOPTED,afterRestart.adoptionState()); e("worker-B",afterRestart.current().adoptedByActorRef()); e(3,afterRestart.unresolvedObligations().size());
        rs[0]=new HandoffCoordinator.RecoverySnapshot(5,"state-d5","fence-5"); e(HandoffState.Freshness.STALE,c2.getHandoffState("work-1").freshness());
        var stale=c2.adoptHandoff(h.handoffId(),"worker-B",5,T.plusSeconds(6)); e(HandoffRecord.AdoptionState.STALE,stale.adoptionState());
        x(()->c2.recordHandoff("work-1","worker-A","role-recovery","state-d4",null,List.of(),List.of(),List.of(),T.plusSeconds(7)));
        e(HandoffState.Freshness.UNAVAILABLE,c2.getHandoffState("work-missing").freshness());
    }

    static void testSignals()throws Exception{
        Path d=Files.createTempDirectory("signals-"); MockSignals auth=new MockSignals();
        auth.add("cancel-1","work-2",DurableSignalRef.Kind.CANCEL,1);auth.add("timer-1","work-2",DurableSignalRef.Kind.TIMER,2);auth.add("signal-1","work-2",DurableSignalRef.Kind.SIGNAL,3);auth.add("pause-1","work-2",DurableSignalRef.Kind.PAUSE,4);auth.add("wait-1","work-2",DurableSignalRef.Kind.WAIT,5);
        DurableSignalRecoveryAdapter.AttemptAuthority attempts=(w,a,f,t)->w.equals("work-2")&&a.equals("attempt-2")&&f==7;
        var r=new DurableSignalRecoveryAdapter(d,auth,attempts); var pending=r.getPendingDurableSignals("work-2"); e(5,pending.size()); e(DurableSignalRef.Kind.CANCEL,pending.get(0).kind()); e(DurableSignalRef.Kind.WAIT,pending.get(4).kind());
        var stale=r.recoverDurableSignal("cancel-1","work-2","attempt-old",6,T); e(DurableSignalRecoveryAdapter.Result.STALE,stale.result()); e(0,auth.consumeCalls);
        var consumed=r.recoverDurableSignal("cancel-1","work-2","attempt-2",7,T.plusSeconds(1)); e(DurableSignalRecoveryAdapter.Result.CONSUMED,consumed.result()); e(DurableSignalRef.DeliveryState.CONSUMED,consumed.binding().deliveryState()); e("attempt-2",consumed.binding().boundAttemptId()); e(7L,consumed.binding().boundFenceEpoch()); t(consumed.binding().consumptionReceiptDigest().matches("receipt-cancel-1")); e(1,auth.consumeCalls);
        var again=r.recoverDurableSignal("cancel-1","work-2","attempt-2",7,T.plusSeconds(2)); e(DurableSignalRecoveryAdapter.Result.ALREADY_CONSUMED,again.result()); e(1,auth.consumeCalls); e(consumed.binding().consumptionReceiptDigest(),again.binding().consumptionReceiptDigest());
        e(4,r.getPendingDurableSignals("work-2").size());
        var r2=new DurableSignalRecoveryAdapter(d,auth,attempts); e(DurableSignalRef.DeliveryState.CONSUMED,r2.getBinding("cancel-1").deliveryState()); e(4,r2.getPendingDurableSignals("work-2").size());
        var timer=r2.recoverDurableSignal("timer-1","work-2","attempt-2",7,T.plusSeconds(3)); e(DurableSignalRecoveryAdapter.Result.CONSUMED,timer.result()); e(2,auth.consumeCalls); e(3,r2.getPendingDurableSignals("work-2").size());
        x(()->r2.recoverDurableSignal("missing","work-2","attempt-2",7,T));
        byte[] bytes=Files.readAllBytes(r2.journalPath());bytes[bytes.length-2]^=1;Files.write(r2.journalPath(),bytes);x(()->new DurableSignalRecoveryAdapter(d,auth,attempts));
    }

    static void testCompatibilityMigrationHistory()throws Exception{
        Path d=Files.createTempDirectory("compat-");
        CheckpointManifest cp=cp("cp-1","schema-1","runtime-1",List.of("cap-A","cap-B"));
        CompatibilityResolver.CompatibilityAuthority authority=new CompatibilityResolver.CompatibilityAuthority(){
            public CompatibilityResolver.CompatibilityDecision resolve(CheckpointManifest s,CompatibilityResolver.TargetIdentity t){
                if(t.runtimeContractVersion().equals("runtime-2"))return new CompatibilityResolver.CompatibilityDecision(CompatibilityAssessment.Standing.MIGRATION_REQUIRED,List.of("runtime changed"),null,"mig-v2");
                if(t.runtimeContractVersion().equals("runtime-old"))return new CompatibilityResolver.CompatibilityDecision(CompatibilityAssessment.Standing.OLDER_RUNTIME_REQUIRED,List.of("old runtime required"),"runtime-1",null);
                return new CompatibilityResolver.CompatibilityDecision(CompatibilityAssessment.Standing.INCOMPATIBLE,List.of("no compatible path"),null,null);
            }
            public boolean migrationApproved(CheckpointManifest s,String contract,String target){return contract.equals("mig-v2")&&target.equals("schema-2");}
        };
        var c=new CompatibilityResolver(d,authority);
        var exact=c.assessRecoveryCompatibility(cp,new CompatibilityResolver.TargetIdentity("target-d1","runtime-1","schema-1",List.of("cap-A","cap-B","cap-C"),false),T);
        e(CompatibilityAssessment.Standing.COMPATIBLE,exact.standing()); t(exact.assessmentDigest().matches("[0-9a-f]{64}")); t(c.currentEnvironmentAllowedForNewDecision(exact,true)); f(c.currentEnvironmentAllowedForNewDecision(exact,false));
        var unknown=c.assessRecoveryCompatibility(cp,new CompatibilityResolver.TargetIdentity("target-u","runtime-1","schema-1",List.of(),true),T);e(CompatibilityAssessment.Standing.MANUAL,unknown.standing());f(c.currentEnvironmentAllowedForNewDecision(unknown,true));
        var mig=c.assessRecoveryCompatibility(cp,new CompatibilityResolver.TargetIdentity("target-m","runtime-2","schema-2",List.of("cap-A"),false),T);e(CompatibilityAssessment.Standing.MIGRATION_REQUIRED,mig.standing());e("mig-v2",mig.migrationContractVersion());t(c.currentEnvironmentAllowedForNewDecision(mig,true));
        var old=c.assessRecoveryCompatibility(cp,new CompatibilityResolver.TargetIdentity("target-o","runtime-old","schema-1",List.of(),false),T);e(CompatibilityAssessment.Standing.OLDER_RUNTIME_REQUIRED,old.standing());e("runtime-1",old.approvedRuntimeRef());
        var bad=c.assessRecoveryCompatibility(cp,new CompatibilityResolver.TargetIdentity("target-b","runtime-x","schema-x",List.of(),false),T);e(CompatibilityAssessment.Standing.INCOMPATIBLE,bad.standing());
        String originalDigest=cp.manifestDigest();
        x(()->c.migrateCheckpoint(cp,"mig-v2","schema-2",1,"chunk-1",false,false,T));
        x(()->c.migrateCheckpoint(cp,"bad-contract","schema-2",1,"chunk-1",false,true,T));
        var m1=c.migrateCheckpoint(cp,"mig-v2","schema-2",1,"chunk-1",false,true,T.plusSeconds(1)); e(MigrationCheckpoint.State.IN_PROGRESS,m1.state()); e(1L,m1.cursor()); e(1L,m1.version()); e(originalDigest,cp.manifestDigest());
        var m1idem=c.migrateCheckpoint(cp,"mig-v2","schema-2",1,"chunk-1",false,true,T.plusSeconds(2)); e(m1,m1idem);
        x(()->c.migrateCheckpoint(cp,"mig-v2","schema-2",1,"different",false,true,T));
        var c2=new CompatibilityResolver(d,authority); var persisted=c2.getMigration(m1.migrationId()); e(1L,persisted.cursor()); e(m1.accumulatedDigest(),persisted.accumulatedDigest());
        var m2=c2.migrateCheckpoint(cp,"mig-v2","schema-2",2,"chunk-2",false,true,T.plusSeconds(3)); e(2L,m2.cursor()); e(2L,m2.version()); t(!m2.accumulatedDigest().equals(m1.accumulatedDigest()));
        x(()->c2.migrateCheckpoint(cp,"mig-v2","schema-2",1,"chunk-1",false,true,T));
        var done=c2.migrateCheckpoint(cp,"mig-v2","schema-2",3,"chunk-3",true,true,T.plusSeconds(4)); e(MigrationCheckpoint.State.COMPLETED,done.state()); t(done.targetCheckpointId().startsWith("checkpoint-migrated-")); e(done.accumulatedDigest(),done.targetPayloadDigest()); e(originalDigest,cp.manifestDigest());
        var doneAgain=c2.migrateCheckpoint(cp,"mig-v2","schema-2",4,"ignored-after-complete",true,true,T.plusSeconds(5)); e(done,doneAgain);

        var hc=new HistoryCompactor(d,(w,seq,sref,sd)->w.equals("work-3")&&sref.equals("snapshot-30")&&sd.equals("snap-d30")&&seq==30);
        x(()->hc.rollHistorySegment("work-3",30,"snapshot-30","wrong",List.of("effect-1"),List.of("effect-1"),null,T));
        x(()->hc.rollHistorySegment("work-3",30,"snapshot-30","snap-d30",List.of("effect-1","decision-2"),List.of("effect-1"),null,T));
        var seg=hc.rollHistorySegment("work-3",30,"snapshot-30","snap-d30",List.of("effect-1","decision-2"),List.of("effect-1","decision-2","state-30"),null,T.plusSeconds(1));
        e(30L,seg.throughEventSeq()); t(seg.segmentDigest().matches("[0-9a-f]{64}")); e(3,seg.retainedEvidenceRefs().size()); e(null,seg.parentSegmentDigest());
        var segIdem=hc.rollHistorySegment("work-3",30,"snapshot-30","snap-d30",List.of("effect-1"),List.of("effect-1","decision-2","state-30"),null,T.plusSeconds(2)); e(seg.segmentId(),segIdem.segmentId()); e(seg.segmentDigest(),segIdem.segmentDigest());
        var hc2=new HistoryCompactor(d,(w,seq,sref,sd)->true); e(1,hc2.lineage("work-3").size()); e(seg.segmentDigest(),hc2.lineage("work-3").get(0).segmentDigest());
    }

    static CheckpointManifest cp(String id,String schema,String runtime,List<String> reqs){
        return new CheckpointManifest(id,"work-3",9,"SEMANTIC","boundary-9","payload-ref","payload-digest",schema,runtime,100,50,"attempt-9",12,T,reqs,"cp-0","manifest-digest-1");
    }

    static final class MockSignals implements DurableSignalRecoveryAdapter.SignalAuthority{
        final Map<String,DurableSignalRecoveryAdapter.AuthoritativeSignal> map=new LinkedHashMap<>();final Map<String,DurableSignalRecoveryAdapter.ConsumptionReceipt> consumed=new HashMap<>();int consumeCalls=0;
        void add(String id,String w,DurableSignalRef.Kind k,long seq){map.put(id,new DurableSignalRecoveryAdapter.AuthoritativeSignal(id,w,k,"payload-"+id,seq,T.plusSeconds(seq)));}
        public DurableSignalRecoveryAdapter.AuthoritativeSignal get(String id){return map.get(id);} public List<DurableSignalRecoveryAdapter.AuthoritativeSignal> pending(String w){List<DurableSignalRecoveryAdapter.AuthoritativeSignal>out=new ArrayList<>();for(var a:map.values())if(a.workUnitId().equals(w)&&!consumed.containsKey(a.signalId()))out.add(a);return out;}
        public DurableSignalRecoveryAdapter.ConsumptionReceipt consumeOnce(String id,String w,String attempt,long fence,Instant now){consumeCalls++;var old=consumed.get(id);if(old!=null)return new DurableSignalRecoveryAdapter.ConsumptionReceipt(id,w,DurableSignalRecoveryAdapter.ConsumptionStatus.ALREADY_CONSUMED,old.receiptDigest(),old.consumedAt());var r=new DurableSignalRecoveryAdapter.ConsumptionReceipt(id,w,DurableSignalRecoveryAdapter.ConsumptionStatus.CONSUMED,"receipt-"+id,now);consumed.put(id,r);return r;}
    }

    static void e(Object a,Object b){n++;if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);}static void t(boolean v){n++;if(!v)throw new AssertionError("expected true");}static void f(boolean v){n++;if(v)throw new AssertionError("expected false");}static void x(Runnable r){n++;try{r.run();throw new AssertionError("expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
