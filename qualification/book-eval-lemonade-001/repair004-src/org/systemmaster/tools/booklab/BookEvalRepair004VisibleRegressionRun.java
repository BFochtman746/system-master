package org.systemmaster.tools.booklab;

import static org.systemmaster.tools.booklab.BookEvaluationModel.PreservationDimension;
import static org.systemmaster.tools.booklab.BookEvaluationModel.PreservationState;
import static org.systemmaster.tools.booklab.BookEvaluationModel.Severity;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;

/** Provider-blind visible-regression runner for REPAIR-004. It never loads gold/oracle data. */
public final class BookEvalRepair004VisibleRegressionRun {
    private static final String CANDIDATE_ID = "E4-REPAIR-004";
    private static final String RUNNER_VERSION = "BOOK-EVAL-REPAIR-004-VISIBLE-RUN-v1";
    private static final List<String> MODES = List.of("MANUSCRIPT_DIAGNOSIS", "REVISION_ASSESSMENT", "PAIRWISE_COMPARISON");

    private BookEvalRepair004VisibleRegressionRun() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            System.err.println("usage: BookEvalRepair004VisibleRegressionRun <provider-input-jsonl> <ontology-json> <selected-case-ids> <runtime-identity-json> <output-dir>");
            System.exit(64);
        }
        Path inputPath = Path.of(args[0]);
        Path ontologyPath = Path.of(args[1]);
        Path idsPath = Path.of(args[2]);
        Path identityPath = Path.of(args[3]);
        Path out = Path.of(args[4]);
        Files.createDirectories(out);

        URI endpoint = URI.create(env("BOOK_EVAL_ENDPOINT", "http://127.0.0.1:13305/v1/responses"));
        String model = env("BOOK_EVAL_MODEL", "user.gpt-oss-120b-MXFP4");
        int maxAttempts = intEnv("BOOK_EVAL_MAX_ATTEMPTS", 3, 1, 5);
        int maxOutputTokens = intEnv("BOOK_EVAL_MAX_OUTPUT_TOKENS", 1200, 256, 4096);
        double temperature = doubleEnv("BOOK_EVAL_TEMPERATURE", 0.0, 0.0, 2.0);
        Duration timeout = Duration.ofSeconds(intEnv("BOOK_EVAL_TIMEOUT_SECONDS", 180, 30, 600));

        Map<String,List<String>> ontology = OpenAiResponsesBookEvaluatorV2.ontologyFromJson(
                Files.readString(ontologyPath, StandardCharsets.UTF_8));
        Set<String> selected = new LinkedHashSet<>();
        for (String line : Files.readAllLines(idsPath, StandardCharsets.UTF_8)) {
            if (!line.isBlank()) selected.add(line.trim());
        }
        if (selected.size() != 48) throw new IllegalStateException("visible regression selection must contain exactly 48 unique cases");

        LinkedHashMap<String,BookEvalProviderV2.VisibleCase> byId = new LinkedHashMap<>();
        for (String line : Files.readAllLines(inputPath, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            Map<String,Object> row = BookEvalJson.object(line);
            String id = string(row, "case_id");
            if (!selected.contains(id)) continue;
            BookEvalProviderV2.VisibleCase c = new BookEvalProviderV2.VisibleCase(id, string(row,"task_mode"),
                    string(row,"subject_digest"), string(row,"input_text"));
            byId.put(id, c);
        }
        if (byId.size() != 48 || !byId.keySet().equals(selected)) throw new IllegalStateException("selected cases missing from provider input");

        String identityJson = Files.readString(identityPath, StandardCharsets.UTF_8);
        String candidateFingerprint = candidateFingerprint(model, endpoint, maxOutputTokens, temperature, ontology, identityJson);
        Path outputFile = out.resolve("E4-REPAIR-004-VISIBLE-REGRESSION.jsonl");
        Path statusFile = out.resolve("REPAIR-004-VISIBLE-STATUS.json");

        LinkedHashSet<String> completed = new LinkedHashSet<>();
        if (Files.exists(outputFile)) {
            for (String line : Files.readAllLines(outputFile, StandardCharsets.UTF_8)) {
                if (line.isBlank()) continue;
                Map<String,Object> row = BookEvalJson.object(line);
                if (!candidateFingerprint.equals(string(row,"candidate_fingerprint"))) throw new IllegalStateException("cannot resume after candidate fingerprint drift");
                completed.add(string(row,"case_id"));
            }
        }

        HttpClient client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();
        int added = 0;
        for (BookEvalProviderV2.VisibleCase c : byId.values()) {
            if (completed.contains(c.caseId())) continue;
            List<String> allowed = ontology.get(c.taskMode());
            if (allowed == null) throw new IllegalStateException("missing task-mode ontology " + c.taskMode());
            String prompt = BookEvalRepair004PromptPolicy.systemPrompt(c.taskMode(), allowed);
            Parsed parsed = call(client, endpoint, model, maxOutputTokens, temperature, timeout, maxAttempts, c, allowed, prompt);
            LinkedHashMap<String,Object> row = new LinkedHashMap<>();
            row.put("case_id", c.caseId());
            row.put("task_mode", c.taskMode());
            row.put("subject_digest", c.subjectDigest());
            row.put("candidate_id", CANDIDATE_ID);
            row.put("candidate_fingerprint", candidateFingerprint);
            row.put("policy_version", BookEvalRepair004PromptPolicy.VERSION);
            row.put("provider_request_id", parsed.requestId());
            row.put("returned_model", parsed.returnedModel());
            row.put("raw_response_sha256", BookLabStateStore.sha256(parsed.rawEnvelope()));
            row.put("attempt_count", parsed.attempt());
            row.put("aggregate", responseMap(parsed.response()));
            Files.writeString(outputFile, BookEvalJson.encode(row) + "\n", StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            completed.add(c.caseId());
            added++;
            System.out.println("REPAIR-004 committed " + completed.size() + "/48 case=" + c.caseId());
        }

        if (completed.size() != 48) throw new IllegalStateException("visible run incomplete: " + completed.size());
        LinkedHashMap<String,Object> status = new LinkedHashMap<>();
        status.put("objective", "BOOK-EVAL-LEMONADE-001-REPAIR-004");
        status.put("runner_version", RUNNER_VERSION);
        status.put("state", "VISIBLE_REGRESSION_OUTPUTS_FROZEN");
        status.put("candidate_id", CANDIDATE_ID);
        status.put("candidate_fingerprint", candidateFingerprint);
        status.put("policy_version", BookEvalRepair004PromptPolicy.VERSION);
        status.put("selected_cases", 48);
        status.put("completed_cases", completed.size());
        status.put("added_this_run", added);
        status.put("scoring_private_accessed", false);
        status.put("output_sha256", BookLabStateStore.sha256(Files.readString(outputFile, StandardCharsets.UTF_8)));
        Files.writeString(statusFile, BookEvalJson.encode(status) + "\n", StandardCharsets.UTF_8);
        System.out.println("BOOK-EVAL-REPAIR-004 VISIBLE FROZEN " + BookEvalJson.encode(status));
    }

    private static Parsed call(HttpClient client, URI endpoint, String model, int maxOutputTokens, double temperature,
            Duration timeout, int maxAttempts, BookEvalProviderV2.VisibleCase c, List<String> allowed, String prompt) throws Exception {
        LinkedHashMap<String,Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("input", prompt + "\n\n" + userPrompt(c));
        request.put("max_output_tokens", maxOutputTokens);
        request.put("temperature", temperature);
        request.put("stream", false);
        String body = BookEvalJson.encode(request);
        Exception last = null;
        for (int attempt=1; attempt<=maxAttempts; attempt++) {
            try {
                HttpRequest req = HttpRequest.newBuilder(endpoint).timeout(timeout).header("Content-Type","application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
                HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (res.statusCode() < 200 || res.statusCode() >= 300) throw new IOException("HTTP " + res.statusCode());
                return parse(c, allowed, res.body(), attempt);
            } catch (IOException | InterruptedException | RuntimeException e) {
                if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                last = e;
                if (attempt == maxAttempts) break;
                Thread.sleep(Math.min(500L * attempt, 1500L));
            }
        }
        throw new IllegalStateException("provider failed after " + maxAttempts + " attempts for " + c.caseId(), last);
    }

    private static Parsed parse(BookEvalProviderV2.VisibleCase c, List<String> allowedList, String raw, int attempt) {
        Map<String,Object> root = BookEvalJson.object(raw);
        if (!"completed".equals(string(root,"status"))) throw new IllegalArgumentException("provider not completed");
        String requestId = string(root,"id");
        String returnedModel = string(root,"model");
        String outputText = findOutputText(root);
        if (outputText == null) throw new IllegalArgumentException("missing output_text");
        Map<String,Object> out = BookEvalJson.object(outputText);
        if (!c.caseId().equals(string(out,"case_id"))) throw new IllegalArgumentException("case binding mismatch");
        if (!c.subjectDigest().equalsIgnoreCase(string(out,"subject_digest"))) throw new IllegalArgumentException("subject binding mismatch");
        Set<String> allowed = Set.copyOf(allowedList);
        BookEvaluationModel.EvaluationResponse response = decode(out);
        if (!allowed.contains(response.primaryFinding())) throw new IllegalArgumentException("primary outside ontology");
        for (String f : response.findings()) if (!allowed.contains(f)) throw new IllegalArgumentException("finding outside ontology");
        if (response.confidence() < 0.0 || response.confidence() > 1.0) throw new IllegalArgumentException("confidence");
        return new Parsed(requestId, returnedModel, raw, attempt, response);
    }

    private static BookEvaluationModel.EvaluationResponse decode(Map<String,Object> out) {
        String primary = token(string(out,"primary_finding"));
        Set<String> findings = tokenSet(out.get("findings"));
        Severity severity = Severity.valueOf(token(string(out,"severity")));
        Set<String> evidence = stringSet(out.get("evidence_refs"));
        Map<String,Object> pm = object(out.get("preservation"));
        EnumMap<PreservationDimension,PreservationState> preservation = new EnumMap<>(PreservationDimension.class);
        for (PreservationDimension d : PreservationDimension.values()) preservation.put(d, PreservationState.valueOf(token(string(pm,d.name()))));
        return new BookEvaluationModel.EvaluationResponse(primary, findings, severity, evidence, preservation,
                bool(out,"no_material_problem"), bool(out,"review_required"), number(out,"confidence"));
    }

    private static String candidateFingerprint(String model, URI endpoint, int maxOutputTokens, double temperature,
            Map<String,List<String>> ontology, String identityJson) {
        StringBuilder b = new StringBuilder();
        b.append("candidate=").append(CANDIDATE_ID).append('\n');
        b.append("policy=").append(BookEvalRepair004PromptPolicy.VERSION).append('\n');
        b.append("model=").append(model).append('\n');
        b.append("endpoint=").append(endpoint).append('\n');
        b.append("max_output_tokens=").append(maxOutputTokens).append('\n');
        b.append("temperature=").append(temperature).append('\n');
        b.append("identity_sha256=").append(BookLabStateStore.sha256(identityJson)).append('\n');
        b.append("ontology_sha256=").append(BookLabStateStore.sha256(BookEvalJson.encode(new TreeMap<>(ontology)))).append('\n');
        for (String mode : MODES) b.append(mode).append("_prompt_sha256=")
                .append(BookLabStateStore.sha256(BookEvalRepair004PromptPolicy.systemPrompt(mode, ontology.get(mode)))).append('\n');
        return BookLabStateStore.sha256(b.toString());
    }

    private static LinkedHashMap<String,Object> responseMap(BookEvaluationModel.EvaluationResponse r) {
        LinkedHashMap<String,Object> p = new LinkedHashMap<>();
        for (PreservationDimension d : PreservationDimension.values()) p.put(d.name(), r.preservation().get(d).name());
        LinkedHashMap<String,Object> m = new LinkedHashMap<>();
        m.put("primary_finding", r.primaryFinding());
        m.put("findings", new ArrayList<>(r.findings()));
        m.put("severity", r.severity().name());
        m.put("evidence_refs", new ArrayList<>(r.evidenceRefs()));
        m.put("preservation", p);
        m.put("no_material_problem", r.noMaterialProblem());
        m.put("review_required", r.reviewRequired());
        m.put("confidence", r.confidence());
        return m;
    }

    private static String userPrompt(BookEvalProviderV2.VisibleCase c) {
        return "CASE_ID=" + c.caseId() + "\nTASK_MODE=" + c.taskMode() + "\nSUBJECT_DIGEST=" + c.subjectDigest()
                + "\nPAYLOAD_BEGIN\n" + c.inputText() + "\nPAYLOAD_END";
    }

    private static Set<String> referenceLabels(String inputText) {
        int i = inputText.lastIndexOf("REFERENCE_LABELS:");
        if (i < 0) throw new IllegalArgumentException("missing REFERENCE_LABELS");
        String tail = inputText.substring(i + "REFERENCE_LABELS:".length()).trim();
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : tail.split(",")) {
            String q = s.trim();
            if (!q.isEmpty()) out.add(q);
        }
        return Set.copyOf(out);
    }

    private static String findOutputText(Map<String,Object> root) {
        Object o = root.get("output");
        if (!(o instanceof List<?> items)) return null;
        for (Object item : items) {
            if (!(item instanceof Map<?,?> m) || !"message".equals(m.get("type"))) continue;
            Object c = m.get("content");
            if (!(c instanceof List<?> parts)) continue;
            for (Object part : parts) {
                if (part instanceof Map<?,?> p && "output_text".equals(p.get("type")) && p.get("text") instanceof String s) return s;
            }
        }
        return null;
    }

    private static String env(String key, String def) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? def : v;
    }
    private static int intEnv(String key, int def, int min, int max) {
        int v = Integer.parseInt(env(key, Integer.toString(def)));
        if (v < min || v > max) throw new IllegalArgumentException(key);
        return v;
    }
    private static double doubleEnv(String key, double def, double min, double max) {
        double v = Double.parseDouble(env(key, Double.toString(def)));
        if (!Double.isFinite(v) || v < min || v > max) throw new IllegalArgumentException(key);
        return v;
    }
    private static String string(Map<String,Object> m, String key) {
        Object v = m.get(key);
        if (!(v instanceof String s) || s.isBlank()) throw new IllegalArgumentException(key);
        return s;
    }
    private static boolean bool(Map<String,Object> m, String key) {
        Object v = m.get(key);
        if (!(v instanceof Boolean b)) throw new IllegalArgumentException(key);
        return b;
    }
    private static double number(Map<String,Object> m, String key) {
        Object v = m.get(key);
        if (!(v instanceof Number n)) throw new IllegalArgumentException(key);
        double d = n.doubleValue();
        if (!Double.isFinite(d)) throw new IllegalArgumentException(key);
        return d;
    }
    @SuppressWarnings("unchecked")
    private static Map<String,Object> object(Object v) {
        if (!(v instanceof Map<?,?> m)) throw new IllegalArgumentException("object");
        return (Map<String,Object>)m;
    }
    private static Set<String> stringSet(Object v) {
        if (!(v instanceof List<?> l)) throw new IllegalArgumentException("array");
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (Object x : l) {
            if (!(x instanceof String s) || s.isBlank()) throw new IllegalArgumentException("array item");
            out.add(s);
        }
        return Set.copyOf(out);
    }
    private static Set<String> tokenSet(Object v) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : stringSet(v)) out.add(token(s));
        return Set.copyOf(out);
    }
    private static String token(String s) {
        if (!s.matches("[A-Z0-9_]+")) throw new IllegalArgumentException("token");
        return s;
    }

    private record Parsed(String requestId, String returnedModel, String rawEnvelope, int attempt,
            BookEvaluationModel.EvaluationResponse response) {
        Parsed {
            Objects.requireNonNull(requestId); Objects.requireNonNull(returnedModel); Objects.requireNonNull(rawEnvelope); Objects.requireNonNull(response);
        }
    }
}
