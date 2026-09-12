package org.systemmaster.tools.design;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

/** Strict local process protocol for an optional multimodal aesthetic critic. */
public final class LocalVisualCriticProcessPort implements RenderedVisualCriticPort {
    private final List<String> commandPrefix;
    private final Duration timeout;
    private final String identity;

    public LocalVisualCriticProcessPort(List<String> commandPrefix, Duration timeout, String identity) {
        this.commandPrefix = List.copyOf(Objects.requireNonNull(commandPrefix, "commandPrefix"));
        if (this.commandPrefix.isEmpty()) throw new IllegalArgumentException("commandPrefix empty");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        if (timeout.isZero() || timeout.isNegative()) throw new IllegalArgumentException("timeout");
        this.identity = Objects.requireNonNull(identity, "identity").trim();
        if (this.identity.isEmpty()) throw new IllegalArgumentException("identity blank");
    }

    @Override
    public Critique critique(BufferedImage raster) throws Exception {
        Objects.requireNonNull(raster, "raster");
        Path dir = Files.createTempDirectory("local-visual-critic-");
        try {
            Path image = dir.resolve("slide.png");
            if (!ImageIO.write(raster, "png", image.toFile())) throw new IOException("PNG encoder unavailable");
            ArrayList<String> argv = new ArrayList<>(commandPrefix);
            argv.add("--image"); argv.add(image.toString());
            DesignLocalProcess.Result result = DesignLocalProcess.run(argv, timeout, dir);
            if (result.exitCode() != 0) throw new IOException("local visual critic failed exit=" + result.exitCode());
            return parse(result.output());
        } finally {
            try (var stream = Files.walk(dir)) {
                stream.sorted(java.util.Comparator.reverseOrder()).forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) { } });
            } catch (IOException ignored) { }
        }
    }

    private Critique parse(String output) throws IOException {
        double[] scores = null;
        ArrayList<String> findings = new ArrayList<>();
        for (String line : output.split("\\R")) {
            if (line.isBlank()) continue;
            String[] parts = line.split("\\t", 2);
            if (parts.length != 2) throw new IOException("invalid local visual critic protocol line");
            if (parts[0].equals("SCORES")) {
                String[] values = parts[1].split(",");
                if (values.length != 5) throw new IOException("SCORES requires five values");
                scores = new double[5];
                for (int i = 0; i < values.length; i++) scores[i] = score(Double.parseDouble(values[i]));
            } else if (parts[0].equals("FINDING")) {
                String decoded = new String(Base64.getDecoder().decode(parts[1]), StandardCharsets.UTF_8).trim();
                if (!decoded.isEmpty()) findings.add(decoded);
            } else if (!parts[0].equals("INFO")) {
                throw new IOException("unsupported local visual critic protocol field: " + parts[0]);
            }
        }
        if (scores == null) throw new IOException("local visual critic omitted SCORES");
        return new Critique(scores[0], scores[1], scores[2], scores[3], scores[4], findings, identity);
    }

    private static double score(double value) throws IOException {
        if (!Double.isFinite(value) || value < 0 || value > 1) throw new IOException("local visual critic score outside [0,1]");
        return value;
    }
}
