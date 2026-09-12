package org.systemmaster.tools.vision;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Strict process protocol for a cached, local-only vision-language model. The worker may select a candidate or abstain; it may not invent text. */
public final class LocalVlmProcessPort implements LocalVisionLanguageModelPort {
    private final List<String> commandPrefix;
    private final String modelId;
    private final String runtimeId;
    private final String version;
    private final Duration timeout;
    private final boolean modelCached;
    private final Set<String> capabilities;

    public LocalVlmProcessPort(
            List<String> commandPrefix,
            String modelId,
            String runtimeId,
            String version,
            Duration timeout,
            boolean modelCached,
            Set<String> capabilities) {
        commandPrefix = List.copyOf(Objects.requireNonNull(commandPrefix, "commandPrefix"));
        if (commandPrefix.isEmpty()) throw new IllegalArgumentException("commandPrefix must not be empty");
        Path executable = Path.of(commandPrefix.get(0)).toAbsolutePath().normalize();
        if (!Files.isRegularFile(executable) || !Files.isExecutable(executable)) {
            throw new IllegalArgumentException("local VLM worker executable unavailable: " + executable);
        }
        ArrayList<String> normalizedPrefix = new ArrayList<>(commandPrefix);
        normalizedPrefix.set(0, executable.toString());
        this.commandPrefix = List.copyOf(normalizedPrefix);
        this.modelId = requireText(modelId, "modelId");
        this.runtimeId = requireText(runtimeId, "runtimeId");
        this.version = requireText(version, "version");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        this.modelCached = modelCached;
        this.capabilities = Set.copyOf(Objects.requireNonNull(capabilities, "capabilities"));
    }

    @Override
    public Identity identity() {
        return new Identity(modelId, runtimeId, version, capabilities, true, modelCached, false);
    }

    @Override
    public Decision adjudicate(byte[] pageImage, List<Candidate> candidates, Map<String, String> context) throws Exception {
        Objects.requireNonNull(pageImage, "pageImage");
        candidates = List.copyOf(Objects.requireNonNull(candidates, "candidates"));
        context = Map.copyOf(Objects.requireNonNull(context, "context"));
        if (!modelCached) throw new IllegalStateException("local VLM model is not cached");
        if (candidates.size() < 2) throw new IllegalArgumentException("VLM adjudication requires at least two candidates");
        if (pageImage.length == 0) throw new IllegalArgumentException("pageImage must not be empty");

        Path temp = Files.createTempDirectory("systemmaster-docvision-vlm-");
        try {
            Path image = temp.resolve("crop.png");
            Path candidateFile = temp.resolve("candidates.tsv");
            Path contextFile = temp.resolve("context.tsv");
            Path decisionFile = temp.resolve("decision.tsv");
            Files.write(image, pageImage);
            writeCandidates(candidateFile, candidates);
            writeContext(contextFile, context);

            ArrayList<String> argv = new ArrayList<>(commandPrefix);
            argv.addAll(List.of(
                    "adjudicate",
                    "--image", image.toString(),
                    "--candidates", candidateFile.toString(),
                    "--context", contextFile.toString(),
                    "--output", decisionFile.toString()));
            VisionLocalProcess.Result result = VisionLocalProcess.run(argv, timeout, temp, Map.of());
            if (result.exitCode() != 0) {
                throw new IOException("local VLM worker failed exit=" + result.exitCode() + " output=" + truncate(result.output()));
            }
            if (!Files.isRegularFile(decisionFile)) throw new IOException("local VLM worker did not emit decision.tsv");
            return parseDecision(Files.readAllLines(decisionFile, StandardCharsets.UTF_8), candidates);
        } finally {
            deleteTree(temp);
        }
    }

    static Decision parseDecision(List<String> lines, List<Candidate> candidates) throws IOException {
        Integer selectedIndex = null;
        boolean abstained = false;
        double confidence = 0.0;
        ArrayList<String> diagnostics = new ArrayList<>();
        for (String line : lines) {
            if (line == null || line.isBlank()) continue;
            String[] f = line.split("\\t", -1);
            switch (f[0]) {
                case "SELECT" -> {
                    if (f.length != 2) throw new IOException("invalid SELECT row");
                    selectedIndex = Integer.valueOf(f[1]);
                }
                case "ABSTAIN" -> abstained = true;
                case "CONFIDENCE" -> {
                    if (f.length != 2) throw new IOException("invalid CONFIDENCE row");
                    confidence = Double.parseDouble(f[1]);
                    if (!Double.isFinite(confidence) || confidence < 0.0 || confidence > 1.0) {
                        throw new IOException("VLM confidence outside [0,1]");
                    }
                }
                case "DIAG" -> {
                    if (f.length != 2) throw new IOException("invalid DIAG row");
                    diagnostics.add(new String(Base64.getDecoder().decode(f[1]), StandardCharsets.UTF_8));
                }
                default -> throw new IOException("unknown VLM decision record: " + f[0]);
            }
        }
        if (abstained) {
            return new Decision("", confidence, true, List.of(), diagnostics);
        }
        if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= candidates.size()) {
            throw new IOException("VLM worker failed to select a valid candidate index");
        }
        Candidate selected = candidates.get(selectedIndex);
        LinkedHashSet<String> supporting = new LinkedHashSet<>();
        supporting.add(selected.sourceEngineId());
        for (Candidate candidate : candidates) {
            if (candidate.text().equals(selected.text())) supporting.add(candidate.sourceEngineId());
        }
        return new Decision(selected.text(), confidence, false, List.copyOf(supporting), diagnostics);
    }

    private static void writeCandidates(Path path, List<Candidate> candidates) throws IOException {
        ArrayList<String> lines = new ArrayList<>();
        for (int i = 0; i < candidates.size(); i++) {
            Candidate candidate = candidates.get(i);
            String text = Base64.getEncoder().encodeToString(candidate.text().getBytes(StandardCharsets.UTF_8));
            lines.add(i + "\t" + text + "\t" + candidate.sourceEngineId() + "\t" + candidate.confidence());
        }
        Files.write(path, lines, StandardCharsets.UTF_8);
    }

    private static void writeContext(Path path, Map<String, String> context) throws IOException {
        ArrayList<String> lines = new ArrayList<>();
        for (Map.Entry<String, String> entry : new LinkedHashMap<>(context).entrySet()) {
            String value = Base64.getEncoder().encodeToString(entry.getValue().getBytes(StandardCharsets.UTF_8));
            lines.add(entry.getKey() + "\t" + value);
        }
        Files.write(path, lines, StandardCharsets.UTF_8);
    }

    private static String requireText(String value, String name) {
        Objects.requireNonNull(value, name);
        String trimmed = value.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException(name + " must not be blank");
        return trimmed;
    }

    private static String truncate(String value) {
        return value.substring(0, Math.min(value.length(), 4096));
    }

    private static void deleteTree(Path root) {
        try (var stream = Files.walk(root)) {
            stream.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }
}
