package org.systemmaster.core;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import static org.systemmaster.core.CoordinationContracts.*;

public final class ChangeCoordinator {
    private final Path journal;
    private final ExecutionLeaseManager leases = new ExecutionLeaseManager();
    private final ConflictDetector conflicts = new ConflictDetector();
    private final Map<String, ExecutionState> states = new HashMap<>();
    private final Map<String, Set<String>> activeTargets = new HashMap<>();
    private final Map<String, CommandReceipt> commands = new HashMap<>();
    private final Map<String, String> commandIdentities = new HashMap<>();
    private final Map<String, ExternalEffectIntent> intents = new HashMap<>();
    private final Map<String, EffectStanding> effectStanding = new HashMap<>();
    private final Map<String, Boolean> retrySafe = new HashMap<>();

    public ChangeCoordinator(Path journal) throws IOException {
        this.journal = Objects.requireNonNull(journal,"journal");
        if (journal.getParent()!=null) Files.createDirectories(journal.getParent());
        if (Files.exists(journal)) replayJournal();
    }

    public ExecutionLease acquireLease(String changeId, String ownerRef, Duration ttl, Instant now, TimeEvidence time) throws IOException {
        ExecutionLease lease = leases.acquire(changeId, ownerRef, ttl, now, time);
        append("LEASE", lease.changeId(), Long.toString(lease.epoch()), lease.ownerRef(), lease.fenceToken(), lease.acquiredAt().toString(), lease.expiresAt().toString());
        return lease;
    }

    public ExecutionLease renewLease(ExecutionLease lease, Duration ttl, Instant now, TimeEvidence time) throws IOException {
        ExecutionLease renewed = leases.renew(lease, ttl, now, time);
        append("LEASE", renewed.changeId(), Long.toString(renewed.epoch()), renewed.ownerRef(), renewed.fenceToken(), renewed.acquiredAt().toString(), renewed.expiresAt().toString());
        return renewed;
    }

    public CommandReceipt beginChange(CommandRequest req, Instant now, TimeEvidence time) throws IOException {
        ExecutionLeaseManager.requireTrustedTime(now, time);
        validateGrant(req, now);
        leases.requireMutationAuthority(req.changeId(), req.executionEpoch(), req.fenceToken(), now);
        if (states.get(req.changeId()) == ExecutionState.PENDING_RECONCILIATION) throw new IllegalStateException("RECONCILIATION_REQUIRED");
        if (states.get(req.changeId()) == ExecutionState.PAUSED || states.get(req.changeId()) == ExecutionState.HALTED || states.get(req.changeId()) == ExecutionState.CANCELLED)
            throw new IllegalStateException("CHANGE_NOT_EXECUTABLE:"+states.get(req.changeId()));
        String identity = commandIdentity(req);
        CommandReceipt prior = commands.get(req.idempotencyKey());
        if (prior != null) {
            if (commandIdentities.get(req.idempotencyKey()).equals(identity))
                return new CommandReceipt(prior.changeId(), prior.idempotencyKey(), prior.payloadDigest(), ReplayDisposition.REPLAY_SAME_RESULT,
                        prior.resultDigest(), prior.state(), prior.epoch(), prior.recordedAt());
            append("IDEMPOTENCY_CONFLICT", req.idempotencyKey(), identity, commandIdentities.get(req.idempotencyKey()));
            throw new IllegalStateException("IDEMPOTENCY_KEY_CONFLICT");
        }
        Optional<ConflictDetector.TargetConflict> conflict = conflicts.check(req.changeId(), req.targetRefs(), activeTargets, req.overlapPolicy());
        if (conflict.isPresent() && conflict.get().disposition() != ConflictDisposition.COMPATIBLE_COMPOSITE) {
            append("TARGET_CONFLICT", req.changeId(), conflict.get().existingChangeId(), String.join(",",new TreeSet<>(conflict.get().overlappingTargets())), conflict.get().disposition().name());
            throw new IllegalStateException("TARGET_CONFLICT:"+conflict.get().disposition());
        }
        states.put(req.changeId(), ExecutionState.RUNNING); activeTargets.put(req.changeId(), Set.copyOf(req.targetRefs()));
        String resultDigest = sha256("FWP007-RESULT-V1|"+identity+"|epoch="+req.executionEpoch());
        CommandReceipt receipt = new CommandReceipt(req.changeId(), req.idempotencyKey(), req.payloadDigest(), ReplayDisposition.FIRST_APPLY,
                resultDigest, ExecutionState.RUNNING, req.executionEpoch(), now);
        commands.put(req.idempotencyKey(), receipt); commandIdentities.put(req.idempotencyKey(), identity);
        append("COMMAND", req.changeId(), req.idempotencyKey(), req.payloadDigest(), identity, resultDigest, Long.toString(req.executionEpoch()), now.toString(), String.join(",",new TreeSet<>(req.targetRefs())));
        append("STATE", req.changeId(), ExecutionState.RUNNING.name());
        return receipt;
    }

    public ExternalEffectIntent recordExternalIntent(String changeId, long revision, long epoch, String fenceToken,
            String stepId, String targetRef, String payloadDigest, String idempotencyKey, Instant now) throws IOException {
        leases.requireMutationAuthority(changeId, epoch, fenceToken, now);
        requireRunning(changeId);
        String intentId = UUID.randomUUID().toString();
        ExternalEffectIntent intent = new ExternalEffectIntent(intentId, changeId, revision, epoch, stepId, targetRef, payloadDigest, idempotencyKey, null);
        intents.put(intentId, intent); effectStanding.put(intentId, EffectStanding.INTENT_RECORDED); retrySafe.put(intentId, false);
        append("EFFECT_INTENT", intent.intentId(), changeId, Long.toString(revision), Long.toString(epoch), stepId, targetRef, payloadDigest, idempotencyKey, intent.intentDigest());
        return intent;
    }

    public void recordExternalObservation(ExternalEffectObservation observation) throws IOException {
        ExternalEffectIntent intent = intents.get(observation.intentId());
        if (intent == null) throw new IllegalArgumentException("UNKNOWN_INTENT");
        effectStanding.put(intent.intentId(), observation.standing()); retrySafe.put(intent.intentId(), observation.standing()==EffectStanding.NOT_APPLIED);
        append("EFFECT_OBS", intent.intentId(), observation.standing().name(), nullToEmpty(observation.receiptDigest()), observation.observedAt().toString());
        if (observation.standing()==EffectStanding.UNKNOWN || observation.standing()==EffectStanding.DIVERGED) {
            states.put(intent.changeId(), ExecutionState.PENDING_RECONCILIATION);
            append("STATE", intent.changeId(), ExecutionState.PENDING_RECONCILIATION.name());
        }
    }

    public void reconcile(ReconciliationDecision decision) throws IOException {
        ExternalEffectIntent intent = intents.get(decision.intentId());
        if (intent == null) throw new IllegalArgumentException("UNKNOWN_INTENT");
        EffectStanding current = effectStanding.get(intent.intentId());
        if (!(current==EffectStanding.UNKNOWN || current==EffectStanding.DIVERGED)) throw new IllegalStateException("RECONCILIATION_NOT_REQUIRED");
        effectStanding.put(intent.intentId(), decision.resolvedStanding()); retrySafe.put(intent.intentId(), decision.retrySafe());
        append("RECONCILE", intent.intentId(), decision.resolvedStanding().name(), Boolean.toString(decision.retrySafe()), decision.evidenceDigest(), decision.decisionDigest());
        if (unresolvedEffects(intent.changeId()).isEmpty()) {
            states.put(intent.changeId(), ExecutionState.RUNNING); append("STATE", intent.changeId(), ExecutionState.RUNNING.name());
        }
    }

    public boolean canRetryIntent(String intentId) {
        EffectStanding s = effectStanding.get(intentId);
        return Boolean.TRUE.equals(retrySafe.get(intentId)) && s == EffectStanding.NOT_APPLIED;
    }

    public void pause(String changeId, long epoch, String fenceToken, Instant now) throws IOException { transition(changeId, epoch, fenceToken, now, ExecutionState.PAUSED); }
    public void halt(String changeId, long epoch, String fenceToken, Instant now) throws IOException { transition(changeId, epoch, fenceToken, now, ExecutionState.HALTED); }
    public void cancel(String changeId, long epoch, String fenceToken, Instant now) throws IOException { transition(changeId, epoch, fenceToken, now, ExecutionState.CANCELLED); }
    public void complete(String changeId, long epoch, String fenceToken, Instant now) throws IOException {
        leases.requireMutationAuthority(changeId, epoch, fenceToken, now);
        if (!unresolvedEffects(changeId).isEmpty()) throw new IllegalStateException("UNRESOLVED_EXTERNAL_EFFECTS");
        states.put(changeId, ExecutionState.COMPLETED); activeTargets.remove(changeId); append("STATE", changeId, ExecutionState.COMPLETED.name());
    }

    public ExecutionState state(String changeId) { return states.getOrDefault(changeId, ExecutionState.READY); }
    public ExecutionLease currentLease(String changeId) { return leases.current(changeId); }
    public EffectStanding effectStanding(String intentId) { return effectStanding.get(intentId); }
    public Set<String> unresolvedEffects(String changeId) {
        Set<String> out = new HashSet<>();
        for (var e : intents.entrySet()) if (e.getValue().changeId().equals(changeId)) {
            EffectStanding s = effectStanding.get(e.getKey()); if (s==EffectStanding.UNKNOWN || s==EffectStanding.DIVERGED || s==EffectStanding.INTENT_RECORDED) out.add(e.getKey());
        }
        return out;
    }

    private void transition(String changeId, long epoch, String fenceToken, Instant now, ExecutionState state) throws IOException {
        leases.requireMutationAuthority(changeId, epoch, fenceToken, now);
        states.put(changeId, state); if (state==ExecutionState.HALTED || state==ExecutionState.CANCELLED) activeTargets.remove(changeId);
        append("STATE", changeId, state.name());
    }

    private void validateGrant(CommandRequest req, Instant now) {
        GrantRef g=req.grant();
        if (!g.changeId().equals(req.changeId()) || g.revision()!=req.revision()) throw new SecurityException("GRANT_CHANGE_REVISION_MISMATCH");
        if (!g.targetRefs().equals(req.targetRefs())) throw new SecurityException("GRANT_TARGET_MISMATCH");
        if (!g.action().equals("CHANGE_EXECUTE")) throw new SecurityException("GRANT_ACTION_MISMATCH");
        if (!now.isBefore(g.expiresAt())) throw new SecurityException("GRANT_EXPIRED");
    }

    private void requireRunning(String changeId) {
        if (state(changeId)!=ExecutionState.RUNNING) throw new IllegalStateException("CHANGE_NOT_RUNNING:"+state(changeId));
    }

    private void replayJournal() throws IOException {
        for (String line : Files.readAllLines(journal, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue; String[] p=line.split("\\|",-1); String type=p[0];
            switch(type) {
                case "LEASE" -> leases.restore(new ExecutionLease(p[1],Long.parseLong(p[2]),p[3],p[4],Instant.parse(p[5]),Instant.parse(p[6])));
                case "COMMAND" -> {
                    String changeId=p[1], key=p[2], payload=p[3], identity=p[4], result=p[5]; long epoch=Long.parseLong(p[6]); Instant at=Instant.parse(p[7]);
                    commands.put(key,new CommandReceipt(changeId,key,payload,ReplayDisposition.FIRST_APPLY,result,ExecutionState.RUNNING,epoch,at));
                    commandIdentities.put(key,identity); Set<String> targets=parseSet(p[8]); if(!targets.isEmpty()) activeTargets.put(changeId,targets);
                }
                case "STATE" -> { ExecutionState s=ExecutionState.valueOf(p[2]); states.put(p[1],s); if(s==ExecutionState.HALTED||s==ExecutionState.CANCELLED||s==ExecutionState.COMPLETED) activeTargets.remove(p[1]); }
                case "EFFECT_INTENT" -> { ExternalEffectIntent i=new ExternalEffectIntent(p[1],p[2],Long.parseLong(p[3]),Long.parseLong(p[4]),p[5],p[6],p[7],p[8],p[9]); intents.put(i.intentId(),i); effectStanding.put(i.intentId(),EffectStanding.INTENT_RECORDED); retrySafe.put(i.intentId(),false); }
                case "EFFECT_OBS" -> { EffectStanding s=EffectStanding.valueOf(p[2]); effectStanding.put(p[1],s); retrySafe.put(p[1],s==EffectStanding.NOT_APPLIED); }
                case "RECONCILE" -> { effectStanding.put(p[1],EffectStanding.valueOf(p[2])); retrySafe.put(p[1],Boolean.parseBoolean(p[3])); }
                default -> { }
            }
        }
    }

    private void append(String... fields) throws IOException {
        String line=String.join("|",Arrays.stream(fields).map(ChangeCoordinator::sanitize).toList())+System.lineSeparator();
        Files.writeString(journal,line,StandardCharsets.UTF_8,StandardOpenOption.CREATE,StandardOpenOption.APPEND);
    }
    private static String sanitize(String s){ return s==null?"":s.replace("|","%7C").replace("\r"," ").replace("\n"," "); }
    private static String nullToEmpty(String s){return s==null?"":s;}
    private static Set<String> parseSet(String s){if(s==null||s.isBlank())return Set.of();return Set.copyOf(Arrays.asList(s.split(",")));}
}
