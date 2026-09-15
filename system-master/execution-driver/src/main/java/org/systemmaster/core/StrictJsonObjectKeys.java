package org.systemmaster.core;

import java.util.HashSet;
import java.util.Set;

/** Strict JSON structural scan used at trust boundaries where duplicate object keys are ambiguous. */
final class StrictJsonObjectKeys {
    private StrictJsonObjectKeys() { }

    static void rejectDuplicates(String json, String duplicateCode, String invalidCode) {
        if (json == null || json.isBlank()) throw new IllegalStateException(invalidCode);
        new Scanner(json, duplicateCode, invalidCode).scan();
    }

    private static final class Scanner {
        private final String text;
        private final String duplicateCode;
        private final String invalidCode;
        private int at;

        Scanner(String text, String duplicateCode, String invalidCode) {
            this.text = text;
            this.duplicateCode = duplicateCode;
            this.invalidCode = invalidCode;
        }

        void scan() {
            skipWs();
            value();
            skipWs();
            if (at != text.length()) invalid();
        }

        private void value() {
            skipWs();
            if (at >= text.length()) invalid();
            char c = text.charAt(at);
            switch (c) {
                case '{' -> object();
                case '[' -> array();
                case '"' -> string();
                case 't' -> literal("true");
                case 'f' -> literal("false");
                case 'n' -> literal("null");
                default -> number();
            }
        }

        private void object() {
            expect('{');
            skipWs();
            if (take('}')) return;
            Set<String> keys = new HashSet<>();
            while (true) {
                skipWs();
                if (at >= text.length() || text.charAt(at) != '"') invalid();
                String key = string();
                if (!keys.add(key)) throw new IllegalStateException(duplicateCode);
                skipWs();
                expect(':');
                value();
                skipWs();
                if (take('}')) return;
                expect(',');
            }
        }

        private void array() {
            expect('[');
            skipWs();
            if (take(']')) return;
            while (true) {
                value();
                skipWs();
                if (take(']')) return;
                expect(',');
            }
        }

        private String string() {
            expect('"');
            StringBuilder out = new StringBuilder();
            while (at < text.length()) {
                char c = text.charAt(at++);
                if (c == '"') return out.toString();
                if (c < 0x20) invalid();
                if (c != '\\') {
                    out.append(c);
                    continue;
                }
                if (at >= text.length()) invalid();
                char e = text.charAt(at++);
                switch (e) {
                    case '"', '\\', '/' -> out.append(e);
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> out.append(unicode());
                    default -> invalid();
                }
            }
            invalid();
            return "";
        }

        private char unicode() {
            if (at + 4 > text.length()) invalid();
            int value = 0;
            for (int i = 0; i < 4; i++) {
                int digit = Character.digit(text.charAt(at++), 16);
                if (digit < 0) invalid();
                value = (value << 4) | digit;
            }
            return (char) value;
        }

        private void number() {
            int start = at;
            if (take('-') && at >= text.length()) invalid();
            if (take('0')) {
                if (at < text.length() && Character.isDigit(text.charAt(at))) invalid();
            } else {
                if (at >= text.length() || text.charAt(at) < '1' || text.charAt(at) > '9') invalid();
                while (at < text.length() && Character.isDigit(text.charAt(at))) at++;
            }
            if (take('.')) {
                int digits = at;
                while (at < text.length() && Character.isDigit(text.charAt(at))) at++;
                if (at == digits) invalid();
            }
            if (at < text.length() && (text.charAt(at) == 'e' || text.charAt(at) == 'E')) {
                at++;
                if (at < text.length() && (text.charAt(at) == '+' || text.charAt(at) == '-')) at++;
                int digits = at;
                while (at < text.length() && Character.isDigit(text.charAt(at))) at++;
                if (at == digits) invalid();
            }
            if (at == start) invalid();
        }

        private void literal(String expected) {
            if (!text.startsWith(expected, at)) invalid();
            at += expected.length();
        }

        private void skipWs() {
            while (at < text.length()) {
                char c = text.charAt(at);
                if (c != ' ' && c != '\n' && c != '\r' && c != '\t') return;
                at++;
            }
        }

        private boolean take(char expected) {
            if (at < text.length() && text.charAt(at) == expected) {
                at++;
                return true;
            }
            return false;
        }

        private void expect(char expected) {
            if (!take(expected)) invalid();
        }

        private void invalid() {
            throw new IllegalStateException(invalidCode);
        }
    }
}
