package org.systemmaster.tools.vision;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.systemmaster.tools.ocr.OcrEnginePort;

/** Local-only PP-StructureV3 adapter using the bundled Python worker and an explicitly pinned offline PaddleX config. */
public final class PaddleStructureOcrEnginePort implements OcrEnginePort {
    private static final Set<String> CAPABILITIES = Set.of(
            "ocr.run.recognize",
            "ocr.run.layout",
            "ocr.run.structured",
            "ocr.observe.table",
            "ocr.observe.formula",
            "ocr.observe.chart",
            "ocr.observe.seal");

    private final Path pythonExecutable;
    private final Path workerScript;
    private final Path paddlexConfig;
    private final Duration timeout;
    private final String language;
    private final String inferenceEngine;
    private final String device;

    public PaddleStructureOcrEnginePort(
            Path pythonExecutable,
            Path workerScript,
            Path paddlexConfig,
            Duration timeout,
            String language,
            String inferenceEngine,
            String device) {
        this.pythonExecutable = requireExecutable(pythonExecutable, "pythonExecutable");
        this.workerScript = requireFile(workerScript, "workerScript");
        this.paddlexConfig = requireFile(paddlexConfig, "paddlexConfig");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        this.language = language == null || language.isBlank() ? "en" : language.trim();
        this.inferenceEngine = inferenceEngine == null || inferenceEngine.isBlank() ? "paddle" : inferenceEngine.trim();
        this.device = device == null || device.isBlank() ? "cpu" : device.trim();
    }

    @Override
    public Identity identity() {
        try {
            VisionLocalProcess.Result result = VisionLocalProcess.run(
                    List.of(pythonExecutable.toString(), workerScript.toString(), "probe", "paddle"),
                    Duration.ofSeconds(20), null, Map.of());
            if (result.exitCode() != 0) {
                return new Identity("PADDLE_STRUCTURE_V3", "UNAVAILABLE", digestIdentity("UNAVAILABLE"), CAPABILITIES, false, false);
            }
            String version = result.output().lines()
                    .filter(line -> line.startsWith("VERSION\t"))
                    .map(line -> line.substring("VERSION\t".length()).trim())
                    .findFirst().orElse("UNKNOWN");
            return new Identity("PADDLE_STRUCTURE_V3", version, digestIdentity(version), CAPABILITIES, true, false);
        } catch (Exception e) {
            return new Identity("PADDLE_STRUCTURE_V3", "UNAVAILABLE", digestIdentity("UNAVAILABLE"), CAPABILITIES, false, false);
        }
    }

    @Override
    public Result recognize(byte[] image, String action, Map<String, String> options) throws Exception {
        Objects.requireNonNull(image, "image");
        Objects.requireNonNull(action, "action");
        Objects.requireNonNull(options, "options");
        if (!CAPABILITIES.contains(action)) throw new IllegalArgumentException("unsupported Paddle action: " + action);
        Identity identity = identity();
        if (!identity.healthy() || identity.networkRequired()) {
            throw new IllegalStateException("Paddle structured OCR worker is unavailable or non-local");
        }

        Path temp = Files.createTempDirectory("systemmaster-docvision-paddle-");
        try {
            Path input = temp.resolve("page.png");
            Path output = temp.resolve("out");
            Files.createDirectories(output);
            Files.write(input, image);
            ArrayList<String> argv = new ArrayList<>(List.of(
                    pythonExecutable.toString(), workerScript.toString(), "paddle",
                    "--input", input.toString(),
                    "--output", output.toString(),
                    "--config", paddlexConfig.toString(),
                    "--language", options.getOrDefault("language", language),
                    "--engine", options.getOrDefault("engine", inferenceEngine),
                    "--device", options.getOrDefault("device", device),
                    "--action", action));
            VisionLocalProcess.Result process = VisionLocalProcess.run(argv, timeout, temp, Map.of());
            if (process.exitCode() != 0) {
                throw new IOException("Paddle worker failed exit=" + process.exitCode() + " output=" + truncate(process.output()));
            }
            Path manifest = output.resolve("regions.tsv");
            if (!Files.isRegularFile(manifest)) throw new IOException("Paddle worker did not emit regions.tsv");
            return parseRegions(Files.readAllLines(manifest, StandardCharsets.UTF_8));
        } finally {
            deleteTree(temp);
        }
    }

    static Result parseRegions(List<String> lines) throws IOException {
        ArrayList<Region> regions = new ArrayList<>();
        LinkedHashMap<String, String> facts = new LinkedHashMap<>();
        ArrayList<String> diagnostics = new ArrayList<>();
        for (String line : lines) {
            if (line == null || line.isBlank()) continue;
            String[] f = line.split("\\t", -1);
            switch (f[0]) {
                case "REGION" -> {
                    if (f.length != 11) throw new IOException("invalid Paddle REGION row");
                    String text = new String(Base64.getDecoder().decode(f[2]), StandardCharsets.UTF_8);
                    String factsJson = new String(Base64.getDecoder().decode(f[10]), StandardCharsets.UTF_8);
                    regions.add(new Region(
                            f[1], text,
                            Double.parseDouble(f[3]), Double.parseDouble(f[4]),
                            Double.parseDouble(f[5]), Double.parseDouble(f[6]),
                            Double.parseDouble(f[7]), f[8], Map.of("workerFacts", factsJson, "page", f[9])));
                }
                case "FACT" -> {
                    if (f.length != 3) throw new IOException("invalid Paddle FACT row");
                    facts.put(f[1], new String(Base64.getDecoder().decode(f[2]), StandardCharsets.UTF_8));
                }
                case "DIAG" -> {
                    if (f.length != 2) throw new IOException("invalid Paddle DIAG row");
                    diagnostics.add(new String(Base64.getDecoder().decode(f[1]), StandardCharsets.UTF_8));
                }
                default -> throw new IOException("unknown Paddle manifest record: " + f[0]);
            }
        }
        return new Result(regions, facts, diagnostics);
    }

    private String digestIdentity(String version) {
        String value = pythonExecutable + "|" + workerScript + "|" + paddlexConfig + "|" + version + "|" + inferenceEngine + "|" + device;
        return DocumentVisionDigest.sha256(value.getBytes(StandardCharsets.UTF_8));
    }

    private static Path requireExecutable(Path path, String name) {
        Objects.requireNonNull(path, name);
        Path normalized = path.toAbsolutePath().normalize();
        if (!Files.isRegularFile(normalized) || !Files.isExecutable(normalized)) {
            throw new IllegalArgumentException(name + " unavailable: " + path);
        }
        return normalized;
    }

    private static Path requireFile(Path path, String name) {
        Objects.requireNonNull(path, name);
        Path normalized = path.toAbsolutePath().normalize();
        if (!Files.isRegularFile(normalized)) throw new IllegalArgumentException(name + " unavailable: " + path);
        return normalized;
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
