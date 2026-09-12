package org.systemmaster.tools.design;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Bounded argv-only runner for local design intelligence workers. */
final class DesignLocalProcess {
    private static final long OUTPUT_LIMIT = 8L * 1024L * 1024L;
    private static final Set<String> SAFE_ENV = Set.of("PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "CUDA_PATH");
    record Result(int exitCode, String output) { }
    private DesignLocalProcess() { }

    static Result run(List<String> argv, Duration timeout, Path workingDirectory) throws IOException, InterruptedException {
        Objects.requireNonNull(argv, "argv"); Objects.requireNonNull(timeout, "timeout");
        if (argv.isEmpty()) throw new IllegalArgumentException("argv empty");
        if (timeout.isZero() || timeout.isNegative()) throw new IllegalArgumentException("timeout");
        ProcessBuilder pb = new ProcessBuilder(argv).redirectErrorStream(true);
        if (workingDirectory != null) pb.directory(workingDirectory.toFile());
        Map<String, String> env = pb.environment();
        Map<String, String> original = Map.copyOf(env);
        env.clear();
        for (String key : SAFE_ENV) {
            String value = original.get(key);
            if (value != null && !value.isBlank()) env.put(key, value);
        }
        env.put("SYSTEMMASTER_LOCAL_ONLY", "1");
        env.put("HF_HUB_OFFLINE", "1");
        env.put("TRANSFORMERS_OFFLINE", "1");
        env.keySet().removeIf(k -> k.toUpperCase(Locale.ROOT).contains("PROXY"));
        Process process = pb.start();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Thread reader = Thread.ofVirtual().name("design-local-worker-output").start(() -> {
            try { process.getInputStream().transferTo(output); } catch (IOException ignored) { }
        });
        boolean done = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!done) {
            process.destroyForcibly();
            reader.join();
            throw new IOException("local design worker timed out");
        }
        reader.join();
        if (output.size() > OUTPUT_LIMIT) throw new IOException("local design worker output exceeded limit");
        return new Result(process.exitValue(), output.toString(StandardCharsets.UTF_8));
    }
}
