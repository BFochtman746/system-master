package org.systemmaster.tools.pptx;

import org.systemmaster.core.CapabilityDescriptor;
import org.systemmaster.core.EffectClass;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** PLATFORM-006 descriptors for all 72 frozen PPTX capability census entries. */
public final class PptxCapabilityDescriptors {
    public static final String VERSION="2.0.0";
    private static final String PROVENANCE="TOOL-VAULT:MOD-PPTX-001/FULL-LANE";
    private PptxCapabilityDescriptors() {}
    public static List<CapabilityDescriptor> fullLane(){List<CapabilityDescriptor>out=new ArrayList<>();for(var d:PptxFullLaneCapabilities.all())out.add(descriptor(d));return List.copyOf(out);}
    public static List<CapabilityDescriptor> portableCore(){return List.of(legacy("MOD-PPTX-001.INSPECT",EffectClass.READ),legacy("MOD-PPTX-001.REPLACE_TEXT",EffectClass.DERIVED_WRITE));}
    public static List<CapabilityDescriptor> registered(){List<CapabilityDescriptor>out=new ArrayList<>(portableCore());out.addAll(fullLane());return List.copyOf(out);}
    private static CapabilityDescriptor legacy(String id,EffectClass effect){return new CapabilityDescriptor(id,"1.0.0","MOD-PPTX-001","Legacy compatibility capability "+id,Set.of("pptx","powerpoint","compatibility"),"toolvault://MOD-PPTX-001/legacy","systemmaster://artifact-receipt/pptx-v1","PORTABLE_IMPLEMENTED_CORE_COMPAT",List.of("assurance://tool-integration-003/pptx-portable"),(effect==EffectClass.READ?Set.of(EffectClass.READ):Set.of(EffectClass.READ,effect)),List.of("PLATFORM-006","PLATFORM-008"),"DETERMINISTIC_INPUT_BOUND","IDEMPOTENT_BY_SOURCE_AND_PLAN","NO_AUTOMATIC_EXTERNAL_RETRY","IMMUTABLE_SOURCE_NEW_CHILD_VERSION","ROLLBACK_BY_VERSION_LINEAGE",List.of("PLATFORM-008_VERIFIED_SOURCE"),List.of("PLATFORM-008_VERIFIED_RESULT"),List.of("artifact:"+id),true,false,List.of(),List.of(),"governed-artifact","resource-profile://presentation","INTERACTIVE_OR_BACKGROUND",List.of(),List.of(),"UNOBSERVED",null,null,"pptx-legacy-"+id,">=2.0.41",List.of(),Map.of("compatibility","R047"),List.of("CHAT-001A","KEEL-001"),PROVENANCE);}
    private static CapabilityDescriptor descriptor(PptxFullLaneCapabilities.Disposition d){boolean external=d.disposition().contains("PENDING");boolean delegated=d.disposition().startsWith("DELEGATED_");boolean readOnly=d.capabilityId().contains("inspect")||d.capabilityId().contains("inventory")||d.capabilityId().contains("diagnose")||d.capabilityId().contains("extract")||d.capabilityId().contains("scan")||d.capabilityId().contains("profile")||d.capabilityId().contains("diff")||d.capabilityId().contains("verify");Set<EffectClass> effects=readOnly?Set.of(EffectClass.READ):Set.of(EffectClass.READ,EffectClass.DERIVED_WRITE);return new CapabilityDescriptor(d.capabilityId(),VERSION,"MOD-PPTX-001",d.capability(),Set.of("pptx","powerpoint","presentation","full-lane"),"toolvault://MOD-PPTX-001/CANONICAL-POWERPOINT-PPTX-MODULE-CONTRACT.json","systemmaster://artifact-receipt/pptx-v2",d.disposition(),List.of("assurance://tool-integration-003/full-lane"),effects,delegated?List.of("PLATFORM-006","PLATFORM-008","PLATFORM-009","PLATFORM-010","PLATFORM-011"):List.of("PLATFORM-006","PLATFORM-008","PLATFORM-010"),"DETERMINISTIC_WHERE_PORTABLE","IDEMPOTENT_BY_SOURCE_PLAN_DIGEST","NO_UNSAFE_AUTOMATIC_RETRY","IMMUTABLE_SOURCE_NEW_CHILD_VERSION","ROLLBACK_BY_VERSION_LINEAGE",List.of("VERIFIED_SOURCE_OR_CREATE_PLAN"),List.of("REOPEN_VERIFY_RECEIPT"),List.of("artifact:"+d.capabilityId()),!external,external,List.of(),List.of(),external?"EXTERNAL_OR_NATIVE_BOUNDARY":"governed-artifact","resource-profile://presentation","INTERACTIVE_OR_BACKGROUND",delegated?List.of("PLATFORM-009_OR_010_OR_011"):List.of(),List.of(),"UNOBSERVED",null,null,"pptx-full-lane-"+d.capabilityId(),">=2.0.41",List.of(),Map.of("disposition",d.disposition()),List.of("CHAT-001A","KEEL-001","PLATFORM-009","PLATFORM-010"),PROVENANCE);}
}
