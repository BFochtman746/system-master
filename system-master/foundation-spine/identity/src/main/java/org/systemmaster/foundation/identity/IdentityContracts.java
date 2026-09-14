package org.systemmaster.foundation.identity;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/**
 * O-WP-001 typed contracts for stable principal identity, aliases and lifecycle.
 *
 * Requirement lineage: O-RQ-001,002,005,051,052,055,102-104,157-163,
 * 256,271,288,289,300,316.
 */
public final class IdentityContracts {
    private IdentityContracts() {}

    private static final Pattern ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
    private static final Pattern KIND = Pattern.compile("[A-Z][A-Z0-9_]{0,31}");
    private static final Pattern DIGEST_OR_REF = Pattern.compile("(?:sha256:[0-9a-f]{64}|ref:[A-Za-z0-9][A-Za-z0-9._:/-]{0,255})");

    public enum PrincipalStatus {
        CANDIDATE, ENROLLED, ACTIVE, SUSPENDED, DISABLED, RETIRED, QUARANTINED
    }

    public enum AliasStanding {
        ACTIVE, RETIRED, QUARANTINED
    }

    public record PrincipalKind(String value) {
        public PrincipalKind {
            value = requireMatch("kind", value, KIND);
        }
    }

    public record Principal(
            String principalId,
            PrincipalKind kind,
            PrincipalStatus status,
            Instant createdAt,
            long currentRevision,
            List<String> authorityRefs,
            List<String> evidenceRefs) {
        public Principal {
            principalId = requireId("principalId", principalId);
            kind = Objects.requireNonNull(kind, "kind");
            status = Objects.requireNonNull(status, "status");
            createdAt = Objects.requireNonNull(createdAt, "createdAt");
            if (currentRevision < 1) throw new IllegalArgumentException("currentRevision must be >= 1");
            authorityRefs = immutableRefs(authorityRefs);
            evidenceRefs = immutableRefs(evidenceRefs);
        }
    }

    public record PrincipalRevision(
            String principalId,
            long revision,
            Map<String, String> displayMetadata,
            PrincipalStatus status,
            Long parentRevision,
            Instant changedAt,
            String reason,
            List<String> evidenceRefs) {
        public PrincipalRevision {
            principalId = requireId("principalId", principalId);
            if (revision < 1) throw new IllegalArgumentException("revision must be >= 1");
            if (parentRevision != null && (parentRevision < 1 || parentRevision >= revision)) {
                throw new IllegalArgumentException("parentRevision must reference an earlier revision");
            }
            displayMetadata = Map.copyOf(displayMetadata == null ? Map.of() : displayMetadata);
            for (var entry : displayMetadata.entrySet()) {
                requireBounded("metadata key", entry.getKey(), 64);
                requireBounded("metadata value", entry.getValue(), 512);
            }
            status = Objects.requireNonNull(status, "status");
            changedAt = Objects.requireNonNull(changedAt, "changedAt");
            reason = requireBounded("reason", reason, 512);
            evidenceRefs = immutableRefs(evidenceRefs);
        }
    }

    public record PrincipalAlias(
            String aliasId,
            String principalId,
            String aliasType,
            String valueDigestOrRef,
            String issuerOrNamespace,
            Instant validFrom,
            Instant validTo,
            AliasStanding standing) {
        public PrincipalAlias {
            aliasId = requireId("aliasId", aliasId);
            principalId = requireId("principalId", principalId);
            aliasType = requireBounded("aliasType", aliasType, 64).toUpperCase(Locale.ROOT);
            valueDigestOrRef = requireMatch("valueDigestOrRef", valueDigestOrRef, DIGEST_OR_REF);
            issuerOrNamespace = requireBounded("issuerOrNamespace", issuerOrNamespace, 128);
            validFrom = Objects.requireNonNull(validFrom, "validFrom");
            if (validTo != null && !validTo.isAfter(validFrom)) {
                throw new IllegalArgumentException("validTo must be after validFrom");
            }
            standing = Objects.requireNonNull(standing, "standing");
        }

        public boolean currentAt(Instant now) {
            return standing == AliasStanding.ACTIVE
                    && !now.isBefore(validFrom)
                    && (validTo == null || now.isBefore(validTo));
        }

        public String collisionKey() {
            return aliasType + "\u001f" + issuerOrNamespace + "\u001f" + valueDigestOrRef;
        }
    }

    public record MutationContext(String commandId, String actorPrincipalRef, List<String> authorityEvidenceRefs) {
        public MutationContext {
            commandId = requireId("commandId", commandId);
            actorPrincipalRef = requireId("actorPrincipalRef", actorPrincipalRef);
            authorityEvidenceRefs = immutableRefs(authorityEvidenceRefs);
            if (authorityEvidenceRefs.isEmpty()) {
                throw new IllegalArgumentException("authorityEvidenceRefs must not be empty");
            }
        }
    }

    public record RegisterPrincipalRequest(
            MutationContext context,
            String principalId,
            PrincipalKind kind,
            PrincipalStatus initialStatus,
            Map<String, String> displayMetadata,
            List<String> authorityRefs,
            List<String> evidenceRefs) {}

    public record RevisePrincipalRequest(
            MutationContext context,
            String principalId,
            long expectedRevision,
            Map<String, String> displayMetadata,
            String reason,
            List<String> evidenceRefs) {}

    public record RegisterPrincipalAliasRequest(
            MutationContext context,
            String aliasId,
            String principalId,
            long expectedPrincipalRevision,
            String aliasType,
            String valueDigestOrRef,
            String issuerOrNamespace,
            Instant validFrom,
            Instant validTo) {}

    public record ChangePrincipalStandingRequest(
            MutationContext context,
            String principalId,
            long expectedRevision,
            PrincipalStatus newStatus,
            String reason,
            String supersededByPrincipalId,
            String adjudicationRef,
            List<String> evidenceRefs) {}

    public record MutationResult(long journalRevision, boolean changed, Principal principal) {}

    public enum ErrorCode {
        INVALID_ARGUMENT, NOT_FOUND, CONFLICT, STALE_BASE, UNAUTHENTICATED, DENIED,
        REAUTH_REQUIRED, REVOKED, EXPIRED, BLOCKED_DEPENDENCY, AMBIGUOUS,
        QUARANTINED, UNAVAILABLE, CORRUPT_STATE
    }

    public static final class IdentityException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final ErrorCode code;
        public IdentityException(ErrorCode code, String message) {
            super(message);
            this.code = Objects.requireNonNull(code, "code");
        }
        public ErrorCode code() { return code; }
    }

    static String requireId(String name, String value) {
        return requireMatch(name, value, ID);
    }

    static String requireMatch(String name, String value, Pattern pattern) {
        Objects.requireNonNull(value, name);
        if (!pattern.matcher(value).matches()) throw new IllegalArgumentException(name + " invalid");
        return value;
    }

    static String requireBounded(String name, String value, int max) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " invalid length");
        return value;
    }

    static List<String> immutableRefs(List<String> refs) {
        List<String> safe = List.copyOf(refs == null ? List.of() : refs);
        for (String ref : safe) requireBounded("reference", ref, 512);
        return safe;
    }
}
