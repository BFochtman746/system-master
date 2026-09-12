package org.systemmaster.tools.review;

import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.docx.DocxPackageEngine;
import org.systemmaster.tools.document.CanonicalDocumentGraphProjector;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class DocumentWorldClass001BRenderQualification {
    static int assertions;
    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <soffice> <pdftoppm>");
        Path soffice = Path.of(args[0]).toAbsolutePath().normalize(); Path pdftoppm = Path.of(args[1]).toAbsolutePath().normalize();
        check(Files.isRegularFile(soffice), "soffice exists"); check(Files.isRegularFile(pdftoppm), "pdftoppm exists");
        Path work = Files.createTempDirectory("review001b-render-");
        try {
            DocxFullLaneEngine docx = new DocxFullLaneEngine();
            byte[] base = docx.createDocument(List.of("Quarterly Review", "Revenue increased 12 percent.", "Decision required next week."));
            byte[] target = new DocxPackageEngine().replaceText(base, "12 percent", "18 percent").bytes();
            var review = new SemanticDocumentDiffEngine().diff(new CanonicalDocumentGraphProjector().project(DocumentFormat.DOCX, base),
                    new CanonicalDocumentGraphProjector().project(DocumentFormat.DOCX, target), "Reviewer", Instant.parse("2026-08-31T12:00:00Z"));
            byte[] tracked = new DocxTrackedRevisionMapper().applyReplacement(base, review.changes().getFirst(), "Reviewer", Instant.parse("2026-08-31T12:01:00Z")).bytes();
            Path basePdf = renderOffice(base, "base.docx", soffice, work.resolve("base"));
            Path targetPdf = renderOffice(target, "target.docx", soffice, work.resolve("target"));
            byte[] commentedDocx = new DocxCommentMapper().addParagraphComment(base, review.changes().getFirst().anchor(), "Verify the percentage", "Reviewer", "RV", Instant.parse("2026-08-31T12:01:30Z")).bytes();
            Path trackedPdf = renderOffice(tracked, "tracked.docx", soffice, work.resolve("tracked"));
            Path commentedDocxPdf = renderOffice(commentedDocx, "commented.docx", soffice, work.resolve("commented-docx"));
            check(Files.size(basePdf) > 500, "base DOCX renders to nontrivial PDF");
            check(Files.size(targetPdf) > 500, "target DOCX renders to nontrivial PDF");
            check(Files.size(trackedPdf) > 500, "tracked-revision DOCX renders to nontrivial PDF");
            check(Files.size(commentedDocxPdf) > 500, "comment-bearing DOCX reopens and renders to nontrivial PDF");
            BufferedImage baseImage = rasterFirst(basePdf, pdftoppm, work.resolve("raster-base"));
            BufferedImage targetImage = rasterFirst(targetPdf, pdftoppm, work.resolve("raster-target"));
            check(baseImage.getWidth() == targetImage.getWidth() && baseImage.getHeight() == targetImage.getHeight(), "independent renders have comparable dimensions");
            var metrics = new VisualDiffAnalyzer().compare(baseImage, targetImage, 8);
            check(metrics.changedPixels() > 0, "semantic text change produces rendered-pixel difference");
            check(metrics.changedRatio() < 0.25, "single text edit does not masquerade as whole-page replacement");
            check(metrics.meanAbsoluteLumaDelta() > 0, "visual diff records nonzero luma evidence");

            PptxFullLaneEngine pptx = new PptxFullLaneEngine();
            byte[] deck = pptx.createPresentation("Review", List.of(new PptxFullLaneEngine.SlideSpec("Decision", List.of("Approve the plan"), "speaker note")));
            byte[] commented = new PptxClassicCommentMapper().addComment(deck, 1, "Verify claim", "Reviewer", "RV", Instant.parse("2026-08-31T12:02:00Z")).bytes();
            Path deckPdf = renderOffice(commented, "commented.pptx", soffice, work.resolve("pptx"));
            check(Files.size(deckPdf) > 500, "comment-bearing PPTX reopens and renders through independent Office-compatible engine");
            BufferedImage deckImage = rasterFirst(deckPdf, pdftoppm, work.resolve("raster-pptx"));
            check(deckImage.getWidth() > 500 && deckImage.getHeight() > 300, "comment-bearing PPTX produces usable raster evidence");

            System.out.println("DOCUMENT_WORLD_CLASS_001B_RENDER_PASS assertions=" + assertions + " changedRatio=" + metrics.changedRatio());
        } finally { deleteTree(work); }
    }

    private static Path renderOffice(byte[] bytes, String fileName, Path soffice, Path dir) throws Exception {
        Files.createDirectories(dir); Path home = dir.resolve("home"); Files.createDirectories(home); Path source = dir.resolve(fileName); Files.write(source, bytes);
        run(List.of(soffice.toString(), "--headless", "--convert-to", "pdf", "--outdir", dir.toString(), source.toString()), dir, home, "soffice");
        Path pdf = dir.resolve(fileName.substring(0, fileName.lastIndexOf('.')) + ".pdf"); if (!Files.isRegularFile(pdf)) throw new IOException("office render did not create PDF for " + fileName); return pdf;
    }
    private static BufferedImage rasterFirst(Path pdf, Path pdftoppm, Path dir) throws Exception {
        Files.createDirectories(dir); Path home = dir.resolve("home"); Files.createDirectories(home); Path prefix = dir.resolve("page");
        run(List.of(pdftoppm.toString(), "-f", "1", "-singlefile", "-png", "-r", "120", pdf.toString(), prefix.toString()), dir, home, "pdftoppm");
        Path png = dir.resolve("page.png"); BufferedImage image = ImageIO.read(png.toFile()); if (image == null) throw new IOException("raster decode failed"); return image;
    }
    private static void run(List<String> command, Path dir, Path home, String label) throws Exception {
        Path log = dir.resolve(label + ".log"); ProcessBuilder pb = new ProcessBuilder(command); pb.directory(dir.toFile()); pb.redirectErrorStream(true); pb.redirectOutput(log.toFile());
        Map<String,String> env = pb.environment(); env.clear(); env.put("HOME", home.toString()); env.put("TMPDIR", dir.toString()); env.put("LANG", "C.UTF-8"); env.put("LC_ALL", "C.UTF-8"); env.put("TZ", "UTC"); env.put("SYSTEMMASTER_LOCAL_ONLY", "1");
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT); if (os.contains("win")) { copy(env,"SystemRoot"); copy(env,"WINDIR"); copy(env,"ComSpec"); env.put("PATH", parent(Path.of(command.getFirst()))); } else env.put("PATH", parent(Path.of(command.getFirst())) + ":/usr/bin:/bin");
        Process p = pb.start(); if (!p.waitFor(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) { p.destroyForcibly(); throw new IOException(label + " timeout"); }
        if (p.exitValue() != 0) throw new IOException(label + " failed exit=" + p.exitValue() + " log=" + (Files.exists(log) ? Files.readString(log) : ""));
    }
    private static void copy(Map<String,String> env,String key){String v=System.getenv(key); if(v!=null&&!v.isBlank())env.put(key,v);}
    private static String parent(Path p){Path x=p.toAbsolutePath().getParent();return x==null?".":x.toString();}
    private static void deleteTree(Path root){if(root==null||!Files.exists(root))return;try(var s=Files.walk(root)){s.sorted(Comparator.reverseOrder()).forEach(p->{try{Files.deleteIfExists(p);}catch(IOException ignored){}});}catch(IOException ignored){}}
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
}
