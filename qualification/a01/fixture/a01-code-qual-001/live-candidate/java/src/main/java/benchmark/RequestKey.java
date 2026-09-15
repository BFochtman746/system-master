package benchmark;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class RequestKey {
    private RequestKey() {}

    private static boolean isContractWhitespace(char c) {
        return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f';
    }

    private static String trimRequestId(String requestId) {
        int start = 0;
        int end = requestId.length();
        while (start < end && isContractWhitespace(requestId.charAt(start))) start++;
        while (end > start && isContractWhitespace(requestId.charAt(end - 1))) end--;
        return requestId.substring(start, end);
    }

    private static String normalizePayload(String payload) {
        String normalizedLines = payload.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder out = new StringBuilder(normalizedLines.length());
        boolean pendingSpace = false;
        for (int i = 0; i < normalizedLines.length(); i++) {
            char c = normalizedLines.charAt(i);
            if (isContractWhitespace(c)) {
                if (out.length() > 0) pendingSpace = true;
            } else {
                if (pendingSpace) out.append(' ');
                out.append(c);
                pendingSpace = false;
            }
        }
        return out.toString();
    }

    public static String canonical(String requestId, String payload) {
        return trimRequestId(requestId) + ":" + normalizePayload(payload);
    }

    public static String sha256(String requestId, String payload) {
        String value = canonical(requestId, payload);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) sb.append(String.format("%02x", b & 0xff));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
