package org.systemmaster.tools.document;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Local qualification adapter: LibreOffice rendering + Poppler inspection/rasterization.
 * It uses a fresh workspace/profile and bounded processes. Kernel-level network isolation must be supplied by the host sandbox.
 */
public final class LocalLibreOfficePopplerRenderWorker implements RenderProofWorker {
    private static final Pattern PAGES = Pattern.compile("(?m)^Pages:\\s+(\\d+)\\s*$");
    private static final Pattern PAGE_SIZE = Pattern.compile("(?m)^Page\\s+(\\d+) size:\\s+([0-9.]+) x ([0-9.]+) pts.*$");
    private static final Pattern PAGE_ROT = Pattern.compile("(?m)^Page\\s+(\\d+) rot:\\s+(-?\\d+)\\s*$");

    private final Path soffice;
    private final Path pdfinfo;
    private final Path pdftotext;
    private final Path pdftoppm;
    private final Path pdfimages;
    private final Duration timeout;
    private final long maxOutputBytes;
    private final int rasterDpi;
    private final int maxPages;
    private final VisualQaAnalyzer visualQa = new VisualQaAnalyzer();

    public LocalLibreOfficePopplerRenderWorker(
            Path soffice,
            Path pdfinfo,
            Path pdftotext,
            Path pdftoppm,
            Path pdfimages,
            Duration timeout,
            long maxOutputBytes,
            int rasterDpi,
            int maxPages) {
        this.soffice = requireExecutable(soffice, "soffice");
        this.pdfinfo = requireExecutable(pdfinfo, "pdfinfo");
        this.pdftotext = requireExecutable(pdftotext, "pdftotext");
        this.pdftoppm = requireExecutable(pdftoppm, "pdftoppm");
        this.pdfimages = requireExecutable(pdfimages, "pdfimages");
        this.timeout = Objects.requireNonNull(timeout, "timeout");
        if (timeout.isZero() || timeout.isNegative()) throw new IllegalArgumentException("positive timeout required");
        if (maxOutputBytes < 1024) throw new IllegalArgumentException("maxOutputBytes too small");
        if (rasterDpi < 48 || rasterDpi > 300) throw new IllegalArgumentException("rasterDpi outside 48..300");
        if (maxPages < 1 || maxPages > 10000) throw new IllegalArgumentException("maxPages outside 1..10000");
        this.maxOutputBytes = maxOutputBytes;
        this.rasterDpi = rasterDpi;
        this.maxPages = maxPages;
    }

    public static LocalLibreOfficePopplerRenderWorker standard(Path soffice, Path pdfinfo, Path pdftotext, Path pdftoppm, Path pdfimages) {
        return new LocalLibreOfficePopplerRenderWorker(soffice, pdfinfo, pdftotext, pdftoppm, pdfimages, Duration.ofSeconds(45), 256L * 1024 * 1024, 96, 500);
    }

    @Override
    public Result prove(Request request) throws Exception {
        Objects.requireNonNull(request, "request");
        if (!(request.format() == DocumentFormat.DOCX || request.format() == DocumentFormat.DOCM
                || request.format() == DocumentFormat.PPTX || request.format() == DocumentFormat.PPTM
                || request.format() == DocumentFormat.PDF)) {
            throw new UnsupportedOperationException("render proof worker currently qualifies DOCX/PPTX/PDF families: " + request.format());
        }

        if (request.artifact().length > maxOutputBytes) throw new IOException("input artifact exceeds local proof bound");
        Path workspace = Files.createTempDirectory("document-render-proof-");
        ArrayList<String> logs = new ArrayList<>();
        try {
            Path home = workspace.resolve("home");
            Path profile = workspace.resolve("lo-profile");
            Files.createDirectories(home);
            Files.createDirectories(profile);
            Path source = workspace.resolve(safeFileName(request.fileName(), request.format()));
            Files.write(source, request.artifact());
            Path renderedPdf;
            String renderer;
            String rendererVersion;
            if (request.format() == DocumentFormat.PDF) {
                renderedPdf = workspace.resolve("proofed-source.pdf");
                Files.copy(source, renderedPdf);
                renderer = "PDF_IDENTITY_RENDER_TARGET";
                rendererVersion = "1";
            } else {
                renderer = "LibreOffice";
                rendererVersion = firstLine(runVersion(soffice, "--version", workspace, home));
                List<String> command = List.of(
                        soffice.toString(),
                        "--headless", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard", "--norestore",
                        "-env:UserInstallation=" + profile.toUri(),
                        "--convert-to", "pdf", "--outdir", workspace.toString(), source.toString());
                ProcessResult conversion = run(command, workspace, home, "soffice-convert.log");
                logs.add("soffice-exit=" + conversion.exitCode());
                logs.add("soffice-log-sha256=" + CanonicalDocumentGraph.sha256(conversion.logBytes()));
                if (conversion.exitCode() != 0) throw new IOException("LibreOffice conversion failed: " + conversion.logText());
                renderedPdf = workspace.resolve(baseName(source.getFileName().toString()) + ".pdf");
            }
            if (!Files.isRegularFile(renderedPdf)) throw new IOException("renderer did not produce PDF");
            long renderedSize = Files.size(renderedPdf);
            if (renderedSize < 100 || renderedSize > maxOutputBytes) throw new IOException("rendered PDF size outside bounds: " + renderedSize);
            byte[] renderedBytes = Files.readAllBytes(renderedPdf);

            String oracleVersion = firstLine(runVersion(pdfinfo, "-v", workspace, home));
            String summaryInfo = runChecked(List.of(pdfinfo.toString(), renderedPdf.toString()), workspace, home, "pdfinfo-summary.log").logText();
            int pageCount = parsePageCount(summaryInfo);
            if (pageCount > maxPages) throw new IOException("page count exceeds local proof bound: " + pageCount + " > " + maxPages);
            String info = runChecked(List.of(pdfinfo.toString(), "-f", "1", "-l", Integer.toString(pageCount), renderedPdf.toString()), workspace, home, "pdfinfo-pages.log").logText();
            Map<Integer,double[]> geometry = parseGeometry(info);
            Map<Integer,Integer> rotations = parseRotations(info);
            Map<Integer,Integer> imageCounts = parseImageCounts(runChecked(List.of(pdfimages.toString(), "-list", renderedPdf.toString()), workspace, home, "pdfimages.log").logText());
            String fullText = runChecked(List.of(pdftotext.toString(), "-layout", renderedPdf.toString(), "-"), workspace, home, "pdftotext-all.log").logText();

            ArrayList<RenderProofReceipt.VisualFinding> findings = new ArrayList<>();
            if (request.expectedPageCount() != null && pageCount != request.expectedPageCount()) {
                findings.add(new RenderProofReceipt.VisualFinding("PAGE_COUNT_MISMATCH", RenderProofReceipt.Severity.ERROR, 0,
                        "expected=" + request.expectedPageCount() + " actual=" + pageCount));
            }
            if (pageCount < request.minimumPageCount()) {
                findings.add(new RenderProofReceipt.VisualFinding("PAGE_COUNT_BELOW_MINIMUM", RenderProofReceipt.Severity.ERROR, 0,
                        "minimum=" + request.minimumPageCount() + " actual=" + pageCount));
            }
            for (String snippet : request.requiredTextSnippets()) {
                if (snippet != null && !snippet.isEmpty() && !fullText.contains(snippet)) {
                    findings.add(new RenderProofReceipt.VisualFinding("EXPECTED_TEXT_MISSING", RenderProofReceipt.Severity.ERROR, 0, snippet));
                }
            }
            int totalImages = imageCounts.values().stream().mapToInt(Integer::intValue).sum();
            if (totalImages < request.minimumImageCount()) {
                findings.add(new RenderProofReceipt.VisualFinding("IMAGE_COUNT_BELOW_MINIMUM", RenderProofReceipt.Severity.ERROR, 0,
                        "minimum=" + request.minimumImageCount() + " actual=" + totalImages));
            }

            ArrayList<RenderProofReceipt.PageEvidence> pages = new ArrayList<>();
            for (int page = 1; page <= pageCount; page++) {
                String pageText = runChecked(List.of(pdftotext.toString(), "-f", Integer.toString(page), "-l", Integer.toString(page), "-layout", renderedPdf.toString(), "-"), workspace, home, "pdftotext-" + page + ".log").logText();
                Path prefix = workspace.resolve("page-" + page);
                ProcessResult raster = runChecked(List.of(pdftoppm.toString(), "-f", Integer.toString(page), "-l", Integer.toString(page), "-singlefile", "-png", "-r", Integer.toString(rasterDpi), renderedPdf.toString(), prefix.toString()), workspace, home, "pdftoppm-" + page + ".log");
                logs.add("pdftoppm-page-" + page + "-log-sha256=" + CanonicalDocumentGraph.sha256(raster.logBytes()));
                Path png = Path.of(prefix + ".png");
                if (!Files.isRegularFile(png)) throw new IOException("raster not produced for page " + page);
                if (Files.size(png) > maxOutputBytes) throw new IOException("raster size exceeds bound for page " + page);
                byte[] pngBytes = Files.readAllBytes(png);
                BufferedImage image = ImageIO.read(png.toFile());
                if (image == null) throw new IOException("unable to decode raster page " + page);
                VisualQaAnalyzer.Metrics metrics = visualQa.analyze(image);
                for (VisualQaAnalyzer.Finding f : visualQa.findings(metrics, nonWhitespaceCharacters(pageText), imageCounts.getOrDefault(page, 0), request.requireEveryPageNonBlank())) {
                    findings.add(new RenderProofReceipt.VisualFinding(f.code(), mapSeverity(f.severity()), page, f.detail()));
                }
                double[] size = geometry.get(page);
                if (size == null || size[0] <= 0 || size[1] <= 0) {
                    findings.add(new RenderProofReceipt.VisualFinding("PAGE_GEOMETRY_MISSING", RenderProofReceipt.Severity.ERROR, page, "pdfinfo did not report positive page geometry"));
                    size = new double[] { 1.0d, 1.0d };
                }
                pages.add(new RenderProofReceipt.PageEvidence(
                        page,
                        size[0], size[1], rotations.getOrDefault(page, 0),
                        metrics.widthPx(), metrics.heightPx(), CanonicalDocumentGraph.sha256(pngBytes),
                        metrics.inkCoverage(), metrics.borderInkCoverage(), nonWhitespaceCharacters(pageText), imageCounts.getOrDefault(page, 0)));
            }

            RenderProofReceipt receipt = new RenderProofReceipt(
                    RenderProofReceipt.SCHEMA_V1,
                    request.format(),
                    CanonicalDocumentGraph.sha256(request.artifact()),
                    CanonicalDocumentGraph.sha256(renderedBytes),
                    renderer,
                    rendererVersion,
                    "Poppler",
                    oracleVersion,
                    Instant.now(),
                    new RenderProofReceipt.IsolationEvidence(
                            true, request.format() != DocumentFormat.PDF, true,
                            RenderProofReceipt.NetworkIsolation.NOT_KERNEL_ENFORCED_LOCAL_QUALIFICATION,
                            timeout.toMillis(), maxOutputBytes, "C.UTF-8", "UTC"),
                    pages,
                    findings,
                    Map.of(
                            "pageCount", Integer.toString(pageCount),
                            "imageCount", Integer.toString(totalImages),
                            "textCharacters", Integer.toString(nonWhitespaceCharacters(fullText)),
                            "renderedPdfBytes", Long.toString(renderedSize),
                            "rasterDpi", Integer.toString(rasterDpi)));
            return new Result(renderedBytes, receipt, logs);
        } finally {
            deleteTree(workspace);
        }
    }

    private ProcessResult runChecked(List<String> command, Path workspace, Path home, String logName) throws Exception {
        ProcessResult result = run(command, workspace, home, logName);
        if (result.exitCode() != 0) throw new IOException("process failed exit=" + result.exitCode() + " command=" + command.getFirst() + " log=" + result.logText());
        return result;
    }

    private String runVersion(Path executable, String versionArg, Path workspace, Path home) throws Exception {
        return run(List.of(executable.toString(), versionArg), workspace, home, "version-" + executable.getFileName() + ".log").logText();
    }

    private ProcessResult run(List<String> command, Path workspace, Path home, String logName) throws Exception {
        Path log = workspace.resolve(logName);
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.directory(workspace.toFile());
        pb.redirectErrorStream(true);
        pb.redirectOutput(log.toFile());
        Map<String,String> env = pb.environment();
        env.clear();
        env.put("PATH", "/usr/bin:/bin");
        env.put("HOME", home.toString());
        env.put("TMPDIR", workspace.toString());
        env.put("LANG", "C.UTF-8");
        env.put("LC_ALL", "C.UTF-8");
        env.put("TZ", "UTC");
        Process process = pb.start();
        boolean done = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!done) {
            process.destroyForcibly();
            process.waitFor(5, TimeUnit.SECONDS);
            throw new IOException("render proof process timed out: " + command.getFirst());
        }
        byte[] logBytes;
        if (Files.isRegularFile(log)) {
            long logSize = Files.size(log);
            if (logSize > maxOutputBytes) throw new IOException("process output exceeds proof bound: " + command.getFirst());
            logBytes = readBounded(log, Math.min(maxOutputBytes, 16L * 1024 * 1024));
        } else {
            logBytes = new byte[0];
        }
        return new ProcessResult(process.exitValue(), logBytes);
    }

    private static byte[] readBounded(Path path, long maxBytes) throws IOException {
        long size = Files.size(path);
        if (size <= maxBytes) return Files.readAllBytes(path);
        try (var in = Files.newInputStream(path)) {
            return in.readNBytes((int) maxBytes);
        }
    }

    private static int parsePageCount(String info) throws IOException {
        Matcher matcher = PAGES.matcher(info);
        if (!matcher.find()) throw new IOException("pdfinfo did not report page count");
        int pages = Integer.parseInt(matcher.group(1));
        if (pages < 1 || pages > 10000) throw new IOException("page count outside proof bounds: " + pages);
        return pages;
    }

    private static Map<Integer,double[]> parseGeometry(String info) {
        HashMap<Integer,double[]> out = new HashMap<>();
        Matcher matcher = PAGE_SIZE.matcher(info);
        while (matcher.find()) out.put(Integer.parseInt(matcher.group(1)), new double[] { Double.parseDouble(matcher.group(2)), Double.parseDouble(matcher.group(3)) });
        return Map.copyOf(out);
    }

    private static Map<Integer,Integer> parseRotations(String info) {
        HashMap<Integer,Integer> out = new HashMap<>();
        Matcher matcher = PAGE_ROT.matcher(info);
        while (matcher.find()) out.put(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)));
        return Map.copyOf(out);
    }

    private static Map<Integer,Integer> parseImageCounts(String list) {
        HashMap<Integer,Integer> out = new HashMap<>();
        for (String line : list.split("\\R")) {
            String trimmed = line.stripLeading();
            if (trimmed.isEmpty() || !Character.isDigit(trimmed.charAt(0))) continue;
            String[] fields = trimmed.split("\\s+");
            try {
                int page = Integer.parseInt(fields[0]);
                out.merge(page, 1, Integer::sum);
            } catch (NumberFormatException ignored) {
                // Header or non-data line.
            }
        }
        return Map.copyOf(out);
    }

    private static RenderProofReceipt.Severity mapSeverity(VisualQaAnalyzer.Severity severity) {
        return switch (severity) {
            case INFO -> RenderProofReceipt.Severity.INFO;
            case WARNING -> RenderProofReceipt.Severity.WARNING;
            case ERROR -> RenderProofReceipt.Severity.ERROR;
        };
    }

    private static int nonWhitespaceCharacters(String value) {
        int count = 0;
        for (int i = 0; i < value.length(); i++) if (!Character.isWhitespace(value.charAt(i))) count++;
        return count;
    }

    private static String firstLine(String value) {
        String trimmed = Objects.requireNonNullElse(value, "").trim();
        if (trimmed.isEmpty()) return "unknown";
        int newline = trimmed.indexOf('\n');
        return (newline < 0 ? trimmed : trimmed.substring(0, newline)).trim();
    }

    private static Path requireExecutable(Path path, String name) {
        Objects.requireNonNull(path, name);
        if (!Files.isRegularFile(path) || !Files.isExecutable(path)) throw new IllegalArgumentException(name + " executable unavailable: " + path);
        return path.toAbsolutePath();
    }

    private static String safeFileName(String requested, DocumentFormat format) {
        String name = Path.of(requested).getFileName().toString().replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.isBlank()) name = "artifact";
        String ext = extension(format);
        if (!name.toLowerCase(Locale.ROOT).endsWith("." + ext)) name = baseName(name) + "." + ext;
        return name;
    }

    private static String extension(DocumentFormat format) {
        return switch (format) {
            case DOCX -> "docx";
            case DOCM -> "docm";
            case PPTX -> "pptx";
            case PPTM -> "pptm";
            case PDF -> "pdf";
            default -> throw new UnsupportedOperationException("render extension pending for " + format);
        };
    }

    private static String baseName(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (var walk = Files.walk(root)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                try { Files.deleteIfExists(p); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) {
            // Best effort cleanup; host sandbox also owns workspace lifecycle.
        }
    }

    private record ProcessResult(int exitCode, byte[] logBytes) {
        private ProcessResult { logBytes = logBytes.clone(); }
        @Override public byte[] logBytes() { return logBytes.clone(); }
        String logText() { return new String(logBytes, StandardCharsets.UTF_8); }
    }
}
