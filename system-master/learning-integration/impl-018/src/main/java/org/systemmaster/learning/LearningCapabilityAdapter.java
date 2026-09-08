package org.systemmaster.learning;

import org.systemmaster.learning.LearningExecutionPort.AuthorizedExecution;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

public final class LearningCapabilityAdapter {
    public static final String ADAPTER_VERSION = "SYSTEM-MASTER-LEARNING-ADAPTER-V3";

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");
    private static final Pattern SAFE_STATE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$");
    private static final Pattern SAFE_DOMAIN = Pattern.compile("^[a-z0-9][a-z0-9-]{0,95}$");
    private static final Pattern SAFE_SKILL = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$");

    public record LearningCommand(
            String requestId,
            String stateKey,
            String learnerId,
            String domainKey,
            Set<String> claimedSkillIds,
            long now) {
        public LearningCommand {
            require(requestId, "requestId", SAFE_ID);
            require(stateKey, "stateKey", SAFE_STATE);
            require(learnerId, "learnerId", SAFE_ID);
            require(domainKey, "domainKey", SAFE_DOMAIN);
            claimedSkillIds = Set.copyOf(Objects.requireNonNull(claimedSkillIds, "claimedSkillIds"));
            for (String skill : claimedSkillIds) require(skill, "claimedSkillId", SAFE_SKILL);
            if (now < 0) throw new IllegalArgumentException("INVALID_NOW");
        }

        public String toJson() {
            StringBuilder skills = new StringBuilder();
            boolean first = true;
            for (String skill : new TreeSet<>(claimedSkillIds)) {
                if (!first) skills.append(',');
                first = false;
                skills.append('"').append(escape(skill)).append('"');
            }
            return "{"+
                    "\"operation\":\"START_ADAPTIVE_ENTRY\","+
                    "\"request_id\":\""+escape(requestId)+"\","+
                    "\"state_key\":\""+escape(stateKey)+"\","+
                    "\"learner_id\":\""+escape(learnerId)+"\","+
                    "\"domain_key\":\""+escape(domainKey)+"\","+
                    "\"claimed_skill_ids\":["+skills+"],"+
                    "\"now\":"+now+
                    "}";
        }
    }

    public record LearningResult(
            String responseJson,
            String responseDigest,
            String adapterVersion,
            String executionPortVersion,
            String authorizationRef) {
        public LearningResult {
            if (responseJson == null || responseJson.isBlank()) throw new IllegalArgumentException("EMPTY_LEARNING_RESPONSE");
            if (responseDigest == null || responseDigest.isBlank()) throw new IllegalArgumentException("EMPTY_RESPONSE_DIGEST");
            if (!ADAPTER_VERSION.equals(adapterVersion)) throw new IllegalArgumentException("ADAPTER_VERSION_MISMATCH");
            if (!LearningExecutionPort.PORT_VERSION.equals(executionPortVersion)) throw new IllegalArgumentException("PORT_VERSION_MISMATCH");
            if (authorizationRef == null || authorizationRef.isBlank()) throw new IllegalArgumentException("AUTHORIZATION_REF_REQUIRED");
        }
    }

    @FunctionalInterface
    public interface BridgeInvoker {
        String invoke(String requestJson) throws Exception;
    }

    public static final class PythonBridgeInvoker implements BridgeInvoker {
        private final Path repositoryRoot;
        private final Path stateRoot;

        public PythonBridgeInvoker(Path repositoryRoot, Path stateRoot) {
            this.repositoryRoot = Objects.requireNonNull(repositoryRoot, "repositoryRoot").toAbsolutePath().normalize();
            this.stateRoot = Objects.requireNonNull(stateRoot, "stateRoot").toAbsolutePath().normalize();
        }

        @Override
        public String invoke(String requestJson) throws IOException, InterruptedException {
            ProcessBuilder builder = new ProcessBuilder("python", "learning/lab/system_master_bridge.py");
            builder.directory(repositoryRoot.toFile());
            builder.environment().put("SYSTEM_MASTER_LEARNING_STATE_ROOT", stateRoot.toString());
            Process process = builder.start();
            try (var stdin = process.getOutputStream()) {
                stdin.write(requestJson.getBytes(StandardCharsets.UTF_8));
            }
            byte[] stdout = process.getInputStream().readAllBytes();
            byte[] stderr = process.getErrorStream().readAllBytes();
            int rc = process.waitFor();
            String out = new String(stdout, StandardCharsets.UTF_8).trim();
            String err = new String(stderr, StandardCharsets.UTF_8).trim();
            if (rc != 0) throw new IllegalStateException("LEARNING_BRIDGE_EXIT_"+rc+":"+bounded(out+" "+err));
            return out;
        }
    }

    private final BridgeInvoker bridgeInvoker;

    public LearningCapabilityAdapter(BridgeInvoker bridgeInvoker) {
        this.bridgeInvoker = Objects.requireNonNull(bridgeInvoker, "bridgeInvoker");
    }

    public LearningResult execute(
            AuthorizedExecution authorization,
            String presentedPrincipalRef,
            Instant now,
            LearningCommand command) throws Exception {
        Objects.requireNonNull(now, "now");
        Objects.requireNonNull(command, "command");
        LearningExecutionPort.requireUsable(authorization, presentedPrincipalRef, now);

        String response = bridgeInvoker.invoke(command.toJson());
        if (!response.contains("\"status\":\"PASS\"")) {
            throw new IllegalStateException("LEARNING_BRIDGE_NONPASS:"+bounded(response));
        }
        return new LearningResult(
                response,
                sha256(response),
                ADAPTER_VERSION,
                LearningExecutionPort.PORT_VERSION,
                authorization.authorizationRef());
    }

    private static void require(String value, String name, Pattern pattern) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("REQUIRED:"+name);
        if (!pattern.matcher(value).matches()) throw new IllegalArgumentException("INVALID:"+name);
    }

    private static String escape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String bounded(String value) {
        String normalized = value == null ? "" : value.replace('\n', ' ').replace('\r', ' ');
        return normalized.length() <= 400 ? normalized : normalized.substring(0, 400);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
