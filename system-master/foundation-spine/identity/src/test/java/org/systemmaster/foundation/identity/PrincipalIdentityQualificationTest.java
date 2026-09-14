package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;

public final class PrincipalIdentityQualificationTest {
    private static int tests;

    public static void main(String[] args) throws Exception {
        stablePrincipalAndAlias();
        aliasesNeverReplaceIdentity();
        aliasCollisionFailsAmbiguous();
        rawAliasPayloadRejected();
        lifecycleHistoryAndTerminalRetirement();
        mergeRequiresExplicitAdjudication();
        staleRevisionFailsClosed();
        idempotentReplayAndConflict();
        idempotentReplayAfterRestartCanonicalizesMapOrder();
        explicitMutationGateRequired();
        kindDoesNotGrantMutationAuthority();
        restartReplayPreservesState();
        corruptJournalFailsClosed();
        concurrentSamePrincipalRegistrationIsSingleWinner();
        concurrentAliasCollisionIsSingleWinner();
        disabledOrRetiredAliasUseBlocked();
        aliasValidityWindowEnforced();
        metadataBoundsEnforced();
        currentStatusStateMachineEnforced();
        noSecretShapedAliasStorage();
        historyIsImmutableProjection();
        System.out.println("PASS FOUNDATION_IDENTITY_OWP001 tests=" + tests);
    }

    private static RuntimeFixture fixture() throws IOException {
        Path dir = Files.createTempDirectory("identity-owp001-");
        IdentityJournalStore store = new IdentityJournalStore(dir.resolve("identity.journal"));
        IdentityMutationGate gate = IdentityMutationGate.exactBootstrapActor("foundation-bootstrap-admin");
        return new RuntimeFixture(store, new PrincipalRegistry(store, gate), new PrincipalAliasRegistry(store, gate), new PrincipalLifecycleService(store, gate));
    }

    private static MutationContext ctx(String id) { return new MutationContext(id, "foundation-bootstrap-admin", List.of("ref:bootstrap-authority-v1")); }
    private static RegisterPrincipalRequest register(String cmd, String id, String kind) {
        return new RegisterPrincipalRequest(ctx(cmd), id, new PrincipalKind(kind), PrincipalStatus.CANDIDATE,
                Map.of("label", id), List.of("ref:authority-root"), List.of("ref:evidence-register"));
    }
    private static Principal registerActive(RuntimeFixture f, String prefix, String id, String kind) throws Exception {
        Principal p=f.registry.registerPrincipal(register(prefix+"-register",id,kind)).principal();
        p=f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx(prefix+"-enroll"),id,p.currentRevision(),PrincipalStatus.ENROLLED,"proofing/workload evidence accepted",null,null,List.of("ref:enrollment-evidence"))).principal();
        return f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx(prefix+"-activate"),id,p.currentRevision(),PrincipalStatus.ACTIVE,"activation evidence accepted",null,null,List.of("ref:activation-evidence"))).principal();
    }
    private static String digest(String value) throws Exception {
        byte[] d = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder b = new StringBuilder("sha256:"); for(byte x:d)b.append(String.format("%02x",x)); return b.toString();
    }

    private static void stablePrincipalAndAlias() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"cmd1","p1","HUMAN");
        f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("cmd2"),"a1","p1",p.currentRevision(),"EMAIL",digest("a@example.com"),"local",Instant.now().minusSeconds(1),null));
        Principal resolved=f.aliases.resolvePrincipalAlias("EMAIL",digest("a@example.com"),"local",Instant.now());
        check(resolved.principalId().equals("p1"),"stable principal alias resolution");
    }
    private static void aliasesNeverReplaceIdentity() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"cmd1","p1","SERVICE");
        f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("cmd2"),"a1",p.principalId(),p.currentRevision(),"PROVIDER",digest("provider-42"),"idp",Instant.now().minusSeconds(1),null));
        Principal after=f.registry.getPrincipal("p1"); check(after.principalId().equals("p1") && after.currentRevision()==p.currentRevision()+1,"alias does not replace identity");
    }
    private static void aliasCollisionFailsAmbiguous() throws Exception {
        var f=fixture(); Principal p1=registerActive(f,"c1","p1","HUMAN"); Principal p2=registerActive(f,"c2","p2","HUMAN"); String d=digest("same");
        f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c3"),"a1","p1",p1.currentRevision(),"EMAIL",d,"local",Instant.now().minusSeconds(1),null));
        expect(ErrorCode.AMBIGUOUS,()->f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c4"),"a2","p2",p2.currentRevision(),"EMAIL",d,"local",Instant.now().minusSeconds(1),null)),"ambiguous alias collision");
    }
    private static void rawAliasPayloadRejected() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","HUMAN");
        expectArgument(()->f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c2"),"a1","p1",p.currentRevision(),"EMAIL","person@example.com","local",Instant.now(),null)),"raw alias payload rejected");
    }
    private static void lifecycleHistoryAndTerminalRetirement() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","HUMAN");
        p=f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c2"),"p1",p.currentRevision(),PrincipalStatus.SUSPENDED,"risk hold",null,null,List.of("ref:risk"))).principal();
        p=f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c3"),"p1",p.currentRevision(),PrincipalStatus.RETIRED,"retire",null,null,List.of("ref:retire"))).principal();
        final Principal retired=p; expect(ErrorCode.CONFLICT,()->f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c4"),"p1",retired.currentRevision(),PrincipalStatus.ACTIVE,"resurrect",null,null,List.of("ref:no"))),"retirement terminal");
        check(f.registry.getPrincipalHistory("p1").size()==5,"lifecycle history preserved");
    }
    private static void mergeRequiresExplicitAdjudication() throws Exception {
        var f=fixture(); Principal p1=registerActive(f,"c1","p1","HUMAN"); registerActive(f,"c2","p2","HUMAN");
        expect(ErrorCode.DENIED,()->f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c3"),"p1",p1.currentRevision(),PrincipalStatus.RETIRED,"merge","p2",null,List.of("ref:e"))),"merge requires adjudication");
        Principal merged=f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c4"),"p1",p1.currentRevision(),PrincipalStatus.RETIRED,"merge","p2","ref:adjudication-1",List.of("ref:e"))).principal(); check(merged.status()==PrincipalStatus.RETIRED,"explicit merge retires source");
    }
    private static void staleRevisionFailsClosed() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","SERVICE"); f.registry.revisePrincipal(new RevisePrincipalRequest(ctx("c2"),"p1",p.currentRevision(),Map.of("label","new"),"update",List.of("ref:update")));
        expect(ErrorCode.STALE_BASE,()->f.registry.revisePrincipal(new RevisePrincipalRequest(ctx("c3"),"p1",p.currentRevision(),Map.of("label","stale"),"stale",List.of("ref:stale"))),"stale OCC rejected");
    }
    private static void idempotentReplayAndConflict() throws Exception {
        var f=fixture(); RegisterPrincipalRequest r=register("same","p1","AGENT"); MutationResult a=f.registry.registerPrincipal(r); MutationResult b=f.registry.registerPrincipal(r); check(a.changed()&&!b.changed()&&a.journalRevision()==b.journalRevision(),"idempotent replay");
        expect(ErrorCode.CONFLICT,()->f.registry.registerPrincipal(register("same","p2","AGENT")),"same command different request conflict");
    }
    private static void idempotentReplayAfterRestartCanonicalizesMapOrder() throws Exception {
        var f=fixture();
        var first=new java.util.LinkedHashMap<String,String>(); first.put("b","2"); first.put("a","1");
        RegisterPrincipalRequest r1=new RegisterPrincipalRequest(ctx("stable-cmd"),"p1",new PrincipalKind("HUMAN"),PrincipalStatus.CANDIDATE,first,List.of("ref:z","ref:a"),List.of("ref:e2","ref:e1"));
        MutationResult firstResult=f.registry.registerPrincipal(r1);
        IdentityJournalStore restartedStore=new IdentityJournalStore(f.store.path());
        PrincipalRegistry restarted=new PrincipalRegistry(restartedStore,IdentityMutationGate.exactBootstrapActor("foundation-bootstrap-admin"));
        var second=new java.util.LinkedHashMap<String,String>(); second.put("a","1"); second.put("b","2");
        RegisterPrincipalRequest r2=new RegisterPrincipalRequest(ctx("stable-cmd"),"p1",new PrincipalKind("HUMAN"),PrincipalStatus.CANDIDATE,second,List.of("ref:a","ref:z"),List.of("ref:e1","ref:e2"));
        MutationResult replay=restarted.registerPrincipal(r2);
        check(firstResult.changed() && !replay.changed() && firstResult.journalRevision()==replay.journalRevision(),"restart idempotency canonicalizes unordered metadata/refs");
    }
    private static void explicitMutationGateRequired() throws Exception {
        Path dir=Files.createTempDirectory("identity-deny-"); IdentityJournalStore s=new IdentityJournalStore(dir.resolve("j")); PrincipalRegistry r=new PrincipalRegistry(s,IdentityMutationGate.denyAll());
        expect(ErrorCode.DENIED,()->r.registerPrincipal(register("c1","p1","HUMAN")),"deny-all default gate");
    }
    private static void kindDoesNotGrantMutationAuthority() throws Exception {
        Path dir=Files.createTempDirectory("identity-kind-"); IdentityJournalStore s=new IdentityJournalStore(dir.resolve("j")); PrincipalRegistry r=new PrincipalRegistry(s,IdentityMutationGate.exactBootstrapActor("admin")); MutationContext bad=new MutationContext("c1","service-root",List.of("ref:claimed"));
        expect(ErrorCode.DENIED,()->r.registerPrincipal(new RegisterPrincipalRequest(bad,"service-root",new PrincipalKind("SERVICE"),PrincipalStatus.CANDIDATE,Map.of(),List.of(),List.of())),"kind cannot self-grant");
    }
    private static void restartReplayPreservesState() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","WORKLOAD"); Path path=f.store.path(); IdentityJournalStore s2=new IdentityJournalStore(path); PrincipalRegistry r2=new PrincipalRegistry(s2,IdentityMutationGate.exactBootstrapActor("foundation-bootstrap-admin")); check(r2.getPrincipal("p1").equals(p),"restart replay preserves principal");
    }
    private static void corruptJournalFailsClosed() throws Exception {
        var f=fixture(); registerActive(f,"c1","p1","HUMAN"); byte[] b=Files.readAllBytes(f.store.path()); b[b.length-3]^=1; Files.write(f.store.path(),b); expect(ErrorCode.CORRUPT_STATE,()->f.store.load(),"corrupt journal fails closed");
    }
    private static void concurrentSamePrincipalRegistrationIsSingleWinner() throws Exception {
        var f=fixture(); CountDownLatch start=new CountDownLatch(1); AtomicInteger wins=new AtomicInteger(); List<Throwable> unexpected=new ArrayList<>(); List<Thread> threads=new ArrayList<>();
        for(int i=0;i<8;i++){final int n=i;Thread t=new Thread(()->{try{start.await();f.registry.registerPrincipal(register("c"+n,"p1","HUMAN"));wins.incrementAndGet();}catch(IdentityException e){if(e.code()!=ErrorCode.CONFLICT)unexpected.add(e);}catch(Throwable e){unexpected.add(e);}});threads.add(t);t.start();}
        start.countDown(); for(Thread t:threads)t.join(); check(unexpected.isEmpty()&&wins.get()==1,"concurrent registration single winner");
    }
    private static void concurrentAliasCollisionIsSingleWinner() throws Exception {
        var f=fixture(); Principal p1=registerActive(f,"r1","p1","HUMAN"); Principal p2=registerActive(f,"r2","p2","HUMAN"); String d=digest("shared"); CountDownLatch start=new CountDownLatch(1); AtomicInteger wins=new AtomicInteger(); List<Thread> ts=new ArrayList<>();
        for(int i=0;i<2;i++){final int n=i;Thread t=new Thread(()->{try{start.await();Principal p=n==0?p1:p2;f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("a"+n),"alias"+n,p.principalId(),p.currentRevision(),"EMAIL",d,"local",Instant.now().minusSeconds(1),null));wins.incrementAndGet();}catch(Exception ignored){}});ts.add(t);t.start();}start.countDown();for(Thread t:ts)t.join();check(wins.get()==1,"concurrent alias collision single winner");
    }
    private static void disabledOrRetiredAliasUseBlocked() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","HUMAN"); String d=digest("x"); p=f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c2"),"a1","p1",p.currentRevision(),"EMAIL",d,"local",Instant.now().minusSeconds(1),null)).principal(); f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c3"),"p1",p.currentRevision(),PrincipalStatus.DISABLED,"disable",null,null,List.of("ref:e"))); expect(ErrorCode.REVOKED,()->f.aliases.resolvePrincipalAlias("EMAIL",d,"local",Instant.now()),"disabled alias resolution blocked");
    }
    private static void aliasValidityWindowEnforced() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","HUMAN"); String d=digest("future"); f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c2"),"a1","p1",p.currentRevision(),"EMAIL",d,"local",Instant.now().plus(1,ChronoUnit.HOURS),null)); expect(ErrorCode.NOT_FOUND,()->f.aliases.resolvePrincipalAlias("EMAIL",d,"local",Instant.now()),"future alias not current");
    }
    private static void metadataBoundsEnforced() throws Exception {
        var f=fixture(); String huge="x".repeat(513); expectArgument(()->f.registry.registerPrincipal(new RegisterPrincipalRequest(ctx("c1"),"p1",new PrincipalKind("HUMAN"),PrincipalStatus.CANDIDATE,Map.of("label",huge),List.of("ref:authority-root"),List.of("ref:evidence-register"))),"metadata bounded");
    }
    private static void currentStatusStateMachineEnforced() throws Exception {
        var f=fixture(); Principal p=f.registry.registerPrincipal(new RegisterPrincipalRequest(ctx("c1"),"p1",new PrincipalKind("HUMAN"),PrincipalStatus.CANDIDATE,Map.of(),List.of("ref:authority-root"),List.of("ref:evidence-register"))).principal(); final Principal c=p; expect(ErrorCode.CONFLICT,()->f.lifecycle.changePrincipalStanding(new ChangePrincipalStandingRequest(ctx("c2"),"p1",c.currentRevision(),PrincipalStatus.ACTIVE,"skip enrollment",null,null,List.of("ref:e"))),"candidate cannot jump active");
    }
    private static void noSecretShapedAliasStorage() throws Exception {
        var f=fixture(); Principal p=registerActive(f,"c1","p1","SERVICE"); expectArgument(()->f.aliases.registerPrincipalAlias(new RegisterPrincipalAliasRequest(ctx("c2"),"a1","p1",p.currentRevision(),"TOKEN","secret-token-value","provider",Instant.now(),null)),"no raw credential alias payload");
    }
    private static void historyIsImmutableProjection() throws Exception {
        var f=fixture(); registerActive(f,"c1","p1","HUMAN"); List<PrincipalRevision> h=f.registry.getPrincipalHistory("p1"); boolean immutable=false; try{h.add(h.get(0));}catch(UnsupportedOperationException e){immutable=true;} check(immutable,"history immutable projection");
    }

    private static void check(boolean ok,String name){tests++;if(!ok)throw new AssertionError(name);}
    private static void expect(ErrorCode code, Throwing r,String name)throws Exception{tests++;try{r.run();throw new AssertionError(name+" did not fail");}catch(IdentityException e){if(e.code()!=code)throw new AssertionError(name+" expected "+code+" got "+e.code(),e);}}
    private static void expectArgument(Throwing r,String name)throws Exception{tests++;try{r.run();throw new AssertionError(name+" did not fail");}catch(IllegalArgumentException expected){}}
    @FunctionalInterface private interface Throwing{void run()throws Exception;}
    private record RuntimeFixture(IdentityJournalStore store, PrincipalRegistry registry, PrincipalAliasRegistry aliases, PrincipalLifecycleService lifecycle){}
}
