package org.systemmaster.core;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Non-extracting archive safety gate: bounds, path safety, duplicate ambiguity and nested-package policy. */
public final class PackageSafetyInspector {
    public record Result(boolean safe, String reason, int entries, long uncompressedBytes) {}

    public Result inspectZip(Path zip, ArtifactIntakePolicy policy) throws IOException {
        int entries = 0;
        long total = 0L;
        Set<String> names = new HashSet<>();
        try (ZipFile zf = new ZipFile(zip.toFile())) {
            var enumeration = zf.entries();
            while (enumeration.hasMoreElements()) {
                ZipEntry e = enumeration.nextElement();
                entries++;
                if (entries > policy.maxArchiveEntries()) return new Result(false, "ARCHIVE_ENTRY_LIMIT", entries, total);
                String name = e.getName();
                if (!safeEntryName(name)) return new Result(false, "ARCHIVE_PATH_UNSAFE", entries, total);
                if (!names.add(name)) return new Result(false, "ARCHIVE_DUPLICATE_ENTRY", entries, total);
                if (!e.isDirectory()) {
                    long size = e.getSize();
                    long compressed = e.getCompressedSize();
                    if (size < 0) return new Result(false, "ARCHIVE_UNKNOWN_ENTRY_SIZE", entries, total);
                    total = Math.addExact(total, size);
                    if (total > policy.maxArchiveUncompressedBytes()) return new Result(false, "ARCHIVE_EXPANSION_LIMIT", entries, total);
                    if (compressed == 0 && size > 0) return new Result(false, "ARCHIVE_ZERO_COMPRESSED_SIZE", entries, total);
                    if (compressed > 0 && ((double) size / (double) compressed) > policy.maxArchiveCompressionRatio()) {
                        return new Result(false, "ARCHIVE_COMPRESSION_RATIO", entries, total);
                    }
                    if (policy.maxNestedArchiveDepth() == 0 && looksNestedArchive(name)) {
                        return new Result(false, "NESTED_ARCHIVE_BLOCKED", entries, total);
                    }
                }
            }
        } catch (ArithmeticException e) {
            return new Result(false, "ARCHIVE_SIZE_OVERFLOW", entries, Long.MAX_VALUE);
        }
        return new Result(true, "SAFE", entries, total);
    }

    static boolean safeEntryName(String name) {
        if (name == null || name.isBlank() || name.indexOf('\0') >= 0 || name.indexOf('\\') >= 0) return false;
        if (name.startsWith("/") || name.matches("^[A-Za-z]:.*")) return false;
        Path normalized = Path.of(name).normalize();
        if (normalized.isAbsolute()) return false;
        String n = normalized.toString().replace('\\', '/');
        return !(n.equals("..") || n.startsWith("../") || name.startsWith("../") || name.contains("/../"));
    }

    private static boolean looksNestedArchive(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.endsWith(".zip") || lower.endsWith(".jar") || lower.endsWith(".war") || lower.endsWith(".ear") || lower.endsWith(".7z") || lower.endsWith(".rar");
    }
}
