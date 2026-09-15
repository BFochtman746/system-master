package org.systemmaster.learning.binding;

import java.util.LinkedHashMap;
import java.util.Map;

import org.systemmaster.learning.binding.InboundBindingContracts.HandlerContractException;
import org.systemmaster.learning.binding.InboundBindingContracts.HandlerFailureCode;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundEnvelope;
import org.systemmaster.learning.binding.InboundBindingContracts.InboundHandler;
import org.systemmaster.learning.binding.InboundBindingContracts.RouteDescriptor;

/** Portable qualification for exact frozen 001C bindings I032 and I056-I062. */
public final class MasteryEvidenceAssessmentInboundHandlerQualificationTest {
    private MasteryEvidenceAssessmentInboundHandlerQualificationTest() {}

    public static void main(String[] args) throws Exception {
        Map<String, InboundHandler> handlers = new LinkedHashMap<>();
        Map<String, RouteDescriptor> descriptors = new LinkedHashMap<>();

        var queryPort = new MasteryEvidenceAssessmentInboundHandlers.QualificationEvidencePort() {
            @Override public Object getEvidencePackageForQualification(
                    MasteryEvidenceAssessmentInboundHandlers.GetEvidencePackageForQualificationQuery q) { return q; }
        };
        var masteryPort = new MasteryEvidenceAssessmentInboundHandlers.MasteryEnginePort() {
            @Override public Object selectMasteryEvidenceProfile(MasteryEvidenceAssessmentInboundHandlers.SelectMasteryEvidenceProfileCommand c) { return c; }
            @Override public Object requestMasteryReprojection(MasteryEvidenceAssessmentInboundHandlers.RequestMasteryReprojectionCommand c) { return c; }
            @Override public Object challengeMasteryProjection(MasteryEvidenceAssessmentInboundHandlers.ChallengeMasteryProjectionCommand c) { return c; }
        };
        var admissionPort = new MasteryEvidenceAssessmentInboundHandlers.LearningEvidenceAdmissionPort() {
            @Override public Object recordExternalEvidenceCandidate(MasteryEvidenceAssessmentInboundHandlers.RecordExternalEvidenceCandidateCommand c) { return c; }
            @Override public Object admitExternalEvidenceCandidate(MasteryEvidenceAssessmentInboundHandlers.AdmitExternalEvidenceCandidateCommand c) { return c; }
            @Override public Object rejectExternalEvidenceCandidate(MasteryEvidenceAssessmentInboundHandlers.RejectExternalEvidenceCandidateCommand c) { return c; }
        };
        var blueprintPort = new MasteryEvidenceAssessmentInboundHandlers.AssessmentBlueprintPort() {
            @Override public Object createAssessmentBlueprint(MasteryEvidenceAssessmentInboundHandlers.CreateAssessmentBlueprintCommand c) { return c; }
        };

        MasteryEvidenceAssessmentInboundHandlers.registerAll((d, h) -> {
            check(!handlers.containsKey(d.interfaceId()), "duplicate registration " + d.interfaceId());
            descriptors.put(d.interfaceId(), d);
            handlers.put(d.interfaceId(), h);
        }, queryPort, masteryPort, admissionPort, blueprintPort);

        check(handlers.size() == 8, "expected 8 exact local registrations");
        checkRoute(descriptors, "I032", "GetEvidencePackageForQualification", "LRN-QRY-PORT-001", "QualificationEvidenceService", false);
        checkRoute(descriptors, "I056", "SelectMasteryEvidenceProfile", "LRN-CMD-PORT-001", "MasteryEngine", true);
        checkRoute(descriptors, "I057", "RecordExternalEvidenceCandidate", "LRN-CMD-PORT-001", "LearningEvidenceAdmissionService", true);
        checkRoute(descriptors, "I058", "AdmitExternalEvidenceCandidate", "LRN-CMD-PORT-001", "LearningEvidenceAdmissionService", true);
        checkRoute(descriptors, "I059", "RejectExternalEvidenceCandidate", "LRN-CMD-PORT-001", "LearningEvidenceAdmissionService", true);
        checkRoute(descriptors, "I060", "RequestMasteryReprojection", "LRN-CMD-PORT-001", "MasteryEngine", true);
        checkRoute(descriptors, "I061", "ChallengeMasteryProjection", "LRN-CMD-PORT-001", "MasteryEngine", true);
        checkRoute(descriptors, "I062", "CreateAssessmentBlueprint", "CUR-CMD-PORT-001", "AssessmentBlueprintService", true);

        check(descriptors.get("I032").concurrencyRule().contains("no qualification outcome"), "I032 qualification-outcome fence missing");
        check(descriptors.get("I057").concurrencyRule().contains("does not change mastery"), "I057 no-mastery-change fence missing");
        check(descriptors.get("I058").concurrencyRule().contains("canonical external bytes remain external"), "I058 custody fence missing");
        check(descriptors.get("I061").concurrencyRule().contains("does not directly edit evidence"), "I061 evidence-edit fence missing");

        var q032 = new MasteryEvidenceAssessmentInboundHandlers.GetEvidencePackageForQualificationQuery("skills", "portfolio", "recipient", "now");
        Object q032Result = handlers.get("I032").handle(envelope(descriptors.get("I032"), q032, true));
        check(q032Result == q032, "I032 typed payload identity not preserved");

        var c058 = new MasteryEvidenceAssessmentInboundHandlers.AdmitExternalEvidenceCandidateCommand("candidate", "policy", "criteria", "conditions", "op");
        Object c058Result = handlers.get("I058").handle(envelope(descriptors.get("I058"), c058, true));
        check(c058Result == c058, "I058 typed payload identity not preserved");

        expectFailure(HandlerFailureCode.AUTHORIZATION_DENIED,
                () -> handlers.get("I056").handle(envelope(descriptors.get("I056"),
                        new MasteryEvidenceAssessmentInboundHandlers.SelectMasteryEvidenceProfileCommand("s", "v", "p", "op"), false)));
        expectFailure(HandlerFailureCode.ROUTE_SCOPE_MISMATCH,
                () -> handlers.get("I062").handle(new InboundEnvelope("I062", "CreateAssessmentBlueprint",
                        "SYSTEM_MASTER/LEARNING", "LRN-CMD-PORT-001", "principal", true,
                        new MasteryEvidenceAssessmentInboundHandlers.CreateAssessmentBlueprintCommand("cv", "spec", "op"))));
        expectFailure(HandlerFailureCode.INVALID_PAYLOAD,
                () -> handlers.get("I060").handle(envelope(descriptors.get("I060"), "wrong-payload", true)));

        expectIllegalArgument(() -> new MasteryEvidenceAssessmentInboundHandlers.GetEvidencePackageForQualificationQuery(null, "p", "r", "a"));
        expectIllegalArgument(() -> new MasteryEvidenceAssessmentInboundHandlers.RecordExternalEvidenceCandidateCommand("c", "s", "refs", null, "use", "op"));
        expectIllegalArgument(() -> new MasteryEvidenceAssessmentInboundHandlers.CreateAssessmentBlueprintCommand("v", null, "op"));

        RuntimeException domainFailure = new RuntimeException("domain-failure-identity");
        Map<String, InboundHandler> failing = new LinkedHashMap<>();
        MasteryEvidenceAssessmentInboundHandlers.registerAll((d, h) -> failing.put(d.interfaceId(), h),
                q -> { throw domainFailure; },
                new MasteryEvidenceAssessmentInboundHandlers.MasteryEnginePort() {
                    @Override public Object selectMasteryEvidenceProfile(MasteryEvidenceAssessmentInboundHandlers.SelectMasteryEvidenceProfileCommand c) { throw domainFailure; }
                    @Override public Object requestMasteryReprojection(MasteryEvidenceAssessmentInboundHandlers.RequestMasteryReprojectionCommand c) { throw domainFailure; }
                    @Override public Object challengeMasteryProjection(MasteryEvidenceAssessmentInboundHandlers.ChallengeMasteryProjectionCommand c) { throw domainFailure; }
                }, admissionPort, blueprintPort);
        try {
            failing.get("I032").handle(envelope(descriptors.get("I032"), q032, true));
            throw new AssertionError("expected domain failure");
        } catch (RuntimeException ex) {
            check(ex == domainFailure, "domain failure identity must propagate unchanged");
        }

        System.out.println("PASS MasteryEvidenceAssessmentInboundHandlerQualificationTest routes=8 production_bound=0");
    }

    private static InboundEnvelope envelope(RouteDescriptor d, Object payload, boolean authorized) {
        return new InboundEnvelope(d.interfaceId(), d.route(), d.ownerPath(), d.port(), "principal", authorized, payload);
    }

    private static void checkRoute(Map<String, RouteDescriptor> ds, String id, String route, String port, String component, boolean idem) {
        RouteDescriptor d = ds.get(id);
        check(d != null, "missing " + id);
        check(d.route().equals(route), id + " route drift");
        check(d.port().equals(port), id + " port drift");
        check(d.targetComponent().equals(component), id + " component drift");
        check(d.ownerPath().equals("SYSTEM_MASTER/LEARNING"), id + " owner-path drift");
        check(d.idempotencyRequired() == idem, id + " idempotency metadata drift");
    }

    private static void expectFailure(HandlerFailureCode code, Throwing action) throws Exception {
        try { action.run(); throw new AssertionError("expected handler failure " + code); }
        catch (HandlerContractException ex) { check(ex.code() == code, "wrong handler failure code"); }
    }
    private static void expectIllegalArgument(Throwing action) throws Exception {
        try { action.run(); throw new AssertionError("expected IllegalArgumentException"); }
        catch (IllegalArgumentException expected) { }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }
}
