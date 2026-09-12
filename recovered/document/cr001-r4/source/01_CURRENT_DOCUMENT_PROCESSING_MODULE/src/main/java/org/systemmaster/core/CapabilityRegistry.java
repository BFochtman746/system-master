package org.systemmaster.core;
import java.util.*;
public interface CapabilityRegistry {
    Optional<CapabilityDescriptor> resolve(String capabilityId,String version);
    List<CapabilityDescriptor> discover(Set<String> semanticTags,String requiredQualification,Set<EffectClass> allowedEffects,boolean offlineOnly);
    default Optional<String> descriptorDigest(String capabilityId,String version) {
        return resolve(capabilityId, version).map(CapabilityDescriptorDigests::sha256);
    }
}
