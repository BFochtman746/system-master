package org.systemmaster.tools.vision;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/** Bounded argv-only local process runner with a deliberately minimal environment. */
final class VisionLocalProcess {
    private static final long OUTPUT_LIMIT = 32L * 1024L * 1024L;
    private static final Set<String> SAFE_ENV = Set.of(
            "PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE",
            "LOCALAPPDATA", "APPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "JAVA_HOME",
            "PYTHONHOME", "PADDLE_HOME", "CUDA_PATH");

    record Result(int exitCode, String output) {
    }

    private VisionLocalProcess() {
    }

    static Result run(List<String> argv, Duration timeout, Path workingDirectory, Map<String, String> extraEnv)
            throws IOException, InterruptedException {
        Objects.requireNonNull(argv, "argv");
        Objects.requireNonNull(timeout, "timeout");
        Objects.requireNonNull(extraEnv, "extraEnv");
        if (argv.isEmpty()) {
            throw new IllegalArgumentException("argv must not be empty");
        }
        if (timeout.isNegative() || timeout.isZero()) {
            throw new IllegalArgumentException("timeout must be positive");
        }

        ProcessBuilder builder = new ProcessBuilder(argv).redirectErrorStream(true);
        if (workingDirectory != null) {
            builder.directory(workingDirectory.toFile());
        }
        Map<String, String> environment = builder.environment();
        Map<String, String> original = Map.copyOf(environment);
        environment.clear();
        for (String key : SAFE_ENV) {
            String value = original.get(key);
            if (value != null && !value.isBlank()) {
                environment.put(key, value);
            }
        }
        environment.put("SYSTEMMASTER_LOCAL_ONLY", "1");
        environment.put("HF_HUB_OFFLINE", "1");
        environment.put("TRANSFORMERS_OFFLINE", "1");
        for (Map.Entry<String, String> entry : extraEnv.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank() || entry.getValue() == null) {
                throw new IllegalArgumentException("extra environment entries must be non-null and named");
            }
            String upper = entry.getKey().toUpperCase(java.util.Locale.ROOT);
            if (upper.contains("PROXY") || upper.equals("HTTP_PROXY") || upper.equals("HTTPS_PROXY")) {
                throw new IllegalArgumentException("proxy environment is forbidden for document perception workers");
            }
            environment.put(entry.getKey(), entry.getValue());
        }

        Process process = builder.start();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Thread reader = Thread.ofVirtual().name("document-vision-worker-output").start(() -> {
            try {
                process.getInputStream().transferTo(output);
            } catch (IOException ignored) {
                // Process exit status is the authoritative failure signal.
            }
        });
        boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!finished) {
            process.destroyForcibly();
            reader.join();
            throw new IOException("local document-vision worker timed out");
        }
        reader.join();
        if (output.size() > OUTPUT_LIMIT) {
            throw new IOException("local document-vision worker exceeded output ceiling");
        }
        return new Result(process.exitValue(), output.toString(StandardCharsets.UTF_8));
    }
}
