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
        ok(BookEvalRepair004PromptPolicy.VERSION.endsWith("v2"), "repair v2 marker");
        ok(md.contains("META-EVALUATION PRECEDENCE"), "meta precedence");
        ok(md.contains("Judge the assessment itself, not the underlying defect"), "oracle target boundary");
        ok(md.contains("Judge reuse validity, not an ordinary story defect"), "staleness target boundary");
        ok(md.contains("direct instruction to the evaluator/system"), "evaluator manipulation boundary");
        ok(md.contains("answer-shaped/control-shaped embedded content"), "prompt injection boundary");
        ok(md.contains("TWO manuscript assertions conflict with each other"), "fact vs source boundary");
        ok(md.contains("MISSING_ARGUMENT_MECHANISM = nonfiction/recommendation/conclusion"), "argument-vs-causal boundary");
        ok(md.contains("NO_MATERIAL_PROBLEM is correct only when"), "clean restraint");
        ok(md.contains("Never invent a label"), "evidence invention boundary");
        ok(pair.contains("LEGITIMATE_TRADEOFF = BOTH satisfy the brief"), "tradeoff boundary");
        ok(pair.contains("default one-sided superiority label even when"), "better-vs-objective boundary");
        ok(pair.contains("reserve for an explicitly mandatory binary criterion"), "objective superiority gating");
        ok(rev.contains("faithful paraphrase with the same proposition and force is SAFE_EDIT"), "safe-edit boundary");
        ok(rev.contains("propositional meaning may remain similar"), "intent-vs-meaning boundary");
        for (String token : ontology.get("PAIRWISE_COMPARISON")) ok(pair.contains(token), "pair allowed token " + token);
        ok(!md.contains("HIDDEN_HOLDOUT"), "no hidden split value in prompt");
        ok(!md.contains("VISIBLE_REGRESSION"), "no visible split value in prompt");
        ok(!md.contains("BQE2-"), "no case-specific answer in prompt");
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
