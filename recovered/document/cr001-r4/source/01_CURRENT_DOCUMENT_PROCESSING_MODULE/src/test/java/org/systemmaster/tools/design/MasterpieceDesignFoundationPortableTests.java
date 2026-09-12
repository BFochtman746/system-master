package org.systemmaster.tools.design;

import java.util.EnumMap;
import java.util.List;

public final class MasterpieceDesignFoundationPortableTests {
    private static int n;

    public static void main(String[] args) {
        MasterpieceDesignContract contract = MasterpieceDesignContract.strictPresentation(
                "executive leadership",
                "approve the recommended investment",
                "brand-001");
        check(contract.minimumScores().size() == MasterpieceDesignContract.Dimension.values().length, "all dimensions required");
        check(contract.minimumOverallScore() == .86, "strict overall threshold");
        check(contract.requireAccessibilityPass(), "accessibility required");
        check(contract.requireRenderProof(), "render proof required");

        EnumMap<MasterpieceDesignContract.Dimension, Double> strong = scores(.93);
        MasterpieceQualityGate gate = new MasterpieceQualityGate();
        var pass = gate.evaluate(contract, new MasterpieceQualityGate.Assessment(
                strong, .93, true, true, List.of(), "independent-render-critic-v1"));
        check(pass.passed(), "strong design passes");
        check(pass.blockers().isEmpty(), "passing blockers empty");

        EnumMap<MasterpieceDesignContract.Dimension, Double> weakDensity = scores(.93);
        weakDensity.put(MasterpieceDesignContract.Dimension.DENSITY_AND_LEGIBILITY, .60);
        var densityFail = gate.evaluate(contract, new MasterpieceQualityGate.Assessment(
                weakDensity, .90, true, true, List.of(), "independent-render-critic-v1"));
        check(!densityFail.passed(), "density failure blocks");
        check(densityFail.blockers().stream().anyMatch(s -> s.startsWith("DENSITY_AND_LEGIBILITY")), "density blocker named");

        var renderFail = gate.evaluate(contract, new MasterpieceQualityGate.Assessment(
                strong, .93, true, false, List.of(), "independent-render-critic-v1"));
        check(!renderFail.passed(), "render proof required");
        check(renderFail.blockers().contains("render proof missing or failed"), "render blocker named");

        var criticalFail = gate.evaluate(contract, new MasterpieceQualityGate.Assessment(
                strong, .93, true, true, List.of("logo overlaps chart"), "independent-render-critic-v1"));
        check(!criticalFail.passed(), "critical finding blocks");
        check(criticalFail.blockers().stream().anyMatch(s -> s.contains("human override")), "human override required");

        boolean rejected = false;
        try {
            EnumMap<MasterpieceDesignContract.Dimension, Double> incomplete = new EnumMap<>(MasterpieceDesignContract.Dimension.class);
            incomplete.put(MasterpieceDesignContract.Dimension.TYPOGRAPHY, .9);
            new MasterpieceDesignContract("PRESENTATION", "a", "b", "c", incomplete, .8, true, true, true);
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        check(rejected, "incomplete score contract rejected");

        System.out.println("MASTERPIECE_DESIGN_FOUNDATION_PORTABLE_PASS assertions=" + n + " dimensions=" + contract.minimumScores().size());
    }

    private static EnumMap<MasterpieceDesignContract.Dimension, Double> scores(double value) {
        EnumMap<MasterpieceDesignContract.Dimension, Double> result = new EnumMap<>(MasterpieceDesignContract.Dimension.class);
        for (MasterpieceDesignContract.Dimension dimension : MasterpieceDesignContract.Dimension.values()) result.put(dimension, value);
        return result;
    }

    private static void check(boolean condition, String message) {
        n++;
        if (!condition) throw new AssertionError(message);
    }
}
