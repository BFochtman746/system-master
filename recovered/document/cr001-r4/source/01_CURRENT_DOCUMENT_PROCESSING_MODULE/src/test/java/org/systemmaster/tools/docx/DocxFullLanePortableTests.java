package org.systemmaster.tools.docx;

import org.systemmaster.core.InMemoryCapabilityRegistry;
import org.systemmaster.tools.common.OoxmlMutationPlan;
import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/** Qualification for the 60-capability DOCX full-lane portable/delegated surface. */
public final class DocxFullLanePortableTests {
    private static int assertions;
    public static void main(String[] args)throws Exception{
        DocxFullLaneEngine engine=new DocxFullLaneEngine();
        byte[] doc=engine.createDocument(List.of("System Master","Portable full-lane document"));
        check(new DocxPackageEngine().inspect(doc).paragraphs().size()==2,"DOCX create");
        check(engine.verify(doc).reopenable(),"created DOCX reopens");
        check(engine.verify(doc).semanticStable(),"created DOCX deterministic roundtrip");
        byte[] heading=engine.appendParagraph(doc,"Architecture","Heading1");
        check(engine.inventory(heading).headings()==1,"heading/style semantic edit");
        byte[] table=engine.addTable(heading,List.of(List.of("Capability","State"),List.of("DOCX","Portable")));
        check(engine.inventory(table).tables()==1,"table create");
        byte[] bookmark=engine.addBookmark(table,0,"systemMaster");
        check(engine.inventory(bookmark).bookmarks()==1,"bookmark create");
        byte[] field=engine.addSimpleField(bookmark,"TOC \\o \"1-3\"","Table of Contents");
        check(new DocxPackageEngine().inspect(field).paragraphs().stream().anyMatch(p->p.contains("Table of Contents")),"field display inserted");
        check(engine.inventory(field).paragraphs()>=4,"document structure retained");
        check(engine.accessibility(field).stream().noneMatch(d->d.code().equals("NO_HEADINGS")),"heading satisfies basic accessibility signal");

        String digest=OoxmlPackageSupport.sha256(field);
        var addPlan=new OoxmlMutationPlan(digest,List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.ADD,"customXml/fullLane.xml","<docx route=\"specialist\"/>".getBytes(StandardCharsets.UTF_8),null)));
        byte[] advanced=engine.applyAdvancedPlan(field,addPlan);
        Map<String,byte[]> entries=OoxmlPackageSupport.read(advanced);
        check(entries.containsKey("customXml/fullLane.xml"),"advanced DOCX plan add part");
        String partDigest=OoxmlPackageSupport.sha256(entries.get("customXml/fullLane.xml"));
        byte[] replaced=engine.applyAdvancedPlan(advanced,new OoxmlMutationPlan(OoxmlPackageSupport.sha256(advanced),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.REPLACE,"customXml/fullLane.xml","<docx route=\"repair\"/>".getBytes(StandardCharsets.UTF_8),partDigest))));
        check(new String(OoxmlPackageSupport.read(replaced).get("customXml/fullLane.xml"),StandardCharsets.UTF_8).contains("repair"),"advanced DOCX part replace");
        byte[] cleaned=engine.applyAdvancedPlan(replaced,new OoxmlMutationPlan(OoxmlPackageSupport.sha256(replaced),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.DELETE,"customXml/fullLane.xml",null,OoxmlPackageSupport.sha256(OoxmlPackageSupport.read(replaced).get("customXml/fullLane.xml"))))));
        check(!OoxmlPackageSupport.read(cleaned).containsKey("customXml/fullLane.xml"),"advanced DOCX part delete");
        byte[] semanticallyChanged=engine.appendParagraph(cleaned,"Changed after plan",null); boolean stale=false;try{engine.applyAdvancedPlan(semanticallyChanged,addPlan);}catch(IllegalStateException expected){stale=true;}check(stale,"stale DOCX mutation rejected");
        boolean unsafe=false;try{engine.applyAdvancedPlan(cleaned,new OoxmlMutationPlan(OoxmlPackageSupport.sha256(cleaned),List.of(new OoxmlMutationPlan.Mutation(OoxmlMutationPlan.Operation.ADD,"customXml/unsafe.xml","<!DOCTYPE x><x/>".getBytes(StandardCharsets.UTF_8),null))));}catch(Exception expected){unsafe=true;}check(unsafe,"unsafe DOCX XML rejected");

        check(engine.verify(cleaned).reopenable(),"final DOCX reopens");
        check(engine.verify(cleaned).semanticStable(),"final DOCX semantic stable");
        var diff=engine.diff(doc,cleaned);
        check(diff.changedParagraphCount()>0,"DOCX semantic diff detects edits");
        check(engine.inventory(cleaned).macros()==false,"created document has no executable macro");
        check(engine.inventory(cleaned).signatures()==false,"created document has no fabricated signature");

        check(DocxFullLaneCapabilities.all().size()==60,"exact frozen DOCX capability count");
        check(DocxFullLaneCapabilities.byId().size()==60,"DOCX capability IDs unique");
        long accounted=DocxFullLaneCapabilities.portableImplemented()+DocxFullLaneCapabilities.delegated()+DocxFullLaneCapabilities.externalPending();
        check(accounted==60,"all 60 DOCX capabilities disposition-accounted");
        check(DocxFullLaneCapabilities.portableImplemented()>0,"DOCX portable population nonempty");
        check(DocxFullLaneCapabilities.delegated()>0,"DOCX delegated population nonempty");
        check(DocxFullLaneCapabilities.externalPending()>0,"DOCX native/external pending population explicit");
        var registry=new InMemoryCapabilityRegistry(DocxCapabilityDescriptors.registered());
        check(DocxCapabilityDescriptors.fullLane().size()==60,"60 full-lane descriptors emitted");
        check(DocxCapabilityDescriptors.registered().size()==62,"legacy plus full-lane descriptors emitted");
        check(registry.resolve("DOC-A006",DocxCapabilityDescriptors.VERSION).isPresent(),"DOCX creation descriptor registered");
        check(registry.resolve("DOC-A033",DocxCapabilityDescriptors.VERSION).isPresent(),"DOCX advanced-object specialist route registered");
        check(registry.resolve("DOC-A057",DocxCapabilityDescriptors.VERSION).isPresent(),"collaborative safe mutation delegation registered");
        check(DocxFullLaneCapabilities.byId().get("DOC-A046").disposition().contains("PENDING"),"native Word oracle not falsely portable");
        check(DocxFullLaneCapabilities.byId().get("DOC-A054").disposition().contains("PENDING"),"Office.js host remains external pending");
        check(DocxFullLaneCapabilities.byId().get("DOC-A058").disposition().startsWith("DELEGATED_"),"PDF export delegated to PDF authority");

        System.out.println("DOCX_FULL_LANE_PORTABLE_PASS assertions="+assertions+" portable="+DocxFullLaneCapabilities.portableImplemented()+" delegated="+DocxFullLaneCapabilities.delegated()+" externalPending="+DocxFullLaneCapabilities.externalPending());
    }
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
}
