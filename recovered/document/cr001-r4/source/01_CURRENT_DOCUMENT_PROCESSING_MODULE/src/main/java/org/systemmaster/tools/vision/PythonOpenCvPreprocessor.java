package org.systemmaster.tools.vision;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Executes the bundled OpenCV restoration worker through a bounded local Python process. */
public final class PythonOpenCvPreprocessor implements OpenCvPreprocessorPort {
    private final Path pythonExecutable;
    private final Path workerScript;
    private final Duration timeout;

    public PythonOpenCvPreprocessor(Path pythonExecutable, Path workerScript, Duration timeout) {
        this.pythonExecutable = requireExecutable(pythonExecutable, "pythonExecutable");
        this.workerScript = requireFile(workerScript, "workerScript");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
    }

    @Override
    public Identity identity() {
        try {
            VisionLocalProcess.Result result = VisionLocalProcess.run(
                    List.of(pythonExecutable.toString(), workerScript.toString(), "probe", "opencv"),
                    Duration.ofSeconds(15), null, Map.of());
            if (result.exitCode() != 0) {
                return new Identity("OPENCV", "UNAVAILABLE", false, false);
            }
            String version = result.output().lines()
                    .filter(line -> line.startsWith("VERSION\t"))
                    .map(line -> line.substring("VERSION\t".length()).trim())
                    .findFirst().orElse("UNKNOWN");
            return new Identity("OPENCV", version, true, false);
        } catch (Exception e) {
            return new Identity("OPENCV", "UNAVAILABLE", false, false);
        }
    }

    @Override
    public Result preprocess(byte[] sourceImage, Profile profile) throws Exception {
        Objects.requireNonNull(sourceImage, "sourceImage");
        Objects.requireNonNull(profile, "profile");
        if (sourceImage.length == 0) throw new IllegalArgumentException("sourceImage must not be empty");
        Identity identity = identity();
        if (!identity.healthy() || identity.networkRequired()) {
            throw new IllegalStateException("OpenCV local worker is unavailable or non-local");
        }

        Path temp = Files.createTempDirectory("systemmaster-docvision-opencv-");
        try {
            Path input = temp.resolve("source.png");
            Path out = temp.resolve("out");
            Files.createDirectories(out);
            Files.write(input, sourceImage);
            VisionLocalProcess.Result process = VisionLocalProcess.run(
                    List.of(
                            pythonExecutable.toString(), workerScript.toString(), "preprocess",
                            "--input", input.toString(),
                            "--output", out.toString(),
                            "--profile", profile.name()),
                    timeout, temp, Map.of());
            if (process.exitCode() != 0) {
                throw new IOException("OpenCV preprocessing failed exit=" + process.exitCode() + " output=" + truncate(process.output()));
            }
            Path manifest = out.resolve("manifest.tsv");
            if (!Files.isRegularFile(manifest)) throw new IOException("OpenCV worker did not emit manifest.tsv");
            return parseManifest(sourceImage, profile, out, Files.readAllLines(manifest));
        } finally {
            deleteTree(temp);
        }
    }

    static Result parseManifest(byte[] sourceImage, Profile profile, Path outputDir, List<String> lines) throws IOException {
        String sourceSha = DocumentVisionDigest.sha256(sourceImage);
        ArrayList<Variant> variants = new ArrayList<>();
        LinkedHashMap<String, Double> metrics = new LinkedHashMap<>();
        ArrayList<String> diagnostics = new ArrayList<>();
        for (String line : lines) {
            if (line == null || line.isBlank()) continue;
            String[] fields = line.split("\\t", -1);
            switch (fields[0]) {
                case "METRIC" -> {
                    if (fields.length != 3) throw new IOException("invalid METRIC manifest row");
                    metrics.put(fields[1], Double.parseDouble(fields[2]));
                }
                case "DIAG" -> {
                    if (fields.length != 2) throw new IOException("invalid DIAG manifest row");
                    diagnostics.add(fields[1]);
                }
                case "VARIANT" -> {
                    if (fields.length != 7) throw new IOException("invalid VARIANT manifest row");
                    String id = fields[1];
                    Path path = outputDir.resolve(fields[2]).normalize();
                    if (!path.startsWith(outputDir.normalize()) || !Files.isRegularFile(path)) {
                        throw new IOException("variant path escaped output directory or is missing");
                    }
                    byte[] bytes = Files.readAllBytes(path);
                    String expectedSha = fields[3];
                    String actualSha = DocumentVisionDigest.sha256(bytes);
                    if (!actualSha.equals(expectedSha)) throw new IOException("variant digest mismatch: " + id);
                    int width = Integer.parseInt(fields[4]);
                    int height = Integer.parseInt(fields[5]);
                    List<String> operations = fields[6].isBlank() ? List.of() : List.of(fields[6].split(","));
                    variants.add(new Variant(id, bytes, actualSha, width, height, operations, Map.copyOf(metrics)));
                }
                default -> throw new IOException("unknown preprocessing manifest record: " + fields[0]);
            }
        }
        if (variants.isEmpty()) throw new IOException("OpenCV worker produced no variants");
        return new Result(sourceSha, profile, variants, metrics, diagnostics);
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
