package org.systemmaster.tools.pptx;

import org.systemmaster.core.InMemoryCapabilityRegistry;
import org.systemmaster.tools.common.OoxmlMutationPlan;
import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Qualification for the 72-capability PPTX full-lane portable/delegated surface. */
public final class PptxFullLanePortableTests {
    private static int assertions;
    public static void main(String[] args) throws Exception {
        PptxFullLaneEngine engine=new PptxFullLaneEngine();
        byte[] deck=engine.createPresentation("Roadmap",List.of(
            new PptxFullLaneEngine.SlideSpec("Title",List.of("Point A","Point B"),"Speaker notes"),
            new PptxFullLaneEngine.SlideSpec("Second",List.of("Chart goes here"),null)
        ));
        var inspection=engine.inspect(deck);
        check(inspection.slides().size()==2,"create two-slide deck");
        check(inspection.slides().getFirst().texts().contains("Title"),"title text present");
        check(inspection.notes().contains("Speaker notes"),"notes created");
        check(engine.verify(deck).reopenable(),"created PPTX reopens");
        check(engine.verify(deck).semanticStable(),"created PPTX deterministic roundtrip");

        byte[] added=engine.addSlide(deck,new PptxFullLaneEngine.SlideSpec("Third",List.of("More"),"More notes"));
        check(engine.inspect(added).slides().size()==3,"add slide");
        byte[] replaced=engine.replaceText(added,"Chart goes here","Chart inventory ready");
        check(engine.inspect(replaced).slides().stream().flatMap(s->s.texts().stream()).anyMatch(t->t.equals("Chart inventory ready")),"replace text");
        byte[] notes=engine.editNotes(replaced,2,"Second notes");
        check(engine.inspect(notes).notes().contains("Second notes"),"edit notes");
        byte[] linked=engine.addHyperlink(notes,1,"https://example.com/demo");
        check(engine.inspect(linked).hyperlinks().contains("https://example.com/demo"),"hyperlink inventory");
        byte[] media=engine.addMediaPart(linked,"image1.png",new byte[]{1,2,3,4});
        check(engine.inspect(media).mediaParts().contains("ppt/media/image1.png"),"media inventory");

        String packageDigest=OoxmlPackageSupport.sha256(media);
        var addPlan=new OoxmlMutationPlan(packageDigest,List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.ADD,"ppt/charts/chart1.xml","<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart/></c:chartSpace>".getBytes(StandardCharsets.UTF_8),null)));
        byte[] charted=engine.applyAdvancedPlan(media,addPlan);
        check(OoxmlPackageSupport.read(charted).containsKey("ppt/charts/chart1.xml"),"advanced chart part add");
        Map<String,byte[]> entries=OoxmlPackageSupport.read(charted);
        String partDigest=OoxmlPackageSupport.sha256(entries.get("ppt/charts/chart1.xml"));
        var replacePlan=new OoxmlMutationPlan(OoxmlPackageSupport.sha256(charted),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.REPLACE,"ppt/charts/chart1.xml","<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart><c:autoTitleDeleted val=\"0\"/></c:chart></c:chartSpace>".getBytes(StandardCharsets.UTF_8),partDigest)));
        byte[] repaired=engine.applyAdvancedPlan(charted,replacePlan);
        check(new String(OoxmlPackageSupport.read(repaired).get("ppt/charts/chart1.xml"),StandardCharsets.UTF_8).contains("autoTitleDeleted"),"advanced chart part replace");
        boolean stale=false; try{engine.applyAdvancedPlan(engine.replaceText(repaired,"Title","New Title"),addPlan);}catch(IllegalStateException expected){stale=true;} check(stale,"stale plan rejected");
        boolean unsafe=false; try{engine.applyAdvancedPlan(repaired,new OoxmlMutationPlan(OoxmlPackageSupport.sha256(repaired),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.ADD,"ppt/customXml/unsafe.xml","<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///etc/passwd'>]><x>&e;</x>".getBytes(StandardCharsets.UTF_8),null))));}catch(Exception expected){unsafe=true;} check(unsafe,"unsafe XML rejected");
        boolean traversal=false; try{engine.applyAdvancedPlan(repaired,new OoxmlMutationPlan(OoxmlPackageSupport.sha256(repaired),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.ADD,"../evil.xml","<x/>".getBytes(StandardCharsets.UTF_8),null))));}catch(Exception expected){traversal=true;} check(traversal,"part traversal rejected");
        check(engine.diff(deck,repaired).changedSlideCount()>=1,"semantic diff detects change");
        check(engine.accessibility(repaired).isEmpty(),"no accessibility warnings for titled slides");
        check(engine.diagnose(repaired).stream().noneMatch(d->d.startsWith("ERROR")),"diagnosis clean of fatal errors");
        byte[] active=OoxmlPackageSupport.write(new java.util.LinkedHashMap<>(OoxmlPackageSupport.read(repaired)){{put("ppt/vbaProject.bin",new byte[]{9,9});}});
        check(engine.inspect(active).activeContent().contains("ppt/vbaProject.bin"),"macro inventory passive only");
        check(engine.diagnose(active).stream().anyMatch(d->d.contains("ACTIVE_CONTENT")),"active content diagnostic");

        check(PptxFullLaneCapabilities.all().size()==78,"exact frozen PPTX capability count");
        check(PptxFullLaneCapabilities.byId().size()==78,"PPTX capability IDs unique");
        check(PptxFullLaneCapabilities.portableImplemented()==64,"64 PPTX portable capabilities");
        check(PptxFullLaneCapabilities.delegated()==6,"6 PPTX delegated capabilities");
        check(PptxFullLaneCapabilities.externalPending()==8,"8 PPTX external/native pending capabilities");
        long accounted=PptxFullLaneCapabilities.portableImplemented()+PptxFullLaneCapabilities.delegated()+PptxFullLaneCapabilities.externalPending();
        check(accounted==78,"all 78 PPTX capabilities disposition-accounted");
        var registry=new InMemoryCapabilityRegistry(PptxCapabilityDescriptors.registered());
        check(PptxCapabilityDescriptors.fullLane().size()==78,"78 full-lane descriptors emitted");
        check(PptxCapabilityDescriptors.registered().size()==80,"legacy plus full-lane descriptors emitted");
        check(registry.resolve("cap.pptx.presentation.inspect",PptxCapabilityDescriptors.VERSION).isPresent(),"full-lane inspect registered");
        check(registry.resolve("cap.pptx.chart.create",PptxCapabilityDescriptors.VERSION).isPresent(),"advanced chart route registered");
        check(registry.resolve("cap.pptx.ai.draft",PptxCapabilityDescriptors.VERSION).isPresent(),"AI draft delegation registered");
        check(registry.resolve("cap.pptx.native.render.oracle",PptxCapabilityDescriptors.VERSION).isPresent(),"native render pending route registered fail-closed");
        check(PptxFullLaneCapabilities.byId().get("cap.pptx.vba.execute").disposition().contains("PENDING"),"VBA execution not falsely portable");
        check(PptxFullLaneCapabilities.byId().get("cap.pptx.ai.draft").disposition().startsWith("DELEGATED_"),"AI drafting delegated");
        check(PptxFullLaneCapabilities.byId().get("cap.pptx.native.export.pdf.video").disposition().contains("PENDING"),"native export oracle remains pending");
        System.out.println("PPTX_FULL_LANE_PORTABLE_PASS assertions="+assertions+" portable="+PptxFullLaneCapabilities.portableImplemented()+" delegated="+PptxFullLaneCapabilities.delegated()+" externalPending="+PptxFullLaneCapabilities.externalPending());
    }
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
}
