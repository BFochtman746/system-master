package org.systemmaster.tools.design;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Fail-closed score gate. A generative model cannot label its own work a masterpiece without measured evidence. */
public final class MasterpieceQualityGate {
    public record Assessment(
            Map<MasterpieceDesignContract.Dimension, Double> measuredScores,
            double overallScore,
            boolean accessibilityPassed,
            boolean renderProofPassed,
            List<String> criticalFindings,
            String evaluatorId) {
        public Assessment {
            measuredScores = Map.copyOf(Objects.requireNonNull(measuredScores, "measuredScores"));
            if (!measuredScores.keySet().containsAll(java.util.Set.of(MasterpieceDesignContract.Dimension.values()))) {
                throw new IllegalArgumentException("measuredScores must define every design dimension");
            }
            for (double value : measuredScores.values()) checkScore(value);
            checkScore(overallScore);
            criticalFindings = List.copyOf(Objects.requireNonNull(criticalFindings, "criticalFindings"));
            evaluatorId = Objects.requireNonNull(evaluatorId, "evaluatorId").trim();
            if (evaluatorId.isEmpty()) throw new IllegalArgumentException("evaluatorId must not be blank");
        }
    }

    public record Decision(boolean passed, List<String> blockers) {
        public Decision {
            blockers = List.copyOf(Objects.requireNonNull(blockers, "blockers"));
            if (passed && !blockers.isEmpty()) throw new IllegalArgumentException("passed decision cannot contain blockers");
        }
    }

    public Decision evaluate(MasterpieceDesignContract contract, Assessment assessment) {
        Objects.requireNonNull(contract, "contract");
        Objects.requireNonNull(assessment, "assessment");
        ArrayList<String> blockers = new ArrayList<>();
        for (Map.Entry<MasterpieceDesignContract.Dimension, Double> requirement : contract.minimumScores().entrySet()) {
            double actual = assessment.measuredScores().get(requirement.getKey());
            if (actual < requirement.getValue()) {
                blockers.add(requirement.getKey() + " below threshold actual=" + actual + " minimum=" + requirement.getValue());
            }
        }
        if (assessment.overallScore() < contract.minimumOverallScore()) {
            blockers.add("overall score below threshold");
        }
        if (contract.requireAccessibilityPass() && !assessment.accessibilityPassed()) {
            blockers.add("accessibility proof missing or failed");
        }
        if (contract.requireRenderProof() && !assessment.renderProofPassed()) {
            blockers.add("render proof missing or failed");
        }
        if (contract.requireHumanOverrideForUnresolvedCriticalFinding() && !assessment.criticalFindings().isEmpty()) {
            blockers.add("unresolved critical findings require explicit human override");
        }
        return new Decision(blockers.isEmpty(), blockers);
    }

    private static void checkScore(double value) {
        if (!Double.isFinite(value) || value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException("score must be in [0,1]");
        }
    }
}
