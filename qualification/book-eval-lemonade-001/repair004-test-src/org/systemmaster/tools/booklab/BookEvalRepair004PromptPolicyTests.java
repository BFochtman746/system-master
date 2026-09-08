package org.systemmaster.tools.booklab;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class BookEvalRepair004PromptPolicyTests {
    private static int assertions;
    private BookEvalRepair004PromptPolicyTests() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("ontology-json");
        Map<String,java.util.List<String>> ontology = OpenAiResponsesBookEvaluatorV2.ontologyFromJson(
                Files.readString(Path.of(args[0]), StandardCharsets.UTF_8));
        String md = BookEvalRepair004PromptPolicy.systemPrompt("MANUSCRIPT_DIAGNOSIS", ontology.get("MANUSCRIPT_DIAGNOSIS"));
        String pair = BookEvalRepair004PromptPolicy.systemPrompt("PAIRWISE_COMPARISON", ontology.get("PAIRWISE_COMPARISON"));
        String rev = BookEvalRepair004PromptPolicy.systemPrompt("REVISION_ASSESSMENT", ontology.get("REVISION_ASSESSMENT"));
        ok(md.contains(BookEvalRepair004PromptPolicy.VERSION), "version marker");
        ok(md.contains("MISSING_ARGUMENT_MECHANISM = recommendation/conclusion lacks a mechanism"), "argument-vs-causal boundary");
        ok(md.contains("IDENTITY_ATTRIBUTE_CONTRADICTION = incompatible stable person/identity attribute"), "identity boundary");
        ok(md.contains("SOURCE_SUPPORT_CONFLICT = a claim misstates or conflicts with what a supplied source actually supports"), "source boundary");
        ok(md.contains("ORACLE_SUPPORTED = a proposed assessment is supported"), "oracle supported boundary");
        ok(md.contains("STALE_SUBJECT_BINDING = a prior receipt/evaluation is reused after"), "staleness boundary");
        ok(md.contains("NO_MATERIAL_PROBLEM only when"), "clean restraint");
        ok(pair.contains("LEGITIMATE_TRADEOFF = BOTH satisfy all stated constraints"), "tradeoff boundary");
        ok(pair.contains("OBJECTIVELY_SUPERIOR_A / OBJECTIVELY_SUPERIOR_B"), "objective superiority boundary");
        ok(rev.contains("SAFE_EDIT = wording changed but all governing meaning"), "safe edit boundary");
        ok(rev.contains("MEANING_PRESERVATION_DAMAGE = edited wording changes proposition"), "meaning boundary");
        ok(rev.contains("VOICE_PRESERVATION_DAMAGE = edited wording materially breaks"), "voice boundary");
        for (String token : ontology.get("PAIRWISE_COMPARISON")) ok(pair.contains(token), "pair allowed token " + token);
        ok(!md.contains("HIDDEN_HOLDOUT"), "no hidden split value in prompt");
        ok(!md.contains("BQE2-"), "no case-specific training answer in prompt");
        System.out.println("BOOK-EVAL-REPAIR-004 PROMPT POLICY PASS assertions=" + assertions);
        System.out.println("md_sha256=" + BookLabStateStore.sha256(md));
        System.out.println("pair_sha256=" + BookLabStateStore.sha256(pair));
        System.out.println("revision_sha256=" + BookLabStateStore.sha256(rev));
    }

    private static void ok(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }
}
