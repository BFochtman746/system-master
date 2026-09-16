package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for exact frozen 001C bindings I076, I077 and I088. */
public final class AccommodationQualificationMasteryInboundHandlerQualificationTest {
    private AccommodationQualificationMasteryInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();

        AccommodationQualificationMasteryInboundHandlers.LearningIntegrationPort learning =
                c -> c;
        AccommodationQualificationMasteryInboundHandlers.QualificationEvidencePort qualification =
                c -> c;
        AccommodationQualificationMasteryInboundHandlers.MasteryProjectionPort mastery =
                q -> q;

        AccommodationQualificationMasteryInboundHandlers.registerAll((d, h) -> {
            check(!handlers.containsKey(d.interfaceId()), "duplicate registration " + d.interfaceId());
            descriptors.put(d.interfaceId(), d);
            handlers.put(d.interfaceId(), h);
        }, learning, qualification, mastery);

        check(handlers.size() == 3, "expected 3 exact local registrations");
        check(!handlers.containsKey("I075"), "I075 must remain CORE-owned and unregistered by Learning");
        checkRoute(descriptors, "I076", "AttachAccommodationReference", "LRN-CMD-PORT-001", "LearningIntegrationAdapter", true);
        checkRoute(descriptors, "I077", "RequestQualificationEvidencePackaging", "LRN-CMD-PORT-001", "QualificationEvidenceService", true);
        checkRoute(descriptors, "I088", "GetMasteryEvidenceMatrix", "LRN-QRY-PORT-001", "MasteryProjectionService", false);

        check(descriptors.get("I076").semanticPayloadFields().equals(
                List.of("learning_goal_or_attempt_ref", "external_profile_ref", "scope", "client_operation_id")),
                "I076 payload signature drift");
        check(descriptors.get("I076").typedFailures().equals(List.of("DependencyUnavailable")),
                "I076 typed-failure drift");
        check(descriptors.get("I076").concurrencyRule().contains("Expected-version where stateful"),
                "I076 expected-version fence missing");
        check(descriptors.get("I076").concurrencyRule().contains("without owning the global accessibility/disability profile"),
                "I076 external-profile ownership fence missing");

        check(descriptors.get("I077").semanticPayloadFields().equals(
                List.of("skill_refs", "intended_recipient", "purpose", "policy_version", "job_request_id")),
                "I077 payload signature drift");
        check(descriptors.get("I077").typedFailures().equals(
                List.of("QualificationExportNotAuthorized", "InsufficientEvidence")),
                "I077 typed-failure drift");
        check(descriptors.get("I077").concurrencyRule().contains("Evidence versions pinned"),
                "I077 evidence-version fence missing");
        check(descriptors.get("I077").concurrencyRule().contains("never returns an eligibility or qualification decision"),
                "I077 no-qualification-decision fence missing");

        check(descriptors.get("I088").semanticPayloadFields().equals(
                List.of("skill_ref", "projection_version optional")),
                "I088 payload signature drift");
        check(descriptors.get("I088").typedFailures().equals(List.of("NotFound")),
                "I088 typed-failure drift");
        check(descriptors.get("I088").concurrencyRule().contains("Read-only consistent Learning snapshot"),
                "I088 read-only fence missing");
        check(descriptors.get("I088").concurrencyRule().contains("zero writes/outbox"),
                "I088 no-write fence missing");
        check(descriptors.get("I088").concurrencyRule().contains("without qualification side effects"),
                "I088 qualification-side-effect fence missing");

        var c076 = new AccommodationQualificationMasteryInboundHandlers.AttachAccommodationReferenceCommand(
                "attempt-ref", "external-profile-ref", "ASSESSMENT", "op-76");
        var c077 = new AccommodationQualificationMasteryInboundHandlers.RequestQualificationEvidencePackagingCommand(
                List.of("skill-a"), "recipient", "EMPLOYMENT_EVIDENCE", "policy-v1", "job-request-77");
        var q088 = new AccommodationQualificationMasteryInboundHandlers.GetMasteryEvidenceMatrixQuery(
                "skill-a", null);

        check(handlers.get("I076").handle(envelope(descriptors.get("I076"), c076, true)) == c076,
                "I076 typed payload identity not preserved");
        check(handlers.get("I077").handle(envelope(descriptors.get("I077"), c077, true)) == c077,
                "I077 typed payload identity not preserved");
        check(handlers.get("I088").handle(envelope(descriptors.get("I088"), q088, true)) == q088,
                "I088 typed payload identity not preserved");

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handlers.get("I076").handle(envelope(descriptors.get("I076"), c076, false)));
        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handlers.get("I077").handle(new InboundEnvelope("I077", "RequestQualificationEvidencePackaging",
                        "SYSTEM_MASTER/LEARNING", "CUR-CMD-PORT-001", "principal", true, c077)));
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> handlers.get("I088").handle(envelope(descriptors.get("I088"), "wrong-payload", true)));

        expectIllegalArgument(() -> new AccommodationQualificationMasteryInboundHandlers.AttachAccommodationReferenceCommand(
                null, "profile", "scope", "op"));
        expectIllegalArgument(() -> new AccommodationQualificationMasteryInboundHandlers.RequestQualificationEvidencePackagingCommand(
                List.of("skill"), "recipient", null, "policy", "job"));
        expectIllegalArgument(() -> new AccommodationQualificationMasteryInboundHandlers.GetMasteryEvidenceMatrixQuery(
                null, null));

        RuntimeException domainFailure = new RuntimeException("domain-failure-identity");
        Map<String, InboundHandler> failing = new LinkedHashMap<>();
        AccommodationQualificationMasteryInboundHandlers.QualificationEvidencePort failingQualification = c -> {
            throw domainFailure;
        };
        AccommodationQualificationMasteryInboundHandlers.registerAll((d, h) -> failing.put(d.interfaceId(), h),
                learning, failingQualification, mastery);
        try {
            failing.get("I077").handle(envelope(descriptors.get("I077"), c077, true));
            throw new AssertionError("expected domain failure");
        } catch (RuntimeException ex) {
            check(ex == domainFailure, "domain failure identity must propagate unchanged");
        }

        System.out.println("PASS AccommodationQualificationMasteryInboundHandlerQualificationTest routes=3 core_boundary=I075 production_bound=0");
    }

    private static InboundEnvelope envelope(RouteDescriptor d, Object payload, boolean authorized) {
        return new InboundEnvelope(d.interfaceId(), d.route(), d.ownerPath(), d.port(), "principal", authorized, payload);
    }

    private static void checkRoute(Map<String, RouteDescriptor> ds, String id, String route,
            String port, String component, boolean idempotencyRequired) {
        RouteDescriptor d = ds.get(id);
        check(d != null, "missing " + id);
        check(d.route().equals(route), id + " route drift");
        check(d.port().equals(port), id + " port drift");
        check(d.targetComponent().equals(component), id + " component drift");
        check(d.ownerPath().equals("SYSTEM_MASTER/LEARNING"), id + " owner-path drift");
        check(d.capabilityBinding().equals("C18 LEARNING"), id + " capability-binding drift");
        check(d.contractIdentity().equals("MASTER_CORE_ROUTE_MANIFEST_001::" + id), id + " contract identity drift");
        check(d.testObligationId().equals("QO-IF-" + id), id + " test-obligation drift");
        check(d.idempotencyRequired() == idempotencyRequired, id + " idempotency classification drift");
    }

    private static void expectFailure(HandlerFailureCode code, Throwing action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected handler failure " + code);
        } catch (HandlerContractException ex) {
            check(ex.code() == code, "wrong handler failure code");
        }
    }

    private static void expectIllegalArgument(Throwing action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface Throwing {
        void run() throws Exception;
    }
}
