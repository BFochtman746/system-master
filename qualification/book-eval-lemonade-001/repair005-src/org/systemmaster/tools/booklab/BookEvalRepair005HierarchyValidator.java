package org.systemmaster.tools.booklab;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Gate-A validator for BOOK-EVAL-LEMONADE-001-REPAIR-005. */
public final class BookEvalRepair005HierarchyValidator {
    private BookEvalRepair005HierarchyValidator() { }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("ontology-json taxonomy-json");
        String ontologyText = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        String taxonomyText = Files.readString(Path.of(args[1]), StandardCharsets.UTF_8);

        require(!taxonomyText.contains("HIDDEN_HOLDOUT"), "taxonomy leaks hidden split label");
        require(!taxonomyText.contains("VISIBLE_REGRESSION"), "taxonomy leaks validation split label");
        require(!taxonomyText.contains("DEVELOPMENT"), "taxonomy leaks development split label");
        require(!taxonomyText.contains("scoring-private"), "taxonomy references scoring-private material");

        Map<String,Object> ontologyRoot = BookEvalJson.object(ontologyText);
        Map<String,Object> ontologyModes = object(ontologyRoot.get("task_modes"), "ontology task_modes");
        Map<String,Object> taxonomyRoot = BookEvalJson.object(taxonomyText);
        Map<String,Object> taxonomyModes = object(taxonomyRoot.get("task_modes"), "taxonomy task_modes");

        List<String> expectedModes = List.of("MANUSCRIPT_DIAGNOSIS", "PAIRWISE_COMPARISON", "REVISION_ASSESSMENT");
        require(taxonomyModes.keySet().equals(new LinkedHashSet<>(expectedModes)), "taxonomy task modes differ from canonical modes");

        int totalLeaves = 0;
        int totalSpecialists = 0;
        LinkedHashMap<String,Integer> specialistSizes = new LinkedHashMap<>();

        for (String mode : expectedModes) {
            Map<String,Object> om = object(ontologyModes.get(mode), "ontology mode " + mode);
            Set<String> allowed = stringSet(om.get("allowed_findings"), "allowed_findings " + mode);
            Map<String,Object> tm = object(taxonomyModes.get(mode), "taxonomy mode " + mode);
            Map<String,Object> specialists = object(tm.get("specialists"), "specialists " + mode);
            require(!specialists.isEmpty(), "no specialists for " + mode);

            LinkedHashMap<String,Integer> counts = new LinkedHashMap<>();
            for (String token : allowed) counts.put(token, 0);
            for (Map.Entry<String,Object> entry : specialists.entrySet()) {
                String specialist = entry.getKey();
                Set<String> leaves = stringSet(entry.getValue(), "specialist " + specialist);
                require(!leaves.isEmpty(), "empty specialist " + specialist);
                require(leaves.size() <= 12, "specialist too broad " + specialist + " size=" + leaves.size());
                specialistSizes.put(mode + "/" + specialist, leaves.size());
                totalSpecialists++;
                for (String token : leaves) {
                    require(allowed.contains(token), "extra token " + token + " in " + mode + "/" + specialist);
                    counts.put(token, counts.get(token) + 1);
                }
            }
            for (String token : allowed) {
                require(counts.get(token) == 1, "token assignment count " + mode + "/" + token + "=" + counts.get(token));
            }
            totalLeaves += allowed.size();
        }

        require(totalLeaves == 55, "unexpected canonical leaf count " + totalLeaves);
        require(totalSpecialists == 15, "unexpected specialist count " + totalSpecialists);

        System.out.println("BOOK-EVAL-REPAIR-005 HIERARCHY GATE-A PASS");
        System.out.println("canonical_leaves=" + totalLeaves);
        System.out.println("specialists=" + totalSpecialists);
        for (Map.Entry<String,Integer> e : specialistSizes.entrySet()) {
            System.out.println("specialist=" + e.getKey() + " leaves=" + e.getValue());
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String,Object> object(Object value, String name) {
        if (!(value instanceof Map<?,?> m)) throw new IllegalArgumentException(name);
        LinkedHashMap<String,Object> out = new LinkedHashMap<>();
        for (Map.Entry<?,?> e : m.entrySet()) {
            if (!(e.getKey() instanceof String key)) throw new IllegalArgumentException(name + " key");
            out.put(key, e.getValue());
        }
        return out;
    }

    private static Set<String> stringSet(Object value, String name) {
        if (!(value instanceof List<?> list)) throw new IllegalArgumentException(name);
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (Object item : list) {
            if (!(item instanceof String s) || s.isBlank()) throw new IllegalArgumentException(name + " item");
            require(out.add(s), "duplicate token inside " + name + ": " + s);
        }
        return out;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
