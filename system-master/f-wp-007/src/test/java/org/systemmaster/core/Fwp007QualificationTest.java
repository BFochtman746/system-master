package org.systemmaster.core;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

public final class Fwp007QualificationTest {
    static int tests=0;
    static void check(boolean ok,String name){tests++;if(!ok)throw new AssertionError(name);}
    static void throwsLike(Class<? extends Throwable> type,String text,Throwing r,String name){tests++;try{r.run();throw new AssertionError(name+":NO_EXCEPTION");}catch(Throwable t){if(!type.isInstance(t)||!String.valueOf(t.getMessage()).contains(text))throw new AssertionError(name+":"+t,t);}}
    interface Throwing{void run()throws Exception;}

    static TimeEvidence trusted(Instant now){return new TimeEvidence(now,1,Duration.ofSeconds(2),TimeStanding.TRUSTED);}
    static GrantRef grant(String change,long rev,Set<String> targets,Instant exp){return new GrantRef("grant-"+change,change,rev,"exec","CHANGE_EXECUTE",targets,7,exp);}
    static CommandRequest req(String change,String key,String payload,GrantRef g,ExecutionLease l,Set<String> targets,ConflictDisposition policy){
        return new CommandRequest(change,g.revision(),"BEGIN",key,payload,g,l.epoch(),l.fenceToken(),targets,policy);
    }

    public static void main(String[] args)throws Exception{
        Path dir=Files.createTempDirectory("fwp007-"); Path journal=dir.resolve("journal.log"); Instant t=Instant.parse("2026-09-08T00:00:00Z");
        ChangeCoordinator c=new ChangeCoordinator(journal); Set<String> a=Set.of("svc:A"); GrantRef g=grant("C1",3,a,t.plusSeconds(300));
        ExecutionLease l=c.acquireLease("C1","worker-A",Duration.ofSeconds(60),t,trusted(t));
        check(l.epoch()==1,"first epoch"); check(c.currentLease("C1").fenceToken().equals(l.fenceToken()),"lease current");
        CommandReceipt r1=c.beginChange(req("C1","idem-1","p1",g,l,a,ConflictDisposition.REJECT),t.plusSeconds(1),trusted(t.plusSeconds(1)));
        check(r1.disposition()==ReplayDisposition.FIRST_APPLY,"first apply"); check(c.state("C1")==ExecutionState.RUNNING,"running");
        CommandReceipt replay=c.beginChange(req("C1","idem-1","p1",g,l,a,ConflictDisposition.REJECT),t.plusSeconds(2),trusted(t.plusSeconds(2)));
        check(replay.disposition()==ReplayDisposition.REPLAY_SAME_RESULT,"same replay"); check(replay.resultDigest().equals(r1.resultDigest()),"deterministic replay result");
        throwsLike(IllegalStateException.class,"IDEMPOTENCY_KEY_CONFLICT",()->c.beginChange(req("C1","idem-1","DIFFERENT",g,l,a,ConflictDisposition.REJECT),t.plusSeconds(2),trusted(t.plusSeconds(2))),"conflicting reuse");
        throwsLike(SecurityException.class,"UNTRUSTED_TIME",()->c.acquireLease("C2","w",Duration.ofSeconds(20),t,new TimeEvidence(t,2,Duration.ofSeconds(1),TimeStanding.UNTRUSTED)),"untrusted time");
        throwsLike(SecurityException.class,"TIME_SKEW_EXCEEDED",()->c.acquireLease("C2","w",Duration.ofSeconds(20),t.plusSeconds(10),trusted(t)),"bounded skew");

        ChangeCoordinator restarted=new ChangeCoordinator(journal);
        check(restarted.state("C1")==ExecutionState.RUNNING,"restart state reconstruction");
        check(restarted.currentLease("C1").epoch()==1,"restart lease reconstruction");
        CommandReceipt replayAfterRestart=restarted.beginChange(req("C1","idem-1","p1",g,restarted.currentLease("C1"),a,ConflictDisposition.REJECT),t.plusSeconds(3),trusted(t.plusSeconds(3)));
        check(replayAfterRestart.disposition()==ReplayDisposition.REPLAY_SAME_RESULT,"restart idempotency replay"); check(replayAfterRestart.resultDigest().equals(r1.resultDigest()),"restart result stable");

        ExecutionLease l2=restarted.acquireLease("C1","worker-B",Duration.ofSeconds(60),t.plusSeconds(4),trusted(t.plusSeconds(4)));
        check(l2.epoch()==2,"new epoch after handoff");
        throwsLike(SecurityException.class,"FENCED_STALE_EXECUTOR",()->restarted.beginChange(req("C1","idem-2","p2",g,l,a,ConflictDisposition.REJECT),t.plusSeconds(5),trusted(t.plusSeconds(5))),"stale executor fenced");
        CommandReceipt r2=restarted.beginChange(req("C1","idem-2","p2",g,l2,a,ConflictDisposition.REJECT),t.plusSeconds(5),trusted(t.plusSeconds(5)));
        check(r2.epoch()==2,"new executor mutation");

        Set<String>b=Set.of("svc:A","svc:B"); GrantRef g2=grant("C2",1,b,t.plusSeconds(300)); ExecutionLease c2l=restarted.acquireLease("C2","worker-C",Duration.ofSeconds(60),t.plusSeconds(6),trusted(t.plusSeconds(6)));
        throwsLike(IllegalStateException.class,"TARGET_CONFLICT:REJECT",()->restarted.beginChange(req("C2","c2-1","x",g2,c2l,b,ConflictDisposition.REJECT),t.plusSeconds(7),trusted(t.plusSeconds(7))),"overlap reject");
        CommandReceipt compatible=restarted.beginChange(req("C2","c2-2","x2",g2,c2l,b,ConflictDisposition.COMPATIBLE_COMPOSITE),t.plusSeconds(7),trusted(t.plusSeconds(7)));
        check(compatible.state()==ExecutionState.RUNNING,"compatible composite accepted");

        ExternalEffectIntent intent=restarted.recordExternalIntent("C1",3,l2.epoch(),l2.fenceToken(),"step-1","svc:A","effect-payload","effect-key",t.plusSeconds(8));
        check(restarted.effectStanding(intent.intentId())==EffectStanding.INTENT_RECORDED,"intent durable before effect"); check(!restarted.canRetryIntent(intent.intentId()),"intent not retry safe by default");
        restarted.recordExternalObservation(new ExternalEffectObservation(intent.intentId(),EffectStanding.UNKNOWN,null,t.plusSeconds(9)));
        check(restarted.state("C1")==ExecutionState.PENDING_RECONCILIATION,"unknown enters reconciliation"); check(!restarted.canRetryIntent(intent.intentId()),"unknown retry blocked");
        throwsLike(IllegalStateException.class,"RECONCILIATION_REQUIRED",()->restarted.beginChange(req("C1","idem-3","p3",g,l2,a,ConflictDisposition.REJECT),t.plusSeconds(10),trusted(t.plusSeconds(10))),"unknown blocks next effect");

        ChangeCoordinator crashDuringUnknown=new ChangeCoordinator(journal);
        check(crashDuringUnknown.state("C1")==ExecutionState.PENDING_RECONCILIATION,"unknown survives crash");
        check(crashDuringUnknown.effectStanding(intent.intentId())==EffectStanding.UNKNOWN,"unknown standing survives crash");
        check(crashDuringUnknown.unresolvedEffects("C1").contains(intent.intentId()),"unresolved intent reconstructs");
        ReconciliationDecision notApplied=new ReconciliationDecision(intent.intentId(),EffectStanding.NOT_APPLIED,true,"evidence-not-applied",null);
        crashDuringUnknown.reconcile(notApplied);
        check(crashDuringUnknown.effectStanding(intent.intentId())==EffectStanding.NOT_APPLIED,"reconciled not applied"); check(crashDuringUnknown.canRetryIntent(intent.intentId()),"retry only after reconciliation"); check(crashDuringUnknown.state("C1")==ExecutionState.RUNNING,"resume after reconciliation");

        ExternalEffectIntent appliedIntent=crashDuringUnknown.recordExternalIntent("C1",3,l2.epoch(),l2.fenceToken(),"step-2","svc:A","effect2","effect-key2",t.plusSeconds(11));
        crashDuringUnknown.recordExternalObservation(new ExternalEffectObservation(appliedIntent.intentId(),EffectStanding.APPLIED,"receipt-applied",t.plusSeconds(12)));
        check(crashDuringUnknown.effectStanding(appliedIntent.intentId())==EffectStanding.APPLIED,"applied receipt standing"); check(!crashDuringUnknown.canRetryIntent(appliedIntent.intentId()),"applied not retry safe");

        crashDuringUnknown.pause("C1",l2.epoch(),l2.fenceToken(),t.plusSeconds(13)); check(crashDuringUnknown.state("C1")==ExecutionState.PAUSED,"pause state");
        throwsLike(IllegalStateException.class,"CHANGE_NOT_EXECUTABLE:PAUSED",()->crashDuringUnknown.beginChange(req("C1","idem-4","p4",g,l2,a,ConflictDisposition.REJECT),t.plusSeconds(14),trusted(t.plusSeconds(14))),"pause blocks next boundary");
        ExecutionLease l3=crashDuringUnknown.acquireLease("C1","worker-D",Duration.ofSeconds(60),t.plusSeconds(15),trusted(t.plusSeconds(15))); check(l3.epoch()==3,"resume handoff epoch");
        crashDuringUnknown.cancel("C1",l3.epoch(),l3.fenceToken(),t.plusSeconds(16)); check(crashDuringUnknown.state("C1")==ExecutionState.CANCELLED,"cancel distinct terminal"); check(crashDuringUnknown.effectStanding(appliedIntent.intentId())==EffectStanding.APPLIED,"cancel preserves committed effect");

        Set<String> cTargets=Set.of("svc:C"); GrantRef g3=grant("C3",1,cTargets,t.plusSeconds(300)); ExecutionLease c3l=crashDuringUnknown.acquireLease("C3","worker-E",Duration.ofSeconds(60),t.plusSeconds(17),trusted(t.plusSeconds(17)));
        crashDuringUnknown.beginChange(req("C3","c3-1","payload",g3,c3l,cTargets,ConflictDisposition.REJECT),t.plusSeconds(18),trusted(t.plusSeconds(18)));
        ExternalEffectIntent div=crashDuringUnknown.recordExternalIntent("C3",1,c3l.epoch(),c3l.fenceToken(),"step-x","svc:C","z","z-key",t.plusSeconds(19));
        crashDuringUnknown.recordExternalObservation(new ExternalEffectObservation(div.intentId(),EffectStanding.DIVERGED,null,t.plusSeconds(20)));
        check(crashDuringUnknown.state("C3")==ExecutionState.PENDING_RECONCILIATION,"diverged blocks progression");
        ReconciliationDecision compensated=new ReconciliationDecision(div.intentId(),EffectStanding.COMPENSATED,false,"comp-evidence",null); crashDuringUnknown.reconcile(compensated);
        check(crashDuringUnknown.effectStanding(div.intentId())==EffectStanding.COMPENSATED,"compensated reconciliation"); check(!crashDuringUnknown.canRetryIntent(div.intentId()),"compensation no blind retry");
        crashDuringUnknown.complete("C3",c3l.epoch(),c3l.fenceToken(),t.plusSeconds(21)); check(crashDuringUnknown.state("C3")==ExecutionState.COMPLETED,"complete only after resolved effects");

        throwsLike(SecurityException.class,"GRANT_TARGET_MISMATCH",()->{
            Set<String> wrong=Set.of("svc:Z"); crashDuringUnknown.beginChange(new CommandRequest("C4",1,"BEGIN","bad-target","p",grant("C4",1,wrong,t.plusSeconds(300)),1,"f",Set.of("svc:Y"),ConflictDisposition.REJECT),t.plusSeconds(22),trusted(t.plusSeconds(22)));},"grant target exact");
        GrantRef expired=grant("C5",1,Set.of("svc:E"),t.minusSeconds(1)); ExecutionLease c5l=crashDuringUnknown.acquireLease("C5","w",Duration.ofSeconds(20),t.plusSeconds(23),trusted(t.plusSeconds(23)));
        throwsLike(SecurityException.class,"GRANT_EXPIRED",()->crashDuringUnknown.beginChange(req("C5","expired","p",expired,c5l,Set.of("svc:E"),ConflictDisposition.REJECT),t.plusSeconds(23),trusted(t.plusSeconds(23))),"expired grant");

        ChangeCoordinator finalRestart=new ChangeCoordinator(journal);
        check(finalRestart.state("C3")==ExecutionState.COMPLETED,"completed survives restart"); check(finalRestart.state("C1")==ExecutionState.CANCELLED,"cancel survives restart");
        check(finalRestart.effectStanding(div.intentId())==EffectStanding.COMPENSATED,"reconciliation survives restart"); check(finalRestart.currentLease("C1").epoch()==3,"highest epoch survives restart");
        System.out.println("PASS F-WP-007 tests="+tests+" requirements=9");
    }
}
