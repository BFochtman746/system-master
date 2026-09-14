package org.systemmaster.foundation.contracts;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.systemmaster.foundation.contracts.ContractAuthorityRuntime.*;

public final class ContractAuthorityQualificationTest {
    static int cases;
    static final String A="a".repeat(64), B="b".repeat(64), C="c".repeat(64), D="d".repeat(64), E="e".repeat(64);
    static final SemanticVersion V100=new SemanticVersion(1,0,0), V110=new SemanticVersion(1,1,0), V120=new SemanticVersion(1,2,0), V200=new SemanticVersion(2,0,0);

    public static void main(String[] args) throws Exception {
        c("1 create subject",()->{var x=fresh(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); var s=x.subject("S1"); eq("S1",s.subjectId()); eq(1L,x.runtime.registryRevision());});
        c("2 exact subject replay",()->{var x=fresh(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); var s=x.subject("S1"); long r=x.runtime.registryRevision(); eq(s,x.runtime.createSubject("subject",-1,s)); eq(r,x.runtime.registryRevision());});
        c("3 conflicting subject replay",()->{var x=fresh(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.subject("S1"); code("COMMAND_REPLAY_CONFLICT",()->x.runtime.createSubject("subject",-1,new ContractSubjectV1("S2",ContractKind.API,"CORE","CUSTOM","SEMVER","T0")));});
        c("4 create version",()->{var x=base(); var v=x.version("v1",V100,A,null); eq(A,v.schemaDigest());});
        c("5 exact version replay",()->{var x=base(); var v=x.version("v1",V100,A,null); long r=x.runtime.registryRevision(); eq(v,x.runtime.registerVersion("v1",-1,new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"),null)); eq(r,x.runtime.registryRevision());});
        c("6 same version different digest conflict",()->{var x=base(); x.version("v1",V100,A,null); code("VERSION_IDENTITY_CONFLICT",()->x.runtime.registerVersion("v2",-1,new VersionDraft("S",V100,B,"CANON-1","artifact://b"),null));});
        c("7 invalid digest rejects without mutation",()->{var x=base(); long r=x.runtime.registryRevision(); throwsAny(IllegalArgumentException.class,()->new VersionDraft("S",V100,"bad","CANON-1","artifact://x")); eq(r,x.runtime.registryRevision());});
        c("8 unknown semantic owner rejects without mutation",()->{var x=fresh(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); long r=x.runtime.registryRevision(); code("SEMANTIC_OWNER_UNKNOWN",()->x.runtime.createSubject("bad",-1,new ContractSubjectV1("S",ContractKind.API,"NOPE","CUSTOM","SEMVER","T0"))); eq(r,x.runtime.registryRevision());});
        c("9 unknown canonicalizer rejects without mutation",()->{var x=base(); long r=x.runtime.registryRevision(); code("UNKNOWN_CANONICALIZATION",()->x.runtime.registerVersion("v",-1,new VersionDraft("S",V100,A,"UNKNOWN","artifact://x"),null)); eq(r,x.runtime.registryRevision());});
        c("10 rejected major migration leaves state unchanged",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.COMPATIBLE); long r=x.runtime.registryRevision(); code("MIGRATION_EDGE_REQUIRED",()->x.runtime.registerVersion("v2",-1,new VersionDraft("S",V200,B,"CANON-1","artifact://b"),null)); eq(r,x.runtime.registryRevision()); eq(GateStanding.REJECTED,x.runtime.resolveForMutation("S",V200,B).standing());});
        c("11 backward compatible evolution",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.COMPATIBLE); eq(B,x.version("v11",V110,B,null).schemaDigest());});
        c("12 backward incompatible evolution",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.INCOMPATIBLE); code("INCOMPATIBLE_EVOLUTION",()->x.version("v11",V110,B,null));});
        c("13 forward compatible evolution",()->{var x=fixture(CompatibilityMode.FORWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.FORWARD,A,B,Decision.COMPATIBLE); eq(B,x.version("v11",V110,B,null).schemaDigest());});
        c("14 forward incompatible evolution",()->{var x=fixture(CompatibilityMode.FORWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.FORWARD,A,B,Decision.INCOMPATIBLE); code("INCOMPATIBLE_EVOLUTION",()->x.version("v11",V110,B,null));});
        c("15 full compatible evolution",()->{var x=fixture(CompatibilityMode.FULL,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.FULL,A,B,Decision.COMPATIBLE); eq(B,x.version("v11",V110,B,null).schemaDigest());});
        c("16 full failure on one direction",()->{var x=fixture(CompatibilityMode.FULL,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.FULL,A,B,Decision.INCOMPATIBLE); code("INCOMPATIBLE_EVOLUTION",()->x.version("v11",V110,B,null));});
        c("17 latest-only evaluation",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.COMPATIBLE); x.version("v11",V110,B,null); x.validator.decide(CompatibilityMode.BACKWARD,B,C,Decision.COMPATIBLE).decide(CompatibilityMode.BACKWARD,A,C,Decision.INCOMPATIBLE); eq(C,x.version("v12",V120,C,null).schemaDigest());});
        c("18 transitive detects older incompatibility",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.TRANSITIVE); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.COMPATIBLE); x.version("v11",V110,B,null); x.validator.decide(CompatibilityMode.BACKWARD,B,C,Decision.COMPATIBLE).decide(CompatibilityMode.BACKWARD,A,C,Decision.INCOMPATIBLE); code("INCOMPATIBLE_EVOLUTION",()->x.version("v12",V120,C,null));});
        c("19 same-major incompatible rejected",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.INCOMPATIBLE); code("INCOMPATIBLE_EVOLUTION",()->x.version("same-major",V110,B,null));});
        c("20 different-major compatible still migration gated",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.decide(CompatibilityMode.BACKWARD,A,B,Decision.COMPATIBLE); code("MIGRATION_EDGE_REQUIRED",()->x.version("major",V200,B,null));});
        c("21 validator unavailable fail closed",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); code("VALIDATOR_UNAVAILABLE",()->x.version("v11",V110,B,null));});
        c("22 validator error fail closed",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.validator.throwError(true); code("VALIDATOR_ERROR",()->x.version("v11",V110,B,null));});
        c("23 decision digest reproducible",()->{var x=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); var g1=x.runtime.resolveForMutation("S",V100,A); var y=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); var g2=y.runtime.resolveForMutation("S",V100,A); eq(g1.compatibilityDecisionDigest(),g2.compatibilityDecisionDigest()); truth(g1.compatibilityDecisionDigest().matches("[0-9a-f]{64}"));});
        c("24 gate carries no foreign authority",()->{Set<String> names=new HashSet<>(); for(var rc:GateReceipt.class.getRecordComponents())names.add(rc.getName()); for(String forbidden:List.of("principalAuthority","effectAuthority","routeAuthority","placementAuthority","leaseAuthority","fenceAuthority")) falsehood(names.contains(forbidden));});
        c("25 exact migration edge creation",()->{var x=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); var e=edge(V100,A,V110,B,C); eq(e,x.runtime.registerMigrationEdge("edge",-1,e));});
        c("26 conflicting edge digest rejected",()->{var x=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); var e=edge(V100,A,V110,B,C); x.runtime.registerMigrationEdge("edge",-1,e); var bad=edge(V100,A,V110,B,D); code("MIGRATION_EDGE_CONFLICT",()->x.runtime.registerMigrationEdge("edge2",-1,bad));});
        c("27 wrong from digest rejected",()->{var x=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); var bad=edge(V100,D,V110,B,C); code("MIGRATION_EDGE_CONFLICT",()->x.runtime.registerMigrationEdge("edge",-1,bad));});
        c("28 checkpoint binding mismatch rejected",()->{var cp=new MigrationCheckpointV1(3,A,B,"MIG-1"); verifyMigrationCheckpoint(cp,A,B,"MIG-1"); code("MIGRATION_CHECKPOINT_MISMATCH",()->verifyMigrationCheckpoint(cp,A,C,"MIG-1"));});
        c("29 ambiguous legacy mapping quarantined",()->{var x=base(); eq(LegacyStanding.QUARANTINED_AMBIGUOUS,x.runtime.bindLegacy("OLD","1",List.of("S1","S2"),"CORE").standing());});
        c("30 stale owner legacy mapping quarantined",()->{var x=base(); eq(LegacyStanding.STALE_OWNER,x.runtime.bindLegacy("OLD","1",List.of("S"),"RETIRED").standing());});
        c("31 deprecated explicit standing",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.runtime.setLifecycle("lc",-1,new ContractLifecycleV1("S",V100,LifecycleStanding.DEPRECATED,"S@2.0.0","T1",List.of("REPLACED"))); var g=x.runtime.resolveForMutation("S",V100,A); eq(GateStanding.ADMITTED,g.standing()); eq(LifecycleStanding.DEPRECATED,g.lifecycleStanding()); truth(g.reasonCodes().contains("CONTRACT_DEPRECATED"));});
        c("32 sunset blocks mutation and preserves history",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.runtime.setLifecycle("lc",-1,new ContractLifecycleV1("S",V100,LifecycleStanding.SUNSET,null,"T1",List.of("SUNSET"))); var g=x.runtime.resolveForMutation("S",V100,A); eq(GateStanding.REJECTED,g.standing()); eq(A,g.requestedDigest()); truth(x.runtime.registryRevision()>=4);});
        c("33 replay reconstructs exact state",()->{var x=twoVersion(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST,A,B); long r=x.runtime.registryRevision(); var reopened=new ContractAuthorityRuntime(x.dir,owners(),canonicalizers(),List.of(x.validator)); eq(r,reopened.registryRevision()); eq(GateStanding.ADMITTED,reopened.resolveForMutation("S",V110,B).standing());});
        c("34 command replay same result",()->{var x=base(); var d=new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"); var a=x.runtime.registerVersion("cmd",-1,d,null); long r=x.runtime.registryRevision(); var b=x.runtime.registerVersion("cmd",-1,d,null); eq(a,b); eq(r,x.runtime.registryRevision());});
        c("35 command id changed payload conflicts",()->{var x=base(); x.runtime.registerVersion("cmd",-1,new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"),null); code("COMMAND_REPLAY_CONFLICT",()->x.runtime.registerVersion("cmd",-1,new VersionDraft("S",V110,B,"CANON-1","artifact://b"),null));});
        c("36 corrupt event fails replay",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.runtime.corruptLastByteForTest(); code("REGISTRY_CORRUPT",x.runtime::registryRevision);});
        c("37 truncated event fails replay",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.runtime.truncateLastByteForTest(); code("REGISTRY_CORRUPT",x.runtime::registryRevision);});
        c("38 hash-chain break fails replay",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); Path j=x.dir.resolve("contracts.journal"); var lines=Files.readAllLines(j,StandardCharsets.UTF_8); String[] p=lines.get(1).split("\\|",6); p[1]="f".repeat(64); lines.set(1,String.join("|",p)); Files.writeString(j,String.join("\n",lines)+"\n",StandardCharsets.UTF_8,StandardOpenOption.TRUNCATE_EXISTING); code("REGISTRY_CORRUPT",x.runtime::registryRevision);});
        c("39 force-before-ack reference path",()->{var x=base(); x.version("v1",V100,A,null); truth(Files.size(x.dir.resolve("contracts.journal"))>0); var reopened=new ContractAuthorityRuntime(x.dir,owners(),canonicalizers(),List.of(x.validator)); eq(x.runtime.registryRevision(),reopened.registryRevision());});
        c("40 concurrent same-version writers converge",()->{var x=base(); ExecutorService es=Executors.newFixedThreadPool(2); try{var d=new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"); Future<ContractVersionV1> f1=es.submit(()->x.runtime.registerVersion("c1",-1,d,null)); Future<ContractVersionV1> f2=es.submit(()->x.runtime.registerVersion("c2",-1,d,null)); eq(f1.get(),f2.get()); eq(2L,x.runtime.registryRevision());}finally{es.shutdownNow();}});
        c("41 concurrent conflicting bytes one winner",()->{var x=base(); ExecutorService es=Executors.newFixedThreadPool(2); AtomicInteger ok=new AtomicInteger(),conflict=new AtomicInteger(); try{Callable<Void> a=()->{try{x.runtime.registerVersion("a",-1,new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"),null);ok.incrementAndGet();}catch(ContractException e){if(e.code().equals("VERSION_IDENTITY_CONFLICT"))conflict.incrementAndGet();else throw e;}return null;}; Callable<Void>b=()->{try{x.runtime.registerVersion("b",-1,new VersionDraft("S",V100,B,"CANON-1","artifact://b"),null);ok.incrementAndGet();}catch(ContractException e){if(e.code().equals("VERSION_IDENTITY_CONFLICT"))conflict.incrementAndGet();else throw e;}return null;}; es.invokeAll(List.of(a,b)).forEach(f->{try{f.get();}catch(Exception e){throw new RuntimeException(e);}}); eq(1,ok.get());eq(1,conflict.get());}finally{es.shutdownNow();}});
        c("42 stale registry revision fails without append",()->{var x=base(); long r=x.runtime.registryRevision(); code("REGISTRY_REVISION_CONFLICT",()->x.runtime.registerVersion("v",r-1,new VersionDraft("S",V100,A,"CANON-1","artifact://aaaa"),null)); eq(r,x.runtime.registryRevision());});
        c("43 secret-like canonical field rejected",()->{code("SECRET_FIELD_FORBIDDEN",()->new ContractSubjectV1("S",ContractKind.API,"CORE","CUSTOM","SEMVER","password=hunter2"));});
        c("44 contracts cannot mutate peer business state",()->{var x=fixture(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.runtime.resolveForMutation("S",V100,A); Set<String> allowed=Set.of("subjectId","requestedVersion","requestedDigest","currentVersion","currentDigest","lifecycleStanding","compatibilityDecisionDigest","migrationEdgeKey","observedRegistryRevision","standing","reasonCodes"); for(var rc:GateReceipt.class.getRecordComponents())truth(allowed.contains(rc.getName()));});
        c("45 contracts cannot grant identity delegation",()->{for(var rc:GateReceipt.class.getRecordComponents())falsehood(rc.getName().toLowerCase(Locale.ROOT).contains("principal")||rc.getName().toLowerCase(Locale.ROOT).contains("delegation"));});
        c("46 contracts cannot grant resource route placement runtime effect",()->{String s=Arrays.toString(GateReceipt.class.getRecordComponents()).toLowerCase(Locale.ROOT); for(String w:List.of("resourcegrant","routegrant","placementgrant","runtimelease","effectpermission"))falsehood(s.contains(w));});
        c("47 changed schema digest invalidates prior exact subject evidence",()->{var e=new ExactSubjectEvidence(A,EvidenceClass.CURRENT_EXACT); truth(e.qualifies(A)); falsehood(e.qualifies(B));});
        c("48 historical FWP12 remains provenance only",()->{var e=new ExactSubjectEvidence(A,EvidenceClass.HISTORICAL_PROVENANCE); falsehood(e.qualifies(A));});
        if(cases!=48) throw new AssertionError("CASE_COUNT="+cases);
        System.out.println("PASS FOUNDATION_CONTRACTS_VERSIONING cases=48");
    }

    static Fixture fresh(CompatibilityMode mode, CompatibilityScope scope) {
        try {
            Path d=Files.createTempDirectory("contracts-q-");
            var validator=new MatrixCompatibilityValidator("VAL-1","1.0");
            var runtime=new ContractAuthorityRuntime(d,owners(),canonicalizers(),List.of(validator));
            return new Fixture(d,runtime,validator,mode,scope);
        } catch(Exception e){ throw new RuntimeException(e); }
    }
    static Fixture base(){var x=fresh(CompatibilityMode.BACKWARD,CompatibilityScope.LATEST); x.subject("S"); return x;}
    static Fixture fixture(CompatibilityMode mode,CompatibilityScope scope){var x=fresh(mode,scope); x.subject("S"); x.policy(); x.version("v1",V100,A,null); return x;}
    static Fixture twoVersion(CompatibilityMode mode,CompatibilityScope scope,String first,String second){var x=fixture(mode,scope); x.validator.decide(mode,first,second,Decision.COMPATIBLE); x.version("v11",V110,second,null); return x;}
    static OwnerAuthority owners(){return id->Set.of("CORE","LEARNING","BOOK","DOCUMENTS").contains(id);}
    static CanonicalizerAuthority canonicalizers(){return id->Set.of("CANON-1","RFC8785@1").contains(id);}
    static MigrationEdgeV1 edge(SemanticVersion from,String fd,SemanticVersion to,String td,String artifact){return new MigrationEdgeV1("S",from,fd,to,td,"MIG-"+from+"-"+to,artifact,"1.0.0","NOT_DECLARED");}

    record Fixture(Path dir, ContractAuthorityRuntime runtime, MatrixCompatibilityValidator validator, CompatibilityMode mode, CompatibilityScope scope) {
        ContractSubjectV1 subject(String id){return runtime.createSubject("subject",-1,new ContractSubjectV1(id,ContractKind.API,"CORE","CUSTOM","SEMVER","T0"));}
        CompatibilityPolicyV1 policy(){return runtime.setPolicy("policy",-1,new CompatibilityPolicyV1("S","POL-1",1,mode,scope,"VAL-1","1.0",null));}
        ContractVersionV1 version(String cmd,SemanticVersion v,String digest,MigrationEdgeV1 edge){return runtime.registerVersion(cmd,-1,new VersionDraft("S",v,digest,"CANON-1","artifact://"+digest.substring(0,4)),edge);}
    }

    static void c(String name, Throwing r) throws Exception {cases++; try{r.run();}catch(Throwable t){throw new AssertionError("CASE "+cases+" FAILED: "+name,t);}}
    interface Throwing {void run() throws Exception;}
    static void eq(Object a,Object b){if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);}
    static void truth(boolean v){if(!v)throw new AssertionError("expected true");}
    static void falsehood(boolean v){if(v)throw new AssertionError("expected false");}
    static void code(String expected, Runnable r){try{r.run();throw new AssertionError("expected "+expected);}catch(ContractException e){eq(expected,e.code());}}
    static void throwsAny(Class<? extends Throwable> type,Runnable r){try{r.run();throw new AssertionError("expected "+type.getName());}catch(Throwable e){if(e instanceof AssertionError)throw (AssertionError)e;if(!type.isInstance(e))throw new AssertionError("wrong exception "+e,e);}}
}
