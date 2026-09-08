package org.systemmaster.continuity;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class Gwp007QualificationTest {
    static int n=0;
    public static void main(String[] args) throws Exception {
        Path d=Files.createTempDirectory("gwp007-");
        var auth=(ExternalEffectRecoveryCoordinator.Authorizer)(p,r,a,t)->a.equals("auth-ok")&&p.equals("provider-A");
        var c=new ExternalEffectRecoveryCoordinator(d,auth);
        var p=ExternalEffectRecoveryItem.ReconciliationPolicy.IDEMPOTENT_KEY;
        var i=c.registerEffect("effect-1","work-1","op-A","key-1","provider-A",p,List.of("intent-e1"));
        e("effect-1",i.effectId()); e("work-1",i.workUnitId()); e("op-A",i.operationDigest()); e("key-1",i.idempotencyKey());
        e(ExternalEffectRecoveryItem.State.PENDING,i.state()); t(i.blocksReplay()); e(1L,i.version());
        e(i,c.registerEffect("effect-1","work-1","op-A","key-1","provider-A",p,List.of("intent-e1")));
        x(()->c.registerEffect("effect-1","work-1","op-B","key-1","provider-A",p,List.of()));
        x(()->c.registerEffect("effect-2","work-1","op-B","key-1","provider-A",p,List.of()));
        x(()->c.registerEffect("effect-3","work-1","op-A","key-1","provider-B",p,List.of()));
        var q=c.registerEffect("effect-q","work-1","op-Q",null,"provider-A",ExternalEffectRecoveryItem.ReconciliationPolicy.QUERYABLE,List.of());
        e(null,q.idempotencyKey()); x(()->c.registerEffect("effect-bad","work-1","op-X",null,"provider-A",p,List.of()));
        e(2,c.listUnknownExternalEffects("work-1").size()); f(c.pureReplayAllowed("work-1"));
        e(ExternalEffectRecoveryCoordinator.Disposition.BLOCK_REPLAY,c.replayDecision("effect-1","work-1").disposition());
        x(()->c.replayDecision("effect-1","work-2"));

        Instant t0=Instant.parse("2026-09-08T19:00:00Z");
        String od=ExternalEffectRecoveryCoordinator.digest("effect-1","recovery-1","provider-A",ExternalEffectRecoveryItem.State.UNKNOWN,null,"auth-ok",t0,List.of("query-1"));
        var o=new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.UNKNOWN,null,"auth-ok",t0,List.of("query-1"),od);
        var r=c.reconcileExternalEffect("effect-1","recovery-1",o);
        e(ExternalEffectRecoveryItem.State.UNKNOWN,r.resultingState()); e(2L,r.itemVersion()); e(od,r.observationDigest()); t(r.evidenceDigest().matches("[0-9a-f]{64}"));
        e(r,c.reconcileExternalEffect("effect-1","recovery-1",o));
        e(ExternalEffectRecoveryItem.State.UNKNOWN,c.get("effect-1").state()); e(2L,c.get("effect-1").version());
        x(()->c.reconcileExternalEffect("effect-1","recovery-1",new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.UNKNOWN,null,"auth-no",t0,List.of(),od)));
        x(()->c.reconcileExternalEffect("missing","recovery-1",o));

        Instant t1=t0.plusSeconds(1);
        String applied=ExternalEffectRecoveryCoordinator.digest("effect-1","recovery-1","provider-A",ExternalEffectRecoveryItem.State.CONFIRMED_APPLIED,"receipt-77","auth-ok",t1,List.of("receipt-evidence"));
        var ar=c.reconcileExternalEffect("effect-1","recovery-1",new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.CONFIRMED_APPLIED,"receipt-77","auth-ok",t1,List.of("receipt-evidence"),applied));
        e(ExternalEffectRecoveryItem.State.CONFIRMED_APPLIED,ar.resultingState()); e("receipt-77",ar.externalReceiptRef()); e(3L,ar.itemVersion());
        var rd=c.replayDecision("effect-1","work-1"); e(ExternalEffectRecoveryCoordinator.Disposition.CONSUME_RECEIPT,rd.disposition()); e("receipt-77",rd.receipt()); e(3L,rd.version()); t(rd.reason().contains("DO_NOT_REISSUE"));
        x(()->c.reconcileExternalEffect("effect-1","recovery-1",new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.PENDING,null,"auth-ok",t1.plusSeconds(1),List.of("x"),ExternalEffectRecoveryCoordinator.digest("effect-1","recovery-1","provider-A",ExternalEffectRecoveryItem.State.PENDING,null,"auth-ok",t1.plusSeconds(1),List.of("x")))));

        Instant tq=t1.plusSeconds(1);
        String notApplied=ExternalEffectRecoveryCoordinator.digest("effect-q","recovery-1","provider-A",ExternalEffectRecoveryItem.State.CONFIRMED_NOT_APPLIED,null,"auth-ok",tq,List.of("not-applied"));
        c.reconcileExternalEffect("effect-q","recovery-1",new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.CONFIRMED_NOT_APPLIED,null,"auth-ok",tq,List.of("not-applied"),notApplied));
        e(ExternalEffectRecoveryCoordinator.Disposition.ALLOW_NEW_EFFECT_ACTIVITY,c.replayDecision("effect-q","work-1").disposition());
        t(c.replayDecision("effect-q","work-1").reason().contains("OUTSIDE_PURE_REPLAY"));
        t(c.pureReplayAllowed("work-1")); e(0,c.listUnknownExternalEffects("work-1").size());

        var c2=new ExternalEffectRecoveryCoordinator(d,auth);
        e(ExternalEffectRecoveryItem.State.CONFIRMED_APPLIED,c2.get("effect-1").state()); e("receipt-77",c2.get("effect-1").externalReceiptRef());
        e("provider-A",c2.get("effect-1").providerRef()); t(c2.get("effect-1").evidenceRefs().contains("receipt-evidence"));
        e(ExternalEffectRecoveryCoordinator.Disposition.CONSUME_RECEIPT,c2.replayDecision("effect-1","work-1").disposition());
        e(ExternalEffectRecoveryItem.State.CONFIRMED_NOT_APPLIED,c2.get("effect-q").state());
        t(Files.size(c2.journalPath())>0);
        byte[] bytes=Files.readAllBytes(c2.journalPath()); bytes[bytes.length-2]^=1; Files.write(c2.journalPath(),bytes);
        x(()->new ExternalEffectRecoveryCoordinator(d,auth));

        Path d2=Files.createTempDirectory("gwp007-div-"); var c3=new ExternalEffectRecoveryCoordinator(d2,auth);
        c3.registerEffect("effect-d","work-d","op-D","key-D","provider-A",p,List.of());
        Instant td=t0.plusSeconds(5); String div=ExternalEffectRecoveryCoordinator.digest("effect-d","recovery-d","provider-A",ExternalEffectRecoveryItem.State.DIVERGED,null,"auth-ok",td,List.of("div"));
        c3.reconcileExternalEffect("effect-d","recovery-d",new ExternalEffectRecoveryCoordinator.Observation(ExternalEffectRecoveryItem.State.DIVERGED,null,"auth-ok",td,List.of("div"),div));
        e(ExternalEffectRecoveryCoordinator.Disposition.BLOCK_REPLAY,c3.replayDecision("effect-d","work-d").disposition()); f(c3.pureReplayAllowed("work-d"));
        t(!java.util.Arrays.stream(ExternalEffectRecoveryCoordinator.class.getDeclaredMethods()).anyMatch(m->m.getName().toLowerCase().contains("execute")));
        t(!java.util.Arrays.stream(ExternalEffectRecoveryCoordinator.class.getDeclaredMethods()).anyMatch(m->m.getName().toLowerCase().contains("providercall")));

        if(n!=50) throw new AssertionError("TEST_COUNT="+n);
        System.out.println("PASS G-WP-007 tests=50 requirements=6");
    }
    static void e(Object a,Object b){n++;if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);} static void t(boolean v){n++;if(!v)throw new AssertionError();} static void f(boolean v){t(!v);} static void x(Runnable r){n++;try{r.run();throw new AssertionError("expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
