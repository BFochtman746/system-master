package org.systemmaster.tools.design;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.pptx.PptxPackageEngine;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

public final class DesignIntelligence001APortableTests {
    private static int n;

    public static void main(String[] args) throws Exception {
        BrandDesignProfile brand = BrandDesignProfile.executiveDefault("executive-blue-v1");
        check(brand.primaryContrastRatio() > 10, "primary contrast strong");
        check(brand.mutedContrastRatio() >= 4.5, "muted contrast accessible");
        check(brand.passesNormalTextContrast(), "brand passes normal text contrast");
        check(BrandDesignProfile.contrastRatio("000000", "FFFFFF") > 20, "black white contrast");
        reject(() -> new BrandDesignProfile("x", "A", "B", "GGGGGG", "000000", "123456", "666666", .06, .02, BrandDesignProfile.Density.BALANCED), "invalid RGB rejected");
        reject(() -> new BrandDesignProfile("x", "A", "B", "FFFFFF", "000000", "123456", "666666", .01, .02, BrandDesignProfile.Density.BALANCED), "invalid margin rejected");

        NarrativePlan plan = plan();
        NarrativePlanValidator validator = new NarrativePlanValidator();
        var narrative = validator.validate(plan);
        check(narrative.valid(), "narrative valid");
        check(narrative.findings().isEmpty(), "narrative findings empty");
        check(narrative.clarityScore() == 1.0, "narrative clarity max");
        check(narrative.evidenceScore() == 1.0, "evidence score max");

        NarrativePlan missingEvidence = new NarrativePlan("Deck", "Board", "Decide", "Thesis", List.of(
                new SlideBrief(1, SlideArchetype.ASSERTION_EVIDENCE, "Claim", List.of("Proof"), "", List.of())));
        var evidenceFail = validator.validate(missingEvidence);
        check(!evidenceFail.valid(), "missing evidence invalid");
        check(evidenceFail.findings().stream().anyMatch(s -> s.startsWith("EVIDENCE_REQUIRED")), "evidence finding named");
        check(evidenceFail.evidenceScore() == 0.0, "missing evidence score zero");

        NarrativePlan duplicate = new NarrativePlan("Deck", "Board", "Decide", "Thesis", List.of(
                new SlideBrief(1, SlideArchetype.TITLE, "Same", List.of(), "", List.of()),
                new SlideBrief(2, SlideArchetype.SUMMARY, "same", List.of("x"), "", List.of())));
        var duplicateFail = validator.validate(duplicate);
        check(!duplicateFail.valid(), "duplicate headline invalid");
        check(duplicateFail.findings().stream().anyMatch(s -> s.startsWith("DUPLICATE_HEADLINE")), "duplicate finding named");

        DeterministicLayoutSolver solver = new DeterministicLayoutSolver();
        LayoutConstraintValidator constraintValidator = new LayoutConstraintValidator();
        DeterministicDesignScorer scorer = new DeterministicDesignScorer();
        for (SlideBrief brief : plan.slides()) {
            List<SlideLayoutCandidate> a = solver.solve(brief, brand);
            List<SlideLayoutCandidate> b = solver.solve(brief, brand);
            check(a.size() >= 2, "multiple candidates slide " + brief.index());
            check(a.equals(b), "layout deterministic slide " + brief.index());
            check(a.stream().map(SlideLayoutCandidate::candidateId).distinct().count() == a.size(), "candidate IDs unique slide " + brief.index());
            for (SlideLayoutCandidate candidate : a) {
                var constraints = constraintValidator.validate(candidate, brand);
                check(constraints.valid(), "candidate hard constraints pass " + candidate.candidateId() + " " + constraints.findings());
                check(constraints.alignmentScore() >= .82, "alignment score strong");
                check(constraints.whitespaceScore() >= .82, "whitespace score strong");
                check(constraints.densityScore() >= .88, "density score strong");
                var score = scorer.score(plan, brief, candidate, brand);
                check(score.dimensions().size() == MasterpieceDesignContract.Dimension.values().length, "all dimensions scored");
                check(score.overall() >= .86, "deterministic candidate strong");
            }
        }

        NarrativePlan imagePlan = new NarrativePlan("Image story", "Board", "Explain", "Visual evidence matters", List.of(
                new SlideBrief(1, SlideArchetype.IMAGE_STORY, "The product experience is visible", List.of("A real image asset is required"), "", List.of())));
        SlideBrief imageBrief = imagePlan.slides().getFirst();
        var imageScore = scorer.score(imagePlan, imageBrief, solver.solve(imageBrief, brand).getFirst(), brand);
        check(imageScore.dimensions().get(MasterpieceDesignContract.Dimension.IMAGE_AND_CROP_QUALITY) == 0.0, "image-story cannot self-certify without image asset");
        check(imageScore.overall() < .90, "missing image asset lowers overall score");
        NarrativePlan chartPlan = new NarrativePlan("Chart insight", "Board", "Explain", "Data evidence matters", List.of(
                new SlideBrief(1, SlideArchetype.CHART_INSIGHT, "Growth accelerated", List.of("A real chart asset is required"), "", List.of("CHART-E-1"))));
        SlideBrief chartBrief = chartPlan.slides().getFirst();
        var chartScore = scorer.score(chartPlan, chartBrief, solver.solve(chartBrief, brand).getFirst(), brand);
        check(chartScore.dimensions().get(MasterpieceDesignContract.Dimension.CHART_AND_DIAGRAM_CLARITY) == 0.0, "chart-insight cannot self-certify without chart asset");
        check(chartScore.overall() < .90, "missing chart asset lowers overall score");

        var first = solver.solve(plan.slides().get(1), brand).getFirst();
        LayoutFrame f = first.elements().getFirst().frame();
        check(f.area() > 0, "frame area positive");
        check(f.right() <= 1 && f.bottom() <= 1, "frame bounded");
        reject(() -> new LayoutFrame(.9, .9, .2, .2), "out of bounds frame rejected");

        MasterpiecePptxExporter exporter = new MasterpiecePptxExporter();
        List<SlideLayoutCandidate> selected = plan.slides().stream().map(s -> solver.solve(s, brand).getFirst()).toList();
        byte[] pptx = exporter.export(plan, brand, selected);
        check(pptx.length > 1000, "pptx emitted");
        PptxPackageEngine.Inspection inspection = new PptxPackageEngine().inspect(pptx);
        check(inspection.slides().size() == plan.slides().size(), "pptx slide count");
        check(inspection.slides().getFirst().texts().contains(plan.slides().getFirst().headline()), "pptx title preserved");
        check(inspection.activeContent().isEmpty(), "no active content");
        check(inspection.externalTargets().isEmpty(), "no external targets");
        check(OoxmlPackageSupport.read(pptx).containsKey("ppt/presentation.xml"), "presentation part present");

        DeterministicRenderedVisualCritic critic = new DeterministicRenderedVisualCritic();
        var strongVisual = critic.critique(balancedRaster());
        check(strongVisual.overall() >= .86, "balanced raster strong");
        check(strongVisual.findings().isEmpty(), "balanced raster no findings");
        var blankVisual = critic.critique(new BufferedImage(1200, 675, BufferedImage.TYPE_INT_RGB));
        check(blankVisual.findings().contains("EXCESSIVE_VISUAL_DENSITY") || blankVisual.overall() < .86, "uninitialized dark raster not certified");

        DeterministicLayoutRefiner refiner = new DeterministicLayoutRefiner();
        RenderedVisualCriticPort.Critique weakCritique = new RenderedVisualCriticPort.Critique(.60, .70, .65, .70, .66, List.of("EDGE_INK_CLIPPING_RISK"), "test-critic");
        SlideLayoutCandidate refined = refiner.refine(first, brand, weakCritique);
        check(refined.candidateId().endsWith("-r1"), "refinement is versioned");
        check(refined.variant().endsWith("-refined"), "refinement variant named");
        check(refined.elements().size() == first.elements().size(), "refinement preserves semantic element count");
        check(refined.elements().stream().map(SlideLayoutCandidate.TextElement::text).toList().equals(first.elements().stream().map(SlideLayoutCandidate.TextElement::text).toList()), "refinement cannot rewrite semantic text");

        DeterministicPageLayoutSolver pageSolver = new DeterministicPageLayoutSolver();
        DocumentPageBrief bodyPage = new DocumentPageBrief(1, PageArchetype.BODY_TEXT, "A publication-quality body page", List.of("Paragraph one", "Paragraph two"), List.of("D-001"));
        List<DocumentPageLayoutCandidate> pageCandidates = pageSolver.solve(bodyPage, brand);
        check(pageCandidates.size() >= 2, "multiple document page candidates");
        check(pageCandidates.stream().allMatch(c -> c.sequence() == 1), "page sequence retained");
        check(pageCandidates.stream().allMatch(c -> c.regions().stream().allMatch(r -> r.frame().right() <= 1 && r.frame().bottom() <= 1)), "page regions bounded");
        DocumentPageBrief figurePage = new DocumentPageBrief(2, PageArchetype.FIGURE_FOCUS, "Evidence figure", List.of("Figure caption"), List.of("D-002"));
        check(pageSolver.solve(figurePage, brand).stream().anyMatch(c -> c.regions().stream().anyMatch(r -> r.role() == DocumentPageLayoutCandidate.Role.FIGURE)), "figure archetype produces figure region");
        DocumentPageBrief tablePage = new DocumentPageBrief(3, PageArchetype.TABLE_FOCUS, "Evidence table", List.of("Table data"), List.of("D-003"));
        check(pageSolver.solve(tablePage, brand).stream().anyMatch(c -> c.regions().stream().anyMatch(r -> r.role() == DocumentPageLayoutCandidate.Role.TABLE)), "table archetype produces table region");

        String javaExe = java.nio.file.Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT).contains("win") ? "java.exe" : "java").toString();
        LocalVisualCriticProcessPort localCritic = new LocalVisualCriticProcessPort(
                List.of(javaExe, "-Djava.awt.headless=true", "-cp", System.getProperty("java.class.path"), FakeLocalVisualCriticWorkerMain.class.getName()),
                java.time.Duration.ofSeconds(10), "fake-local-vlm-critic-v1");
        var localCritique = localCritic.critique(balancedRaster());
        check(localCritique.overall() == .90, "local critic protocol score parsed");
        check(localCritique.findings().contains("SEMANTIC_IMAGE_CHECK_REQUIRED"), "local critic finding decoded");
        CompositeRenderedVisualCritic composite = new CompositeRenderedVisualCritic(critic, localCritic);
        var compositeCritique = composite.critique(balancedRaster());
        check(compositeCritique.overall() <= strongVisual.overall(), "local model cannot raise deterministic visual score");
        check(compositeCritique.overall() <= localCritique.overall(), "composite uses conservative minimum");
        check(compositeCritique.evaluatorId().startsWith("composite:"), "composite provenance recorded");

        CountingRasterizer fake = new CountingRasterizer();
        MasterpieceDesignContract contract = MasterpieceDesignContract.strictPresentation(plan.audience(), plan.objective(), brand.id());
        MasterpieceOptimizationEngine.Result result = new MasterpieceOptimizationEngine().build(plan, brand, contract, fake, critic);
        check(result.selections().size() == plan.slides().size(), "selection per slide");
        check(result.selections().stream().allMatch(s -> s.evaluated().size() >= 2), "multiple rendered candidates evaluated");
        check(fake.calls == 2, "batched candidate preview and final deck rendered in two passes");
        check(result.finalVisualProof().size() == plan.slides().size(), "final visual proof per slide");
        check(result.finalScores().size() == MasterpieceDesignContract.Dimension.values().length, "final dimensions complete");
        check(result.overallScore() >= contract.minimumOverallScore(), "final overall above contract");
        check(result.qualityDecision().passed(), "masterpiece quality gate passes strong deck " + result.qualityDecision().blockers());
        check(result.previewCandidateCount() >= plan.slides().size() * 2, "preview candidate count recorded");
        check(result.pptx().length > 1000, "pipeline returns pptx");
        check(result.rasterizerId().equals("portable-fake-rasterizer-v1"), "rasterizer provenance retained");

        DocumentFormattingPlan documentPlan = new DocumentFormattingPlan("Decision memorandum", "executive leadership", "support a decision", List.of(
                new DocumentPageBrief(1, PageArchetype.COVER, "Decision memorandum", List.of("A concise publication-quality brief"), List.of()),
                new DocumentPageBrief(2, PageArchetype.EXECUTIVE_SUMMARY, "Executive summary", List.of("The recommendation is supported by measurable evidence.", "The implementation path is bounded and reversible."), List.of("D-010")),
                new DocumentPageBrief(3, PageArchetype.TABLE_FOCUS, "Decision evidence", List.of("Value | High", "Speed | High", "Risk | Controlled"), List.of("D-011")),
                new DocumentPageBrief(4, PageArchetype.REFERENCES, "References", List.of("D-010 Internal analysis", "D-011 Decision model"), List.of("D-010", "D-011"))));
        byte[] docx = new MasterpieceDocxExporter().export(documentPlan, brand);
        check(docx.length > 1200, "masterpiece DOCX emitted");
        org.systemmaster.tools.docx.DocxPackageEngine.Inspection docxInspection = new org.systemmaster.tools.docx.DocxPackageEngine().inspect(docx);
        check(docxInspection.paragraphs().stream().anyMatch(v -> v.contains("Executive summary")), "DOCX semantic heading preserved");
        check(!docxInspection.activeContent().macroProject(), "DOCX has no macros");
        check(!docxInspection.activeContent().externalRelationships(), "DOCX has no external relationships");
        java.util.Map<String, byte[]> docxParts = OoxmlPackageSupport.read(docx);
        check(docxParts.containsKey("word/styles.xml"), "DOCX styles part present");
        String styles = new String(docxParts.get("word/styles.xml"), java.nio.charset.StandardCharsets.UTF_8);
        check(styles.contains("widowControl"), "DOCX widow control encoded");
        check(styles.contains("keepNext"), "DOCX heading keep-next encoded");
        check(styles.contains(brand.headingFont()), "DOCX brand heading font encoded");
        String docXml = new String(docxParts.get("word/document.xml"), java.nio.charset.StandardCharsets.UTF_8);
        check(docXml.contains("w:pgMar"), "DOCX page margins encoded");
        check(docXml.contains("w:tbl"), "DOCX table-focus archetype creates native table");

        System.out.println("DESIGN_INTELLIGENCE_001A_PORTABLE_PASS assertions=" + n + " slides=" + plan.slides().size() + " rasterCalls=" + fake.calls);
    }

    private static NarrativePlan plan() {
        return new NarrativePlan(
                "Investment decision",
                "executive leadership",
                "approve the recommended investment",
                "The investment creates a measurable strategic advantage.",
                List.of(
                        new SlideBrief(1, SlideArchetype.TITLE, "A focused investment can unlock the next growth curve", List.of("Decision brief"), "Open with the decision context.", List.of()),
                        new SlideBrief(2, SlideArchetype.ASSERTION_EVIDENCE, "The opportunity is large enough to matter", List.of("Demand is growing", "Economics improve with scale", "Execution risk is bounded"), "Walk through evidence.", List.of("E-001", "E-002")),
                        new SlideBrief(3, SlideArchetype.COMPARISON, "The recommended path wins on value and speed", List.of("Recommended: high value, controlled risk", "Alternative: slower, lower upside"), "Close on the tradeoff.", List.of("E-003"))));
    }

    private static BufferedImage balancedRaster() {
        BufferedImage image = new BufferedImage(1200, 675, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setColor(Color.WHITE); g.fillRect(0, 0, image.getWidth(), image.getHeight());
            g.setColor(new Color(30, 30, 30));
            g.fillRect(90, 100, 430, 70);
            g.fillRect(90, 240, 420, 150);
            g.fillRect(690, 120, 360, 90);
            g.fillRect(690, 300, 350, 150);
        } finally { g.dispose(); }
        return image;
    }

    private static final class CountingRasterizer implements PresentationRasterizerPort {
        int calls;
        @Override public List<RasterizedSlide> rasterize(byte[] pptx) throws Exception {
            calls++;
            int slides = new PptxPackageEngine().inspect(pptx).slides().size();
            ArrayList<RasterizedSlide> result = new ArrayList<>();
            for (int i = 1; i <= slides; i++) {
                BufferedImage image = balancedRaster();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                ImageIO.write(image, "png", out);
                result.add(new RasterizedSlide(i, image, OoxmlPackageSupport.sha256(out.toByteArray())));
            }
            return List.copyOf(result);
        }
        @Override public String identity() { return "portable-fake-rasterizer-v1"; }
    }

    private static void reject(ThrowingRunnable action, String message) {
        n++;
        try { action.run(); throw new AssertionError(message); }
        catch (IllegalArgumentException expected) { }
        catch (Exception e) { throw new AssertionError(message, e); }
    }
    private interface ThrowingRunnable { void run() throws Exception; }
    private static void check(boolean condition, String message) { n++; if (!condition) throw new AssertionError(message); }
}
