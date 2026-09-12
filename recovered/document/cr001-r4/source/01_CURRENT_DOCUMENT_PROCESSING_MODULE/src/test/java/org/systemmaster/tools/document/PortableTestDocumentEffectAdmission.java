package org.systemmaster.tools.document;

import org.systemmaster.tools.document.spine.DocumentEffectAdmissionDecision;
import org.systemmaster.tools.document.spine.DocumentEffectAdmissionProvider;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;

/** Qualifier-only explicit effect-admission provider. Never production authority. */
public final class PortableTestDocumentEffectAdmission {
    private static final String POLICY_REVISION = "documents-portable-test-effect-policy-r1";
    private static final String POLICY_DIGEST = sha("documents-portable-test-effect-policy-r1");

    private PortableTestDocumentEffectAdmission() {
    }

    public static DocumentEffectAdmissionProvider provider(Clock clock) {
        Objects.requireNonNull(clock, "clock");
        return (job, plan, sourceGraph) -> new DocumentEffectAdmissionDecision(
                DocumentEffectAdmissionDecision.SCHEMA_V1,
                "portable-test-effect-" + job.jobId(),
                DocumentEffectAdmissionDecision.Disposition.ALLOW,
                job.jobId(),
                job.mode(),
                sourceGraph.sourceSha256(),
                sourceGraph.semanticDigest(),
                plan.operation().intentDigest(),
                plan.digest(),
                DocumentEffectAdmissionDecision.capabilitySetDigest(plan),
                POLICY_REVISION,
                POLICY_DIGEST,
                "PORTABLE_TEST_ONLY_EXPLICIT_ALLOW",
                Instant.now(clock));
    }

    private static String sha(String material) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
