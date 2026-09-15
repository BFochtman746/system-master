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

/** GitHub-Contents-backed durable state store using content blob SHA as CAS revision. */
public final class GitHubClaimStateStore implements DurableDispatchCoordinator.Store {

    public record Response(int status, String body) { }
    public interface Transport {
        Response get(String url, Map<String, String> headers) throws Exception;
        Response put(String url, Map<String, String> headers, String body) throws Exception;
    }

    private static final String API = "https://api.github.com";
    private static final Pattern STRING_FIELD = Pattern.compile("\\\"([^\\\"]+)\\\"\\s*:\\s*(?:\\\"((?:\\\\.|[^\\\"\\\\])*)\\\"|(null))");
    private final Transport transport;
    private final ActionsDispatch.Credentials credentials;
    private final String owner;
    private final String repo;
    private final String stateRef;
    private final String root;

    public GitHubClaimStateStore(Transport transport, ActionsDispatch.Credentials credentials,
            String owner, String repo, String stateRef, String root) {
        this.transport = Objects.requireNonNull(transport, "transport");
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.owner = norm(owner); this.repo = norm(repo); this.stateRef = norm(stateRef); this.root = stripSlashes(norm(root));
    }

    public static GitHubClaimStateStore fromEnvironment(Transport transport) {
        ActionsDispatch.RepoCoordinates c = ActionsDispatch.repoCoordinates();
        return new GitHubClaimStateStore(transport, ActionsDispatch::ambientToken, c.owner(), c.repo(),
                env("CLAIM_STATE_REF", "second-shift/execution-state"), env("CLAIM_STATE_ROOT", "execution/claims/state"));
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
            public Response put(String url, Map<String, String> headers, String body) throws Exception {
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30))
                        .PUT(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
                for (Map.Entry<String, String> h : headers.entrySet()) b.header(h.getKey(), h.getValue());
                HttpResponse<String> r = client.send(b.build(), HttpResponse.BodyHandlers.ofString());
                return new Response(r.statusCode(), r.body());
            }
        };
    }

    public void verifyStateRef() throws Exception {
        requireConfigured();
        if (!validRef(stateRef)) throw new IllegalStateException("STATE_STORE_INVALID_REF");
        String url = API + "/repos/" + owner + "/" + repo + "/git/ref/heads/" + stateRef;
        Response r = get(url, headers(token()), "STATE_STORE_REF");
        if (r.status() != 200) throw new IllegalStateException("STATE_STORE_REF_REJECTED_" + r.status());
    }

    @Override
    public DurableDispatchCoordinator.Versioned load(String claimId) throws Exception {
        requireText(claimId, "CLAIM_ID"); requireConfigured();
        Response r = get(contentUrl(claimId) + "?ref=" + query(stateRef), headers(token()), "STATE_STORE_READ");
        if (r.status() == 404) return null;
        if (r.status() != 200) throw new IllegalStateException("STATE_STORE_READ_REJECTED_" + r.status());
        if (r.body() == null || r.body().isBlank()) throw new IllegalStateException("STATE_STORE_READ_INVALID_RESPONSE");
        String revision = requiredString(r.body(), "sha", "STATE_STORE_READ_MISSING_SHA");
        String encoding = requiredString(r.body(), "encoding", "STATE_STORE_READ_MISSING_ENCODING");
        if (!"base64".equals(encoding)) throw new IllegalStateException("STATE_STORE_UNSUPPORTED_ENCODING");
        String encoded = requiredString(r.body(), "content", "STATE_STORE_READ_MISSING_CONTENT");
        String json;
        try { json = new String(Base64.getMimeDecoder().decode(encoded), StandardCharsets.UTF_8); }
        catch (IllegalArgumentException badBase64) { throw new IllegalStateException("STATE_STORE_CORRUPT_BASE64", badBase64); }
        DurableDispatchCoordinator.ClaimRecord record = DurableDispatchCoordinator.ClaimRecord.fromJson(json);
        if (!claimId.equals(record.claimId())) throw new IllegalStateException("STATE_STORE_CLAIM_ID_MISMATCH");
        return new DurableDispatchCoordinator.Versioned(record, revision);
    }

    @Override
    public DurableDispatchCoordinator.Versioned save(String expectedRevision, DurableDispatchCoordinator.ClaimRecord next) throws Exception {
        Objects.requireNonNull(next, "next"); requireConfigured();
        String content = Base64.getEncoder().encodeToString(next.toJson().getBytes(StandardCharsets.UTF_8));
        StringBuilder body = new StringBuilder();
        body.append("{\"message\":\"").append(esc("claim-state " + next.claimId() + " " + next.state()))
                .append("\",\"content\":\"").append(content).append("\",\"branch\":\"").append(esc(stateRef)).append('"');
        if (expectedRevision != null) { requireText(expectedRevision, "EXPECTED_REVISION"); body.append(",\"sha\":\"").append(esc(expectedRevision)).append('"'); }
        body.append('}');
        Response r = put(contentUrl(next.claimId()), headers(token()), body.toString(), "STATE_STORE_WRITE");
        if (r.status() == 409) throw new DurableDispatchCoordinator.CasConflictException("STATE_CAS_CONFLICT");
        int expectedStatus = expectedRevision == null ? 201 : 200;
        if (r.status() != expectedStatus) throw new IllegalStateException("STATE_STORE_WRITE_REJECTED_" + r.status());
        if (r.body() == null || r.body().isBlank()) throw new IllegalStateException("STATE_STORE_WRITE_INVALID_RESPONSE");
        return new DurableDispatchCoordinator.Versioned(next, contentSha(r.body()));
    }

    private String contentUrl(String claimId) {
        return API + "/repos/" + owner + "/" + repo + "/contents/" + root + "/" + sha256(claimId) + ".json";
    }
    private void requireConfigured() {
        if (owner.isEmpty() || repo.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_REPOSITORY");
        if (stateRef.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_REF");
        if (root.isEmpty()) throw new IllegalStateException("STATE_STORE_MISCONFIGURED_ROOT");
    }
    private String token() {
        String token = credentials.token();
        if (token == null || token.isBlank()) throw new IllegalStateException("STATE_STORE_NO_CREDENTIAL");
        return token.trim();
    }
    private Response get(String url, Map<String, String> headers, String phase) throws Exception {
        try { Response r = transport.get(url, headers); if (r == null) throw new IllegalStateException(phase + "_NO_RESPONSE"); return r; }
        catch (IllegalStateException e) { throw e; }
        catch (Exception e) { throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:" + e.getClass().getSimpleName(), e); }
    }
    private Response put(String url, Map<String, String> headers, String body, String phase) throws Exception {
        try { Response r = transport.put(url, headers, body); if (r == null) throw new IllegalStateException(phase + "_NO_RESPONSE"); return r; }
        catch (IllegalStateException e) { throw e; }
        catch (Exception e) { throw new IllegalStateException(phase + "_TRANSPORT_FAILURE:" + e.getClass().getSimpleName(), e); }
    }
    private static String contentSha(String json) {
        int key = json.indexOf("\"content\"");
        if (key < 0) throw new IllegalStateException("STATE_STORE_WRITE_MISSING_CONTENT");
        int start = json.indexOf('{', key);
        if (start < 0) throw new IllegalStateException("STATE_STORE_WRITE_MISSING_CONTENT");
        int end = matching(json, start);
        if (end < 0) throw new IllegalStateException("STATE_STORE_WRITE_INVALID_RESPONSE");
        return requiredString(json.substring(start, end + 1), "sha", "STATE_STORE_WRITE_MISSING_SHA");
    }
    private static int matching(String json, int start) {
        int depth = 0; boolean string = false; boolean escaped = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (string) { if (escaped) escaped = false; else if (c == '\\') escaped = true; else if (c == '"') string = false; continue; }
            if (c == '"') string = true; else if (c == '{') depth++; else if (c == '}' && --depth == 0) return i;
        }
        return -1;
    }
    private static String requiredString(String json, String key, String error) {
        Matcher m = STRING_FIELD.matcher(json);
        while (m.find()) { if (!key.equals(m.group(1))) continue; if (m.group(3) != null) throw new IllegalStateException(error); return unesc(m.group(2)); }
        throw new IllegalStateException(error);
    }
    private static Map<String, String> headers(String token) {
        Map<String, String> h = new LinkedHashMap<>();
        h.put("Accept", "application/vnd.github+json"); h.put("Authorization", "Bearer " + token);
        h.put("X-GitHub-Api-Version", "2022-11-28"); h.put("Content-Type", "application/json"); return h;
    }
    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64); for (byte b : digest) out.append(String.format("%02x", b & 0xff)); return out.toString();
        } catch (Exception impossible) { throw new IllegalStateException("SHA256_UNAVAILABLE", impossible); }
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
    private static String stripSlashes(String value) { int a=0,b=value.length(); while(a<b&&value.charAt(a)=='/')a++; while(b>a&&value.charAt(b-1)=='/')b--; return value.substring(a,b); }
    private static String norm(String value) { return value == null ? "" : value.trim(); }
    private static String env(String key, String fallback) { String value=System.getenv(key); return value==null||value.isBlank()?fallback:value.trim(); }
    private static String esc(String value) {
        StringBuilder out=new StringBuilder(value.length()+8); for(int i=0;i<value.length();i++){char c=value.charAt(i); switch(c){case '"'->out.append("\\\"");case '\\'->out.append("\\\\");case '\n'->out.append("\\n");case '\r'->out.append("\\r");case '\t'->out.append("\\t");default->out.append(c);}} return out.toString();
    }
    private static String unesc(String value) {
        StringBuilder out=new StringBuilder(value.length()); for(int i=0;i<value.length();i++){char c=value.charAt(i); if(c!='\\'){out.append(c);continue;} if(++i>=value.length())throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE"); char e=value.charAt(i); switch(e){case '"','\\','/'->out.append(e);case 'b'->out.append('\b');case 'f'->out.append('\f');case 'n'->out.append('\n');case 'r'->out.append('\r');case 't'->out.append('\t');case 'u'->{if(i+4>=value.length())throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE");try{out.append((char)Integer.parseInt(value.substring(i+1,i+5),16));}catch(NumberFormatException bad){throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE",bad);}i+=4;}default->throw new IllegalStateException("STATE_STORE_INVALID_JSON_ESCAPE");}} return out.toString();
    }
    private static void requireText(String value, String code) { if(value==null||value.isBlank())throw new IllegalArgumentException("MISSING_"+code); }
}