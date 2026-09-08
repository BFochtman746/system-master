package org.systemmaster.core;

import static org.systemmaster.core.CrossDomainContracts.*;
import java.time.Instant;
import java.util.Objects;

/** 021F adapter: authorizes consequential change bindings but never owns deployment/provider/resource truth. */
public final class ChangeCoordinatorAdapter {
    public record AdapterDecision(boolean allowed, String disposition, String subjectDigest, String externalStandingDigest, String decisionDigest) {}

    public AdapterDecision authorizeDeployment(ChangeSubject change, String authorizationDigest, String deploymentSubjectDigest, String declaredOwner) {
        Objects.requireNonNull(change); CrossDomainContracts.checkDigest(authorizationDigest,"authorizationDigest"); CrossDomainContracts.checkDigest(deploymentSubjectDigest,"deploymentSubjectDigest");
        if (!"021S".equals(declaredOwner)) return deny("DEPLOYMENT_OWNER_MISMATCH", change.digest(), deploymentSubjectDigest);
        String d=CrossDomainContracts.sha256(change.digest()+"|"+authorizationDigest+"|"+deploymentSubjectDigest+"|021S");
        return new AdapterDecision(true,"AUTHORIZED_FOR_021S_EXECUTION_ONLY",change.digest(),deploymentSubjectDigest,d);
    }

    public AdapterDecision evaluateProviderImpact(ChangeSubject change, ProviderImpact provider) {
        Objects.requireNonNull(change); Objects.requireNonNull(provider);
        return switch(provider.standing()) {
            case ELIGIBLE -> allow("PROVIDER_CURRENT_ELIGIBLE",change.digest(),provider.digest());
            case RESTRICTED -> deny("PROVIDER_RESTRICTED_REPLAN",change.digest(),provider.digest());
            case PROHIBITED -> deny("PROVIDER_PROHIBITED",change.digest(),provider.digest());
            case UNKNOWN -> deny("PROVIDER_UNKNOWN_FAIL_CLOSED",change.digest(),provider.digest());
        };
    }

    public AdapterDecision evaluateResourceAdmission(ChangeSubject change, ResourceAdmission admission, Instant now) {
        Objects.requireNonNull(change); Objects.requireNonNull(admission); Objects.requireNonNull(now);
        if (!admission.expiresAt().isAfter(now)) return deny("RESOURCE_ADMISSION_STALE",change.digest(),admission.digest());
        return switch(admission.standing()) {
            case ADMITTED -> allow("RESOURCE_ADMISSION_CURRENT",change.digest(),admission.digest());
            case DEFERRED -> deny("RESOURCE_DEFERRED_WAIT",change.digest(),admission.digest());
            case REJECTED -> deny("RESOURCE_REJECTED",change.digest(),admission.digest());
            case UNKNOWN -> deny("RESOURCE_UNKNOWN_FAIL_CLOSED",change.digest(),admission.digest());
        };
    }

    private static AdapterDecision allow(String why,String s,String x){ return new AdapterDecision(true,why,s,x,CrossDomainContracts.sha256("ALLOW|"+why+"|"+s+"|"+x)); }
    private static AdapterDecision deny(String why,String s,String x){ return new AdapterDecision(false,why,s,x,CrossDomainContracts.sha256("DENY|"+why+"|"+s+"|"+x)); }
}
