package org.systemmaster.core;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

/** Canonical digest for the exact capability descriptor state evaluated by routing. */
public final class CapabilityDescriptorDigests {
    private CapabilityDescriptorDigests() {}

    public static String sha256(CapabilityDescriptor d) {
        Objects.requireNonNull(d, "descriptor");
        StringBuilder b = new StringBuilder(1024);
        add(b, d.capabilityId()); add(b, d.version()); add(b, d.owner()); add(b, d.purpose());
        addSorted(b, d.semanticTags()); add(b, d.inputSchemaRef()); add(b, d.outputSchemaRef());
        add(b, d.qualificationState()); addList(b, d.qualificationEvidenceRefs()); addEnums(b, d.effectClasses());
        addList(b, d.authorityRequirements()); add(b, d.determinismClass()); add(b, d.idempotencyClass());
        add(b, d.retryPolicyRef()); add(b, d.reconciliationPolicyRef()); add(b, d.compensationPolicyRef());
        addList(b, d.preconditionContractRefs()); addList(b, d.postconditionContractRefs()); addList(b, d.concurrencyDomains());
        add(b, Boolean.toString(d.offlineCapable())); add(b, Boolean.toString(d.networkRequired()));
        addList(b, d.egressRequirements()); addList(b, d.dataZoneRequirements()); add(b, d.sandboxProfile());
        add(b, d.resourceProfileRef()); add(b, d.latencyProfile()); addList(b, d.modelRequirements()); addList(b, d.hardwareRequirements());
        add(b, d.health()); add(b, instant(d.healthObservedAt())); add(b, d.healthTtlSeconds()==null?null:d.healthTtlSeconds().toString());
        add(b, d.implementationDigest()); add(b, d.compatibilityRange()); addList(b, d.supersedes()); addMap(b, d.protocolBindings());
        addList(b, d.allowedCallers()); add(b, d.provenanceRef());
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(b.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String instant(Instant value) { return value == null ? null : value.toString(); }
    private static void add(StringBuilder b, String value) {
        String v = value == null ? "<null>" : value;
        b.append(v.length()).append(':').append(v).append('|');
    }
    private static void addList(StringBuilder b, Collection<String> values) {
        List<String> copy = values == null ? List.of() : List.copyOf(values);
        add(b, Integer.toString(copy.size()));
        for (String v : copy) add(b, v);
    }
    private static void addSorted(StringBuilder b, Collection<String> values) {
        List<String> copy = values == null ? new ArrayList<>() : new ArrayList<>(values);
        Collections.sort(copy); addList(b, copy);
    }
    private static void addEnums(StringBuilder b, Collection<? extends Enum<?>> values) {
        List<String> names = new ArrayList<>(); if (values != null) for (Enum<?> e : values) names.add(e.name());
        Collections.sort(names); addList(b, names);
    }
    private static void addMap(StringBuilder b, Map<String,String> values) {
        Map<String,String> map = values == null ? Map.of() : values;
        List<String> keys = new ArrayList<>(map.keySet()); Collections.sort(keys); add(b, Integer.toString(keys.size()));
        for (String k : keys) { add(b, k); add(b, map.get(k)); }
    }
}
