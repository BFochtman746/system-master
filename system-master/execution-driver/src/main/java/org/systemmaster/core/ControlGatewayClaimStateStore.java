package org.systemmaster.core;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Production claim-state store whose writes cross the main-trusted Control Gateway writer.
 * Reads remain ordinary GitHub reads; every mutation is exact-predecessor CAS executed by
 * control-gateway-production-writer.yml with the dedicated writer App identity.
 */
public final class ControlGatewayClaimStateStore implements DurableDispatchCoordinator.Store {

    public record Response(int status, String body) { }
    public interface Transport {
        Response get(String url, Map<String, String> headers) throws Exception;
        Response post(String url, Map<String, String> headers, String body) throws Exception;
    }

    private record Snapshot(String headSha, String blobSha, DurableDispatchCoordinator.ClaimRecord record) { }
    private record Authority(String headSha, String missionVersion, String workstreamId, long epoch,
            String packetDigest, String subjectSha, String operationId, String predecessorReceiptId) { }

    private static final String API = "https://api.github.com";
    private static final String REQUEST_PROTOCOL = "control-gateway.github-mutation-request.v1";
    private static final String PLAN_PROTOCOL = "control-gateway.github-production-mutation-plan.v1";
    private static final String ACTIVE_WORK_PROTOCOL = "control-gateway.active-work.v1";
    private static final String CLAIM_STATE_MISSION_VERSION = "SECOND-SHIFT-CONTROL-GATEWAY-CG-001/v1.0";
    private static final String CLAIM_STATE_WORKSTREAM = "SECOND-SHIFT-DISPATCH-DURABILITY";
    private static final String CLAIM_STATE_OPERATION = "SECOND-SHIFT-DISPATCH-DURABILITY-003";
    private static final String CLAIM_STATE_PREDECESSOR_RECEIPT =
            "SECOND-SHIFT-DISPATCH-DURABILITY-003-AUTHORITY-BOOTSTRAP";
    private static final Pattern SHA1 = Pattern.compile("[0-9a-f]{40}");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern STRING_FIELD = Pattern.compile("\\\"([^\\\"]+)\\\"\\s*:\\s*(?:\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"|(null))");
    private static final Pattern NUMBER_FIELD = Pattern.compile("\\\"([^\\\"]+)\\\"\\s*:\\s*(-?[0-9]+)");

    private final Transport transport;
    private final ActionsDispatch.Credentials credentials;
    private final String owner;
    private final String repo;
    private final String stateRef;
    private final String root;
    private final String authorityRef;
    private final String writerWorkflow;
    private final String writerRef;
    private final String writerEffect;
    private final int pollAttempts;
    private final long pollDelayMillis;

    public ControlGatewayClaimStateStore(Transport transport, ActionsDispatch.Credentials credentials,
            String owner, String repo, String stateRef, String root, String authorityRef,
            String writerWorkflow, String writerRef, String writerEffect, int pollAttempts, long pollDelayMillis) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.owner = norm(owner);
        this.repo = norm(repo);
        this.stateRef = norm(stateRef);
        this.root = stripSlashes(norm(root));
        this.authorityRef = norm(authorityRef);
        this.writerWorkflow = norm(writerWorkflow);
        this.writerRef = norm(writerRef);
        this.writerEffect = norm(writerEffect);
        if (pollAttempts < 1) throw new IllegalArgumentException("INVALID_STATE_WRITER_POLL_ATTEMPTS");
        if (pollDelayMillis < 0) throw new IllegalArgumentException("INVALID_STATE_WRITER_POLL_DELAY");
        this.pollAttempts = pollAttempts;
        this.pollDelayMillis = pollDelayMillis;
    }

    public static ControlGatewayClaimStateStore fromEnvironment(Transport transport) {
        ActionsDispatch.RepoCoordinates c = ActionsDispatch.repoCoordinates();
        return new ControlGatewayClaimStateStore(transport, ActionsDispatch::ambientToken,
                c.owner(), c.repo(),
                env("CLAIM_STATE_REF", "second-shift/execution-state"),
                env("CLAIM_STATE_ROOT", "execution/claims/state"),
                env("CLAIM_STATE_AUTHORITY_REF", "control-gateway-state/active-work/second-shift-dispatch-durability-003"),
                env("CLAIM_STATE_WRITER_WORKFLOW", "control-gateway-production-writer.yml"),
                env("CLAIM_STATE_WRITER_REF", "main"),
                env("CLAIM_STATE_WRITE_EFFECT", "SECOND_SHIFT_CLAIM_STATE_WRITE"),
                envInt("CLAIM_STATE_WRITER_POLL_ATTEMPTS", 180),
                envLong("CLAIM_STATE_WRITER_POLL_DELAY_MILLIS", 1000L));
    }

    public static Transport httpTransport() {
        HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
        return new Transport() {
            public Response get(String url, Map<String, String> headers) throws Exception {
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).GET();
                for (Map.Entry<String, String> h : headers.entrySet()) b.header(h.getKey(), h.getValue());
                HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
                return new Response(r.statusCode(), r.body());
            }
            public Response post(String url, Map<String, String> headers, String body) throws Exception {
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
                for (Map.Entry<String, String> h : headers.entrySet()) b.header(h.getKey(), h.getValue());
                HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
                return new Response(r.statusCode(), r.body());
            }
        };
    }

    public void verifyStateRef() throws Exception {
        requireConfigured();
        if (!validRef(stateRef) || !validRef(authorityRef) || !validRef(writerRef)) {
            throw new IllegalStateException("STATE_STORE_INVALID_REF");
        }
        refSha(stateRef, "STATE_STORE_REF");
        loadAuthority();
    }

    @Override
    public DurableDispatchCoordinator.Versioned load(String claimId) throws Exception {
        requireText(claimId, "CLAIM_ID");
        requireConfigured();
        Response r = get(contentUrl(claimId) + "?ref=" + query(stateRef), headers(token()), "STATE_STORE_READ");
        return decodeVersioned(claimId, r, "STATE_STORE_READ");
    }

    @Override
    public DurableDispatchCoordinator.Versioned save(String expectedRevision,
            DurableDispatchCoordinator.ClaimRecord next) throws Exception {
        Objects.requireNonNull(next, "next");
        requireConfigured();
        if (expectedRevision != null) requireText(expectedRevision, "EXPECTED_REVISION");

        Snapshot before = snapshot(next.claimId());
        assertExpectedRevision(expectedRevision, before.blobSha());
        Authority authority = loadAuthority();
        String desired = next.toJson();
        String path = statePath(next.claimId());
        String contentDigest = sha256(desired);
        String mutationId = "CLAIM-STATE-" + sha256(next.claimId() + "\n" + before.headSha() + "\n" + contentDigest);
        String request = mutationRequest(authority, before.headSha(), path, mutationId);
        String plan = mutationPlan(before.headSha(), path, mutationId, next, desired, contentDigest);
        String dispatchBody = "{\"ref\":\"" + esc(writerRef) + "\",\"inputs\":{"
                + "\"state_ref\":\"" + esc(authorityRef) + "\","
                + "\"mutation_request_json\":\"" + esc(request) + "\","
                + "\"mutation_plan_json\":\"" + esc(plan) + "\"}}";

        boolean ambiguous = false;
        try {
            Response dispatched = transport.post(writerDispatchUrl(), headers(token()), dispatchBody);
            if (dispatched == null) throw new IllegalStateException("STATE_WRITER_DISPATCH_NO_RESPONSE");
            if (dispatched.status() != 204) {
                throw new IllegalStateException("STATE_WRITER_DISPATCH_REJECTED_" + dispatched.status());
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception transportFailure) {
            ambiguous = true;
        }

        for (int attempt = 0; attempt < pollAttempts; attempt++) {
            String currentHead = refSha(stateRef, "STATE_WRITER_RECONCILE_REF");
            if (!currentHead.equals(before.headSha())) {
                DurableDispatchCoordinator.Versioned applied = findAppliedMutation(
                        before.headSha(), currentHead, mutationId, next, desired);
                if (applied != null) return applied;
                throw new DurableDispatchCoordinator.CasConflictException("STATE_CAS_CONFLICT");
            }
            if (attempt + 1 < pollAttempts && pollDelayMillis > 0) Thread.sleep(pollDelayMillis);
        }
        if (ambiguous) throw new IllegalStateException("STATE_WRITER_DISPATCH_UNCERTAIN");
        throw new IllegalStateException("STATE_WRITER_RESULT_NOT_OBSERVED");
    }

    private DurableDispatchCoordinator.Versioned findAppliedMutation(String predecessor, String currentHead,
            String mutationId, DurableDispatchCoordinator.ClaimRecord next, String desired) throws Exception {
        String cursor = currentHead;
        for (int depth = 0; depth < 32 && !cursor.equals(predecessor); depth++) {
            Response commitResponse = get(API + "/repos/" + owner + "/" + repo + "/git/commits/" + cursor,
                    headers(token()), "STATE_WRITER_COMMIT_READ");
            if (commitResponse.status() != 200) {
                throw new IllegalStateException("STATE_WRITER_COMMIT_READ_REJECTED_" + commitResponse.status());
            }
            String message = requiredString(commitResponse.body(), "message", "STATE_WRITER_COMMIT_MISSING_MESSAGE");
            String parent = firstParent(commitResponse.body());
            if (message.contains("Control-Gateway-Mutation: " + mutationId)) {
                if (!parent.equals(predecessor)) throw new IllegalStateException("STATE_WRITER_MUTATION_PARENT_MISMATCH");
                DurableDispatchCoordinator.Versioned atMutation = loadAt(next.claimId(), cursor, "STATE_WRITER_RESULT_READ");
                if (atMutation == null || !desired.equals(atMutation.record().toJson())) {
                    throw new IllegalStateException("STATE_WRITER_RESULT_CONTENT_MISMATCH");
                }
                if (cursor.equals(currentHead)) return atMutation;
                DurableDispatchCoordinator.Versioned latest = loadAt(next.claimId(), currentHead, "STATE_WRITER_LATEST_READ");
                if (latest == null || !desired.equals(latest.record().toJson())) {
                    throw new DurableDispatchCoordinator.CasConflictException("STATE_CAS_CONFLICT");
                }
                return latest;
            }
            cursor = parent;
        }
        if (!cursor.equals(predecessor)) {
            throw new IllegalStateException("STATE_WRITER_RECONCILIATION_UNCERTAIN");
        }
        return null;
    }

    private Snapshot snapshot(String claimId) throws Exception {
        String head = refSha(stateRef, "STATE_STORE_REF");
        DurableDispatchCoordinator.Versioned value = loadAt(claimId, head, "STATE_STORE_SNAPSHOT_READ");
        return new Snapshot(head, value == null ? null : value.revision(), value == null ? null : value.record());
    }

    private DurableDispatchCoordinator.Versioned loadAt(String claimId, String ref, String phase) throws Exception {
        Response r = get(contentUrl(claimId) + "?ref=" + query(ref), headers(token()), phase);
        return decodeVersioned(claimId, r, phase);
    }

    private DurableDispatchCoordinator.Versioned decodeVersioned(String claimId, Response r, String phase) {
        if (r.status() == 404) return null;
        if (r.status() != 200) throw new IllegalStateException(phase + "_REJECTED_" + r.status());
        if (r.body() == null || r.body().isBlank()) throw new IllegalStateException(phase + "_INVALID_RESPONSE");
        String revision = requiredString(r.body(), "sha", phase + "_MISSING_SHA");
        String encoding = requiredString(r.body(), "encoding", phase + "_MISSING_ENCODING");
        if (!"base64".equals(encoding)) throw new IllegalStateException("STATE_STORE_UNSUPPORTED_ENCODING");
        String encoded = requiredString(r.body(), "content", phase + "_MISSING_CONTENT");
        String json = decodeBase64(encoded, "STATE_STORE_CORRUPT_BASE64");
        DurableDispatchCoordinator.ClaimRecord record = DurableDispatchCoordinator.ClaimRecord.fromJson(json);
        if (!claimId.equals(record.claimId())) throw new IllegalStateException("STATE_STORE_CLAIM_ID_MISMATCH");
        return new DurableDispatchCoordinator.Versioned(record, revision);
    }

    private Authority loadAuthority() throws Exception {
        String head = refSha(authorityRef, "STATE_AUTHORITY_REF");
        String url = API + "/repos/" + owner + "/" + repo + "/contents/control-gateway-state/active-work/head.json?ref=" + query(head);
        Response r = get(url, headers(token()), "STATE_AUTHORITY_READ");
        if (r.status() != 200) throw new IllegalStateException("STATE_AUTHORITY_READ_REJECTED_" + r.status());
        String envelope = decodeContentBody(r, "STATE_AUTHORITY_READ");
        String packet = objectField(envelope, "packet", "STATE_AUTHORITY_PACKET_MISSING");

        if (!ACTIVE_WORK_PROTOCOL.equals(requiredString(packet, "protocol_version", "STATE_AUTHORITY_PROTOCOL_MISSING"))) {
            throw new IllegalStateException("STATE_AUTHORITY_PROTOCOL_MISMATCH");
        }
        String mission = requiredString(packet, "mission_version", "STATE_AUTHORITY_MISSION_MISSING");
        if (!CLAIM_STATE_MISSION_VERSION.equals(mission)) {
            throw new IllegalStateException("STATE_AUTHORITY_MISSION_MISMATCH");
        }
        String workstream = requiredString(packet, "workstream_id", "STATE_AUTHORITY_WORKSTREAM_MISSING");
        if (!CLAIM_STATE_WORKSTREAM.equals(workstream)) {
            throw new IllegalStateException("STATE_AUTHORITY_WORKSTREAM_MISMATCH");
        }
        String repository = requiredString(packet, "repository", "STATE_AUTHORITY_REPOSITORY_MISSING");
        if (!(owner + "/" + repo).equals(repository)) {
            throw new IllegalStateException("STATE_AUTHORITY_REPOSITORY_MISMATCH");
        }
        String target = requiredString(packet, "branch_or_ref", "STATE_AUTHORITY_TARGET_MISSING");
        if (!stateRef.equals(target)) throw new IllegalStateException("STATE_AUTHORITY_TARGET_MISMATCH");
        long epoch = requiredLong(packet, "authority_epoch", "STATE_AUTHORITY_EPOCH_MISSING");
        if (epoch < 1) throw new IllegalStateException("STATE_AUTHORITY_EPOCH_INVALID");
        if (!"PASSED".equals(requiredString(packet, "qualification_state", "STATE_AUTHORITY_QUALIFICATION_MISSING"))) {
            throw new IllegalStateException("STATE_AUTHORITY_NOT_QUALIFIED");
        }
        if (!"ADMITTED".equals(requiredString(packet, "github_admission_state", "STATE_AUTHORITY_ADMISSION_MISSING"))) {
            throw new IllegalStateException("STATE_AUTHORITY_NOT_ADMITTED");
        }

        String allowed = objectField(packet, "allowed_paths_or_effects", "STATE_AUTHORITY_SCOPE_MISSING");
        requireExactSingleStringArray(allowed, "paths", root + "/**", "STATE_AUTHORITY_PATH_SCOPE_MISMATCH");
        requireExactSingleStringArray(allowed, "effects", writerEffect, "STATE_AUTHORITY_EFFECT_SCOPE_MISMATCH");

        String current = objectField(packet, "current_operation", "STATE_AUTHORITY_OPERATION_MISSING");
        if (!"ACTIVE".equals(requiredString(current, "state", "STATE_AUTHORITY_OPERATION_STATE_MISSING"))) {
            throw new IllegalStateException("STATE_AUTHORITY_OPERATION_NOT_ACTIVE");
        }
        String operation = requiredString(current, "operation_id", "STATE_AUTHORITY_OPERATION_ID_MISSING");
        if (!CLAIM_STATE_OPERATION.equals(operation)) {
            throw new IllegalStateException("STATE_AUTHORITY_OPERATION_MISMATCH");
        }
        String predecessorReceipt = requiredString(current, "predecessor_receipt_id",
                "STATE_AUTHORITY_PREDECESSOR_RECEIPT_MISSING");
        if (!CLAIM_STATE_PREDECESSOR_RECEIPT.equals(predecessorReceipt)) {
            throw new IllegalStateException("STATE_AUTHORITY_PREDECESSOR_RECEIPT_MISMATCH");
        }

        String subject = objectField(packet, "authoritative_subject", "STATE_AUTHORITY_SUBJECT_MISSING");
        if (!"sha1".equals(requiredString(subject, "algorithm", "STATE_AUTHORITY_SUBJECT_ALGORITHM_MISSING"))) {
            throw new IllegalStateException("STATE_AUTHORITY_SUBJECT_ALGORITHM_INVALID");
        }
        String subjectSha = requiredString(subject, "oid", "STATE_AUTHORITY_SUBJECT_OID_MISSING");
        if (!SHA1.matcher(subjectSha).matches()) {
            throw new IllegalStateException("STATE_AUTHORITY_SUBJECT_OID_INVALID");
        }
        String packetDigest = requiredString(envelope, "packet_digest", "STATE_AUTHORITY_PACKET_DIGEST_MISSING");
        if (!SHA256.matcher(packetDigest).matches()) {
            throw new IllegalStateException("STATE_AUTHORITY_PACKET_DIGEST_INVALID");
        }

        return new Authority(head, mission, workstream, epoch, packetDigest, subjectSha,
                operation, predecessorReceipt);
    }

    private String mutationRequest(Authority a, String predecessor, String path, String mutationId) {
        return "{"
                + "\"protocol_version\":\"" + REQUEST_PROTOCOL + "\","
                + "\"mutation_id\":\"" + esc(mutationId) + "\","
                + "\"mission_version\":\"" + esc(a.missionVersion()) + "\","
                + "\"workstream_id\":\"" + esc(a.workstreamId()) + "\","
                + "\"authority_epoch\":" + a.epoch() + ","
                + "\"authority_publication_commit_sha\":\"" + a.headSha() + "\","
                + "\"authority_packet_digest\":\"" + a.packetDigest() + "\","
                + "\"authoritative_subject\":{\"algorithm\":\"sha1\",\"oid\":\"" + a.subjectSha() + "\"},"
                + "\"repository\":\"" + esc(owner + "/" + repo) + "\","
                + "\"target_kind\":\"WORK_REF\","
                + "\"target_ref\":\"" + esc(stateRef) + "\","
                + "\"expected_predecessor_sha\":\"" + predecessor + "\","
                + "\"operation_id\":\"" + esc(a.operationId()) + "\","
                + "\"predecessor_receipt_id\":\"" + esc(a.predecessorReceiptId()) + "\","
                + "\"paths\":[\"" + esc(path) + "\"],"
                + "\"effects\":[\"" + esc(writerEffect) + "\"]}";
    }

    private String mutationPlan(String predecessor, String path, String mutationId,
            DurableDispatchCoordinator.ClaimRecord next, String desired, String contentDigest) {
        return "{"
                + "\"protocol_version\":\"" + PLAN_PROTOCOL + "\","
                + "\"mutation_id\":\"" + esc(mutationId) + "\","
                + "\"repository\":\"" + esc(owner + "/" + repo) + "\","
                + "\"target_kind\":\"WORK_REF\","
                + "\"target_ref\":\"" + esc(stateRef) + "\","
                + "\"expected_predecessor_sha\":\"" + predecessor + "\","
                + "\"commit_message\":\"" + esc("claim-state " + next.claimId() + " " + next.state()) + "\","
                + "\"writes\":[{\"path\":\"" + esc(path) + "\",\"content_utf8\":\"" + esc(desired)
                + "\",\"content_sha256\":\"" + contentDigest + "\"}],\"deletes\":[]}";
    }

    private void assertExpectedRevision(String expected, String observed) throws DurableDispatchCoordinator.CasConflictException {
        if (expected == null) {
            if (observed != null) throw new DurableDispatchCoordinator.CasConflictException("STATE_CAS_CONFLICT");
            return;
        }
        if (!expected.equals(observed)) throw new DurableDispatchCoordinator.CasConflictException("STATE_CAS_CONFLICT");
    }

    private String refSha(String ref, String phase) throws Exception {
        Response r = get(API + "/repos/" + owner + "/" + repo + "/git/ref/heads/" + ref,
                headers(token()), phase);
        if (r.status() != 200) throw new IllegalStateException(phase + "_REJECTED_" + r.status());
        String object = objectField(r.body(), "object", phase + "_OBJECT_MISSING");
        String sha = requiredString(object, "sha", phase + "_SHA_MISSING");
        if (!sha.matches("[0-9a-f]{40}")) throw new IllegalStateException(phase + "_SHA_INVALID");
        return sha;
    }

    private String firstParent(String commitJson) {
        String parents = arrayField(commitJson, "parents", "STATE_WRITER_COMMIT_PARENTS_MISSING");
        int first = parents.indexOf('{');
        if (first < 0) throw new IllegalStateException("STATE_WRITER_COMMIT_PARENT_MISSING");
        int end = matching(parents, first, '{', '}');
        if (end < 0) throw new IllegalStateException("STATE_WRITER_COMMIT_PARENT_INVALID");
        String parent = requiredString(parents.substring(first, end + 1), "sha", "STATE_WRITER_COMMIT_PARENT_SHA_MISSING");
        if (!parent.matches("[0-9a-f]{40}")) throw new IllegalStateException("STATE_WRITER_COMMIT_PARENT_SHA_INVALID");
        return parent;
    }

    private String decodeContentBody(Response response, String phase) {
        if (response.body() == null || response.body().isBlank()) throw new IllegalStateException(phase + "_INVALID_RESPONSE");
        String encoding = requiredString(response.body(), "encoding", phase + "_MISSING_ENCODING");
        if (!"base64".equals(encoding)) throw new IllegalStateException(phase + "_UNSUPPORTED_ENCODING");
        return decodeBase64(requiredString(response.body(), "content", phase + "_MISSING_CONTENT"), phase + "_CORRUPT_BASE64");
    }

    private String statePath(String claimId) { return root + "/" + sha256(claimId) + ".json"; }
    private String contentUrl(String claimId) { return API + "/repos/" + owner + "/" + repo + "/contents/" + statePath(claimId); }
    private String writerDispatchUrl() { return API + "/repos/" + owner + "/" + repo + "/actions/workflows/" + query(writerWorkflow) + "/dispatches"; }

    private void requireConfigured() {
        if (owner.isEmpty() || repo.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_REPOSITORY");
        if (stateRef.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_REF");
        if (root.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_ROOT");
        if (authorityRef.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_AUTHORITY_REF");
        if (writerWorkflow.isEmpty() || writerRef.isEmpty() || writerEffect.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_WRITER");
    }

    private String token() {
        String value = credentials.token();
        if (value == null || value.isBlank()) throw new IllegalStateException("STATE_STORE_NO_CREDENTIAL");
        return value.trim();
    }

    private Response get(String url, Map<String, String> headers, String phase) throws Exception {
        try {
            Response r = transport.get(url, headers);
            if (r == null) throw new IllegalStateException(phase + "_NO_RESPONSE");
            return r;
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:" + e.getClass().getSimpleName(), e);
        }
    }

    private static String decodeBase64(String encoded, String error) {
        try { return new String(Base64.getMimeDecoder().decode(encoded), StandardCharsets.UTF_8); }
        catch (IllegalArgumentException bad) { throw new IllegalStateException(error, bad); }
    }

    private static String objectField(String json, String key, String error) {
        int keyAt = fieldKey(json, key);
        int start = skipWsAfterColon(json, keyAt, key);
        if (start < 0 || start >= json.length() || json.charAt(start) != '{') throw new IllegalStateException(error);
        int end = matching(json, start, '{', '}');
        if (end < 0) throw new IllegalStateException(error);
        return json.substring(start, end + 1);
    }

    private static String arrayField(String json, String key, String error) {
        int keyAt = fieldKey(json, key);
        int start = skipWsAfterColon(json, keyAt, key);
        if (start < 0 || start >= json.length() || json.charAt(start) != '[') throw new IllegalStateException(error);
        int end = matching(json, start, '[', ']');
        if (end < 0) throw new IllegalStateException(error);
        return json.substring(start, end + 1);
    }

    private static int fieldKey(String json, String key) {
        String needle = "\"" + key + "\"";
        int at = json.indexOf(needle);
        if (at < 0) throw new IllegalStateException("STATE_JSON_FIELD_MISSING:" + key);
        return at;
    }

    private static int skipWsAfterColon(String json, int keyAt, String key) {
        int colon = json.indexOf(':', keyAt + key.length() + 2);
        if (colon < 0) return -1;
        int at = colon + 1;
        while (at < json.length() && Character.isWhitespace(json.charAt(at))) at++;
        return at;
    }

    private static int matching(String json, int start, char open, char close) {
        int depth = 0; boolean string = false; boolean escaped = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (string) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') string = false;
                continue;
            }
            if (c == '"') string = true;
            else if (c == open) depth++;
            else if (c == close && --depth == 0) return i;
        }
        return -1;
    }

    private static String requiredString(String json, String key, String error) {
        Matcher m = STRING_FIELD.matcher(json);
        while (m.find()) {
            if (!key.equals(m.group(1))) continue;
            if (m.group(3) != null) throw new IllegalStateException(error);
            return unesc(m.group(2));
        }
        throw new IllegalStateException(error);
    }

    private static long requiredLong(String json, String key, String error) {
        Matcher m = NUMBER_FIELD.matcher(json);
        while (m.find()) if (key.equals(m.group(1))) return Long.parseLong(m.group(2));
        throw new IllegalStateException(error);
    }

    private static void requireExactSingleStringArray(String json, String key, String expected, String error) {
        String array = arrayField(json, key, error);
        String encoded = "\"" + esc(expected) + "\"";
        if (!array.matches("\\[\\s*" + Pattern.quote(encoded) + "\\s*\\]")) {
            throw new IllegalStateException(error);
        }
    }

    private static Map<String, String> headers(String token) {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Accept", "application/vnd.github+json");
        h.put("Authorization", "Bearer " + token);
        h.put("X-GitHub-Api-Version", "2022-11-28");
        h.put("Content-Type", "application/json");
        return h;
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest) out.append(String.format("%02x", b & 0xff));
            return out.toString();
        } catch (Exception impossible) {
            throw new IllegalStateException("SHA256_UNAVAILABLE", impossible);
        }
    }

    private static boolean validRef(String value) {
        if (value == null || value.isBlank() || value.startsWith("/") || value.endsWith("/")) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (!(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9')
                    && c != '-' && c != '_' && c != '.' && c != '/') return false;
        }
        return !value.contains("..") && !value.contains("//");
    }

    private static String query(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20"); }
    private static String stripSlashes(String value) {
        int a = 0, b = value.length();
        while (a < b && value.charAt(a) == '/') a++;
        while (b > a && value.charAt(b - 1) == '/') b--;
        return value.substring(a, b);
    }
    private static String norm(String value) { return value == null ? "" : value.trim(); }
    private static String env(String key, String fallback) {
        String value = System.getenv(key); return value == null || value.isBlank() ? fallback : value.trim();
    }
    private static int envInt(String key, int fallback) {
        String value = env(key, Integer.toString(fallback));
        try { return Integer.parseInt(value); } catch (NumberFormatException bad) { throw new IllegalStateException("STATE_STORE_INVALID_ENV_" + key, bad); }
    }
    private static long envLong(String key, long fallback) {
        String value = env(key, Long.toString(fallback));
        try { return Long.parseLong(value); } catch (NumberFormatException bad) { throw new IllegalStateException("STATE_STORE_INVALID_ENV_" + key, bad); }
    }
    private static String esc(String value) {
        StringBuilder out = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> out.append(c);
            }
        }
        return out.toString();
    }
    private static String unesc(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c != '\\') { out.append(c); continue; }
            if (++i >= value.length()) throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE");
            char e = value.charAt(i);
            switch (e) {
                case '"', '\\', '/' -> out.append(e);
                case 'b' -> out.append('\b');
                case 'f' -> out.append('\f');
                case 'n' -> out.append('\n');
                case 'r' -> out.append('\r');
                case 't' -> out.append('\t');
                case 'u' -> {
                    if (i + 4 >= value.length()) throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE");
                    try { out.append((char) Integer.parseInt(value.substring(i + 1, i + 5), 16)); }
                    catch (NumberFormatException bad) { throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE", bad); }
                    i += 4;
                }
                default -> throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE");
            }
        }
        return out.toString();
    }
    private static void requireText(String value, String code) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("MISSING_" + code);
    }
}
