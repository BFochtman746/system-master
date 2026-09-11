package org.systemmaster.tools.document;

import org.systemmaster.tools.docx.DocxFullLaneEngine;
import org.systemmaster.tools.pptx.PptxFullLaneEngine;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

/** Independent portable render-proof qualification for DOCX and PPTX.
 * This proves that an external renderer can reopen, render, expose expected text,
 * and rasterize generated artifacts. It does not claim exact Microsoft Office fidelity.
 */
public final class UniversalRenderProofQualification {
    static int assertions;

    public static void main(String[] args) throws Exception {
        if (args.length != 4) {
            throw new IllegalArgumentException("usage: UniversalRenderProofQualification <soffice> <pdfinfo> <pdftotext> <pdftoppm>");
        }
        Path soffice = Path.of(args[0]);
        Path pdfinfo = Path.of(args[1]);
        Path pdftotext = Path.of(args[2]);
        Path pdftoppm = Path.of(args[3]);
        Path tmp = Files.createTempDirectory("universal-doc-render-proof-");
        try {
            Path profile = tmp.resolve("lo-profile");
            Files.createDirectories(profile);

            byte[] docx = new DocxFullLaneEngine().createDocument(List.of("Universal Document Studio", "Rendered DOCX proof"));
            Path docxPath = tmp.resolve("proof.docx");
            Files.write(docxPath, docx);
            Path docxPdf = convertToPdf(soffice, profile, tmp, docxPath);
            check(Files.isRegularFile(docxPdf) && Files.size(docxPdf) > 100, "DOCX rendered PDF exists");
            check(pageCount(pdfinfo, docxPdf) >= 1, "DOCX rendered PDF has pages");
            String docxText = extractText(pdftotext, docxPdf);
            check(docxText.contains("Universal Document Studio") && docxText.contains("Rendered DOCX proof"), "DOCX rendered text survives");
            Path docxPng = rasterFirstPage(pdftoppm, docxPdf, tmp.resolve("docx-render"));
            check(isNonBlankRaster(docxPng), "DOCX rendered raster is nonblank");

            PptxFullLaneEngine pptxEngine = new PptxFullLaneEngine();
            byte[] pptx = pptxEngine.createPresentation("Universal Document Studio", List.of(
                    new PptxFullLaneEngine.SlideSpec("PowerPoint is first-class", List.of("PPTX", "PDF", "DOCX", "Markdown"), "proof notes"),
                    new PptxFullLaneEngine.SlideSpec("Final proof gate", List.of("Package", "Semantic", "Rendered"), null)
            ));
            Path pptxPath = tmp.resolve("proof.pptx");
            Files.write(pptxPath, pptx);
            Path pptxPdf = convertToPdf(soffice, profile, tmp, pptxPath);
            check(Files.isRegularFile(pptxPdf) && Files.size(pptxPdf) > 100, "PPTX rendered PDF exists");
            check(pageCount(pdfinfo, pptxPdf) == 2, "PPTX rendered PDF slide/page count preserved");
            String pptxText = extractText(pdftotext, pptxPdf);
            check(pptxText.contains("PowerPoint is first-class") && pptxText.contains("Final proof gate"), "PPTX rendered text survives");
            Path pptxPng = rasterFirstPage(pdftoppm, pptxPdf, tmp.resolve("pptx-render"));
            check(isNonBlankRaster(pptxPng), "PPTX rendered raster is nonblank");

            check(!Arrays.equals(docx, Files.readAllBytes(docxPdf)), "render derivative distinct from DOCX source");
            check(!Arrays.equals(pptx, Files.readAllBytes(pptxPdf)), "render derivative distinct from PPTX source");

            System.out.println("UNIVERSAL_RENDER_PROOF_QUALIFICATION_PASS assertions=" + assertions
                    + " renderer=LibreOffice pdf=Poppler docxPages=" + pageCount(pdfinfo, docxPdf)
                    + " pptxSlides=" + pageCount(pdfinfo, pptxPdf));
        } finally {
            try (var walk = Files.walk(tmp)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (Exception ignored) { }
                });
            }
        }
    }

    private static Path convertToPdf(Path soffice, Path profile, Path outDir, Path source) throws Exception {
        String profileUri = profile.toUri().toString();
        Process p = new ProcessBuilder(
                soffice.toString(), "--headless", "-env:UserInstallation=" + profileUri,
                "--convert-to", "pdf", "--outdir", outDir.toString(), source.toString())
                .redirectErrorStream(true).start();
        String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = p.waitFor();
        if (exit != 0) throw new AssertionError("LibreOffice conversion failed: " + log);
        Path result = outDir.resolve(baseName(source.getFileName().toString()) + ".pdf");
        if (!Files.isRegularFile(result)) throw new AssertionError("LibreOffice did not produce PDF: " + log);
        return result;
    }

    private static int pageCount(Path pdfinfo, Path pdf) throws Exception {
        Process p = new ProcessBuilder(pdfinfo.toString(), pdf.toString()).redirectErrorStream(true).start();
        String text = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = p.waitFor();
        if (exit != 0) throw new AssertionError("pdfinfo failed: " + text);
        for (String line : text.split("\\R")) {
            if (line.startsWith("Pages:")) return Integer.parseInt(line.substring("Pages:".length()).trim());
        }
        throw new AssertionError("pdfinfo did not report Pages: " + text);
    }

    private static String extractText(Path pdftotext, Path pdf) throws Exception {
        Process p = new ProcessBuilder(pdftotext.toString(), "-layout", pdf.toString(), "-")
                .redirectErrorStream(true).start();
        String text = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = p.waitFor();
        if (exit != 0) throw new AssertionError("pdftotext failed: " + text);
        return text;
    }

    private static Path rasterFirstPage(Path pdftoppm, Path pdf, Path prefix) throws Exception {
        Process p = new ProcessBuilder(pdftoppm.toString(), "-f", "1", "-singlefile", "-png", "-r", "96",
                pdf.toString(), prefix.toString()).redirectErrorStream(true).start();
        String log = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        int exit = p.waitFor();
        if (exit != 0) throw new AssertionError("pdftoppm failed: " + log);
        Path png = Path.of(prefix.toString() + ".png");
        if (!Files.isRegularFile(png)) throw new AssertionError("raster not produced: " + log);
        return png;
    }

    private static boolean isNonBlankRaster(Path png) throws Exception {
        BufferedImage image = ImageIO.read(png.toFile());
        if (image == null || image.getWidth() < 100 || image.getHeight() < 100) return false;
        int stepX = Math.max(1, image.getWidth() / 80);
        int stepY = Math.max(1, image.getHeight() / 80);
        for (int y = 0; y < image.getHeight(); y += stepY) {
            for (int x = 0; x < image.getWidth(); x += stepX) {
                int rgb = image.getRGB(x, y) & 0x00FFFFFF;
                if (rgb != 0x00FFFFFF) return true;
            }
        }
        return false;
    }

    private static String baseName(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
