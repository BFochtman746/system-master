package org.systemmaster.tools.document;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Promotion policy: no artifact becomes FINAL_PROOFED until every required independent gate passes. */
public final class FinalDocumentProofPolicy {
    public enum State { DRAFT, STRUCTURALLY_VERIFIED, SEMANTICALLY_VERIFIED, RENDER_VERIFIED, ACCESSIBILITY_VERIFIED, FINAL_PROOFED, PROOF_FAILED }
    public record Evaluation(State state, Set<DocumentProofReceipt.Gate> passed, Set<DocumentProofReceipt.Gate> missing, List<String> diagnostics) {}

    private static final Set<DocumentProofReceipt.Gate> FINAL_GATES = EnumSet.allOf(DocumentProofReceipt.Gate.class);

    /** Backward-compatible strict final policy. */
    public Evaluation evaluate(String expectedResultSha256, List<DocumentProofReceipt> receipts) {
        return evaluate(new ProofRequirementProfile(null, expectedResultSha256, FINAL_GATES, Set.of(), "", false), receipts);
    }

    public Evaluation evaluate(ProofRequirementProfile profile, List<DocumentProofReceipt> receipts) {
        Objects.requireNonNull(profile, "profile");
        Objects.requireNonNull(receipts, "receipts");
        Map<DocumentProofReceipt.Gate,DocumentProofReceipt> latest = new EnumMap<>(DocumentProofReceipt.Gate.class);
        for (DocumentProofReceipt receipt : receipts) {
            latest.merge(receipt.gate(), receipt, FinalDocumentProofPolicy::preferReceipt);
        }

        ArrayList<String> diagnostics = new ArrayList<>();
        boolean failed = false;
        EnumSet<DocumentProofReceipt.Gate> passed = EnumSet.noneOf(DocumentProofReceipt.Gate.class);
        for (var entry : latest.entrySet()) {
            DocumentProofReceipt receipt = entry.getValue();
            if (!profile.expectedResultSha256().equals(receipt.resultSha256())) {
                diagnostics.add("RESULT_DIGEST_MISMATCH:" + receipt.gate());
                failed = true;
                continue;
            }
            if (profile.expectedSourceSha256() != null && !profile.expectedSourceSha256().equals(receipt.sourceSha256())) {
                diagnostics.add("SOURCE_DIGEST_MISMATCH:" + receipt.gate());
                failed = true;
                continue;
            }
            if (receipt.status() == DocumentProofReceipt.Status.FAIL) {
                diagnostics.add("PROOF_FAILED:" + receipt.gate());
                failed = true;
                continue;
            }
            if (receipt.status() == DocumentProofReceipt.Status.NOT_APPLICABLE
                    && !profile.allowedNotApplicableGates().contains(receipt.gate())) {
                diagnostics.add("NOT_APPLICABLE_NOT_ALLOWED:" + receipt.gate());
                failed = true;
                continue;
            }
            if (receipt.gate() == DocumentProofReceipt.Gate.RENDERED
                    && profile.requireIndependentRenderedEngine()
                    && !profile.mutationEngine().isBlank()
                    && receipt.engine().equalsIgnoreCase(profile.mutationEngine())) {
                diagnostics.add("RENDER_ENGINE_NOT_INDEPENDENT");
                failed = true;
                continue;
            }
            passed.add(receipt.gate());
        }

        EnumSet<DocumentProofReceipt.Gate> missing = profile.requiredGates().isEmpty()
                ? EnumSet.noneOf(DocumentProofReceipt.Gate.class)
                : EnumSet.copyOf(profile.requiredGates());
        missing.removeAll(passed);
        for (DocumentProofReceipt.Gate gate : missing) diagnostics.add("MISSING:" + gate);
        State state = failed ? State.PROOF_FAILED : stateFor(passed);
        if (!failed && missing.isEmpty() && passed.containsAll(FINAL_GATES)) state = State.FINAL_PROOFED;
        return new Evaluation(state, Set.copyOf(passed), Set.copyOf(missing), List.copyOf(diagnostics));
    }


    private static DocumentProofReceipt preferReceipt(DocumentProofReceipt a, DocumentProofReceipt b) {
        int time = a.completedAt().compareTo(b.completedAt());
        if (time < 0) return b;
        if (time > 0) return a;
        int status = Integer.compare(statusRank(a.status()), statusRank(b.status()));
        if (status < 0) return b;
        if (status > 0) return a;
        int engine = a.engine().compareTo(b.engine());
        return engine <= 0 ? a : b;
    }

    private static int statusRank(DocumentProofReceipt.Status status) {
        return switch (status) {
            case PASS -> 0;
            case NOT_APPLICABLE -> 1;
            case FAIL -> 2;
        };
    }

    private static State stateFor(Set<DocumentProofReceipt.Gate> passed) {
        if (!passed.contains(DocumentProofReceipt.Gate.PACKAGE)) return State.DRAFT;
        if (!passed.contains(DocumentProofReceipt.Gate.SEMANTIC)) return State.STRUCTURALLY_VERIFIED;
        if (!passed.contains(DocumentProofReceipt.Gate.RENDERED)) return State.SEMANTICALLY_VERIFIED;
        if (!passed.contains(DocumentProofReceipt.Gate.ACCESSIBILITY)) return State.RENDER_VERIFIED;
        if (passed.containsAll(FINAL_GATES)) return State.FINAL_PROOFED;
        return State.ACCESSIBILITY_VERIFIED;
    }
}
