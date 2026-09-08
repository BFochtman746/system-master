package org.systemmaster.continuity;
import static org.systemmaster.continuity.CheckpointAuthorities.*;
import java.nio.file.*;import java.time.*;import java.util.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;
public final class Gwp004QualificationTest{
 static int n;
 public static void main(String[]z)throws Exception{
  Path r=Files.createTempDirectory("g4-");Set<String>w=ConcurrentHashMap.newKeySet();w.add("w");
  CheckpointCoordinator c=new CheckpointCoordinator(r,w::contains,(x,a,e)->x.equals("w")&&a.equals("a")&&e==7);
  CompatibilityAuthority ok=m->CompatibilityStanding.COMPATIBLE;RetentionAuthority hold=(d,i)->RetentionDisposition.HOLD;
  CheckpointCatalog cat=new CheckpointCatalog(r,ok,hold);
  CheckpointPayloadRef p1=c.storePayload("one".getBytes(),null,"I","v");
  a(p1.contentDigest().matches("[0-9a-f]{64}"));e(3L,p1.byteLength());e(1,cat.payloadCount());
  var q1=c.recordCheckpoint(req(1,p1,10,20,true,"b1"));e(1L,q1.manifest().checkpointSeq());e(null,q1.manifest().parentCheckpointRef());e("b1",q1.manifest().semanticBoundaryId());e(7L,q1.manifest().sourceFenceEpoch());e(10L,q1.manifest().decisionHistoryWatermark());e(20L,q1.manifest().externalEffectWatermark());
  e(q1.manifest().checkpointId(),cat.currentResumeCheckpoint("w").orElseThrow().checkpointId());e(1,cat.getCheckpointLineage("w").size());e("AVAILABLE",cat.getCheckpointLineage("w").get(0).payloadAvailability());e(CompatibilityStanding.COMPATIBLE,cat.getCheckpointLineage("w").get(0).compatibility());
  var rep=c.recordCheckpoint(req(1,p1,10,20,true,"b1"));a(rep.idempotentExisting());e(q1.manifest().checkpointId(),rep.manifest().checkpointId());
  CheckpointPayloadRef p2=c.storePayload("two".getBytes(),null,"I","v");
  x(()->c.recordCheckpoint(req(1,p2,10,20,true,"b1")),CheckpointCoordinator.CheckpointRejectedException.class);
  x(()->c.recordCheckpoint(req(2,p1,11,21,false,"x")),CheckpointCoordinator.CheckpointRejectedException.class);
  x(()->c.recordCheckpoint(new CheckpointCoordinator.Request("w","a",6,2,"S","b2",true,p1,"s","r",11,21,List.of())),CheckpointCoordinator.StaleFenceException.class);
  x(()->c.recordCheckpoint(new CheckpointCoordinator.Request("missing","a",7,2,"S","b2",true,p1,"s","r",11,21,List.of())),CheckpointCoordinator.CheckpointRejectedException.class);
  CheckpointPayloadRef fake=new CheckpointPayloadRef("a".repeat(64),r.resolve("x").toString(),1,null,"I","v",Instant.now());x(()->c.recordCheckpoint(req(2,fake,11,21,true,"b2")),CheckpointCoordinator.InvalidPayloadException.class);
  var q2=c.recordCheckpoint(req(2,p2,11,21,true,"b2"));e(q1.manifest().checkpointId(),q2.manifest().parentCheckpointRef());e(2L,q2.manifest().checkpointSeq());e(11L,q2.manifest().decisionHistoryWatermark());e(21L,q2.manifest().externalEffectWatermark());e(2,cat.getCheckpointLineage("w").size());e(q2.manifest().checkpointId(),cat.currentResumeCheckpoint("w").orElseThrow().checkpointId());
  x(()->c.recordCheckpoint(req(3,p2,10,22,true,"b3")),CheckpointCoordinator.CheckpointRejectedException.class);x(()->c.recordCheckpoint(req(3,p2,12,20,true,"b3")),CheckpointCoordinator.CheckpointRejectedException.class);
  CheckpointPayloadRef pa=c.storePayload("A".getBytes(),null,"I","v"),pb=c.storePayload("B".getBytes(),null,"I","v");AtomicInteger win=new AtomicInteger(),lose=new AtomicInteger();ExecutorService ex=Executors.newFixedThreadPool(2);var f1=ex.submit(()->race(c,pa,win,lose));var f2=ex.submit(()->race(c,pb,win,lose));f1.get();f2.get();ex.shutdown();e(1,win.get());e(1,lose.get());e(3,cat.getCheckpointLineage("w").size());e(3L,cat.currentResumeCheckpoint("w").orElseThrow().checkpointSeq());a(Set.of(pa.contentDigest(),pb.contentDigest()).contains(cat.currentResumeCheckpoint("w").orElseThrow().payloadDigest()));
  CheckpointManifest cur=cat.currentResumeCheckpoint("w").orElseThrow();var inc=new RecoveryIntegrityValidator(r,m->CompatibilityStanding.INCOMPATIBLE,"v").validateCheckpoint(q1.manifest().checkpointId());e(IntegrityFinding.FindingType.INCOMPATIBLE,inc.findingType());e(IntegrityFinding.Severity.CRITICAL,inc.severity());
  RecoveryIntegrityValidator v=new RecoveryIntegrityValidator(r,ok,"v");v.store().corruptPayloadForTest(cur.payloadDigest(),"bad".getBytes());var bad=v.validateCheckpoint(cur.checkpointId());e(IntegrityFinding.FindingType.CORRUPT,bad.findingType());a(v.quarantined(cur.checkpointId()));a(cat.currentResumeCheckpoint("w").isEmpty());e(3,cat.getCheckpointLineage("w").size());e(cur.payloadDigest(),bad.expectedDigest());a(bad.observedDigest()!=null&&!bad.observedDigest().equals(bad.expectedDigest()));
  CheckpointPayloadRef orphan=c.storePayload("orphan".getBytes(),null,"I","v");e(5,cat.payloadCount());e(3,cat.getCheckpointLineage("w").size());var young=cat.cleanupOrphans(Duration.ofHours(1),Instant.now());a(young.tooYoung()>=1);a(cat.payloadExists(orphan.contentDigest()));cat.store().agePayloadForTest(orphan.contentDigest(),Instant.now().minus(Duration.ofHours(2)));CheckpointCatalog del=new CheckpointCatalog(r,ok,(d,i)->d.equals(orphan.contentDigest())?RetentionDisposition.DELETE_ELIGIBLE:RetentionDisposition.HOLD);var cl=del.cleanupOrphans(Duration.ofHours(1),Instant.now());e(1,cl.deleted());a(!del.payloadExists(orphan.contentDigest()));a(del.payloadExists(q1.manifest().payloadDigest()));
  for(int i=0;i<2;i++)a(cat.getCheckpointLineage("w").get(i).manifest().checkpointSeq()==i+1);
  if(n!=50)throw new AssertionError("count="+n);System.out.println("PASS G-WP-004 tests=50 requirements=7");
 }
 static void race(CheckpointCoordinator c,CheckpointPayloadRef p,AtomicInteger w,AtomicInteger l){try{c.recordCheckpoint(req(3,p,12,22,true,"b3"));w.incrementAndGet();}catch(RuntimeException e){l.incrementAndGet();}}
 static CheckpointCoordinator.Request req(long s,CheckpointPayloadRef p,long d,long x,boolean safe,String b){return new CheckpointCoordinator.Request("w","a",7,s,"S",b,safe,p,"s","r",d,x,List.of("c"));}
 static void e(Object x,Object y){a(Objects.equals(x,y));}static void a(boolean v){n++;if(!v)throw new AssertionError("check "+n);}static void x(Runnable r,Class<? extends Throwable>c){n++;try{r.run();throw new AssertionError("no throw");}catch(Throwable t){if(t instanceof AssertionError)throw(AssertionError)t;if(!c.isInstance(t))throw new AssertionError(t);}}
}
