package org.systemmaster.tools.booklab;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Non-mutating single-call diagnostic for the first missing E5 case. */
public final class BookEvalLemonadeAdapterDiagnostic003 {
    private static final List<String> SPLITS = List.of("DEVELOPMENT", "VISIBLE_REGRESSION", "HIDDEN_HOLDOUT");

    private BookEvalLemonadeAdapterDiagnostic003() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 6) {
            throw new IllegalArgumentException("usage: <corpus> <ontology> <execution> <e5-frozen> <runtime-identity> <raw-response-out>");
        }
        Path corpus = Path.of(args[0]);
        Path ontologyPath = Path.of(args[1]);
        Path execution = Path.of(args[2]);
        Path e5 = Path.of(args[3]);
        Path runtimeIdentityPath = Path.of(args[4]);
        Path rawOut = Path.of(args[5]);

        List<BookEvalProviderV2.VisibleCase> cases = BookEvalProvider001AV2BlindRun.readInput(corpus);
        Set<String> existing = new HashSet<>();
        for (String line : Files.readAllLines(e5, StandardCharsets.UTF_8)) {
            if (line.isBlank()) continue;
            Map<String,Object> row = BookEvalJson.object(line);
            existing.add(requireString(row, "case_id"));
        }
        if (existing.size() != 117) throw new IllegalStateException("expected exactly 117 existing E5 cases, got " + existing.size());

        Map<String,String> splitByCase = new HashMap<>();
        Map<String,Object> execRoot = BookEvalJson.object(Files.readString(execution, StandardCharsets.UTF_8));
        Object rawCases = execRoot.get("cases");
        if (!(rawCases instanceof List<?> rows)) throw new IllegalArgumentException("execution cases");
        for (Object rowObj : rows) {
            if (!(rowObj instanceof Map<?,?> rawMap)) throw new IllegalArgumentException("execution row");
            @SuppressWarnings("unchecked") Map<String,Object> row = (Map<String,Object>) rawMap;
            splitByCase.put(requireString(row,"case_id"), requireString(row,"split"));
        }

        BookEvalProviderV2.VisibleCase target = null;
        outer:
        for (String split : SPLITS) {
            for (BookEvalProviderV2.VisibleCase c : cases) {
                if (split.equals(splitByCase.get(c.caseId())) && !existing.contains(c.caseId())) {
                    target = c;
                    break outer;
                }
            }
        }
        if (target == null) throw new IllegalStateException("no missing E5 case found");

        Map<String,List<String>> ontology = OpenAiResponsesBookEvaluatorV2.ontologyFromJson(Files.readString(ontologyPath, StandardCharsets.UTF_8));
        String model = System.getenv().getOrDefault("BOOK_EVAL_MODEL", "user.gpt-oss-120b-MXFP4");
        URI endpoint = URI.create(System.getenv().getOrDefault("BOOK_EVAL_ENDPOINT", "http://127.0.0.1:13305/v1/responses"));
        BookEvalProvider.ProviderConfig config = new BookEvalProvider.ProviderConfig(
                "LEMONADE_LOCAL", endpoint, "LEMONADE_API_KEY", model, "provider-native",
                Duration.ofSeconds(180), 1,
                LemonadeResponsesBookEvaluatorV2.SYSTEM_PROMPT_VERSION,
                LemonadeResponsesBookEvaluatorV2.SCHEMA_VERSION, false);
        String runtimeIdentity = Files.readString(runtimeIdentityPath, StandardCharsets.UTF_8);
        LemonadeResponsesBookEvaluatorV2 provider = new LemonadeResponsesBookEvaluatorV2(config, ontology, runtimeIdentity);
        String prompt = provider.systemPrompt("E5-DIAGNOSIS", target.taskMode());
        String body = provider.requestBody(target, prompt);

        System.out.println("diagnostic_case_id=" + target.caseId());
        System.out.println("diagnostic_task_mode=" + target.taskMode());
        System.out.println("diagnostic_architecture=E5-DIAGNOSIS");
        System.out.println("request_body_sha256=" + BookLabStateStore.sha256(body));

        HttpRequest request = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(180))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        Files.writeString(rawOut, response.body(), StandardCharsets.UTF_8);
        System.out.println("http_status=" + response.statusCode());
        System.out.println("raw_response_sha256=" + BookLabStateStore.sha256(response.body()));
        System.out.println("raw_response_bytes=" + response.body().getBytes(StandardCharsets.UTF_8).length);
        if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IllegalStateException("provider HTTP " + response.statusCode());
    }

    private static String requireString(Map<String,Object> map, String key) {
        Object v = map.get(key);
        if (!(v instanceof String s) || s.isBlank()) throw new IllegalArgumentException(key);
        return s;
    }
}
