package org.systemmaster.foundation.runtime;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.systemmaster.foundation.contracts.ContractAuthorityRuntime;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.ContractException;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateReceipt;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.SemanticVersion;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityUseRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityValidationReceipt;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationHop;
import org.systemmaster.foundation.identity.DelegationRuntime.DelegationService;
import org.systemmaster.foundation.identity.IdentityContracts.ErrorCode;
import org.systemmaster.foundation.identity.IdentityContracts.IdentityException;
import org.systemmaster.foundation.root.AuthorityRegistry;
import org.systemmaster.foundation.root.AuthorityRegistry.AuthorityRecord;
import org.systemmaster.foundation.root.AuthorityRegistry.Lifecycle;

/**
 * CORE-DURABLE-RUNTIME-CONTINUITY-IDENTITY-CONTRACTS-PREFLIGHT-ADAPTER-001.
 *
 * This adapter owns no Identity, Contracts, Work/Project, Resource, Placement,
 * Effect, Evidence, Security or specialist truth. It performs a fresh,
 * side-effect-free prerequisite read before a Durable Runtime mutation boundary.
 */
public final class IdentityContractsPreflightAdapter {
    public static final String QUALIFICATION_CLASS = "HOSTED_PORTABLE_PRECONDITION_ONLY";
    public static final String IDENTITY_AUTHORITY_ID = "IDENTITY_DELEGATION";
    public static final String CONTRACTS_AUTHORITY_ID = "CONTRACTS_VERSIONING";

    public enum Standing {
        ALLOW_CURRENT_PREREQUISITES,
        DENY,
        UNKNOWN_BLOCKED
    }

    public record ContractUse(String subjectId, SemanticVersion requestedVersion, String requestedDigest) {
        public ContractUse {
            subjectId = requireText("subjectId", subjectId, 256);
            requestedVersion = Objects.requireNonNull(requestedVersion, "requestedVersion");
            requestedDigest = requireDigest("requestedDigest", requestedDigest);
        }
    }

    /**
     * requestId is content-addressed. Reusing an id with changed semantic material
     * is therefore rejected without mutable memo state and remains restart-safe.
     */
    public record PreflightRequest(
            String requestId,
            CapabilityUseRequest capabilityUse,
            ContractUse contractUse) {
        public PreflightRequest {
            capabilityUse = Objects.requireNonNull(capabilityUse, "capabilityUse");
            contractUse = Objects.requireNonNull(contractUse, "contractUse");
            String digest = semanticDigest(capabilityUse, contractUse);
            String expected = requestIdForDigest(digest);
            if (!expected.equals(requestId)) {
                throw new IllegalArgumentException("REQUEST_ID_DIGEST_CONFLICT");
            }
        }

        public static PreflightRequest create(CapabilityUseRequest capabilityUse, ContractUse contractUse) {
            String digest = semanticDigest(capabilityUse, contractUse);
            return new PreflightRequest(requestIdForDigest(digest), capabilityUse, contractUse);
        }

        public String semanticDigest() {
            return semanticDigest(capabilityUse, contractUse);
        }
    }

    public record PreflightResult(
            String requestId,
            String semanticDigest,
            Standing standing,
            CapabilityValidationReceipt identityReceipt,
            GateReceipt contractGate,
            List<String> reasonCodes,
            long observedRootRevision,
            String identityAuthorityId,
            String contractsAuthorityId,
            String qualificationClass) {
        public PreflightResult {
            requestId = Objects.requireNonNull(requestId, "requestId");
            semanticDigest = requireDigest("semanticDigest", semanticDigest);
            standing = Objects.requireNonNull(standing, "standing");
            reasonCodes = List.copyOf(reasonCodes == null ? List.of() : reasonCodes);
            identityAuthorityId = Objects.requireNonNull(identityAuthorityId, "identityAuthorityId");
            contractsAuthorityId = Objects.requireNonNull(contractsAuthorityId, "contractsAuthorityId");
            qualificationClass = Objects.requireNonNull(qualificationClass, "qualificationClass");
        }
    }

    private record ProviderBinding(
            String authorityId,
            String ownerPath,
            long admittedRevision,
            Map<String, String> currentPointers) {
        private ProviderBinding {
            currentPointers = Map.copyOf(currentPointers);
        }
    }

    private final DelegationService identity;
    private final ContractAuthorityRuntime contracts;
    private final AuthorityRegistry root;
    private final ProviderBinding identityBinding;
    private final ProviderBinding contractsBinding;

    public IdentityContractsPreflightAdapter(
            DelegationService identity,
            ContractAuthorityRuntime contracts,
            AuthorityRegistry root) {
        this.identity = Objects.requireNonNull(identity, "identity");
        this.contracts = Objects.requireNonNull(contracts, "contracts");
        this.root = Objects.requireNonNull(root, "root");
        AuthorityRegistry.Snapshot snapshot = root.snapshot();
        this.identityBinding = bind(snapshot, IDENTITY_AUTHORITY_ID);
        this.contractsBinding = bind(snapshot, CONTRACTS_AUTHORITY_ID);
    }

    public PreflightResult evaluate(PreflightRequest request) {
        Objects.requireNonNull(request, "request");
        String semanticDigest = request.semanticDigest();
        AuthorityRegistry.Snapshot rootSnapshot = root.snapshot();

        List<String> secretReasons = secretMaterialReasons(request);
        if (!secretReasons.isEmpty()) {
            return result(request, semanticDigest, Standing.DENY, null, null, secretReasons, rootSnapshot.revision());
        }

        List<String> providerReasons = providerBindingReasons(rootSnapshot);
        if (!providerReasons.isEmpty()) {
            return result(request, semanticDigest, Standing.UNKNOWN_BLOCKED, null, null,
                    providerReasons, rootSnapshot.revision());
        }

        CapabilityValidationReceipt identityReceipt;
        try {
            identityReceipt = identity.validateUse(request.capabilityUse());
        } catch (IdentityException ex) {
            Standing standing = identityStanding(ex.code());
            return result(request, semanticDigest, standing, null, null,
                    List.of("IDENTITY_" + ex.code().name()), rootSnapshot.revision());
        } catch (IOException ex) {
            return result(request, semanticDigest, Standing.UNKNOWN_BLOCKED, null, null,
                    List.of("IDENTITY_UNAVAILABLE"), rootSnapshot.revision());
        } catch (RuntimeException ex) {
            return result(request, semanticDigest, Standing.UNKNOWN_BLOCKED, null, null,
                    List.of("IDENTITY_RUNTIME_UNKNOWN"), rootSnapshot.revision());
        }

        GateReceipt gate;
        try {
            ContractUse contractUse = request.contractUse();
            gate = contracts.resolveForMutation(
                    contractUse.subjectId(), contractUse.requestedVersion(), contractUse.requestedDigest());
        } catch (ContractException ex) {
            return result(request, semanticDigest, contractExceptionStanding(ex.code()), identityReceipt, null,
                    List.of("CONTRACTS_" + safeReason(ex.code())), rootSnapshot.revision());
        } catch (RuntimeException ex) {
            return result(request, semanticDigest, Standing.UNKNOWN_BLOCKED, identityReceipt, null,
                    List.of("CONTRACTS_RUNTIME_UNKNOWN"), rootSnapshot.revision());
        }

        Standing gateStanding = gateStanding(gate);
        List<String> reasons = new ArrayList<>();
        if (gateStanding == Standing.ALLOW_CURRENT_PREREQUISITES) {
            reasons.add("IDENTITY_CURRENT");
            reasons.add("CONTRACT_CURRENT_COMPATIBLE");
        } else {
            for (String reason : gate.reasonCodes()) reasons.add("CONTRACTS_" + safeReason(reason));
            if (reasons.isEmpty()) reasons.add("CONTRACTS_BLOCKED");
        }
        return result(request, semanticDigest, gateStanding, identityReceipt, gate, reasons, rootSnapshot.revision());
    }

    private static ProviderBinding bind(AuthorityRegistry.Snapshot snapshot, String authorityId) {
        AuthorityRecord record = snapshot.resolve(authorityId)
                .orElseThrow(() -> new IllegalStateException("PROVIDER_AUTHORITY_MISSING:" + authorityId));
        if (record.lifecycle() != Lifecycle.ACTIVE) {
            throw new IllegalStateException("PROVIDER_AUTHORITY_NOT_ACTIVE:" + authorityId);
        }
        return new ProviderBinding(record.authorityId(), record.ownerPath(), record.admittedRevision(), record.currentPointers());
    }

    private List<String> providerBindingReasons(AuthorityRegistry.Snapshot snapshot) {
        List<String> reasons = new ArrayList<>();
        verifyBinding(snapshot, identityBinding, reasons);
        verifyBinding(snapshot, contractsBinding, reasons);
        return List.copyOf(reasons);
    }

    private static void verifyBinding(
            AuthorityRegistry.Snapshot snapshot,
            ProviderBinding expected,
            List<String> reasons) {
        AuthorityRecord current = snapshot.resolve(expected.authorityId()).orElse(null);
        if (current == null) {
            reasons.add("PROVIDER_IDENTITY_UNKNOWN_" + expected.authorityId());
            return;
        }
        if (current.lifecycle() != Lifecycle.ACTIVE
                || !current.ownerPath().equals(expected.ownerPath())
                || current.admittedRevision() != expected.admittedRevision()
                || !current.currentPointers().equals(expected.currentPointers())) {
            reasons.add("PROVIDER_IDENTITY_STALE_" + expected.authorityId());
        }
    }

    private static Standing identityStanding(ErrorCode code) {
        return switch (code) {
            case DENIED, REAUTH_REQUIRED, REVOKED, EXPIRED, UNAUTHENTICATED, QUARANTINED -> Standing.DENY;
            case INVALID_ARGUMENT -> Standing.DENY;
            case NOT_FOUND, CONFLICT, STALE_BASE, BLOCKED_DEPENDENCY, AMBIGUOUS, UNAVAILABLE, CORRUPT_STATE ->
                    Standing.UNKNOWN_BLOCKED;
        };
    }

    private static Standing contractExceptionStanding(String code) {
        String normalized = safeReason(code);
        if (normalized.contains("INCOMPATIBLE") || normalized.contains("SUNSET") || normalized.contains("SECRET")) {
            return Standing.DENY;
        }
        return Standing.UNKNOWN_BLOCKED;
    }

    private static Standing gateStanding(GateReceipt gate) {
        if (gate.standing() == GateStanding.ADMITTED) return Standing.ALLOW_CURRENT_PREREQUISITES;
        if (gate.standing() == GateStanding.MIGRATION_REQUIRED) return Standing.UNKNOWN_BLOCKED;
        for (String reason : gate.reasonCodes()) {
            String normalized = safeReason(reason);
            if (normalized.contains("INCOMPATIBLE") || normalized.contains("SUNSET")) return Standing.DENY;
        }
        return Standing.UNKNOWN_BLOCKED;
    }

    private static List<String> secretMaterialReasons(PreflightRequest request) {
        CapabilityUseRequest use = request.capabilityUse();
        ContractUse contract = request.contractUse();
        List<String> values = List.of(
                use.action(), use.resourceRef(), use.purposeRef(), use.audienceRef(), use.targetRef(), contract.subjectId());
        for (String value : values) {
            if (looksSecret(value)) return List.of("SECRET_MATERIAL_FORBIDDEN");
        }
        return List.of();
    }

    private static boolean looksSecret(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        return lower.contains("bearer ")
                || lower.contains("password=")
                || lower.contains("-----begin private key-----")
                || lower.startsWith("sk-");
    }

    private static PreflightResult result(
            PreflightRequest request,
            String semanticDigest,
            Standing standing,
            CapabilityValidationReceipt identityReceipt,
            GateReceipt contractGate,
            List<String> reasons,
            long rootRevision) {
        return new PreflightResult(
                request.requestId(), semanticDigest, standing, identityReceipt, contractGate,
                reasons, rootRevision, IDENTITY_AUTHORITY_ID, CONTRACTS_AUTHORITY_ID, QUALIFICATION_CLASS);
    }

    public static String semanticDigest(CapabilityUseRequest use, ContractUse contract) {
        Objects.requireNonNull(use, "use");
        Objects.requireNonNull(contract, "contract");
        StringBuilder hops = new StringBuilder();
        for (DelegationHop hop : use.actorChain().hops()) {
            if (hops.length() > 0) hops.append('\u001e');
            hops.append(hop.grantId()).append('\u001f')
                    .append(hop.grantDigest()).append('\u001f')
                    .append(hop.delegatorPrincipalId()).append('\u001f')
                    .append(hop.delegatePrincipalId());
        }
        String material = String.join("|",
                "SM-DURABLE-RUNTIME-IC-PREFLIGHT-V1",
                use.grantId(), use.grantDigest(), use.actorChain().subjectPrincipalId(),
                use.actorChain().currentActorPrincipalId(), use.actorChain().chainDigest(), hops.toString(),
                use.presentedCurrentActorPrincipalId(), use.action(), use.resourceRef(), use.purposeRef(),
                use.audienceRef(), use.targetRef(), use.now().toString(),
                contract.subjectId(), contract.requestedVersion().toString(), contract.requestedDigest());
        return ContractAuthorityRuntime.sha256(material);
    }

    public static String requestIdForDigest(String semanticDigest) {
        return "icp1-" + requireDigest("semanticDigest", semanticDigest);
    }

    private static String requireDigest(String name, String value) {
        Objects.requireNonNull(value, name);
        if (!value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + "_sha256");
        return value;
    }

    private static String requireText(String name, String value, int max) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + "_invalid");
        for (int i = 0; i < value.length(); i++) {
            if (value.charAt(i) < 0x20) throw new IllegalArgumentException(name + "_control_char");
        }
        return value;
    }

    private static String safeReason(String reason) {
        if (reason == null || reason.isBlank()) return "UNKNOWN";
        String upper = reason.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_:-]", "_");
        return upper.length() > 96 ? upper.substring(0, 96) : upper;
    }
}
