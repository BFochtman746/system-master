package org.systemmaster.core;

import java.util.*;
import static org.systemmaster.core.ContractRegistry.*;

public final class Fwp012QualificationTest {
 static int n; static final String A="a".repeat(64),B="b".repeat(64),C="c".repeat(64),D="d".repeat(64);
 public static void main(String[] z){
  ContractRegistry cr=new ContractRegistry(); cr.register(new ContractVersion("ChangeCommand",1,0,A,null));cr.register(new ContractVersion("ChangeCommand",1,1,B,null));cr.register(new ContractVersion("ChangeCommand",2,0,C,"MIG-2"));
  e("ChangeCommand@2.0",cr.current("ChangeCommand").id());e(Standing.COMPATIBLE,cr.compatibility("ChangeCommand",2,0).standing());e(Standing.MIGRATION_REQUIRED,cr.compatibility("ChangeCommand",1,1).standing());e("MIG-2",cr.compatibility("ChangeCommand",1,1).migrationId());e(Standing.UNSUPPORTED,cr.compatibility("ChangeCommand",9,0).standing());t(cr.registryDigest().matches("[0-9a-f]{64}"));
  r(()->new ContractRegistry().register(new ContractVersion("X",2,0,A,null)));r(()->cr.register(new ContractVersion("ChangeCommand",1,1,D,null)));cr.register(new ContractVersion("ChangeCommand",1,1,B,null));e(Standing.COMPATIBLE,cr.compatibility("ChangeCommand",2,0).standing());

  LegacyCrosswalkService x=new LegacyCrosswalkService();var m=x.bind("FOUNDATION-008","L1",List.of("CHG-1"));e(LegacyCrosswalkService.Standing.MAPPED,m.standing());e("021F",m.semanticOwner());t(x.mayImport(m));var a=x.bind("FOUNDATION-008","L2",List.of("CHG-2","CHG-3"));e(LegacyCrosswalkService.Standing.QUARANTINED_AMBIGUOUS,a.standing());f(x.mayImport(a));var u=x.bind("UI","L3",List.of());e(LegacyCrosswalkService.Standing.UNMAPPED,u.standing());f(x.mayImport(u));e(m,x.bind("FOUNDATION-008","L1",List.of("CHG-1")));r(()->x.bind("FOUNDATION-008","L1",List.of("CHG-X")));

  MigrationService ms=new MigrationService(x);List<MigrationService.LegacyRecord> in=List.of(rec("L1",A),rec("L2",B),rec("L3",C));var p1=ms.migrate(in,null,1);f(p1.complete());e(1,p1.imported().size());e(1,p1.checkpoint().nextIndex());e(1,ms.importedCount());var p2=ms.migrate(in,p1.checkpoint(),1);f(p2.complete());e(1,p2.report().quarantined());e(2,p2.checkpoint().nextIndex());var p3=ms.migrate(in,p2.checkpoint(),5);t(p3.complete());e(1,ms.importedCount());e(1,p3.report().quarantined());e(0,p3.report().remaining());t(p3.report().reportDigest().matches("[0-9a-f]{64}"));
  var replay=ms.migrate(in,null,5);t(replay.complete());e(1,replay.report().replayed());e(1,ms.importedCount());r(()->ms.migrate(List.of(rec("L1",D)),null,5));r(()->ms.migrate(in,new MigrationService.MigrationCheckpoint(1,Map.of(),D),5));

  PortabilityService ps=new PortabilityService();List<PortabilityService.HistoryEvent> ev=List.of(ev(1,"E1","ChangeCommand@1.1",A,List.of("EVR-1"),Map.of("actorRef","P-1")),ev(2,"E2","ChangeCommand@2.0",B,List.of("EVR-2","EVR-3"),Map.of("reasonCode","OK")));var ex=ps.export(new PortabilityService.ChangeHistory("CHG-1",7,C,ev));e("CHG-1",ex.changeId());e(7L,ex.revision());e(C,ex.changeDigest());e(List.of("ChangeCommand@1.1","ChangeCommand@2.0"),ex.contractVersions());e(List.of("EVR-1","EVR-2","EVR-3"),ex.evidenceRefs());e(2,ex.orderedEvents().size());e(1L,ex.orderedEvents().get(0).sequence());t(ex.exportDigest().matches("[0-9a-f]{64}"));
  r(()->ps.export(new PortabilityService.ChangeHistory("CHG",1,A,List.of(ev(2,"E2","v1",A,List.of(),Map.of()),ev(1,"E1","v1",B,List.of(),Map.of())))));r(()->ev(1,"E","v1",A,List.of(),Map.of("password","hunter2")));r(()->ev(1,"E","v1",A,List.of(),Map.of("note","sk-live-secret")));r(()->ev(1,"E","v1",A,List.of(),Map.of("pem","-----BEGIN PRIVATE KEY-----abc")));
  if(n!=47)throw new AssertionError("TEST_COUNT="+n);System.out.println("PASS F-WP-012 tests=47 requirements=4");
 }
 static MigrationService.LegacyRecord rec(String id,String d){String auth=id.equals("L3")?"UI":"FOUNDATION-008";return new MigrationService.LegacyRecord(auth,id,d,"artifact://"+id);}
 static PortabilityService.HistoryEvent ev(long s,String id,String v,String d,List<String> refs,Map<String,String> m){return new PortabilityService.HistoryEvent(s,id,v,d,refs,m);}
 static void e(Object a,Object b){n++;if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);}static void t(boolean v){n++;if(!v)throw new AssertionError();}static void f(boolean v){t(!v);}static void r(Runnable q){n++;try{q.run();throw new AssertionError("expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
