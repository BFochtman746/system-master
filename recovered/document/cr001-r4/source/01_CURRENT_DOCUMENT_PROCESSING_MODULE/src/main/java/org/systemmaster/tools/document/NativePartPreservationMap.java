package org.systemmaster.tools.document;

import org.systemmaster.tools.common.OoxmlPackageSupport;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** Compares source/result native parts and fail-closes on undeclared package changes. */
public final class NativePartPreservationMap {
    public enum Change { PRESERVED, MODIFIED, ADDED, REMOVED }
    public enum Disposition { PRESERVED, EXPECTED_CHANGE, UNEXPECTED_CHANGE }

    public record PartDelta(
            String partName,
            Change change,
            Disposition disposition,
            String sourceSha256,
            String resultSha256) {
        public PartDelta {
            if (partName == null || partName.isBlank()) throw new IllegalArgumentException("partName required");
            Objects.requireNonNull(change, "change");
            Objects.requireNonNull(disposition, "disposition");
            if (sourceSha256 != null) requireSha(sourceSha256, "source part");
            if (resultSha256 != null) requireSha(resultSha256, "result part");
        }
    }

    public record Assessment(
            DocumentFormat format,
            String sourceArtifactSha256,
            String resultArtifactSha256,
            Set<String> expectedChangePatterns,
            List<PartDelta> parts,
            boolean pass,
            List<String> diagnostics) {
        public Assessment {
            Objects.requireNonNull(format, "format");
            requireSha(sourceArtifactSha256, "source artifact");
            requireSha(resultArtifactSha256, "result artifact");
            expectedChangePatterns = Set.copyOf(expectedChangePatterns);
            parts = List.copyOf(parts);
            diagnostics = List.copyOf(diagnostics);
        }

        public long changedParts() { return parts.stream().filter(p -> p.change() != Change.PRESERVED).count(); }
        public long unexpectedChanges() { return parts.stream().filter(p -> p.disposition() == Disposition.UNEXPECTED_CHANGE).count(); }

    }

    public Assessment assess(DocumentFormat format, byte[] source, byte[] result, Set<String> expectedChangePatterns) throws IOException {
        Objects.requireNonNull(format, "format");
        Objects.requireNonNull(source, "source");
        Objects.requireNonNull(result, "result");
        Set<String> patterns = Set.copyOf(Objects.requireNonNullElse(expectedChangePatterns, Set.of()));
        validatePatterns(patterns);
        Map<String,byte[]> sourceParts = nativeParts(format, source);
        Map<String,byte[]> resultParts = nativeParts(format, result);
        TreeSet<String> names = new TreeSet<>();
        names.addAll(sourceParts.keySet());
        names.addAll(resultParts.keySet());
        ArrayList<PartDelta> deltas = new ArrayList<>();
        ArrayList<String> diagnostics = new ArrayList<>();

        for (String name : names) {
            byte[] before = sourceParts.get(name);
            byte[] after = resultParts.get(name);
            Change change;
            if (before == null) change = Change.ADDED;
            else if (after == null) change = Change.REMOVED;
            else if (java.util.Arrays.equals(before, after)) change = Change.PRESERVED;
            else change = Change.MODIFIED;

            boolean expected = change == Change.PRESERVED || matches(patterns, name);
            Disposition disposition = change == Change.PRESERVED
                    ? Disposition.PRESERVED
                    : expected ? Disposition.EXPECTED_CHANGE : Disposition.UNEXPECTED_CHANGE;
            String sourceSha = before == null ? null : CanonicalDocumentGraph.sha256(before);
            String resultSha = after == null ? null : CanonicalDocumentGraph.sha256(after);
            deltas.add(new PartDelta(name, change, disposition, sourceSha, resultSha));
            if (disposition == Disposition.UNEXPECTED_CHANGE) diagnostics.add("UNEXPECTED_NATIVE_PART_CHANGE:" + name + ":" + change);
        }

        for (String pattern : patterns) {
            boolean touched = deltas.stream().anyMatch(d -> d.change() != Change.PRESERVED && patternMatches(pattern, d.partName()));
            if (!touched) diagnostics.add("EXPECTED_CHANGE_PATTERN_UNUSED:" + pattern);
        }
        boolean pass = deltas.stream().noneMatch(d -> d.disposition() == Disposition.UNEXPECTED_CHANGE);
        return new Assessment(
                format,
                CanonicalDocumentGraph.sha256(source),
                CanonicalDocumentGraph.sha256(result),
                new LinkedHashSet<>(patterns),
                deltas,
                pass,
                diagnostics);
    }

    private static Map<String,byte[]> nativeParts(DocumentFormat format, byte[] bytes) throws IOException {
        if (format == DocumentFormat.DOCX || format == DocumentFormat.DOCM || format == DocumentFormat.PPTX || format == DocumentFormat.PPTM) {
            return OoxmlPackageSupport.read(bytes);
        }
        return Map.of("<artifact>", bytes.clone());
    }

    private static boolean matches(Set<String> patterns, String partName) {
        for (String pattern : patterns) if (patternMatches(pattern, partName)) return true;
        return false;
    }

    private static boolean patternMatches(String pattern, String partName) {
        if (pattern.endsWith("*")) return partName.startsWith(pattern.substring(0, pattern.length() - 1));
        return pattern.equals(partName);
    }

    private static void validatePatterns(Set<String> patterns) {
        for (String pattern : patterns) {
            if (pattern == null || pattern.isBlank()) throw new IllegalArgumentException("expected native-part pattern required");
            if (pattern.equals("*")) throw new IllegalArgumentException("blanket native-part wildcard is forbidden");
            if (pattern.contains("..") || pattern.startsWith("/") || pattern.contains("\\")) {
                throw new IllegalArgumentException("unsafe native-part pattern: " + pattern);
            }
            int wildcard = pattern.indexOf('*');
            if (wildcard >= 0 && wildcard != pattern.length() - 1) {
                throw new IllegalArgumentException("native-part wildcard is only allowed as a trailing prefix wildcard: " + pattern);
            }
        }
    }

    private static void requireSha(String value, String name) {
        if (value == null || !value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " sha256 required");
    }
}
