package org.systemmaster.core;
import java.util.*;
public final class InMemoryCapabilityRegistry implements CapabilityRegistry {
 private final Map<String,CapabilityDescriptor> byKey;
 public InMemoryCapabilityRegistry(Collection<CapabilityDescriptor> descriptors){Map<String,CapabilityDescriptor> m=new HashMap<>();for(CapabilityDescriptor d:descriptors){String k=key(d.capabilityId(),d.version());if(m.putIfAbsent(k,d)!=null)throw new IllegalArgumentException("duplicate capability version "+k);}byKey=Map.copyOf(m);}
 private static String key(String id,String version){return id+"@"+version;}
 @Override public Optional<CapabilityDescriptor> resolve(String capabilityId,String version){return Optional.ofNullable(byKey.get(key(capabilityId,version)));}
 @Override public Optional<String> descriptorDigest(String capabilityId,String version){return resolve(capabilityId,version).map(CapabilityDescriptorDigests::sha256);}
 @Override public List<CapabilityDescriptor> discover(Set<String> semanticTags,String requiredQualification,Set<EffectClass> allowedEffects,boolean offlineOnly){Set<String> tags=semanticTags==null?Set.of():Set.copyOf(semanticTags);Set<EffectClass> effects=allowedEffects==null?Set.of():Set.copyOf(allowedEffects);return byKey.values().stream().filter(d->requiredQualification==null||requiredQualification.equals(d.qualificationState())).filter(d->d.semanticTags().containsAll(tags)).filter(d->effects.containsAll(d.effectClasses())).filter(d->!offlineOnly||d.offlineCapable()).sorted(Comparator.comparing(CapabilityDescriptor::capabilityId).thenComparing(CapabilityDescriptor::version)).toList();}
}
