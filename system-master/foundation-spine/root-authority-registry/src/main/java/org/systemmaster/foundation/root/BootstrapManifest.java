package org.systemmaster.foundation.root;

import static org.systemmaster.foundation.root.RegistryModels.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class BootstrapManifest {
    public record Parsed(
            BootstrapDefinition definition,
            Set<String> expectedActivePeers,
            Set<String> expectedRetiredSystems,
            Set<String> expectedNotAdmitted) {
        public Parsed {
            expectedActivePeers = Set.copyOf(expectedActivePeers);
            expectedRetiredSystems = Set.copyOf(expectedRetiredSystems);
            expectedNotAdmitted = Set.copyOf(expectedNotAdmitted);
        }
    }

    private BootstrapManifest() {}

    public static Parsed read(Path path) throws IOException {
        List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);
        ProductRoot root = null;
        List<BootstrapSystem> systems = new ArrayList<>();
        List<BootstrapAuthority> authorities = new ArrayList<>();
        List<BootstrapEdge> edges = new ArrayList<>();
        Set<String> expectedActivePeers = new HashSet<>();
        Set<String> expectedRetiredSystems = new HashSet<>();
        Set<String> expectedNotAdmitted = new HashSet<>();

        int lineNumber = 0;
        for (String raw : lines) {
            lineNumber++;
            if (raw.isBlank() || raw.startsWith("#")) continue;
            String[] parts = raw.split("\\t", -1);
            try {
                switch (parts[0]) {
                    case "ROOT" -> {
                        requireFieldCount(parts, 4);
                        if (root != null) throw new IllegalArgumentException("duplicate ROOT");
                        root = new ProductRoot(decode(parts[1]), decode(parts[2]), decode(parts[3]));
                    }
                    case "SYSTEM" -> {
                        requireFieldCount(parts, 8);
                        systems.add(new BootstrapSystem(
                                decode(parts[1]), decode(parts[2]), decode(parts[3]), decode(parts[4]),
                                decode(parts[5]), decode(parts[6]), Lifecycle.valueOf(decode(parts[7]))));
                    }
                    case "AUTHORITY" -> {
                        requireFieldCount(parts, 6);
                        authorities.add(new BootstrapAuthority(
                                decode(parts[1]), decode(parts[2]), decode(parts[3]), decode(parts[4]),
                                Lifecycle.valueOf(decode(parts[5]))));
                    }
                    case "EDGE" -> {
                        requireFieldCount(parts, 6);
                        edges.add(new BootstrapEdge(
                                decode(parts[1]), decode(parts[2]), decode(parts[3]), decode(parts[4]),
                                Lifecycle.valueOf(decode(parts[5]))));
                    }
                    case "EXPECT_ACTIVE_PEER" -> {
                        requireFieldCount(parts, 2);
                        expectedActivePeers.add(decode(parts[1]));
                    }
                    case "EXPECT_RETIRED" -> {
                        requireFieldCount(parts, 2);
                        expectedRetiredSystems.add(decode(parts[1]));
                    }
                    case "EXPECT_NOT_ADMITTED" -> {
                        requireFieldCount(parts, 2);
                        expectedNotAdmitted.add(decode(parts[1]));
                    }
                    default -> throw new IllegalArgumentException("unknown manifest row type: " + parts[0]);
                }
            } catch (RuntimeException e) {
                throw new IOException("ROOT_REGISTRY_MANIFEST_INVALID_LINE:" + lineNumber + ":" + e.getMessage(), e);
            }
        }
        if (root == null) throw new IOException("ROOT_REGISTRY_MANIFEST_MISSING_ROOT");
        return new Parsed(new BootstrapDefinition(root, systems, authorities, edges),
                expectedActivePeers, expectedRetiredSystems, expectedNotAdmitted);
    }

    private static String decode(String value) {
        try {
            return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("invalid base64url field", e);
        }
    }

    private static void requireFieldCount(String[] parts, int expected) {
        if (parts.length != expected) {
            throw new IllegalArgumentException("expected " + expected + " fields but found " + parts.length);
        }
    }
}
