package org.systemmaster.tools.document.accessibility;

import org.systemmaster.tools.common.OoxmlPackageSupport;
import org.systemmaster.tools.document.CanonicalDocumentGraphV2;
import org.systemmaster.tools.document.DocumentFormat;
import org.systemmaster.tools.document.DocumentOperationContract;
import org.systemmaster.tools.pdf.PdfStructuralEngine;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** DOCUMENT-WORLD-CLASS-001C deterministic semantic accessibility and conformance authority. */
public final class AccessibilityComplianceEngine {
    public static final String ENGINE_VERSION = "DOCUMENT-WORLD-CLASS-001C";

    public enum RuleStatus { PASS, FAIL, REVIEW_REQUIRED, NOT_APPLICABLE, VALIDATOR_REQUIRED }

    public record RuleResult(
            String code,
            String capabilityId,
            RuleStatus status,
            String elementId,
            String message) {
        public RuleResult {
            code = required(code, "code");
            capabilityId = required(capabilityId, "capabilityId");
            Objects.requireNonNull(status, "status");
            elementId = Objects.requireNonNullElse(elementId, "");
            message = required(message, "message");
        }
    }

    public record Report(
            AccessibilityComplianceProfile profile,
            boolean pass,
            List<RuleResult> rules,
            List<String> evidence,
            Map<String, String> measurements,
            AccessibilityValidatorPort.Receipt validatorReceipt,
            AccessibilityRemediationPlan remediationPlan) {
        public Report {
            Objects.requireNonNull(profile, "profile");
            rules = List.copyOf(Objects.requireNonNullElse(rules, List.of()));
            evidence = List.copyOf(Objects.requireNonNullElse(evidence, List.of()));
            measurements = Map.copyOf(Objects.requireNonNullElse(measurements, Map.of()));
            Objects.requireNonNull(remediationPlan, "remediationPlan");
        }
    }

    private static final Pattern HEADING_STYLE = Pattern.compile("(?i)^heading\\s*([1-9][0-9]?)$");
    private static final Set<String> GENERIC_LINK_TEXT = Set.of("click here", "here", "link", "more", "read more", "learn more");
    private final AccessibilityValidatorPort validator;

    public AccessibilityComplianceEngine() {
        this(null);
    }

    public AccessibilityComplianceEngine(AccessibilityValidatorPort validator) {
        this.validator = validator;
    }

    public String identity() {
        return ENGINE_VERSION + "|" + (validator == null ? "no-qualified-validator" : validator.identity());
    }

    public Report evaluate(
            DocumentFormat format,
            byte[] bytes,
            CanonicalDocumentGraphV2 graph,
            DocumentOperationContract operation) throws Exception {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(bytes, "bytes");
        Objects.requireNonNull(graph, "graph");
        Objects.requireNonNull(operation, "operation");
        if (graph.sourceFormat() != format) {
            throw new IllegalArgumentException("accessibility graph/format mismatch");
        }
        AccessibilityComplianceProfile profile = AccessibilityComplianceProfile.resolve(format, operation);
        ArrayList<RuleResult> rules = new ArrayList<>();
        LinkedHashMap<String, String> measurements = new LinkedHashMap<>();
        ArrayList<String> evidence = new ArrayList<>();
        AccessibilityValidatorPort.Receipt validatorReceipt = null;

        switch (format) {
            case DOCX, DOCM -> evaluateDocx(bytes, graph, rules, measurements);
            case PPTX, PPTM -> evaluatePptx(bytes, graph, rules, measurements);
            case PDF -> validatorReceipt = evaluatePdf(bytes, graph, profile, rules, measurements);
            case HTML -> evaluateHtml(bytes, graph, rules, measurements);
            case MARKDOWN, PLAIN_TEXT, RTF -> evaluateTextFamily(graph, rules, measurements);
            default -> rules.add(new RuleResult(
                    "A11Y_FORMAT_ENGINE_REQUIRED",
                    "UDM-FOUNDATION-0081",
                    RuleStatus.VALIDATOR_REQUIRED,
                    "",
                    "Accessibility semantic engine is not implemented for " + format));
        }

        if (profile.qualifiedValidatorRequired() && validatorReceipt == null) {
            rules.add(new RuleResult(
                    "A11Y_QUALIFIED_VALIDATOR_REQUIRED",
                    "UDM-ACCESSIBILIT-0024",
                    RuleStatus.VALIDATOR_REQUIRED,
                    "",
                    "Profile " + profile + " requires a named qualified validator receipt"));
        } else if (validatorReceipt != null) {
            if (validatorReceipt.status() == AccessibilityValidatorPort.Status.PASS) {
                for (int i = 0; i < rules.size(); i++) {
                    RuleResult rule = rules.get(i);
                    if (rule.status() == RuleStatus.REVIEW_REQUIRED
                            && Set.of("UDM-ACCESSIBILIT-0018", "UDM-ACCESSIBILIT-0019").contains(rule.capabilityId())) {
                        rules.set(i, new RuleResult(
                                rule.code(),
                                rule.capabilityId(),
                                RuleStatus.PASS,
                                rule.elementId(),
                                "Named qualified validator confirmed: " + validatorReceipt.validatorId()));
                    }
                }
            }
            RuleStatus status = switch (validatorReceipt.status()) {
                case PASS -> RuleStatus.PASS;
                case FAIL -> RuleStatus.FAIL;
                case UNAVAILABLE -> RuleStatus.VALIDATOR_REQUIRED;
            };
            rules.add(new RuleResult(
                    "A11Y_PROFILE_VALIDATOR",
                    "UDM-ACCESSIBILIT-0024",
                    status,
                    "",
                    "Validator " + validatorReceipt.validatorId() + " reported " + validatorReceipt.status()));
            evidence.add("validator=" + validatorReceipt.validatorId());
            evidence.add("validator-version=" + validatorReceipt.validatorVersion());
            evidence.add("validator-profile=" + validatorReceipt.profileClaim());
            evidence.addAll(validatorReceipt.evidence());
            measurements.putAll(validatorReceipt.measurements());
        }

        long failures = rules.stream().filter(rule -> rule.status() == RuleStatus.FAIL).count();
        long reviews = rules.stream().filter(rule -> rule.status() == RuleStatus.REVIEW_REQUIRED).count();
        long validators = rules.stream().filter(rule -> rule.status() == RuleStatus.VALIDATOR_REQUIRED).count();
        long passes = rules.stream().filter(rule -> rule.status() == RuleStatus.PASS).count();
        measurements.put("rule.pass", Long.toString(passes));
        measurements.put("rule.fail", Long.toString(failures));
        measurements.put("rule.reviewRequired", Long.toString(reviews));
        measurements.put("rule.validatorRequired", Long.toString(validators));
        measurements.put("rule.total", Integer.toString(rules.size()));
        evidence.add("profile=" + profile);
        evidence.add("cdg2-semantic-digest=" + graph.semanticDigest());
        evidence.add("rules=" + rules.size());
        boolean pass = failures == 0 && reviews == 0 && validators == 0;
        return new Report(
                profile,
                pass,
                rules,
                evidence,
                measurements,
                validatorReceipt,
                remediationPlan(rules, operation));
    }

    private void evaluateDocx(
            byte[] bytes,
            CanonicalDocumentGraphV2 graph,
            List<RuleResult> rules,
            Map<String, String> measurements) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        String title = metadata(graph, "title");
        boolean language = graph.elements().stream().anyMatch(e -> !e.semantic().language().isBlank())
                || contains(parts, "word/styles.xml", "w:lang")
                || contains(parts, "word/document.xml", "w:lang");
        add(rules, "DOCX_TITLE", "UDM-ACCESSIBILIT-0001", !title.isBlank(), "", "Document title is " + present(title));
        add(rules, "DOCX_LANGUAGE", "UDM-ACCESSIBILIT-0001", language, "", "Document language is " + (language ? "declared" : "missing"));

        List<CanonicalDocumentGraphV2.Element> headings = graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.PARAGRAPH)
                .filter(e -> "heading".equalsIgnoreCase(e.accessibility().role()) || "heading".equalsIgnoreCase(e.semantic().role()))
                .toList();
        boolean hierarchy = headingHierarchyValid(headings);
        add(rules, "DOCX_HEADING_HIERARCHY", "UDM-ACCESSIBILIT-0002", hierarchy, headings.isEmpty() ? "" : headings.getFirst().id(),
                headings.isEmpty() ? "No heading hierarchy is required for this simple document" : "Heading hierarchy has no skipped levels");

        List<CanonicalDocumentGraphV2.Element> visuals = graph.elements().stream()
                .filter(e -> Set.of(CanonicalDocumentGraphV2.ElementType.IMAGE, CanonicalDocumentGraphV2.ElementType.CHART, CanonicalDocumentGraphV2.ElementType.DIAGRAM).contains(e.type()))
                .toList();
        for (CanonicalDocumentGraphV2.Element visual : visuals) {
            boolean decorative = Boolean.parseBoolean(visual.accessibility().properties().getOrDefault("decorative", "false"));
            boolean hasAlt = !visual.accessibility().alternativeText().isBlank() || !visual.accessibility().title().isBlank();
            add(rules, "DOCX_VISUAL_ALT", "UDM-ACCESSIBILIT-0003", decorative || hasAlt, visual.id(), decorative ? "Visual is explicitly decorative" : "Meaningful visual has alternative text");
            if (decorative) {
                add(rules, "DOCX_DECORATIVE_MARKING", "UDM-ACCESSIBILIT-0004", true, visual.id(), "Decorative visual is explicitly marked");
            } else {
                rules.add(new RuleResult("DOCX_DECORATIVE_MARKING", "UDM-ACCESSIBILIT-0004", RuleStatus.NOT_APPLICABLE, visual.id(), "Visual is treated as meaningful rather than decorative"));
            }
        }
        if (visuals.isEmpty()) {
            notApplicable(rules, "DOCX_VISUAL_ALT", "UDM-ACCESSIBILIT-0003", "No meaningful graphics present");
            notApplicable(rules, "DOCX_DECORATIVE_MARKING", "UDM-ACCESSIBILIT-0004", "No graphics present");
        }

        List<CanonicalDocumentGraphV2.Element> tables = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE).toList();
        for (CanonicalDocumentGraphV2.Element table : tables) {
            boolean header = descendants(graph, table.id()).stream()
                    .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_ROW && e.ordinal() == 0)
                    .anyMatch(e -> Boolean.parseBoolean(e.accessibility().properties().getOrDefault("headerRow", "false")));
            add(rules, "DOCX_TABLE_HEADER", "UDM-ACCESSIBILIT-0005", header, table.id(), header ? "Table has a declared header row" : "Table lacks a declared header row");
        }
        if (tables.isEmpty()) {
            notApplicable(rules, "DOCX_TABLE_HEADER", "UDM-ACCESSIBILIT-0005", "No tables present");
        }

        checkLinks(graph, rules, "DOCX_LINK_PURPOSE", "UDM-ACCESSIBILIT-0006");
        checkDocxContrast(parts, rules, measurements);

        boolean floating = contains(parts, "word/document.xml", "<wp:anchor");
        if (!floating) {
            notApplicable(rules, "DOCX_FLOATING_READING_ORDER", "UDM-ACCESSIBILIT-0008", "No floating drawing anchors present");
        } else {
            boolean anchored = graph.elements().stream()
                    .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.IMAGE)
                    .allMatch(e -> !e.accessibility().readingOrderKey().isBlank());
            if (!anchored) {
                fail(rules, "DOCX_FLOATING_READING_ORDER", "UDM-ACCESSIBILIT-0008", "Floating object lacks a canonical reading-order anchor");
            } else {
                review(rules, "DOCX_FLOATING_READING_ORDER", "UDM-ACCESSIBILIT-0008",
                        "Floating objects have canonical anchors, but assistive-technology reading order requires native/qualified review");
            }
        }
    }

    private void evaluatePptx(
            byte[] bytes,
            CanonicalDocumentGraphV2 graph,
            List<RuleResult> rules,
            Map<String, String> measurements) throws IOException {
        Map<String, byte[]> parts = OoxmlPackageSupport.read(bytes);
        List<CanonicalDocumentGraphV2.Element> slides = graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.SLIDE)
                .sorted(java.util.Comparator.comparingInt(CanonicalDocumentGraphV2.Element::ordinal))
                .toList();
        HashSet<String> seenTitles = new HashSet<>();
        for (CanonicalDocumentGraphV2.Element slide : slides) {
            String title = slide.accessibility().title().strip();
            boolean meaningful = !title.isBlank();
            boolean unique = meaningful && seenTitles.add(title.toLowerCase(Locale.ROOT));
            add(rules, "PPTX_SLIDE_TITLE", "UDM-ACCESSIBILIT-0009", meaningful && unique, slide.id(),
                    meaningful ? (unique ? "Slide has a unique meaningful title" : "Slide title is duplicated") : "Slide title is missing");
            List<CanonicalDocumentGraphV2.Element> objects = directChildren(graph, slide.id()).stream()
                    .filter(e -> Set.of(CanonicalDocumentGraphV2.ElementType.SHAPE, CanonicalDocumentGraphV2.ElementType.IMAGE,
                            CanonicalDocumentGraphV2.ElementType.CHART, CanonicalDocumentGraphV2.ElementType.DIAGRAM,
                            CanonicalDocumentGraphV2.ElementType.TABLE).contains(e.type()))
                    .sorted(java.util.Comparator.comparingInt(CanonicalDocumentGraphV2.Element::ordinal))
                    .toList();
            boolean readingOrder = objects.stream().allMatch(e -> !e.accessibility().readingOrderKey().isBlank())
                    && uniqueReadingOrder(objects);
            add(rules, "PPTX_READING_ORDER", "UDM-ACCESSIBILIT-0010", readingOrder, slide.id(),
                    readingOrder ? "Slide objects have a unique canonical reading order" : "Slide object reading order is missing or ambiguous");
        }
        if (slides.isEmpty()) {
            rules.add(new RuleResult("PPTX_SLIDE_TITLE", "UDM-ACCESSIBILIT-0009", RuleStatus.FAIL, "", "Presentation has no slides"));
        }

        List<CanonicalDocumentGraphV2.Element> visuals = graph.elements().stream()
                .filter(e -> Set.of(CanonicalDocumentGraphV2.ElementType.IMAGE, CanonicalDocumentGraphV2.ElementType.CHART, CanonicalDocumentGraphV2.ElementType.DIAGRAM).contains(e.type()))
                .toList();
        for (CanonicalDocumentGraphV2.Element visual : visuals) {
            boolean decorative = Boolean.parseBoolean(visual.accessibility().properties().getOrDefault("decorative", "false"));
            boolean hasAlt = !visual.accessibility().alternativeText().isBlank() || !visual.accessibility().title().isBlank();
            add(rules, "PPTX_VISUAL_ALT", "UDM-ACCESSIBILIT-0011", decorative || hasAlt, visual.id(), decorative ? "Visual is decorative" : "Meaningful visual has alternative text");
        }
        if (visuals.isEmpty()) {
            notApplicable(rules, "PPTX_VISUAL_ALT", "UDM-ACCESSIBILIT-0011", "No visual objects requiring alt text");
        }

        List<CanonicalDocumentGraphV2.Element> tables = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE).toList();
        for (CanonicalDocumentGraphV2.Element table : tables) {
            boolean header = descendants(graph, table.id()).stream()
                    .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.TABLE_ROW && e.ordinal() == 0)
                    .anyMatch(e -> Boolean.parseBoolean(e.accessibility().properties().getOrDefault("headerRow", "false")));
            add(rules, "PPTX_TABLE_HEADER", "UDM-ACCESSIBILIT-0012", header, table.id(), header ? "Table has header semantics" : "Table header semantics are missing");
        }
        if (tables.isEmpty()) {
            notApplicable(rules, "PPTX_TABLE_HEADER", "UDM-ACCESSIBILIT-0012", "No tables present");
        }

        checkLinks(graph, rules, "PPTX_LINK_PURPOSE", "UDM-ACCESSIBILIT-0013");
        checkPptxContrast(parts, rules, measurements);
        checkPptxTextSize(parts, rules, measurements);

        boolean media = parts.keySet().stream().anyMatch(name -> name.startsWith("ppt/media/"));
        if (!media) {
            notApplicable(rules, "PPTX_MEDIA_CAPTIONS", "UDM-ACCESSIBILIT-0016", "No embedded media present");
        } else {
            boolean captions = parts.keySet().stream().anyMatch(name -> name.toLowerCase(Locale.ROOT).contains("caption") || name.toLowerCase(Locale.ROOT).endsWith(".vtt"));
            add(rules, "PPTX_MEDIA_CAPTIONS", "UDM-ACCESSIBILIT-0016", captions, "", captions ? "Caption/transcript payload observed" : "Embedded media lacks observed caption/transcript payload");
        }
    }

    private AccessibilityValidatorPort.Receipt evaluatePdf(
            byte[] bytes,
            CanonicalDocumentGraphV2 graph,
            AccessibilityComplianceProfile profile,
            List<RuleResult> rules,
            Map<String, String> measurements) throws Exception {
        String raw = new String(bytes, StandardCharsets.ISO_8859_1);
        PdfStructuralEngine.Inspection inspection = new PdfStructuralEngine().inspect(bytes);
        boolean tagged = raw.contains("/StructTreeRoot") && Pattern.compile("/Marked\\s+true", Pattern.CASE_INSENSITIVE).matcher(raw).find();
        boolean lang = Pattern.compile("/Lang\\s*(\\(|<)").matcher(raw).find() || raw.contains("xml:lang=");
        boolean title = Pattern.compile("/Title\\s*\\(").matcher(raw).find() || raw.contains("<dc:title");
        boolean alt = !raw.contains("/Figure") || raw.contains("/Alt");
        boolean formLabels = !raw.contains("/AcroForm") || raw.contains("/TU") || raw.contains("/T (");
        boolean bookmarks = inspection.pages() <= 1 || raw.contains("/Outlines");
        measurements.put("pdf.pages", Integer.toString(inspection.pages()));
        measurements.put("pdf.tagged", Boolean.toString(tagged));
        measurements.put("pdf.language", Boolean.toString(lang));
        measurements.put("pdf.title", Boolean.toString(title));

        add(rules, "PDF_TAGGED_STRUCTURE", "UDM-ACCESSIBILIT-0017", tagged, "", tagged ? "Tagged PDF structure is declared" : "Tagged structure tree/Marked flag is missing");
        if (tagged) {
            review(rules, "PDF_READING_ORDER", "UDM-ACCESSIBILIT-0018", "Tagged structure is present, but portable byte inspection cannot prove assistive-technology reading order");
            review(rules, "PDF_STRUCTURE_SEMANTICS", "UDM-ACCESSIBILIT-0019", "Portable byte inspection cannot fully validate heading/list/table containment semantics");
        } else {
            fail(rules, "PDF_READING_ORDER", "UDM-ACCESSIBILIT-0018", "Reading order cannot be proven without tagged structure");
            fail(rules, "PDF_STRUCTURE_SEMANTICS", "UDM-ACCESSIBILIT-0019", "Heading/list/table semantics cannot be proven without tagged structure");
        }
        add(rules, "PDF_ALT_TEXT", "UDM-ACCESSIBILIT-0020", alt, "", alt ? "No unlabelled Figure marker observed" : "Figure structure exists without observed /Alt text");
        add(rules, "PDF_FORM_LABELS", "UDM-ACCESSIBILIT-0021", formLabels, "", formLabels ? "Form-label requirement satisfied or not applicable" : "AcroForm is present without observed field labels");
        add(rules, "PDF_TITLE", "UDM-ACCESSIBILIT-0022", title, "", title ? "Document title is declared" : "Document title is missing");
        add(rules, "PDF_LANGUAGE", "UDM-ACCESSIBILIT-0022", lang, "", lang ? "Document language is declared" : "Document language is missing");
        add(rules, "PDF_BOOKMARKS", "UDM-ACCESSIBILIT-0023", bookmarks, "", bookmarks ? "Bookmark requirement satisfied or not applicable" : "Multi-page PDF lacks observed outline/bookmarks");

        if (profile != AccessibilityComplianceProfile.PDF_UA_2) {
            notApplicable(rules, "PDF_UA_2_PROFILE", "UDM-ACCESSIBILIT-0024", "PDF/UA-2 conformance was not requested");
            return null;
        }
        if (validator == null) {
            return null;
        }
        return validator.validate(new AccessibilityValidatorPort.Request(profile, DocumentFormat.PDF, bytes));
    }

    private static void evaluateHtml(
            byte[] bytes,
            CanonicalDocumentGraphV2 graph,
            List<RuleResult> rules,
            Map<String, String> measurements) {
        String html = new String(bytes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
        boolean lang = Pattern.compile("<html[^>]*\\slang\\s*=").matcher(html).find();
        boolean title = Pattern.compile("<title>\\s*[^<]+\\s*</title>").matcher(html).find();
        add(rules, "HTML_LANGUAGE", "UDM-HTML-DOC-0060", lang, "", lang ? "HTML language declared" : "HTML lang attribute missing");
        add(rules, "HTML_TITLE", "UDM-HTML-DOC-0060", title, "", title ? "HTML title declared" : "HTML title missing");
        measurements.put("html.elements", Integer.toString(graph.elements().size()));
    }

    private static void evaluateTextFamily(
            CanonicalDocumentGraphV2 graph,
            List<RuleResult> rules,
            Map<String, String> measurements) {
        boolean nonEmpty = graph.elements().stream().anyMatch(e -> !e.text().isBlank());
        add(rules, "TEXT_SEMANTIC_CONTENT", "UDM-FOUNDATION-0081", nonEmpty, "", nonEmpty ? "Text content is present" : "Text artifact is empty");
        measurements.put("text.elements", Integer.toString(graph.elements().size()));
    }

    private static AccessibilityRemediationPlan remediationPlan(List<RuleResult> rules, DocumentOperationContract operation) {
        ArrayList<AccessibilityRemediationPlan.Action> actions = new ArrayList<>();
        for (RuleResult rule : rules) {
            if (rule.status() == RuleStatus.PASS || rule.status() == RuleStatus.NOT_APPLICABLE) {
                continue;
            }
            String parameter = switch (rule.code()) {
                case "DOCX_TITLE", "PDF_TITLE" -> "documentTitle";
                case "DOCX_LANGUAGE", "PDF_LANGUAGE" -> "language";
                case "DOCX_VISUAL_ALT", "PPTX_VISUAL_ALT" -> "altText";
                default -> "";
            };
            boolean explicit = !parameter.isBlank() && !operation.parameters().getOrDefault(parameter, "").isBlank();
            AccessibilityRemediationPlan.Disposition disposition;
            if (rule.status() == RuleStatus.VALIDATOR_REQUIRED) {
                disposition = AccessibilityRemediationPlan.Disposition.VALIDATOR_REQUIRED;
            } else if (explicit && Set.of("documentTitle", "language", "altText").contains(parameter)) {
                disposition = AccessibilityRemediationPlan.Disposition.AUTO_SAFE_WITH_EXPLICIT_VALUE;
            } else {
                disposition = AccessibilityRemediationPlan.Disposition.REVIEW_REQUIRED;
            }
            actions.add(new AccessibilityRemediationPlan.Action(
                    rule.code(), rule.capabilityId(), disposition, rule.elementId(), parameter,
                    explicit ? "Explicit user/system value makes the repair deterministic" : "Semantic repair is ambiguous and must not be invented automatically"));
        }
        return new AccessibilityRemediationPlan(actions);
    }

    private static void checkLinks(CanonicalDocumentGraphV2 graph, List<RuleResult> rules, String code, String capability) {
        List<CanonicalDocumentGraphV2.Element> links = graph.elements().stream().filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.HYPERLINK).toList();
        for (CanonicalDocumentGraphV2.Element link : links) {
            String text = link.text().strip();
            boolean purpose = !text.isBlank() && !GENERIC_LINK_TEXT.contains(text.toLowerCase(Locale.ROOT));
            add(rules, code, capability, purpose, link.id(), purpose ? "Hyperlink text is meaningful" : "Hyperlink text is blank or generic");
        }
        if (links.isEmpty()) {
            notApplicable(rules, code, capability, "No hyperlinks present");
        }
    }

    private static void checkDocxContrast(Map<String, byte[]> parts, List<RuleResult> rules, Map<String, String> measurements) {
        String xml = utf8(parts.get("word/document.xml"));
        Matcher colors = Pattern.compile("<w:color[^>]*w:val=\"([0-9A-Fa-f]{6}|auto)\"").matcher(xml);
        double min = 21.0;
        boolean explicit = false;
        boolean unresolved = false;
        while (colors.find()) {
            String value = colors.group(1);
            if (value.equalsIgnoreCase("auto")) {
                continue;
            }
            explicit = true;
            double ratio = contrastRatio(value, "FFFFFF");
            min = Math.min(min, ratio);
            if (ratio < 4.5) {
                unresolved = true;
            }
        }
        measurements.put("docx.contrast.minObserved", explicit ? formatRatio(min) : "21.00");
        boolean backgroundDependent = xml.contains("<w:shd") || xml.contains("<w:highlight") || xml.contains("w:themeColor=");
        if (unresolved) {
            fail(rules, "DOCX_CONTRAST", "UDM-ACCESSIBILIT-0007", "Observed explicit text color falls below 4.5:1 against the default white background");
        } else if (backgroundDependent) {
            review(rules, "DOCX_CONTRAST", "UDM-ACCESSIBILIT-0007",
                    "Theme/highlight/shading-dependent contrast requires rendered background-aware proof");
        } else if (!explicit) {
            pass(rules, "DOCX_CONTRAST", "UDM-ACCESSIBILIT-0007", "No explicit text color overrides observed; default black-on-white contrast is 21:1");
        } else {
            pass(rules, "DOCX_CONTRAST", "UDM-ACCESSIBILIT-0007", "Observed explicit text colors meet 4.5:1 against the default white background");
        }
    }

    private static void checkPptxContrast(Map<String, byte[]> parts, List<RuleResult> rules, Map<String, String> measurements) {
        boolean themeDependent = false;
        double min = 21.0;
        boolean explicitTextColor = false;
        for (Map.Entry<String, byte[]> entry : parts.entrySet()) {
            if (!entry.getKey().matches("ppt/slides/slide[0-9]+\\.xml")) {
                continue;
            }
            String xml = utf8(entry.getValue());
            if (xml.contains("<a:schemeClr")) {
                themeDependent = true;
            }
            Matcher run = Pattern.compile("<a:rPr[^>]*>(.*?)</a:rPr>", Pattern.DOTALL).matcher(xml);
            while (run.find()) {
                Matcher rgb = Pattern.compile("<a:srgbClr[^>]*val=\"([0-9A-Fa-f]{6})\"").matcher(run.group(1));
                if (rgb.find()) {
                    explicitTextColor = true;
                    min = Math.min(min, contrastRatio(rgb.group(1), "FFFFFF"));
                }
            }
        }
        measurements.put("pptx.contrast.minObserved", explicitTextColor ? formatRatio(min) : "21.00");
        if (themeDependent) {
            review(rules, "PPTX_CONTRAST", "UDM-ACCESSIBILIT-0014", "Theme-dependent colors require rendered/background-aware contrast proof");
        } else if (explicitTextColor && min < 4.5) {
            fail(rules, "PPTX_CONTRAST", "UDM-ACCESSIBILIT-0014", "Observed explicit text color falls below 4.5:1 against white");
        } else {
            pass(rules, "PPTX_CONTRAST", "UDM-ACCESSIBILIT-0014", "Observed/default text contrast meets the portable 4.5:1 check");
        }
    }

    private static void checkPptxTextSize(Map<String, byte[]> parts, List<RuleResult> rules, Map<String, String> measurements) {
        int minimumHundredths = Integer.MAX_VALUE;
        for (Map.Entry<String, byte[]> entry : parts.entrySet()) {
            if (!entry.getKey().matches("ppt/slides/slide[0-9]+\\.xml")) {
                continue;
            }
            Matcher matcher = Pattern.compile("<a:rPr[^>]*\\ssz=\"([0-9]+)\"").matcher(utf8(entry.getValue()));
            while (matcher.find()) {
                minimumHundredths = Math.min(minimumHundredths, Integer.parseInt(matcher.group(1)));
            }
        }
        if (minimumHundredths == Integer.MAX_VALUE) {
            review(rules, "PPTX_TEXT_SIZE", "UDM-ACCESSIBILIT-0015", "Text size is theme/default dependent and requires presentation-context review");
            measurements.put("pptx.minTextPt", "unknown");
            return;
        }
        double pt = minimumHundredths / 100.0;
        measurements.put("pptx.minTextPt", String.format(Locale.ROOT, "%.2f", pt));
        if (pt < 12.0) {
            fail(rules, "PPTX_TEXT_SIZE", "UDM-ACCESSIBILIT-0015", "Presentation contains text below the 12pt hard floor");
        } else if (pt < 18.0) {
            review(rules, "PPTX_TEXT_SIZE", "UDM-ACCESSIBILIT-0015", "Presentation contains text below 18pt and requires context/density review");
        } else {
            pass(rules, "PPTX_TEXT_SIZE", "UDM-ACCESSIBILIT-0015", "Observed text size is at least 18pt");
        }
    }

    private static boolean headingHierarchyValid(List<CanonicalDocumentGraphV2.Element> headings) {
        int prior = 0;
        for (CanonicalDocumentGraphV2.Element heading : headings) {
            String style = heading.style().declaredStyleId().replace("_", " ").replace("-", " ").strip();
            Matcher matcher = HEADING_STYLE.matcher(style);
            if (!matcher.matches()) {
                continue;
            }
            int level = Integer.parseInt(matcher.group(1));
            if (prior == 0 && level != 1) {
                return false;
            }
            if (prior != 0 && level > prior + 1) {
                return false;
            }
            prior = level;
        }
        return true;
    }

    private static boolean uniqueReadingOrder(List<CanonicalDocumentGraphV2.Element> elements) {
        HashSet<String> keys = new HashSet<>();
        for (CanonicalDocumentGraphV2.Element element : elements) {
            String key = element.accessibility().readingOrderKey();
            if (key.isBlank() || !keys.add(key)) {
                return false;
            }
        }
        return true;
    }

    private static String metadata(CanonicalDocumentGraphV2 graph, String key) {
        return graph.elements().stream()
                .filter(e -> e.type() == CanonicalDocumentGraphV2.ElementType.METADATA)
                .map(e -> e.semantic().properties().getOrDefault(key, ""))
                .filter(value -> !value.isBlank())
                .findFirst()
                .orElse("");
    }

    private static List<CanonicalDocumentGraphV2.Element> directChildren(CanonicalDocumentGraphV2 graph, String parentId) {
        return graph.elements().stream().filter(e -> parentId.equals(e.parentId())).toList();
    }

    private static List<CanonicalDocumentGraphV2.Element> descendants(CanonicalDocumentGraphV2 graph, String parentId) {
        Map<String, List<CanonicalDocumentGraphV2.Element>> byParent = new HashMap<>();
        for (CanonicalDocumentGraphV2.Element element : graph.elements()) {
            byParent.computeIfAbsent(Objects.requireNonNullElse(element.parentId(), ""), ignored -> new ArrayList<>()).add(element);
        }
        ArrayList<CanonicalDocumentGraphV2.Element> out = new ArrayList<>();
        ArrayList<String> queue = new ArrayList<>();
        queue.add(parentId);
        for (int i = 0; i < queue.size(); i++) {
            for (CanonicalDocumentGraphV2.Element child : byParent.getOrDefault(queue.get(i), List.of())) {
                out.add(child);
                queue.add(child.id());
            }
        }
        return List.copyOf(out);
    }

    private static boolean contains(Map<String, byte[]> parts, String part, String token) {
        byte[] bytes = parts.get(part);
        return bytes != null && utf8(bytes).contains(token);
    }

    private static String utf8(byte[] bytes) {
        return bytes == null ? "" : new String(bytes, StandardCharsets.UTF_8);
    }

    private static void add(List<RuleResult> rules, String code, String capability, boolean pass, String elementId, String message) {
        rules.add(new RuleResult(code, capability, pass ? RuleStatus.PASS : RuleStatus.FAIL, elementId, message));
    }

    private static void pass(List<RuleResult> rules, String code, String capability, String message) {
        rules.add(new RuleResult(code, capability, RuleStatus.PASS, "", message));
    }

    private static void fail(List<RuleResult> rules, String code, String capability, String message) {
        rules.add(new RuleResult(code, capability, RuleStatus.FAIL, "", message));
    }

    private static void review(List<RuleResult> rules, String code, String capability, String message) {
        rules.add(new RuleResult(code, capability, RuleStatus.REVIEW_REQUIRED, "", message));
    }

    private static void notApplicable(List<RuleResult> rules, String code, String capability, String message) {
        rules.add(new RuleResult(code, capability, RuleStatus.NOT_APPLICABLE, "", message));
    }

    private static double contrastRatio(String foreground, String background) {
        double l1 = relativeLuminance(foreground);
        double l2 = relativeLuminance(background);
        double lighter = Math.max(l1, l2);
        double darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double relativeLuminance(String rgb) {
        int r = Integer.parseInt(rgb.substring(0, 2), 16);
        int g = Integer.parseInt(rgb.substring(2, 4), 16);
        int b = Integer.parseInt(rgb.substring(4, 6), 16);
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    }

    private static double channel(int value) {
        double s = value / 255.0;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }

    private static String formatRatio(double ratio) {
        return String.format(Locale.ROOT, "%.2f", ratio);
    }

    private static String present(String value) {
        return value.isBlank() ? "missing" : "declared";
    }

    private static String required(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + " required");
        }
        return value;
    }
}
