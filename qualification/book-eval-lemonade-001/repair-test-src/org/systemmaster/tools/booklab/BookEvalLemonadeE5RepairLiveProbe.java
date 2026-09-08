package org.systemmaster.tools.booklab;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

/** Executes one repaired E5 candidate evaluation without reading or writing blind state. */
public final class BookEvalLemonadeE5RepairLiveProbe {
    private BookEvalLemonadeE5RepairLiveProbe() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("corpus ontology runtimeIdentity");
        var cases = BookEvalProvider001AV2BlindRun.readInput(Path.of(args[0]));
        var target = cases.stream().filter(c -> c.caseId().equals("BQE2-C114B550AACD1212")).findFirst().orElseThrow();
        if (!target.taskMode().equals("PAIRWISE_COMPARISON")) throw new IllegalStateException("target task mode drift");
        var ontology = OpenAiResponsesBookEvaluatorV2.ontologyFromJson(Files.readString(Path.of(args[1]), StandardCharsets.UTF_8));
        var runtime = Files.readString(Path.of(args[2]), StandardCharsets.UTF_8);
        var cfg = new BookEvalProvider.ProviderConfig("LEMONADE_LOCAL", URI.create("http://127.0.0.1:13305/v1/responses"),
                "LEMONADE_API_KEY", "user.gpt-oss-120b-MXFP4", "provider-native", Duration.ofSeconds(180), 3,
                LemonadeResponsesBookEvaluatorV2.SYSTEM_PROMPT_VERSION, LemonadeResponsesBookEvaluatorV2.SCHEMA_VERSION, false);
        var provider = new LemonadeResponsesBookEvaluatorV2(cfg, ontology, runtime);
        String e4 = BookEvalRealCandidateArchitecturesV2.fingerprintE4(provider);
        String e5 = BookEvalRealCandidateArchitecturesV2.fingerprintE5(provider);
        if (!e4.equals("7e7e7588138081f9ac3eaca75229934c137307927ac5ea0529ea800d601e03fc")) throw new IllegalStateException("E4 fingerprint drift");
        if (!e5.equals("3d275e96b5b231fdc2ab08eac70486cb7d4f858e25143fd404a5e039c431f598")) throw new IllegalStateException("E5 repaired fingerprint drift");

        var observed = BookEvalRealCandidateArchitecturesV2.evaluateE5(provider, target);
        if (!observed.fingerprint().equals(e5)) throw new IllegalStateException("candidate observation fingerprint mismatch");
        if (observed.members().size() != 4) throw new IllegalStateException("pairwise E5 must have four members");
        System.out.println("qualification=PASS_REPAIRED_E5_LIVE_PROBE");
        System.out.println("case_id=" + target.caseId());
        System.out.println("task_mode=" + target.taskMode());
        System.out.println("e4_fingerprint_preserved=" + e4);
        System.out.println("e5_repaired_fingerprint=" + e5);
        System.out.println("member_count=" + observed.members().size());
        for (var member : observed.members()) {
            System.out.println("member=" + member.architectureId()
                    + " primary=" + member.response().primaryFinding()
                    + " findings=" + member.response().findings()
                    + " evidence=" + member.response().evidenceRefs());
        }
        System.out.println("aggregate_primary=" + observed.aggregate().primaryFinding());
        System.out.println("aggregate_findings=" + observed.aggregate().findings());
        System.out.println("aggregate_evidence=" + observed.aggregate().evidenceRefs());
        System.out.println("position_stable=" + observed.positionStable());
    }
}
