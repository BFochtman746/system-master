package benchmark;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class RequestKey {
    private RequestKey() {}

    public static String canonical(String requestId, String payload) {
        // Intentionally defective: no normalization.
        return requestId + ":" + payload;
    }

    public static String sha256(String requestId, String payload) {
        String value = canonical(requestId, payload);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
