package org.systemmaster.tools.docx;

import org.systemmaster.core.CapabilityDescriptor;
import org.systemmaster.core.EffectClass;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** PLATFORM-006 descriptors for all 60 frozen DOCX capability census entries. */
public final class DocxCapabilityDescriptors {
    public static final String VERSION="2.0.0";
    private static final String PROVENANCE="TOOL-VAULT:MOD-DOCX-001/MODULE-DOCX-RU-001D";
    private DocxCapabilityDescriptors() {}
    public static List<CapabilityDescriptor> fullLane(){List<CapabilityDescriptor>out=new ArrayList<>();for(var d:DocxFullLaneCapabilities.all())out.add(descriptor(d));return List.copyOf(out);}
    public static List<CapabilityDescriptor> portableCore(){return List.of(legacy("MOD-DOCX-001.INSPECT",EffectClass.READ),legacy("MOD-DOCX-001.REPLACE_TEXT",EffectClass.DERIVED_WRITE));}
    public static List<CapabilityDescriptor> registered(){List<CapabilityDescriptor>out=new ArrayList<>(portableCore());out.addAll(fullLane());return List.copyOf(out);}
    private static CapabilityDescriptor legacy(String id,EffectClass effect){return new CapabilityDescriptor(id,"1.0.0","MOD-DOCX-001","Legacy compatibility capability "+id,Set.of("docx","word","compatibility"),"toolvault://MOD-DOCX-001/legacy","systemmaster://artifact-receipt/docx-v1","PORTABLE_IMPLEMENTED_CORE_VS1_VS2",List.of("assurance://tool-integration-001/docx-portable"),(effect==EffectClass.READ?Set.of(EffectClass.READ):Set.of(EffectClass.READ,effect)),List.of("PLATFORM-006","PLATFORM-008"),"DETERMINISTIC_INPUT_BOUND","IDEMPOTENT_BY_SOURCE_AND_PLAN","NO_AUTOMATIC_EXTERNAL_RETRY","IMMUTABLE_SOURCE_NEW_CHILD_VERSION","ROLLBACK_BY_VERSION_LINEAGE",List.of("PLATFORM-008_VERIFIED_SOURCE"),List.of("PLATFORM-008_VERIFIED_RESULT"),List.of("artifact:"+id),true,false,List.of(),List.of(),"governed-artifact","resource-profile://document","INTERACTIVE_OR_BACKGROUND",List.of(),List.of(),"UNOBSERVED",null,null,"docx-legacy-"+id,">=2.0.41",List.of(),Map.of("compatibility","R044"),List.of("CHAT-001A","KEEL-001"),PROVENANCE);}
    private static CapabilityDescriptor descriptor(DocxFullLaneCapabilities.Disposition d){boolean external=d.disposition().contains("PENDING");boolean delegated=d.disposition().startsWith("DELEGATED_");Set<EffectClass> effects=(d.capabilityId().matches("DOC-A00[1-5]|DOC-A014|DOC-A024|DOC-A040|DOC-A043|DOC-A046|DOC-A047|DOC-A049|DOC-A051|DOC-A059"))?Set.of(EffectClass.READ):Set.of(EffectClass.READ,EffectClass.DERIVED_WRITE);return new CapabilityDescriptor(d.capabilityId(),VERSION,"MOD-DOCX-001",d.capability(),Set.of("docx","word","document","full-lane"),"toolvault://MOD-DOCX-001/CANONICAL-WORD-DOCX-MODULE-CONTRACT.json","systemmaster://artifact-receipt/docx-v2",d.disposition(),List.of("assurance://tool-integration-002r/full-lane"),effects,delegated?List.of("PLATFORM-006","PLATFORM-008","PLATFORM-009","PLATFORM-010","PLATFORM-011"):List.of("PLATFORM-006","PLATFORM-008","PLATFORM-010"),"DETERMINISTIC_WHERE_PORTABLE","IDEMPOTENT_BY_SOURCE_PLAN_DIGEST","NO_UNSAFE_AUTOMATIC_RETRY","IMMUTABLE_SOURCE_NEW_CHILD_VERSION","ROLLBACK_BY_VERSION_LINEAGE",List.of("VERIFIED_SOURCE_OR_CREATE_PLAN"),List.of("REOPEN_VERIFY_RECEIPT"),List.of("artifact:"+d.capabilityId()),!external,external,List.of(),List.of(),external?"EXTERNAL_OR_NATIVE_BOUNDARY":"governed-artifact","resource-profile://document","INTERACTIVE_OR_BACKGROUND",List.of(),List.of(),"UNOBSERVED",null,null,"docx-full-lane-"+d.capabilityId(),">=2.0.41",List.of(),Map.of("disposition",d.disposition()),List.of("CHAT-001A","KEEL-001","PLATFORM-009","PLATFORM-010"),PROVENANCE);}
}
