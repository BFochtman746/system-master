package org.systemmaster.tools.review;

import org.systemmaster.tools.document.CanonicalDocumentGraph;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Conservative three-way semantic merge planner. Conflicting edits never auto-resolve. */
public final class ThreeWaySemanticMerge {
    public record Resolution(String anchorKey, String baseText, String mergedText, Source source) {}
    public record Conflict(String anchorKey, String baseText, String oursText, String theirsText) {}
    public enum Source { BASE, OURS, THEIRS, IDENTICAL_BOTH }
    public record Plan(List<Resolution> resolutions, List<Conflict> conflicts) {
        public Plan { resolutions = List.copyOf(resolutions); conflicts = List.copyOf(conflicts); }
        public boolean autoMergeAllowed() { return conflicts.isEmpty(); }
    }

    public Plan plan(CanonicalDocumentGraph base, CanonicalDocumentGraph ours, CanonicalDocumentGraph theirs) {
        Objects.requireNonNull(base); Objects.requireNonNull(ours); Objects.requireNonNull(theirs);
        if (base.sourceFormat() != ours.sourceFormat() || base.sourceFormat() != theirs.sourceFormat()) throw new IllegalArgumentException("merge format mismatch");
        Map<String,String> b = map(base), o = map(ours), t = map(theirs);
        Set<String> keys = new LinkedHashSet<>(); keys.addAll(b.keySet()); keys.addAll(o.keySet()); keys.addAll(t.keySet());
        ArrayList<Resolution> resolutions = new ArrayList<>(); ArrayList<Conflict> conflicts = new ArrayList<>();
        for (String key : keys) {
            String bv = b.get(key), ov = o.get(key), tv = t.get(key);
            if (Objects.equals(ov, tv)) resolutions.add(new Resolution(key, bv, ov, Source.IDENTICAL_BOTH));
            else if (Objects.equals(ov, bv)) resolutions.add(new Resolution(key, bv, tv, Source.THEIRS));
            else if (Objects.equals(tv, bv)) resolutions.add(new Resolution(key, bv, ov, Source.OURS));
            else conflicts.add(new Conflict(key, bv, ov, tv));
        }
        return new Plan(resolutions, conflicts);
    }

    private static Map<String,String> map(CanonicalDocumentGraph graph) {
        LinkedHashMap<String,String> out = new LinkedHashMap<>();
        for (CanonicalDocumentGraph.Node n : graph.nodes()) {
            if (switch (n.type()) { case PARAGRAPH, TABLE_CELL, SLIDE_TEXT, SPEAKER_NOTE, TEXT_BLOCK -> true; default -> false; }) {
                out.put(n.type() + "|" + n.sourceAnchor().nativePart() + "|" + n.sourceAnchor().locator(), n.text());
            }
        }
        return out;
    }
}
