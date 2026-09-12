package org.systemmaster.foundation.root;

import java.io.IOException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Exact bootstrap topology for the fresh Foundation & Spine specification.
 *
 * The SYSTEM_MASTER_CORE record is only a binding to product-level authority;
 * it does not copy or supersede product topology from governance/CURRENT-AUTHORITY.json.
 */
public final class FoundationAuthorityBootstrap {
    public static final String PRODUCT_BINDING_ID = "SYSTEM_MASTER_CORE";
    public static final String ARCHITECTURE_POINTER = "system-master/foundation-spine/SYSTEM-SPECIFICATION.md";
    public static final String ADMISSION_REF = ARCHITECTURE_POINTER + "#required-logical-systems";
    public static final String OVERLAY_ADMISSION_REF = ARCHITECTURE_POINTER + "#creative-fabric";

    private record Spec(String id, String name, String alias) {}

    private static final List<Spec> SHARED_SYSTEMS = List.of(
            new Spec("SYSTEM_ROOT", "System Root & Authority Registry", "System Root"),
            new Spec("IDENTITY_DELEGATION", "Identity, Principal & Delegation", "Identity & Delegation"),
            new Spec("CONTRACTS_VERSIONING", "Contracts & Versioning", "Contracts"),
            new Spec("INTENT_KEEL", "Intent / Keel", "Keel"),
            new Spec("WORK_PROJECT_CONTROL", "Work & Project Control", "Work Control"),
            new Spec("PLANNING_ORCHESTRATION", "Planning & Orchestration", "Orchestrator"),
            new Spec("RESOURCE_ADMISSION", "Resource Admission & Budgeting", "Resource System"),
            new Spec("CAPABILITY_ROUTING", "Capability Registry & Routing", "Capability Router"),
            new Spec("EXECUTION_PLACEMENT", "Execution Placement", "Placement"),
            new Spec("DURABLE_RUNTIME", "Durable Execution Runtime", "Durable Runtime"),
            new Spec("TRANSPORT_DELIVERY", "Transport & Delivery", "Transport"),
            new Spec("CONTEXT_RETRIEVAL", "Context, Memory & Retrieval Broker", "Context Broker"),
            new Spec("MODEL_GATEWAY", "Model Gateway", "Model Gateway"),
            new Spec("TOOL_CONNECTOR_GATEWAY", "Tool & Connector Gateway", "Tool Gateway"),
            new Spec("EFFECT_AUTHORITY", "Effect / Action Authority", "Effect Authority"),
            new Spec("ARTIFACT_GATEWAY", "Artifact Gateway", "Artifact Gateway"),
            new Spec("CANONICAL_DATA", "Canonical Data & Persistence", "Canonical Data"),
            new Spec("EVIDENCE_ASSURANCE", "Evidence, Provenance & Assurance", "Evidence & Assurance"),
            new Spec("OBSERVABILITY", "Observability & Telemetry", "Observability"),
            new Spec("RECOVERY_RECONCILIATION", "Recovery & Reconciliation", "Recovery"),
            new Spec("SECURITY_PRIVACY", "Security, Privacy, Secrets & Cryptography", "Security & Privacy"),
            new Spec("PROVIDER_GOVERNANCE", "Provider & Dependency Governance", "Provider Governance"),
            new Spec("AI_SAFETY", "AI Safety & Model Risk", "AI Safety"),
            new Spec("RIGHTS_LICENSING", "Rights, Licensing & Attribution", "Rights & Licensing"),
            new Spec("UX_WORK_CONTROL", "UX / Chat / Work Control Surface", "Work Control Surface"),
            new Spec("CHANGE_RELEASE_GOVERNANCE", "Change, Migration, Release & Operator Governance", "Change & Release Governance")
    );

    private FoundationAuthorityBootstrap() {}

    public static AuthorityRegistry createRegistry() {
        AuthorityRegistry registry = new AuthorityRegistry();
        long revision = 0;
        registry.apply(productBinding(revision++));
        for (int i = 0; i < SHARED_SYSTEMS.size(); i++) {
            registry.apply(sharedSystem(SHARED_SYSTEMS.get(i), revision++));
        }
        registry.apply(creativeOverlay(revision));
        validateExactBootstrap(registry.snapshot());
        return registry;
    }

    public static AuthorityRegistry.Snapshot bootstrap(AuthorityJournal journal) throws IOException {
        long revision = 0;
        journal.transact(productBinding(revision++));
        for (Spec spec : SHARED_SYSTEMS) journal.transact(sharedSystem(spec, revision++));
        journal.transact(creativeOverlay(revision));
        AuthorityRegistry.Snapshot snapshot = journal.load();
        validateExactBootstrap(snapshot);
        return snapshot;
    }

    public static Set<String> expectedAuthorityIds() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        ids.add(PRODUCT_BINDING_ID);
        SHARED_SYSTEMS.forEach(spec -> ids.add(spec.id()));
        ids.add("CREATIVE_FABRIC");
        return Set.copyOf(ids);
    }

    public static void validateExactBootstrap(AuthorityRegistry.Snapshot snapshot) {
        if (!snapshot.authorities().keySet().equals(expectedAuthorityIds())) {
            throw new IllegalStateException("BOOTSTRAP_AUTHORITY_SET_MISMATCH:expected="
                    + expectedAuthorityIds().size() + ":actual=" + snapshot.authorities().size());
        }
        if (snapshot.authorities().size() != 28) {
            throw new IllegalStateException("BOOTSTRAP_AUTHORITY_COUNT_MISMATCH:" + snapshot.authorities().size());
        }
        long shared = snapshot.authorities().values().stream()
                .filter(a -> a.kind() == AuthorityRegistry.AuthorityKind.SHARED_SYSTEM).count();
        long overlays = snapshot.authorities().values().stream()
                .filter(a -> a.kind() == AuthorityRegistry.AuthorityKind.FEDERATED_OVERLAY).count();
        long bindings = snapshot.authorities().values().stream()
                .filter(a -> a.kind() == AuthorityRegistry.AuthorityKind.PRODUCT_ROOT_BINDING).count();
        if (shared != 26 || overlays != 1 || bindings != 1) {
            throw new IllegalStateException("BOOTSTRAP_KIND_COUNTS_INVALID:shared=" + shared
                    + ":overlay=" + overlays + ":binding=" + bindings);
        }
        if (snapshot.revision() != 28) {
            throw new IllegalStateException("BOOTSTRAP_REVISION_INVALID:" + snapshot.revision());
        }
    }

    private static AuthorityRegistry.AdmitAuthority productBinding(long expectedRevision) {
        return new AuthorityRegistry.AdmitAuthority(
                "bootstrap-product-root-v1", expectedRevision, PRODUCT_BINDING_ID,
                "System Master Core / Foundation & Spine",
                AuthorityRegistry.AuthorityKind.PRODUCT_ROOT_BINDING,
                "SYSTEM_MASTER/CORE", null,
                Set.of("CORE", "Foundation & Spine"),
                Map.of(
                        "product_authority", "governance/CURRENT-AUTHORITY.json",
                        "core_control", "system-master/control-v2",
                        "architecture", ARCHITECTURE_POINTER),
                "governance/CURRENT-AUTHORITY.json");
    }

    private static AuthorityRegistry.AdmitAuthority sharedSystem(Spec spec, long expectedRevision) {
        Map<String, String> pointers = spec.id().equals("SYSTEM_ROOT")
                ? Map.of(
                        "architecture", ARCHITECTURE_POINTER,
                        "implementation", "system-master/foundation-spine/system-root")
                : Map.of("architecture", ARCHITECTURE_POINTER);
        return new AuthorityRegistry.AdmitAuthority(
                "bootstrap-" + spec.id().toLowerCase(java.util.Locale.ROOT) + "-v1",
                expectedRevision, spec.id(), spec.name(), AuthorityRegistry.AuthorityKind.SHARED_SYSTEM,
                "SYSTEM_MASTER/CORE/" + spec.id(), PRODUCT_BINDING_ID,
                Set.of(spec.alias()), pointers, ADMISSION_REF);
    }

    private static AuthorityRegistry.AdmitAuthority creativeOverlay(long expectedRevision) {
        return new AuthorityRegistry.AdmitAuthority(
                "bootstrap-creative_fabric-v1", expectedRevision, "CREATIVE_FABRIC", "Creative Fabric",
                AuthorityRegistry.AuthorityKind.FEDERATED_OVERLAY,
                "SYSTEM_MASTER/CORE/CREATIVE_FABRIC", PRODUCT_BINDING_ID,
                Set.of("Creative Fabric Overlay"), Map.of("architecture", ARCHITECTURE_POINTER),
                OVERLAY_ADMISSION_REF);
    }
}
