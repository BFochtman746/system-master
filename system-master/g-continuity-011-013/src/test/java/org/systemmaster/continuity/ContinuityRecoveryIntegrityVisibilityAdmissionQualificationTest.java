package org.systemmaster.continuity;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public final class ContinuityRecoveryIntegrityVisibilityAdmissionQualificationTest {
    private static int assertions=0;
    private static void ok(boolean v,String m){assertions++;if(!v)throw new AssertionError(m);}
    private static void eq(Object a,Object b,String m){assertions++;if(!java.util.Objects.equals(a,b))throw new AssertionError(m+" expected="+a+" actual="+b);}
    private static void throwsIt(Runnable r,String m){assertions++;try{r.run();throw new AssertionError(m);}catch(IllegalStateException|IllegalArgumentException expected){}}

    public static void main(String[] args) throws Exception {
        Path root=Files.createTempDirectory("continuity-011-013-");
        auth(); integrity(root); visibility(root); admission();
        System.out.println("ASSERTIONS="+assertions);
        System.out.println("PASS CONTINUITY-INTEGRITY-VISIBILITY-ADMISSION requirements=22");
    }
    private static void auth(){
        var probe=new RecoveryAuthorizationGate.AuthorityProbe(){public RecoveryAuthorizationGate.AuthorityState currentAuthority(String w,String p){return RecoveryAuthorizationGate.AuthorityState.ACTIVE;}public RecoveryAuthorizationGate.Eligibility currentEligibility(String w,String p){return RecoveryAuthorizationGate.Eligibility.ELIGIBLE;}public boolean cancellationRequested(String w){return false;}};
        var gate=new RecoveryAuthorizationGate(probe,r->RecoveryAuthorizationGate.SecretState.AVAILABLE);
        ok(gate.revalidateRecoveryAuthority("w1","p1",List.of("secret-ref:db")).allowed(),"current authority allows");
        ok(gate.validateCheckpointMaterial(new RecoveryAuthorizationGate.CheckpointMaterial("CONFIDENTIAL",List.of("secret-ref:db"),false)).allowed(),"reference only checkpoint");
        eq(RecoveryAuthorizationGate.Decision.DENY,gate.validateCheckpointMaterial(new RecoveryAuthorizationGate.CheckpointMaterial("CONFIDENTIAL",List.of(),true)).decision(),"inline sensitive denied");
        var cancel=new RecoveryAuthorizationGate(new RecoveryAuthorizationGate.AuthorityProbe(){public RecoveryAuthorizationGate.AuthorityState currentAuthority(String w,String p){return RecoveryAuthorizationGate.AuthorityState.ACTIVE;}public RecoveryAuthorizationGate.Eligibility currentEligibility(String w,String p){return RecoveryAuthorizationGate.Eligibility.ELIGIBLE;}public boolean cancellationRequested(String w){return true;}},r->RecoveryAuthorizationGate.SecretState.AVAILABLE);
        eq(RecoveryAuthorizationGate.Decision.DENY,cancel.authorizeSignalRecovery("w1","p1","sig",List.of()).decision(),"cancel outranks old plan");
        var revoked=new RecoveryAuthorizationGate(new RecoveryAuthorizationGate.AuthorityProbe(){public RecoveryAuthorizationGate.AuthorityState currentAuthority(String w,String p){return RecoveryAuthorizationGate.AuthorityState.REVOKED;}public RecoveryAuthorizationGate.Eligibility currentEligibility(String w,String p){return RecoveryAuthorizationGate.Eligibility.ELIGIBLE;}public boolean cancellationRequested(String w){return false;}},r->RecoveryAuthorizationGate.SecretState.AVAILABLE);
        eq(RecoveryAuthorizationGate.Decision.DENY,revoked.revalidateRecoveryAuthority("w1","old-attempt",List.of()).decision(),"old authority insufficient");
        var restricted=new RecoveryAuthorizationGate(new RecoveryAuthorizationGate.AuthorityProbe(){public RecoveryAuthorizationGate.AuthorityState currentAuthority(String w,String p){return RecoveryAuthorizationGate.AuthorityState.ACTIVE;}public RecoveryAuthorizationGate.Eligibility currentEligibility(String w,String p){return RecoveryAuthorizationGate.Eligibility.RESTRICTED;}public boolean cancellationRequested(String w){return false;}},r->RecoveryAuthorizationGate.SecretState.AVAILABLE);
        eq(RecoveryAuthorizationGate.Decision.DENY,restricted.revalidateRecoveryAuthority("w1","p1",List.of()).decision(),"eligibility restriction blocks");
        var missing=new RecoveryAuthorizationGate(probe,r->RecoveryAuthorizationGate.SecretState.MISSING);
        eq(RecoveryAuthorizationGate.Decision.DENY,missing.revalidateRecoveryAuthority("w1","p1",List.of("secret-ref:gone")).decision(),"missing secret blocks");
    }
    private static void integrity(Path root){
        var compat=(CheckpointAuthorities.CompatibilityAuthority)m->CheckpointAuthorities.CompatibilityStanding.COMPATIBLE;
        var v=new RecoveryIntegrityValidator(root.resolve("integrity"),compat,"v2");
        var valid=v.validateRecoveryIntegrity("r1","abc","abc",List.of(),List.of("ev:1"));ok(valid.valid(),"matching recovery integrity valid");
        var corrupt=v.validateRecoveryIntegrity("r2","abc","xyz",List.of(),List.of("ev:2"));eq(IntegrityFinding.FindingType.CORRUPT,corrupt.findingType(),"digest mismatch corrupt");ok(v.recoveryQuarantined("r2"),"corrupt recovery quarantined");
    }
    private static void visibility(Path root) throws Exception {
        Path registryRoot=root.resolve("registry");
        DurableWorkIdentityRegistry identities=new DurableWorkIdentityRegistry(registryRoot);
        identities.registerDurableWorkIdentity("task-vis","workflow-vis","stage-vis","w-vis","intent-vis","owner-vis");
        RecoveryRegistry registry=new RecoveryRegistry(registryRoot); var opened=registry.openRecovery("w-vis",1,"interrupt-1");
        RecoveryQueryService svc=new RecoveryQueryService(registry,(w,c)->RecoveryQueryService.CommandStanding.UNKNOWN,new RecoveryQueryService.TelemetryAuthority(){public boolean fresh(String w){return false;}public String detail(String w){return "unused";}});
        var p=svc.getRecoveryStatus("w-vis");eq("w-vis",p.workUnitId(),"reconnect by work identity");ok(!p.telemetryFresh(),"telemetry gap explicit");eq("OBSERVABILITY_GAP",p.telemetryDetail(),"gap label explicit");ok(p.progressBasis()!=null&&!p.progressBasis().isBlank(),"progress basis explicit");
        var rd=svc.reconnect("w-vis","cmd-unknown");ok(!rd.mayRecommand(),"unknown command not recommanded");eq("RECONCILE_BEFORE_RECOMMAND",rd.nextAction(),"reconcile first");
        AtomicInteger publishes=new AtomicInteger(); var pub=new ContinuityEvidencePublisher(root.resolve("evidence"),e->publishes.incrementAndGet()>1);
        var env=pub.record("w-vis","subject-digest","PORTABLE","qualification","payload-digest","ref:1");eq("w-vis",env.subjectRef(),"evidence subject");ok(env.observedAt()!=null,"evidence time");eq(1,pub.getRecoveryEvidence("w-vis").size(),"durable outbox query");var first=pub.backfill();eq(1,first.remaining(),"publisher outage retains outbox");var second=pub.backfill();eq(0,second.remaining(),"backfill clears after sink returns");
        throwsIt(()->new RecoveryClosureCoordinator(registry).markRecovered(opened.record().recoveryId(),opened.record().version(),List.of(),List.of(),"digest"),"recovered requires verification evidence");
    }
    private static void admission(){
        var policies=new ContinuityPolicyRegistry();throwsIt(()->new ContinuityPolicyRegistry.Policy("interactive",null,2,1,10,1000,Duration.ofSeconds(1)),"no universal checkpoint interval");
        policies.registerContinuityPolicy(new ContinuityPolicyRegistry.Policy("interactive",Duration.ofSeconds(30),2,1,10,1000,Duration.ofSeconds(1)));
        AtomicInteger authorityCalls=new AtomicInteger();var adapter=new RecoveryResourceAdapter(policies,(w,r,p)->{authorityCalls.incrementAndGet();return RecoveryResourceAdapter.AuthorityDecision.ADMIT;},"metrics-v1");
        var blocked=adapter.requestRecoveryAdmission("w-no-policy","absent","cpu",1);eq(RecoveryResourceAdapter.AdmissionState.BLOCKED_POLICY,blocked.state(),"absent policy conservative block");
        var a1=adapter.requestRecoveryAdmission("w-a","interactive","cpu",10);eq(RecoveryResourceAdapter.AdmissionState.ADMITTED,a1.state(),"021H admits");eq(1,authorityCalls.get(),"adapter delegates allocation authority");
        var a2=adapter.requestRecoveryAdmission("w-b","interactive","cpu",5);eq(RecoveryResourceAdapter.AdmissionState.QUEUED,a2.state(),"local pacing queues backlog");var backlog=adapter.getRecoveryBacklog();eq("metrics-v1",backlog.metricDefinitionVersion(),"metric version explicit");eq(1,backlog.queuedNow(),"backlog visible");ok(backlog.entries().get(0).ageSeconds()>=0,"backlog age visible");
    }
}
