package org.systemmaster.continuity;

import java.util.*;

/** G-RQ-075/076 validation gates. */
public final class ContinuityGovernanceValidator {
    public record RequirementTrace(
            String id, List<String> research, String decision, String owner, String component,
            String dataState, String api, String invariant, String failureRecovery, String testFamily, String workPackage) {
        public RequirementTrace {
            req(id,"id"); research=List.copyOf(Objects.requireNonNull(research,"research")); if(research.isEmpty()||research.stream().anyMatch(x->x==null||x.isBlank()))throw new IllegalArgumentException("research");
            req(decision,"decision");req(owner,"owner");req(component,"component");req(dataState,"dataState");req(api,"api");req(invariant,"invariant");req(failureRecovery,"failureRecovery");req(testFamily,"testFamily");req(workPackage,"workPackage");
        }
    }
    public record StatusAxes(boolean architectureBuildSpecClosed, boolean computerImplemented, boolean executableQualified, boolean targetPlatformProven, boolean empiricalHumanProven) {}

    public static void validateTraceability(List<RequirementTrace> traces, int expectedCount) {
        Objects.requireNonNull(traces,"traces"); if(traces.size()!=expectedCount)throw new IllegalStateException("requirement_count_mismatch");
        Set<String> ids=new HashSet<>(); for(var t:traces) if(!ids.add(t.id()))throw new IllegalStateException("duplicate_requirement:"+t.id());
    }

    /** Architecture closure cannot be used as a claim for any empirical/runtime axis. */
    public static void validateArchitectureClosureClaim(StatusAxes s) {
        Objects.requireNonNull(s,"status"); if(!s.architectureBuildSpecClosed())throw new IllegalStateException("architecture_not_closed");
        if(s.computerImplemented()||s.executableQualified()||s.targetPlatformProven()||s.empiricalHumanProven())throw new IllegalStateException("false_cross_axis_closure_claim");
    }

    private static void req(String v,String n){if(v==null||v.isBlank())throw new IllegalArgumentException(n);}
}
