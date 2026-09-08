package org.systemmaster.continuity;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Current-authority gate. Historical attempt authority never implies current recovery authority. */
public final class RecoveryAuthorizationGate {
    public enum Decision { ALLOW, DENY, UNKNOWN }
    public enum AuthorityState { ACTIVE, REVOKED, CANCELLED, UNKNOWN }
    public enum Eligibility { ELIGIBLE, RESTRICTED, UNKNOWN }
    public enum SecretState { AVAILABLE, MISSING, REVOKED, UNKNOWN }

    public interface AuthorityProbe {
        AuthorityState currentAuthority(String workUnitId, String principalId);
        Eligibility currentEligibility(String workUnitId, String principalId);
        boolean cancellationRequested(String workUnitId);
    }
    public interface SecretReferenceResolver { SecretState resolve(String secretReference); }

    public record CheckpointMaterial(String classification, List<String> secretReferences, boolean containsInlineSensitiveMaterial) {
        public CheckpointMaterial {
            classification = req(classification, "classification");
            secretReferences = List.copyOf(secretReferences == null ? List.of() : secretReferences);
        }
    }
    public record Result(Decision decision, String reason, List<String> evidence, Instant evaluatedAt) {
        public Result { evidence = List.copyOf(evidence == null ? List.of() : evidence); }
        public boolean allowed() { return decision == Decision.ALLOW; }
    }

    private final AuthorityProbe authority;
    private final SecretReferenceResolver secrets;
    public RecoveryAuthorizationGate(AuthorityProbe authority, SecretReferenceResolver secrets) {
        this.authority = Objects.requireNonNull(authority);
        this.secrets = Objects.requireNonNull(secrets);
    }

    public Result revalidateRecoveryAuthority(String workUnitId, String principalId, List<String> secretReferences) {
        workUnitId = req(workUnitId, "workUnitId"); principalId = req(principalId, "principalId");
        List<String> evidence = new ArrayList<>();
        if (authority.cancellationRequested(workUnitId)) return result(Decision.DENY, "CURRENT_CANCELLATION_OUTRANKS_OLD_PLAN", evidence);
        AuthorityState state = authority.currentAuthority(workUnitId, principalId);
        evidence.add("authority:" + state);
        if (state == AuthorityState.REVOKED || state == AuthorityState.CANCELLED) return result(Decision.DENY, "CURRENT_AUTHORITY_REVOKED", evidence);
        if (state != AuthorityState.ACTIVE) return result(Decision.UNKNOWN, "CURRENT_AUTHORITY_UNKNOWN", evidence);
        Eligibility eligibility = authority.currentEligibility(workUnitId, principalId);
        evidence.add("eligibility:" + eligibility);
        if (eligibility == Eligibility.RESTRICTED) return result(Decision.DENY, "CURRENT_ELIGIBILITY_RESTRICTED", evidence);
        if (eligibility != Eligibility.ELIGIBLE) return result(Decision.UNKNOWN, "CURRENT_ELIGIBILITY_UNKNOWN", evidence);
        for (String ref : secretReferences == null ? List.<String>of() : secretReferences) {
            String secretRef = req(ref, "secretReference");
            SecretState secretState = secrets.resolve(secretRef);
            evidence.add("secret-ref:" + secretRef + ":" + secretState);
            if (secretState == SecretState.MISSING || secretState == SecretState.REVOKED) return result(Decision.DENY, "SECRET_REFERENCE_UNAVAILABLE", evidence);
            if (secretState != SecretState.AVAILABLE) return result(Decision.UNKNOWN, "SECRET_REFERENCE_UNKNOWN", evidence);
        }
        return result(Decision.ALLOW, "CURRENT_AUTHORITY_CONFIRMED", evidence);
    }

    public Result authorizeSignalRecovery(String workUnitId, String principalId, String signalId, List<String> secretReferences) {
        req(signalId, "signalId");
        return revalidateRecoveryAuthority(workUnitId, principalId, secretReferences);
    }

    public Result validateCheckpointMaterial(CheckpointMaterial material) {
        Objects.requireNonNull(material);
        if (material.containsInlineSensitiveMaterial()) return result(Decision.DENY, "INLINE_SENSITIVE_MATERIAL_FORBIDDEN", List.of("classification:" + material.classification()));
        for (String ref : material.secretReferences()) {
            if (ref == null || ref.isBlank()) return result(Decision.DENY, "INVALID_SECRET_REFERENCE", List.of("classification:" + material.classification()));
        }
        return result(Decision.ALLOW, "CLASSIFIED_REFERENCE_ONLY_CHECKPOINT", List.of("classification:" + material.classification()));
    }

    private static Result result(Decision d, String reason, List<String> evidence) { return new Result(d, reason, evidence, Instant.now()); }
    static String req(String value, String field) { if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " required"); return value; }
}
