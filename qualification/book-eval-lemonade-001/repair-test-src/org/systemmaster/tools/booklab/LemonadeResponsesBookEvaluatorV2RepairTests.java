package org.systemmaster.tools.booklab;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class LemonadeResponsesBookEvaluatorV2RepairTests {
    private static int assertions;
    private LemonadeResponsesBookEvaluatorV2RepairTests() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("corpus ontology runtimeIdentity");
        var cases = BookEvalProvider001AV2BlindRun.readInput(Path.of(args[0]));
        var ontology = OpenAiResponsesBookEvaluatorV2.ontologyFromJson(Files.readString(Path.of(args[1]), StandardCharsets.UTF_8));
        var runtime = Files.readString(Path.of(args[2]), StandardCharsets.UTF_8);
        var cfg = new BookEvalProvider.ProviderConfig("LEMONADE_LOCAL", URI.create("http://127.0.0.1:13305/v1/responses"),
                "LEMONADE_API_KEY", "user.gpt-oss-120b-MXFP4", "provider-native", Duration.ofSeconds(180), 3,
                LemonadeResponsesBookEvaluatorV2.SYSTEM_PROMPT_VERSION, LemonadeResponsesBookEvaluatorV2.SCHEMA_VERSION, false);

        var p = new LemonadeResponsesBookEvaluatorV2(cfg, Map.of(), new FakeTransport(), ontology, runtime);
        ok(BookEvalRealCandidateArchitecturesV2.fingerprintE4(p).equals("7e7e7588138081f9ac3eaca75229934c137307927ac5ea0529ea800d601e03fc"), "E4 candidate fingerprint preserved");
        ok(BookEvalRealCandidateArchitecturesV2.fingerprintE5(p).equals("3d275e96b5b231fdc2ab08eac70486cb7d4f858e25143fd404a5e039c431f598"), "E5 repaired candidate fingerprint fixed");

        Map<String,String> e4PromptSha = Map.of(
                "MANUSCRIPT_DIAGNOSIS", "a19c00778fd4fad476fe5b4d04bfcb72ae8dc422c0d6f908d39fc829f18a24b8",
                "REVISION_ASSESSMENT", "cde45b0171df43c4077f3cf43f76ca1eff1d9597d7c7a685ee7b92dcb3d97fd7",
                "PAIRWISE_COMPARISON", "b2ff8ebe522171d76d5187d756a5cd77a7ad4d8163bea4cbecdb68863c2ab1f2");
        for (String mode : e4PromptSha.keySet()) {
            ok(BookLabStateStore.sha256(p.systemPrompt("E4-TASK-SPECIALIST", mode)).equals(e4PromptSha.get(mode)), "E4 prompt byte identity " + mode);
            String repaired = p.systemPrompt("E5-DIAGNOSIS", mode);
            ok(repaired.contains("BOOK-EVAL-LEMONADE-E5-TOKEN-CONTRACT-REPAIR-v1"), "repair marker " + mode);
            ok(repaired.contains("NEVER put explanation, rationale, sentences"), "findings prose forbidden " + mode);
            ok(repaired.contains("evidence_refs MUST contain only individual exact labels"), "evidence label contract " + mode);
        }
        String md = p.systemPrompt("E5-DIAGNOSIS", "MANUSCRIPT_DIAGNOSIS");
        String rev = p.systemPrompt("E5-DIAGNOSIS", "REVISION_ASSESSMENT");
        String pair = p.systemPrompt("E5-DIAGNOSIS", "PAIRWISE_COMPARISON");
        ok(md.contains("For a clean case use NO_MATERIAL_PROBLEM"), "MD clean guidance present");
        ok(!md.contains("For a legitimate preference tradeoff use LEGITIMATE_TRADEOFF"), "MD tradeoff guidance absent");
        ok(rev.contains("For a clean case use NO_MATERIAL_PROBLEM"), "REV clean guidance present");
        ok(!rev.contains("For a legitimate preference tradeoff use LEGITIMATE_TRADEOFF"), "REV tradeoff guidance absent");
        ok(!pair.contains("For a clean case use NO_MATERIAL_PROBLEM"), "PAIR clean guidance absent");
        ok(pair.contains("For a legitimate preference tradeoff use LEGITIMATE_TRADEOFF"), "PAIR tradeoff guidance present");

        BookEvalProviderV2.VisibleCase c = cases.stream().filter(x -> x.taskMode().equals("PAIRWISE_COMPARISON")).findFirst().orElseThrow();
        var invalid = new FakeTransport();
        for(int i=0;i<3;i++) invalid.add(200, envelope(c, "LEGITIMATE_TRADEOFF", List.of("Natural language rationale is not a token."), List.of("CANDIDATE_A")));
        var invalidProvider = new LemonadeResponsesBookEvaluatorV2(cfg, Map.of(), invalid, ontology, runtime);
        var ex = expect(BookEvalProvider.ProviderException.class, () -> invalidProvider.evaluate(c,"E5-DIAGNOSIS"), "prose findings fail closed");
        ok(ex.failureClass() == BookEvalProvider.FailureClass.INVALID_RESPONSE, "prose findings invalid response");

        var badEvidence = new FakeTransport();
        for(int i=0;i<3;i++) badEvidence.add(200, envelope(c, "LEGITIMATE_TRADEOFF", List.of("LEGITIMATE_TRADEOFF"), List.of("Candidate A and B")));
        var badEvidenceProvider = new LemonadeResponsesBookEvaluatorV2(cfg, Map.of(), badEvidence, ontology, runtime);
        var ee = expect(BookEvalProvider.ProviderException.class, () -> badEvidenceProvider.evaluate(c,"E5-DIAGNOSIS"), "prose evidence fail closed");
        ok(ee.failureClass() == BookEvalProvider.FailureClass.INVALID_RESPONSE, "prose evidence invalid response");

        var good = new FakeTransport();
        good.add(200, envelope(c, "LEGITIMATE_TRADEOFF", List.of("LEGITIMATE_TRADEOFF"), List.of("CANDIDATE_A","CANDIDATE_B")));
        var goodProvider = new LemonadeResponsesBookEvaluatorV2(cfg, Map.of(), good, ontology, runtime);
        var observation = goodProvider.evaluate(c,"E5-DIAGNOSIS");
        ok(observation.response().primaryFinding().equals("LEGITIMATE_TRADEOFF"), "canonical token response accepted");
        ok(observation.response().findings().equals(java.util.Set.of("LEGITIMATE_TRADEOFF")), "canonical findings preserved");

        System.out.println("BOOK-EVAL-LEMONADE-E5-ADAPTER-REPAIR PASS assertions=" + assertions);
    }

    private static String envelope(BookEvalProviderV2.VisibleCase c, String primary, List<String> findings, List<String> evidence) {
        LinkedHashMap<String,Object> preservation = new LinkedHashMap<>();
        for (BookEvaluationModel.PreservationDimension d : BookEvaluationModel.PreservationDimension.values()) preservation.put(d.name(), "PRESERVED");
        LinkedHashMap<String,Object> out = new LinkedHashMap<>();
        out.put("case_id", c.caseId()); out.put("subject_digest", c.subjectDigest()); out.put("primary_finding", primary);
        out.put("findings", findings); out.put("severity", "NONE"); out.put("evidence_refs", evidence); out.put("preservation", preservation);
        out.put("no_material_problem", false); out.put("review_required", true); out.put("confidence", 0.9);
        String text = BookEvalJson.encode(out);
        return BookEvalJson.encode(Map.of("id","diag","model","user.gpt-oss-120b-MXFP4","status","completed",
                "output", List.of(Map.of("type","message","content",List.of(Map.of("type","output_text","text",text))))));
    }

    private static final class FakeTransport implements LemonadeResponsesBookEvaluatorV2.Transport {
        private final ArrayDeque<LemonadeResponsesBookEvaluatorV2.HttpResult> queue = new ArrayDeque<>();
        void add(int status, String body) { queue.add(new LemonadeResponsesBookEvaluatorV2.HttpResult(status, body)); }
        @Override public LemonadeResponsesBookEvaluatorV2.HttpResult exchange(URI u, Map<String,String> h, String b, Duration d) throws IOException {
            if (queue.isEmpty()) throw new IOException("empty fake queue");
            return queue.removeFirst();
        }
    }

    private static <T extends Throwable> T expect(Class<T> type, Throwing body, String message) {
        assertions++;
        try { body.run(); } catch (Throwable e) {
            if (type.isInstance(e)) return type.cast(e);
            throw new AssertionError(message + " wrong exception " + e, e);
        }
        throw new AssertionError(message + " did not throw");
    }
    private static void ok(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    @FunctionalInterface private interface Throwing { void run() throws Exception; }
}
