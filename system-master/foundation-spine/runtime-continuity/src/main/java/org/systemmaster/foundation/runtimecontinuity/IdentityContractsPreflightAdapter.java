package org.systemmaster.foundation.runtimecontinuity;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.systemmaster.foundation.contracts.ContractAuthorityRuntime;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateReceipt;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.GateStanding;
import org.systemmaster.foundation.contracts.ContractAuthorityRuntime.SemanticVersion;
import org.systemmaster.foundation.identity.DelegationRuntime;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityUseRequest;
import org.systemmaster.foundation.identity.DelegationRuntime.CapabilityValidationReceipt;
import org.systemmaster.foundation.identity.IdentityContracts.ErrorCode;
import org.systemmaster.foundation.identity.IdentityContracts.IdentityException;

/**
 * Side-effect-free prerequisite adapter for Durable Runtime.
 *
 * <p>This class owns no Identity, Contracts, Work, Plan, Resource, Routing,
 * Placement, Effect, Evidence, Security, or specialist truth. An ALLOW result
 * means only that the bound Identity and Contracts prerequisites were current
 * at this invocation. Every later authority gate remains mandatory.</p>
 */
public final class IdentityContractsPreflightAdapter {
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
    private static final Pattern DIGEST = Pattern.compile("[0-9a-f]{64}");

    public enum Standing {
        ALLOW_CURRENT_PREREQUISITES,
        DENY,
        BLOCKED_UNKNOWN,
        CONFLICT
    }

    public enum EvidenceClass {
        HOSTED_PORTABLE_REFERENCE_CONTRACT_AUTHORITY_MECHANICS
    }

    /** Root-sourced provider identity/version snapshot; this adapter never advances it. */
    public record ProviderBinding(
            String identityOwnerRef,
            String identityVersionRef,
            String contractsOwnerRef,
            String contractsVersionRef) {
        public ProviderBinding {
            identityOwnerRef = bounded("identityOwnerRef", identityOwnerRef, 256);
            identityVersionRef = bounded("identityVersionRef", identityVersionRef, 256);
            contractsOwnerRef = bounded("contractsOwnerRef", contractsOwnerRef, 256);
            contractsVersionRef = bounded("contractsVersionRef", contractsVersionRef, 256);
        }
    }

    public record Request(
            String requestId,
            CapabilityUseRequest capabilityUseRequest,
            String contractSubjectId,
            SemanticVersion requestedVersion,
            String requestedDigest) {
        public Request {
            requestId = id("requestId", requestId);
            capabilityUseRequest = Objects.requireNonNull(capabilityUseRequest, "capabilityUseRequest");
            contractSubjectId = id("contractSubjectId", contractSubjectId);
            requestedVersion = Objects.requireNonNull(requestedVersion, "requestedVersion");
            requestedDigest = digest("requestedDigest", requestedDigest);
        }
    }

    public record Receipt(
            String requestId,
            String semanticDigest,
            Standing standing,
            ProviderBinding providerBinding,
            CapabilityValidationReceipt identityReceipt,
            GateReceipt contractGateReceipt,
            List<String> reasonCodes,
            EvidenceClass evidenceClass) {
        public Receipt {
            requestId = id("requestId", requestId);
            semanticDigest = digest("semanticDigest", semanticDigest);
            standing = Objects.requireNonNull(standing, "standing");
            reasonCodes = List.copyOf(reasonCodes == null ? List.of() : reasonCodes);
            evidenceClass = Objects.requireNonNull(evidenceClass, "evidenceClass");
        }

        /** This receipt is deliberately incapable of authorizing the whole Runtime operation. */
        public boolean authorizesWholeRuntimeOperation() {
            return false;
        }
    }

    @FunctionalInterface
    public interface IdentityValidator {
        CapabilityValidationReceipt validate(CapabilityUseRequest request) throws IOException;
    }

    @FunctionalInterface
    public interface ContractGateResolver {
        GateReceipt resolve(String subjectId, SemanticVersion requestedVersion, String requestedDigest);
    }

    @FunctionalInterface
    public interface ProviderBindingAuthority {
        ProviderBinding currentBinding();
    }

    private final IdentityValidator identityValidator;
    private final ContractGateResolver contractGateResolver;
    private final ProviderBindingAuthority bindingAuthority;
    private final ProviderBinding boundProviders;
    private final Map<String, String> seenRequestDigests = new ConcurrentHashMap<>();

    public IdentityContractsPreflightAdapter(
            IdentityValidator identityValidator,
            ContractGateResolver contractGateResolver,
            ProviderBindingAuthority bindingAuthority,
            ProviderBinding boundProviders) {
        this.identityValidator = Objects.requireNonNull(identityValidator, "identityValidator");
        this.contractGateResolver = Objects.requireNonNull(contractGateResolver, "contractGateResolver");
        this.bindingAuthority = Objects.requireNonNull(bindingAuthority, "bindingAuthority");
        this.boundProviders = Objects.requireNonNull(boundProviders, "boundProviders");
    }

    /** Direct binding to the frozen provider implementations. */
    public static IdentityContractsPreflightAdapter boundTo(
            DelegationRuntime.DelegationService identity,
            ContractAuthorityRuntime contracts,
            ProviderBindingAuthority bindingAuthority,
            ProviderBinding boundProviders) {
        Objects.requireNonNull(identity, "identity");
        Objects.requireNonNull(contracts, "contracts");
        return new IdentityContractsPreflightAdapter(
                identity::validateUse,
                contracts::resolveForMutation,
                bindingAuthority,
                boundProviders);
    }

    /**
     * Revalidates both providers on every invocation. A prior ALLOW is never a cache hit.
     */
    public synchronized Receipt preflight(Request request) {
        Objects.requireNonNull(request, "request");
        String semanticDigest = semanticDigest(request);
        String prior = seenRequestDigests.putIfAbsent(request.requestId(), semanticDigest);
        if (prior != null && !prior.equals(semanticDigest)) {
            return receipt(request, semanticDigest, Standing.CONFLICT, null, null, null,
                    List.of("REQUEST_ID_SEMANTIC_DIGEST_CONFLICT"));
        }

        ProviderBinding currentBinding;
        try {
            currentBinding = bindingAuthority.currentBinding();
        } catch (RuntimeException unavailable) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, null, null, null,
                    List.of("PROVIDER_BINDING_UNAVAILABLE"));
        }
        if (currentBinding == null || !boundProviders.equals(currentBinding)) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding, null, null,
                    List.of("PROVIDER_BINDING_STALE_OR_UNKNOWN"));
        }

        CapabilityValidationReceipt identityReceipt;
        try {
            identityReceipt = identityValidator.validate(request.capabilityUseRequest());
            if (identityReceipt == null) {
                return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding, null, null,
                        List.of("IDENTITY_RECEIPT_MISSING"));
            }
        } catch (IdentityException identityFailure) {
            return receipt(request, semanticDigest, mapIdentity(identityFailure.code()), currentBinding, null, null,
                    List.of("IDENTITY_" + identityFailure.code().name()));
        } catch (IOException | RuntimeException identityUnavailable) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding, null, null,
                    List.of("IDENTITY_PROVIDER_UNAVAILABLE"));
        }

        GateReceipt gate;
        try {
            gate = contractGateResolver.resolve(
                    request.contractSubjectId(), request.requestedVersion(), request.requestedDigest());
        } catch (RuntimeException contractsUnavailable) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding, identityReceipt, null,
                    List.of("CONTRACTS_PROVIDER_UNAVAILABLE"));
        }
        if (gate == null) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding, identityReceipt, null,
                    List.of("CONTRACT_GATE_MISSING"));
        }

        if (gate.standing() == GateStanding.ADMITTED) {
            return receipt(request, semanticDigest, Standing.ALLOW_CURRENT_PREREQUISITES, currentBinding,
                    identityReceipt, gate, gate.reasonCodes());
        }
        if (gate.standing() == GateStanding.MIGRATION_REQUIRED) {
            return receipt(request, semanticDigest, Standing.BLOCKED_UNKNOWN, currentBinding,
                    identityReceipt, gate, append(gate.reasonCodes(), "CONTRACT_MIGRATION_REQUIRED"));
        }

        boolean unknown = gate.reasonCodes().stream().anyMatch(IdentityContractsPreflightAdapter::unknownContractReason);
        return receipt(request, semanticDigest, unknown ? Standing.BLOCKED_UNKNOWN : Standing.DENY,
                currentBinding, identityReceipt, gate, gate.reasonCodes());
    }

    private static Standing mapIdentity(ErrorCode code) {
        return switch (code) {
            case DENIED, REAUTH_REQUIRED, REVOKED, EXPIRED, UNAUTHENTICATED, STALE_BASE -> Standing.DENY;
            case CONFLICT -> Standing.CONFLICT;
            case INVALID_ARGUMENT, NOT_FOUND, BLOCKED_DEPENDENCY, AMBIGUOUS, QUARANTINED, UNAVAILABLE, CORRUPT_STATE -> Standing.BLOCKED_UNKNOWN;
        };
    }

    private static boolean unknownContractReason(String reason) {
        return reason.startsWith("UNKNOWN_")
                || reason.equals("COMPATIBILITY_POLICY_MISSING")
                || reason.equals("VALIDATOR_ERROR")
                || reason.equals("VALIDATOR_UNAVAILABLE");
    }

    private static Receipt receipt(
            Request request,
            String semanticDigest,
            Standing standing,
            ProviderBinding binding,
            CapabilityValidationReceipt identityReceipt,
            GateReceipt gate,
            List<String> reasons) {
        return new Receipt(request.requestId(), semanticDigest, standing, binding, identityReceipt, gate,
                reasons, EvidenceClass.HOSTED_PORTABLE_REFERENCE_CONTRACT_AUTHORITY_MECHANICS);
    }

    private static List<String> append(List<String> existing, String value) {
        ArrayList<String> out = new ArrayList<>(existing == null ? List.of() : existing);
        if (!out.contains(value)) out.add(value);
        return List.copyOf(out);
    }

    private static String semanticDigest(Request request) {
        CapabilityUseRequest use = request.capabilityUseRequest();
        String canonical = String.join("\u001f",
                "SM-RUNTIME-IDENTITY-CONTRACTS-PREFLIGHT-V1",
                use.grantId(),
                use.grantDigest(),
                use.actorChain().chainDigest(),
                use.presentedCurrentActorPrincipalId(),
                use.action(),
                use.resourceRef(),
                use.purposeRef(),
                use.audienceRef(),
                use.targetRef(),
                use.now().toString(),
                request.contractSubjectId(),
                request.requestedVersion().toString(),
                request.requestedDigest());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }

    private static String id(String name, String value) {
        Objects.requireNonNull(value, name);
        if (!ID.matcher(value).matches()) throw new IllegalArgumentException(name + " invalid");
        return value;
    }

    private static String digest(String name, String value) {
        Objects.requireNonNull(value, name);
        if (!DIGEST.matcher(value).matches()) throw new IllegalArgumentException(name + " invalid");
        return value;
    }

    private static String bounded(String name, String value, int max) {
        Objects.requireNonNull(value, name);
        if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(name + " invalid");
        return value;
    }
}
