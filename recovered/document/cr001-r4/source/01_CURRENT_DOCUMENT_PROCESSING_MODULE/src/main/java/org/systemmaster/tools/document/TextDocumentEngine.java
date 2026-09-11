package org.systemmaster.tools.document;

import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import java.util.regex.*;

/** Safe deterministic engine for Markdown, plain text, HTML-as-document, and a bounded RTF subset. */
final class TextDocumentEngine {
    private static final int MAX_BYTES = 64 * 1024 * 1024;
    private static final Pattern MD_LINK = Pattern.compile("!?\\[([^]]*)]\\(([^)]+)\\)");
    private static final Pattern HTML_SCRIPT_STYLE = Pattern.compile("(?is)<(script|style)\\b[^>]*>.*?</\\1\\s*>");
    private static final Pattern HTML_BREAKS = Pattern.compile("(?is)<\\s*(br\\s*/?|/p|/div|/li|/h[1-6]|/tr)\\s*>");
    private static final Pattern HTML_TAG = Pattern.compile("(?is)<[^>]+>");

    public record Inspection(String sha256, int bytes, int characters, int lines, int nonBlankLines,
                             int headings, int links, List<String> diagnostics, String canonicalText) {}
    public record Mutation(byte[] bytes, int replacements, String sourceSha256, String resultSha256) {}

    public Inspection inspect(DocumentFormat format, byte[] bytes) {
        requireTextFormat(format);
        String decoded = decode(format, bytes);
        String canonical = normalize(decoded);
        int lines = canonical.isEmpty() ? 0 : canonical.split("\\n", -1).length;
        int nonBlank = canonical.isEmpty() ? 0 : (int) canonical.lines().filter(s -> !s.isBlank()).count();
        int headings = format == DocumentFormat.MARKDOWN ? (int) canonical.lines().filter(s -> s.matches("^#{1,6}\\s+.*")).count() : 0;
        int links = format == DocumentFormat.MARKDOWN ? count(MD_LINK, canonical)
                : format == DocumentFormat.HTML ? count(Pattern.compile("(?i)<a\\b"), decoded) : 0;
        List<String> diagnostics = new ArrayList<>();
        if (format == DocumentFormat.HTML && Pattern.compile("(?i)<script\\b").matcher(decoded).find()) diagnostics.add("ACTIVE_HTML_SCRIPT_IGNORED");
        if (format == DocumentFormat.RTF && !decoded.startsWith("{\\rtf")) diagnostics.add("RTF_HEADER_UNOBSERVED");
        return new Inspection(sha256(bytes), bytes.length, canonical.length(), lines, nonBlank, headings, links,
                List.copyOf(diagnostics), canonical);
    }

    public String toPlainText(DocumentFormat format, byte[] bytes) {
        requireTextFormat(format);
        String source = decode(format, bytes);
        return normalize(switch (format) {
            case PLAIN_TEXT -> source;
            case MARKDOWN -> markdownToText(source);
            case HTML -> htmlToText(source);
            case RTF -> rtfToText(source);
            default -> throw new IllegalArgumentException("not a text-family format: " + format);
        });
    }

    public byte[] fromPlainText(DocumentFormat target, String text) {
        requireTextFormat(target);
        String normalized = normalize(Objects.requireNonNullElse(text, ""));
        String encoded = switch (target) {
            case PLAIN_TEXT, MARKDOWN -> normalized;
            case HTML -> toHtml(normalized);
            case RTF -> toRtf(normalized);
            default -> throw new IllegalArgumentException("not a text-family format: " + target);
        };
        return encoded.getBytes(StandardCharsets.UTF_8);
    }

    public Mutation replaceText(DocumentFormat format, byte[] bytes, String search, String replacement) {
        requireTextFormat(format);
        String needle = Objects.requireNonNull(search, "search");
        if (needle.isEmpty()) throw new IllegalArgumentException("search empty");
        String value = Objects.requireNonNullElse(replacement, "");
        String source = decode(format, bytes);
        int count = occurrences(source, needle);
        if (count == 0) throw new IllegalArgumentException("replacement target not found");
        byte[] result = source.replace(needle, value).getBytes(StandardCharsets.UTF_8);
        return new Mutation(result, count, sha256(bytes), sha256(result));
    }

    private static String decode(DocumentFormat format, byte[] bytes) {
        Objects.requireNonNull(bytes, "bytes");
        if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("text document exceeds portable limit");
        if (!DocumentFormatDetector.validUtf8Text(bytes)) throw new IllegalArgumentException("text document is not valid UTF-8");
        String s = new String(bytes, StandardCharsets.UTF_8);
        if (s.startsWith("\uFEFF")) s = s.substring(1);
        return s;
    }

    private static String markdownToText(String s) {
        StringBuilder out = new StringBuilder();
        boolean fence = false;
        for (String raw : normalize(s).split("\\n", -1)) {
            String line = raw;
            if (line.stripLeading().startsWith("```")) { fence = !fence; continue; }
            if (!fence) {
                line = line.replaceFirst("^\\s{0,3}#{1,6}\\s+", "");
                line = line.replaceFirst("^\\s*>\\s?", "");
                line = line.replaceFirst("^\\s*(?:[-+*]|\\d+[.)])\\s+", "");
                line = MD_LINK.matcher(line).replaceAll("$1");
                line = line.replace("**", "").replace("__", "").replace("~~", "").replace("`", "");
            }
            out.append(line).append('\n');
        }
        return out.toString();
    }

    private static String htmlToText(String s) {
        String x = HTML_SCRIPT_STYLE.matcher(s).replaceAll("");
        x = HTML_BREAKS.matcher(x).replaceAll("\n");
        x = HTML_TAG.matcher(x).replaceAll("");
        x = x.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
                .replace("&#39;", "'").replace("&amp;", "&");
        return x;
    }

    /** Bounded plain-text projection; intentionally not a full RTF layout renderer. */
    private static String rtfToText(String s) {
        StringBuilder out = new StringBuilder();
        int depth = 0;
        boolean skipDestination = false;
        Deque<Boolean> skipStack = new ArrayDeque<>();
        for (int i = 0; i < s.length();) {
            char c = s.charAt(i);
            if (c == '{') { depth++; skipStack.push(skipDestination); i++; continue; }
            if (c == '}') { depth = Math.max(0, depth - 1); skipDestination = skipStack.isEmpty() ? false : skipStack.pop(); i++; continue; }
            if (skipDestination) { i++; continue; }
            if (c != '\\') { if (c != '\r' && c != '\n') out.append(c); i++; continue; }
            i++;
            if (i >= s.length()) break;
            char n = s.charAt(i);
            if (n == '\\' || n == '{' || n == '}') { out.append(n); i++; continue; }
            if (n == '\'') {
                if (i + 2 < s.length()) {
                    try { out.append((char) Integer.parseInt(s.substring(i + 1, i + 3), 16)); } catch (NumberFormatException ignored) {}
                    i += 3;
                } else i++;
                continue;
            }
            if (n == '*') { skipDestination = true; i++; continue; }
            int start = i;
            while (i < s.length() && Character.isLetter(s.charAt(i))) i++;
            String word = s.substring(start, i);
            if (i < s.length() && (s.charAt(i) == '-' || Character.isDigit(s.charAt(i)))) {
                if (s.charAt(i) == '-') i++;
                while (i < s.length() && Character.isDigit(s.charAt(i))) i++;
            }
            if (i < s.length() && s.charAt(i) == ' ') i++;
            if (Set.of("fonttbl","colortbl","stylesheet","info","pict","object","header","footer").contains(word)) skipDestination = true;
            else if (word.equals("par") || word.equals("line")) out.append('\n');
            else if (word.equals("tab")) out.append('\t');
            else if (word.equals("emdash")) out.append('—');
            else if (word.equals("endash")) out.append('–');
            else if (word.equals("bullet")) out.append('•');
        }
        return out.toString();
    }

    private static String toHtml(String text) {
        StringBuilder out = new StringBuilder("<!doctype html><html><head><meta charset=\"utf-8\"></head><body>");
        for (String line : text.split("\\n", -1)) out.append("<p>").append(htmlEscape(line)).append("</p>");
        return out.append("</body></html>").toString();
    }

    private static String toRtf(String text) {
        StringBuilder out = new StringBuilder("{\\rtf1\\ansi\\deff0 ");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\n') out.append("\\par\n");
            else if (c == '\\' || c == '{' || c == '}') out.append('\\').append(c);
            else if (c <= 0x7f) out.append(c);
            else out.append("\\u").append((int)c).append('?');
        }
        return out.append('}').toString();
    }

    private static String htmlEscape(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String normalize(String s) {
        String x = Objects.requireNonNullElse(s, "").replace("\r\n", "\n").replace('\r', '\n');
        while (x.contains("\n\n\n")) x = x.replace("\n\n\n", "\n\n");
        return x.stripTrailing();
    }

    private static int count(Pattern p, String s) { int n = 0; Matcher m = p.matcher(s); while (m.find()) n++; return n; }
    private static int occurrences(String s, String needle) { int n=0; for (int i=0; (i=s.indexOf(needle,i))>=0; i+=needle.length()) n++; return n; }
    private static void requireTextFormat(DocumentFormat f) { if (f == null || !f.textFamily()) throw new IllegalArgumentException("text-family format required"); }
    private static String sha256(byte[] b) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b)); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
}
