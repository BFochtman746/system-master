package org.systemmaster.tools.design;

import org.systemmaster.tools.common.OoxmlPackageSupport;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

/** Local-only LibreOffice plus Poppler rasterizer with bounded subprocesses and minimal environment. */
public final class LocalPresentationRasterizer implements PresentationRasterizerPort {
    private final Path soffice;
    private final Path pdftoppm;
    private final Duration timeout;
    private final long maxOutputBytes;
    private final int dpi;

    public LocalPresentationRasterizer(Path soffice, Path pdftoppm, Duration timeout, long maxOutputBytes, int dpi) {
        this.soffice = executable(soffice, "soffice");
        this.pdftoppm = executable(pdftoppm, "pdftoppm");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        if (timeout.isZero() || timeout.isNegative()) throw new IllegalArgumentException("timeout");
        if (maxOutputBytes < 1024 * 1024) throw new IllegalArgumentException("maxOutputBytes too small");
        if (dpi < 72 || dpi > 300) throw new IllegalArgumentException("dpi outside [72,300]");
        this.maxOutputBytes = maxOutputBytes;
        this.dpi = dpi;
    }

    @Override
    public List<RasterizedSlide> rasterize(byte[] pptx) throws Exception {
        Objects.requireNonNull(pptx, "pptx");
        if (pptx.length == 0 || pptx.length > maxOutputBytes) throw new IllegalArgumentException("pptx size outside bounds");
        Path workspace = Files.createTempDirectory("masterpiece-raster-");
        try {
            Path home = workspace.resolve("home");
            Files.createDirectories(home);
            Path source = workspace.resolve("candidate.pptx");
            Files.write(source, pptx);
            run(List.of(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", workspace.toString(), source.toString()), workspace, home, "soffice");
            Path pdf = workspace.resolve("candidate.pdf");
            if (!Files.isRegularFile(pdf)) throw new IOException("LibreOffice did not produce candidate.pdf");
            if (Files.size(pdf) > maxOutputBytes) throw new IOException("rendered PDF exceeds bound");
            Path prefix = workspace.resolve("slide");
            run(List.of(pdftoppm.toString(), "-png", "-r", Integer.toString(dpi), pdf.toString(), prefix.toString()), workspace, home, "pdftoppm");
            List<Path> pngs;
            try (var stream = Files.list(workspace)) {
                pngs = stream.filter(p -> p.getFileName().toString().matches("slide-[0-9]+\\.png"))
                        .sorted(Comparator.comparingInt(LocalPresentationRasterizer::pageNumber)).toList();
            }
            if (pngs.isEmpty()) throw new IOException("no slide rasters produced");
            ArrayList<RasterizedSlide> out = new ArrayList<>();
            long total = 0;
            for (Path png : pngs) {
                byte[] bytes = Files.readAllBytes(png);
                total = Math.addExact(total, bytes.length);
                if (total > maxOutputBytes) throw new IOException("raster outputs exceed bound");
                BufferedImage image = ImageIO.read(png.toFile());
                if (image == null) throw new IOException("unable to decode " + png.getFileName());
                out.add(new RasterizedSlide(pageNumber(png), image, OoxmlPackageSupport.sha256(bytes)));
            }
            return List.copyOf(out);
        } finally {
            deleteTree(workspace);
        }
    }

    @Override public String identity() { return "libreoffice-poppler-local-rasterizer-v1"; }

    private void run(List<String> command, Path workspace, Path home, String label) throws Exception {
        Path log = workspace.resolve(label + ".log");
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(workspace.toFile());
        pb.redirectErrorStream(true);
        pb.redirectOutput(log.toFile());
        Map<String, String> env = pb.environment();
        env.clear();
        env.put("HOME", home.toString());
        env.put("TMPDIR", workspace.toString());
        env.put("LANG", "C.UTF-8");
        env.put("LC_ALL", "C.UTF-8");
        env.put("TZ", "UTC");
        env.put("SYSTEMMASTER_LOCAL_ONLY", "1");
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win")) {
            copyIfPresent(env, "SystemRoot");
            copyIfPresent(env, "WINDIR");
            copyIfPresent(env, "ComSpec");
            String systemRoot = System.getenv("SystemRoot");
            String path = parent(soffice) + ";" + parent(pdftoppm) + (systemRoot == null ? "" : ";" + systemRoot + "\\System32");
            env.put("PATH", path);
        } else {
            env.put("PATH", parent(soffice) + ":" + parent(pdftoppm) + ":/usr/bin:/bin");
        }
        Process process = pb.start();
        boolean done = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!done) {
            process.destroyForcibly();
            process.waitFor(5, TimeUnit.SECONDS);
            throw new IOException(label + " timed out");
        }
        if (Files.isRegularFile(log) && Files.size(log) > maxOutputBytes) throw new IOException(label + " log exceeds bound");
        if (process.exitValue() != 0) {
            String text = Files.isRegularFile(log) ? Files.readString(log) : "";
            throw new IOException(label + " failed exit=" + process.exitValue() + " log=" + text);
        }
    }

    private static void copyIfPresent(Map<String, String> env, String key) {
        String value = System.getenv(key);
        if (value != null && !value.isBlank()) env.put(key, value);
    }
    private static String parent(Path p) { Path parent = p.toAbsolutePath().getParent(); return parent == null ? "." : parent.toString(); }
    private static Path executable(Path path, String name) {
        Objects.requireNonNull(path, name);
        Path p = path.toAbsolutePath().normalize();
        if (!Files.isRegularFile(p)) throw new IllegalArgumentException(name + " executable not found: " + p);
        return p;
    }
    private static int pageNumber(Path path) {
        String name = path.getFileName().toString();
        int dash = name.lastIndexOf('-');
        int dot = name.lastIndexOf('.');
        return Integer.parseInt(name.substring(dash + 1, dot));
    }
    private static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (var stream = Files.walk(root)) {
            stream.sorted(Comparator.reverseOrder()).forEach(p -> { try { Files.deleteIfExists(p); } catch (IOException ignored) { } });
        } catch (IOException ignored) { }
    }
}
