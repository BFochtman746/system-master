package org.systemmaster.core;

import java.util.*;

public final class PortabilityService {
    public record HistoryEvent(long sequence,String eventId,String contractVersion,String eventDigest,List<String> evidenceRefs,Map<String,String> safeMetadata) {
        public HistoryEvent { if(sequence<0)throw new IllegalArgumentException("sequence");req(eventId,"eventId");req(contractVersion,"contractVersion");ContractRegistry.digest(eventDigest,"eventDigest");evidenceRefs=List.copyOf(Objects.requireNonNull(evidenceRefs));safeMetadata=Map.copyOf(Objects.requireNonNull(safeMetadata));validateSafe(safeMetadata); }
    }
    public record ChangeHistory(String changeId,long revision,String changeDigest,List<HistoryEvent> events) { public ChangeHistory {req(changeId,"changeId");if(revision<0)throw new IllegalArgumentException("revision");ContractRegistry.digest(changeDigest,"changeDigest");events=List.copyOf(Objects.requireNonNull(events));} }
    public record ExportManifest(String changeId,long revision,String changeDigest,List<String> contractVersions,List<String> evidenceRefs,List<HistoryEvent> orderedEvents,String exportDigest) { public ExportManifest {contractVersions=List.copyOf(contractVersions);evidenceRefs=List.copyOf(evidenceRefs);orderedEvents=List.copyOf(orderedEvents);ContractRegistry.digest(exportDigest,"exportDigest");} }

    public ExportManifest export(ChangeHistory h){Objects.requireNonNull(h); long prev=-1;Set<String> versions=new LinkedHashSet<>(), evidence=new LinkedHashSet<>();StringBuilder body=new StringBuilder(h.changeId()).append('|').append(h.revision()).append('|').append(h.changeDigest());
        for(var e:h.events()){if(e.sequence()<=prev)throw new IllegalStateException("event_order_invalid");prev=e.sequence();versions.add(e.contractVersion());evidence.addAll(e.evidenceRefs());body.append('|').append(e.sequence()).append(':').append(e.eventId()).append(':').append(e.contractVersion()).append(':').append(e.eventDigest()).append(':').append(String.join(",",e.evidenceRefs()));}
        return new ExportManifest(h.changeId(),h.revision(),h.changeDigest(),new ArrayList<>(versions),new ArrayList<>(evidence),h.events(),ContractRegistry.sha256(body.toString()));}
    static void validateSafe(Map<String,String> m){for(var e:m.entrySet()){String k=e.getKey().toLowerCase(Locale.ROOT),v=String.valueOf(e.getValue()).toLowerCase(Locale.ROOT);if(k.matches(".*(password|secret|token|private.?key|credential).*"))throw new IllegalArgumentException("secret_key_forbidden");if(v.contains("-----begin private key-----")||v.startsWith("sk-")||v.contains("password="))throw new IllegalArgumentException("secret_value_forbidden");}}
    static void req(String v,String n){if(v==null||v.isBlank())throw new IllegalArgumentException(n);}
}
