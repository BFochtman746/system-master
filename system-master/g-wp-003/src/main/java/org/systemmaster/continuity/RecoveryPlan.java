package org.systemmaster.continuity;

import java.time.Instant;
import java.util.List;

public record RecoveryPlan(
        String recoveryPlanId,
        long version,
        String recoveryId,
        String classificationId,
        RecoveryClassification.RecoveryClass disposition,
        String checkpointRef,
        List<String> reconcileEffectRefs,
        String requiredRuntimeCompatibility,
        String requiredAuthority,
        String resourceClass,
        List<String> steps,
        List<String> verificationCriteria,
        List<String> blockers,
        String inputStateDigest,
        String planDigest,
        Instant createdAt) {
    public RecoveryPlan {
        recoveryPlanId=required(recoveryPlanId,"recoveryPlanId");
        if(version<1)throw new IllegalArgumentException("version must be >= 1");
        recoveryId=required(recoveryId,"recoveryId");
        classificationId=required(classificationId,"classificationId");
        disposition=java.util.Objects.requireNonNull(disposition,"disposition");
        checkpointRef=normalize(checkpointRef);
        reconcileEffectRefs=List.copyOf(reconcileEffectRefs==null?List.of():reconcileEffectRefs);
        requiredRuntimeCompatibility=required(requiredRuntimeCompatibility,"requiredRuntimeCompatibility");
        requiredAuthority=required(requiredAuthority,"requiredAuthority");
        resourceClass=required(resourceClass,"resourceClass");
        steps=List.copyOf(steps==null?List.of():steps);
        verificationCriteria=List.copyOf(verificationCriteria==null?List.of():verificationCriteria);
        blockers=List.copyOf(blockers==null?List.of():blockers);
        inputStateDigest=required(inputStateDigest,"inputStateDigest");
        planDigest=required(planDigest,"planDigest");
        createdAt=java.util.Objects.requireNonNull(createdAt,"createdAt");
    }
    public boolean ready(){return blockers.isEmpty();}
    private static String required(String v,String n){String x=normalize(v);if(x==null)throw new IllegalArgumentException(n+" is required");return x;}
    private static String normalize(String v){if(v==null)return null;String x=v.trim();return x.isEmpty()?null:x;}
}
