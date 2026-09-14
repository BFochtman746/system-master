package org.systemmaster.foundation.contracts;

import java.io.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public final class ContractAuthorityRuntime {
    public enum ContractKind { COMMAND, QUERY, EVENT, API, RECEIPT, STATE_SCHEMA, PROTOCOL }
    public enum CompatibilityMode { BACKWARD, FORWARD, FULL }
    public enum CompatibilityScope { LATEST, TRANSITIVE }
    public enum Decision { COMPATIBLE, MIGRATION_REQUIRED, INCOMPATIBLE, UNKNOWN, VALIDATOR_ERROR }
    public enum LifecycleStanding { ACTIVE, DEPRECATED, SUNSET }
    public enum GateStanding { ADMITTED, MIGRATION_REQUIRED, REJECTED }
    public enum LegacyStanding { MAPPED, QUARANTINED_AMBIGUOUS, UNMAPPED, STALE_OWNER }
    public enum EvidenceClass { CURRENT_EXACT, HISTORICAL_PROVENANCE }

    public record SemanticVersion(int major, int minor, int patch) implements Comparable<SemanticVersion> {
        public SemanticVersion {
            if (major < 0 || minor < 0 || patch < 0) throw new IllegalArgumentException("INVALID_VERSION");
        }
        public static SemanticVersion parse(String value) {
            require(value, "version");
            String[] p = value.split("\\.", -1);
            if (p.length != 3) throw new IllegalArgumentException("INVALID_VERSION");
            try { return new SemanticVersion(Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2])); }
            catch (NumberFormatException e) { throw new IllegalArgumentException("INVALID_VERSION", e); }
        }
        @Override public int compareTo(SemanticVersion other) {
            int x = Integer.compare(major, other.major); if (x != 0) return x;
            x = Integer.compare(minor, other.minor); if (x != 0) return x;
            return Integer.compare(patch, other.patch);
        }
        @Override public String toString() { return major + "." + minor + "." + patch; }
    }

    public record ContractSubjectV1(String subjectId, ContractKind kind, String semanticOwnerSystemId,
                                    String schemaFormat, String versionScheme, String createdAtRef) {
        public ContractSubjectV1 {
            require(subjectId,"subjectId"); Objects.requireNonNull(kind,"kind"); require(semanticOwnerSystemId,"semanticOwnerSystemId");
            require(schemaFormat,"schemaFormat"); require(versionScheme,"versionScheme"); require(createdAtRef,"createdAtRef");
            rejectSecret(subjectId); rejectSecret(semanticOwnerSystemId); rejectSecret(schemaFormat); rejectSecret(versionScheme); rejectSecret(createdAtRef);
        }
    }

    public record VersionDraft(String subjectId, SemanticVersion version, String schemaDigest,
                               String canonicalizationId, String schemaArtifactRef) {
        public VersionDraft {
            require(subjectId,"subjectId"); Objects.requireNonNull(version,"version"); digest(schemaDigest,"schemaDigest");
            require(canonicalizationId,"canonicalizationId"); require(schemaArtifactRef,"schemaArtifactRef");
            rejectSecret(subjectId); rejectSecret(canonicalizationId); rejectSecret(schemaArtifactRef);
        }
    }

    public record ContractVersionV1(String subjectId, SemanticVersion version, String schemaDigest,
                                    String canonicalizationId, String schemaArtifactRef, long introducedRegistryRevision) {}

    public record CompatibilityPolicyV1(String subjectId, String policyId, long policyRevision,
                                        CompatibilityMode mode, CompatibilityScope scope,
                                        String validatorId, String validatorVersion, String configDigest) {
        public CompatibilityPolicyV1 {
            require(subjectId,"subjectId"); require(policyId,"policyId"); if (policyRevision < 1) throw new IllegalArgumentException("policyRevision");
            Objects.requireNonNull(mode,"mode"); Objects.requireNonNull(scope,"scope"); require(validatorId,"validatorId"); require(validatorVersion,"validatorVersion");
            if (configDigest != null) digest(configDigest,"configDigest");
            rejectSecret(subjectId); rejectSecret(policyId); rejectSecret(validatorId); rejectSecret(validatorVersion);
        }
    }

    public record CompatibilityDecisionReceiptV1(String subjectId,
                                                  SemanticVersion producerVersion, String producerSchemaDigest,
                                                  SemanticVersion consumerVersion, String consumerSchemaDigest,
                                                  String policyId, long policyRevision,
                                                  String validatorId, String validatorVersion,
                                                  CompatibilityMode mode, CompatibilityScope scope,
                                                  Decision decision, List<String> reasonCodes, String decisionDigest) {
        public CompatibilityDecisionReceiptV1 { reasonCodes = List.copyOf(reasonCodes); digest(decisionDigest,"decisionDigest"); }
    }

    public record MigrationEdgeV1(String subjectId,
                                  SemanticVersion fromVersion, String fromSchemaDigest,
                                  SemanticVersion toVersion, String toSchemaDigest,
                                  String migrationId, String migrationArtifactDigest,
                                  String migrationContractVersion, String reversibilityStanding) {
        public MigrationEdgeV1 {
            require(subjectId,"subjectId"); Objects.requireNonNull(fromVersion); Objects.requireNonNull(toVersion);
            digest(fromSchemaDigest,"fromSchemaDigest"); digest(toSchemaDigest,"toSchemaDigest"); require(migrationId,"migrationId");
            digest(migrationArtifactDigest,"migrationArtifactDigest"); require(migrationContractVersion,"migrationContractVersion"); require(reversibilityStanding,"reversibilityStanding");
            rejectSecret(subjectId); rejectSecret(migrationId); rejectSecret(migrationContractVersion); rejectSecret(reversibilityStanding);
        }
        public String key() { return subjectId + "|" + fromVersion + "|" + toVersion; }
    }

    public record ContractLifecycleV1(String subjectId, SemanticVersion version, LifecycleStanding standing,
                                      String replacementRef, String effectiveRef, List<String> reasonCodes) {
        public ContractLifecycleV1 { reasonCodes = List.copyOf(reasonCodes); }
    }

    public record GateReceipt(String subjectId, SemanticVersion requestedVersion, String requestedDigest,
                              SemanticVersion currentVersion, String currentDigest,
                              LifecycleStanding lifecycleStanding, String compatibilityDecisionDigest,
                              String migrationEdgeKey, long observedRegistryRevision,
                              GateStanding standing, List<String> reasonCodes) {
        public GateReceipt { reasonCodes = List.copyOf(reasonCodes); }
    }

    public record LegacyBinding(String legacyAuthority, String legacyId, String canonicalSubjectId,
                                LegacyStanding standing, List<String> candidates, String semanticOwnerSystemId) {
        public LegacyBinding { candidates = List.copyOf(candidates); }
    }

    public record MigrationCheckpointV1(int nextIndex, String inputSetDigest, String migrationEdgeDigest,
                                        String implementationVersion) {}

    public record ExactSubjectEvidence(String subjectDigest, EvidenceClass evidenceClass) {
        public ExactSubjectEvidence { digest(subjectDigest,"subjectDigest"); Objects.requireNonNull(evidenceClass); }
        public boolean qualifies(String expectedDigest) { return evidenceClass == EvidenceClass.CURRENT_EXACT && subjectDigest.equals(expectedDigest); }
    }

    public interface OwnerAuthority { boolean known(String ownerId); }
    public interface CanonicalizerAuthority { boolean known(String canonicalizerId); }
    public interface CompatibilityValidator {
        String id(); String version();
        Decision evaluate(CompatibilityMode mode, ContractVersionV1 reference, VersionDraft candidate);
    }

    public static final class MatrixCompatibilityValidator implements CompatibilityValidator {
        private final String id, version;
        private final Map<String, Decision> decisions = new HashMap<>();
        private boolean throwError;
        public MatrixCompatibilityValidator(String id, String version) { this.id=require(id,"id"); this.version=require(version,"version"); }
        public MatrixCompatibilityValidator decide(CompatibilityMode mode, String referenceDigest, String candidateDigest, Decision decision) {
            decisions.put(mode+"|"+referenceDigest+"|"+candidateDigest, Objects.requireNonNull(decision)); return this;
        }
        public MatrixCompatibilityValidator throwError(boolean v) { throwError=v; return this; }
        @Override public String id(){return id;} @Override public String version(){return version;}
        @Override public Decision evaluate(CompatibilityMode mode, ContractVersionV1 reference, VersionDraft candidate) {
            if (throwError) throw new IllegalStateException("validator_error");
            return decisions.getOrDefault(mode+"|"+reference.schemaDigest()+"|"+candidate.schemaDigest(), Decision.UNKNOWN);
        }
    }

    public static final class ContractException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final String code;
        public ContractException(String code) { super(code); this.code=code; }
        public String code(){return code;}
    }

    private static final Map<Path,Object> JVM_LOCKS = new ConcurrentHashMap<>();
    private final Path journalPath;
    private final Path lockPath;
    private final OwnerAuthority ownerAuthority;
    private final CanonicalizerAuthority canonicalizerAuthority;
    private final Map<String,CompatibilityValidator> validators;

    public ContractAuthorityRuntime(Path directory, OwnerAuthority owners, CanonicalizerAuthority canonicalizers,
                                    Collection<? extends CompatibilityValidator> validators) {
        try { Files.createDirectories(directory); } catch (IOException e) { throw new UncheckedIOException(e); }
        this.journalPath=directory.resolve("contracts.journal");
        this.lockPath=directory.resolve("contracts.lock");
        this.ownerAuthority=Objects.requireNonNull(owners); this.canonicalizerAuthority=Objects.requireNonNull(canonicalizers);
        Map<String,CompatibilityValidator> m=new HashMap<>();
        for (CompatibilityValidator v:validators) m.put(v.id()+"@"+v.version(),v);
        this.validators=Map.copyOf(m);
    }

    public long registryRevision(){ synchronized(jvmLock()) { return load().revision; } }

    public ContractSubjectV1 createSubject(String commandId, long expectedRevision, ContractSubjectV1 subject) {
        require(commandId,"commandId"); Objects.requireNonNull(subject);
        String requestHash=sha256("CREATE_SUBJECT|"+encodeSubject(subject));
        return mutate(commandId,requestHash,expectedRevision,state -> {
            if (!ownerAuthority.known(subject.semanticOwnerSystemId())) throw ex("SEMANTIC_OWNER_UNKNOWN");
            ContractSubjectV1 prior=state.subjects.get(subject.subjectId());
            if(prior!=null){ if(prior.equals(subject)) return Mutation.noop(prior); throw ex("SUBJECT_IDENTITY_CONFLICT"); }
            return Mutation.event(subject,"SUBJECT",encodeSubject(subject));
        }, ContractSubjectV1.class);
    }

    public CompatibilityPolicyV1 setPolicy(String commandId,long expectedRevision,CompatibilityPolicyV1 policy){
        require(commandId,"commandId"); Objects.requireNonNull(policy);
        String requestHash=sha256("POLICY|"+encodePolicy(policy));
        return mutate(commandId,requestHash,expectedRevision,state->{
            if(!state.subjects.containsKey(policy.subjectId())) throw ex("UNKNOWN_SUBJECT");
            if(!validators.containsKey(policy.validatorId()+"@"+policy.validatorVersion())) throw ex("VALIDATOR_UNAVAILABLE");
            CompatibilityPolicyV1 prior=state.policies.get(policy.subjectId());
            if(prior!=null && policy.policyRevision()<=prior.policyRevision()){
                if(prior.equals(policy)) return Mutation.noop(prior);
                throw ex("REGISTRY_REVISION_CONFLICT");
            }
            return Mutation.event(policy,"POLICY",encodePolicy(policy));
        },CompatibilityPolicyV1.class);
    }

    public ContractVersionV1 registerVersion(String commandId,long expectedRevision,VersionDraft draft,MigrationEdgeV1 proposedEdge){
        require(commandId,"commandId"); Objects.requireNonNull(draft);
        String requestHash=sha256("VERSION|"+encodeDraft(draft)+"|"+(proposedEdge==null?"":encodeEdge(proposedEdge)));
        return mutate(commandId,requestHash,expectedRevision,state->{
            ContractSubjectV1 subject=state.subjects.get(draft.subjectId());
            if(subject==null) throw ex("UNKNOWN_SUBJECT");
            if(!canonicalizerAuthority.known(draft.canonicalizationId())) throw ex("UNKNOWN_CANONICALIZATION");
            NavigableMap<SemanticVersion,ContractVersionV1> versions=state.versions.getOrDefault(draft.subjectId(),new TreeMap<>());
            ContractVersionV1 same=versions.get(draft.version());
            if(same!=null){
                if(same.schemaDigest().equals(draft.schemaDigest()) && same.canonicalizationId().equals(draft.canonicalizationId()) && same.schemaArtifactRef().equals(draft.schemaArtifactRef())) return Mutation.noop(same);
                throw ex("VERSION_IDENTITY_CONFLICT");
            }
            ContractVersionV1 current=versions.isEmpty()?null:versions.lastEntry().getValue();
            CompatibilityDecisionReceiptV1 receipt=null;
            if(current!=null){
                CompatibilityPolicyV1 policy=state.policies.get(draft.subjectId());
                if(policy==null) throw ex("COMPATIBILITY_POLICY_MISSING");
                receipt=evaluatePolicy(state,policy,current,draft);
                if(receipt.decision()==Decision.UNKNOWN) throw ex("VALIDATOR_UNAVAILABLE");
                if(receipt.decision()==Decision.VALIDATOR_ERROR) throw ex("VALIDATOR_ERROR");
                if(receipt.decision()==Decision.INCOMPATIBLE) throw ex("INCOMPATIBLE_EVOLUTION");
                boolean majorChange=draft.version().major()!=current.version().major();
                if(majorChange){
                    if(proposedEdge==null) throw ex("MIGRATION_EDGE_REQUIRED");
                    validateEdgeAgainst(proposedEdge,current,draft);
                }
            }
            ContractVersionV1 value=new ContractVersionV1(draft.subjectId(),draft.version(),draft.schemaDigest(),draft.canonicalizationId(),draft.schemaArtifactRef(),state.revision+1);
            String payload=encodeVersion(value)+"\t"+(receipt==null?"":encodeReceipt(receipt))+"\t"+(proposedEdge==null?"":encodeEdge(proposedEdge));
            return Mutation.event(value,"VERSION",payload);
        },ContractVersionV1.class);
    }

    public MigrationEdgeV1 registerMigrationEdge(String commandId,long expectedRevision,MigrationEdgeV1 edge){
        require(commandId,"commandId"); Objects.requireNonNull(edge);
        String requestHash=sha256("EDGE|"+encodeEdge(edge));
        return mutate(commandId,requestHash,expectedRevision,state->{
            var versions=state.versions.get(edge.subjectId()); if(versions==null) throw ex("UNKNOWN_SUBJECT");
            ContractVersionV1 from=versions.get(edge.fromVersion()), to=versions.get(edge.toVersion());
            if(from==null||to==null) throw ex("UNKNOWN_VERSION");
            if(!from.schemaDigest().equals(edge.fromSchemaDigest())||!to.schemaDigest().equals(edge.toSchemaDigest())) throw ex("MIGRATION_EDGE_CONFLICT");
            MigrationEdgeV1 prior=state.edges.get(edge.key());
            if(prior!=null){if(prior.equals(edge))return Mutation.noop(prior);throw ex("MIGRATION_EDGE_CONFLICT");}
            return Mutation.event(edge,"EDGE",encodeEdge(edge));
        },MigrationEdgeV1.class);
    }

    public ContractLifecycleV1 setLifecycle(String commandId,long expectedRevision,ContractLifecycleV1 lifecycle){
        require(commandId,"commandId"); Objects.requireNonNull(lifecycle);
        String requestHash=sha256("LIFECYCLE|"+encodeLifecycle(lifecycle));
        return mutate(commandId,requestHash,expectedRevision,state->{
            var versions=state.versions.get(lifecycle.subjectId()); if(versions==null||!versions.containsKey(lifecycle.version())) throw ex("UNKNOWN_VERSION");
            return Mutation.event(lifecycle,"LIFECYCLE",encodeLifecycle(lifecycle));
        },ContractLifecycleV1.class);
    }

    public GateReceipt resolveForMutation(String subjectId,SemanticVersion requestedVersion,String requestedDigest){
        digest(requestedDigest,"requestedDigest");
        synchronized(jvmLock()){
            State state=load();
            var versions=state.versions.get(subjectId); if(versions==null||versions.isEmpty()) return gate(subjectId,requestedVersion,requestedDigest,null,null,null,null,null,state.revision,GateStanding.REJECTED,List.of("UNKNOWN_SUBJECT"));
            ContractVersionV1 requested=versions.get(requestedVersion); if(requested==null||!requested.schemaDigest().equals(requestedDigest)) return gate(subjectId,requestedVersion,requestedDigest,versions.lastEntry().getKey(),versions.lastEntry().getValue().schemaDigest(),null,null,null,state.revision,GateStanding.REJECTED,List.of("UNKNOWN_VERSION"));
            ContractVersionV1 current=versions.lastEntry().getValue();
            ContractLifecycleV1 lc=state.lifecycle.get(versionKey(subjectId,requestedVersion)); LifecycleStanding standing=lc==null?LifecycleStanding.ACTIVE:lc.standing();
            if(standing==LifecycleStanding.SUNSET) return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,null,null,state.revision,GateStanding.REJECTED,List.of("CONTRACT_SUNSET"));
            if(requested.version().equals(current.version())) return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,null,null,state.revision,GateStanding.ADMITTED,standing==LifecycleStanding.DEPRECATED?List.of("CONTRACT_DEPRECATED"):List.of());
            CompatibilityPolicyV1 policy=state.policies.get(subjectId); if(policy==null) return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,null,null,state.revision,GateStanding.REJECTED,List.of("COMPATIBILITY_POLICY_MISSING"));
            VersionDraft candidate=new VersionDraft(subjectId,current.version(),current.schemaDigest(),current.canonicalizationId(),current.schemaArtifactRef());
            CompatibilityDecisionReceiptV1 receipt=evaluateSingle(policy,requested,candidate);
            if(receipt.decision()==Decision.COMPATIBLE){
                return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,receipt.decisionDigest(),null,state.revision,GateStanding.ADMITTED,standing==LifecycleStanding.DEPRECATED?List.of("CONTRACT_DEPRECATED"):List.of());
            }
            MigrationEdgeV1 edge=state.edges.get(subjectId+"|"+requestedVersion+"|"+current.version());
            if(edge!=null) return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,receipt.decisionDigest(),edge.key(),state.revision,GateStanding.MIGRATION_REQUIRED,List.of("MIGRATION_REQUIRED"));
            return gate(subjectId,requestedVersion,requestedDigest,current.version(),current.schemaDigest(),standing,receipt.decisionDigest(),null,state.revision,GateStanding.REJECTED,List.of(receipt.decision().name()));
        }
    }

    public LegacyBinding bindLegacy(String legacyAuthority,String legacyId,List<String> candidates,String semanticOwnerSystemId){
        require(legacyAuthority,"legacyAuthority"); require(legacyId,"legacyId"); require(semanticOwnerSystemId,"semanticOwnerSystemId");
        List<String> unique=List.copyOf(new LinkedHashSet<>(candidates));
        LegacyStanding standing; String canonical=null;
        if(!ownerAuthority.known(semanticOwnerSystemId)) standing=LegacyStanding.STALE_OWNER;
        else if(unique.size()==1){standing=LegacyStanding.MAPPED;canonical=unique.get(0);} else if(unique.size()>1)standing=LegacyStanding.QUARANTINED_AMBIGUOUS; else standing=LegacyStanding.UNMAPPED;
        return new LegacyBinding(legacyAuthority,legacyId,canonical,standing,unique,semanticOwnerSystemId);
    }

    public static void verifyMigrationCheckpoint(MigrationCheckpointV1 cp,String inputDigest,String edgeDigest,String implementationVersion){
        Objects.requireNonNull(cp); digest(inputDigest,"inputDigest"); digest(edgeDigest,"edgeDigest"); require(implementationVersion,"implementationVersion");
        if(!cp.inputSetDigest().equals(inputDigest)||!cp.migrationEdgeDigest().equals(edgeDigest)||!cp.implementationVersion().equals(implementationVersion)) throw ex("MIGRATION_CHECKPOINT_MISMATCH");
    }

    public void corruptLastByteForTest(){
        synchronized(jvmLock()){
            try(RandomAccessFile f=new RandomAccessFile(journalPath.toFile(),"rw")){ if(f.length()==0)throw new IllegalStateException(); f.seek(f.length()-2); int b=f.read(); f.seek(f.length()-2); f.write(b=='X'?'Y':'X'); }
            catch(IOException e){throw new UncheckedIOException(e);} }
    }
    public void truncateLastByteForTest(){ synchronized(jvmLock()){ try{ long n=Files.size(journalPath); try(FileChannel c=FileChannel.open(journalPath,StandardOpenOption.WRITE)){c.truncate(Math.max(0,n-1));}}catch(IOException e){throw new UncheckedIOException(e);} } }

    private Object jvmLock(){return JVM_LOCKS.computeIfAbsent(lockPath.toAbsolutePath().normalize(),p->new Object());}

    private interface Mutator { Mutation<?> apply(State state); }
    private record Mutation<T>(T result,String eventType,String payload,boolean noop){
        static <T> Mutation<T> event(T result,String eventType,String payload){return new Mutation<>(result,eventType,payload,false);} static <T> Mutation<T> noop(T result){return new Mutation<>(result,null,null,true);}
    }

    private <T> T mutate(String commandId,String requestHash,long expectedRevision,Mutator mutator,Class<T> type){
        synchronized(jvmLock()){
            try(FileChannel lockChannel=FileChannel.open(lockPath,StandardOpenOption.CREATE,StandardOpenOption.WRITE); FileLock ignored=lockChannel.lock()){
                State state=load();
                CommandMemo memo=state.commands.get(commandId);
                if(memo!=null){ if(!memo.requestHash.equals(requestHash)) throw ex("COMMAND_REPLAY_CONFLICT"); return type.cast(memo.result); }
                if(expectedRevision>=0 && expectedRevision!=state.revision) throw ex("REGISTRY_REVISION_CONFLICT");
                Mutation<?> m=mutator.apply(state);
                if(m.noop) return type.cast(m.result);
                long seq=state.revision+1;
                String eventPayload=m.eventType+"\t"+m.payload;
                append(seq,state.lastHash,commandId,requestHash,eventPayload);
                State after=load();
                CommandMemo afterMemo=after.commands.get(commandId);
                if(afterMemo==null) throw new IllegalStateException("memo_missing_after_append");
                return type.cast(afterMemo.result);
            }catch(IOException e){throw new UncheckedIOException(e);} }
    }

    private void append(long seq,String prevHash,String commandId,String requestHash,String eventPayload) throws IOException{
        String body=seq+"|"+prevHash+"|"+b64(commandId)+"|"+requestHash+"|"+b64(eventPayload);
        String eventHash=sha256(body);
        String line=body+"|"+eventHash+"\n";
        try(FileChannel ch=FileChannel.open(journalPath,StandardOpenOption.CREATE,StandardOpenOption.WRITE,StandardOpenOption.APPEND)){
            ch.write(StandardCharsets.UTF_8.encode(line)); ch.force(true);
        }
    }

    private State load(){
        State s=new State();
        if(!Files.exists(journalPath)) return s;
        try{
            byte[] bytes=Files.readAllBytes(journalPath); if(bytes.length==0)return s;
            if(bytes[bytes.length-1]!='\n')throw ex("REGISTRY_CORRUPT");
            String text=new String(bytes,StandardCharsets.UTF_8);
            String[] lines=text.substring(0,text.length()-1).split("\\n",-1);
            long expected=1; String prev="0".repeat(64);
            for(String line:lines){
                String[] p=line.split("\\|",6); if(p.length!=6)throw ex("REGISTRY_CORRUPT");
                long seq; try{seq=Long.parseLong(p[0]);}catch(NumberFormatException e){throw ex("REGISTRY_CORRUPT");}
                if(seq!=expected||!p[1].equals(prev))throw ex("REGISTRY_CORRUPT");
                String body=String.join("|",Arrays.copyOf(p,5)); if(!sha256(body).equals(p[5]))throw ex("REGISTRY_CORRUPT");
                String commandId=ub64(p[2]), requestHash=p[3], eventPayload=ub64(p[4]);
                Object result=applyEvent(s,eventPayload,seq);
                s.commands.put(commandId,new CommandMemo(requestHash,result)); s.revision=seq;s.lastHash=p[5]; expected++;prev=p[5];
            }
            return s;
        }catch(IOException|IllegalArgumentException e){ if(e instanceof ContractException ce)throw ce; throw ex("REGISTRY_CORRUPT"); }
    }

    private Object applyEvent(State s,String ep,long seq){
        String[] outer=ep.split("\\t",2); if(outer.length!=2)throw ex("REGISTRY_CORRUPT"); String type=outer[0], payload=outer[1];
        switch(type){
            case "SUBJECT" -> { ContractSubjectV1 x=decodeSubject(payload);s.subjects.put(x.subjectId(),x);return x; }
            case "POLICY" -> { CompatibilityPolicyV1 x=decodePolicy(payload);s.policies.put(x.subjectId(),x);return x; }
            case "VERSION" -> {
                String[] q=payload.split("\\t",-1); if(q.length!=3)throw ex("REGISTRY_CORRUPT"); ContractVersionV1 x=decodeVersion(q[0]);
                s.versions.computeIfAbsent(x.subjectId(),k->new TreeMap<>()).put(x.version(),x);
                if(!q[2].isEmpty()){MigrationEdgeV1 e=decodeEdge(q[2]);s.edges.put(e.key(),e);} return x;
            }
            case "EDGE" -> { MigrationEdgeV1 x=decodeEdge(payload);s.edges.put(x.key(),x);return x; }
            case "LIFECYCLE" -> { ContractLifecycleV1 x=decodeLifecycle(payload);s.lifecycle.put(versionKey(x.subjectId(),x.version()),x);return x; }
            default -> throw ex("REGISTRY_CORRUPT");
        }
    }

    private CompatibilityDecisionReceiptV1 evaluatePolicy(State state,CompatibilityPolicyV1 policy,ContractVersionV1 current,VersionDraft candidate){
        NavigableMap<SemanticVersion,ContractVersionV1> versions=state.versions.get(policy.subjectId());
        List<ContractVersionV1> refs=policy.scope()==CompatibilityScope.TRANSITIVE?new ArrayList<>(versions.values()):List.of(current);
        Decision aggregate=Decision.COMPATIBLE; List<String> reasons=new ArrayList<>(); CompatibilityDecisionReceiptV1 last=null;
        for(ContractVersionV1 ref:refs){
            last=evaluateSingle(policy,ref,candidate); reasons.add(ref.version()+":"+last.decision());
            if(last.decision()==Decision.VALIDATOR_ERROR)return last;
            if(last.decision()==Decision.UNKNOWN)aggregate=Decision.UNKNOWN;
            else if(last.decision()==Decision.INCOMPATIBLE)aggregate=Decision.INCOMPATIBLE;
            else if(last.decision()==Decision.MIGRATION_REQUIRED && aggregate==Decision.COMPATIBLE)aggregate=Decision.MIGRATION_REQUIRED;
        }
        if(last==null)throw ex("VALIDATOR_UNAVAILABLE");
        String d=decisionDigest(policy,current,candidate,aggregate,reasons);
        return new CompatibilityDecisionReceiptV1(policy.subjectId(),candidate.version(),candidate.schemaDigest(),current.version(),current.schemaDigest(),policy.policyId(),policy.policyRevision(),policy.validatorId(),policy.validatorVersion(),policy.mode(),policy.scope(),aggregate,reasons,d);
    }

    private CompatibilityDecisionReceiptV1 evaluateSingle(CompatibilityPolicyV1 policy,ContractVersionV1 reference,VersionDraft candidate){
        CompatibilityValidator validator=validators.get(policy.validatorId()+"@"+policy.validatorVersion()); if(validator==null)throw ex("VALIDATOR_UNAVAILABLE");
        Decision d; try{ d=validator.evaluate(policy.mode(),reference,candidate); }catch(RuntimeException e){d=Decision.VALIDATOR_ERROR;}
        List<String> reasons=List.of("validator="+d.name()); String digest=decisionDigest(policy,reference,candidate,d,reasons);
        return new CompatibilityDecisionReceiptV1(policy.subjectId(),candidate.version(),candidate.schemaDigest(),reference.version(),reference.schemaDigest(),policy.policyId(),policy.policyRevision(),policy.validatorId(),policy.validatorVersion(),policy.mode(),policy.scope(),d,reasons,digest);
    }

    private static String decisionDigest(CompatibilityPolicyV1 p,ContractVersionV1 ref,VersionDraft c,Decision d,List<String> reasons){
        return sha256(p.subjectId()+"|"+c.version()+"|"+c.schemaDigest()+"|"+ref.version()+"|"+ref.schemaDigest()+"|"+p.policyId()+"|"+p.policyRevision()+"|"+p.validatorId()+"|"+p.validatorVersion()+"|"+p.mode()+"|"+p.scope()+"|"+d+"|"+String.join(",",reasons));
    }
    private static void validateEdgeAgainst(MigrationEdgeV1 e,ContractVersionV1 current,VersionDraft draft){
        if(!e.subjectId().equals(draft.subjectId())||!e.fromVersion().equals(current.version())||!e.fromSchemaDigest().equals(current.schemaDigest())||!e.toVersion().equals(draft.version())||!e.toSchemaDigest().equals(draft.schemaDigest()))throw ex("MIGRATION_EDGE_CONFLICT");
    }

    private static GateReceipt gate(String sid,SemanticVersion rv,String rd,SemanticVersion cv,String cd,LifecycleStanding ls,String cr,String me,long rev,GateStanding gs,List<String> reasons){return new GateReceipt(sid,rv,rd,cv,cd,ls,cr,me,rev,gs,reasons);}
    private record CommandMemo(String requestHash,Object result){}
    private static final class State{
        long revision=0; String lastHash="0".repeat(64);
        final Map<String,ContractSubjectV1> subjects=new HashMap<>(); final Map<String,NavigableMap<SemanticVersion,ContractVersionV1>> versions=new HashMap<>();
        final Map<String,CompatibilityPolicyV1> policies=new HashMap<>(); final Map<String,MigrationEdgeV1> edges=new HashMap<>(); final Map<String,ContractLifecycleV1> lifecycle=new HashMap<>(); final Map<String,CommandMemo> commands=new HashMap<>();
    }

    private static String versionKey(String s,SemanticVersion v){return s+"@"+v;}
    private static ContractException ex(String code){return new ContractException(code);}
    private static String require(String v,String n){if(v==null||v.isBlank())throw new IllegalArgumentException(n);for(int i=0;i<v.length();i++)if(v.charAt(i)<0x20)throw new IllegalArgumentException(n+"_control_char");return v;}
    private static void digest(String v,String n){require(v,n);if(!v.matches("[0-9a-f]{64}"))throw new IllegalArgumentException(n+"_sha256");}
    private static void rejectSecret(String v){String x=v.toLowerCase(Locale.ROOT);if(x.startsWith("sk-")||x.contains("password=")||x.contains("-----begin private key-----")||x.contains("bearer "))throw ex("SECRET_FIELD_FORBIDDEN");}
    public static String sha256(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    private static String b64(String x){return Base64.getUrlEncoder().withoutPadding().encodeToString(x.getBytes(StandardCharsets.UTF_8));}
    private static String ub64(String x){return new String(Base64.getUrlDecoder().decode(x),StandardCharsets.UTF_8);}
    private static String j(String...x){return String.join("\u001f",x);}
    private static String[] u(String x,int n){String[] p=x.split("\u001f",-1);if(p.length!=n)throw ex("REGISTRY_CORRUPT");return p;}
    private static String encodeSubject(ContractSubjectV1 x){return j(x.subjectId(),x.kind().name(),x.semanticOwnerSystemId(),x.schemaFormat(),x.versionScheme(),x.createdAtRef());}
    private static ContractSubjectV1 decodeSubject(String s){String[]p=u(s,6);return new ContractSubjectV1(p[0],ContractKind.valueOf(p[1]),p[2],p[3],p[4],p[5]);}
    private static String encodeDraft(VersionDraft x){return j(x.subjectId(),x.version().toString(),x.schemaDigest(),x.canonicalizationId(),x.schemaArtifactRef());}
    private static String encodeVersion(ContractVersionV1 x){return j(x.subjectId(),x.version().toString(),x.schemaDigest(),x.canonicalizationId(),x.schemaArtifactRef(),Long.toString(x.introducedRegistryRevision()));}
    private static ContractVersionV1 decodeVersion(String s){String[]p=u(s,6);return new ContractVersionV1(p[0],SemanticVersion.parse(p[1]),p[2],p[3],p[4],Long.parseLong(p[5]));}
    private static String encodePolicy(CompatibilityPolicyV1 x){return j(x.subjectId(),x.policyId(),Long.toString(x.policyRevision()),x.mode().name(),x.scope().name(),x.validatorId(),x.validatorVersion(),x.configDigest()==null?"":x.configDigest());}
    private static CompatibilityPolicyV1 decodePolicy(String s){String[]p=u(s,8);return new CompatibilityPolicyV1(p[0],p[1],Long.parseLong(p[2]),CompatibilityMode.valueOf(p[3]),CompatibilityScope.valueOf(p[4]),p[5],p[6],p[7].isEmpty()?null:p[7]);}
    private static String encodeReceipt(CompatibilityDecisionReceiptV1 x){return j(x.subjectId(),x.producerVersion().toString(),x.producerSchemaDigest(),x.consumerVersion().toString(),x.consumerSchemaDigest(),x.policyId(),Long.toString(x.policyRevision()),x.validatorId(),x.validatorVersion(),x.mode().name(),x.scope().name(),x.decision().name(),String.join(",",x.reasonCodes()),x.decisionDigest());}
    private static String encodeEdge(MigrationEdgeV1 x){return j(x.subjectId(),x.fromVersion().toString(),x.fromSchemaDigest(),x.toVersion().toString(),x.toSchemaDigest(),x.migrationId(),x.migrationArtifactDigest(),x.migrationContractVersion(),x.reversibilityStanding());}
    private static MigrationEdgeV1 decodeEdge(String s){String[]p=u(s,9);return new MigrationEdgeV1(p[0],SemanticVersion.parse(p[1]),p[2],SemanticVersion.parse(p[3]),p[4],p[5],p[6],p[7],p[8]);}
    private static String encodeLifecycle(ContractLifecycleV1 x){return j(x.subjectId(),x.version().toString(),x.standing().name(),x.replacementRef()==null?"":x.replacementRef(),x.effectiveRef()==null?"":x.effectiveRef(),String.join(",",x.reasonCodes()));}
    private static ContractLifecycleV1 decodeLifecycle(String s){String[]p=u(s,6);return new ContractLifecycleV1(p[0],SemanticVersion.parse(p[1]),LifecycleStanding.valueOf(p[2]),p[3].isEmpty()?null:p[3],p[4].isEmpty()?null:p[4],p[5].isEmpty()?List.of():List.of(p[5].split(",")));}
}
