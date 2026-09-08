package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class RecoveryQueryService {
    public enum CommandStanding { APPLIED, NOT_APPLIED, UNKNOWN }
    public interface CommandOutcomeAuthority { CommandStanding standing(String workUnitId, String commandId); }
    public interface TelemetryAuthority { boolean fresh(String workUnitId); String detail(String workUnitId); }
    public record Projection(String workUnitId, RecoveryRecord.RecoveryState state, String userVisibleState,
                             String recoverability, String progressBasis, List<String> blockers,
                             boolean telemetryFresh, String telemetryDetail, long recordVersion, Instant observedAt) {
        public Projection { blockers = List.copyOf(blockers == null ? List.of() : blockers); }
    }
    public record ReconnectDecision(String workUnitId, String commandId, CommandStanding commandStanding, boolean mayRecommand, String nextAction) {}

    private final RecoveryRegistry registry;
    private final CommandOutcomeAuthority commands;
    private final TelemetryAuthority telemetry;
    public RecoveryQueryService(RecoveryRegistry registry, CommandOutcomeAuthority commands, TelemetryAuthority telemetry) {
        this.registry=Objects.requireNonNull(registry); this.commands=Objects.requireNonNull(commands); this.telemetry=Objects.requireNonNull(telemetry);
    }
    public Projection getRecoveryStatus(String workUnitId) {
        var s=registry.getRecoveryStatus(RecoveryAuthorizationGate.req(workUnitId,"workUnitId"));
        boolean fresh=telemetry.fresh(workUnitId);
        String detail=fresh?telemetry.detail(workUnitId):"OBSERVABILITY_GAP";
        String basis=(s.progressBasis()==null||s.progressBasis().isBlank())?"STATE_ONLY_NO_PERCENT":s.progressBasis();
        return new Projection(s.workUnitId(),s.recoveryState(),s.userVisibleState(),s.recoverability(),basis,s.blockers(),fresh,detail,s.recordVersion(),Instant.now());
    }
    public ReconnectDecision reconnect(String workUnitId,String commandId) {
        workUnitId=RecoveryAuthorizationGate.req(workUnitId,"workUnitId"); commandId=RecoveryAuthorizationGate.req(commandId,"commandId");
        CommandStanding standing=commands.standing(workUnitId,commandId);
        return switch(standing){
            case APPLIED -> new ReconnectDecision(workUnitId,commandId,standing,false,"QUERY_CURRENT_STATE");
            case NOT_APPLIED -> new ReconnectDecision(workUnitId,commandId,standing,true,"SAFE_TO_RECOMMAND");
            case UNKNOWN -> new ReconnectDecision(workUnitId,commandId,standing,false,"RECONCILE_BEFORE_RECOMMAND");
        };
    }
}
