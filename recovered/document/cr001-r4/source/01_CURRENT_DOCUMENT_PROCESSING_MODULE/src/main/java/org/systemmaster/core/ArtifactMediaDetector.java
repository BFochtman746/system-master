package org.systemmaster.core;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Deterministic magic/package classifier with conservative UTF-8 document-text detection. */
public final class ArtifactMediaDetector {
    public static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    public static final String DOCM = "application/vnd.ms-word.document.macroenabled.12";
    public static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    public static final String XLSM = "application/vnd.ms-excel.sheet.macroenabled.12";
    public static final String PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    public static final String PPTM = "application/vnd.ms-powerpoint.presentation.macroenabled.12";
    public static final String PDF = "application/pdf";
    public static final String TEXT = "text/plain";
    public static final String HTML = "text/html";
    public static final String RTF = "text/rtf";

    private static final int PROBE_BYTES = 8192;

    public String detect(Path path) throws IOException {
        Objects.requireNonNull(path, "path");
        byte[] probe;
        try (InputStream in = Files.newInputStream(path)) { probe = in.readNBytes(PROBE_BYTES); }
        if (isZip(probe)) {
            try (InputStream in = Files.newInputStream(path)) {
                String ooxml = detectOoxml(in);
                return ooxml == null ? "application/zip" : ooxml;
            }
        }
        return detectProbe(probe);
    }

    public String detect(byte[] bytes) {
        Objects.requireNonNull(bytes, "bytes");
        byte[] probe = Arrays.copyOf(bytes, Math.min(bytes.length, PROBE_BYTES));
        if (isZip(probe)) {
            try {
                String ooxml = detectOoxml(new ByteArrayInputStream(bytes));
                return ooxml == null ? "application/zip" : ooxml;
            } catch (IOException e) {
                return "application/zip";
            }
        }
        return detectProbe(probe);
    }

    private static String detectProbe(byte[] h) {
        if (starts(h, "%PDF-".getBytes(java.nio.charset.StandardCharsets.US_ASCII))) return PDF;
        if (starts(h, new byte[]{(byte)0x89,'P','N','G',13,10,26,10})) return "image/png";
        if (starts(h, new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff})) return "image/jpeg";
        if (starts(h, "GIF87a".getBytes(java.nio.charset.StandardCharsets.US_ASCII)) || starts(h, "GIF89a".getBytes(java.nio.charset.StandardCharsets.US_ASCII))) return "image/gif";
        if (starts(h, new byte[]{'M','Z'})) return "application/vnd.microsoft.portable-executable";
        if (starts(h, new byte[]{0x7f,'E','L','F'})) return "application/x-elf";
        String text = decodeUtf8Text(h);
        if (text != null) {
            String normalized = text.startsWith("\uFEFF") ? text.substring(1) : text;
            String trimmed = normalized.stripLeading().toLowerCase(Locale.ROOT);
            if (trimmed.startsWith("{\\rtf")) return RTF;
            if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html") || trimmed.startsWith("<head") || trimmed.startsWith("<body")) return HTML;
            return TEXT;
        }
        return "application/octet-stream";
    }

    private static String decodeUtf8Text(byte[] bytes) {
        if (bytes.length == 0) return "";
        for (byte b : bytes) if (b == 0) return null;
        try {
            CharsetDecoder decoder = java.nio.charset.StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT);
            String s = decoder.decode(ByteBuffer.wrap(bytes)).toString();
            long controls = s.chars().filter(c -> c < 0x20 && c != '\n' && c != '\r' && c != '\t' && c != '\f').count();
            return controls > Math.max(2, s.length() / 100) ? null : s;
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    private static String detectOoxml(InputStream input) throws IOException {
        boolean word = false, excel = false, powerpoint = false, macro = false;
        String contentTypes = null;
        try (ZipInputStream zip = new ZipInputStream(input)) {
            ZipEntry entry;
            int entries = 0;
            while ((entry = zip.getNextEntry()) != null) {
                if (++entries > 2_048) break;
                String name = entry.getName();
                if (name == null || entry.isDirectory()) continue;
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.equals("word/document.xml")) word = true;
                else if (lower.equals("xl/workbook.xml")) excel = true;
                else if (lower.equals("ppt/presentation.xml")) powerpoint = true;
                else if (lower.endsWith("vbaproject.bin")) macro = true;
                else if (lower.equals("[content_types].xml")) contentTypes = readBounded(zip, 1_048_576);
                if ((word || excel || powerpoint) && contentTypes != null) break;
            }
        }
        if (contentTypes != null) {
            String ct = contentTypes.toLowerCase(Locale.ROOT);
            if (ct.contains("application/vnd.ms-word.document.macroenabled.main+xml")) return DOCM;
            if (ct.contains("application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")) return DOCX;
            if (ct.contains("application/vnd.ms-excel.sheet.macroenabled.main+xml")) return XLSM;
            if (ct.contains("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")) return XLSX;
            if (ct.contains("application/vnd.ms-powerpoint.presentation.macroenabled.main+xml")) return PPTM;
            if (ct.contains("application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml")) return PPTX;
        }
        if (word) return macro ? DOCM : DOCX;
        if (excel) return macro ? XLSM : XLSX;
        if (powerpoint) return macro ? PPTM : PPTX;
        return null;
    }

    private static String readBounded(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8 * 1024];
        int total = 0;
        int n;
        while ((n = in.read(buffer)) != -1) {
            total = Math.addExact(total, n);
            if (total > maxBytes) throw new IOException("OOXML content-types part too large");
            out.write(buffer, 0, n);
        }
        return out.toString(java.nio.charset.StandardCharsets.UTF_8);
    }

    private static boolean isZip(byte[] h) {
        return starts(h, new byte[]{'P','K',3,4}) || starts(h, new byte[]{'P','K',5,6}) || starts(h, new byte[]{'P','K',7,8});
    }

    private static boolean starts(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) return false;
        for (int i = 0; i < prefix.length; i++) if (value[i] != prefix[i]) return false;
        return true;
    }
}
