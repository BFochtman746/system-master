package org.systemmaster.tools.vision;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** Held-out isotonic calibration profile. It maps an engine's raw confidence onto observed correctness probability. */
public record ConfidenceCalibrationProfile(
        String engineId,
        String engineVersion,
        String corpusDigest,
        List<Block> blocks,
        int sampleCount) {

    public record Sample(double rawConfidence, boolean correct) {
        public Sample {
            range(rawConfidence, "rawConfidence");
        }
    }

    public record Block(double minRaw, double maxRaw, double calibratedProbability, int sampleCount) {
        public Block {
            range(minRaw, "minRaw");
            range(maxRaw, "maxRaw");
            range(calibratedProbability, "calibratedProbability");
            if (minRaw > maxRaw) throw new IllegalArgumentException("minRaw must be <= maxRaw");
            if (sampleCount <= 0) throw new IllegalArgumentException("sampleCount must be positive");
        }
    }

    public ConfidenceCalibrationProfile {
        engineId = requireText(engineId, "engineId");
        engineVersion = requireText(engineVersion, "engineVersion");
        corpusDigest = requireText(corpusDigest, "corpusDigest");
        blocks = List.copyOf(Objects.requireNonNull(blocks, "blocks"));
        if (blocks.isEmpty()) throw new IllegalArgumentException("blocks must not be empty");
        if (sampleCount <= 0) throw new IllegalArgumentException("sampleCount must be positive");
        int observed = blocks.stream().mapToInt(Block::sampleCount).sum();
        if (observed != sampleCount) throw new IllegalArgumentException("block sample counts do not match profile sampleCount");
        double previousMax = -1.0;
        double previousProbability = -1.0;
        for (Block block : blocks) {
            if (block.minRaw() < previousMax) throw new IllegalArgumentException("calibration blocks overlap or are unsorted");
            if (block.calibratedProbability() < previousProbability) {
                throw new IllegalArgumentException("isotonic probabilities must be nondecreasing");
            }
            previousMax = block.maxRaw();
            previousProbability = block.calibratedProbability();
        }
    }

    public static ConfidenceCalibrationProfile fit(
            String engineId,
            String engineVersion,
            String corpusDigest,
            List<Sample> samples) {
        Objects.requireNonNull(samples, "samples");
        if (samples.size() < 8) throw new IllegalArgumentException("at least 8 held-out samples are required for calibration");
        ArrayList<Sample> sorted = new ArrayList<>(samples);
        sorted.sort(Comparator.comparingDouble(Sample::rawConfidence));

        ArrayList<MutableBlock> working = new ArrayList<>();
        for (Sample sample : sorted) {
            MutableBlock current = new MutableBlock(sample.rawConfidence(), sample.rawConfidence(), sample.correct() ? 1.0 : 0.0, 1);
            working.add(current);
            while (working.size() >= 2) {
                MutableBlock right = working.get(working.size() - 1);
                MutableBlock left = working.get(working.size() - 2);
                if (left.mean() <= right.mean()) break;
                MutableBlock merged = left.merge(right);
                working.remove(working.size() - 1);
                working.set(working.size() - 1, merged);
            }
        }

        ArrayList<Block> blocks = new ArrayList<>();
        for (MutableBlock block : working) {
            blocks.add(new Block(block.minRaw, block.maxRaw, block.mean(), block.count));
        }
        return new ConfidenceCalibrationProfile(engineId, engineVersion, corpusDigest, blocks, samples.size());
    }

    public double calibrate(double rawConfidence) {
        range(rawConfidence, "rawConfidence");
        if (rawConfidence <= blocks.get(0).maxRaw()) return blocks.get(0).calibratedProbability();
        for (Block block : blocks) {
            if (rawConfidence >= block.minRaw() && rawConfidence <= block.maxRaw()) {
                return block.calibratedProbability();
            }
        }
        return blocks.get(blocks.size() - 1).calibratedProbability();
    }

    public boolean appliesTo(String candidateEngineId, String candidateEngineVersion) {
        return engineId.equals(candidateEngineId) && engineVersion.equals(candidateEngineVersion);
    }

    private static final class MutableBlock {
        final double minRaw;
        final double maxRaw;
        final double positives;
        final int count;

        MutableBlock(double minRaw, double maxRaw, double positives, int count) {
            this.minRaw = minRaw;
            this.maxRaw = maxRaw;
            this.positives = positives;
            this.count = count;
        }

        double mean() {
            return positives / count;
        }

        MutableBlock merge(MutableBlock other) {
            return new MutableBlock(minRaw, other.maxRaw, positives + other.positives, count + other.count);
        }
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }

    private static void range(double value, String name) {
        if (!Double.isFinite(value) || value < 0.0 || value > 1.0) {
            throw new IllegalArgumentException(name + " must be in [0,1]");
        }
    }
}
