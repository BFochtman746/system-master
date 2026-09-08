package org.systemmaster.core;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class Fwp001QualificationTest {
    private static int tests;

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            throw new IllegalArgumentException("usage: Fwp001QualificationTest <traceability.csv> <baseline-binding.json>");
        }
        Path csv = Path.of(args[0]);
        Path binding = Path.of(args[1]);

        List<TraceLink> links = loadLinks(csv);
        testAuthoritativeFixtureHasExactly60Requirements(links);
        testPackageOwnedMappingsAreExact(links);
        testCompleteBidirectionalRegistry(links);
        testMissingRequirementFailsClosure(links);
        testConflictingRequirementIdentityRejected(links);
        testBlankTraceAxisRejected(links);
        testArchitectureClosureKeepsAxesIndependent();
        testFalseImplementationClaimRejected();
        testFalseExecutableQualificationClaimRejected();
        testFalseProductionClaimRejected();
        testIndependentEvidenceCanSupportIndependentClaim();
        testFrozenBaselineBinding(binding);

        System.out.println("PASS F-WP-001 tests=" + tests + " requirements=" + links.size());
    }

    private static void testAuthoritativeFixtureHasExactly60Requirements(List<TraceLink> links) {
        check(links.size() == 60, "expected 60 authoritative F-RQ rows");
        for (int i = 1; i <= 60; i++) {
            String id = "F-RQ-%03d".formatted(i);
            check(links.stream().anyMatch(link -> link.requirementId().equals(id)), "missing " + id);
        }
        pass();
    }

    private static void testPackageOwnedMappingsAreExact(List<TraceLink> links) {
        TraceLink rq59 = links.stream().filter(link -> link.requirementId().equals("F-RQ-059")).findFirst().orElseThrow();
        TraceLink rq60 = links.stream().filter(link -> link.requirementId().equals("F-RQ-060")).findFirst().orElseThrow();
        check(rq59.implementingComponent().equals("TraceabilityRegistry"), "F-RQ-059 component authority");
        check(rq59.commandQueryApi().equals("ValidateTraceability"), "F-RQ-059 API authority");
        check(rq59.implementationWorkPackage().equals("F-WP-001"), "F-RQ-059 package ownership");
        check(rq60.implementingComponent().equals("RebuildGovernance"), "F-RQ-060 component authority");
        check(rq60.commandQueryApi().equals("CloseArchitecturePacket"), "F-RQ-060 API authority");
        check(rq60.implementationWorkPackage().equals("F-WP-001"), "F-RQ-060 package ownership");
        pass();
    }

    private static void testCompleteBidirectionalRegistry(List<TraceLink> links) {
        TraceabilityRegistry registry = registry(links);
        Set<String> expected = expectedRequirementIds();
        TraceabilityRegistry.ValidationResult result = registry.validateBidirectional(expected);
        check(result.complete(), "complete registry must validate: " + result);
        check(registry.size() == 60, "registry size");
        for (TraceLink link : links) {
            check(registry.requirement(link.requirementId()).orElseThrow().equals(link), "forward lookup " + link.requirementId());
            check(registry.requirementsFor(TraceabilityRegistry.Axis.IMPLEMENTING_COMPONENT, link.implementingComponent()).contains(link.requirementId()), "component backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.DATA_STATE, link.dataState()).contains(link.requirementId()), "data backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.COMMAND_QUERY_API, link.commandQueryApi()).contains(link.requirementId()), "api backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.INVARIANT_VALIDATOR, link.invariantValidator()).contains(link.requirementId()), "validator backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.FAILURE_RECOVERY_RULE, link.failureRecoveryRule()).contains(link.requirementId()), "failure backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.FUTURE_TEST_FAMILY, link.futureTestFamily()).contains(link.requirementId()), "test backlink");
            check(registry.requirementsFor(TraceabilityRegistry.Axis.IMPLEMENTATION_WORK_PACKAGE, link.implementationWorkPackage()).contains(link.requirementId()), "work-package backlink");
        }
        pass();
    }

    private static void testMissingRequirementFailsClosure(List<TraceLink> links) {
        TraceabilityRegistry registry = new TraceabilityRegistry();
        for (TraceLink link : links) {
            if (!link.requirementId().equals("F-RQ-037")) registry.register(link);
        }
        TraceabilityRegistry.ValidationResult result = registry.validateBidirectional(expectedRequirementIds());
        check(!result.complete(), "missing requirement must fail");
        check(result.missingRequirementIds().equals(List.of("F-RQ-037")), "exact missing requirement");
        pass();
    }

    private static void testConflictingRequirementIdentityRejected(List<TraceLink> links) {
        TraceabilityRegistry registry = new TraceabilityRegistry();
        TraceLink original = links.get(0);
        registry.register(original);
        TraceLink conflicting = new TraceLink(
                original.requirementId(), original.requirementText() + " changed", original.designDecision(),
                original.canonicalOwner(), original.implementingComponent(), original.dataState(),
                original.commandQueryApi(), original.invariantValidator(), original.failureRecoveryRule(),
                original.futureTestFamily(), original.implementationWorkPackage());
        expectCode(() -> registry.register(conflicting), "TRACE_IDENTITY_COLLISION");
        pass();
    }

    private static void testBlankTraceAxisRejected(List<TraceLink> links) {
        TraceLink original = links.get(0);
        try {
            new TraceLink(original.requirementId(), original.requirementText(), original.designDecision(),
                    original.canonicalOwner(), " ", original.dataState(), original.commandQueryApi(),
                    original.invariantValidator(), original.failureRecoveryRule(), original.futureTestFamily(),
                    original.implementationWorkPackage());
            throw new AssertionError("blank trace axis accepted");
        } catch (IllegalArgumentException expected) {
            check(expected.getMessage().contains("implementingComponent"), "blank-axis code");
        }
        pass();
    }

    private static void testArchitectureClosureKeepsAxesIndependent() {
        RebuildGovernance governance = new RebuildGovernance();
        RebuildGovernance.ClosureRecord record = governance.closeArchitecturePacket(new RebuildGovernance.ClosureRequest(
                "021F-R1",
                RebuildGovernance.Standing.CLOSED,
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.NOT_CLAIMED,
                List.of(new RebuildGovernance.EvidenceRef("ARCH-EV-1", RebuildGovernance.EvidenceClass.ARCHITECTURE))));
        check(record.standings().get(RebuildGovernance.Axis.ARCHITECTURE) == RebuildGovernance.Standing.CLOSED, "architecture closed");
        check(record.standings().get(RebuildGovernance.Axis.PRODUCT_IMPLEMENTATION) == RebuildGovernance.Standing.NOT_STARTED, "implementation independent");
        check(record.standings().get(RebuildGovernance.Axis.EXECUTABLE_QUALIFICATION) == RebuildGovernance.Standing.NOT_STARTED, "qualification independent");
        check(record.standings().get(RebuildGovernance.Axis.EMPIRICAL_PRODUCTION) == RebuildGovernance.Standing.NOT_CLAIMED, "production independent");
        pass();
    }

    private static void testFalseImplementationClaimRejected() {
        RebuildGovernance governance = new RebuildGovernance();
        expectCode(() -> governance.closeArchitecturePacket(requestWith(
                RebuildGovernance.Standing.PASSED,
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.NOT_CLAIMED,
                List.of(new RebuildGovernance.EvidenceRef("ARCH-EV", RebuildGovernance.EvidenceClass.ARCHITECTURE)))),
                "FALSE_IMPLEMENTATION_CLAIM");
        pass();
    }

    private static void testFalseExecutableQualificationClaimRejected() {
        RebuildGovernance governance = new RebuildGovernance();
        expectCode(() -> governance.closeArchitecturePacket(requestWith(
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.PASSED,
                RebuildGovernance.Standing.NOT_CLAIMED,
                List.of(new RebuildGovernance.EvidenceRef("ARCH-EV", RebuildGovernance.EvidenceClass.ARCHITECTURE)))),
                "FALSE_EXECUTABLE_QUALIFICATION_CLAIM");
        pass();
    }

    private static void testFalseProductionClaimRejected() {
        RebuildGovernance governance = new RebuildGovernance();
        expectCode(() -> governance.closeArchitecturePacket(requestWith(
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.PROVEN,
                List.of(new RebuildGovernance.EvidenceRef("ARCH-EV", RebuildGovernance.EvidenceClass.ARCHITECTURE)))),
                "FALSE_EMPIRICAL_PRODUCTION_CLAIM");
        pass();
    }

    private static void testIndependentEvidenceCanSupportIndependentClaim() {
        RebuildGovernance governance = new RebuildGovernance();
        RebuildGovernance.ClosureRecord record = governance.closeArchitecturePacket(requestWith(
                RebuildGovernance.Standing.PASSED,
                RebuildGovernance.Standing.NOT_STARTED,
                RebuildGovernance.Standing.NOT_CLAIMED,
                List.of(
                        new RebuildGovernance.EvidenceRef("ARCH-EV", RebuildGovernance.EvidenceClass.ARCHITECTURE),
                        new RebuildGovernance.EvidenceRef("IMPL-EV", RebuildGovernance.EvidenceClass.IMPLEMENTATION))));
        check(record.standings().get(RebuildGovernance.Axis.PRODUCT_IMPLEMENTATION) == RebuildGovernance.Standing.PASSED, "independent implementation evidence preserved");
        pass();
    }

    private static void testFrozenBaselineBinding(Path binding) throws IOException {
        String text = Files.readString(binding, StandardCharsets.UTF_8);
        check(text.contains("3d6f5e168dd2e808a8a785908db73914a628d83f7885b62db4f9483f888d9d55"), "candidate manifest digest binding");
        check(text.contains("b84336db0c0fbbf09157ebdae13729df44f5375edbbd70ee65caf69fcaad0c50"), "parent UAF manifest binding");
        check(text.contains("945f3882537d5badfac0f98d53902d4117af3df9d24d3c7040321a4c29a070c2"), "parent recovery zip binding");
        check(text.contains("BOUNDED_RECOVERY_REBASE_ENGINEERING_BASELINE__NOT_LATEST_ORIGINAL_SOURCE"), "source-standing truth boundary");
        check(text.contains("F-RQ-059") && text.contains("F-RQ-060"), "package requirement binding");
        pass();
    }

    private static RebuildGovernance.ClosureRequest requestWith(
            RebuildGovernance.Standing implementation,
            RebuildGovernance.Standing qualification,
            RebuildGovernance.Standing production,
            List<RebuildGovernance.EvidenceRef> evidence) {
        return new RebuildGovernance.ClosureRequest(
                "021F-R1", RebuildGovernance.Standing.CLOSED, implementation, qualification, production, evidence);
    }

    private static TraceabilityRegistry registry(List<TraceLink> links) {
        TraceabilityRegistry registry = new TraceabilityRegistry();
        links.forEach(registry::register);
        return registry;
    }

    private static Set<String> expectedRequirementIds() {
        Set<String> expected = new LinkedHashSet<>();
        for (int i = 1; i <= 60; i++) expected.add("F-RQ-%03d".formatted(i));
        return expected;
    }

    private static void expectCode(Runnable action, String code) {
        try {
            action.run();
            throw new AssertionError("expected error " + code);
        } catch (IllegalStateException expected) {
            check(expected.getMessage().startsWith(code), "expected code " + code + " but got " + expected.getMessage());
        }
    }

    private static List<TraceLink> loadLinks(Path path) throws IOException {
        List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);
        if (lines.isEmpty()) throw new IllegalArgumentException("empty traceability fixture");
        List<String> header = parseCsvLine(lines.get(0));
        check(header.size() == 13, "authoritative traceability header width");
        List<TraceLink> links = new ArrayList<>();
        for (int i = 1; i < lines.size(); i++) {
            if (lines.get(i).isBlank()) continue;
            List<String> row = parseCsvLine(lines.get(i));
            if (row.size() != 13) throw new IllegalArgumentException("row " + (i + 1) + " has " + row.size() + " columns");
            links.add(new TraceLink(
                    row.get(0), row.get(1), row.get(4), row.get(5), row.get(6), row.get(7),
                    row.get(8), row.get(9), row.get(10), row.get(11), row.get(12)));
        }
        return links;
    }

    static List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else {
                    quoted = !quoted;
                }
            } else if (c == ',' && !quoted) {
                values.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        if (quoted) throw new IllegalArgumentException("unterminated CSV quote");
        values.add(current.toString());
        return values;
    }

    private static void pass() {
        tests++;
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
